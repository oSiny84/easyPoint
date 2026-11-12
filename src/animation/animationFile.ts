// 애니메이션 원본 파일(.canvaanim, 애니메이션 계약 §6). 읽기·쓰기 코드는 만화와 함께 쓰는 공통 틀(deck/deckFile.ts)에 있다.
// format 값이 달라 다른 편집기의 파일은 열지 않는다.
import { createDeckFile, type DeckCandidate } from '../deck/deckFile';
import { ANIMATION_SCHEMA_VERSION } from '../domain/animationLimits';
import type { AnimationProject } from '../domain/animationTypes';
import { validateAnimationProject } from '../domain/animationValidate';

export const ANIMATION_FORMAT = 'canvaanimation';
export const ANIMATION_EXTENSION = 'canvaanim';

const file = createDeckFile<AnimationProject>({ format: ANIMATION_FORMAT, schemaVersion: ANIMATION_SCHEMA_VERSION, validate: validateAnimationProject, wrongFormat: '애니메이션 작품 파일이 아니에요.' });

export type AnimationCandidate = DeckCandidate<AnimationProject>;
export const serializeAnimation = file.serialize;
// 새 작품 후보를 돌려준다. 검사를 모두 통과하기 전에는 현재 작품에 아무 영향도 주지 않는다.
export const deserializeAnimation = file.deserialize;
