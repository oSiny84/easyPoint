// 재생 미리보기(애니메이션 계약 §8). 시작할 때의 문서 스냅숏을 계약 §3의 식대로 넘겨 보여 준다. 문서를 바꾸지 않는다.
// 지금 장에서 시작해 끝까지 간 뒤 첫 장부터 반복한다. 그림이 아직 준비되지 않은 장은 전 그림을 유지한다(끊김 허용).
// 키 입력은 창 캡처 단계에서 끊어 편집 단축키가 닿지 않게 한다(발표 화면과 같은 규칙).
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import type { AnimationProject } from '../domain/animationTypes';
import { LIMITS } from '../domain/limits';
import { builtinBlob, type SoundItem } from '../video/builtins';
import { frameAtElapsed, frameCounts, slideAtFrame, slideStartFrame } from './frameTimes';
import { PREVIEW_SCALE_SHARP, type PreviewCache } from './previewCache';

// 재생 화면의 픽셀 크기(960×540). 캐시 그림이 이보다 작으면(장이 많은 작품) 늘려 그린다.
const WIDTH = LIMITS.slideWidth * PREVIEW_SCALE_SHARP, HEIGHT = LIMITS.slideHeight * PREVIEW_SCALE_SHARP;
const CLOSE_KEYS = new Set(['Escape', ' ', 'Enter']);

type Props = { project: AnimationProject; startSlideId: string; cache: PreviewCache; music: SoundItem | null; onClose: (slideId: string) => void };

export function AnimationPlayer({ project, startSlideId, cache, music, onClose }: Props) {
  const slides = project.slides;
  const startIndex = Math.max(0, slides.findIndex(slide => slide.id === startSlideId));
  const [index, setIndex] = useState(startIndex);
  const canvas = useRef<HTMLCanvasElement>(null);
  const indexRef = useRef(startIndex);
  const closed = useRef(false);

  const close = () => {
    if (closed.current) return;
    closed.current = true;
    onClose(slides[indexRef.current].id);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    let active = true;
    const counts = frameCounts(project);
    const startFrame = slideStartFrame(counts, startIndex);
    const context = canvas.current!.getContext('2d')!;
    context.fillStyle = '#FFFFFF'; context.fillRect(0, 0, WIDTH, HEIGHT);
    cache.prepare(slides);

    // 그림 준비: 지금 장부터 순서대로 한 번에 하나씩 만든다. 재생은 기다리지 않고 바로 시작한다.
    void (async () => {
      for (let step = 0; step < slides.length && active; step++) await cache.ensure(slides[(startIndex + step) % slides.length]);
    })();

    let shown: ImageBitmap | null = null;
    const started = performance.now();
    let handle = 0;
    const tick = () => {
      if (!active) return;
      const current = slideAtFrame(counts, startFrame + frameAtElapsed(performance.now() - started));
      if (current !== indexRef.current) { indexRef.current = current; setIndex(current); }
      const picture = cache.get(slides[current]);
      if (picture && picture !== shown) { context.drawImage(picture, 0, 0, WIDTH, HEIGHT); shown = picture; }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);

    // 배경음악: 0초부터 반복. 못 받으면 소리 없이 재생한다.
    let audio: HTMLAudioElement | null = null, url: string | null = null;
    if (music) void builtinBlob('sounds', music).then(blob => {
      if (!blob || !active) return;
      url = URL.createObjectURL(blob); audio = new Audio(url); audio.loop = true; audio.volume = project.musicVolume;
      void audio.play().catch(() => undefined);
    }, () => undefined);

    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (CLOSE_KEYS.has(event.key)) { event.preventDefault(); closeRef.current(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      active = false; cancelAnimationFrame(handle);
      audio?.pause(); if (url) URL.revokeObjectURL(url);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [project, slides, startIndex, cache, music]);

  return <div className="player-backdrop" role="dialog" aria-modal="true" aria-label="재생" data-testid="animation-player" onPointerDown={event => { if (event.target === event.currentTarget) close(); }}>
    <canvas ref={canvas} className="player-screen" width={WIDTH} height={HEIGHT} />
    <div className="player-bar">
      <span className="player-position" data-testid="player-position">{index + 1} / {slides.length}</span>
      <button className="primary" onClick={close}><Icon name="pause" size={18} />멈추기</button>
    </div>
  </div>;
}
