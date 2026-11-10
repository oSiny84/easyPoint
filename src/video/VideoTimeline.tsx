// 아래 타임라인 띠(영상 기획안 §3). 위부터 시간 눈금·재생 막대, 영상 조각 띠, 자막·밈 막대 줄이다.
// 숫자 입력 없이 누르기와 끌기만 쓴다: 눈금·빈 곳을 누르거나 재생 막대를 끌면 그 시각으로 옮기고, 선택한 조각의 양 끝을 끌면 다듬는다.
// 끄는 동안은 화면에만 보이고, 손을 떼면 trimClip 명령 하나를 보낸다(취소 한 번에 다듬기 한 번).
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { clipLength, clipSpeed, clipStarts, totalMs } from '../domain/timeline';
import { VIDEO_LIMITS } from '../domain/videoLimits';
import type { Clip, Overlay, VideoProject } from '../domain/videoTypes';
import { formatDuration } from './format';
import { frameAt } from './frameAt';

// 남아 있던 글자 선택이 끌기로 바뀌면 브라우저가 포인터를 취소한다(pointercancel). 끌기를 시작할 때 막는다.
function startDrag(event: ReactPointerEvent) {
  event.preventDefault();
  window.getSelection()?.removeAllRanges();
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function ClipThumb({ mediaId, ms }: { mediaId: string; ms: number }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true, made: string | undefined;
    void frameAt(mediaId, ms, 96, 54).then(blob => { if (active && blob) { made = URL.createObjectURL(blob); setUrl(made); } });
    return () => { active = false; if (made) URL.revokeObjectURL(made); };
  }, [mediaId, ms]);
  return url ? <img src={url} alt="" draggable={false} /> : null;
}

type Trim = { clipId: string; inMs: number; outMs: number };
type Timing = { overlayId: string; startMs: number; durationMs: number };

// 막대를 겹치지 않는 줄에 나눠 놓는다(시작 순서대로 들어갈 수 있는 첫 줄).
function lanesOf(overlays: readonly Overlay[]) {
  const ends: number[] = []; const lane = new Map<string, number>();
  for (const overlay of [...overlays].sort((a, b) => a.startMs - b.startMs)) {
    let index = ends.findIndex(end => end <= overlay.startMs);
    if (index < 0) { index = ends.length; ends.push(0); }
    ends[index] = overlay.startMs + overlay.durationMs; lane.set(overlay.id, index);
  }
  return { lane, count: ends.length };
}
// 보이는 시간 값을 계약 범위에 맞춘다: 100ms 단위, 1~60초, 작품 끝을 넘지 않음(계약 §3, 명령 전에 UI가 먼저 줄인다).
export function clampTiming(startMs: number, durationMs: number, total: number) {
  const step = (value: number) => Math.round(value / 100) * 100;
  let duration = Math.min(VIDEO_LIMITS.overlayMaxMs, Math.max(VIDEO_LIMITS.overlayMinMs, step(durationMs)));
  duration = Math.min(duration, total);
  const start = Math.max(0, Math.min(total - duration, step(startMs)));
  return { startMs: start, durationMs: Math.min(duration, total - start) };
}

type Props = {
  project: VideoProject; timeMs: number; pxPerSecond: number; selectedClip: string | null; selectedOverlay: string | null; readOnly: boolean;
  onSeek: (ms: number) => void; onSelect: (clipId: string | null) => void; onTrim: (clipId: string, inMs: number, outMs: number) => void;
  memeLabel?: (memeId: string) => string; onSelectOverlay: (overlayId: string) => void; onOverlayTime: (overlayId: string, startMs: number, durationMs: number) => void;
};

export function VideoTimeline({ project, timeMs, pxPerSecond, selectedClip, selectedOverlay, readOnly, onSeek, onSelect, onTrim, memeLabel, onSelectOverlay, onOverlayTime }: Props) {
  const overlayLabel = (overlay: Overlay) => overlay.type === 'caption' ? overlay.text.replace(/\s+/g, ' ') : (memeLabel?.(overlay.memeId) ?? overlay.memeId);
  const scroller = useRef<HTMLDivElement>(null);
  const [trim, setTrim] = useState<Trim | null>(null);
  const [timing, setTiming] = useState<Timing | null>(null);
  // 끄는 동안은 그 조각만 바뀐 값으로 그린다.
  const clips = trim ? project.clips.map(clip => clip.id === trim.clipId ? { ...clip, inMs: trim.inMs, outMs: trim.outMs } : clip) : project.clips;
  const starts = clipStarts(clips), total = totalMs(clips);
  const px = (ms: number) => (ms / 1000) * pxPerSecond;
  const media = (clip: Clip) => project.mediaManifest.find(item => item.id === clip.mediaId);
  const number = (clip: Clip) => project.mediaManifest.findIndex(item => item.id === clip.mediaId) + 1;

  // 재생 중 재생 막대가 보이도록 따라간다.
  useEffect(() => {
    const box = scroller.current; if (!box) return;
    const x = px(timeMs);
    if (x < box.scrollLeft || x > box.scrollLeft + box.clientWidth - 24) box.scrollLeft = Math.max(0, x - box.clientWidth / 3);
  });

  const timeAt = (clientX: number) => {
    const box = scroller.current!.getBoundingClientRect();
    return Math.max(0, Math.min(total, Math.round(((clientX - box.left + scroller.current!.scrollLeft - 12) / pxPerSecond) * 1000)));
  };
  function scrub(event: ReactPointerEvent) {
    if (event.button !== 0) return;
    const target = event.currentTarget as HTMLElement;
    startDrag(event);
    onSeek(timeAt(event.clientX));
    const move = (next: PointerEvent) => onSeek(timeAt(next.clientX));
    const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  }
  function dragEdge(event: ReactPointerEvent, clip: Clip, edge: 'in' | 'out') {
    if (readOnly || event.button !== 0) return;
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    startDrag(event);
    const startX = event.clientX, duration = media(clip)?.durationMs ?? clip.outMs;
    let current: Trim = { clipId: clip.id, inMs: clip.inMs, outMs: clip.outMs };
    const move = (next: PointerEvent) => {
      // 화면의 길이는 작품 시간이므로 빠르기를 곱해 원본 시간으로 바꾼다.
      const delta = Math.round(((next.clientX - startX) / pxPerSecond) * 1000 * clipSpeed(clip) / 10) * 10;
      current = edge === 'in'
        ? { ...current, inMs: Math.max(0, Math.min(clip.outMs - VIDEO_LIMITS.clipMinMs, clip.inMs + delta)) }
        : { ...current, outMs: Math.min(duration, Math.max(clip.inMs + VIDEO_LIMITS.clipMinMs, clip.outMs + delta)) };
      setTrim(current);
    };
    const up = (next: PointerEvent) => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', cancel);
      setTrim(null);
      if (next.type === 'pointerup' && (current.inMs !== clip.inMs || current.outMs !== clip.outMs)) onTrim(clip.id, current.inMs, current.outMs);
    };
    const cancel = (next: PointerEvent) => up(next);
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', cancel);
  }

  // 자막·밈 막대 끌기: 가운데는 시작을 옮기고, 앞 끝은 끝을 고정한 채 시작을, 뒤 끝은 길이를 바꾼다. 손을 떼면 setOverlayTime 하나.
  // 끌지 않고 누르기만 하면 그 요소를 고르고 재생 막대를 시작으로 옮긴다.
  function dragBar(event: ReactPointerEvent, overlay: Overlay, part: 'body' | 'start' | 'end') {
    if (event.button !== 0) return;
    event.stopPropagation();
    onSelectOverlay(overlay.id);
    const target = event.currentTarget as HTMLElement;
    startDrag(event);
    const startX = event.clientX, end = overlay.startMs + overlay.durationMs;
    let current: Timing = { overlayId: overlay.id, startMs: overlay.startMs, durationMs: overlay.durationMs }, moved = false;
    const move = (next: PointerEvent) => {
      if (readOnly) return;
      const delta = ((next.clientX - startX) / pxPerSecond) * 1000;
      if (Math.abs(next.clientX - startX) >= 3) moved = true;
      const wanted = part === 'body' ? clampTiming(overlay.startMs + delta, overlay.durationMs, total)
        : part === 'end' ? clampTiming(overlay.startMs, overlay.durationMs + delta, total)
        : (() => { const start = Math.min(end - VIDEO_LIMITS.overlayMinMs, Math.max(0, Math.round((overlay.startMs + delta) / 100) * 100)); return clampTiming(start, end - start, total); })();
      current = { overlayId: overlay.id, ...wanted };
      setTiming(current);
    };
    const up = (next: PointerEvent) => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up);
      setTiming(null);
      if (next.type !== 'pointerup') return;
      if (moved && (current.startMs !== overlay.startMs || current.durationMs !== overlay.durationMs)) onOverlayTime(overlay.id, current.startMs, current.durationMs);
      else if (!moved) onSeek(overlay.startMs);
    };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  }
  const overlays = timing ? project.overlays.map(overlay => overlay.id === timing.overlayId ? { ...overlay, startMs: timing.startMs, durationMs: timing.durationMs } : overlay) : project.overlays;
  const { lane, count: laneCount } = lanesOf(overlays);

  const width = Math.max(px(total) + 24, 200);
  const ticks = Math.floor(total / 1000);
  const tickEvery = pxPerSecond >= 40 ? 1 : pxPerSecond >= 15 ? 5 : 10;
  return <div className="timeline-scroll" ref={scroller} data-testid="timeline" data-px-per-second={pxPerSecond}>
    <div className="timeline-track" style={{ width }}>
      <div className="timeline-ruler" data-testid="timeline-ruler" onPointerDown={scrub}>
        {Array.from({ length: Math.floor(ticks / tickEvery) + 1 }, (_, i) => i * tickEvery).map(second => <span key={second} className="tick" style={{ left: 12 + px(second * 1000) }}>{formatDuration(second * 1000)}</span>)}
      </div>
      <ol className="clip-strip" aria-label="영상 조각" onPointerDown={event => { if (event.target === event.currentTarget) { onSelect(null); scrub(event); } }}>
        {clips.map((clip, index) => <li key={clip.id} style={{ left: 12 + px(starts[index]), width: Math.max(12, px(clipLength(clip))) }} className={clip.id === selectedClip ? 'clip-slot selected' : 'clip-slot'}>
          <button className={clip.id === selectedClip ? 'clip-block current' : 'clip-block'} aria-pressed={clip.id === selectedClip} aria-label={`영상 ${number(clip)} 조각 ${formatDuration(clipLength(clip))}`}
            onPointerDown={event => { if (event.button !== 0) return; onSelect(clip.id); onSeek(timeAt(event.clientX)); }}>
            <ClipThumb mediaId={clip.mediaId} ms={clip.inMs} />
            <span className="clip-label">영상 {number(clip)}{clip.speed ? ` · ${clip.speed}배` : ''}{clip.muted ? ' · 소리 끔' : ''}<small>{formatDuration(clipLength(clip))}</small></span>
          </button>
          {clip.id === selectedClip && !readOnly && <>
            <span className="trim-handle in" role="slider" aria-label="조각 앞부분 다듬기" aria-valuenow={clip.inMs} data-testid="trim-in" onPointerDown={event => dragEdge(event, project.clips[index], 'in')} />
            <span className="trim-handle out" role="slider" aria-label="조각 뒷부분 다듬기" aria-valuenow={clip.outMs} data-testid="trim-out" onPointerDown={event => dragEdge(event, project.clips[index], 'out')} />
          </>}
        </li>)}
        {!clips.length && <li className="clip-empty">영상을 넣으면 여기에 조각이 생겨요</li>}
      </ol>
      {overlays.length > 0 && <ol className="overlay-lanes" aria-label="자막·밈 막대" style={{ height: laneCount * 26 }}>
        {overlays.map(overlay => <li key={overlay.id} className={`overlay-bar ${overlay.type}${overlay.id === selectedOverlay ? ' current' : ''}`} style={{ left: 12 + px(overlay.startMs), width: Math.max(16, px(overlay.durationMs)), top: (lane.get(overlay.id) ?? 0) * 26 }}>
          <button aria-label={`${overlay.type === 'caption' ? '자막' : '밈'} ${overlayLabel(overlay)} ${formatDuration(overlay.durationMs)}`} aria-pressed={overlay.id === selectedOverlay} data-testid="overlay-bar" onPointerDown={event => dragBar(event, overlay, 'body')}>{overlayLabel(overlay)}</button>
          {overlay.id === selectedOverlay && !readOnly && <>
            <span className="bar-handle start" role="slider" aria-label="보이기 시작 시각" aria-valuenow={overlay.startMs} data-testid="bar-start" onPointerDown={event => dragBar(event, overlay, 'start')} />
            <span className="bar-handle end" role="slider" aria-label="보이기 끝 시각" aria-valuenow={overlay.startMs + overlay.durationMs} data-testid="bar-end" onPointerDown={event => dragBar(event, overlay, 'end')} />
          </>}
        </li>)}
      </ol>}
      {total > 0 && <div className="playhead" data-testid="playhead" style={{ left: 12 + px(Math.min(timeMs, total)) }} onPointerDown={scrub} />}
    </div>
  </div>;
}
