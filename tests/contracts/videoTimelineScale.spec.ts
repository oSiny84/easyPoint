import { test, expect } from '@playwright/test';
import { clampZoom, stepOfZoom, tickStep, TRACK_MAX_PX, visibleTicks, zoomAtStep, zoomRange, ZOOM_STEPS } from '../../src/video/timelineScale';

// 타임라인 배율·눈금(긴 작품, 2026-11-10). 화면 없이 계산만 확인한다.
const MINUTE = 60_000, HOUR = 60 * MINUTE;

test('맞춤 배율: 긴 작품도 띠 너비에 들어가고, 짧은 작품의 범위(초당 5~200px)는 그대로다', () => {
  // 고치기 전에는 맞춤이 초당 5px 아래로 내려가지 않아 4분쯤 넘는 작품이 화면을 넘쳤다.
  for (const total of [5 * MINUTE, 10 * MINUTE, HOUR, 10 * HOUR, 99 * HOUR]) {
    const range = zoomRange(1000, total);
    expect(range.fit * (total / 1000) + 24).toBeLessThanOrEqual(1000);
    expect(range.min).toBe(range.fit);
  }
  expect(zoomRange(1000, 30_000)).toEqual({ min: 5, max: 200, fit: 952 / 30 });
  expect(zoomRange(1000, 2_000)).toEqual({ min: 5, max: 200, fit: 200 });
  expect(zoomRange(1000, 0)).toEqual({ min: 5, max: 200, fit: 200 });
});

test('가장 크게 키운 배율은 띠 너비가 상한을 넘지 않게 낮아진다(99시간이면 초당 약 45px)', () => {
  expect(zoomRange(1000, 10 * HOUR).max).toBe(200);
  const far = zoomRange(1000, 99 * HOUR);
  expect(far.max).toBeLessThan(50);
  expect(far.max * 99 * 3600).toBeLessThanOrEqual(TRACK_MAX_PX);
  expect(far.min).toBeLessThan(far.max);
});

test('배율 막대: 양 끝이 범위의 양 끝이고, 칸과 배율이 서로 되돌아오며, 범위 밖 배율은 범위 안으로 맞춘다', () => {
  const range = zoomRange(1000, HOUR);
  expect(zoomAtStep(0, range)).toBeCloseTo(range.min, 10);
  expect(zoomAtStep(ZOOM_STEPS, range)).toBeCloseTo(200, 10);
  for (const step of [0, 1, 37, 99, 100]) expect(stepOfZoom(zoomAtStep(step, range), range)).toBe(step);
  // 칸마다 같은 비율로 커진다.
  expect(zoomAtStep(51, range) / zoomAtStep(50, range)).toBeCloseTo(zoomAtStep(11, range) / zoomAtStep(10, range), 8);
  // 1시간 작품에서 고른 작은 배율은 작품이 짧아지면 초당 5px로 올라온다.
  expect(clampZoom(0.5, zoomRange(1000, 10_000))).toBe(5);
  expect(clampZoom(500, range)).toBe(200);
  expect(stepOfZoom(0.0001, range)).toBe(0);
});

test('눈금 간격: 짧은 작품은 처음 정한 경계 그대로, 긴 작품은 분·시간 단위까지 넓어진다', () => {
  expect([200, 40, 39, 15, 14, 5].map(pps => tickStep(pps, 5 * MINUTE))).toEqual([1, 1, 5, 5, 10, 10]);
  expect([4, 1.5, 0.5, 0.15].map(pps => tickStep(pps, 30 * MINUTE))).toEqual([30, 60, 300, 600]);
  // 1시간 작품을 1000px에 맞추면 5분 눈금, 10시간이면 1시간 눈금, 99시간이면 12시간 눈금이다.
  expect([HOUR, 10 * HOUR, 99 * HOUR].map(total => tickStep(zoomRange(1000, total).fit, total))).toEqual([300, 3600, 43_200]);
  // 1시간 이상은 글자가 길어 같은 배율에서도 한 단계 넓다.
  expect([tickStep(40, 59 * MINUTE), tickStep(40, HOUR)]).toEqual([1, 5]);
  // 간격 목록을 벗어나도 가장 넓은 간격을 돌려준다.
  expect(tickStep(0.00001, 99 * HOUR)).toBe(86_400);
});

test('그리는 눈금은 화면에 보이는 구간뿐이다: 10시간 작품을 끝까지 키워도 수십 개다', () => {
  const total = 10 * HOUR, pps = 200;
  // 전부 그리면 36,001개다.
  const start = visibleTicks(pps, total, 0, 1000, 12);
  expect(start[0]).toBe(0);
  expect(start.length).toBeLessThan(40);
  const middle = visibleTicks(pps, total, 5 * 3600 * pps, 1000, 12);
  expect(middle.length).toBeLessThan(40);
  expect(middle).toContain(5 * 3600);
  expect(middle).toContain(5 * 3600 + 5);
  // 끝에서는 작품 길이를 넘는 눈금을 그리지 않는다.
  const end = visibleTicks(pps, total, total / 1000 * pps - 500, 1000, 12);
  expect(end[end.length - 1]).toBe(10 * 3600);
  // 맞춤에서는 처음부터 끝까지 다 나온다(짧은 작품은 고치기 전과 같은 눈금).
  expect(visibleTicks(14, MINUTE, 0, 900, 12)).toEqual([0, 10, 20, 30, 40, 50, 60]);
  expect(visibleTicks(5, 0, 0, 900, 12)).toEqual([0]);
});
