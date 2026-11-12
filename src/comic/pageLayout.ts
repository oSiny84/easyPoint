// 만화 쪽의 크기와 칸 자리(만화 계약 §3). 단위는 포인트(1/72인치)이고 종이는 A4다. DOM에 의존하지 않는다.
import type { ComicLayout } from '../domain/comicTypes';

export type Rect = { x: number; y: number; width: number; height: number };
// 여백, 제목 줄 높이, 칸 사이, 테두리 굵기, 제목·쪽 번호 글자 크기.
export const PAGE = { margin: 28, title: 40, gap: 12, border: 1.5, titleSize: 22, numberSize: 10 } as const;
const GRID: Record<ComicLayout, { width: number; height: number; columns: number; rows: number }> = {
  rows3: { width: 595, height: 842, columns: 1, rows: 3 },
  grid4: { width: 842, height: 595, columns: 2, rows: 2 },
  grid8: { width: 595, height: 842, columns: 2, rows: 4 },
};

export const panelsPerPage = (layout: ComicLayout) => GRID[layout].columns * GRID[layout].rows;
// 칸이 없어도 빈 쪽 하나는 있다.
export const pageCount = (panelCount: number, layout: ComicLayout) => Math.max(1, Math.ceil(panelCount / panelsPerPage(layout)));
export const pageOfPanel = (panelIndex: number, layout: ComicLayout) => Math.floor(panelIndex / panelsPerPage(layout));

export type PageLayout = { width: number; height: number; panels: Rect[]; title: Rect; numberY: number };

// 칸은 16:9다. 칸 묶음 전체를 제목 줄 아래 영역의 가로·세로 가운데에 놓는다. 순서는 왼쪽에서 오른쪽, 위에서 아래다.
export function pageLayout(layout: ComicLayout): PageLayout {
  const { width, height, columns, rows } = GRID[layout];
  const { margin, title, gap } = PAGE;
  const areaWidth = width - 2 * margin, areaHeight = height - 2 * margin - title;
  const panelWidth = Math.min((areaWidth - (columns - 1) * gap) / columns, ((areaHeight - (rows - 1) * gap) / rows) * 16 / 9);
  const panelHeight = panelWidth * 9 / 16;
  const left = margin + (areaWidth - (columns * panelWidth + (columns - 1) * gap)) / 2;
  const top = margin + title + (areaHeight - (rows * panelHeight + (rows - 1) * gap)) / 2;
  const panels: Rect[] = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    panels.push({ x: left + column * (panelWidth + gap), y: top + row * (panelHeight + gap), width: panelWidth, height: panelHeight });
  }
  return { width, height, panels, title: { x: margin, y: margin, width: areaWidth, height: title }, numberY: height - margin / 2 };
}
