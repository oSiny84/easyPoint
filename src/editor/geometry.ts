// 화면 조작의 계산. DOM·Konva에 의존하지 않아 Node에서 시험할 수 있다.
// 요소를 Konva scale로 바꾸지 않으므로 저장 좌표와 렌더러 scale이 누적되지 않는다(계약 §3).
import { LIMITS } from '../domain/limits';
import type { ImageElement, SlideElement, StrokeElement, TextElement } from '../domain/types';
import { elementBounds } from '../domain/validate';

const WIDTH = LIMITS.slideWidth, HEIGHT = LIMITS.slideHeight;
export type Point = { x: number; y: number };
export type Box = { left: number; top: number; right: number; bottom: number };
export type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'e' | 'w';
export type TextMeasure = (element: TextElement) => number;

// 화면 좌표를 논리 좌표로 바꾼다. 기기 픽셀 비율은 섞지 않는다.
export function toLogical(clientX: number, clientY: number, origin: { left: number; top: number }, scale: number): Point {
  return { x: (clientX - origin.left) / scale, y: (clientY - origin.top) / scale };
}

export function boxOf(element: SlideElement, measure: TextMeasure): Box {
  if (element.type === 'text') return { left: element.x, top: element.y, right: element.x + element.width, bottom: element.y + measure(element) };
  return elementBounds(element);
}

function distanceToSegment(p: Point, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay; const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / length));
  return Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy));
}

function hitsStroke(element: StrokeElement, p: Point, slop: number) {
  const reach = element.strokeWidth / 2 + slop; const { points, x, y } = element;
  if (points.length === 2) return Math.hypot(p.x - (x + points[0]), p.y - (y + points[1])) <= reach;
  for (let i = 2; i < points.length; i += 2) if (distanceToSegment(p, x + points[i - 2], y + points[i - 1], x + points[i], y + points[i + 1]) <= reach) return true;
  return false;
}

// 뒤쪽이 앞에 그려지므로 배열 끝부터 찾는다. 획은 실제 선 근처에서만 잡힌다.
export function hitTest(elements: readonly SlideElement[], p: Point, measure: TextMeasure, slop = 0): SlideElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i];
    if (element.type === 'stroke') { if (hitsStroke(element, p, slop)) return element; continue; }
    const box = boxOf(element, measure);
    if (p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom) return element;
  }
  return null;
}

// 전체가 들어가는 크기면 슬라이드 안으로, 더 크면 슬라이드를 덮는 범위로 제한한다(계약 §3).
function clampAxis(delta: number, low: number, high: number, size: number) {
  const min = high - low <= size ? -low : size - high;
  const max = high - low <= size ? size - high : -low;
  return Math.max(Math.min(min, max), Math.min(Math.max(min, max), delta));
}
export function moveWithin(box: Box, dx: number, dy: number) {
  return { dx: clampAxis(dx, box.left, box.right, WIDTH), dy: clampAxis(dy, box.top, box.bottom, HEIGHT) };
}

const MIN_IMAGE_SIDE = 16;

// 비율을 유지한 사진 크기 조절. 잡지 않은 반대쪽 모서리는 고정된다.
export function resizeImage(element: ImageElement, handle: Handle, p: Point, aspect: number) {
  const east = handle.includes('e'), south = handle.includes('s');
  const anchorX = east ? element.x : element.x + element.width, anchorY = south ? element.y : element.y + element.height;
  const wanted = Math.max(east ? p.x - anchorX : anchorX - p.x, (south ? p.y - anchorY : anchorY - p.y) * aspect);
  const room = Math.min(LIMITS.imageWidthMax, east ? WIDTH - anchorX : anchorX, Math.min(LIMITS.imageHeightMax, south ? HEIGHT - anchorY : anchorY) * aspect);
  const smallest = aspect >= 1 ? MIN_IMAGE_SIDE * aspect : MIN_IMAGE_SIDE;
  const width = Math.max(smallest, Math.min(room, wanted));
  const height = width / aspect;
  return { x: east ? anchorX : anchorX - width, y: south ? anchorY : anchorY - height, width, height };
}

const round = (value: number) => Math.round(value * 100) / 100;

// 좌우 손잡이는 폭만, 모서리는 폭과 글씨 크기를 같은 비율로 바꾼다(계약 §3). 세로 손잡이는 없다.
export function resizeText(element: TextElement, handle: Handle, p: Point, measure: TextMeasure): Pick<TextElement, 'x' | 'y' | 'width' | 'fontSize'> {
  const right = element.x + element.width; const east = handle.includes('e');
  const room = Math.min(LIMITS.textWidthMax, east ? WIDTH - Math.max(0, element.x) : Math.min(WIDTH, right));
  let width = Math.max(LIMITS.textWidthMin, Math.min(room, east ? p.x - element.x : right - p.x));
  if (handle === 'e' || handle === 'w') return { x: east ? element.x : right - width, y: element.y, width: round(width), fontSize: element.fontSize };

  // 글씨 크기 한도 안에서 비율을 정한다.
  const ratio = Math.max(Math.max(LIMITS.fontSizeMin / element.fontSize, LIMITS.textWidthMin / element.width), Math.min(LIMITS.fontSizeMax / element.fontSize, width / element.width));
  width = round(element.width * ratio);
  const fontSize = round(element.fontSize * ratio);
  const x = east ? element.x : right - width;
  if (handle.includes('s')) return { x, y: element.y, width, fontSize };
  // 위쪽 모서리는 아래 끝을 고정한다.
  const bottom = element.y + measure(element);
  return { x, y: round(bottom - measure({ ...element, width, fontSize })), width, fontSize };
}

export const handlesFor = (element: SlideElement): Handle[] => element.type === 'image' ? ['nw', 'ne', 'sw', 'se'] : element.type === 'text' ? ['nw', 'ne', 'sw', 'se', 'w', 'e'] : [];

// 놓은 곳이 그림의 가운데가 되게 하되, 슬라이드 밖으로 나가지 않게 한다.
export function centeredAt(box: { width: number; height: number }, point: Point) {
  const place = (center: number, size: number, limit: number) => Math.round(Math.max(0, Math.min(limit - size, center - size / 2)));
  return { x: place(point.x, box.width, LIMITS.slideWidth), y: place(point.y, box.height, LIMITS.slideHeight), width: box.width, height: box.height };
}
