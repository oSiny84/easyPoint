// 슬라이드 작품을 바꾸는 유일한 곳. 화면·저장·출력은 getProject()가 돌려주는 변경 불가능한 값을 읽기만 한다.
// 기록·revision·잠금 규칙은 공통 틀(history.ts)에 있고, 여기서는 슬라이드 문서에 맞는 내용 추출·메모리 추정·장 선택만 정한다.
import { applyCommand, type Command } from '../commands/apply';
import { LIMITS } from '../domain/limits';
import type { Failure, Project, ProjectContent, Slide } from '../domain/types';
import { createHistoryStore, type HistoryResult } from './history';

export type DispatchResult = { ok: true; revision: number; slideId: string | null; changed: boolean } | Failure;

const contentOf = ({ title, slides, assetManifest }: ProjectContent): ProjectContent => ({ title, slides, assetManifest });

// 기록이 잡아 두는 메모리를 추정한다. 구조 공유로 같은 객체를 여러 기록이 가리켜도 한 번만 센다. 사진 Blob은 문서 밖이라 포함하지 않는다.
export function estimateBytes(contents: readonly ProjectContent[]) {
  const seen = new WeakSet<object>(); let bytes = 0;
  for (const content of contents) {
    if (!seen.has(content.slides)) { seen.add(content.slides); bytes += 16 + content.slides.length * 8; }
    for (const slide of content.slides) {
      if (seen.has(slide)) continue;
      seen.add(slide); bytes += 64;
      if (seen.has(slide.elements)) continue;
      seen.add(slide.elements); bytes += 16 + slide.elements.length * 8;
      for (const element of slide.elements) {
        if (seen.has(element)) continue;
        seen.add(element); bytes += 96;
        if (element.type === 'text') bytes += element.text.length * 2;
        if (element.type === 'stroke' && !seen.has(element.points)) { seen.add(element.points); bytes += 16 + element.points.length * 8; }
      }
    }
  }
  return bytes;
}

// 기록을 적용한 뒤 보여 줄 장. 그 장이 없어졌으면 이전 순서에서 가장 가까운 남은 장을 고른다.
export function nearestSlide(wanted: string | null, from: readonly Slide[], to: readonly Slide[]): string | null {
  if (wanted === null) return null;
  if (to.some(slide => slide.id === wanted)) return wanted;
  const index = from.findIndex(slide => slide.id === wanted);
  return to[Math.min(Math.max(index, 0), to.length - 1)].id;
}

export type StoreOptions = { newId?: () => string; now?: () => string; readOnly?: boolean; maxEntries?: number; maxBytes?: number };

const toResult = (result: HistoryResult<string | null, never>): DispatchResult => result.ok ? { ok: true, revision: result.revision, slideId: result.focus, changed: result.changed } : result;

export function createStore(initial: Project, options: StoreOptions = {}) {
  const store = createHistoryStore<Project, ProjectContent, Command, string | null, never>(initial, {
    contentOf,
    apply(content, command, newId) {
      const result = applyCommand(content, command, { newId });
      return result.ok ? { ok: true, content: result.content, focus: result.slideId, changed: result.changed } : result;
    },
    estimate: estimateBytes,
    // 슬라이드를 지운 명령은 지운 장을 기억해 되돌릴 때 그 장으로 간다.
    remember: (command, slideId) => command.type === 'deleteSlide' ? command.slideId : slideId,
    restore: (slideId, from, to) => nearestSlide(slideId, from.slides, to.slides),
    empty: null,
  }, { newId: options.newId, now: options.now, readOnly: options.readOnly, maxEntries: options.maxEntries ?? LIMITS.undoEntries, maxBytes: options.maxBytes ?? LIMITS.undoBytes });

  return {
    ...store,
    dispatch: (projectId: string, expectedRevision: number, command: Command) => toResult(store.dispatch(projectId, expectedRevision, command)),
    undo: () => toResult(store.undo()),
    redo: () => toResult(store.redo()),
  };
}

export type ProjectStore = ReturnType<typeof createStore>;
