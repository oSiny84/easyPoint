// 애니메이션 계약 §5의 허용값. 장·요소·사진 상한은 슬라이드 LIMITS를 그대로 쓴다(validateProject를 그대로 거친다).
export const ANIMATION_FPS = [2, 4, 6, 8, 12] as const;
// 출력 프레임률. 초당 장수는 모두 이 값의 약수라 장마다 정수 프레임이 된다(계약 §3).
export const OUTPUT_FPS = 24;
// 길게 보이기. 1배는 저장하지 않는다.
export const HOLD_STEPS = [2, 4] as const;
export const MUSIC_VOLUMES = [0.5, 1] as const;
export const MUSIC_ID = /^[a-z0-9-]{1,64}$/;
export const ANIMATION_SCHEMA_VERSION = 1;
export const DEFAULT_ANIMATION = { fps: 6, musicId: null, musicVolume: 0.5 } as const;
