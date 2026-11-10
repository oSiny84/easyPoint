// 영상 계약 §4의 편집 명령 19개. 입력을 검사한 뒤 새 내용을 만들고, 바뀌지 않은 부분은 이전 객체를 그대로 공유한다.
// 결과 내용은 checkVideoContent를 통과해야 하며 잘못된 요청은 부분 적용하지 않는다. DOM에 의존하지 않는다.
import { codePoints, isBlankText, normalizeColor, normalizeText } from '../domain/validate';
import { fail, type Failure, type TextAlign } from '../domain/types';
import { clipLength, clipStarts, locate, memeLimit, normalizeFps, orientationOf, totalMs, workOffset } from '../domain/timeline';
import { CANVAS, CLIP_SPEEDS, VIDEO_LIMITS } from '../domain/videoLimits';
import { checkMedia, checkVideoContent, overlayBounds } from '../domain/videoValidate';
import type { AudioSettings, Backdrop, BuiltinCatalog, CaptionOverlay, Clip, ClipSpeed, Media, MemeKind, MemeOverlay, Overlay, VideoFocus, VideoProjectContent } from '../domain/videoTypes';

type CaptionStyle = { fontId: string; fontSize: number; bold: boolean; color: string; align: TextAlign; lineHeight: number; backdrop: Backdrop };

export type VideoCommand =
  | { type: 'renameProject'; title: string }
  // 새 영상은 media를 함께 넘겨 같은 명령에서 등록한다. 되돌리면 등록도 돌아간다. 바이트는 이미 저장소에 있어야 한다(계약 §6).
  | { type: 'addClip'; media: Media }
  | { type: 'splitClip'; clipId: string; atMs: number }
  | { type: 'trimClip'; clipId: string; inMs: number; outMs: number }
  | { type: 'deleteClip'; clipId: string }
  | { type: 'reorderClip'; clipId: string; toIndex: number }
  | { type: 'setClipMuted'; clipId: string; muted: boolean }
  | { type: 'setClipSpeed'; clipId: string; speed: ClipSpeed }
  | ({ type: 'addCaption'; text: string; x: number; y: number; width: number; startMs: number; durationMs: number } & CaptionStyle)
  | ({ type: 'updateCaption'; overlayId: string; text?: string; width?: number } & Partial<CaptionStyle>)
  | { type: 'addMeme'; memeId: string; memeKind: MemeKind; x: number; y: number; width: number; height: number; startMs: number; durationMs: number; soundOn: boolean }
  | { type: 'setOverlayTime'; overlayId: string; startMs: number; durationMs: number }
  | { type: 'moveOverlay'; overlayId: string; x: number; y: number }
  | { type: 'resizeOverlay'; overlayId: string; x: number; y: number; width: number; fontSize?: number; height?: number }
  | { type: 'reorderOverlay'; overlayId: string; toIndex: number }
  | { type: 'duplicateOverlay'; overlayId: string }
  | { type: 'deleteOverlay'; overlayId: string }
  | { type: 'setMemeSound'; overlayId: string; soundOn: boolean }
  | { type: 'setAudio'; originalVolume?: AudioSettings['originalVolume']; musicId?: string | null; musicVolume?: AudioSettings['musicVolume'] };

export type VideoApplied = { ok: true; content: VideoProjectContent; focus: VideoFocus; changed: boolean; adjustedOverlays?: number };
export type VideoApplyContext = { newId: () => string; catalog: BuiltinCatalog };

const invalid = (message: string) => fail('INVALID_VALUE', message);
const unchanged = (content: VideoProjectContent, focus: VideoFocus): VideoApplied => ({ ok: true, content, focus, changed: false });
const noClip = () => invalid('영상 조각을 찾을 수 없어요.');
const noOverlay = () => invalid('자막·밈을 찾을 수 없어요.');
const clipFocus = (id: string): VideoFocus => ({ kind: 'clip', id });
const overlayFocus = (id: string): VideoFocus => ({ kind: 'overlay', id });

function validIndex(index: unknown, length: number) { return Number.isInteger(index) && (index as number) >= 0 && (index as number) < length; }
function move<T>(items: readonly T[], from: number, to: number): T[] { const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; }

// 결과 전체를 검사해 통과할 때만 바뀐 문서를 돌려준다.
function finish(content: VideoProjectContent, focus: VideoFocus, catalog: BuiltinCatalog, adjustedOverlays?: number): VideoApplied | Failure {
  const problem = checkVideoContent(content, catalog);
  if (problem) return problem;
  return adjustedOverlays ? { ok: true, content, focus, changed: true, adjustedOverlays } : { ok: true, content, focus, changed: true };
}

function patchOverlay(content: VideoProjectContent, overlay: Overlay, patch: Partial<Overlay>, catalog: BuiltinCatalog): VideoApplied | Failure {
  if (Object.entries(patch).every(([key, value]) => (overlay as Record<string, unknown>)[key] === value)) return unchanged(content, overlayFocus(overlay.id));
  const next = { ...overlay, ...patch } as Overlay;
  return finish({ ...content, overlays: content.overlays.map(item => item === overlay ? next : item) }, overlayFocus(overlay.id), catalog);
}

// 겹침 요소 따라가기(계약 §4). 조각을 바꾸기 전 요소마다 startMs가 가리키던 (조각, 원본 시각)을 구하고,
// 바뀐 뒤 그 원본 프레임이 남아 있으면 새 작품 시각으로 옮긴다. origin은 새 조각 id → 원래 조각 id다(자르기의 뒤쪽 조각).
function follow(before: readonly Clip[], after: readonly Clip[], overlays: readonly Overlay[], origin: ReadonlyMap<string, string> = new Map()) {
  const starts = clipStarts(after);
  const total = totalMs(after);
  let adjusted = 0;
  const kept: Overlay[] = [];
  for (const overlay of overlays) {
    const at = locate(before, overlay.startMs);
    let startMs: number | null = null;
    if (at) {
      const index = after.findIndex(clip => (origin.get(clip.id) ?? clip.id) === at.clip.id && clip.inMs <= at.sourceMs && at.sourceMs < clip.outMs);
      if (index >= 0) startMs = Math.min(starts[index] + clipLength(after[index]) - 1, starts[index] + workOffset(after[index], at.sourceMs));
    }
    if (startMs === null) { adjusted++; continue; }
    let durationMs = overlay.durationMs;
    if (startMs + durationMs > total) {
      durationMs = total - startMs; adjusted++;
      if (durationMs < VIDEO_LIMITS.overlayMinMs) continue;
    }
    kept.push(startMs === overlay.startMs && durationMs === overlay.durationMs ? overlay : { ...overlay, startMs, durationMs });
  }
  // 동시 밈 수가 상한을 넘으면 늦게 시작하는 밈부터 지운다. 먼저 시작한 밈을 남긴 채 하나씩 더해 보며 넘치는 것을 뺀다.
  const order = kept.map((overlay, index) => ({ overlay, index })).filter(item => item.overlay.type === 'meme').sort((a, b) => a.overlay.startMs - b.overlay.startMs || a.index - b.index);
  const accepted: MemeOverlay[] = []; const dropped = new Set<Overlay>();
  for (const { overlay } of order) {
    const meme = overlay as MemeOverlay;
    const visible = accepted.filter(other => other.memeKind === meme.memeKind && other.startMs <= meme.startMs && meme.startMs < other.startMs + other.durationMs).length;
    if (visible >= memeLimit(meme.memeKind)) { dropped.add(meme); adjusted++; } else accepted.push(meme);
  }
  return { overlays: dropped.size ? kept.filter(item => !dropped.has(item)) : kept, adjusted };
}

function withClips(content: VideoProjectContent, clips: Clip[], focus: VideoFocus, catalog: BuiltinCatalog, origin?: Map<string, string>): VideoApplied | Failure {
  const followed = follow(content.clips, clips, content.overlays, origin);
  return finish({ ...content, clips, overlays: followed.overlays }, focus, catalog, followed.adjusted);
}

// 복제본이 전체가 들어가는 크기면 화면 안으로 옮긴다(슬라이드 keepInside와 같은 규칙).
function keepInside(overlay: Overlay, canvas: { width: number; height: number }): Overlay {
  const box = overlayBounds(overlay);
  let dx = 0, dy = 0;
  if (box.right - box.left <= canvas.width) dx = box.left < 0 ? -box.left : box.right > canvas.width ? canvas.width - box.right : 0;
  if (box.bottom - box.top <= canvas.height) dy = box.top < 0 ? -box.top : box.bottom > canvas.height ? canvas.height - box.bottom : 0;
  return { ...overlay, x: overlay.x + dx, y: overlay.y + dy };
}

export function applyVideoCommand(content: VideoProjectContent, command: VideoCommand, context: VideoApplyContext): VideoApplied | Failure {
  const { catalog } = context;
  const clipIndex = (id: string) => content.clips.findIndex(clip => clip.id === id);
  const findOverlay = (id: string) => content.overlays.find(overlay => overlay.id === id);

  switch (command.type) {
    case 'renameProject': {
      if (typeof command.title !== 'string') return invalid('작품 이름이 올바르지 않아요.');
      if (codePoints(command.title) > VIDEO_LIMITS.titleCodePoints) return fail('LIMIT_EXCEEDED', '작품 이름이 너무 길어요.');
      if (command.title === content.title) return unchanged(content, null);
      return { ok: true, content: { ...content, title: command.title }, focus: null, changed: true };
    }
    case 'addClip': {
      const media = command.media;
      const problem = checkMedia(media);
      if (problem) return problem;
      const known = content.mediaManifest.find(item => item.id === media.id);
      // 같은 해시의 영상은 이미 등록된 자료를 쓰고 조각만 더한다.
      const registered = known ?? media;
      const mediaManifest = known ? content.mediaManifest : [...content.mediaManifest, media];
      if (mediaManifest.length > VIDEO_LIMITS.media) return fail('LIMIT_EXCEEDED', '영상 자료를 더 넣을 수 없어요.');
      if (content.clips.length + 1 > VIDEO_LIMITS.clips) return fail('LIMIT_EXCEEDED', '영상 조각을 더 넣을 수 없어요.');
      if (totalMs(content.clips) + registered.durationMs > VIDEO_LIMITS.totalMs) return fail('LIMIT_EXCEEDED', '작품이 너무 길어져요. 10분까지 만들 수 있어요.');
      const clip: Clip = { id: context.newId(), mediaId: registered.id, inMs: 0, outMs: registered.durationMs, muted: false };
      // 첫 영상이 작품의 방향과 프레임률을 정한다. 그 뒤로는 바꾸지 않는다.
      const first = content.clips.length === 0;
      const next: VideoProjectContent = { ...content, mediaManifest, clips: [...content.clips, clip], ...(first ? { orientation: orientationOf(registered), fps: normalizeFps(registered.fps) } : {}) };
      return finish(next, clipFocus(clip.id), catalog);
    }
    case 'splitClip': {
      const index = clipIndex(command.clipId);
      if (index < 0) return noClip();
      const clip = content.clips[index];
      if (!Number.isInteger(command.atMs) || command.atMs < clip.inMs + VIDEO_LIMITS.splitMarginMs || command.atMs > clip.outMs - VIDEO_LIMITS.splitMarginMs) return invalid('여기서는 자를 수 없어요. 조각 끝에서 조금 떨어진 곳을 골라 주세요.');
      if (content.clips.length + 1 > VIDEO_LIMITS.clips) return fail('LIMIT_EXCEEDED', '영상 조각을 더 넣을 수 없어요.');
      const back: Clip = { ...clip, id: context.newId(), inMs: command.atMs };
      const clips = [...content.clips]; clips.splice(index, 1, { ...clip, outMs: command.atMs }, back);
      return withClips(content, clips, clipFocus(clip.id), catalog, new Map([[back.id, clip.id]]));
    }
    case 'trimClip': {
      const index = clipIndex(command.clipId);
      if (index < 0) return noClip();
      const clip = content.clips[index];
      if (clip.inMs === command.inMs && clip.outMs === command.outMs) return unchanged(content, clipFocus(clip.id));
      if (totalMs(content.clips) - clipLength(clip) + clipLength({ ...clip, inMs: command.inMs, outMs: command.outMs }) > VIDEO_LIMITS.totalMs) return fail('LIMIT_EXCEEDED', '작품이 너무 길어져요. 10분까지 만들 수 있어요.');
      const clips = content.clips.map(item => item === clip ? { ...clip, inMs: command.inMs, outMs: command.outMs } : item);
      return withClips(content, clips, clipFocus(clip.id), catalog);
    }
    case 'deleteClip': {
      const index = clipIndex(command.clipId);
      if (index < 0) return noClip();
      return withClips(content, content.clips.filter(clip => clip.id !== command.clipId), null, catalog);
    }
    case 'reorderClip': {
      const index = clipIndex(command.clipId);
      if (index < 0) return noClip();
      if (!validIndex(command.toIndex, content.clips.length)) return invalid('옮길 위치가 올바르지 않아요.');
      if (index === command.toIndex) return unchanged(content, clipFocus(command.clipId));
      return withClips(content, move(content.clips, index, command.toIndex), clipFocus(command.clipId), catalog);
    }
    case 'setClipMuted': {
      const index = clipIndex(command.clipId);
      if (index < 0) return noClip();
      const clip = content.clips[index];
      if (typeof command.muted !== 'boolean') return invalid('조각 소리 값이 올바르지 않아요.');
      if (clip.muted === command.muted) return unchanged(content, clipFocus(clip.id));
      return finish({ ...content, clips: content.clips.map(item => item === clip ? { ...clip, muted: command.muted } : item) }, clipFocus(clip.id), catalog);
    }
    case 'setClipSpeed': {
      const index = clipIndex(command.clipId);
      if (index < 0) return noClip();
      const clip = content.clips[index];
      if (!CLIP_SPEEDS.includes(command.speed)) return invalid('조각 빠르기 값이 올바르지 않아요.');
      if ((clip.speed ?? 1) === command.speed) return unchanged(content, clipFocus(clip.id));
      // 1배는 speed를 저장하지 않는다(계약 §2).
      const { speed: _old, ...rest } = clip;
      const next: Clip = command.speed === 1 ? rest : { ...rest, speed: command.speed };
      if (totalMs(content.clips) - clipLength(clip) + clipLength(next) > VIDEO_LIMITS.totalMs) return fail('LIMIT_EXCEEDED', '작품이 너무 길어져요. 10분까지 만들 수 있어요.');
      return withClips(content, content.clips.map(item => item === clip ? next : item), clipFocus(clip.id), catalog);
    }
    case 'addCaption': {
      if (!content.clips.length) return invalid('영상을 먼저 넣어 주세요.');
      const text = normalizeText(String(command.text ?? ''));
      if (isBlankText(text)) return invalid('빈 자막은 저장할 수 없어요.');
      if (content.overlays.length + 1 > VIDEO_LIMITS.overlays) return fail('LIMIT_EXCEEDED', '자막·밈을 더 넣을 수 없어요.');
      const overlay: CaptionOverlay = { id: context.newId(), type: 'caption', startMs: command.startMs, durationMs: command.durationMs, x: command.x, y: command.y, width: command.width, text,
        fontId: command.fontId, fontSize: command.fontSize, bold: command.bold, color: normalizeColor(command.color), align: command.align, lineHeight: command.lineHeight, backdrop: command.backdrop };
      return finish({ ...content, overlays: [...content.overlays, overlay] }, overlayFocus(overlay.id), catalog);
    }
    case 'updateCaption': {
      const overlay = findOverlay(command.overlayId);
      if (!overlay) return noOverlay();
      if (overlay.type !== 'caption') return invalid('자막이 아니에요.');
      const { type: _type, overlayId: _overlayId, ...patch } = command;
      if (patch.text !== undefined) {
        patch.text = normalizeText(String(patch.text));
        // 내용을 모두 지우면 같은 작업에서 자막을 삭제해 취소 한 번으로 되돌린다(계약 §3).
        if (isBlankText(patch.text)) return finish({ ...content, overlays: content.overlays.filter(item => item !== overlay) }, null, catalog);
      }
      if (patch.color !== undefined) patch.color = normalizeColor(patch.color);
      return patchOverlay(content, overlay, patch as Partial<CaptionOverlay>, catalog);
    }
    case 'addMeme': {
      if (!content.clips.length) return invalid('영상을 먼저 넣어 주세요.');
      if (content.overlays.length + 1 > VIDEO_LIMITS.overlays) return fail('LIMIT_EXCEEDED', '자막·밈을 더 넣을 수 없어요.');
      const overlay: MemeOverlay = { id: context.newId(), type: 'meme', startMs: command.startMs, durationMs: command.durationMs, x: command.x, y: command.y, width: command.width, height: command.height,
        memeId: command.memeId, memeKind: command.memeKind, soundOn: command.soundOn };
      return finish({ ...content, overlays: [...content.overlays, overlay] }, overlayFocus(overlay.id), catalog);
    }
    case 'setOverlayTime': {
      const overlay = findOverlay(command.overlayId);
      if (!overlay) return noOverlay();
      return patchOverlay(content, overlay, { startMs: command.startMs, durationMs: command.durationMs }, catalog);
    }
    case 'moveOverlay': {
      const overlay = findOverlay(command.overlayId);
      if (!overlay) return noOverlay();
      return patchOverlay(content, overlay, { x: command.x, y: command.y }, catalog);
    }
    case 'resizeOverlay': {
      const overlay = findOverlay(command.overlayId);
      if (!overlay) return noOverlay();
      if (overlay.type === 'caption') {
        if (command.height !== undefined) return invalid('자막은 높이를 정하지 않아요.');
        return patchOverlay(content, overlay, { x: command.x, y: command.y, width: command.width, fontSize: command.fontSize } as Partial<CaptionOverlay>, catalog);
      }
      if (command.fontSize !== undefined) return invalid('밈에는 글씨 크기가 없어요.');
      return patchOverlay(content, overlay, { x: command.x, y: command.y, width: command.width, height: command.height } as Partial<MemeOverlay>, catalog);
    }
    case 'reorderOverlay': {
      const index = content.overlays.findIndex(overlay => overlay.id === command.overlayId);
      if (index < 0) return noOverlay();
      if (!validIndex(command.toIndex, content.overlays.length)) return invalid('옮길 위치가 올바르지 않아요.');
      if (index === command.toIndex) return unchanged(content, overlayFocus(command.overlayId));
      return finish({ ...content, overlays: move(content.overlays, index, command.toIndex) }, overlayFocus(command.overlayId), catalog);
    }
    case 'duplicateOverlay': {
      const index = content.overlays.findIndex(overlay => overlay.id === command.overlayId);
      if (index < 0) return noOverlay();
      if (content.overlays.length + 1 > VIDEO_LIMITS.overlays) return fail('LIMIT_EXCEEDED', '자막·밈을 더 넣을 수 없어요.');
      const source = content.overlays[index];
      const copy = keepInside({ ...source, id: context.newId(), x: source.x + 20, y: source.y + 20 }, CANVAS[content.orientation]);
      // 뒤쪽이 앞에 그려지므로 원본 바로 앞은 배열의 다음 위치다.
      const overlays = [...content.overlays]; overlays.splice(index + 1, 0, copy);
      return finish({ ...content, overlays }, overlayFocus(copy.id), catalog);
    }
    case 'deleteOverlay': {
      if (!findOverlay(command.overlayId)) return noOverlay();
      return finish({ ...content, overlays: content.overlays.filter(overlay => overlay.id !== command.overlayId) }, null, catalog);
    }
    case 'setMemeSound': {
      const overlay = findOverlay(command.overlayId);
      if (!overlay) return noOverlay();
      if (overlay.type !== 'meme') return invalid('밈이 아니에요.');
      if (typeof command.soundOn !== 'boolean') return invalid('밈 소리 값이 올바르지 않아요.');
      return patchOverlay(content, overlay, { soundOn: command.soundOn }, catalog);
    }
    case 'setAudio': {
      const audio: AudioSettings = { ...content.audio };
      if (command.originalVolume !== undefined) audio.originalVolume = command.originalVolume;
      if (command.musicId !== undefined) audio.musicId = command.musicId;
      if (command.musicVolume !== undefined) audio.musicVolume = command.musicVolume;
      if (audio.originalVolume === content.audio.originalVolume && audio.musicId === content.audio.musicId && audio.musicVolume === content.audio.musicVolume) return unchanged(content, null);
      return finish({ ...content, audio }, null, catalog);
    }
    default: return invalid('알 수 없는 명령이에요.');
  }
}
