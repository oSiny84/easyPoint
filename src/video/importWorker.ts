// 영상 가져오기 Worker(영상 계약 §6 가져오기 2~6단계). 컨테이너 읽기 라이브러리(Mediabunny)는 이 Worker에만 들어간다.
// 순서: 앞부분 형식 확인 → 컨테이너 읽기(트랙·길이·크기·회전·코덱) → 이 PC의 해독 가능 여부 → OPFS 임시 파일로 복사하며 조각 해시
// → media/<id>로 옮김 → 첫 프레임 해독(미리보기 그림). 어느 단계가 실패해도 임시 파일을 지우고, 작품은 부르는 쪽에서 바뀌지 않는다.
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny';
import type { ErrorCode } from '../domain/types';
import { VIDEO_LIMITS } from '../domain/videoLimits';
import type { Media } from '../domain/videoTypes';
import { createMediaHasher, HASH_CHUNK_BYTES } from '../storage/mediaHash';
import { directory } from './mediaStore';
import { documentMime, sniffContainer } from './sniff';

export type ImportRequest = { type: 'import'; file: Blob } | { type: 'cancel' };
export type ImportReply =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; media: Media; thumbnail: Blob | null }
  | { type: 'fail'; code: ErrorCode; message: string };

const scope = self as unknown as { postMessage(message: ImportReply): void; onmessage: ((event: MessageEvent<ImportRequest>) => void) | null };
class Stop extends Error { constructor(readonly code: ErrorCode, message: string) { super(message); } }
let cancelled = false;
const UNSUPPORTED = "이 영상은 이 컴퓨터에서 읽을 수 없어요. 휴대폰 설정에서 '호환성 높은 형식(MP4)'으로 다시 찍거나 변환해 주세요.";

type SyncHandle = { write(data: Uint8Array, options: { at: number }): number; truncate(size: number): void; flush(): void; close(): void };

async function probe(file: Blob) {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!sniffContainer(head)) throw new Stop('ASSET_INVALID', '영상 파일이 아니에요.');
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    let mime;
    try { mime = documentMime((await input.getFormat()).mimeType); } catch { throw new Stop('ASSET_INVALID', '영상 파일을 읽지 못했어요. 파일이 손상됐을 수 있어요.'); }
    if (!mime) throw new Stop('MEDIA_UNSUPPORTED', 'MP4·MOV·WebM 영상만 넣을 수 있어요.');
    const track = await input.getPrimaryVideoTrack().catch(() => null);
    if (!track) throw new Stop('ASSET_INVALID', '영상이 들어 있지 않은 파일이에요.');
    const audio = await input.getPrimaryAudioTrack().catch(() => null);
    let durationMs: number, width: number, height: number, rotation: Media['rotation'], fps: number, videoCodec: string | null, audioCodec: string | null = null;
    try {
      durationMs = Math.round((await track.computeDuration()) * 1000);
      width = await track.getDisplayWidth(); height = await track.getDisplayHeight(); rotation = await track.getRotation();
      fps = (await track.computePacketStats(300)).averagePacketRate;
      videoCodec = await track.getCodecParameterString();
      if (audio) audioCodec = await audio.getCodecParameterString();
    } catch { throw new Stop('ASSET_INVALID', '영상 파일을 읽지 못했어요. 파일이 손상됐을 수 있어요.'); }
    if (durationMs > VIDEO_LIMITS.mediaDurationMaxMs) throw new Stop('LIMIT_EXCEEDED', '영상이 너무 길어요. 10분까지 넣을 수 있어요.');
    if (durationMs < VIDEO_LIMITS.clipMinMs) throw new Stop('ASSET_INVALID', '영상이 너무 짧아요.');
    if (width > VIDEO_LIMITS.mediaSideMax || height > VIDEO_LIMITS.mediaSideMax) throw new Stop('LIMIT_EXCEEDED', '영상 화면이 너무 커요. 4K까지 넣을 수 있어요.');
    if (!videoCodec || !(await track.canDecode())) throw new Stop('MEDIA_UNSUPPORTED', UNSUPPORTED);
    if (audio && (!audioCodec || !(await audio.canDecode()))) throw new Stop('MEDIA_UNSUPPORTED', UNSUPPORTED);
    if (!Number.isFinite(fps) || fps <= 0) fps = 30;
    return { mime, durationMs, width, height, rotation, fps: Math.round(fps * 1000) / 1000, hasAudio: !!audio, videoCodec, audioCodec };
  } finally { input.dispose(); }
}

// 임시 이름으로 복사하면서 조각 해시를 계산하고, id가 정해지면 media/<id>로 옮긴다. 파일 전체를 메모리에 올리지 않는다.
async function copy(file: Blob): Promise<string> {
  const temp = await directory('tmp'); const tempName = `${crypto.randomUUID()}.part`;
  const handle = await temp.getFileHandle(tempName, { create: true });
  const sync = await (handle as unknown as { createSyncAccessHandle(): Promise<SyncHandle> }).createSyncAccessHandle();
  let closed = false;
  try {
    sync.truncate(0);
    const hasher = createMediaHasher();
    for (let offset = 0; offset < file.size; offset += HASH_CHUNK_BYTES) {
      if (cancelled) throw new Stop('CANCELLED', '영상 넣기를 멈췄어요.');
      const chunk = new Uint8Array(await file.slice(offset, offset + HASH_CHUNK_BYTES).arrayBuffer());
      sync.write(chunk, { at: offset });
      await hasher.add(chunk);
      scope.postMessage({ type: 'progress', done: Math.min(file.size, offset + chunk.length), total: file.size });
    }
    sync.flush(); sync.close(); closed = true;
    const id = await hasher.finish();
    const media = await directory('media');
    const existing = await media.getFileHandle(id).catch(() => null);
    if (existing && (await existing.getFile()).size === file.size) { await temp.removeEntry(tempName); return id; }
    const movable = handle as FileSystemFileHandle & { move?: (parent: FileSystemDirectoryHandle, name: string) => Promise<void> };
    if (movable.move) await movable.move(media, id);
    else {
      const target = await (await media.getFileHandle(id, { create: true })).createWritable();
      await (await handle.getFile()).stream().pipeTo(target);
      await temp.removeEntry(tempName);
    }
    return id;
  } catch (error) {
    if (!closed) { try { sync.close(); } catch { /* 이미 닫혔다. */ } }
    await temp.removeEntry(tempName).catch(() => undefined);
    if (error instanceof DOMException && error.name === 'QuotaExceededError') throw new Stop('STORAGE_FULL', '이 컴퓨터에 영상을 넣을 자리가 부족해요.');
    throw error;
  }
}

// 첫 프레임을 실제로 해독해 본다. 미리보기 그림이 되고, 해독기 설정만 통과하는 파일을 한 번 더 걸러 낸다. 실패해도 가져오기는 성공이다.
async function firstFrame(file: Blob, landscape: boolean): Promise<Blob | null> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const sample = await new VideoSampleSink(track).getSample(await track.getFirstTimestamp());
    if (!sample) return null;
    const [width, height] = landscape ? [320, 180] : [180, 320];
    const canvas = new OffscreenCanvas(width, height); const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
    const fit = Math.min(width / sample.displayWidth, height / sample.displayHeight);
    const w = sample.displayWidth * fit, h = sample.displayHeight * fit;
    sample.draw(ctx, (width - w) / 2, (height - h) / 2, w, h); sample.close();
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  } catch { return null; }
  finally { input.dispose(); }
}

scope.onmessage = event => {
  const request = event.data;
  if (request.type === 'cancel') { cancelled = true; return; }
  void (async () => {
    try {
      const facts = await probe(request.file);
      const id = await copy(request.file);
      const media: Media = { id, byteLength: request.file.size, ...facts };
      scope.postMessage({ type: 'done', media, thumbnail: await firstFrame(request.file, facts.width >= facts.height) });
    } catch (error) {
      if (error instanceof Stop) scope.postMessage({ type: 'fail', code: error.code, message: error.message });
      else scope.postMessage({ type: 'fail', code: 'STORAGE_UNAVAILABLE', message: '영상을 넣지 못했어요. 다시 시도해 주세요.' });
    }
  })();
};
