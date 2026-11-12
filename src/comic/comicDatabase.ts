// 만화 작품 저장소(만화 계약 §6). 새 IndexedDB canvacraft-comic 버전 1: projects, summaries, assets.
// 저장·열기·정리 코드는 애니메이션과 함께 쓰는 공통 틀(deck/deckDatabase.ts)에 있다.
import { createDeckDatabase, type DeckOpenResult, type DeckSaveExtras, type DeckSaveResult } from '../deck/deckDatabase';
import type { ComicProject, ComicSummary } from '../domain/comicTypes';
import { validateComicProject } from '../domain/comicValidate';
import { pageCount } from './pageLayout';

const database = createDeckDatabase<ComicProject, ComicSummary>({
  name: 'canvacraft-comic',
  validate: validateComicProject,
  summarize: project => ({ projectId: project.id, kind: 'comic', title: project.title, updatedAt: project.updatedAt, revision: project.revision, panelCount: project.slides.length, pageCount: pageCount(project.slides.length, project.layout) }),
});

export type ComicSaveResult = DeckSaveResult;
export type ComicSaveExtras = DeckSaveExtras;
export type ComicOpenResult = DeckOpenResult<ComicProject>;

export const saveComicProject = database.save;
// 작품 목록은 요약만 읽는다.
export const listComicSummaries = database.list;
// 원본 파일과 같은 검사를 통과해야 연다. 저장된 revision을 이어 간다.
export const openComicProject = database.openProject;
// 어떤 만화 작품의 자료 목록에도 없는 사진을 지운다. 배타 만화 catalog 잠금 안에서만 부른다.
export const removeOrphanComicAssets = database.removeOrphans;
// 작품을 이 컴퓨터에서 지운다. 배타 만화 catalog 잠금 안에서만 부른다. 내려받은 파일은 지우지 않는다.
export const deleteComicProject = database.remove;
