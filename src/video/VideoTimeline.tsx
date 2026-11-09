// 아래 타임라인 띠(영상 기획안 §3). 위는 시간 눈금과 재생 막대, 아래는 영상 조각 띠다. 자막·밈 막대 줄은 V5·V6에서 더한다.
// 숫자 입력 없이 누르기와 끌기만 쓴다: 눈금·빈 곳을 누르거나 재생 막대를 끌면 그 시각으로 옮기고, 선택한 조각의 양 끝을 끌면 다듬는다.
// 끄는 동안은 화면에만 보이고, 손을 떼면 trimClip 명령 하나를 보낸다(취소 한 번에 다듬기 한 번).
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { clipLength, clipStarts, totalMs } from '../domain/timeline';
import { VIDEO_LIMITS } from '../domain/videoLimits';
import type { Clip, VideoProject } from '../domain/videoTypes';
import { formatDuration } from './format';
import { frameAt } from './frameAt';

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
type Props = {
  project: VideoProject; timeMs: number; pxPerSecond: number; selectedClip: string | null; readOnly: boolean;
  onSeek: (ms: number) => void; onSelect: (clipId: string | null) => void; onTrim: (clipId: string, inMs: number, outMs: number) => void;
};

export function VideoTimeline({ project, timeMs, pxPerSecond, selectedClip, readOnly, onSeek, onSelect, onTrim }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [trim, setTrim] = useState<Trim | null>(null);
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
    target.setPointerCapture(event.pointerId);
    onSeek(timeAt(event.clientX));
    const move = (next: PointerEvent) => onSeek(timeAt(next.clientX));
    const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  }
  function dragEdge(event: ReactPointerEvent, clip: Clip, edge: 'in' | 'out') {
    if (readOnly || event.button !== 0) return;
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const startX = event.clientX, duration = media(clip)?.durationMs ?? clip.outMs;
    let current: Trim = { clipId: clip.id, inMs: clip.inMs, outMs: clip.outMs };
    const move = (next: PointerEvent) => {
      const delta = Math.round(((next.clientX - startX) / pxPerSecond) * 1000 / 10) * 10;
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
            <span className="clip-label">영상 {number(clip)}{clip.muted ? ' · 소리 끔' : ''}<small>{formatDuration(clipLength(clip))}</small></span>
          </button>
          {clip.id === selectedClip && !readOnly && <>
            <span className="trim-handle in" role="slider" aria-label="조각 앞부분 다듬기" aria-valuenow={clip.inMs} data-testid="trim-in" onPointerDown={event => dragEdge(event, project.clips[index], 'in')} />
            <span className="trim-handle out" role="slider" aria-label="조각 뒷부분 다듬기" aria-valuenow={clip.outMs} data-testid="trim-out" onPointerDown={event => dragEdge(event, project.clips[index], 'out')} />
          </>}
        </li>)}
        {!clips.length && <li className="clip-empty">영상을 넣으면 여기에 조각이 생겨요</li>}
      </ol>
      {total > 0 && <div className="playhead" data-testid="playhead" style={{ left: 12 + px(Math.min(timeMs, total)) }} onPointerDown={scrub} />}
    </div>
  </div>;
}
