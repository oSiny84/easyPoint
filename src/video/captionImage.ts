// 자막 그림(영상 계약 §3 자막). 줄 배치는 슬라이드와 같은 layoutText를 쓰므로 DOM이 있는 메인 스레드에서만 만든다.
// 미리보기는 scale 1, 내보내기는 scale 1.5로 같은 함수가 그린다. 반투명 띠는 글씨 영역 + 논리 8px 여백, 모서리 8, rgba(0,0,0,0.5).
import { fontCss, TEXT_LANG } from '../rendering/text/fonts';
import { displayLines, layoutText } from '../rendering/text/layoutText';
import type { CaptionOverlay } from '../domain/videoTypes';
import type { CaptionImage } from './compose';

export const CAPTION_PAD = 8;

// 자막이 차지하는 논리 상자(띠 여백 포함). 선택 테두리는 여백 없는 글씨 상자를 쓴다.
export function captionBox(caption: CaptionOverlay) {
  const height = layoutText(caption).height;
  return { left: caption.x - CAPTION_PAD, top: caption.y - CAPTION_PAD, width: caption.width + CAPTION_PAD * 2, height: height + CAPTION_PAD * 2 };
}

export function renderCaption(caption: CaptionOverlay, scale: number): CaptionImage {
  const box = captionBox(caption);
  const canvas = document.createElement('canvas'); canvas.lang = TEXT_LANG;
  canvas.width = Math.max(1, Math.ceil(box.width * scale)); canvas.height = Math.max(1, Math.ceil(box.height * scale));
  const ctx = canvas.getContext('2d')!; ctx.scale(scale, scale);
  const layout = layoutText(caption);
  if (caption.backdrop === 'band') {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.roundRect(0, 0, box.width, box.height, 8); ctx.fill();
  }
  ctx.fillStyle = caption.color; ctx.font = fontCss(caption); ctx.textBaseline = 'alphabetic';
  // 슬라이드 renderSlide와 같은 세로 위치 규칙(줄 상자 안 위아래 여백 균등).
  const metrics = ctx.measureText('가');
  const baseline = (layout.lineHeight - (metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent)) / 2 + metrics.fontBoundingBoxAscent;
  displayLines(layout, caption.align).forEach((line, i) => {
    const free = caption.width - ctx.measureText(line).width;
    const x = CAPTION_PAD + (caption.align === 'center' ? free / 2 : caption.align === 'right' ? free : 0);
    ctx.fillText(line, x, CAPTION_PAD + i * layout.lineHeight + baseline);
  });
  return { image: canvas, ...box };
}

// 같은 자막 내용·서식·배율은 한 번만 그린다(미리보기에서 매 프레임 다시 그리지 않는다).
const cache = new Map<string, CaptionImage>();
export function cachedCaption(caption: CaptionOverlay, scale: number) {
  const key = JSON.stringify([caption.text, caption.width, caption.fontId, caption.fontSize, caption.bold, caption.color, caption.align, caption.lineHeight, caption.backdrop, caption.x, caption.y, scale]);
  let image = cache.get(key);
  if (!image) {
    image = renderCaption(caption, scale);
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    cache.set(key, image);
  }
  return image;
}

// 글꼴이 바뀌면(조각 파일 도착) 줄 폭이 달라지므로 그린 그림을 버린다.
if (typeof document !== 'undefined') document.fonts?.addEventListener('loadingdone', () => cache.clear());
