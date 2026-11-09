// 밈 패널(영상 기획안 §3): 찾기, 분류 칩(고양이·강아지·리액션·효과), 카드. 누르면 화면 가운데에, 끌어다 놓으면 놓은 곳에 넣는다.
// 스티커 카드는 움직이는 WebP가 그대로 움직이고, 밈 영상 카드는 마우스를 올리거나 누르면 소리 없이 움직임을 보여 준다.
import { useMemo, useState } from 'react';
import { builtinUrl, type MemeCategory, type MemeItem } from './builtins';

export const MEME_DRAG_TYPE = 'application/x-canvacraft-meme';
const CATEGORIES: { id: MemeCategory | 'all'; label: string }[] = [
  { id: 'all', label: '전체' }, { id: 'cat', label: '고양이' }, { id: 'dog', label: '강아지' }, { id: 'reaction', label: '리액션' }, { id: 'effect', label: '효과' },
];

type Props = { memes: readonly MemeItem[] | null; disabled: boolean; onAdd: (item: MemeItem) => void };

export function MemePanel({ memes, disabled, onAdd }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<MemeCategory | 'all'>('all');
  const shown = useMemo(() => {
    const words = query.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean);
    return (memes ?? []).filter(item => !item.hidden && (category === 'all' || item.category === category) && words.every(word => [item.label, ...item.tags].join(' ').toLowerCase().includes(word)));
  }, [memes, query, category]);
  if (memes === null) return <div className="panel-body"><p className="panel-note">밈 목록을 불러오지 못했어요. 새로고침해 보세요.</p></div>;
  return <div className="panel-body">
    <input className="panel-search" type="search" aria-label="밈 찾기" placeholder="밈 찾기" value={query} onChange={event => setQuery(event.target.value)} />
    <div className="chips" role="group" aria-label="밈 분류">
      {CATEGORIES.map(item => <button key={item.id} className="chip" aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.label}</button>)}
    </div>
    <p className="panel-note">지금은 연습용으로 만든 밈이에요.</p>
    <ul className="meme-grid" aria-label="밈 목록">
      {shown.map(item => <li key={item.id}>
        <button className="meme-card" disabled={disabled} aria-label={`${item.kind === 'clip' ? '밈 영상' : '스티커'} ${item.label} 넣기`} draggable={!disabled}
          onDragStart={event => { event.dataTransfer.setData(MEME_DRAG_TYPE, item.id); event.dataTransfer.effectAllowed = 'copy'; }}
          onClick={() => onAdd(item)}>
          {item.kind === 'sticker'
            ? <img src={builtinUrl('memes', item.file)} alt="" draggable={false} />
            : <video src={builtinUrl('memes', item.file)} muted loop playsInline preload="metadata" onMouseEnter={event => void event.currentTarget.play().catch(() => undefined)} onMouseLeave={event => event.currentTarget.pause()} onPointerDown={event => void event.currentTarget.play().catch(() => undefined)} />}
          <span>{item.label}{item.kind === 'clip' ? ' 🔊' : ''}</span>
        </button>
      </li>)}
      {!shown.length && <li className="panel-note">찾는 밈이 없어요.</li>}
    </ul>
  </div>;
}
