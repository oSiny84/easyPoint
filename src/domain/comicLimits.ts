// 만화 계약 §2·§3의 허용값. 칸·요소·사진 상한은 슬라이드 LIMITS를 그대로 쓴다(validateProject를 그대로 거친다).
export const COMIC_LAYOUTS = ['rows3', 'grid4', 'grid8'] as const;
export const DEFAULT_COMIC_LAYOUT = 'grid4';
export const COMIC_SCHEMA_VERSION = 1;
