// 손으로 그린 점을 저장 형식으로 바꾼다(계약 §3). DOM에 의존하지 않는다.
import { LIMITS } from '../domain/limits';

const TOLERANCE = 0.5;
const round = (value: number) => Math.round(value * 10) / 10;

// Ramer-Douglas-Peucker. 첫 점과 끝 점은 남기고 선에서 tolerance 안쪽의 점을 뺀다.
export function simplifyPoints(points: readonly number[], tolerance = TOLERANCE): number[] {
  const count = points.length / 2;
  if (count <= 2) return [...points];
  const keep = new Uint8Array(count); keep[0] = keep[count - 1] = 1;
  const stack: [number, number][] = [[0, count - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = points[a * 2], ay = points[a * 2 + 1], dx = points[b * 2] - ax, dy = points[b * 2 + 1] - ay;
    const length = Math.hypot(dx, dy);
    let best = -1, index = -1;
    for (let i = a + 1; i < b; i++) {
      // 시작과 끝이 같은 점이면 그 점과의 거리를 쓴다.
      const distance = length === 0 ? Math.hypot(points[i * 2] - ax, points[i * 2 + 1] - ay) : Math.abs((points[i * 2] - ax) * dy - (points[i * 2 + 1] - ay) * dx) / length;
      if (distance > best) { best = distance; index = i; }
    }
    if (best > tolerance) { keep[index] = 1; stack.push([a, index], [index, b]); }
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) if (keep[i]) out.push(points[i * 2], points[i * 2 + 1]);
  return out;
}

// 슬라이드 좌표의 점을 요소 위치 + 내부 좌표로 바꾼다. 움직임이 없으면 한 점짜리 획(둥근 점)이 된다.
export function normalizeStroke(points: readonly number[]): { x: number; y: number; points: number[] } {
  let simplified = simplifyPoints(points);
  // 그래도 점이 너무 많으면 오차를 조금씩 늘려 상한 안에 맞춘다. 그림을 버리지 않는다.
  for (let tolerance = TOLERANCE * 1.5; simplified.length / 2 > LIMITS.pointsPerStroke; tolerance *= 1.5) simplified = simplifyPoints(points, tolerance);
  let left = Infinity, top = Infinity;
  for (let i = 0; i < simplified.length; i += 2) { left = Math.min(left, simplified[i]); top = Math.min(top, simplified[i + 1]); }
  const x = Math.floor(left * 10) / 10, y = Math.floor(top * 10) / 10;
  const relative: number[] = [];
  for (let i = 0; i < simplified.length; i += 2) {
    const px = round(simplified[i] - x), py = round(simplified[i + 1] - y);
    // 반올림으로 같아진 연속 점은 하나로 줄인다.
    if (relative.length && relative[relative.length - 2] === px && relative[relative.length - 1] === py) continue;
    relative.push(px, py);
  }
  return { x, y, points: relative };
}

export const clampToSlide = (x: number, y: number) => ({ x: Math.max(0, Math.min(LIMITS.slideWidth, x)), y: Math.max(0, Math.min(LIMITS.slideHeight, y)) });
