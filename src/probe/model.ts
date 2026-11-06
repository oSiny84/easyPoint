export const WIDTH = 1280;
export const HEIGHT = 720;
export const FONT = 'Noto Sans KR';
// Noto Sans KR은 lang=ko에서 공백이 0.28em이고, 캔버스는 글자 조합에 따라 0.224em을 쓴다.
// 편집 영역·측정·캔버스를 모두 언어 미지정으로 두어 공백 폭을 0.224em으로 통일한다.
export const TEXT_LANG = 'und';
export type TextItem = { id: string; type: 'text'; x: number; y: number; width: number; text: string; fontSize: number; color: string; bold: boolean };
export type PhotoItem = { id: string; type: 'image'; x: number; y: number; width: number; height: number; source: string };
export type StrokeItem = { id: string; type: 'stroke'; points: number[]; color: string; strokeWidth: number };
export type Item = TextItem | PhotoItem | StrokeItem;
export type Slide = { background: string; backgroundImage?: string; elements: Item[] };
export const sample: Slide = {
  background: '#FFF8E8',
  elements: [
    { id: 'title', type: 'text', x: 80, y: 72, width: 1060, text: '우리 가족 소개', fontSize: 64, color: '#283B37', bold: true },
    { id: 'body', type: 'text', x: 80, y: 190, width: 700, text: '함께 웃고, 함께 자라는 우리 가족!\n한글과 English 123, 줄바꿈을 확인해요.\n오늘의 기분은 🌈 좋아요!', fontSize: 36, color: '#36524A', bold: false },
    { id: 'line', type: 'stroke', points: [85, 420, 150, 450, 220, 415, 300, 450, 380, 420], color: '#ED8F65', strokeWidth: 12 },
  ],
};

const LINE_HEIGHT = 1.3;
let mirror: HTMLDivElement | undefined;

// textarea와 같은 CSS를 준 숨은 요소에서 브라우저가 나눈 줄을 읽는다. 화면·PDF·이미지 PPT가 이 결과를 공유한다.
// Phase 2 비교: 캔버스 글자 단위 계산은 textarea와 40개 중 16개에서 줄이 달랐다.
// keep-all은 PowerPoint(Noto Sans KR) 자동 줄바꿈과 40개 모두 같은 줄이었다.
export function layoutText(item: TextItem) {
  mirror ??= document.body.appendChild(Object.assign(document.createElement('div'), { ariaHidden: 'true' }));
  mirror.lang = TEXT_LANG;
  mirror.style.cssText = `position:absolute;left:-99999px;top:0;width:${item.width}px;font-family:'${FONT}';font-size:${item.fontSize}px;font-weight:${item.bold ? 700 : 400};line-height:${LINE_HEIGHT};white-space:pre-wrap;overflow-wrap:anywhere;word-break:keep-all;letter-spacing:0;padding:0;border:0;font-synthesis:none`;
  mirror.textContent = item.text;
  const node = mirror.firstChild; const range = document.createRange();
  const lines: string[] = [];
  let line = ''; let lastTop: number | null = null; let offset = 0;
  for (const { segment } of new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(item.text)) {
    if (segment === '\n') { lines.push(line); line = ''; lastTop = null; offset += 1; continue; }
    range.setStart(node!, offset); range.setEnd(node!, offset + segment.length);
    const rects = [...range.getClientRects()].filter(rect => rect.height > 0);
    const top: number | null = rects.length ? rects[rects.length - 1].top : lastTop;
    if (lastTop !== null && top !== null && Math.abs(top - lastTop) > 2) { lines.push(line); line = ''; }
    line += segment; if (top !== null) lastTop = top; offset += segment.length;
  }
  lines.push(line);
  mirror.textContent = '';
  const lineHeight = item.fontSize * LINE_HEIGHT;
  return { lines, lineHeight, height: lines.length * lineHeight };
}

export async function prepareFonts(slide: Slide) {
  for (const item of slide.elements) {
    if (item.type === 'text') await document.fonts.load(`${item.bold ? 700 : 400} ${item.fontSize}px ${FONT}`, item.text);
  }
  if (!document.fonts.check(`36px ${FONT}`, '우리 가족')) throw new Error('글꼴을 불러오지 못했어요.');
}
