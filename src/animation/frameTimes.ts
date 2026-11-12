// 장 → 출력 프레임 계산(애니메이션 계약 §3). 작품 목록·패널의 길이 표시, 재생 미리보기, MP4 출력이 함께 쓴다. DOM에 의존하지 않는다.
import { OUTPUT_FPS } from '../domain/animationLimits';
import type { AnimationProject } from '../domain/animationTypes';

type Timing = Pick<AnimationProject, 'slides' | 'fps' | 'holds'>;

// 장 i의 프레임 수 n_i = hold × 24 / fps. fps가 24의 약수라 항상 정수다.
export const frameCounts = (project: Timing): number[] => project.slides.map(slide => ((project.holds[slide.id] ?? 1) * OUTPUT_FPS) / project.fps);
export const totalFrames = (counts: readonly number[]) => counts.reduce((sum, count) => sum + count, 0);
export const durationMs = (project: Timing) => Math.round((totalFrames(frameCounts(project)) * 1000) / OUTPUT_FPS);

// 장 i가 처음 보이는 프레임 번호 S_i.
export function slideStartFrame(counts: readonly number[], index: number) {
  let start = 0;
  for (let i = 0; i < index; i++) start += counts[i];
  return start;
}

// 프레임 k가 보여 주는 장: S_i ≤ k < S_i + n_i. 전체 프레임 수를 넘으면 처음부터 다시 센다(반복 재생).
export function slideAtFrame(counts: readonly number[], frame: number) {
  const total = totalFrames(counts);
  if (total <= 0) return 0;
  let k = ((Math.floor(frame) % total) + total) % total;
  for (let index = 0; index < counts.length; index++) { if (k < counts[index]) return index; k -= counts[index]; }
  return counts.length - 1;
}

// 재생을 시작한 뒤 지난 시간(ms)의 프레임 번호.
export const frameAtElapsed = (elapsedMs: number) => Math.floor((elapsedMs * OUTPUT_FPS) / 1000);

// "0:16" 꼴의 길이. 1초보다 짧은 작품도 0:01로 보여 준다.
export function formatLength(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
