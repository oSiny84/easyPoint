// 영상 계약 §5의 초기 상한. 슬라이드 LIMITS와 따로 둔다(캔버스 크기·자막 글자 수가 다르다). 글꼴·크기·줄 간격·색은 LIMITS를 참조한다.
import type { ClipSpeed, MediaMime, Orientation, VideoFps, Volume } from './videoTypes';

const MiB = 1024 * 1024, GiB = 1024 * MiB;
export const VIDEO_LIMITS = {
  titleCodePoints: 100, captionCodePoints: 200,
  mediaBytesMax: 2 * GiB, mediaDurationMaxMs: 600_000, mediaSideMax: 3840,
  clips: 50, totalMs: 600_000, overlays: 300, media: 20, mediaTotalBytes: 4 * GiB,
  clipMinMs: 100, splitMarginMs: 100,
  overlayMinMs: 1000, overlayMaxMs: 60_000,
  captionWidthMin: 16, memeWidthMin: 32, memeHeightMin: 32, memeAspectTolerance: 0.001,
  concurrentClips: 2, concurrentStickers: 4,
  undoEntries: 500, undoBytes: 32 * MiB,
  zipEntries: 22, zipJsonBytes: 10 * MiB,
  // 원본 파일 임시 상한(계약 §6). ZIP64 대용량 시험을 마치면 없앤다.
  originalFileMediaBytes: 1 * GiB,
} as const;

export const CANVAS: Record<Orientation, { width: number; height: number }> = { landscape: { width: 1280, height: 720 }, portrait: { width: 720, height: 1280 } };
export const VIDEO_FPS: readonly VideoFps[] = [24, 25, 30];
export const VOLUMES: readonly Volume[] = [0, 0.5, 1];
export const CLIP_SPEEDS: readonly ClipSpeed[] = [0.5, 1, 1.5, 2, 4];
export const MEDIA_MIMES: readonly MediaMime[] = ['video/mp4', 'video/quicktime', 'video/webm'];
export const VIDEO_SCHEMA_VERSION = 1;
export const DEFAULT_AUDIO = { originalVolume: 1, musicId: null, musicVolume: 0.5 } as const;
