// 애니메이션 작품을 바꾸는 유일한 곳(애니메이션 계약 §4). 공통 틀은 history.ts이고 슬라이드 store.ts와 같은 규칙을 쓴다.
// 결과 형태(DispatchResult)와 메서드 모양이 슬라이드 저장소와 같아 편집 화면(Editor)에 그대로 넘길 수 있다.
import { applyAnimationCommand, type AnimationCommand } from '../commands/animationApply';
import type { AnimationContent, AnimationProject } from '../domain/animationTypes';
import { LIMITS } from '../domain/limits';
import { createHistoryStore, type HistoryResult } from './history';
import { estimateBytes, nearestSlide, type DispatchResult, type StoreOptions } from './store';

export const animationContentOf = ({ title, slides, assetManifest, fps, musicId, musicVolume, holds }: AnimationContent): AnimationContent => ({ title, slides, assetManifest, fps, musicId, musicVolume, holds });

// 슬라이드 추정식에 holds 객체마다 16바이트 + 키 수 × 32바이트를 더한다. 여러 기록이 같은 객체를 가리키면 한 번만 센다.
export function estimateAnimationBytes(contents: readonly AnimationContent[]) {
  const seen = new WeakSet<object>(); let bytes = estimateBytes(contents);
  for (const content of contents) {
    if (seen.has(content.holds)) continue;
    seen.add(content.holds); bytes += 16 + Object.keys(content.holds).length * 32;
  }
  return bytes;
}

const toResult = (result: HistoryResult<string | null, never>): DispatchResult => result.ok ? { ok: true, revision: result.revision, slideId: result.focus, changed: result.changed } : result;

export function createAnimationStore(initial: AnimationProject, options: StoreOptions = {}) {
  const store = createHistoryStore<AnimationProject, AnimationContent, AnimationCommand, string | null, never>(initial, {
    contentOf: animationContentOf,
    apply(content, command, newId) {
      const result = applyAnimationCommand(content, command, { newId });
      return result.ok ? { ok: true, content: result.content, focus: result.slideId, changed: result.changed } : result;
    },
    estimate: estimateAnimationBytes,
    // 장을 지운 명령은 지운 장을 기억해 되돌릴 때 그 장으로 간다(슬라이드와 같다).
    remember: (command, slideId) => command.type === 'deleteSlide' ? command.slideId : slideId,
    restore: (slideId, from, to) => nearestSlide(slideId, from.slides, to.slides),
    empty: null,
  }, { newId: options.newId, now: options.now, readOnly: options.readOnly, maxEntries: options.maxEntries ?? LIMITS.undoEntries, maxBytes: options.maxBytes ?? LIMITS.undoBytes });

  return {
    ...store,
    dispatch: (projectId: string, expectedRevision: number, command: AnimationCommand) => toResult(store.dispatch(projectId, expectedRevision, command)),
    undo: () => toResult(store.undo()),
    redo: () => toResult(store.redo()),
  };
}

export type AnimationStore = ReturnType<typeof createAnimationStore>;
