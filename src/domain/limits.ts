// docs/contracts.md §5의 초기 상한. 상한은 성능 보장량이 아니다.
const MiB = 1024 * 1024;
export const LIMITS = {
  slideWidth: 1280, slideHeight: 720,
  titleCodePoints: 100, textCodePoints: 5000,
  slides: 100, elementsPerSlide: 1000, elementsPerProject: 10000,
  pointsPerStroke: 5000, pointsPerSlide: 200000, pointsPerProject: 1000000,
  xMin: -1280, xMax: 2560, yMin: -720, yMax: 1440,
  imageWidthMax: 1280, imageHeightMax: 720, textWidthMin: 16, textWidthMax: 1280,
  fontSizeMin: 12, fontSizeMax: 240, lineHeightMin: 1, lineHeightMax: 2,
  strokeWidthMin: 1, strokeWidthMax: 64,
  assetSideMax: 2560, assetBytesMax: 20 * MiB, assetsTotalBytes: 200 * MiB, assets: 1000,
  zipBytes: 210 * MiB, zipUnpackedBytes: 210 * MiB, zipJsonBytes: 10 * MiB, zipEntries: 1002,
  imageAspectTolerance: 0.001,
  undoEntries: 500, undoBytes: 32 * MiB,
} as const;

// 글꼴은 고정 등록표의 ID만 허용한다. 실제 파일·PPT 대응은 rendering/text/fonts.ts에 있다.
export const FONT_IDS = ['sans-ko', 'round-jua', 'block-dohyeon', 'hand-gamja', 'hand-pen', 'hand-gaegu'] as const;
// 실제 굵은 파일이 있는 글꼴만 굵게 할 수 있다(계약 §3).
export const BOLD_FONT_IDS: readonly string[] = ['sans-ko', 'hand-gaegu'];
export const DEFAULT_FONT_ID = 'sans-ko';
export const DEFAULT_LINE_HEIGHT = 1.3;
export const SCHEMA_VERSION = 1;
