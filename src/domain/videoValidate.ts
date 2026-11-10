// 영상 작품 값 검사(영상 계약 §5). 원본 파일·저장소 읽기와 런타임 명령이 같은 함수를 쓴다. 한도를 넘는 요소를 몰래 잘라 열지 않는다.
import { BOLD_FONT_IDS, FONT_IDS, LIMITS } from './limits';
import { concurrencyProblem, totalMs } from './timeline';
import { fail, type Failure } from './types';
import { ASSET_ID, COLOR, ISO_DATE, UUID, codePoints, isBlankText, onlyKeys } from './validate';
import { CANVAS, CLIP_SPEEDS, MEDIA_MIMES, VIDEO_FPS, VIDEO_LIMITS, VIDEO_SCHEMA_VERSION, VOLUMES } from './videoLimits';
import type { AudioSettings, BuiltinCatalog, CaptionOverlay, Clip, ClipSpeed, Media, MemeOverlay, Overlay, VideoProject, VideoProjectContent } from './videoTypes';

const invalid = (message: string) => fail('INVALID_VALUE', message);
const isInt = (value: unknown): value is number => Number.isInteger(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const inRange = (value: unknown, min: number, max: number) => finite(value) && value >= min && value <= max;
const CODEC = /^[A-Za-z0-9._-]{1,64}$/;
type Canvas = { width: number; height: number };

export function checkMedia(media: Media): Failure | null {
  if (!media || typeof media !== 'object') return fail('ASSET_INVALID', '영상 자료 형식이 올바르지 않아요.');
  if (onlyKeys(media, ['id', 'mime', 'byteLength', 'durationMs', 'width', 'height', 'rotation', 'fps', 'hasAudio', 'videoCodec', 'audioCodec'], '영상 자료')) return fail('ASSET_INVALID', '영상 자료에 알 수 없는 값이 있어요.');
  if (typeof media.id !== 'string' || !ASSET_ID.test(media.id)) return fail('ASSET_INVALID', '영상 자료 ID가 올바르지 않아요.');
  if (!MEDIA_MIMES.includes(media.mime)) return fail('ASSET_INVALID', 'MP4·MOV·WebM 영상만 넣을 수 있어요.');
  if (!isInt(media.byteLength) || media.byteLength < 1) return fail('ASSET_INVALID', '영상 파일 크기가 올바르지 않아요.');
  if (media.byteLength > VIDEO_LIMITS.mediaBytesMax) return fail('LIMIT_EXCEEDED', '영상 파일이 너무 커요. 2GB까지 넣을 수 있어요.');
  if (!isInt(media.durationMs) || media.durationMs < VIDEO_LIMITS.clipMinMs) return fail('ASSET_INVALID', '영상 길이가 올바르지 않아요.');
  if (media.durationMs > VIDEO_LIMITS.mediaDurationMaxMs) return fail('LIMIT_EXCEEDED', '영상이 너무 길어요. 10분까지 넣을 수 있어요.');
  if (!isInt(media.width) || !isInt(media.height) || media.width < 1 || media.height < 1) return fail('ASSET_INVALID', '영상 크기가 올바르지 않아요.');
  if (media.width > VIDEO_LIMITS.mediaSideMax || media.height > VIDEO_LIMITS.mediaSideMax) return fail('LIMIT_EXCEEDED', '영상 화면이 너무 커요.');
  if (![0, 90, 180, 270].includes(media.rotation)) return fail('ASSET_INVALID', '영상 회전 값이 올바르지 않아요.');
  if (!inRange(media.fps, 0.001, 1000)) return fail('ASSET_INVALID', '영상 프레임률이 올바르지 않아요.');
  if (typeof media.hasAudio !== 'boolean') return fail('ASSET_INVALID', '영상 소리 정보가 올바르지 않아요.');
  if (typeof media.videoCodec !== 'string' || !CODEC.test(media.videoCodec)) return fail('ASSET_INVALID', '영상 코덱 정보가 올바르지 않아요.');
  if (media.hasAudio ? typeof media.audioCodec !== 'string' || !CODEC.test(media.audioCodec) : media.audioCodec !== null) return fail('ASSET_INVALID', '영상 소리 코덱 정보가 올바르지 않아요.');
  return null;
}

export function checkClip(clip: Clip, media: Media | undefined): Failure | null {
  if (!clip || typeof clip !== 'object') return invalid('영상 조각 형식이 올바르지 않아요.');
  const keys = onlyKeys(clip, ['id', 'mediaId', 'inMs', 'outMs', 'muted', 'speed'], '영상 조각');
  if (keys) return keys;
  if (typeof clip.id !== 'string' || !UUID.test(clip.id)) return invalid('영상 조각 ID가 올바르지 않아요.');
  if (!media) return fail('ASSET_MISSING', '영상 자료를 찾을 수 없어요.');
  if (!isInt(clip.inMs) || !isInt(clip.outMs) || clip.inMs < 0 || clip.outMs > media.durationMs || clip.inMs >= clip.outMs) return invalid('영상 조각 구간이 올바르지 않아요.');
  if (clip.outMs - clip.inMs < VIDEO_LIMITS.clipMinMs) return invalid('영상 조각은 0.1초보다 길어야 해요.');
  if (typeof clip.muted !== 'boolean') return invalid('조각 소리 값이 올바르지 않아요.');
  // 1배는 저장하지 않는다(계약 §2). 다른 값은 정해진 단계만.
  if ('speed' in clip && (clip.speed === 1 || !CLIP_SPEEDS.includes(clip.speed as ClipSpeed))) return invalid('조각 빠르기 값이 올바르지 않아요.');
  return null;
}

// 자막 높이는 줄 계산 전에는 모르므로 개행 수로 구한 최소 높이를 쓴다(슬라이드 elementBounds와 같다). 캔버스와 겹치는지만 판단한다.
export function overlayBounds(overlay: Overlay) {
  if (overlay.type === 'meme') return { left: overlay.x, top: overlay.y, right: overlay.x + overlay.width, bottom: overlay.y + overlay.height };
  const lines = overlay.text.split('\n').length;
  return { left: overlay.x, top: overlay.y, right: overlay.x + overlay.width, bottom: overlay.y + lines * overlay.fontSize * overlay.lineHeight };
}

function checkPosition(overlay: Overlay, canvas: Canvas): Failure | null {
  if (!inRange(overlay.x, -canvas.width, canvas.width * 2) || !inRange(overlay.y, -canvas.height, canvas.height * 2)) return invalid('위치가 허용 범위를 벗어났어요.');
  const box = overlayBounds(overlay);
  if (box.right <= 0 || box.bottom <= 0 || box.left >= canvas.width || box.top >= canvas.height) return invalid('화면 밖으로 완전히 나갈 수 없어요.');
  return null;
}

export function checkOverlayTime(overlay: Pick<Overlay, 'startMs' | 'durationMs'>, total: number): Failure | null {
  if (!isInt(overlay.startMs) || !isInt(overlay.durationMs)) return invalid('보이는 시간이 올바르지 않아요.');
  if (overlay.durationMs < VIDEO_LIMITS.overlayMinMs || overlay.durationMs > VIDEO_LIMITS.overlayMaxMs) return invalid('보이는 시간은 1초에서 60초 사이여야 해요.');
  if (overlay.startMs < 0 || overlay.startMs >= total || overlay.startMs + overlay.durationMs > total) return invalid('보이는 시간이 영상 길이를 벗어났어요.');
  return null;
}

function checkCaption(overlay: CaptionOverlay, canvas: Canvas): Failure | null {
  const keys = onlyKeys(overlay, ['id', 'type', 'startMs', 'durationMs', 'x', 'y', 'width', 'text', 'fontId', 'fontSize', 'bold', 'color', 'align', 'lineHeight', 'backdrop'], '자막');
  if (keys) return keys;
  if (typeof overlay.text !== 'string' || isBlankText(overlay.text)) return invalid('빈 자막은 저장할 수 없어요.');
  if (codePoints(overlay.text) > VIDEO_LIMITS.captionCodePoints) return fail('LIMIT_EXCEEDED', '자막이 너무 길어요.');
  if (!inRange(overlay.width, VIDEO_LIMITS.captionWidthMin, canvas.width)) return invalid('자막 상자 폭이 허용 범위를 벗어났어요.');
  if (!(FONT_IDS as readonly string[]).includes(overlay.fontId)) return invalid('등록되지 않은 글꼴이에요.');
  if (!inRange(overlay.fontSize, LIMITS.fontSizeMin, LIMITS.fontSizeMax)) return invalid('글씨 크기가 허용 범위를 벗어났어요.');
  if (!inRange(overlay.lineHeight, LIMITS.lineHeightMin, LIMITS.lineHeightMax)) return invalid('줄 간격이 허용 범위를 벗어났어요.');
  if (typeof overlay.bold !== 'boolean') return invalid('굵기 값이 올바르지 않아요.');
  if (overlay.bold && !BOLD_FONT_IDS.includes(overlay.fontId)) return invalid('이 글꼴은 굵게 할 수 없어요.');
  if (typeof overlay.color !== 'string' || !COLOR.test(overlay.color)) return invalid('색 값이 올바르지 않아요.');
  if (!['left', 'center', 'right'].includes(overlay.align)) return invalid('정렬 값이 올바르지 않아요.');
  if (overlay.backdrop !== 'none' && overlay.backdrop !== 'band') return invalid('자막 배경 값이 올바르지 않아요.');
  return checkPosition(overlay, canvas);
}

function checkMeme(overlay: MemeOverlay, canvas: Canvas, catalog: BuiltinCatalog): Failure | null {
  const keys = onlyKeys(overlay, ['id', 'type', 'startMs', 'durationMs', 'x', 'y', 'width', 'height', 'memeId', 'memeKind', 'soundOn'], '밈');
  if (keys) return keys;
  const info = typeof overlay.memeId === 'string' ? catalog.meme(overlay.memeId) : undefined;
  if (!info) return fail('ASSET_MISSING', '밈 자료를 찾을 수 없어요.');
  if (overlay.memeKind !== info.kind) return invalid('밈 종류가 목록과 달라요.');
  if (!inRange(overlay.width, VIDEO_LIMITS.memeWidthMin, canvas.width) || !inRange(overlay.height, VIDEO_LIMITS.memeHeightMin, canvas.height)) return invalid('밈 크기가 허용 범위를 벗어났어요.');
  const wanted = info.width / info.height;
  if (Math.abs(overlay.width / overlay.height - wanted) / wanted > VIDEO_LIMITS.memeAspectTolerance) return invalid('밈 비율이 원본과 달라요.');
  if (typeof overlay.soundOn !== 'boolean') return invalid('밈 소리 값이 올바르지 않아요.');
  return checkPosition(overlay, canvas);
}

export function checkOverlay(overlay: Overlay, canvas: Canvas, total: number, catalog: BuiltinCatalog): Failure | null {
  if (!overlay || typeof overlay !== 'object') return invalid('자막·밈 형식이 올바르지 않아요.');
  if (typeof overlay.id !== 'string' || !UUID.test(overlay.id)) return invalid('자막·밈 ID가 올바르지 않아요.');
  if (overlay.type !== 'caption' && overlay.type !== 'meme') return invalid('알 수 없는 자막·밈 종류예요.');
  const time = checkOverlayTime(overlay, total);
  if (time) return time;
  return overlay.type === 'caption' ? checkCaption(overlay, canvas) : checkMeme(overlay, canvas, catalog);
}

export function checkAudio(audio: AudioSettings, catalog: BuiltinCatalog): Failure | null {
  if (!audio || typeof audio !== 'object') return invalid('소리 설정 형식이 올바르지 않아요.');
  const keys = onlyKeys(audio, ['originalVolume', 'musicId', 'musicVolume'], '소리 설정');
  if (keys) return keys;
  if (!VOLUMES.includes(audio.originalVolume) || !VOLUMES.includes(audio.musicVolume)) return invalid('소리 크기 값이 올바르지 않아요.');
  if (audio.musicId !== null && (typeof audio.musicId !== 'string' || !catalog.hasMusic(audio.musicId))) return fail('ASSET_MISSING', '배경음악을 찾을 수 없어요.');
  return null;
}

// 내용 전체 검사. 명령을 적용한 결과도 이 함수를 통과해야 문서가 바뀐다.
export function checkVideoContent(content: VideoProjectContent, catalog: BuiltinCatalog): Failure | null {
  if (typeof content.title !== 'string') return invalid('작품 이름이 올바르지 않아요.');
  if (codePoints(content.title) > VIDEO_LIMITS.titleCodePoints) return fail('LIMIT_EXCEEDED', '작품 이름이 너무 길어요.');
  if (content.orientation !== 'landscape' && content.orientation !== 'portrait') return invalid('작품 방향이 올바르지 않아요.');
  if (!VIDEO_FPS.includes(content.fps)) return invalid('작품 프레임률이 올바르지 않아요.');
  if (!Array.isArray(content.mediaManifest) || !Array.isArray(content.clips) || !Array.isArray(content.overlays)) return invalid('영상 작품 형식이 올바르지 않아요.');

  if (content.mediaManifest.length > VIDEO_LIMITS.media) return fail('LIMIT_EXCEEDED', '영상 자료가 너무 많아요.');
  const media = new Map<string, Media>(); let mediaBytes = 0;
  for (const item of content.mediaManifest) {
    const problem = checkMedia(item);
    if (problem) return problem;
    if (media.has(item.id)) return fail('ASSET_INVALID', '영상 자료가 중복되어 있어요.');
    media.set(item.id, item); mediaBytes += item.byteLength;
  }
  if (mediaBytes > VIDEO_LIMITS.mediaTotalBytes) return fail('LIMIT_EXCEEDED', '영상 자료 용량이 너무 커요.');

  if (content.clips.length > VIDEO_LIMITS.clips) return fail('LIMIT_EXCEEDED', '영상 조각을 더 넣을 수 없어요.');
  const ids = new Set<string>();
  for (const clip of content.clips) {
    const problem = checkClip(clip, media.get(clip?.mediaId));
    if (problem) return problem;
    if (ids.has(clip.id)) return invalid('영상 조각 ID가 중복되어 있어요.');
    ids.add(clip.id);
  }
  const total = totalMs(content.clips);
  if (total > VIDEO_LIMITS.totalMs) return fail('LIMIT_EXCEEDED', '작품이 너무 길어요. 10분까지 만들 수 있어요.');

  if (content.overlays.length > VIDEO_LIMITS.overlays) return fail('LIMIT_EXCEEDED', '자막·밈을 더 넣을 수 없어요.');
  if (!content.clips.length && content.overlays.length) return invalid('영상이 없으면 자막·밈도 없어야 해요.');
  const canvas = CANVAS[content.orientation];
  for (const overlay of content.overlays) {
    const problem = checkOverlay(overlay, canvas, total, catalog);
    if (problem) return problem;
    if (ids.has(overlay.id)) return invalid('자막·밈 ID가 중복되어 있어요.');
    ids.add(overlay.id);
  }
  const crowded = concurrencyProblem(content.overlays);
  if (crowded) return fail('LIMIT_EXCEEDED', crowded === 'clip' ? '같은 시간에 보이는 밈 영상은 2개까지예요.' : '같은 시간에 보이는 움직이는 스티커는 4개까지예요.');
  return checkAudio(content.audio, catalog);
}

export function validateVideoProject(value: unknown, catalog: BuiltinCatalog): { ok: true; project: VideoProject } | Failure {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('영상 작품 형식이 올바르지 않아요.');
  const project = value as VideoProject;
  if (typeof project.schemaVersion === 'number' && project.schemaVersion > VIDEO_SCHEMA_VERSION) return fail('UNSUPPORTED_VERSION', '더 새로운 버전에서 만든 작품이라 열 수 없어요.');
  if (project.schemaVersion !== VIDEO_SCHEMA_VERSION) return invalid('영상 작품 버전이 올바르지 않아요.');
  const keys = onlyKeys(project, ['schemaVersion', 'kind', 'id', 'title', 'revision', 'createdAt', 'updatedAt', 'orientation', 'fps', 'clips', 'overlays', 'audio', 'mediaManifest'], '영상 작품');
  if (keys) return keys;
  if (project.kind !== 'video') return invalid('영상 작품이 아니에요.');
  if (typeof project.id !== 'string' || !UUID.test(project.id)) return invalid('작품 ID가 올바르지 않아요.');
  if (!isInt(project.revision) || project.revision < 0) return invalid('작품 revision이 올바르지 않아요.');
  if (typeof project.createdAt !== 'string' || typeof project.updatedAt !== 'string' || !ISO_DATE.test(project.createdAt) || !ISO_DATE.test(project.updatedAt)) return invalid('작품 날짜가 올바르지 않아요.');
  const problem = checkVideoContent(project, catalog);
  return problem ?? { ok: true, project };
}
