// 내보내기 메인 스레드 쪽(영상 계약 §7 exportVideo, §8 출력 순서). 스냅숏을 받아 글꼴·자막 그림(1.5배)·내장 밈/소리를 준비하고
// mediaWorker에 넘긴다. 진행률·취소를 중계하고, 끝나면 OPFS 임시 파일을 File로 돌려준다. 출력 중 편집은 스냅숏에 섞이지 않는다.
import { fail, type Failure } from '../domain/types';
import type { VideoProject } from '../domain/videoTypes';
import { fontCss } from '../rendering/text/fonts';
import { builtinBlob, type Builtins } from './builtins';
import { renderCaption } from './captionImage';
import type { ExportDone, ExportMeme, ExportRequest } from './exportJob';
import { directory } from './mediaStore';
import type { ImportReply } from './mediaWorker';

export const EXPORT_SCALE = 1.5;
export type ExportResult = { ok: true; file: File; container: 'mp4' | 'webm'; bytes: number; durationMs: number; frames: number } | Failure;

export async function exportVideo(project: VideoProject, builtins: Builtins | null, options: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}): Promise<ExportResult> {
  // 글꼴: 자막 글자에 필요한 조각을 먼저 받는다. 대체 글꼴로 만든 파일을 정상으로 내지 않는다.
  const captions = project.overlays.filter(overlay => overlay.type === 'caption');
  try {
    for (const caption of captions) await document.fonts.load(fontCss(caption), caption.text);
    if (!captions.every(caption => document.fonts.check(fontCss(caption), caption.text))) return fail('FONT_UNAVAILABLE', '글꼴을 불러오지 못했어요. 다시 시도해 주세요.');
  } catch { return fail('FONT_UNAVAILABLE', '글꼴을 불러오지 못했어요. 다시 시도해 주세요.'); }
  const images: ExportRequest['captions'] = [];
  for (const caption of captions) {
    const picture = renderCaption(caption, EXPORT_SCALE);
    images.push({ id: caption.id, image: await createImageBitmap(picture.image as HTMLCanvasElement), left: picture.left, top: picture.top, width: picture.width, height: picture.height });
  }
  // 내장 밈·소리: 해시를 확인한 파일만 넘긴다.
  const memes: ExportMeme[] = [];
  for (const memeId of new Set(project.overlays.flatMap(overlay => overlay.type === 'meme' ? [overlay.memeId] : []))) {
    const item = builtins?.memes.find(entry => entry.id === memeId);
    const blob = item && await builtinBlob('memes', item);
    if (!item || !blob) { images.forEach(caption => caption.image.close()); return fail('ASSET_MISSING', '밈 자료를 불러오지 못했어요. 다시 시도해 주세요.'); }
    const sound = item.soundId ? builtins!.sfx.find(entry => entry.id === item.soundId) : undefined;
    memes.push({ id: item.id, kind: item.kind, durationMs: item.durationMs, blob, soundBlob: sound ? await builtinBlob('sounds', sound) : null });
  }
  let music: ExportRequest['music'] = null;
  if (project.audio.musicId) {
    const item = builtins?.music.find(entry => entry.id === project.audio.musicId);
    const blob = item && await builtinBlob('sounds', item);
    if (!item || !blob) { images.forEach(caption => caption.image.close()); return fail('ASSET_MISSING', '배경음악을 불러오지 못했어요. 다시 시도해 주세요.'); }
    music = { blob, durationMs: item.durationMs };
  }
  if (options.signal?.aborted) { images.forEach(caption => caption.image.close()); return fail('CANCELLED', '내보내기를 멈췄어요.'); }

  const worker = new Worker(new URL('./mediaWorker.ts', import.meta.url), { type: 'module' });
  try {
    const reply = await new Promise<ExportDone | Failure>(resolve => {
      const onAbort = () => worker.postMessage({ type: 'cancel' });
      options.signal?.addEventListener('abort', onAbort, { once: true });
      worker.onmessage = (event: MessageEvent<ImportReply>) => {
        const message = event.data;
        if (message.type === 'progress') { options.onProgress?.(message.done, message.total); return; }
        options.signal?.removeEventListener('abort', onAbort);
        if (message.type === 'fail') resolve(fail(message.code, message.message));
        else if ('container' in message) resolve(message);
        else resolve(fail('EXPORT_FAILED', '영상 파일을 만들지 못했어요.'));
      };
      worker.onerror = () => resolve(fail('EXPORT_FAILED', '영상 파일을 만들지 못했어요. 새로고침한 뒤 다시 시도해 주세요.'));
      const request: ExportRequest = { type: 'export', project, captions: images, memes, music };
      worker.postMessage(request, images.map(caption => caption.image));
    });
    if (!('container' in reply)) return reply;
    const file = await (await (await directory('tmp')).getFileHandle(reply.file)).getFile();
    return { ok: true, file, container: reply.container, bytes: reply.bytes, durationMs: reply.durationMs, frames: reply.frames };
  } finally { worker.terminate(); }
}
