// 재생 미리보기의 그림 캐시(애니메이션 계약 §8). 장마다 출력과 같은 renderSlide로 작은 그림을 만들어 쥔다.
// 문서는 변경 불가능한 값이라 장 객체가 같으면 다시 만들지 않는다. 작품을 떠날 때 dispose로 모두 해제한다.
import type { Slide } from '../domain/types';
import { renderSlide, type BlobResolver } from '../rendering/renderSlide';

// 장이 적으면 재생 화면 크기(960×540)로, 많으면 640×360으로 만든다. 100장일 때 쥐는 그림이 약 92MB를 넘지 않게 한다.
export const PREVIEW_SCALE_SHARP = 0.75, PREVIEW_SCALE_SMALL = 0.5;
export const PREVIEW_SHARP_SLIDES = 40;
export const previewScaleFor = (slideCount: number) => slideCount <= PREVIEW_SHARP_SLIDES ? PREVIEW_SCALE_SHARP : PREVIEW_SCALE_SMALL;

export function createPreviewCache(resolve: BlobResolver) {
  const pictures = new Map<Slide, ImageBitmap>();
  const pending = new Map<Slide, Promise<ImageBitmap | null>>();
  let scale = PREVIEW_SCALE_SMALL;
  let disposed = false;
  const clear = () => { for (const bitmap of pictures.values()) bitmap.close(); pictures.clear(); };

  async function make(slide: Slide, madeAt: number): Promise<ImageBitmap | null> {
    const rendered = await renderSlide(slide, resolve, madeAt).catch(() => null);
    if (!rendered?.ok) return null;
    const bitmap = await createImageBitmap(rendered.canvas).catch(() => null);
    rendered.canvas.width = rendered.canvas.height = 0;
    if (!bitmap) return null;
    // 만드는 사이 크기가 바뀌었거나 작품을 떠났으면 버린다.
    if (disposed || madeAt !== scale) { bitmap.close(); return null; }
    pictures.set(slide, bitmap);
    return bitmap;
  }

  return {
    get: (slide: Slide) => pictures.get(slide),
    // 재생을 시작할 때 부른다: 그림 크기를 정하고(바뀌면 전부 버린다), 지금 문서에 없는 장의 그림을 버린다.
    prepare(slides: readonly Slide[]) {
      const next = previewScaleFor(slides.length);
      if (next !== scale) { clear(); pending.clear(); scale = next; }
      const alive = new Set(slides);
      for (const [slide, bitmap] of pictures) if (!alive.has(slide)) { bitmap.close(); pictures.delete(slide); }
    },
    // 한 장의 그림을 만든다. 이미 만들고 있으면 그 결과를 기다린다. 못 만들면 null(그 장은 전 그림을 유지한다).
    ensure(slide: Slide): Promise<ImageBitmap | null> {
      const known = pictures.get(slide);
      if (known) return Promise.resolve(known);
      let running = pending.get(slide);
      if (!running) {
        const started: Promise<ImageBitmap | null> = make(slide, scale).finally(() => { if (pending.get(slide) === started) pending.delete(slide); });
        running = started; pending.set(slide, started);
      }
      return running;
    },
    size: () => pictures.size,
    scale: () => scale,
    dispose() { disposed = true; clear(); },
  };
}
export type PreviewCache = ReturnType<typeof createPreviewCache>;
