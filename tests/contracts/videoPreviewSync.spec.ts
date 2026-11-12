import { test, expect } from '@playwright/test';
import { DRIFT_MS, newSync, START_TIMEOUT_MS, trackSync, type SyncState } from '../../src/video/previewSync';

// 미리보기 <video>와 재생 시계의 어긋남 판단(영상 계약 §8, 2026-11-10). 화면 없이 계산만 확인한다.
// <video>를 흉내 낸다: 시작하고 startDelay(ms) 동안 멈춰 있다가 rate배로 나아간다. 시계는 처음부터 speed배로 나아간다.
function run(speed: number, startDelay: number, rate = speed, until = 3000) {
  const from = 600;
  let sync: SyncState = newSync(0);
  const results: string[] = [];
  let reseeks = 0;
  let videoMs = from, last = 0;
  for (let now = 16; now <= until; now += 16) {
    const wanted = from + now * speed;
    if (now - last > startDelay) videoMs += 16 * rate;
    const result = trackSync(sync, now, videoMs, wanted, speed);
    results.push(result);
    if (result === 'reseek') { reseeks++; videoMs = wanted; last = now; sync = newSync(now); }
  }
  return { results, reseeks };
}

test('시작 지연은 어긋남으로 세지 않는다: 2배·4배 조각에서 0.1초 늦게 시작해도 위치를 다시 맞추지 않는다', () => {
  // 고치기 전에는 원본 시간으로 재서 0.1초 지연이 2배 조각에서 200ms, 4배 조각에서 400ms로 보였고 150ms를 넘어 다시 맞췄다.
  for (const speed of [0.5, 1, 1.5, 2, 4]) expect(run(speed, 100).reseeks, `${speed}배`).toBe(0);
});

test('소리가 늦게 나가는 장치처럼 시작이 0.35초 늦어도 다시 맞추지 않는다(다시 맞춰도 같은 지연이 또 생긴다)', () => {
  for (const speed of [1, 2, 4]) {
    const { results, reseeks } = run(speed, 350);
    expect(reseeks, `${speed}배`).toBe(0);
    expect(results.at(-1)).toBe('ok');
  }
});

test('시작한 뒤 기준에서 150ms 넘게 벗어나면 다시 맞추고, 다시 맞춘 뒤에는 되풀이하지 않는다', () => {
  // 처음 2초는 제 빠르기로, 그 뒤로는 절반 빠르기로 나아가는 <video>.
  let sync = newSync(0);
  let videoMs = 0; const reseekAt: number[] = [];
  for (let now = 16; now <= 4000; now += 16) {
    videoMs += now < 2000 || reseekAt.length ? 16 : 8;
    if (trackSync(sync, now, videoMs, now, 1) === 'reseek') { reseekAt.push(now); videoMs = now; sync = newSync(now); }
  }
  expect(reseekAt).toHaveLength(1);
  // 절반 빠르기로 150ms 벗어나려면 300ms가 걸린다.
  expect(reseekAt[0]).toBeGreaterThan(2000 + DRIFT_MS * 2 - 32);
  expect(reseekAt[0]).toBeLessThan(2000 + DRIFT_MS * 2 + 64);
});

test('앞서 나간 것도 어긋남이다', () => {
  const sync = newSync(0);
  expect(trackSync(sync, 0, 0, 0, 1)).toBe('starting');
  expect(trackSync(sync, 100, 100, 100, 1)).toBe('ok');
  expect(trackSync(sync, 200, 200 + DRIFT_MS + 1, 200, 1)).toBe('reseek');
});

test('2초가 지나도록 시작하지 못하면 다시 맞춰 본다', () => {
  const sync = newSync(0);
  expect(trackSync(sync, START_TIMEOUT_MS, 600, 600 + START_TIMEOUT_MS, 1)).toBe('starting');
  expect(trackSync(sync, START_TIMEOUT_MS + 16, 600, 600 + START_TIMEOUT_MS + 16, 1)).toBe('reseek');
});
