// 미리보기 위 조작 층(영상 계약 §3 좌표). 지금 보이는 자막·밈만 누를 수 있고, 선택 테두리·손잡이를 그린다.
// 끄는 동안의 위치는 preview로만 보관하고 손을 떼면 명령 하나를 보낸다(슬라이드 SelectionLayer와 같은 규칙).
// 자막: 좌우 손잡이는 폭만, 모서리는 폭과 글씨 크기를 같은 비율로. 밈: 모서리만, 목록 비율 유지.
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { VideoCommand } from '../commands/videoApply';
import { moveWithin, resizeText, toLogical, type Canvas, type Handle, type Point } from '../editor/geometry';
import { VIDEO_LIMITS } from '../domain/videoLimits';
import type { CaptionOverlay, MemeOverlay, Overlay } from '../domain/videoTypes';
import { layoutText } from '../rendering/text/layoutText';
import { isVisible } from './compose';

const DRAG_START_PX = 4;
const round = (value: number) => Math.round(value * 100) / 100;
const captionHeight = (caption: CaptionOverlay) => layoutText(caption).height;

export function overlayBox(overlay: Overlay) {
  const height = overlay.type === 'caption' ? captionHeight(overlay) : overlay.height;
  return { left: overlay.x, top: overlay.y, right: overlay.x + overlay.width, bottom: overlay.y + height };
}

// 밈 크기 조절: 잡지 않은 반대쪽 모서리를 고정하고 비율을 지킨다. 화면 크기와 최소 32 안으로 제한한다.
export function resizeMeme(meme: MemeOverlay, handle: Handle, p: Point, canvas: Canvas) {
  const aspect = meme.width / meme.height;
  const east = handle.includes('e'), south = handle.includes('s');
  const anchorX = east ? meme.x : meme.x + meme.width, anchorY = south ? meme.y : meme.y + meme.height;
  const wanted = Math.max(east ? p.x - anchorX : anchorX - p.x, (south ? p.y - anchorY : anchorY - p.y) * aspect);
  const largest = Math.min(canvas.width, canvas.height * aspect);
  const smallest = Math.max(VIDEO_LIMITS.memeWidthMin, VIDEO_LIMITS.memeHeightMin * aspect);
  const width = round(Math.max(smallest, Math.min(largest, wanted)));
  const height = round(width / aspect);
  return { x: round(east ? anchorX : anchorX - width), y: round(south ? anchorY : anchorY - height), width, height };
}

const handlesOf = (overlay: Overlay): Handle[] => overlay.type === 'caption' ? ['nw', 'ne', 'sw', 'se', 'w', 'e'] : ['nw', 'ne', 'sw', 'se'];

type Gesture = { pointerId: number; handle: Handle | null; start: Point; startClient: Point; overlay: Overlay; moved: boolean };
type Props = {
  overlays: readonly Overlay[]; timeMs: number; canvas: Canvas; scale: number; selected: Overlay | null; preview: Overlay | null; editingId: string | null; readOnly: boolean;
  onSelect: (id: string | null) => void; onPreview: (overlay: Overlay | null) => void; onCommit: (command: VideoCommand) => void; onEditCaption: (caption: CaptionOverlay) => void;
};

export function OverlayLayer({ overlays, timeMs, canvas, scale, selected, preview, editingId, readOnly, onSelect, onPreview, onCommit, onEditCaption }: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const latest = useRef<Overlay | null>(null);
  const t = Math.floor(timeMs);
  const logical = (event: { clientX: number; clientY: number }) => toLogical(event.clientX, event.clientY, surface.current!.getBoundingClientRect(), scale);

  // 뒤쪽이 위에 그려지므로 배열 끝부터 찾는다. 지금 보이는 요소만 잡힌다.
  function hit(p: Point) {
    for (let i = overlays.length - 1; i >= 0; i--) {
      const overlay = overlays[i];
      if (!isVisible(overlay, t)) continue;
      const box = overlayBox(overlay);
      if (p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom) return overlay;
    }
    return null;
  }
  function begin(event: ReactPointerEvent, overlay: Overlay, handle: Handle | null) {
    if (readOnly) return;
    // 남아 있던 글자 선택이 끌기로 바뀌면 브라우저가 포인터를 취소한다(pointercancel). 누를 때 기본 동작을 막는다.
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    surface.current!.setPointerCapture(event.pointerId);
    gesture.current = { pointerId: event.pointerId, handle, start: logical(event), startClient: { x: event.clientX, y: event.clientY }, overlay, moved: false };
    latest.current = null;
  }
  function finish(commit: boolean) {
    const current = gesture.current, result = latest.current;
    gesture.current = null; latest.current = null;
    if (commit && current?.moved && result) {
      if (current.handle === null) onCommit({ type: 'moveOverlay', overlayId: result.id, x: result.x, y: result.y });
      else onCommit(result.type === 'caption'
        ? { type: 'resizeOverlay', overlayId: result.id, x: result.x, y: result.y, width: result.width, fontSize: result.fontSize }
        : { type: 'resizeOverlay', overlayId: result.id, x: result.x, y: result.y, width: result.width, height: result.height });
    }
    onPreview(null);
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && gesture.current) { event.stopPropagation(); finish(false); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  function onPointerDown(event: ReactPointerEvent) {
    if (event.button !== 0 || gesture.current) return;
    const found = hit(logical(event));
    onSelect(found?.id ?? null);
    if (found) begin(event, found, null);
  }
  function onPointerMove(event: ReactPointerEvent) {
    const current = gesture.current;
    if (!current) { if (event.pointerType === 'mouse') surface.current!.style.cursor = hit(logical(event)) ? 'move' : 'default'; return; }
    if (event.pointerId !== current.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.startClient.x, event.clientY - current.startClient.y) < DRAG_START_PX) return;
    current.moved = true;
    const p = logical(event), { overlay, handle } = current;
    let next: Overlay;
    if (!handle) {
      const { dx, dy } = moveWithin(overlayBox(overlay), p.x - current.start.x, p.y - current.start.y, canvas);
      next = { ...overlay, x: round(overlay.x + dx), y: round(overlay.y + dy) };
    } else if (overlay.type === 'caption') next = { ...overlay, ...resizeText(overlay, handle, p, captionHeight, canvas) };
    else next = { ...overlay, ...resizeMeme(overlay, handle, p, canvas) };
    latest.current = next;
    onPreview(next);
  }

  const shown = preview ?? selected;
  const visible = shown && (preview || isVisible(shown, t)) ? shown : null;
  const box = visible && overlayBox(visible);
  const scaled = box && { left: box.left * scale, top: box.top * scale, width: (box.right - box.left) * scale, height: (box.bottom - box.top) * scale };
  return <div ref={surface} className="selection-surface overlay-surface" data-testid="overlay-surface" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
    onPointerUp={event => { if (gesture.current?.pointerId === event.pointerId) finish(true); }} onPointerCancel={event => { if (gesture.current?.pointerId === event.pointerId) finish(false); }}
    onDoubleClick={event => { const found = hit(logical(event)); if (found?.type === 'caption' && !readOnly) onEditCaption(found); }}>
    {scaled && visible && visible.id !== editingId && <>
      <div className="selection-box" data-testid="overlay-selection" style={scaled} />
      {!readOnly && handlesOf(visible).map(handle => <button key={handle} type="button" className={`handle handle-${handle}`} aria-label={`크기 조절 ${handle}`} data-testid={`overlay-handle-${handle}`}
        style={{ left: scaled.left + (handle.includes('w') ? 0 : handle.includes('e') ? scaled.width : scaled.width / 2), top: scaled.top + (handle === 'e' || handle === 'w' ? scaled.height / 2 : handle.includes('n') ? 0 : scaled.height) }}
        onPointerDown={event => { event.stopPropagation(); if (event.button === 0 && !gesture.current) begin(event, visible, handle); }} />)}
    </>}
  </div>;
}
