// 새 만화 작품(만화 계약 §2): 흰 빈 칸 하나, 한 쪽에 4칸, 말풍선 없음.
import { DEFAULT_COMIC_LAYOUT } from './comicLimits';
import type { ComicProject } from './comicTypes';
import { createProject } from './project';

export function createComicProject(newId: () => string, now: () => string, title = '내 만화'): ComicProject {
  return { ...createProject(newId, now, title), kind: 'comic', layout: DEFAULT_COMIC_LAYOUT, bubbles: {} };
}
