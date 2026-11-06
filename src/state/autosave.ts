// 자동 저장 시점과 상태(계약 §6). 변경 후 1초 예약, 연속 편집 중에도 최대 5초 간격으로 저장한다.
// 저장은 한 번에 하나씩 순서대로 하므로 늦게 끝난 저장이 새 내용을 덮어쓰지 않는다.
// "저장됨"은 지금 문서의 revision이 저장을 마쳤을 때만 표시한다. DOM에 의존하지 않는다.
export type SaveState = 'saved' | 'dirty' | 'saving' | 'failed';
export type SaveOutcome = { ok: true; revision: number } | { ok: false; message: string };
type Options = {
  getRevision: () => number; save: () => Promise<SaveOutcome>; onState: (state: SaveState, message?: string) => void;
  initiallySaved: boolean; delayMs?: number; maxWaitMs?: number; retryMs?: number;
};

export function createAutosave({ getRevision, save, onState, initiallySaved, delayMs = 1000, maxWaitMs = 5000, retryMs = 10000 }: Options) {
  let savedRevision: number | null = initiallySaved ? getRevision() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstDirtyAt: number | null = null;
  let running: Promise<boolean> | null = null;
  let disposed = false;
  let state: SaveState = initiallySaved ? 'saved' : 'dirty';

  const setState = (next: SaveState, message?: string) => { state = next; onState(next, message); };
  const clear = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };

  function schedule(wait: number) {
    clear();
    if (!disposed) timer = setTimeout(() => { timer = null; void run(); }, wait);
  }

  function run(): Promise<boolean> {
    if (running) return running;
    clear();
    const startedRevision = getRevision();
    if (savedRevision === startedRevision) { firstDirtyAt = null; setState('saved'); return Promise.resolve(true); }
    setState('saving');
    running = save().then(outcome => {
      running = null;
      if (!outcome.ok) { setState('failed', outcome.message); schedule(retryMs); return false; }
      savedRevision = outcome.revision;
      if (getRevision() === savedRevision) { firstDirtyAt = null; setState('saved'); return true; }
      // 저장하는 사이에 또 바뀌었다. 저장됨으로 표시하지 않고 다시 예약한다.
      firstDirtyAt = Date.now(); setState('dirty'); schedule(delayMs);
      return false;
    }, () => { running = null; setState('failed', '저장하지 못했어요.'); schedule(retryMs); return false; });
    return running;
  }

  if (!initiallySaved) schedule(0);

  return {
    getState: () => state,
    // 문서가 바뀌면 부른다.
    notifyChange() {
      if (disposed) return;
      if (savedRevision === getRevision()) return;
      const now = Date.now();
      firstDirtyAt ??= now;
      if (!running) setState('dirty');
      schedule(Math.max(0, Math.min(delayMs, firstDirtyAt + maxWaitMs - now)));
    },
    // 지금 내용까지 저장을 끝낸다. 저장에 성공했는지 돌려준다.
    async flush(): Promise<boolean> {
      for (let attempt = 0; attempt < 5; attempt++) {
        const ok = await run();
        if (!ok && state === 'failed') return false;
        if (savedRevision === getRevision()) { clear(); return true; }
      }
      return false;
    },
    dispose() { disposed = true; clear(); },
  };
}
export type Autosave = ReturnType<typeof createAutosave>;
