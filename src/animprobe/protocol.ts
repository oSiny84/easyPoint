// 애니메이션 A2 기술 시험의 메인 ↔ Worker 메시지. 제품 코드가 아니다.
export type Container = 'mp4' | 'webm';
// repeat: 같은 그림을 장의 프레임 수만큼 넣는다(24fps 고정). variable: 장마다 1프레임을 길이만 다르게 넣는다.
export type Mode = 'repeat' | 'variable';
export const OUTPUT_FPS = 24;
export const OUT_WIDTH = 1920, OUT_HEIGHT = 1080;

export type ToWorker =
  | { type: 'start'; file: string; frameCounts: number[]; container: Container; mode: Mode }
  | { type: 'frame'; index: number; bitmap: ImageBitmap };
export type FromWorker =
  | { type: 'need'; index: number }
  | { type: 'done'; bytes: number; frames: number; packets: number; encodeMs: number; finalizeMs: number }
  | { type: 'fail'; message: string };
