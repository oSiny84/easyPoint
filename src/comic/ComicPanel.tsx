// 만화 패널(만화 계약 §8): 말풍선, 효과 그림, 효과 글씨, 칸 배치, 지금 크기. 숫자 입력은 없다.
import { libraryUrl } from '../assets/library';
import { COMIC_LAYOUTS } from '../domain/comicLimits';
import type { ComicLayout } from '../domain/comicTypes';
import { EFFECT_WORDS, type ComicItem } from './comicAssets';
import { pageCount } from './pageLayout';

const LAYOUT_LABEL: Record<ComicLayout, { label: string; hint: string }> = {
  rows3: { label: '3칸', hint: '세로 종이에 큰 칸 3개' },
  grid4: { label: '4칸', hint: '가로 종이에 2칸씩 2줄' },
  grid8: { label: '8칸', hint: '세로 종이에 2칸씩 4줄' },
};

type Props = {
  // undefined: 읽는 중, null: 읽지 못함(그리기는 그대로 된다).
  pack: readonly ComicItem[] | null | undefined; layout: ComicLayout; panelCount: number; disabled: boolean;
  onBubble: (item: ComicItem) => void; onEffect: (item: ComicItem) => void; onWord: (word: typeof EFFECT_WORDS[number]) => void; onLayout: (layout: ComicLayout) => void;
};

export function ComicPanel({ pack, layout, panelCount, disabled, onBubble, onEffect, onWord, onLayout }: Props) {
  const cards = (kind: ComicItem['kind'], onPick: (item: ComicItem) => void) => <div className="card-grid">
    {pack?.filter(item => item.kind === kind).map(item => <button key={item.id} className="element-card comic-card" disabled={disabled} aria-label={item.label} title={item.label} onClick={() => onPick(item)}>
      <img src={libraryUrl(item.thumbnail)} alt="" loading="lazy" draggable={false} />
    </button>)}
  </div>;

  return <div className="panel-body comic-panel">
    {pack === undefined && <p className="panel-note">만화 그림을 불러오고 있어요…</p>}
    {pack === null && <p className="panel-note">만화 그림을 불러오지 못했어요. 그리기와 글씨는 그대로 쓸 수 있어요.</p>}
    {pack && <>
      <h3>말풍선</h3>
      {cards('bubble', onBubble)}
      <p className="panel-note">누르면 칸에 들어가고 바로 말을 쓸 수 있어요. 말이 길면 말풍선을 키워요.</p>
      <h3>효과 그림</h3>
      {cards('effect', onEffect)}
    </>}
    <h3>효과 글씨</h3>
    <div className="comic-words" role="group" aria-label="효과 글씨">
      {EFFECT_WORDS.map(word => <button key={word.text} className="comic-word" disabled={disabled} style={{ color: word.color }} onClick={() => onWord(word)}>{word.text}</button>)}
    </div>
    <h3>칸 배치</h3>
    <div className="level-group" role="group" aria-label="칸 배치">
      {COMIC_LAYOUTS.map(value => <button key={value} className="chip" disabled={disabled} aria-pressed={layout === value} aria-label={`한 쪽에 ${LAYOUT_LABEL[value].label}`} title={LAYOUT_LABEL[value].hint} onClick={() => onLayout(value)}>{LAYOUT_LABEL[value].label}</button>)}
    </div>
    <p className="panel-note">종이 한 쪽에 들어가는 칸 수예요. {LAYOUT_LABEL[layout].hint}.</p>
    <p className="comic-size" data-testid="comic-size">{panelCount}칸 · {pageCount(panelCount, layout)}쪽</p>
    <p className="panel-note">칸을 다 그리면 위의 만화 보기로 종이에 모인 모습을 봐요.</p>
  </div>;
}
