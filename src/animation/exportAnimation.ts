// MP4 내보내기의 메인 스레드 쪽(애니메이션 계약 §8 출력). 스냅숏을 받아 글꼴과 배경음악을 준비하고,
// 영상 Worker(video/mediaWorker.ts)가 장을 요청할 때마다 출력과 같은 renderSlide로 1920×1080 그림을 그려 한 장씩 넘긴다.
// 그리기를 메인 스레드에서 하는 까닭: renderSlide가 DOM 캔버스와 document.fonts를 쓴다.
// 진행률·취소를 중계하고, 끝나면 OPFS 임시 파일을 File로 돌려준다. 출력 중 편집은 스냅숏에 섞이지 않는다.
import type { AnimationProject } from '../domain/animationTypes';
import { fail, type ErrorCode, type Failure } from '../domain/types';
import { renderSlide, type BlobResolver } from '../rendering/renderSlide';
import { prepareFonts } from '../rendering/text/fonts';
import type { AnimationExportRequest, AnimationFrameMessage, AnimationNeedFrame } from '../video/animationJob';
import { builtinBlob, type SoundItem } from '../video/builtins';
import type { ExportDone, ExportProgress } from '../video/exportJob';
import { clearExportFiles, exportDirectory } from './exportFiles';
import { frameCounts } from './frameTimes';

export const EXPORT_SCALE = 1.5;
export type AnimationExportResult = { ok: true; blob: File; container: 'mp4' | 'webm'; frames: number; durationMs: number; bytes: number } | Failure;
type Reply = AnimationNeedFrame | ExportProgress | ExportDone | { type: 'fail'; code: ErrorCode; message: string };
const NO_MUSIC = '배경음악을 불러오지 못했어요. 애니메이션 패널에서 음악을 다시 골라 주세요.';

// music: 내장 음악 목록. 작품이 음악을 쓰는데 목록에 없거나 파일을 못 받으면 소리 없는 파일을 내지 않고 멈춘다.
export async function exportAnimation(project: AnimationProject, resolve: BlobResolver, music: readonly SoundItem[] | null | undefined, options: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}): Promise<AnimationExportResult> {
  const cancelled = () => fail('CANCELLED', '내보내기를 멈췄어요.');
  // 글꼴: 대체 글꼴로 만든 파일을 정상으로 내지 않는다.
  const fonts = await prepareFonts(project.slides);
  if (fonts) return fonts;
  let track: AnimationExportRequest['music'] = null;
  if (project.musicId) {
    const item = music?.find(entry => entry.id === project.musicId);
    const blob = item && await builtinBlob('sounds', item);
    if (!item || !blob) return fail('ASSET_MISSING', NO_MUSIC);
    track = { blob, durationMs: item.durationMs };
  }
  if (options.signal?.aborted) return cancelled();
  // 앞서 내려준 파일은 이제 쓰지 않는다. 지우지 못한 것(다른 탭이 쓰는 중)은 작품 목록에서 다시 지운다.
  await clearExportFiles();

  const slides = project.slides;
  const worker = new Worker(new URL('../video/mediaWorker.ts', import.meta.url), { type: 'module' });
  try {
    const reply = await new Promise<ExportDone | Failure>(finish => {
      // 그리다가 실패하면 그 까닭을 돌려주고 Worker는 멈춘다.
      let problem: Failure | null = null;
      const stop = () => worker.postMessage({ type: 'cancel' });
      options.signal?.addEventListener('abort', stop, { once: true });
      const end = (result: ExportDone | Failure) => { options.signal?.removeEventListener('abort', stop); finish(result); };
      worker.onerror = () => end(fail('EXPORT_FAILED', '영상 파일을 만들지 못했어요. 새로고침한 뒤 다시 시도해 주세요.'));
      worker.onmessage = (event: MessageEvent<Reply>) => {
        const message = event.data;
        if (message.type === 'progress') { options.onProgress?.(message.done, message.total); return; }
        if (message.type === 'fail') { end(problem ?? fail(message.code, message.message)); return; }
        if (message.type === 'done') { end(message); return; }
        // needFrame: 장 하나를 그려 넘긴다. 넘긴 그림은 Worker가 닫는다.
        void (async () => {
          const rendered = await renderSlide(slides[message.index], resolve, EXPORT_SCALE);
          if (!rendered.ok) { problem = rendered; stop(); return; }
          const bitmap = await createImageBitmap(rendered.canvas);
          rendered.canvas.width = rendered.canvas.height = 0;
          const frame: AnimationFrameMessage = { type: 'animationFrame', index: message.index, bitmap };
          worker.postMessage(frame, [bitmap]);
        })().catch(() => { problem = fail('EXPORT_FAILED', '영상 파일을 만들지 못했어요. 다시 시도해 주세요.'); stop(); });
      };
      const request: AnimationExportRequest = { type: 'exportAnimation', frameCounts: frameCounts(project), music: track, musicVolume: project.musicVolume };
      worker.postMessage(request);
    });
    if (!('container' in reply)) return reply;
    const file = await (await (await exportDirectory()).getFileHandle(reply.file)).getFile();
    return { ok: true, blob: file, container: reply.container, frames: reply.frames, durationMs: reply.durationMs, bytes: reply.bytes };
  } catch { return fail('EXPORT_FAILED', '영상 파일을 만들지 못했어요. 다시 시도해 주세요.'); }
  finally { worker.terminate(); }
}
