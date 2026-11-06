// 전체 화면 발표(UI_REFERENCE §5). 시작할 때의 문서 스냅샷을 출력과 같은 renderSlide로 그린다.
// 문서를 바꾸지 않는다. 고해상도 이미지는 지금 장과 앞뒤 장만 유지한다(계약 §7).
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Icon } from '../components/Icon';
import { LIMITS } from '../domain/limits';
import type { Project } from '../domain/types';
import { renderSlide, type BlobResolver } from '../rendering/renderSlide';

type Entry = { canvas: HTMLCanvasElement } | { message: string } | null;

const IDLE_MS = 3000;
const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']);
// 화면 왼쪽을 누르면 앞 장으로 간다. 터치 기기에 키보드가 없어도 돌아갈 수 있게 한다.
const PREV_ZONE = 0.25;

function renderScale() {
  const needed = Math.max(screen.width / LIMITS.slideWidth, screen.height / LIMITS.slideHeight) * devicePixelRatio;
  return Math.min(2, Math.max(1, needed));
}
function release(entry: Entry) { if (entry && 'canvas' in entry) entry.canvas.width = entry.canvas.height = 0; }

export function Presenter({ project, startSlideId, resolve, onClose }: { project: Project; startSlideId: string; resolve: BlobResolver; onClose: (slideId: string) => void }) {
  const slides = project.slides;
  const [index, setIndex] = useState(() => Math.max(0, slides.findIndex(slide => slide.id === startSlideId)));
  const [shownId, setShownId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [idle, setIdle] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const indexRef = useRef(index);
  const closed = useRef(false);
  const entered = useRef(false);
  const cache = useRef(new Map<string, Promise<Entry>>());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const idleTimer = useRef(0);
  const last = slides.length - 1;

  const wake = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
  }, []);

  const close = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    onClose(slides[indexRef.current].id);
  }, [onClose, slides]);

  // 끝에서 더 넘기려 하면 막고, 왜 안 넘어가는지 볼 수 있게 조작 줄을 보여 준다.
  const go = useCallback((next: number) => {
    if (next < 0 || next > last) { wake(); return; }
    setIndex(next);
  }, [last, wake]);

  // 그리기는 한 번에 한 장씩 한다. 키를 빠르게 눌러 지나간 장은 그리지 않는다.
  const ensure = useCallback((target: number): Promise<Entry> | undefined => {
    const slide = slides[target];
    if (!slide) return undefined;
    const known = cache.current.get(slide.id);
    if (known) return known;
    const job: Promise<Entry> = queue.current.then(async () => {
      if (Math.abs(target - indexRef.current) > 1) {
        if (cache.current.get(slide.id) === job) cache.current.delete(slide.id);
        return null;
      }
      // 사진을 해독하지 못하면 renderSlide가 예외를 던진다. 한 장의 실패로 발표를 멈추지 않는다.
      try {
        const rendered = await renderSlide(slide, resolve, renderScale());
        return rendered.ok ? { canvas: rendered.canvas } : { message: rendered.message };
      } catch { return { message: '사진을 읽지 못했어요.' }; }
    });
    queue.current = job;
    cache.current.set(slide.id, job);
    return job;
  }, [resolve, slides]);

  useEffect(() => {
    indexRef.current = index;
    let active = true;
    const target = slides[index];
    void ensure(index)!.then(entry => {
      if (!active || !entry) return;
      if ('canvas' in entry) { holder.current?.replaceChildren(entry.canvas); setMessage(null); }
      else { holder.current?.replaceChildren(); setMessage(entry.message); }
      setShownId(target.id);
      const keep = new Set([index - 1, index, index + 1].map(item => slides[item]?.id));
      for (const [id, job] of cache.current) if (!keep.has(id)) { cache.current.delete(id); void job.then(release); }
      void ensure(index + 1); void ensure(index - 1);
    });
    return () => { active = false; };
  }, [ensure, index, slides]);

  useEffect(() => {
    const jobs = cache.current;
    return () => { for (const job of jobs.values()) void job.then(release); jobs.clear(); };
  }, []);

  // 전체 화면을 못 쓰는 환경에서도 창을 가득 채운 발표는 계속된다.
  useEffect(() => {
    const element = root.current!;
    element.focus({ preventScroll: true });
    const onChange = () => {
      if (document.fullscreenElement === element) entered.current = true;
      else if (entered.current && !document.fullscreenElement) close();
    };
    document.addEventListener('fullscreenchange', onChange);
    if (element.requestFullscreen) void element.requestFullscreen().catch(() => undefined);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [close]);

  useEffect(() => { wake(); return () => window.clearTimeout(idleTimer.current); }, [wake]);

  // 편집 화면의 단축키(지우기·되돌리기 등)가 발표 중에 문서를 바꾸지 않도록 여기서 끊는다.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Tab') { wake(); return; }
      // 조작 줄의 버튼에서 누른 Enter·Space는 그 버튼의 동작이다.
      if ((event.key === 'Enter' || event.key === ' ') && (event.target as HTMLElement).tagName === 'BUTTON') return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      else if (NEXT_KEYS.has(event.key)) { event.preventDefault(); go(indexRef.current + 1); }
      else if (PREV_KEYS.has(event.key)) { event.preventDefault(); go(indexRef.current - 1); }
      else if (event.key === 'Home') { event.preventDefault(); go(0); }
      else if (event.key === 'End') { event.preventDefault(); go(last); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close, go, last, wake]);

  const onStageClick = (event: MouseEvent) => {
    wake();
    go(indexRef.current + (event.clientX < window.innerWidth * PREV_ZONE ? -1 : 1));
  };
  const stop = (event: MouseEvent) => event.stopPropagation();
  const loading = shownId !== slides[index].id;

  return <div ref={root} className={idle ? 'presenter idle' : 'presenter'} role="dialog" aria-modal="true" aria-label="발표" tabIndex={-1}
    onPointerMove={wake} onClick={onStageClick}
    onDragOver={event => { event.preventDefault(); event.stopPropagation(); }}
    onDrop={event => { event.preventDefault(); event.stopPropagation(); }}>
    <div ref={holder} className="presenter-slide" data-testid="presenter-slide" data-slide={shownId ?? ''} />
    {loading && !message && <p className="presenter-note loading">장을 준비하고 있어요…</p>}
    {message && !loading && <p className="presenter-note" role="alert">이 장을 보여 주지 못했어요. {message}</p>}
    <div className="presenter-bar" onClick={stop}>
      <button aria-label="이전 장" disabled={index === 0} onClick={() => go(index - 1)}><Icon name="back" size={22} /></button>
      <span className="presenter-count" data-testid="presenter-count" aria-live="polite">{index + 1} / {slides.length}</span>
      <button aria-label="다음 장" disabled={index === last} onClick={() => go(index + 1)}><Icon name="forward" size={22} /></button>
      <button className="presenter-end" onClick={close}><Icon name="close" size={18} />끝내기</button>
    </div>
  </div>;
}
