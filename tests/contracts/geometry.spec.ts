import { test, expect } from '@playwright/test';
import type { ImageElement, StrokeElement, TextElement } from '../../src/domain/types';
import { boxOf, handlesFor, hitTest, moveWithin, resizeImage, resizeText, toLogical } from '../../src/editor/geometry';

const image: ImageElement = { id: 'i', type: 'image', x: 100, y: 100, width: 400, height: 300, assetId: 'a' };
const stroke: StrokeElement = { id: 's', type: 'stroke', x: 50, y: 50, points: [0, 0, 100, 0], color: '#000000', strokeWidth: 10 };
const dot: StrokeElement = { id: 'd', type: 'stroke', x: 300, y: 300, points: [0, 0], color: '#000000', strokeWidth: 40 };
const text: TextElement = { id: 't', type: 'text', x: 200, y: 200, width: 400, text: '가', fontId: 'sans-ko', fontSize: 40, bold: false, color: '#000000', align: 'left', lineHeight: 1.3 };
// 시험용 측정: 폭이 좁을수록 높아지는 글씨. 실제 줄 계산의 성질을 흉내 낸다.
const measure = (element: TextElement) => Math.ceil(800 / element.width) * element.fontSize * element.lineHeight;

test('화면 좌표 변환은 원점과 배율만 쓴다', () => {
  for (const scale of [0.5, 1, 1.5]) expect(toLogical(10 + 100 * scale, 20 + 50 * scale, { left: 10, top: 20 }, scale)).toEqual({ x: 100, y: 50 });
});

test('요소 찾기: 앞에 그려진 것이 먼저, 빈 곳은 없음', () => {
  const elements = [image, text];
  expect(hitTest(elements, { x: 300, y: 220 }, measure)?.id).toBe('t');
  expect(hitTest(elements, { x: 110, y: 110 }, measure)?.id).toBe('i');
  expect(hitTest(elements, { x: 900, y: 650 }, measure)).toBeNull();
});

test('요소 찾기: 획은 영역이 아니라 선 근처에서만 잡힌다', () => {
  const zigzag: StrokeElement = { ...stroke, points: [0, 0, 200, 200] };
  expect(hitTest([zigzag], { x: 150, y: 150 }, measure)?.id).toBe('s');
  expect(hitTest([zigzag], { x: 230, y: 70 }, measure)).toBeNull();
  expect(hitTest([stroke], { x: 100, y: 60 }, measure)).toBeNull();
  expect(hitTest([stroke], { x: 100, y: 60 }, measure, 6)?.id).toBe('s');
  expect(hitTest([dot], { x: 315, y: 300 }, measure)?.id).toBe('d');
  expect(hitTest([dot], { x: 325, y: 300 }, measure)).toBeNull();
});

test('이동 제한: 들어가는 크기는 슬라이드 안으로', () => {
  const box = boxOf(image, measure);
  expect(moveWithin(box, 50, 50)).toEqual({ dx: 50, dy: 50 });
  expect(moveWithin(box, -500, -500)).toEqual({ dx: -100, dy: -100 });
  expect(moveWithin(box, 5000, 5000)).toEqual({ dx: 780, dy: 320 });
});

test('이동 제한: 슬라이드보다 크면 슬라이드를 덮는 범위로', () => {
  const box = { left: -100, top: 0, right: 1300, bottom: 100 };
  expect(moveWithin(box, 50, 0).dx).toBe(50);
  expect(moveWithin(box, 500, 0).dx).toBe(100);
  expect(moveWithin(box, -500, 0).dx).toBe(-20);
});

test('이동 제한: 획은 선 굵기까지 포함한 영역으로 판단', () => {
  const box = boxOf(stroke, measure);
  expect(box).toEqual({ left: 45, top: 45, right: 155, bottom: 55 });
  expect(moveWithin(box, -100, -100)).toEqual({ dx: -45, dy: -45 });
});

const aspect = 4 / 3;
test('사진 크기: 반대쪽 모서리 고정, 비율 유지', () => {
  const se = resizeImage(image, 'se', { x: 300, y: 250 }, aspect);
  expect(se.x).toBe(100); expect(se.y).toBe(100); expect(se.width).toBeCloseTo(200); expect(se.height).toBeCloseTo(150);
  const nw = resizeImage(image, 'nw', { x: 300, y: 250 }, aspect);
  expect(nw.x + nw.width).toBeCloseTo(500); expect(nw.y + nw.height).toBeCloseTo(400); expect(nw.width / nw.height).toBeCloseTo(aspect, 6);
  const ne = resizeImage(image, 'ne', { x: 700, y: 50 }, aspect);
  expect(ne.x).toBe(100); expect(ne.y + ne.height).toBeCloseTo(400); expect(ne.width / ne.height).toBeCloseTo(aspect, 6);
  const sw = resizeImage(image, 'sw', { x: 50, y: 500 }, aspect);
  expect(sw.x + sw.width).toBeCloseTo(500); expect(sw.y).toBe(100);
});

test('사진 크기: 슬라이드 끝과 최소 크기에서 멈춘다', () => {
  const big = resizeImage(image, 'se', { x: 5000, y: 5000 }, aspect);
  expect(big.x + big.width).toBeLessThanOrEqual(1280.0001); expect(big.y + big.height).toBeLessThanOrEqual(720.0001);
  expect(big.width / big.height).toBeCloseTo(aspect, 6);
  const small = resizeImage(image, 'se', { x: 0, y: 0 }, aspect);
  expect(small.height).toBeCloseTo(16); expect(small.x).toBe(100);
  const tall = resizeImage({ ...image, width: 100, height: 200 }, 'se', { x: 0, y: 0 }, 0.5);
  expect(tall.width).toBeCloseTo(16);
});

test('글씨 크기: 좌우 손잡이는 폭만 바꾼다', () => {
  expect(resizeText(text, 'e', { x: 500, y: 0 }, measure)).toEqual({ x: 200, y: 200, width: 300, fontSize: 40 });
  expect(resizeText(text, 'w', { x: 300, y: 0 }, measure)).toEqual({ x: 300, y: 200, width: 300, fontSize: 40 });
  expect(resizeText(text, 'e', { x: 5000, y: 0 }, measure).width).toBe(1080);
  expect(resizeText(text, 'e', { x: 0, y: 0 }, measure).width).toBe(16);
});

test('글씨 크기: 모서리는 폭과 글씨를 같은 비율로 바꾼다', () => {
  expect(resizeText(text, 'se', { x: 400, y: 0 }, measure)).toEqual({ x: 200, y: 200, width: 200, fontSize: 20 });
  const west = resizeText(text, 'sw', { x: 400, y: 0 }, measure);
  expect(west).toEqual({ x: 400, y: 200, width: 200, fontSize: 20 });
  // 위쪽 모서리: 아래 끝 고정.
  const ne = resizeText(text, 'ne', { x: 400, y: 0 }, measure);
  expect(ne.y + measure({ ...text, width: ne.width, fontSize: ne.fontSize })).toBeCloseTo(200 + measure(text), 1);
});

test('글씨 크기: 글자 크기 한도에서 멈춘다', () => {
  expect(resizeText(text, 'se', { x: 201, y: 0 }, measure).fontSize).toBe(12);
  expect(resizeText({ ...text, fontSize: 200, width: 300 }, 'se', { x: 1100, y: 0 }, measure).fontSize).toBe(240);
});

test('손잡이: 사진은 모서리만, 글씨는 모서리+좌우, 획은 없음', () => {
  expect(handlesFor(image)).toEqual(['nw', 'ne', 'sw', 'se']);
  expect(handlesFor(text)).toEqual(['nw', 'ne', 'sw', 'se', 'w', 'e']);
  expect(handlesFor(stroke)).toEqual([]);
});
