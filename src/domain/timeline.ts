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
