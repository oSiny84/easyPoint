// 영상 편집기 V2 기술 시험 전용. 제품 코드가 아니며 측정을 재현하기 위해 남긴다(src/probe와 같은 성격).
// 메인 페이지와 Worker가 주고받는 작업 형식.

export type Pair = 'mp4' | 'webm';

export type Job =
  | { kind: 'support' }
  | { kind: 'makeSource'; name: string; pair: Pair; width: number; height: number; fps: number; seconds: number; hardware: HardwarePref; trace?: boolean }
  | { kind: 'export'; input: string; name: string; pair: Pair; seconds: number; caption: boolean; sticker: boolean; memeClips: string[]; hardware: HardwarePref; bitrate: number; lookupToleranceS?: number; fastStart?: 'end' | 'reserve'; trace?: boolean }
  | { kind: 'verify'; name: string; fps: number; samples: number }
  | { kind: 'decodeSpeed'; name: string }
  | { kind: 'alpha' }
  | { kind: 'animatedImage'; format: 'webp' | 'png'; size: number; fps: number; seconds: number }
  | { kind: 'snapshot'; name: string; atSeconds: number }
  | { kind: 'remove'; names: string[] };

export type HardwarePref = 'no-preference' | 'prefer-hardware' | 'prefer-software';

export type WorkerRequest = { id: number; job: Job };
export type WorkerReply =
  | { id: number; ok: true; result: unknown; transfer?: never }
  | { id: number; ok: false; error: string }
  | { id: number; progress: number };

// 출력 프레임 k의 시각(계약 §3). 마이크로초 정수.
export const frameTimeUs = (k: number, fps: number) => Math.floor((k * 1_000_000) / fps);
// 원본 프레임 찾기 허용치. 내림한 출력 시각은 원본의 정확한 k/fps보다 최대 1µs 작고, WebM은 시각을 1ms 단위로 반올림해 최대 0.5ms 늦게 적는다.
// "시각 ≤ s" 그대로 찾으면 그런 프레임에서 한 장 앞 프레임을 고른다(V2 1분 출력에서 확인). 그래서 s + 1ms까지 허용한다.
export const LOOKUP_TOLERANCE_S = 0.001;

// 프레임 번호를 화면 왼쪽 위 사각형 16개(흰색=1)로 그린다. 다시 해독해 번호를 읽어 시각 대응을 확인한다.
export const BIT_COUNT = 16, BIT_SIZE = 48, BIT_STEP = 56, BIT_TOP = 16, BIT_LEFT = 16;
