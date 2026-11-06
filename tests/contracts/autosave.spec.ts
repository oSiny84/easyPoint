import { test, expect } from '@playwright/test';
import { createAutosave, type SaveOutcome, type SaveState } from '../../src/state/autosave';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function harness(options: { initiallySaved?: boolean; delayMs?: number; maxWaitMs?: number; retryMs?: number } = {}) {
  let revision = 0;
  const states: SaveState[] = []; const saved: number[] = [];
  let behave: (rev: number) => Promise<SaveOutcome> = async rev => ({ ok: true, revision: rev });
  const saver = createAutosave({
    getRevision: () => revision, initiallySaved: options.initiallySaved ?? true, delayMs: options.delayMs ?? 30, maxWaitMs: options.maxWaitMs ?? 120, retryMs: options.retryMs ?? 60,
    onState: state => states.push(state),
    save: async () => { const rev = revision; const outcome = await behave(rev); if (outcome.ok) saved.push(outcome.revision); return outcome; },
  });
  return { saver, states, saved, change: () => { revision += 1; saver.notifyChange(); }, setBehave: (next: typeof behave) => { behave = next; }, revision: () => revision };
}

test('변경 후 예약 시간이 지나면 저장하고 저장됨이 된다', async () => {
  const h = harness();
  h.change();
  expect(h.saver.getState()).toBe('dirty');
  expect(h.saved).toEqual([]);
  await wait(80);
  expect(h.saved).toEqual([1]);
  expect(h.saver.getState()).toBe('saved');
  h.saver.dispose();
});

test('바뀌지 않으면 저장하지 않는다', async () => {
  const h = harness();
  await wait(60);
  expect(h.saved).toEqual([]);
  h.saver.dispose();
});

test('연속 편집은 묶어서 저장하되 최대 대기 시간을 넘기지 않는다', async () => {
  const h = harness({ delayMs: 40, maxWaitMs: 100 });
  const start = Date.now();
  while (Date.now() - start < 260) { h.change(); await wait(10); }
  // 예약이 계속 밀려도 최대 대기 시간마다 저장한다. 매 변경마다 저장하지는 않는다.
  expect(h.saved.length).toBeGreaterThanOrEqual(2);
  expect(h.saved.length).toBeLessThan(h.revision() / 2);
  await wait(120);
  expect(h.saved.at(-1)).toBe(h.revision());
  expect(h.saver.getState()).toBe('saved');
  h.saver.dispose();
});

test('저장 중 다시 바뀌면 저장됨으로 표시하지 않고 다시 저장한다', async () => {
  const h = harness({ delayMs: 10 });
  let release = () => undefined as void;
  h.setBehave(rev => new Promise(resolve => { release = () => resolve({ ok: true, revision: rev }); }));
  h.change();
  await wait(30);
  expect(h.saver.getState()).toBe('saving');
  h.change();
  release();
  await wait(5);
  // 첫 저장이 끝났지만 지금 내용은 더 새롭다.
  expect(h.saved).toEqual([1]);
  expect(h.saver.getState()).not.toBe('saved');
  h.setBehave(async rev => ({ ok: true, revision: rev }));
  await wait(40);
  expect(h.saved).toEqual([1, 2]);
  expect(h.saver.getState()).toBe('saved');
  h.saver.dispose();
});

test('저장은 겹치지 않고 순서대로 한다. 늦게 끝난 저장이 새 내용을 덮을 수 없다', async () => {
  const h = harness({ delayMs: 5 });
  let running = 0, most = 0; const order: number[] = [];
  h.setBehave(async rev => { running += 1; most = Math.max(most, running); await wait(30); order.push(rev); running -= 1; return { ok: true, revision: rev }; });
  h.change(); await wait(12); h.change(); await wait(12); h.change();
  await wait(150);
  expect(most).toBe(1);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(order.at(-1)).toBe(h.revision());
  h.saver.dispose();
});

test('실패하면 저장 실패가 되고, 다시 시도해 성공하면 저장됨이 된다', async () => {
  const h = harness({ retryMs: 40 });
  let fail = true;
  h.setBehave(async rev => fail ? { ok: false, message: '실패' } : { ok: true, revision: rev });
  h.change();
  await wait(60);
  expect(h.saver.getState()).toBe('failed');
  expect(h.saved).toEqual([]);
  fail = false;
  await wait(80);
  expect(h.saver.getState()).toBe('saved');
  h.saver.dispose();
});

test('flush는 지금 내용까지 저장하고 결과를 돌려준다', async () => {
  const h = harness({ delayMs: 1000 });
  h.change();
  expect(await h.saver.flush()).toBe(true);
  expect(h.saved).toEqual([1]);
  h.setBehave(async () => ({ ok: false, message: '실패' }));
  h.change();
  expect(await h.saver.flush()).toBe(false);
  expect(h.saver.getState()).toBe('failed');
  h.saver.dispose();
});

test('처음부터 저장 안 된 작품(열어 온 파일)은 바로 저장한다', async () => {
  const h = harness({ initiallySaved: false });
  await wait(20);
  expect(h.saved).toEqual([0]);
  expect(h.saver.getState()).toBe('saved');
  h.saver.dispose();
});

test('닫은 뒤에는 저장하지 않는다', async () => {
  const h = harness();
  h.change(); h.saver.dispose();
  await wait(60);
  expect(h.saved).toEqual([]);
});
