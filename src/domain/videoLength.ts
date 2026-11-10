// 영상 길이 한도(영상 계약 §5, 2026-11-10 사용자 요청으로 설정 가능). 문서 필드가 아니라 이 브라우저의 설정이며,
// 작품을 늘리는 곳(가져오기·addClip·trimClip·setClipSpeed)에서만 쓴다. 이미 있는 작품은 한도와 상관없이 열린다.
// null은 무제한이다. 파일 크기 한도는 길이 한도에 비례한다(10분당 파일 2GiB·합계 4GiB, 무제한이면 크기 한도 없음).

export type LengthLimit = number | null;
export type GrowthLimits = { totalMs: number; mediaDurationMaxMs: number; mediaBytesMax: number; mediaTotalBytes: number };

export const DEFAULT_LENGTH_LIMIT_MS = 600_000;
const MINUTE = 60_000, HOUR = 60 * MINUTE;
// 설정할 수 있는 범위: 1분 ~ 99시간(그보다 길면 무제한을 고른다).
export const LENGTH_LIMIT_MIN_MS = MINUTE;
export const LENGTH_LIMIT_MAX_MS = 99 * HOUR;
const BASE_FILE_BYTES = 2 * 1024 ** 3, BASE_TOTAL_BYTES = 4 * 1024 ** 3;

export function isLengthLimit(value: unknown): value is LengthLimit {
  return value === null || (Number.isInteger(value) && (value as number) >= LENGTH_LIMIT_MIN_MS && (value as number) <= LENGTH_LIMIT_MAX_MS && (value as number) % MINUTE === 0);
}

export function limitsFor(limit: LengthLimit): GrowthLimits {
  if (limit === null) return { totalMs: Infinity, mediaDurationMaxMs: Infinity, mediaBytesMax: Infinity, mediaTotalBytes: Infinity };
  const factor = Math.max(1, Math.ceil(limit / DEFAULT_LENGTH_LIMIT_MS));
  return { totalMs: limit, mediaDurationMaxMs: limit, mediaBytesMax: BASE_FILE_BYTES * factor, mediaTotalBytes: BASE_TOTAL_BYTES * factor };
}

// "10분", "1시간", "1시간 30분". 무제한은 "무제한".
export function describeLength(limit: LengthLimit) {
  if (limit === null) return '무제한';
  const hours = Math.floor(limit / HOUR), minutes = Math.round((limit % HOUR) / MINUTE);
  return [hours ? `${hours}시간` : '', minutes ? `${minutes}분` : ''].filter(Boolean).join(' ') || '0분';
}

// "2GB", "12GB"
const describeBytes = (bytes: number) => `${Math.round(bytes / 1024 ** 3)}GB`;

export const tooLongWork = (limit: LengthLimit) => `작품이 너무 길어져요. ${describeLength(limit)}까지 만들 수 있어요.`;
export const tooLongMedia = (limit: LengthLimit) => `영상이 너무 길어요. ${describeLength(limit)}까지 넣을 수 있어요.`;
export const tooBigMedia = (limit: LengthLimit) => `영상 파일이 너무 커요. ${describeBytes(limitsFor(limit).mediaBytesMax)}까지 넣을 수 있어요.`;
export const tooBigTotal = '영상 자료 용량이 너무 커요.';

// 한도를 넘는 작품(한도를 줄이기 전에 만든 것)은 길이를 늘리는 명령만 막고, 줄이거나 그대로인 명령은 허용한다.
export const growsPast = (limit: number, before: number, after: number) => after > limit && after > before;
