// 화면·미리보기·PDF·이미지 PPT가 함께 쓰는 줄 계산. 별도 줄 계산기를 만들지 않는다.
// textarea와 같은 CSS를 준 숨은 요소에서 브라우저가 나눈 줄을 읽는다(Phase 2 결정: PowerPoint 자동 줄바꿈과도 일치).
import type { TextElement } from '../../domain/types';
import { fontCss, fontOf, TEXT_LANG } from './fonts';

export type TextLayoutInput = Pick<TextElement, 'text' | 'width' | 'fontId' | 'fontSize' | 'bold' | 'lineHeight'>;
export type TextLayout = { lines: string[]; lineHeight: number; height: number };

// textarea도 같은 값을 써야 편집 전후 줄이 같다.
export const textCss = (input: Omit<TextLayoutInput, 'text'>) => `width:${input.width}px;font-family:'${fontOf(input.fontId).family}';font-size:${input.fontSize}px;font-weight:${input.bold ? 700 : 400};line-height:${input.lineHeight};white-space:pre-wrap;overflow-wrap:anywhere;word-break:keep-all;letter-spacing:0;padding:0;border:0;font-synthesis:none`;

let mirror: HTMLDivElement | undefined;
const cache = new Map<string, TextLayout>();
const CACHE_SIZE = 500;
let listening = false;

export function layoutText(input: TextLayoutInput): TextLayout {
  // 글꼴 조각이 새로 도착하면 폭이 달라지므로 계산 결과를 버린다.
  if (!listening) { document.fonts.addEventListener('loadingdone', () => cache.clear()); listening = true; }
  const key = JSON.stringify([input.text, input.width, input.fontId, input.fontSize, input.bold, input.lineHeight]);
  const hit = cache.get(key);
  if (hit) return hit;

  mirror ??= document.body.appendChild(Object.assign(document.createElement('div'), { ariaHidden: 'true', lang: TEXT_LANG }));
  mirror.style.cssText = `position:absolute;left:-99999px;top:0;${textCss(input)}`;
  mirror.textContent = input.text;
  const node = mirror.firstChild; const range = document.createRange();
  const lines: string[] = []; let line = ''; let lastTop: number | null = null; let offset = 0;
  for (const { segment } of new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(input.text)) {
    if (segment === '\n') { lines.push(line); line = ''; lastTop = null; offset += 1; continue; }
    range.setStart(node!, offset); range.setEnd(node!, offset + segment.length);
    const rects = [...range.getClientRects()].filter(rect => rect.height > 0);
    const top: number | null = rects.length ? rects[rects.length - 1].top : lastTop;
    if (lastTop !== null && top !== null && Math.abs(top - lastTop) > 2) { lines.push(line); line = ''; }
    line += segment; if (top !== null) lastTop = top; offset += segment.length;
  }
  lines.push(line);
  mirror.textContent = '';

  const lineHeight = input.fontSize * input.lineHeight;
  const layout = { lines, lineHeight, height: lines.length * lineHeight };
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
  cache.set(key, layout);
  return layout;
}

// 가운데·오른쪽 정렬은 줄 끝 공백을 빼고 맞춘다. 원문은 바꾸지 않는다.
export const displayLines = (layout: TextLayout, align: TextElement['align']) => align === 'left' ? layout.lines : layout.lines.map(line => line.trimEnd());

// 슬라이드 좌표의 클릭 위치에 해당하는 글자 위치. 더블클릭한 곳에 커서를 놓을 때 쓴다.
export function caretOffsetAt(element: TextElement, x: number, y: number): number {
  const layout = layoutText(element);
  const index = Math.max(0, Math.min(layout.lines.length - 1, Math.floor((y - element.y) / layout.lineHeight)));
  // 앞줄들의 글자 수를 더한다. 사용자가 넣은 개행은 원문에 한 글자로 들어 있다.
  let offset = 0;
  for (let i = 0; i < index; i++) {
    offset += layout.lines[i].length;
    if (element.text[offset] === '\n') offset += 1;
  }
  const line = layout.lines[index];
  const context = document.createElement('canvas').getContext('2d')!;
  context.font = fontCss(element);
  const shown = element.align === 'left' ? line : line.trimEnd();
  const free = element.width - context.measureText(shown).width;
  const start = element.x + (element.align === 'center' ? free / 2 : element.align === 'right' ? free : 0);
  let inLine = 0;
  for (const { segment } of new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(line)) {
    const before = context.measureText(line.slice(0, inLine)).width;
    const after = context.measureText(line.slice(0, inLine + segment.length)).width;
    if (x - start < (before + after) / 2) break;
    inLine += segment.length;
  }
  return offset + inLine;
}
