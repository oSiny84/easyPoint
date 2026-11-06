// 브라우저 저장(IndexedDB). 사진을 먼저 확정한 뒤 문서와 요약을 한 트랜잭션으로 갱신한다(계약 §6).
// 잠금과 저장 시점은 locks.ts, state/autosave.ts가 맡는다.
import { fail, type Failure, type Project, type ProjectSummary } from '../domain/types';
import { validateProject } from '../domain/validate';
import { referencedAssets, type AssetResolver } from './projectFile';

const DB_NAME = 'canvacraft', VERSION = 1;

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

export function openDatabase() {
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

export type SaveResult = { ok: true; revision: number } | Failure;
export type SaveExtras = { thumbnail?: { blob: Blob; revision: number }; knownAssets?: Set<string> };

export async function saveProject(project: Project, resolve: AssetResolver, extras: SaveExtras = {}): Promise<SaveResult> {
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
    // 이미 저장한 사진은 다시 쓰지 않는다. 해시가 곧 ID라 내용이 같다.
    const known = extras.knownAssets ?? new Set<string>();
    const needed = referencedAssets(project).filter(asset => !known.has(asset.id));
    if (needed.length) {
      const existing = new Set(await request(db.transaction('assets').objectStore('assets').getAllKeys()) as string[]);
      // Blob 준비는 트랜잭션 밖에서 한다. 트랜잭션은 기다리는 요청이 없으면 자동으로 끝나기 때문이다.
      const blobs: { id: string; blob: Blob }[] = [];
      for (const asset of needed) {
        if (existing.has(asset.id)) { known.add(asset.id); continue; }
        const blob = await resolve(asset.id);
        if (!blob) return fail('ASSET_MISSING', '사진 자료를 찾을 수 없어 저장하지 못했어요.');
        blobs.push({ id: asset.id, blob });
      }
      // 1단계: 자산 확정. 여기서 중단되면 고아 자산만 남고 이전 문서는 온전하다.
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
    const existing = await request<Project | undefined>(tx.objectStore('projects').get(project.id));
    if (existing && existing.revision > project.revision) { tx.abort(); await finished.catch(() => undefined); return fail('REVISION_CONFLICT', '더 새로운 저장본이 있어요.'); }
    const previous = await request<ProjectSummary | undefined>(tx.objectStore('summaries').get(project.id));
    tx.objectStore('projects').put(project);
    // 미리보기가 준비되지 않으면 예전 이미지와 그 revision을 유지한다.
    const summary: ProjectSummary = { projectId: project.id, title: project.title, updatedAt: project.updatedAt, revision: project.revision,
      thumbnailRevision: extras.thumbnail?.revision ?? previous?.thumbnailRevision ?? null, thumbnail: extras.thumbnail?.blob ?? previous?.thumbnail ?? null };
    tx.objectStore('summaries').put(summary);
    await finished;
    return { ok: true, revision: project.revision };
  } catch (error) { return storageFailure(error); }
  finally { db?.close(); }
}

// 작품 목록은 요약만 읽는다.
export async function listSummaries(): Promise<ProjectSummary[]> {
  const db = await openDatabase();
  try {
    const rows = await request<ProjectSummary[]>(db.transaction('summaries').objectStore('summaries').getAll());
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally { db.close(); }
}

export type OpenResult = { ok: true; project: Project; assets: Map<string, Blob> } | Failure;

// 원본 파일과 같은 검사를 통과해야 연다. 저장된 revision을 이어 간다.
export async function openProject(projectId: string): Promise<OpenResult> {
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
    const tx = db.transaction(['projects', 'assets']);
    const stored = await request<unknown>(tx.objectStore('projects').get(projectId));
    if (!stored) return fail('INVALID_VALUE', '저장된 작품을 찾을 수 없어요.');
    const checked = validateProject(stored);
    if (!checked.ok) return checked;
    const assets = new Map<string, Blob>();
    for (const asset of referencedAssets(checked.project)) {
      const row = await request<{ id: string; blob: Blob } | undefined>(tx.objectStore('assets').get(asset.id));
      if (!row) return fail('ASSET_MISSING', '저장된 사진 자료를 찾을 수 없어요.');
      assets.set(asset.id, row.blob);
    }
    return { ok: true, project: checked.project, assets };
  } catch (error) { return storageFailure(error); }
  finally { db?.close(); }
}

// 어떤 작품도 참조하지 않는 사진을 지운다. 배타 catalog 잠금 안에서만 부른다.
export async function removeOrphanAssets(): Promise<number> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(['projects', 'assets'], 'readwrite');
    const finished = done(tx);
    const projects = await request<Project[]>(tx.objectStore('projects').getAll());
    const used = new Set(projects.flatMap(project => referencedAssets(project).map(asset => asset.id)));
    const keys = await request(tx.objectStore('assets').getAllKeys()) as string[];
    const orphans = keys.filter(key => !used.has(key));
    for (const key of orphans) tx.objectStore('assets').delete(key);
    await finished;
    return orphans.length;
  } finally { db.close(); }
}

// 작품을 이 컴퓨터에서 지운다. 배타 catalog 잠금 안에서만 부른다. 내려받은 파일은 지우지 않는다.
export async function deleteProject(projectId: string) {
  const db = await openDatabase();
  try {
    const tx = db.transaction(['projects', 'summaries'], 'readwrite');
    const finished = done(tx);
    tx.objectStore('projects').delete(projectId);
    tx.objectStore('summaries').delete(projectId);
    await finished;
  } finally { db.close(); }
  await removeOrphanAssets();
}

// 브라우저가 저장소를 함부로 비우지 않게 요청한다. 거절될 수 있으며 영구 보관을 보장하지 않는다.
export async function requestPersistence() {
  try { return await navigator.storage?.persist?.() ?? false; } catch { return false; }
}
