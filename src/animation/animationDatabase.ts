// 애니메이션 작품 저장소(애니메이션 계약 §6). 새 IndexedDB canvacraft-animation 버전 1: projects, summaries, assets.
// 저장·열기·정리 코드는 만화와 함께 쓰는 공통 틀(deck/deckDatabase.ts)에 있다. 슬라이드 저장소(storage/database.ts)와는 데이터베이스와 파일이 따로다.
import { createDeckDatabase, type DeckOpenResult, type DeckSaveExtras, type DeckSaveResult } from '../deck/deckDatabase';
import type { AnimationProject, AnimationSummary } from '../domain/animationTypes';
import { validateAnimationProject } from '../domain/animationValidate';
import { durationMs } from './frameTimes';

const database = createDeckDatabase<AnimationProject, AnimationSummary>({
  name: 'canvacraft-animation',
  validate: validateAnimationProject,
  summarize: project => ({ projectId: project.id, kind: 'animation', title: project.title, updatedAt: project.updatedAt, revision: project.revision, frameCount: project.slides.length, durationMs: durationMs(project) }),
});

export type AnimationSaveResult = DeckSaveResult;
export type AnimationSaveExtras = DeckSaveExtras;
export type AnimationOpenResult = DeckOpenResult<AnimationProject>;

export const openAnimationDatabase = database.open;
export const saveAnimationProject = database.save;
// 작품 목록은 요약만 읽는다.
export const listAnimationSummaries = database.list;
// 원본 파일과 같은 검사를 통과해야 연다. 저장된 revision을 이어 간다.
export const openAnimationProject = database.openProject;
// 어떤 애니메이션 작품의 자료 목록에도 없는 사진을 지운다. 배타 애니메이션 catalog 잠금 안에서만 부른다.
export const removeOrphanAnimationAssets = database.removeOrphans;
// 작품을 이 컴퓨터에서 지운다. 배타 애니메이션 catalog 잠금 안에서만 부른다. 내려받은 파일은 지우지 않는다.
export const deleteAnimationProject = database.remove;
