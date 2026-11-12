// 만화 원본 파일(.canvacomic, 만화 계약 §6). 읽기·쓰기 코드는 애니메이션과 함께 쓰는 공통 틀(deck/deckFile.ts)에 있다.
// format 값이 달라 다른 편집기의 파일은 열지 않는다.
import { createDeckFile, type DeckCandidate } from '../deck/deckFile';
import { COMIC_SCHEMA_VERSION } from '../domain/comicLimits';
import type { ComicProject } from '../domain/comicTypes';
import { validateComicProject } from '../domain/comicValidate';

export const COMIC_FORMAT = 'canvacomic';
export const COMIC_EXTENSION = 'canvacomic';

const file = createDeckFile<ComicProject>({ format: COMIC_FORMAT, schemaVersion: COMIC_SCHEMA_VERSION, validate: validateComicProject, wrongFormat: '만화 작품 파일이 아니에요.' });

export type ComicCandidate = DeckCandidate<ComicProject>;
export const serializeComic = file.serialize;
// 새 작품 후보를 돌려준다. 검사를 모두 통과하기 전에는 현재 작품에 아무 영향도 주지 않는다.
export const deserializeComic = file.deserialize;
