// 그리기 모드의 입력 층. 그리는 중인 획은 별도 캔버스에 새 구간만 그려 기존 요소를 다시 그리지 않는다(PHASE2_RESULTS §6).
// 먼저 닿은 포인터 하나만 따라가므로 손바닥이나 둘째 손가락이 획을 망치지 않는다.
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { LIMITS } from '../domain/limits';
import type { Slide, StrokeElement } from '../domain/types';
import { hitTest, toLogical } from './geometry';
import { clampToSlide, normalizeStroke } from './strokes';

// 정상적인 필기로는 닿기 어려운 값이다. 넘으면 획을 끊어 메모리가 무한히 늘지 않게 한다.
const RAW_POINT_LIMIT = 20000;
const ERASE_STEP = 6;
export type NewStroke = { x: number; y: number; points: number[] };
type Props = {
  slide: Slide; scale: number; mode: 'pen' | 'eraser'; color: string; strokeWidth: number;
  onStroke: (stroke: NewStroke) => void; onErase: (elementId: string) => void;
};

export function DrawLayer({ slide, scale, mode, color, strokeWidth, onStroke, onErase }: Props) {
  const surface = useRef<HTMLCanvasElement>(null);
  const active = useRef<{ pointerId: number; points: number[] } | null>(null);
  const erased = useRef(new Set<string>());
  const pixelRatio = window.devicePixelRatio || 1;

  const logical = (event: { clientX: number; clientY: number }) => toLogical(event.clientX, event.clientY, surface.current!.getBoundingClientRect(), scale);
  const clear = () => { const canvas = surface.current; if (canvas) canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height); };

  function context() {
    const c = surface.current!.getContext('2d')!;
    c.setTransform(scale * pixelRatio, 0, 0, scale * pixelRatio, 0, 0);
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = strokeWidth; c.lineCap = 'round'; c.lineJoin = 'round';
    return c;
  }
  // 획을 버린다. 취소·Esc·화면 이탈 모두 이전 문서를 그대로 둔다.
  function discard() { active.current = null; erased.current.clear(); clear(); }
  function finish() {
    const current = active.current;
    active.current = null;
    if (!current) return;
    onStroke(normalizeStroke(current.points));
    // 문서의 획이 그려진 다음 프레임에 임시 획을 지워 깜박이지 않게 한다.
    requestAnimationFrame(clear);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && active.current) { event.stopPropagation(); discard(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // 빠르게 문질러도 지나간 획을 놓치지 않도록 이전 위치와의 사이를 작은 간격으로 나눠 검사한다.
  function erase(event: { clientX: number; clientY: number }, pointerType: string) {
    const current = active.current!; const p = logical(event);
    const slop = (pointerType === 'touch' ? 12 : 6) / scale;
    const [fromX, fromY] = current.points.length ? current.points : [p.x, p.y];
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - fromX, p.y - fromY) / ERASE_STEP));
    for (let step = 1; step <= steps; step++) {
      const at = { x: fromX + (p.x - fromX) * step / steps, y: fromY + (p.y - fromY) * step / steps };
      for (;;) {
        const strokes = slide.elements.filter((element): element is StrokeElement => element.type === 'stroke' && !erased.current.has(element.id));
        const hit = hitTest(strokes, at, () => 0, slop);
        if (!hit) break;
        erased.current.add(hit.id); onErase(hit.id);
      }
    }
    current.points = [p.x, p.y];
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || active.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (mode === 'eraser') { active.current = { pointerId: event.pointerId, points: [] }; erased.current.clear(); erase(event, event.pointerType); return; }
    const p = clampToSlide(logical(event).x, logical(event).y);
    active.current = { pointerId: event.pointerId, points: [p.x, p.y] };
    const c = context();
    c.beginPath(); c.arc(p.x, p.y, strokeWidth / 2, 0, Math.PI * 2); c.fill();
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const current = active.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (mode === 'eraser') { erase(event, event.pointerType); return; }
    // 프레임 사이에 합쳐진 입력까지 써서 빠른 필기도 끊기지 않게 한다.
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const c = context();
    for (const sample of events.length ? events : [event.nativeEvent]) {
      const p = clampToSlide(logical(sample).x, logical(sample).y);
      const { points } = current;
      c.beginPath(); c.moveTo(points[points.length - 2], points[points.length - 1]); c.lineTo(p.x, p.y); c.stroke();
      points.push(p.x, p.y);
    }
    if (current.points.length / 2 >= RAW_POINT_LIMIT) finish();
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (active.current?.pointerId !== event.pointerId) return;
    if (mode === 'eraser') discard(); else finish();
  }

  return <canvas ref={surface} className={mode === 'eraser' ? 'draw-layer eraser' : 'draw-layer'} data-testid="draw-layer"
    width={Math.round(LIMITS.slideWidth * scale * pixelRatio)} height={Math.round(LIMITS.slideHeight * scale * pixelRatio)}
    style={{ width: LIMITS.slideWidth * scale, height: LIMITS.slideHeight * scale }}
    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd}
    onPointerCancel={event => { if (active.current?.pointerId === event.pointerId) discard(); }}
    onLostPointerCapture={event => { if (active.current?.pointerId === event.pointerId) discard(); }}
    onContextMenu={event => event.preventDefault()} />;
}
