// 문서를 바꾸는 유일한 곳의 공통 틀(슬라이드 계약 §4, 영상 계약 §4). 문서 종류마다 내용 추출·명령 적용·메모리 추정·focus 계산만 다르다.
// 화면·저장·출력은 getProject()가 돌려주는 변경 불가능한 값을 읽기만 한다.
import { fail, type Failure } from '../domain/types';

export type Applied<C, F, X> = { ok: true; content: C; focus: F; changed: boolean; extra?: X };
export type HistoryResult<F, X> = { ok: true; revision: number; focus: F; changed: boolean; extra?: X } | Failure;

export type HistoryAdapter<P, C, Cmd, F, X> = {
  // 되돌리기가 복원하는 내용만 고른다. revision·updatedAt은 내용과 분리한다.
  contentOf: (project: P) => C;
  apply: (content: C, command: Cmd, newId: () => string) => Applied<C, F, X> | Failure;
  // 기록이 잡아 두는 메모리 추정. 구조 공유로 같은 객체를 여러 기록이 가리켜도 한 번만 센다.
  estimate: (contents: readonly C[]) => number;
  // 기록에 남길 focus(예: 지운 장은 지운 장 자체를 기억한다).
  remember: (command: Cmd, resultFocus: F) => F;
  // 기록을 적용한 뒤 돌려줄 focus. from은 적용 전, to는 적용 후 내용이다.
  restore: (remembered: F, from: C, to: C) => F;
  empty: F;
};

export type HistoryOptions = { newId?: () => string; now?: () => string; readOnly?: boolean; maxEntries: number; maxBytes: number };
type Entry<C, F> = { before: C; after: C; focus: F };

const READ_ONLY = () => fail('READ_ONLY', '다른 곳에서 편집 중이라 읽기만 할 수 있어요.');

export function createHistoryStore<P extends { id: string; revision: number; updatedAt: string }, C extends object, Cmd, F, X>(initial: P, adapter: HistoryAdapter<P, C, Cmd, F, X>, options: HistoryOptions) {
  const newId = options.newId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date().toISOString());
  let project = initial;
  let undoStack: Entry<C, F>[] = [], redoStack: Entry<C, F>[] = [];
  let historyBytes = 0;
  const listeners = new Set<() => void>();

  function commit(content: C) {
    // 되돌리기도 새 번호를 받는다. 예전 번호를 다시 쓰면 늦게 끝난 저장이 최신 내용으로 표시된다.
    project = { ...project, ...content, revision: project.revision + 1, updatedAt: now() };
    listeners.forEach(listener => listener());
  }
  const retained = () => undoStack.flatMap(entry => [entry.before, entry.after]).concat(redoStack.flatMap(entry => [entry.before, entry.after]));

  function trimHistory() {
    while (undoStack.length > options.maxEntries) undoStack.shift();
    historyBytes = adapter.estimate(retained());
    while (historyBytes > options.maxBytes && undoStack.length > 1) { undoStack.shift(); historyBytes = adapter.estimate(retained()); }
  }

  return {
    getProject: () => project,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    historySize: () => ({ undo: undoStack.length, redo: redoStack.length, bytes: historyBytes }),

    dispatch(projectId: string, expectedRevision: number, command: Cmd): HistoryResult<F, X> {
      if (options.readOnly) return READ_ONLY();
      if (projectId !== project.id || expectedRevision !== project.revision) return fail('REVISION_CONFLICT', '작품이 이미 바뀌었어요. 다시 시도해 주세요.');
      const before = adapter.contentOf(project);
      const result = adapter.apply(before, command, newId);
      if (!result.ok) return result;
      const extra = result.extra === undefined ? {} : { extra: result.extra };
      if (!result.changed) return { ok: true, revision: project.revision, focus: result.focus, changed: false, ...extra };
      undoStack.push({ before, after: result.content, focus: adapter.remember(command, result.focus) });
      redoStack = [];
      commit(result.content);
      trimHistory();
      return { ok: true, revision: project.revision, focus: result.focus, changed: true, ...extra };
    },

    undo(): HistoryResult<F, X> {
      if (options.readOnly) return READ_ONLY();
      const entry = undoStack.pop();
      if (!entry) return { ok: true, revision: project.revision, focus: adapter.empty, changed: false };
      redoStack.push(entry); commit(entry.before);
      return { ok: true, revision: project.revision, focus: adapter.restore(entry.focus, entry.after, entry.before), changed: true };
    },

    redo(): HistoryResult<F, X> {
      if (options.readOnly) return READ_ONLY();
      const entry = redoStack.pop();
      if (!entry) return { ok: true, revision: project.revision, focus: adapter.empty, changed: false };
      undoStack.push(entry); commit(entry.after);
      return { ok: true, revision: project.revision, focus: adapter.restore(entry.focus, entry.before, entry.after), changed: true };
    },
  };
}
