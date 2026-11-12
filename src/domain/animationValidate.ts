// 애니메이션 작품 검사(애니메이션 계약 §5). 원본 파일·저장소 읽기·명령이 같은 규칙을 쓴다. DOM에 의존하지 않는다.
// 장·요소·사진·개수 검사는 슬라이드의 validateProject에 그대로 맡기고, 여기서는 애니메이션 필드만 본다.
import { ANIMATION_FPS, ANIMATION_SCHEMA_VERSION, HOLD_STEPS, MUSIC_ID, MUSIC_VOLUMES } from './animationLimits';
import type { AnimationProject, AnimationSettings } from './animationTypes';
import { fail, type Failure } from './types';
import { onlyKeys, validateProject } from './validate';

const SLIDE_KEYS = ['schemaVersion', 'id', 'title', 'revision', 'createdAt', 'updatedAt', 'width', 'height', 'slides', 'assetManifest'] as const;
const OWN_KEYS = ['kind', 'fps', 'musicId', 'musicVolume', 'holds'] as const;
const invalid = (message: string) => fail('INVALID_VALUE', message);

export const isAnimationFps = (value: unknown) => (ANIMATION_FPS as readonly unknown[]).includes(value);
export const isMusicId = (value: unknown) => value === null || (typeof value === 'string' && MUSIC_ID.test(value));
export const isMusicVolume = (value: unknown) => (MUSIC_VOLUMES as readonly unknown[]).includes(value);
export const isHold = (value: unknown) => (HOLD_STEPS as readonly unknown[]).includes(value);

// 빠르기·음악·길게 보이기. holds의 키는 모두 지금 있는 장이어야 한다.
export function checkAnimationSettings(settings: AnimationSettings, slideIds: ReadonlySet<string>): Failure | null {
  if (!isAnimationFps(settings.fps)) return invalid('빠르기가 올바르지 않아요.');
  if (!isMusicId(settings.musicId)) return invalid('배경음악이 올바르지 않아요.');
  if (!isMusicVolume(settings.musicVolume)) return invalid('음악 크기가 올바르지 않아요.');
  const holds = settings.holds as unknown;
  if (!holds || typeof holds !== 'object' || Array.isArray(holds)) return invalid('길게 보이기 값이 올바르지 않아요.');
  for (const [slideId, hold] of Object.entries(holds)) {
    if (!slideIds.has(slideId)) return invalid('길게 보이기가 없는 장을 가리켜요.');
    if (!isHold(hold)) return invalid('길게 보이기 값이 올바르지 않아요.');
  }
  return null;
}

export function validateAnimationProject(value: unknown): { ok: true; project: AnimationProject } | Failure {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('작품 파일 형식이 올바르지 않아요.');
  const project = value as AnimationProject;
  if (typeof project.schemaVersion === 'number' && project.schemaVersion > ANIMATION_SCHEMA_VERSION) return fail('UNSUPPORTED_VERSION', '더 새로운 버전에서 만든 작품이라 열 수 없어요.');
  if (project.kind !== 'animation') return invalid('애니메이션 작품 파일 형식이 올바르지 않아요.');
  const keys = onlyKeys(project, [...SLIDE_KEYS, ...OWN_KEYS], '작품');
  if (keys) return keys;
  // 슬라이드와 같은 필드만 뽑아 슬라이드 검사에 넘긴다. 없는 필드는 그대로 없게 두어 그쪽이 걸러 내게 한다.
  const slidePart: Record<string, unknown> = {};
  for (const key of SLIDE_KEYS) if (key in project) slidePart[key] = project[key];
  const checked = validateProject(slidePart);
  if (!checked.ok) return checked;
  const problem = checkAnimationSettings(project, new Set(project.slides.map(slide => slide.id)));
  if (problem) return problem;
  return { ok: true, project };
}
