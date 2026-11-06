// 왼쪽 패널의 그림을 끌어 슬라이드에 놓는다. 눌렀다 떼기만 하면 카드의 기존 click 동작(가운데 넣기)이 그대로다.
// 터치는 패널 스크롤에 쓰므로 끌기를 시작하지 않는다.
import type { PointerEvent as ReactPointerEvent } from 'react';
import { LIMITS } from '../domain/limits';
import { toLogical, type Point } from './geometry';

const START_DISTANCE = 6;

// 작업 영역 밖으로 잘린 부분에 놓은 것은 슬라이드에 놓은 것으로 보지 않는다.
function pointOnSlide(x: number, y: number): Point | null {
  const paper = document.querySelector('.paper');
  if (!paper) return null;
  const rect = paper.getBoundingClientRect();
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
  if (!document.elementFromPoint(x, y)?.closest('.work')) return null;
  return toLogical(x, y, rect, rect.width / LIMITS.slideWidth);
}

export function dragToSlide(down: ReactPointerEvent<HTMLElement>, size: { width: number; height: number }, onDrop: (point: Point) => void) {
  if (down.pointerType === 'touch' || down.button !== 0) return;
  const source = down.currentTarget.querySelector('img');
  if (!source) return;
  const startX = down.clientX, startY = down.clientY;
  let ghost: HTMLImageElement | null = null;

  const startGhost = () => {
    const paper = document.querySelector('.paper');
    const scale = paper ? paper.getBoundingClientRect().width / LIMITS.slideWidth : 1;
    ghost = document.createElement('img');
    ghost.src = source.src; ghost.alt = ''; ghost.className = 'drag-ghost'; ghost.dataset.testid = 'drag-ghost';
    ghost.style.width = `${size.width * scale}px`; ghost.style.height = `${size.height * scale}px`;
    document.body.append(ghost);
    document.body.classList.add('dragging-element');
  };
  const onMove = (event: PointerEvent) => {
    if (!ghost) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) < START_DISTANCE) return;
      startGhost();
    }
    const box = ghost!.getBoundingClientRect();
    ghost!.style.transform = `translate(${event.clientX - box.width / 2}px, ${event.clientY - box.height / 2}px)`;
    document.querySelector('.paper')?.classList.toggle('drop-target', !!pointOnSlide(event.clientX, event.clientY));
  };
  const finish = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', finish);
    window.removeEventListener('blur', finish);
    window.removeEventListener('keydown', onKey, true);
    if (!ghost) return;
    ghost.remove(); ghost = null;
    document.body.classList.remove('dragging-element');
    document.querySelector('.paper')?.classList.remove('drop-target');
    // 끌기를 끝낸 뒤 카드 위에서 손을 뗐을 때 따라오는 click이 그림을 한 번 더 넣지 않게 한다.
    const swallow = (event: MouseEvent) => { event.stopPropagation(); event.preventDefault(); };
    window.addEventListener('click', swallow, true);
    setTimeout(() => window.removeEventListener('click', swallow, true), 0);
  };
  const onUp = (event: PointerEvent) => {
    const point = ghost ? pointOnSlide(event.clientX, event.clientY) : null;
    finish();
    if (point) onDrop(point);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !ghost) return;
    event.stopPropagation();
    finish();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', finish);
  window.addEventListener('blur', finish);
  window.addEventListener('keydown', onKey, true);
}
