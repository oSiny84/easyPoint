// 영상 작품을 바꾸는 유일한 곳(영상 계약 §4). 공통 틀은 history.ts이고 슬라이드 store.ts와 같은 규칙을 쓴다.
import { applyVideoCommand, type VideoCommand } from '../commands/videoApply';
import type { Failure } from '../domain/types';
import { VIDEO_LIMITS } from '../domain/videoLimits';
import type { BuiltinCatalog, VideoFocus, VideoProject, VideoProjectContent } from '../domain/videoTypes';
import { createHistoryStore, type HistoryResult } from './history';

export type VideoDispatchResult = { ok: true; revision: number; focus: VideoFocus; changed: boolean; adjustedOverlays?: number } | Failure;

export const videoContentOf = ({ title, orientation, fps, clips, overlays, audio, mediaManifest }: VideoProjectContent): VideoProjectContent => ({ title, orientation, fps, clips, overlays, audio, mediaManifest });

// 조각당 64바이트, 겹침 요소당 128바이트 + 글자 수 × 2, Media당 160바이트(계약 §4). 공유된 부분은 한 번만 센다.
export function estimateVideoBytes(contents: readonly VideoProjectContent[]) {
  const seen = new WeakSet<object>(); let bytes = 0;
  const array = (items: readonly object[], each: (item: never) => number) => {
    if (seen.has(items)) return;
    seen.add(items); bytes += 16 + items.length * 8;
    for (const item of items) { if (seen.has(item)) continue; seen.add(item); bytes += each(item as never); }
  };
  for (const content of contents) {
    array(content.clips, () => 64);
    array(content.overlays, (overlay: VideoProjectContent['overlays'][number]) => 128 + (overlay.type === 'caption' ? overlay.text.length * 2 : 0));
    array(content.mediaManifest, () => 160);
  }
  return bytes;
}

function exists(focus: VideoFocus, content: VideoProjectContent) {
  if (!focus) return false;
  return focus.kind === 'clip' ? content.clips.some(clip => clip.id === focus.id) : content.overlays.some(overlay => overlay.id === focus.id);
}

export type VideoStoreOptions = { newId?: () => string; now?: () => string; readOnly?: boolean; catalog: BuiltinCatalog; maxEntries?: number; maxBytes?: number };

export function createVideoStore(initial: VideoProject, options: VideoStoreOptions) {
  const store = createHistoryStore<VideoProject, VideoProjectContent, VideoCommand, VideoFocus, number>(initial, {
    contentOf: videoContentOf,
    apply(content, command, newId) {
      const result = applyVideoCommand(content, command, { newId, catalog: options.catalog });
      if (!result.ok) return result;
      return { ok: true, content: result.content, focus: result.focus, changed: result.changed, ...(result.adjustedOverlays ? { extra: result.adjustedOverlays } : {}) };
    },
    estimate: estimateVideoBytes,
    // 지운 요소를 기억해 되돌리면 그 요소를 다시 선택하게 한다.
    remember: (command, focus) => command.type === 'deleteClip' ? { kind: 'clip', id: command.clipId } : command.type === 'deleteOverlay' ? { kind: 'overlay', id: command.overlayId } : focus,
    // 요소가 없어졌으면 선택을 해제한다(재생 막대는 UI가 그대로 둔다).
    restore: (focus, _from, to) => exists(focus, to) ? focus : null,
    empty: null,
  }, { newId: options.newId, now: options.now, readOnly: options.readOnly, maxEntries: options.maxEntries ?? VIDEO_LIMITS.undoEntries, maxBytes: options.maxBytes ?? VIDEO_LIMITS.undoBytes });

  const toResult = (result: HistoryResult<VideoFocus, number>): VideoDispatchResult => {
    if (!result.ok) return result;
    const { extra, ...rest } = result;
    return extra ? { ...rest, adjustedOverlays: extra } : rest;
  };
  return {
    ...store,
    dispatch: (projectId: string, expectedRevision: number, command: VideoCommand) => toResult(store.dispatch(projectId, expectedRevision, command)),
    undo: () => toResult(store.undo()),
    redo: () => toResult(store.redo()),
  };
}

export type VideoStore = ReturnType<typeof createVideoStore>;
