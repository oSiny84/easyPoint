// 영상 길이 한도 설정(계약 §5). 이 브라우저에만 남는 보호자 설정이다(작품처럼 컴퓨터·브라우저마다 따로).
// 저장소를 쓸 수 없으면 기본 10분으로 동작한다.
import { DEFAULT_LENGTH_LIMIT_MS, isLengthLimit, type LengthLimit } from '../domain/videoLength';

const KEY = 'canvacraft.video.lengthLimit';

export function readLengthLimit(): LengthLimit {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_LENGTH_LIMIT_MS;
    const value = JSON.parse(raw) as { ms?: unknown };
    return isLengthLimit(value?.ms) ? value.ms : DEFAULT_LENGTH_LIMIT_MS;
  } catch { return DEFAULT_LENGTH_LIMIT_MS; }
}

export function writeLengthLimit(limit: LengthLimit): boolean {
  if (!isLengthLimit(limit)) return false;
  try { localStorage.setItem(KEY, JSON.stringify({ ms: limit })); return true; } catch { return false; }
}
