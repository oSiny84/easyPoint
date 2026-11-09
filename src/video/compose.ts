// 한 프레임 합성(영상 계약 §7 composeFrame). 미리보기(scale 1)와 내보내기 Worker(scale 1.5)가 같은 함수를 쓴다.
// 영상 프레임을 contain으로 맞춰 그리고, 그 시각에 보이는 자막·밈을 overlays 배열 순서(뒤쪽이 위)대로 겹친다.
// DOM을 쓰지 않는다. 자막 그림은 메인 스레드에서 미리 만들어 assets로 받는다(captionImage.ts).
import type { MemeOverlay, Overlay } from '../domain/videoTypes';

export type Drawable = CanvasImageSource & { width?: number; height?: number; displayWidth?: number; displayHeight?: number };
// 자막 그림과 그 그림이 놓일 논리 좌표 상자(띠 여백 포함).
export type CaptionImage = { image: CanvasImageSource; left: number; top: number; width: number; height: number };
export type ComposeAssets = {
  caption: (overlay: Overlay) => CaptionImage | null;
  // 보이기 시작한 뒤 지난 시간 elapsed(ms)의 그림. 밈 길이로 반복하는 계산(timeline.ts memeTime)은 그림을 주는 쪽이 한다.
  // 아직 준비되지 않았으면 null이고 그 밈은 이 프레임에서 그리지 않는다.
  meme: (overlay: MemeOverlay, elapsed: number) => CanvasImageSource | null;
};
type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// 겹침 요소는 startMs ≤ t < startMs + durationMs인 프레임에 보인다(끝은 포함하지 않는다, 계약 §3). t는 정수 ms다.
export const isVisible = (overlay: Overlay, t: number) => overlay.startMs <= t && t < overlay.startMs + overlay.durationMs;

export function drawContain(ctx: Context, source: CanvasImageSource | null, sourceWidth: number, sourceHeight: number, width: number, height: number) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
  if (!source || !sourceWidth || !sourceHeight) return;
  const fit = Math.min(width / sourceWidth, height / sourceHeight);
  const w = sourceWidth * fit, h = sourceHeight * fit;
  ctx.drawImage(source, (width - w) / 2, (height - h) / 2, w, h);
}

// 이미 영상 프레임이 그려진 캔버스 위에 겹침 요소를 그린다. scale은 논리 좌표 → 캔버스 픽셀 배율이다.
// 그린 요소의 id를 돌려준다(시험에서 미리보기의 보이는 시각을 확인한다).
export function drawOverlays(ctx: Context, overlays: readonly Overlay[], t: number, assets: ComposeAssets, scale: number, hiddenId?: string | null): string[] {
  const drawn: string[] = [];
  for (const overlay of overlays) {
    if (overlay.id === hiddenId || !isVisible(overlay, t)) continue;
    if (overlay.type === 'caption') {
      const picture = assets.caption(overlay);
      if (picture) { ctx.drawImage(picture.image, picture.left * scale, picture.top * scale, picture.width * scale, picture.height * scale); drawn.push(overlay.id); }
    } else {
      const picture = assets.meme(overlay, t - overlay.startMs);
      if (picture) { ctx.drawImage(picture, overlay.x * scale, overlay.y * scale, overlay.width * scale, overlay.height * scale); drawn.push(overlay.id); }
    }
  }
  return drawn;
}
