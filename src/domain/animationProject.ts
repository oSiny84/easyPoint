// 새 애니메이션 작품(애니메이션 계약 §2): 흰 빈 장 하나, 초당 6장, 음악 없음.
import { DEFAULT_ANIMATION } from './animationLimits';
import type { AnimationProject } from './animationTypes';
import { createProject } from './project';

export function createAnimationProject(newId: () => string, now: () => string, title = '내 애니메이션'): AnimationProject {
  return { ...createProject(newId, now, title), kind: 'animation', ...DEFAULT_ANIMATION, holds: {} };
}
