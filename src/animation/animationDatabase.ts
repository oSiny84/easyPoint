// 애니메이션 작품 저장소(애니메이션 계약 §6). 새 IndexedDB canvacraft-animation 버전 1: projects, summaries, assets.
// 슬라이드 저장소(storage/database.ts)와 같은 순서·규칙을 쓰되 데이터베이스와 파일을 따로 둔다(사용자 결정 3).
// 그쪽의 저장·열기·정리 규칙을 고치면 이 파일도 같은 날 확인한다. 잠금과 저장 시점은 locks.ts, state/autosave.ts가 맡는다.
import type { AnimationProject, AnimationSummary } from '../domain/animationTypes';
import { validateAnimationProject } from '../domain/animationValidate';
import { fail, type Failure } from '../domain/types';
import { referencedAssets, type AssetResolver } from '../storage/projectFile';
import { durationMs } from './frameTimes';

const DB_NAME = 'canvacraft-animation', VERSION = 1;

function request<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error); });
}
function storageFailure(error: unknown): Failure {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return fail('STORAGE_FULL', '저장 공간이 부족해요. 파일 메뉴의 원본 저장으로 내려받아 두세요.');
  return fail('STORAGE_UNAVAILABLE', '이 컴퓨터에 저장하지 못했어요. 파일 메뉴의 원본 저장으로 내려받아 두세요.');
}

export function openAnimationDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, VERSION);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('projects', { keyPath: 'id' });
      open.result.createObjectStore('summaries', { keyPath: 'projectId' });
      open.result.createObjectStore('assets', { keyPath: 'id' });
    };
    open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
  });
}

export type AnimationSaveResult = { ok: true; revision: number } | Failure;
export type AnimationSaveExtras = { thumbnail?: { blob: Blob; revision: number }; knownAssets?: Set<string> };

export async function saveAnimationProject(project: AnimationProject, resolve: AssetResolver, extras: AnimationSaveExtras = {}): Promise<AnimationSaveResult> {
  let db: IDBDatabase | undefined;
  try {
    db = await openAnimationDatabase();
    // 이미 저장한 사진은 다시 쓰지 않는다. 해시가 곧 ID라 내용이 같다.
    const known = extras.knownAssets ?? new Set<string>();
    // 장에서 지운 사진도 넣은 사진 목록에 남으므로 함께 보관한다. 문서가 실제로 쓰는 사진만 없으면 실패다.
    const required = new Set(referencedAssets(project).map(asset => asset.id));
    const needed = project.assetManifest.filter(asset => !known.has(asset.id));
    if (needed.length) {
      const existing = new Set(await request(db.transaction('assets').objectStore('assets').getAllKeys()) as string[]);
      // Blob 준비는 트랜잭션 밖에서 한다. 트랜잭션은 기다리는 요청이 없으면 자동으로 끝나기 때문이다.
      const blobs: { id: string; blob: Blob }[] = [];
      for (const asset of needed) {
        if (existing.has(asset.id)) { known.add(asset.id); continue; }
        const blob = await resolve(asset.id);
        if (blob) blobs.push({ id: asset.id, blob });
        else if (required.has(asset.id)) return fail('ASSET_MISSING', '사진 자료를 찾을 수 없어 저장하지 못했어요.');
      }
      // 1단계: 사진 확정. 여기서 중단되면 고아 사진만 남고 이전 문서는 온전하다.
      if (blobs.length) {
        const assetTx = db.transaction('assets', 'readwrite');
        const assetsDone = done(assetTx);
        for (const item of blobs) assetTx.objectStore('assets').put(item);
        await assetsDone;
        for (const item of blobs) known.add(item.id);
      }
    }
    // 2단계: 문서와 요약을 한 트랜잭션으로 확정한다. 더 새로운 저장본은 덮어쓰지 않는다.
    const tx = db.transaction(['projects', 'summaries'], 'readwrite');
    const finished = done(tx);
    const existing = await request<AnimationProject | undefined>(tx.objectStore('projects').get(project.id));
    if (existing && existing.revision > project.revision) { tx.abort(); await finished.catch(() => undefined); return fail('REVISION_CONFLICT', '더 새로운 저장본이 있어요.'); }
    const previous = await request<AnimationSummary | undefined>(tx.objectStore('summaries').get(project.id));
    tx.objectStore('projects').put(project);
    // 미리보기가 준비되지 않으면 예전 이미지와 그 revision을 유지한다.
    const summary: AnimationSummary = { projectId: project.id, kind: 'animation', title: project.title, updatedAt: project.updatedAt, revision: project.revision,
      frameCount: project.slides.length, durationMs: durationMs(project),
      thumbnailRevision: extras.thumbnail?.revision ?? previous?.thumbnailRevision ?? null, thumbnail: extras.thumbnail?.blob ?? previous?.thumbnail ?? null };
    tx.objectStore('summaries').put(summary);
    await finished;
    return { ok: true, revision: project.revision };
  } catch (error) { return storageFailure(error); }
  finally { db?.close(); }
}

// 작품 목록은 요약만 읽는다.
export async function listAnimationSummaries(): Promise<AnimationSummary[]> {
  const db = await openAnimationDatabase();
  try {
    const rows = await request<AnimationSummary[]>(db.transaction('summaries').objectStore('summaries').getAll());
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally { db.close(); }
}

export type AnimationOpenResult = { ok: true; project: AnimationProject; assets: Map<string, Blob> } | Failure;

// 원본 파일과 같은 검사를 통과해야 연다. 저장된 revision을 이어 간다.
export async function openAnimationProject(projectId: string): Promise<AnimationOpenResult> {
  let db: IDBDatabase | undefined;
  try {
    db = await openAnimationDatabase();
    const tx = db.transaction(['projects', 'assets']);
    const stored = await request<unknown>(tx.objectStore('projects').get(projectId));
    if (!stored) return fail('INVALID_VALUE', '저장된 작품을 찾을 수 없어요.');
    const checked = validateAnimationProject(stored);
    if (!checked.ok) return checked;
    const assets = new Map<string, Blob>();
    const required = new Set(referencedAssets(checked.project).map(asset => asset.id));
    for (const asset of checked.project.assetManifest) {
      const row = await request<{ id: string; blob: Blob } | undefined>(tx.objectStore('assets').get(asset.id));
      if (row) assets.set(asset.id, row.blob);
      else if (required.has(asset.id)) return fail('ASSET_MISSING', '저장된 사진 자료를 찾을 수 없어요.');
    }
    return { ok: true, project: checked.project, assets };
  } catch (error) { return storageFailure(error); }
  finally { db?.close(); }
}

// 어떤 애니메이션 작품의 자료 목록에도 없는 사진을 지운다. 배타 애니메이션 catalog 잠금 안에서만 부른다.
export async function removeOrphanAnimationAssets(): Promise<number> {
  const db = await openAnimationDatabase();
  try {
    const tx = db.transaction(['projects', 'assets'], 'readwrite');
    const finished = done(tx);
    const projects = await request<AnimationProject[]>(tx.objectStore('projects').getAll());
    const used = new Set(projects.flatMap(project => project.assetManifest.map(asset => asset.id)));
    const keys = await request(tx.objectStore('assets').getAllKeys()) as string[];
    const orphans = keys.filter(key => !used.has(key));
    for (const key of orphans) tx.objectStore('assets').delete(key);
    await finished;
    return orphans.length;
  } finally { db.close(); }
}

// 작품을 이 컴퓨터에서 지운다. 배타 애니메이션 catalog 잠금 안에서만 부른다. 내려받은 파일은 지우지 않는다.
export async function deleteAnimationProject(projectId: string) {
  const db = await openAnimationDatabase();
  try {
    const tx = db.transaction(['projects', 'summaries'], 'readwrite');
    const finished = done(tx);
    tx.objectStore('projects').delete(projectId);
    tx.objectStore('summaries').delete(projectId);
    await finished;
  } finally { db.close(); }
  await removeOrphanAnimationAssets();
}
