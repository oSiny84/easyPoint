// 문서 스냅샷을 캔버스에 그린다. 미리보기·PDF·모양 그대로 PPT가 함께 쓴다. 문서를 바꾸거나 따로 보관하지 않는다.
import { LIMITS } from '../domain/limits';
import { fail, type Failure, type Slide, type StrokeElement } from '../domain/types';
import { fontCss, prepareFonts, TEXT_LANG } from './text/fonts';
import { displayLines, layoutText } from './text/layoutText';

const WIDTH = LIMITS.slideWidth, HEIGHT = LIMITS.slideHeight;
export type BlobResolver = (assetId: string) => Promise<Blob | undefined>;

// 슬라이드 비율을 채우도록 사진 가운데를 잘라낸 원본 영역.
export function coverCrop(sourceWidth: number, sourceHeight: number) {
  const target = WIDTH / HEIGHT; const wider = sourceWidth / sourceHeight > target;
  const width = wider ? sourceHeight * target : sourceWidth; const height = wider ? sourceHeight : sourceWidth / target;
  return { x: (sourceWidth - width) / 2, y: (sourceHeight - height) / 2, width, height };
}

export function drawStroke(context: CanvasRenderingContext2D, element: StrokeElement) {
  const { x, y, points, color, strokeWidth } = element;
  context.strokeStyle = color; context.fillStyle = color; context.lineWidth = strokeWidth; context.lineCap = 'round'; context.lineJoin = 'round';
  context.beginPath();
  if (points.length === 2) { context.arc(x + points[0], y + points[1], strokeWidth / 2, 0, Math.PI * 2); context.fill(); return; }
  context.moveTo(x + points[0], y + points[1]);
  for (let i = 2; i < points.length; i += 2) context.lineTo(x + points[i], y + points[i + 1]);
  context.stroke();
}

async function bitmapOf(assetId: string, resolve: BlobResolver) {
  const blob = await resolve(assetId);
  return blob ? createImageBitmap(blob) : undefined;
}
const missing = () => fail('ASSET_MISSING', '사진 자료를 찾을 수 없어요.');

export async function renderSlide(slide: Slide, resolve: BlobResolver, scale = 2): Promise<{ ok: true; canvas: HTMLCanvasElement } | Failure> {
  const fonts = await prepareFonts([slide]);
  if (fonts) return fonts;
  const canvas = document.createElement('canvas'); canvas.lang = TEXT_LANG;
  canvas.width = Math.round(WIDTH * scale); canvas.height = Math.round(HEIGHT * scale);
  const context = canvas.getContext('2d')!; context.scale(scale, scale);

  if (slide.background.kind === 'solid') { context.fillStyle = slide.background.color; context.fillRect(0, 0, WIDTH, HEIGHT); }
  else {
    const bitmap = await bitmapOf(slide.background.assetId, resolve);
    if (!bitmap) return missing();
    const crop = coverCrop(bitmap.width, bitmap.height);
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, WIDTH, HEIGHT);
    bitmap.close();
  }
  for (const element of slide.elements) {
    if (element.type === 'image') {
      const bitmap = await bitmapOf(element.assetId, resolve);
      if (!bitmap) return missing();
      context.drawImage(bitmap, element.x, element.y, element.width, element.height);
      bitmap.close();
    } else if (element.type === 'stroke') drawStroke(context, element);
    else {
      context.fillStyle = element.color; context.font = fontCss(element); context.textBaseline = 'alphabetic';
      const layout = layoutText(element);
      // 글자를 CSS 줄 상자 안에 놓는 규칙(위아래 여백 균등)을 따라 편집 화면과 세로 위치를 맞춘다.
      const metrics = context.measureText('가');
      const baseline = (layout.lineHeight - (metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent)) / 2 + metrics.fontBoundingBoxAscent;
      displayLines(layout, element.align).forEach((line, i) => {
        const free = element.width - context.measureText(line).width;
        const x = element.x + (element.align === 'center' ? free / 2 : element.align === 'right' ? free : 0);
        context.fillText(line, x, element.y + i * layout.lineHeight + baseline);
      });
    }
  }
  return { ok: true, canvas };
}
