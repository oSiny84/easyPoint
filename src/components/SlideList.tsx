// 하단 가로 슬라이드 목록(UI_REFERENCE §1). 작은 비트맵만 보관하고 장마다 살아 있는 캔버스를 두지 않는다.
// 문서는 변경 불가능한 값이므로 슬라이드 객체가 같으면 미리보기를 다시 만들지 않는다.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Slide } from '../domain/types';
import { renderSlide, type BlobResolver } from '../rendering/renderSlide';
import { Icon } from './Icon';
import { Menu, type MenuAnchor, type MenuItem } from './Menu';

const THUMBNAIL_SCALE = 0.1;
const DRAG_START_PX = 6;

function Thumbnail({ slide, resolve, cache, queue }: { slide: Slide; resolve: BlobResolver; cache: WeakMap<Slide, string>; queue: { current: Promise<unknown> } }) {
  const [url, setUrl] = useState(cache.get(slide));
  useEffect(() => {
    const known = cache.get(slide);
    if (known) { setUrl(known); return; }
    let active = true;
    // 한 번에 한 장씩 만들어 사진 디코딩 메모리를 제한한다.
    queue.current = queue.current.then(async () => {
      if (!active) return;
      const rendered = await renderSlide(slide, resolve, THUMBNAIL_SCALE);
      if (!rendered.ok) return;
      const data = rendered.canvas.toDataURL('image/png');
      rendered.canvas.width = rendered.canvas.height = 0;
      cache.set(slide, data);
      if (active) setUrl(data);
    });
    return () => { active = false; };
  }, [slide, resolve, cache, queue]);
  return url ? <img src={url} alt="" draggable={false} /> : <span className="thumb-empty" />;
}

export type SlideActions = { add: () => void; duplicate: (id: string) => void; remove: (id: string) => void; clear: (id: string) => void; move: (id: string, toIndex: number) => void };

// addLabel·badge·extraItems는 애니메이션 편집기가 쓴다(+ 타일 이름, 길게 보이기 배지, 장 메뉴에 더하는 항목). 주지 않으면 슬라이드 동작이다.
export function SlideList({ slides, currentId, resolve, onSelect, actions, readOnly, addLabel, badge, extraItems }: { slides: readonly Slide[]; currentId: string; resolve: BlobResolver; onSelect: (id: string) => void; actions: SlideActions; readOnly?: boolean;
  addLabel?: string; badge?: (slide: Slide) => string | undefined; extraItems?: (slide: Slide) => MenuItem[] }) {
  const cache = useRef(new WeakMap<Slide, string>());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const list = useRef<HTMLOListElement>(null);
  const drag = useRef<{ id: string; pointerId: number; startX: number; moved: boolean } | null>(null);
  // 새로 누를 때마다 지우므로 끈 뒤 click이 오지 않아도 다음 클릭을 삼키지 않는다.
  const dragged = useRef(false);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ anchor: MenuAnchor; id: string } | null>(null);

  // 끌린 장을 뺀 나머지 중 포인터 왼쪽에 있는 장의 수가 옮겨 갈 위치다.
  function targetIndex(id: string, clientX: number) {
    const items = [...list.current!.querySelectorAll<HTMLElement>('[data-slide-id]')].filter(item => item.dataset.slideId !== id);
    return items.filter(item => { const rect = item.getBoundingClientRect(); return rect.left + rect.width / 2 < clientX; }).length;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (readOnly) return;
    dragged.current = false;
    // 터치는 가로 스크롤에 쓰므로 장 메뉴의 왼쪽·오른쪽으로 옮긴다.
    if (event.button !== 0 || event.pointerType === 'touch') return;
    drag.current = { id, pointerId: event.pointerId, startX: event.clientX, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: ReactPointerEvent) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.moved && Math.abs(event.clientX - current.startX) < DRAG_START_PX) return;
    current.moved = true;
    const rect = list.current!.getBoundingClientRect();
    if (event.clientX < rect.left + 40) list.current!.scrollLeft -= 12;
    if (event.clientX > rect.right - 40) list.current!.scrollLeft += 12;
    setDropIndex(targetIndex(current.id, event.clientX));
  }
  function onPointerUp(event: ReactPointerEvent) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null; setDropIndex(null);
    if (!current.moved) return;
    dragged.current = true;
    actions.move(current.id, targetIndex(current.id, event.clientX));
  }

  const items = (id: string, index: number): MenuItem[] => [
    { label: '복제', onSelect: () => actions.duplicate(id) },
    { label: '삭제', onSelect: () => actions.remove(id) },
    { label: '내용 비우기', onSelect: () => actions.clear(id) },
    { label: '왼쪽으로', disabled: index === 0, onSelect: () => actions.move(id, index - 1) },
    { label: '오른쪽으로', disabled: index === slides.length - 1, onSelect: () => actions.move(id, index + 1) },
    ...(extraItems?.(slides[index]) ?? []),
  ];
  const others = dropIndex === null ? slides : slides.filter(slide => slide.id !== drag.current?.id);
  const markerBefore = dropIndex !== null ? others[dropIndex]?.id ?? 'end' : null;
  const menuIndex = menu ? slides.findIndex(slide => slide.id === menu.id) : -1;

  return <ol ref={list} className="slide-list" aria-label="슬라이드 목록">
    {slides.map((slide, index) => <li key={slide.id} data-slide-id={slide.id} className={markerBefore === slide.id ? 'drop-before' : undefined}>
      <button className={slide.id === currentId ? 'slide current' : 'slide'} aria-current={slide.id === currentId} aria-label={`${index + 1}번째 장`}
        onPointerDown={event => onPointerDown(event, slide.id)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { drag.current = null; setDropIndex(null); }}
        onClick={() => { if (!dragged.current) onSelect(slide.id); }}>
        <Thumbnail slide={slide} resolve={resolve} cache={cache.current} queue={queue} />
        <span className="slide-number">{index + 1}</span>
        {badge?.(slide) && <span className="slide-badge">{badge(slide)}</span>}
      </button>
      {!readOnly && <button className="slide-menu-button" aria-label={`${index + 1}번째 장 메뉴`} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setMenu({ id: slide.id, anchor: { x: rect.right, y: rect.top - 4, above: true, alignRight: true } }); }}><Icon name="more" size={16} /></button>}
    </li>)}
    <li className={markerBefore === 'end' ? 'drop-before' : undefined}>
      {!readOnly && <button className="slide add" aria-label={addLabel ?? '페이지 추가'} title={addLabel} onClick={actions.add}><Icon name="plus" size={22} /></button>}
    </li>
    {menu && menuIndex >= 0 && <Menu anchor={menu.anchor} label="장 메뉴" onClose={() => setMenu(null)} items={items(menu.id, menuIndex)} />}
  </ol>;
}
