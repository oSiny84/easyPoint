// 작품 시각 계산(영상 계약 §3). 시각은 모두 정수 밀리초다. DOM에 의존하지 않는다.
import type { Clip, Media, Orientation, Overlay, VideoFps } from './videoTypes';
import { VIDEO_FPS, VIDEO_LIMITS } from './videoLimits';

export const clipLength = (clip: Clip) => clip.outMs - clip.inMs;
export const totalMs = (clips: readonly Clip[]) => clips.reduce((sum, clip) => sum + clipLength(clip), 0);

// 각 조각의 작품 안 시작 시각.
export function clipStarts(clips: readonly Clip[]) {
  const starts: number[] = []; let at = 0;
  for (const clip of clips) { starts.push(at); at += clipLength(clip); }
  return starts;
}

// 작품 시각 t를 보여 주는 조각과 그 조각의 원본 시각. start ≤ t < start + 길이. 범위 밖이면 null.
export function locate(clips: readonly Clip[], t: number): { index: number; clip: Clip; sourceMs: number } | null {
  let start = 0;
  for (let index = 0; index < clips.length; index++) {
    const clip = clips[index], length = clipLength(clip);
    if (t >= start && t < start + length) return { index, clip, sourceMs: clip.inMs + (t - start) };
    start += length;
  }
  return null;
}

// 영상 프레임률을 작품 fps로 바꾼다: 40 이하가 될 때까지 절반으로 줄이고 24·25·30 중 가장 가까운 값으로(60→30, 29.97→30, 23.976→24).
export function normalizeFps(fps: number): VideoFps {
  let value = Number.isFinite(fps) && fps > 0 ? fps : 30;
  while (value > 40) value /= 2;
  return VIDEO_FPS.reduce((best, candidate) => Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best, VIDEO_FPS[0]);
}

// 첫 영상의 표시 크기(회전 적용 후)로 작품 방향을 정한다. 세로가 더 길면 세로 작품.
export const orientationOf = (media: Pick<Media, 'width' | 'height'>): Orientation => media.height > media.width ? 'portrait' : 'landscape';

// [startMs, startMs + durationMs) 구간이 겹치면 같은 시각에 보인다.
export const overlaps = (a: Overlay, b: Overlay) => a.startMs < b.startMs + b.durationMs && b.startMs < a.startMs + a.durationMs;

export const memeLimit = (kind: 'sticker' | 'clip') => kind === 'clip' ? VIDEO_LIMITS.concurrentClips : VIDEO_LIMITS.concurrentStickers;

// 어느 시각에든 같은 종류의 밈이 상한보다 많이 보이면 그 종류를 돌려준다. 겹침 수의 최댓값은 어떤 밈의 시작 시각에서 나온다.
export function concurrencyProblem(overlays: readonly Overlay[]): 'sticker' | 'clip' | null {
  for (const kind of ['clip', 'sticker'] as const) {
    const memes = overlays.filter(item => item.type === 'meme' && item.memeKind === kind);
    for (const meme of memes) {
      const visible = memes.filter(other => other.startMs <= meme.startMs && meme.startMs < other.startMs + other.durationMs).length;
      if (visible > memeLimit(kind)) return kind;
    }
  }
  return null;
}

// 밈 안 시각 m = (t − startMs) mod L(계약 §3). 반복 경계에서 L 직전 값 다음에 0이 온다.
export const memeTime = (elapsedMs: number, lengthMs: number) => lengthMs > 0 ? ((elapsedMs % lengthMs) + lengthMs) % lengthMs : 0;

// 정렬된 프레임 시각 목록에서 시각 at 이하인 가장 늦은 프레임의 번호. 없으면 0(첫 프레임).
// 스티커는 at = m(허용치 없음), 밈 영상은 at = m + 1ms로 부른다(계약 §3). 시각 단위는 부르는 쪽이 맞춘다.
export function frameAtOrBefore(timestamps: readonly number[], at: number) {
  let low = 0, high = timestamps.length - 1, found = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (timestamps[mid] <= at) { found = mid; low = mid + 1; } else high = mid - 1;
  }
  return found;
}
