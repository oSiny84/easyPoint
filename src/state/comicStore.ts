// 만화 작품을 바꾸는 유일한 곳(만화 계약 §4). 공통 틀은 history.ts이고 슬라이드 store.ts와 같은 규칙을 쓴다.
// 결과 형태(DispatchResult)와 메서드 모양이 슬라이드 저장소와 같아 편집 화면(Editor)에 그대로 넘길 수 있다.
import { applyComicCommand, type ComicCommand } from '../commands/comicApply';
import type { ComicContent, ComicProject } from '../domain/comicTypes';
import { LIMITS } from '../domain/limits';
import { createHistoryStore, type HistoryResult } from './history';
import { estimateBytes, nearestSlide, type DispatchResult, type StoreOptions } from './store';

export const comicContentOf = ({ title, slides, assetManifest, layout, bubbles }: ComicContent): ComicContent => ({ title, slides, assetManifest, layout, bubbles });

// 슬라이드 추정식에 bubbles 객체마다 16바이트 + 짝 수 × 96바이트를 더한다. 여러 기록이 같은 객체를 가리키면 한 번만 센다.
export function estimateComicBytes(contents: readonly ComicContent[]) {
  const seen = new WeakSet<object>(); let bytes = estimateBytes(contents);
  for (const content of contents) {
    if (seen.has(content.bubbles)) continue;
    seen.add(content.bubbles); bytes += 16 + Object.keys(content.bubbles).length * 96;
  }
  return bytes;
}

const toResult = (result: HistoryResult<string | null, never>): DispatchResult => result.ok ? { ok: true, revision: result.revision, slideId: result.focus, changed: result.changed } : result;

export function createComicStore(initial: ComicProject, options: StoreOptions = {}) {
  const store = createHistoryStore<ComicProject, ComicContent, ComicCommand, string | null, never>(initial, {
    contentOf: comicContentOf,
    apply(content, command, newId) {
      const result = applyComicCommand(content, command, { newId });
      return result.ok ? { ok: true, content: result.content, focus: result.slideId, changed: result.changed } : result;
    },
    estimate: estimateComicBytes,
    // 칸을 지운 명령은 지운 칸을 기억해 되돌릴 때 그 칸으로 간다(슬라이드와 같다).
    remember: (command, slideId) => command.type === 'deleteSlide' ? command.slideId : slideId,
    restore: (slideId, from, to) => nearestSlide(slideId, from.slides, to.slides),
    empty: null,
  }, { newId: options.newId, now: options.now, readOnly: options.readOnly, maxEntries: options.maxEntries ?? LIMITS.undoEntries, maxBytes: options.maxBytes ?? LIMITS.undoBytes });

  return {
    ...store,
    dispatch: (projectId: string, expectedRevision: number, command: ComicCommand) => toResult(store.dispatch(projectId, expectedRevision, command)),
    undo: () => toResult(store.undo()),
    redo: () => toResult(store.redo()),
  };
}

export type ComicStore = ReturnType<typeof createComicStore>;
