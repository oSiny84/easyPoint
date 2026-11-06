// 슬라이드 위 조작 층. 선택 테두리·손잡이를 그리고 포인터 입력을 논리 좌표로 바꾼다.
// 조작 중의 임시 위치는 preview로만 보관하고 손을 뗄 때 명령을 한 번 보낸다(계약 §2).
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { Command } from '../commands/apply';
import { Icon } from '../components/Icon';
import type { Asset, Slide, SlideElement, TextElement } from '../domain/types';
import { layoutText } from '../rendering/text/layoutText';
import { boxOf, handlesFor, hitTest, moveWithin, resizeImage, resizeText, toLogical, type Handle, type Point } from './geometry';

const measure = (element: TextElement) => layoutText(element).height;
const DRAG_START_PX = 4;
const round = (value: number) => Math.round(value * 100) / 100;

type Gesture = { pointerId: number; handle: Handle | null; start: Point; startClient: Point; element: SlideElement; moved: boolean };
type Props = {
  slide: Slide; manifest: readonly Asset[]; selected: SlideElement | null; preview: SlideElement | null; scale: number;
  onSelect: (id: string | null) => void; onPreview: (element: SlideElement | null) => void; onCommit: (command: Command) => void;
  onMenu: (x: number, y: number) => void; onEditText: (element: TextElement, point: Point) => void; editing: boolean;
};

export function SelectionLayer({ slide, manifest, selected, preview, scale, onSelect, onPreview, onCommit, onMenu, onEditText, editing }: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const latest = useRef<SlideElement | null>(null);
  const lastTap = useRef<{ at: number; id: string } | null>(null);

  const logical = (event: { clientX: number; clientY: number }) => toLogical(event.clientX, event.clientY, surface.current!.getBoundingClientRect(), scale);
  const slopFor = (pointerType: string) => (pointerType === 'touch' ? 10 : 4) / scale;

  function begin(event: ReactPointerEvent, element: SlideElement, handle: Handle | null) {
    surface.current!.setPointerCapture(event.pointerId);
    gesture.current = { pointerId: event.pointerId, handle, start: logical(event), startClient: { x: event.clientX, y: event.clientY }, element, moved: false };
    latest.current = null;
  }
  function finish(commit: boolean) {
    const current = gesture.current; const result = latest.current;
    gesture.current = null; latest.current = null;
    if (commit && current && current.moved && result) onCommit(commandFor(slide.id, result, current.handle !== null));
    onPreview(null);
  }

  // 끄는 중 Escape를 누르면 조작을 버린다.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && gesture.current) { event.stopPropagation(); finish(false); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  function onPointerDown(event: ReactPointerEvent) {
    if (event.button !== 0 || gesture.current) return;
    const hit = hitTest(slide.elements, logical(event), measure, slopFor(event.pointerType));
    onSelect(hit?.id ?? null);
    // 터치에서는 두 번 누르기를 직접 찾는다. 끌기를 위해 브라우저 제스처를 꺼 두었기 때문이다.
    if (hit?.type === 'text' && event.pointerType === 'touch') {
      const now = performance.now();
      if (lastTap.current?.id === hit.id && now - lastTap.current.at < 350) { lastTap.current = null; onEditText(hit, logical(event)); return; }
      lastTap.current = { at: now, id: hit.id };
    }
    if (hit) begin(event, hit, null);
  }

  function onPointerMove(event: ReactPointerEvent) {
    const current = gesture.current;
    if (!current) {
      if (event.pointerType === 'mouse') surface.current!.style.cursor = hitTest(slide.elements, logical(event), measure, slopFor('mouse')) ? 'move' : 'default';
      return;
    }
    if (event.pointerId !== current.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.startClient.x, event.clientY - current.startClient.y) < DRAG_START_PX) return;
    current.moved = true;
    const p = logical(event); const { element, handle } = current;
    let next: SlideElement;
    if (!handle) {
      const { dx, dy } = moveWithin(boxOf(element, measure), p.x - current.start.x, p.y - current.start.y);
      next = { ...element, x: round(element.x + dx), y: round(element.y + dy) };
    } else if (element.type === 'image') {
      const asset = manifest.find(item => item.id === element.assetId);
      if (!asset) return;
      next = { ...element, ...resizeImage(element, handle, p, asset.pixelWidth / asset.pixelHeight) };
    } else if (element.type === 'text') {
      next = { ...element, ...resizeText(element, handle, p, measure) };
    } else return;
    latest.current = next;
    onPreview(next);
  }

  function onPointerUp(event: ReactPointerEvent) {
    if (gesture.current?.pointerId === event.pointerId) finish(true);
  }
  function onPointerCancel(event: ReactPointerEvent) {
    if (gesture.current?.pointerId === event.pointerId) finish(false);
  }

  const shownElement = preview ?? selected;
  const box = shownElement && boxOf(shownElement, measure);
  const scaled = box && { left: box.left * scale, top: box.top * scale, width: (box.right - box.left) * scale, height: (box.bottom - box.top) * scale };

  return <div ref={surface} className="selection-surface" data-testid="selection-surface" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
    onContextMenu={event => {
      event.preventDefault();
      const hit = hitTest(slide.elements, logical(event), measure, slopFor('mouse'));
      onSelect(hit?.id ?? null);
      if (hit) onMenu(event.clientX, event.clientY);
    }}
    onDoubleClick={event => { const point = logical(event); const hit = hitTest(slide.elements, point, measure); if (hit?.type === 'text') onEditText(hit, point); }}>
    {scaled && shownElement && <>
      <div className="selection-box" data-testid="selection-box" style={scaled} />
      {!editing && handlesFor(shownElement).map(handle => <button key={handle} type="button" className={`handle handle-${handle}`} aria-label={`크기 조절 ${handle}`} data-testid={`handle-${handle}`}
        style={{ left: scaled.left + (handle.includes('w') ? 0 : handle.includes('e') ? scaled.width : scaled.width / 2), top: scaled.top + (handle === 'e' || handle === 'w' ? scaled.height / 2 : handle.includes('n') ? 0 : scaled.height) }}
        onPointerDown={event => { event.stopPropagation(); if (event.button === 0 && !gesture.current) begin(event, shownElement, handle); }} />)}
      {!preview && !editing && <button type="button" className="more-button" aria-label="더보기" style={{ left: scaled.left + scaled.width, top: scaled.top }}
        onPointerDown={event => event.stopPropagation()} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); onMenu(rect.right, rect.bottom + 4); }}><Icon name="more" size={18} /></button>}
    </>}
  </div>;
}

function commandFor(slideId: string, element: SlideElement, resized: boolean): Command {
  const base = { slideId, elementId: element.id };
  if (resized && element.type === 'image') return { type: 'resizeImage', ...base, x: element.x, y: element.y, width: element.width, height: element.height };
  if (resized && element.type === 'text') return { type: 'resizeText', ...base, x: element.x, y: element.y, width: element.width, fontSize: element.fontSize };
  return { type: 'moveElement', ...base, x: element.x, y: element.y };
}
