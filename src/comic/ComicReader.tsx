// 만화 보기(만화 계약 §8). 시작할 때의 문서 스냅숏으로 쪽을 조립해 보여 준다. 문서를 바꾸지 않는다.
// 지금 칸이 들어 있는 쪽부터 연다. 칸을 누르면 닫히면서 그 칸으로 간다.
// 키 입력은 창 캡처 단계에서 끊어 편집 단축키가 닿지 않게 한다(발표·재생 화면과 같은 규칙).
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Icon } from '../components/Icon';
import type { ComicProject } from '../domain/comicTypes';
import type { BlobResolver } from '../rendering/renderSlide';
import { composePage } from './composePage';
import { pageCount, pageLayout, pageOfPanel, panelsPerPage } from './pageLayout';

// 포인트당 픽셀 수. 가로 A4가 1684×1190픽셀이 된다.
export const READER_PIXELS_PER_POINT = 2;
const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ']), PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp']);

type Props = { project: ComicProject; startSlideId: string; resolve: BlobResolver; onClose: (slideId: string) => void };

export function ComicReader({ project, startSlideId, resolve, onClose }: Props) {
  const { slides, layout } = project;
  const perPage = panelsPerPage(layout), pages = pageCount(slides.length, layout), paper = pageLayout(layout);
  const startPage = pageOfPanel(Math.max(0, slides.findIndex(slide => slide.id === startSlideId)), layout);
  const [page, setPage] = useState(startPage);
  const [problem, setProblem] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef(page);
  pageRef.current = page;

  // 들어온 쪽에서 닫으면 보던 칸으로, 다른 쪽에서 닫으면 그 쪽의 첫 칸으로 간다.
  const close = () => onClose(pageRef.current === startPage ? startSlideId : slides[pageRef.current * perPage].id);
  const closeRef = useRef(close);
  closeRef.current = close;
  const turn = (step: number) => setPage(current => Math.min(pages - 1, Math.max(0, current + step)));

  useEffect(() => {
    let active = true;
    void composePage(project, page, resolve, READER_PIXELS_PER_POINT).then(composed => {
      if (!active) { if (composed.ok) composed.canvas.width = composed.canvas.height = 0; return; }
      if (!composed.ok) { setProblem(composed.message); return; }
      const target = canvas.current!;
      target.width = composed.canvas.width; target.height = composed.canvas.height;
      target.getContext('2d')!.drawImage(composed.canvas, 0, 0);
      target.dataset.page = String(page + 1);
      composed.canvas.width = composed.canvas.height = 0;
      setProblem('');
    });
    return () => { active = false; };
  }, [project, page, resolve]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      else if (NEXT_KEYS.has(event.key)) { event.preventDefault(); turn(1); }
      else if (PREVIOUS_KEYS.has(event.key)) { event.preventDefault(); turn(-1); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // turn은 pages만 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  // 누른 자리가 어느 칸인지 종이 좌표(포인트)로 바꿔 찾는다.
  function pick(event: PointerEvent<HTMLCanvasElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width * paper.width, y = (event.clientY - box.top) / box.height * paper.height;
    const slot = paper.panels.findIndex(rect => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height);
    const slide = slot >= 0 ? slides[page * perPage + slot] : undefined;
    if (slide) onClose(slide.id);
  }

  return <div className="player-backdrop comic-reader" role="dialog" aria-modal="true" aria-label="만화 보기" data-testid="comic-reader" onPointerDown={event => { if (event.target === event.currentTarget) close(); }}>
    <canvas ref={canvas} className={`reader-page reader-${paper.width > paper.height ? 'wide' : 'tall'}`} width={paper.width * READER_PIXELS_PER_POINT} height={paper.height * READER_PIXELS_PER_POINT} data-testid="reader-page" onPointerDown={pick} />
    {problem && <p className="reader-problem" role="alert">{problem}</p>}
    <div className="player-bar">
      <button className="on-dark" aria-label="이전 쪽" disabled={page === 0} onClick={() => turn(-1)}>이전</button>
      <span className="player-position" data-testid="reader-position">{page + 1} / {pages}</span>
      <button className="on-dark" aria-label="다음 쪽" disabled={page === pages - 1} onClick={() => turn(1)}>다음</button>
      <button className="primary" onClick={close}><Icon name="close" size={18} />닫기</button>
    </div>
  </div>;
}
