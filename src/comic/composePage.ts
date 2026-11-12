// 만화의 쪽 한 장을 캔버스에 조립한다(만화 계약 §3). 만화 보기·그림 PNG·만화책 PDF가 모두 이 함수를 쓴다.
// 칸 그림은 슬라이드의 renderSlide가 그린다. 문서를 바꾸거나 따로 보관하지 않는다.
import type { ComicProject } from '../domain/comicTypes';
import { LIMITS } from '../domain/limits';
import { fail, type Failure } from '../domain/types';
import { renderSlide, type BlobResolver } from '../rendering/renderSlide';
import { fontCss, TEXT_LANG } from '../rendering/text/fonts';
import { PAGE, pageLayout, panelsPerPage } from './pageLayout';

export type ComicPageSource = Pick<ComicProject, 'title' | 'slides' | 'layout'>;
const PAPER = '#FFFFFF', BORDER = '#111111', TITLE = '#111111', NUMBER = '#555555';

// 영역 너비를 넘는 제목은 뒤를 줄이고 …를 붙인다.
function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) return text;
  const letters = [...text];
  while (letters.length > 1 && context.measureText(`${letters.join('')}…`).width > maxWidth) letters.pop();
  return `${letters.join('')}…`;
}

// pixelsPerPoint: 포인트당 픽셀 수. 내려받기는 3, 만화 보기는 2를 쓴다.
export async function composePage(source: ComicPageSource, pageIndex: number, resolve: BlobResolver, pixelsPerPoint: number): Promise<{ ok: true; canvas: HTMLCanvasElement } | Failure> {
  const layout = pageLayout(source.layout); const perPage = panelsPerPage(source.layout);
  const px = (points: number) => Math.round(points * pixelsPerPoint);
  const canvas = document.createElement('canvas'); canvas.lang = TEXT_LANG;
  canvas.width = px(layout.width); canvas.height = px(layout.height);
  const context = canvas.getContext('2d')!;
  context.fillStyle = PAPER; context.fillRect(0, 0, canvas.width, canvas.height);

  for (let slot = 0; slot < perPage; slot++) {
    const slide = source.slides[pageIndex * perPage + slot];
    if (!slide) break;
    const rect = layout.panels[slot];
    const x = px(rect.x), y = px(rect.y), width = px(rect.x + rect.width) - x, height = px(rect.y + rect.height) - y;
    const rendered = await renderSlide(slide, resolve, width / LIMITS.slideWidth);
    if (!rendered.ok) { canvas.width = canvas.height = 0; return rendered; }
    context.drawImage(rendered.canvas, x, y, width, height);
    // 칸 그림을 바로 해제해 메모리를 제한한다.
    rendered.canvas.width = rendered.canvas.height = 0;
    context.strokeStyle = BORDER; context.lineWidth = PAGE.border * pixelsPerPoint; context.strokeRect(x, y, width, height);
  }

  const number = String(pageIndex + 1);
  const titleFont = fontCss({ fontId: 'sans-ko', bold: true, fontSize: PAGE.titleSize * pixelsPerPoint });
  const numberFont = fontCss({ fontId: 'sans-ko', bold: false, fontSize: PAGE.numberSize * pixelsPerPoint });
  const title = pageIndex === 0 ? source.title.trim() : '';
  try {
    if (title) await document.fonts.load(titleFont, title);
    await document.fonts.load(numberFont, number);
    if ((title && !document.fonts.check(titleFont, title)) || !document.fonts.check(numberFont, number)) throw new Error('font');
  } catch { canvas.width = canvas.height = 0; return fail('FONT_UNAVAILABLE', '글꼴을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.'); }
  context.textAlign = 'center'; context.textBaseline = 'middle';
  if (title) {
    context.fillStyle = TITLE; context.font = titleFont;
    context.fillText(fitText(context, title, px(layout.title.width)), canvas.width / 2, px(layout.title.y + layout.title.height / 2));
  }
  context.fillStyle = NUMBER; context.font = numberFont;
  context.fillText(number, canvas.width / 2, px(layout.numberY));
  return { ok: true, canvas };
}
