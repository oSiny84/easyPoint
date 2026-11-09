// 영상 바이트 저장소(영상 계약 §6, V2 결정): OPFS canvacraft-video/media/<id>. 문서에는 해시만 둔다.
// 가져올 때 임시 이름으로 복사하면서 조각 해시를 계산하고, id가 정해지면 media/<id>로 옮긴다. 파일을 메모리 Blob으로 만들지 않는다.
// V3에서는 메인 스레드의 createWritable로 쓴다. V4에서 Worker(createSyncAccessHandle)로 옮긴다.
import { fail, type Failure } from '../domain/types';
import { createMediaHasher, HASH_CHUNK_BYTES } from '../storage/mediaHash';

const ROOT = 'canvacraft-video', MEDIA = 'media', TEMP = 'tmp';
const ID = /^[0-9a-f]{64}$/;

// 영상 작업 Worker(mediaWorker.ts)도 같은 폴더를 쓴다.
export async function directory(name: typeof MEDIA | typeof TEMP) {
  const root = await (await navigator.storage.getDirectory()).getDirectoryHandle(ROOT, { create: true });
  return root.getDirectoryHandle(name, { create: true });
}

function storageFailure(error: unknown): Failure {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return fail('STORAGE_FULL', '이 컴퓨터에 영상을 넣을 자리가 부족해요.');
  if (error instanceof DOMException && error.name === 'AbortError') return fail('CANCELLED', '영상 넣기를 멈췄어요.');
  return fail('STORAGE_UNAVAILABLE', '이 컴퓨터에 영상을 저장하지 못했어요.');
}

// 남은 자리가 파일 크기의 1.1배보다 작으면 복사하지 않는다(계약 §6 가져오기 1단계). 추정값이며 보장이 아니다.
export async function hasRoomFor(bytes: number) {
  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (quota === undefined || usage === undefined) return true;
    return quota - usage >= bytes * 1.1;
  } catch { return true; }
}

export async function freeBytes(): Promise<number | null> {
  try { const { quota, usage } = await navigator.storage.estimate(); return quota !== undefined && usage !== undefined ? Math.max(0, quota - usage) : null; } catch { return null; }
}

async function moveInto(file: FileSystemFileHandle, media: FileSystemDirectoryHandle, id: string, temp: FileSystemDirectoryHandle, tempName: string) {
  const movable = file as FileSystemFileHandle & { move?: (parent: FileSystemDirectoryHandle, name: string) => Promise<void> };
  if (movable.move) { await movable.move(media, id); return; }
  // move를 지원하지 않는 브라우저: 흘려 복사한 뒤 임시 파일을 지운다.
  const target = await (await media.getFileHandle(id, { create: true })).createWritable();
  await (await file.getFile()).stream().pipeTo(target);
  await temp.removeEntry(tempName);
}

export type StoredMedia = { ok: true; id: string; byteLength: number } | Failure;

// 바이트를 복사하면서 id를 계산한다(메인 스레드 판). 제품의 영상 가져오기는 V4부터 Worker(mediaWorker.ts)가 같은 순서로 한다.
// 이 함수는 저장소 시험(tests/e2e/videoStorage.spec.ts)이 쓰는 기준 경로로 남긴다. 같은 id가 이미 있으면 임시 파일을 지우고 그대로 쓴다.
export async function storeMedia(source: Blob, signal?: AbortSignal): Promise<StoredMedia> {
  if (!(await hasRoomFor(source.size))) return fail('STORAGE_FULL', '이 컴퓨터에 영상을 넣을 자리가 부족해요.');
  const tempName = `${crypto.randomUUID()}.part`;
  let temp: FileSystemDirectoryHandle | undefined;
  try {
    temp = await directory(TEMP);
    const handle = await temp.getFileHandle(tempName, { create: true });
    const writable = await handle.createWritable();
    const hasher = createMediaHasher();
    try {
      for (let offset = 0; offset < source.size || offset === 0; offset += HASH_CHUNK_BYTES) {
        signal?.throwIfAborted();
        const chunk = await source.slice(offset, offset + HASH_CHUNK_BYTES).arrayBuffer();
        await writable.write(chunk);
        await hasher.add(chunk);
        if (source.size === 0) break;
      }
      await writable.close();
    } catch (error) { await writable.abort().catch(() => undefined); throw error; }
    const id = await hasher.finish();
    const media = await directory(MEDIA);
    const existing = await media.getFileHandle(id).catch(() => null);
    if (existing && (await existing.getFile()).size === source.size) await temp.removeEntry(tempName);
    else await moveInto(handle, media, id, temp, tempName);
    return { ok: true, id, byteLength: source.size };
  } catch (error) {
    await temp?.removeEntry(tempName).catch(() => undefined);
    return storageFailure(error);
  }
}

// 이미 해시를 확인한 바이트(원본 파일에서 꺼낸 항목)를 그 id로 저장한다.
export async function storeVerifiedMedia(id: string, source: Blob, signal?: AbortSignal): Promise<{ ok: true } | Failure> {
  if (!ID.test(id)) return fail('ASSET_INVALID', '영상 자료 ID가 올바르지 않아요.');
  const media = await directory(MEDIA).catch(() => null);
  if (!media) return fail('STORAGE_UNAVAILABLE', '이 컴퓨터에 영상을 저장하지 못했어요.');
  const existing = await media.getFileHandle(id).catch(() => null);
  if (existing && (await existing.getFile()).size === source.size) return { ok: true };
  if (!(await hasRoomFor(source.size))) return fail('STORAGE_FULL', '이 컴퓨터에 영상을 넣을 자리가 부족해요.');
  const tempName = `${crypto.randomUUID()}.part`;
  let temp: FileSystemDirectoryHandle | undefined;
  try {
    temp = await directory(TEMP);
    const handle = await temp.getFileHandle(tempName, { create: true });
    const writable = await handle.createWritable();
    try {
      for (let offset = 0; offset < source.size; offset += HASH_CHUNK_BYTES) {
        signal?.throwIfAborted();
        await writable.write(await source.slice(offset, offset + HASH_CHUNK_BYTES).arrayBuffer());
      }
      await writable.close();
    } catch (error) { await writable.abort().catch(() => undefined); throw error; }
    if (existing) await media.removeEntry(id);
    await moveInto(handle, media, id, temp, tempName);
    return { ok: true };
  } catch (error) {
    await temp?.removeEntry(tempName).catch(() => undefined);
    return storageFailure(error);
  }
}

// 저장된 바이트. 디스크에 있는 File이라 내용 전체를 메모리에 올리지 않는다.
export async function readMedia(id: string): Promise<File | undefined> {
  if (!ID.test(id)) return undefined;
  try { return await (await (await directory(MEDIA)).getFileHandle(id)).getFile(); } catch { return undefined; }
}

export async function listMediaIds(): Promise<string[]> {
  const media = await directory(MEDIA); const ids: string[] = [];
  for await (const [name] of (media as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) ids.push(name);
  return ids;
}

// 쓰이지 않는 바이트와 남은 임시 파일을 지운다. 배타 영상 catalog 잠금 안에서만 부른다.
export async function removeMediaExcept(used: ReadonlySet<string>): Promise<number> {
  const media = await directory(MEDIA); let removed = 0;
  for (const id of await listMediaIds()) if (!used.has(id)) { await media.removeEntry(id); removed++; }
  const temp = await directory(TEMP);
  const names: string[] = [];
  for await (const [name] of (temp as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) names.push(name);
  for (const name of names) await temp.removeEntry(name).catch(() => undefined);
  return removed;
}
