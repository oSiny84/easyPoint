// 영상 작품 저장소(영상 계약 §6). 새 IndexedDB canvacraft-video 버전 1: projects, summaries, media(Media 메타데이터만).
// 슬라이드 canvacraft 데이터베이스의 구조·버전은 바꾸지 않는다. 바이트는 가져올 때 이미 OPFS에 있다(mediaStore.ts).
// 자동 저장은 projects와 summaries(그리고 메타데이터)를 한 트랜잭션으로 갱신하며 이 성공이 저장 확정이다.
import { fail, type Failure } from '../domain/types';
import { totalMs } from '../domain/timeline';
import type { BuiltinCatalog, Media, VideoProject, VideoProjectSummary } from '../domain/videoTypes';
import { validateVideoProject } from '../domain/videoValidate';
import { readMedia, removeMediaExcept } from './mediaStore';

const DB_NAME = 'canvacraft-video', VERSION = 1;

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

export function openVideoDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, VERSION);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('projects', { keyPath: 'id' });
      open.result.createObjectStore('summaries', { keyPath: 'projectId' });
      open.result.createObjectStore('media', { keyPath: 'id' });
    };
    open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
  });
}

// 조각이 쓰는 영상만. 원본 파일에 넣고, 저장할 때 바이트가 있는지 확인하는 대상이다.
export function referencedMedia(project: Pick<VideoProject, 'clips' | 'mediaManifest'>): Media[] {
  const used = new Set(project.clips.map(clip => clip.mediaId));
  return project.mediaManifest.filter(media => used.has(media.id));
}

export type VideoSaveResult = { ok: true; revision: number } | Failure;

export async function saveVideoProject(project: VideoProject, extras: { thumbnail?: { blob: Blob; revision: number } } = {}): Promise<VideoSaveResult> {
  let db: IDBDatabase | undefined;
  try {
    // 조각이 쓰는 영상의 바이트가 없으면 저장하지 않는다. 다시 열 수 없는 문서를 저장 확정으로 만들지 않기 위해서다.
    for (const media of referencedMedia(project)) {
      const file = await readMedia(media.id);
      if (!file || file.size !== media.byteLength) return fail('ASSET_MISSING', '영상 자료를 찾을 수 없어 저장하지 못했어요.');
    }
    db = await openVideoDatabase();
    const tx = db.transaction(['projects', 'summaries', 'media'], 'readwrite');
    const finished = done(tx);
    const existing = await request<VideoProject | undefined>(tx.objectStore('projects').get(project.id));
    if (existing && existing.revision > project.revision) { tx.abort(); await finished.catch(() => undefined); return fail('REVISION_CONFLICT', '더 새로운 저장본이 있어요.'); }
    const previous = await request<VideoProjectSummary | undefined>(tx.objectStore('summaries').get(project.id));
    tx.objectStore('projects').put(project);
    for (const media of project.mediaManifest) tx.objectStore('media').put(media);
    // 미리보기가 준비되지 않으면 예전 이미지와 그 revision을 유지한다.
    const summary: VideoProjectSummary = { projectId: project.id, kind: 'video', title: project.title, updatedAt: project.updatedAt, revision: project.revision, durationMs: totalMs(project.clips),
      thumbnailRevision: extras.thumbnail?.revision ?? previous?.thumbnailRevision ?? null, thumbnail: extras.thumbnail?.blob ?? previous?.thumbnail ?? null };
    tx.objectStore('summaries').put(summary);
    await finished;
    return { ok: true, revision: project.revision };
  } catch (error) { return storageFailure(error); }
  finally { db?.close(); }
}

export async function listVideoSummaries(): Promise<VideoProjectSummary[]> {
  const db = await openVideoDatabase();
  try {
    const rows = await request<VideoProjectSummary[]>(db.transaction('summaries').objectStore('summaries').getAll());
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally { db.close(); }
}

export type VideoOpenResult = { ok: true; project: VideoProject } | Failure;

// 원본 파일과 같은 검사를 통과해야 연다. 바이트가 없는 영상은 조각이 쓰지 않으면 목록에서 빼고, 조각이 쓰면 열지 않는다(계약 §5).
export async function openVideoProject(projectId: string, catalog: BuiltinCatalog): Promise<VideoOpenResult> {
  let db: IDBDatabase | undefined;
  try {
    db = await openVideoDatabase();
    const stored = await request<unknown>(db.transaction('projects').objectStore('projects').get(projectId));
    if (!stored) return fail('INVALID_VALUE', '저장된 작품을 찾을 수 없어요.');
    const checked = validateVideoProject(stored, catalog);
    if (!checked.ok) return checked;
    const project = checked.project;
    const used = new Set(project.clips.map(clip => clip.mediaId));
    const present: Media[] = [];
    for (const media of project.mediaManifest) {
      const file = await readMedia(media.id);
      // 해시는 가져올 때 한 번만 계산한다. 열 때는 크기만 비교한다.
      if (file && file.size === media.byteLength) { present.push(media); continue; }
      if (used.has(media.id)) return fail(file ? 'ASSET_INVALID' : 'ASSET_MISSING', '저장된 영상 자료를 찾을 수 없어요.');
    }
    return { ok: true, project: present.length === project.mediaManifest.length ? project : { ...project, mediaManifest: present } };
  } catch (error) { return storageFailure(error); }
  finally { db?.close(); }
}

// 어느 영상 작품의 자료 목록에도 없는 바이트와 메타데이터를 지운다. 배타 영상 catalog 잠금 안에서만 부른다.
export async function removeOrphanMedia(): Promise<number> {
  const db = await openVideoDatabase();
  let used: Set<string>;
  try {
    const tx = db.transaction(['projects', 'media'], 'readwrite');
    const finished = done(tx);
    const projects = await request<VideoProject[]>(tx.objectStore('projects').getAll());
    used = new Set(projects.flatMap(project => project.mediaManifest.map(media => media.id)));
    const keys = await request(tx.objectStore('media').getAllKeys()) as string[];
    for (const key of keys) if (!used.has(key)) tx.objectStore('media').delete(key);
    await finished;
  } finally { db.close(); }
  return removeMediaExcept(used);
}

// 작품을 이 컴퓨터에서 지운다. 배타 영상 catalog 잠금 안에서만 부른다. 내려받은 파일은 지우지 않는다.
export async function deleteVideoProject(projectId: string) {
  const db = await openVideoDatabase();
  try {
    const tx = db.transaction(['projects', 'summaries'], 'readwrite');
    const finished = done(tx);
    tx.objectStore('projects').delete(projectId);
    tx.objectStore('summaries').delete(projectId);
    await finished;
  } finally { db.close(); }
  await removeOrphanMedia();
}
