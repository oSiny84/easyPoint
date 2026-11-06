// 문서를 바꾸는 유일한 곳. 화면·저장·출력은 getProject()가 돌려주는 변경 불가능한 값을 읽기만 한다.
import { applyCommand, type Command } from '../commands/apply';
import { LIMITS } from '../domain/limits';
import { fail, type Failure, type Project, type ProjectContent, type Slide } from '../domain/types';

export type DispatchResult = { ok: true; revision: number; slideId: string | null; changed: boolean } | Failure;
type HistoryEntry = { before: ProjectContent; after: ProjectContent; slideId: string | null };

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
function nearestSlide(wanted: string | null, from: readonly Slide[], to: readonly Slide[]): string | null {
  if (wanted === null) return null;
  if (to.some(slide => slide.id === wanted)) return wanted;
  const index = from.findIndex(slide => slide.id === wanted);
  return to[Math.min(Math.max(index, 0), to.length - 1)].id;
}

export type StoreOptions = { newId?: () => string; now?: () => string; readOnly?: boolean; maxEntries?: number; maxBytes?: number };

export function createStore(initial: Project, options: StoreOptions = {}) {
  const newId = options.newId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date().toISOString());
  const maxEntries = options.maxEntries ?? LIMITS.undoEntries, maxBytes = options.maxBytes ?? LIMITS.undoBytes;
  let project = initial;
  let undoStack: HistoryEntry[] = [], redoStack: HistoryEntry[] = [];
  let historyBytes = 0;
  const listeners = new Set<() => void>();

  function commit(content: ProjectContent) {
    // 되돌리기도 새 번호를 받는다. 예전 번호를 다시 쓰면 늦게 끝난 저장이 최신 내용으로 표시된다.
    project = { ...project, ...contentOf(content), revision: project.revision + 1, updatedAt: now() };
    listeners.forEach(listener => listener());
  }
  const retained = () => undoStack.flatMap(entry => [entry.before, entry.after]).concat(redoStack.flatMap(entry => [entry.before, entry.after]));

  function trimHistory() {
    while (undoStack.length > maxEntries) undoStack.shift();
    historyBytes = estimateBytes(retained());
    while (historyBytes > maxBytes && undoStack.length > 1) { undoStack.shift(); historyBytes = estimateBytes(retained()); }
  }

  return {
    getProject: () => project,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    historySize: () => ({ undo: undoStack.length, redo: redoStack.length, bytes: historyBytes }),

    dispatch(projectId: string, expectedRevision: number, command: Command): DispatchResult {
      if (options.readOnly) return fail('READ_ONLY', '다른 곳에서 편집 중이라 읽기만 할 수 있어요.');
      if (projectId !== project.id || expectedRevision !== project.revision) return fail('REVISION_CONFLICT', '작품이 이미 바뀌었어요. 다시 시도해 주세요.');
      const before = contentOf(project);
      const result = applyCommand(before, command, { newId });
      if (!result.ok) return result;
      if (!result.changed) return { ok: true, revision: project.revision, slideId: result.slideId, changed: false };
      undoStack.push({ before, after: result.content, slideId: touchedSlide(command, result.slideId) });
      redoStack = [];
      commit(result.content);
      trimHistory();
      return { ok: true, revision: project.revision, slideId: result.slideId, changed: true };
    },

    undo(): DispatchResult {
      if (options.readOnly) return fail('READ_ONLY', '다른 곳에서 편집 중이라 읽기만 할 수 있어요.');
      const entry = undoStack.pop();
      if (!entry) return { ok: true, revision: project.revision, slideId: null, changed: false };
      redoStack.push(entry); commit(entry.before);
      return { ok: true, revision: project.revision, slideId: nearestSlide(entry.slideId, entry.after.slides, entry.before.slides), changed: true };
    },

    redo(): DispatchResult {
      if (options.readOnly) return fail('READ_ONLY', '다른 곳에서 편집 중이라 읽기만 할 수 있어요.');
      const entry = redoStack.pop();
      if (!entry) return { ok: true, revision: project.revision, slideId: null, changed: false };
      undoStack.push(entry); commit(entry.after);
      return { ok: true, revision: project.revision, slideId: nearestSlide(entry.slideId, entry.before.slides, entry.after.slides), changed: true };
    },
  };
}

export type ProjectStore = ReturnType<typeof createStore>;

// 기록에 남길 장. 슬라이드를 지운 명령은 지운 장을 기억해 되돌릴 때 그 장으로 간다.
function touchedSlide(command: Command, resultSlideId: string | null): string | null {
  if (command.type === 'deleteSlide') return command.slideId;
  return resultSlideId;
}
