import { test, expect } from '@playwright/test';
import { LIMITS } from '../../src/domain/limits';
import { validateProject } from '../../src/domain/validate';
import { clampToSlide, normalizeStroke, simplifyPoints } from '../../src/editor/strokes';
import { loadSample } from './helpers';

test('단순화: 직선의 중간 점은 빠지고 꺾인 점은 남는다', () => {
  expect(simplifyPoints([0, 0, 10, 0.1, 20, 0, 30, 0.2, 40, 0])).toEqual([0, 0, 40, 0]);
  expect(simplifyPoints([0, 0, 10, 10, 20, 0])).toEqual([0, 0, 10, 10, 20, 0]);
  expect(simplifyPoints([5, 5])).toEqual([5, 5]);
  expect(simplifyPoints([1, 1, 2, 2])).toEqual([1, 1, 2, 2]);
  // 시작과 끝이 같은 고리도 사라지지 않는다.
  expect(simplifyPoints([0, 0, 50, 0, 50, 50, 0, 0]).length).toBeGreaterThan(4);
});

test('허용 오차 0.5: 그보다 멀리 벗어난 점은 지키고 안쪽 점은 뺀다', () => {
  expect(simplifyPoints([0, 0, 10, 0.4, 20, 0])).toEqual([0, 0, 20, 0]);
  expect(simplifyPoints([0, 0, 10, 0.6, 20, 0])).toEqual([0, 0, 10, 0.6, 20, 0]);
});

test('정규화: 왼쪽 위가 요소 위치, 점은 내부 좌표, 소수 한 자리', () => {
  expect(normalizeStroke([100.26, 50.34, 150.77, 80.11])).toEqual({ x: 100.2, y: 50.3, points: [0.1, 0, 50.6, 29.8] });
  const stroke = normalizeStroke([300, 300, 200, 400]);
  expect(stroke).toEqual({ x: 200, y: 300, points: [100, 0, 0, 100] });
});

test('정규화: 움직이지 않으면 한 점짜리 획이 된다', () => {
  expect(normalizeStroke([500, 200])).toEqual({ x: 500, y: 200, points: [0, 0] });
  expect(normalizeStroke([500, 200, 500, 200, 500, 200])).toEqual({ x: 500, y: 200, points: [0, 0] });
  expect(normalizeStroke([500, 200, 500.01, 200.02]).points).toEqual([0, 0]);
});

test('점이 너무 많으면 오차를 늘려 상한에 맞춘다', () => {
  const zigzag: number[] = [];
  for (let i = 0; i < 12000; i++) zigzag.push(i % 1280, i % 2 ? 100 : 300 + (i % 400));
  const stroke = normalizeStroke(zigzag);
  expect(stroke.points.length / 2).toBeLessThanOrEqual(LIMITS.pointsPerStroke);
  expect(stroke.points.length).toBeGreaterThan(2);
});

test('문서 검사를 통과하고 슬라이드 안의 좌표로 고정된다', () => {
  expect(clampToSlide(-50, 9000)).toEqual({ x: 0, y: 720 });
  const project = loadSample();
  const stroke = normalizeStroke([0, 0, 1280, 720, 0, 720, 1280, 0]);
  project.slides[3].elements = [{ id: '00000000-0000-4000-8000-000000009999', type: 'stroke', color: '#000000', strokeWidth: 8, ...stroke }];
  expect(validateProject(project)).toMatchObject({ ok: true });
});
