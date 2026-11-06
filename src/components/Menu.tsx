// 위치를 지정해 띄우는 메뉴. 목록이 스크롤 영역 안에 있어도 잘리지 않도록 body에 그린다.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type MenuAnchor = { x: number; y: number; above?: boolean; alignRight?: boolean };
export type MenuItem = { label: string; onSelect: () => void; disabled?: boolean; hint?: string };

export function Popover({ anchor, onClose, label, children }: { anchor: MenuAnchor; onClose: () => void; label: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: anchor.x, top: anchor.y });

  // 화면 밖으로 나가지 않게 실제 크기를 재서 놓는다.
  useLayoutEffect(() => {
    const { width, height } = box.current!.getBoundingClientRect();
    const left = anchor.alignRight ? anchor.x - width : anchor.x;
    const top = anchor.above ? anchor.y - height : anchor.y;
    setPlace({ left: Math.max(8, Math.min(window.innerWidth - width - 8, left)), top: Math.max(8, Math.min(window.innerHeight - height - 8, top)) });
  }, [anchor]);

  useEffect(() => {
    const onDown = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) onClose(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('pointerdown', onDown, true); window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey, true); };
  }, [onClose]);

  return createPortal(<div ref={box} className="popover" role="dialog" aria-label={label} style={place}>{children}</div>, document.body);
}

export function Menu({ anchor, onClose, label, items }: { anchor: MenuAnchor; onClose: () => void; label: string; items: MenuItem[] }) {
  return <Popover anchor={anchor} onClose={onClose} label={label}>
    <div role="menu" aria-label={label} className="menu">
      {items.map(item => <button key={item.label} role="menuitem" disabled={item.disabled} title={item.hint} onClick={() => { onClose(); item.onSelect(); }}>{item.label}{item.hint && <small>{item.hint}</small>}</button>)}
    </div>
  </Popover>;
}
