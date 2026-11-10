// 영상 가져오기(영상 계약 §6 importMedia). 크기·남은 자리를 먼저 보고, 나머지는 Worker(mediaWorker.ts)가 한다.
// 결과 Media를 돌려주면 화면이 addClip을 보낸다. 실패하면 작품은 그대로이고 바이트도 남기지 않는다.
// 원본 파일명·경로는 어디에도 남기지 않는다(화면에는 '영상 n'으로 보인다).
import { fail, type Failure } from '../domain/types';
import { DEFAULT_LENGTH_LIMIT_MS, limitsFor, tooBigMedia, type LengthLimit } from '../domain/videoLength';
import type { Media } from '../domain/videoTypes';
import type { ImportReply, ImportRequest } from './mediaWorker';
import { hasRoomFor } from './mediaStore';

export type Imported = { ok: true; media: Media; thumbnail: Blob | null };

export async function importMedia(file: Blob, options: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void; lengthLimit?: LengthLimit } = {}): Promise<Imported | Failure> {
  if (file.size === 0) return fail('ASSET_INVALID', '빈 파일이에요.');
  const lengthLimit = options.lengthLimit === undefined ? DEFAULT_LENGTH_LIMIT_MS : options.lengthLimit;
  if (file.size > limitsFor(lengthLimit).mediaBytesMax) return fail('LIMIT_EXCEEDED', tooBigMedia(lengthLimit));
  if (!(await hasRoomFor(file.size))) return fail('STORAGE_FULL', '이 컴퓨터에 영상을 넣을 자리가 부족해요.');
  if (options.signal?.aborted) return fail('CANCELLED', '영상 넣기를 멈췄어요.');
  const worker = new Worker(new URL('./mediaWorker.ts', import.meta.url), { type: 'module' });
  const send = (message: ImportRequest) => worker.postMessage(message);
  try {
    return await new Promise<Imported | Failure>(resolve => {
      const onAbort = () => send({ type: 'cancel' });
      options.signal?.addEventListener('abort', onAbort, { once: true });
      worker.onmessage = (event: MessageEvent<ImportReply>) => {
        const reply = event.data;
        if (reply.type === 'progress') { options.onProgress?.(reply.done, reply.total); return; }
        options.signal?.removeEventListener('abort', onAbort);
        resolve(reply.type === 'done' && 'media' in reply ? { ok: true, media: reply.media, thumbnail: reply.thumbnail } : reply.type === 'fail' ? fail(reply.code, reply.message) : fail('STORAGE_UNAVAILABLE', '영상을 넣지 못했어요.'));
      };
      worker.onerror = () => resolve(fail('STORAGE_UNAVAILABLE', '영상을 넣지 못했어요. 새로고침한 뒤 다시 시도해 주세요.'));
      send({ type: 'import', file, lengthLimit });
    });
  } finally { worker.terminate(); }
}
