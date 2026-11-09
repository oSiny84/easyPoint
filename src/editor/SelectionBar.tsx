// 선택한 요소의 설정 줄(UI_REFERENCE §1·§4). 글씨를 고를 때는 글씨 설정이 앞에 붙는다.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import type { MenuItem } from '../components/Menu';
import { LIMITS } from '../domain/limits';
import type { StrokeElement, TextAlign, TextElement } from '../domain/types';
import { FONT_REGISTRY, hasBold, type FontId } from '../rendering/text/fonts';

export type ElementActions = { duplicate: () => void; forward: () => void; backward: () => void; remove: () => void; canForward: boolean; canBackward: boolean };
export type TextStylePatch = Partial<Pick<TextElement, 'fontId' | 'fontSize' | 'bold' | 'color' | 'align'>>;
export type StrokeStylePatch = Partial<Pick<StrokeElement, 'color' | 'strokeWidth'>>;

export const menuItems = (actions: ElementActions): MenuItem[] => [
  { label: '복제', onSelect: actions.duplicate },
  { label: '앞으로', disabled: !actions.canForward, onSelect: actions.forward },
  { label: '뒤로', disabled: !actions.canBackward, onSelect: actions.backward },
  { label: '삭제', onSelect: actions.remove },
];

const clampSize = (value: number) => Math.min(LIMITS.fontSizeMax, Math.max(LIMITS.fontSizeMin, value));
// 크기 버튼은 4px 간격으로 움직인다(계약 §3).
const stepUp = (value: number) => clampSize((Math.floor(value / 4) + 1) * 4);
const stepDown = (value: number) => clampSize((Math.ceil(value / 4) - 1) * 4);
// 입력 중인 글씨에서 초점을 빼앗지 않는다.
const keepFocus = { onPointerDown: (event: { preventDefault: () => void }) => event.preventDefault() };

// 영상 편집기의 자막 설정 줄도 같은 글씨 설정을 쓴다.
export function TextControls({ style, onStyle }: { style: Pick<TextElement, 'fontId' | 'fontSize' | 'bold' | 'color' | 'align'>; onStyle: (patch: TextStylePatch) => void }) {
  const [size, setSize] = useState(String(Math.round(style.fontSize * 10) / 10));
  const color = useRef<HTMLInputElement>(null);
  useEffect(() => { setSize(String(Math.round(style.fontSize * 10) / 10)); }, [style.fontSize]);
  // 색 고르는 창에서는 값이 계속 바뀌므로 창을 닫아 확정할 때 한 번만 바꾼다.
  useEffect(() => { color.current!.value = style.color.toLowerCase(); }, [style.color]);
  useEffect(() => {
    const input = color.current!; const commit = () => onStyle({ color: input.value.toUpperCase() });
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, [onStyle]);
  const commitSize = () => {
    const value = Number(size);
    if (Number.isFinite(value) && value > 0 && clampSize(value) !== style.fontSize) onStyle({ fontSize: clampSize(value) });
    else setSize(String(Math.round(style.fontSize * 10) / 10));
  };
  const aligns: [TextAlign, string][] = [['left', '왼쪽 정렬'], ['center', '가운데 정렬'], ['right', '오른쪽 정렬']];
  return <>
    <select className="font-select" aria-label="글꼴" value={style.fontId} onChange={event => {
      const fontId = event.target.value;
      // 굵은 파일이 없는 글꼴로 바꾸면 굵게를 끈다.
      onStyle(style.bold && !hasBold(fontId) ? { fontId, bold: false } : { fontId });
    }}>
      {(Object.keys(FONT_REGISTRY) as FontId[]).map(id => <option key={id} value={id} style={{ fontFamily: FONT_REGISTRY[id].family }}>{FONT_REGISTRY[id].label}</option>)}
    </select>
    <div className="size-control">
      <button className="icon-only" aria-label="글씨 작게" {...keepFocus} disabled={style.fontSize <= LIMITS.fontSizeMin} onClick={() => onStyle({ fontSize: stepDown(style.fontSize) })}>−</button>
      <input aria-label="글씨 크기" inputMode="numeric" value={size} onChange={event => setSize(event.target.value)} onBlur={commitSize} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitSize(); } }} />
      <button className="icon-only" aria-label="글씨 크게" {...keepFocus} disabled={style.fontSize >= LIMITS.fontSizeMax} onClick={() => onStyle({ fontSize: stepUp(style.fontSize) })}>+</button>
    </div>
    <button className="icon-only bold-button" aria-label="굵게" aria-pressed={style.bold} title={hasBold(style.fontId) ? '굵게' : '이 글꼴은 굵게 할 수 없어요'} disabled={!hasBold(style.fontId)} {...keepFocus} onClick={() => onStyle({ bold: !style.bold })}>가</button>
    <label className="color-button" title="글씨 색"><span style={{ background: style.color }} /><input ref={color} type="color" aria-label="글씨 색" defaultValue={style.color.toLowerCase()} /></label>
    <div className="align-group" role="group" aria-label="정렬">
      {aligns.map(([value, label]) => <button key={value} className="icon-only" aria-label={label} aria-pressed={style.align === value} {...keepFocus} onClick={() => onStyle({ align: value })}><Icon name={`align-${value}`} size={18} /></button>)}
    </div>
    <span className="bar-divider" />
  </>;
}

// 획의 색과 굵기. 그리기 패널의 펜 설정과는 별개로 이미 그린 획을 바꾼다.
function StrokeControls({ stroke, onStroke }: { stroke: StrokeElement; onStroke: (patch: StrokeStylePatch) => void }) {
  const color = useRef<HTMLInputElement>(null);
  useEffect(() => { color.current!.value = stroke.color.toLowerCase(); }, [stroke.color]);
  useEffect(() => {
    const input = color.current!; const commit = () => onStroke({ color: input.value.toUpperCase() });
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, [onStroke]);
  const change = (delta: number) => onStroke({ strokeWidth: Math.min(LIMITS.strokeWidthMax, Math.max(LIMITS.strokeWidthMin, stroke.strokeWidth + delta)) });
  return <>
    <label className="color-button" title="획 색"><span style={{ background: stroke.color }} /><input ref={color} type="color" aria-label="획 색" defaultValue={stroke.color.toLowerCase()} /></label>
    <div className="size-control" role="group" aria-label="획 굵기">
      <button className="icon-only" aria-label="획 가늘게" disabled={stroke.strokeWidth <= LIMITS.strokeWidthMin} onClick={() => change(-2)}>−</button>
      <span className="size-value" data-testid="stroke-width">{stroke.strokeWidth}</span>
      <button className="icon-only" aria-label="획 굵게" disabled={stroke.strokeWidth >= LIMITS.strokeWidthMax} onClick={() => change(2)}>+</button>
    </div>
    <span className="bar-divider" />
  </>;
}

export function SelectionBar({ actions, textStyle, onStyle, strokeStyle, onStrokeStyle }: { actions: ElementActions | null; textStyle?: TextElement | null; onStyle?: (patch: TextStylePatch) => void; strokeStyle?: StrokeElement | null; onStrokeStyle?: (patch: StrokeStylePatch) => void }) {
  // 글씨 설정이 붙으면 폭을 아끼려고 공통 버튼은 아이콘만 보여 준다.
  const text = (label: string) => textStyle ? null : label;
  return <div className="selection-bar" role="toolbar" aria-label="선택한 요소 설정">
    {textStyle && onStyle && <TextControls style={textStyle} onStyle={onStyle} />}
    {strokeStyle && onStrokeStyle && <StrokeControls stroke={strokeStyle} onStroke={onStrokeStyle} />}
    {actions && <>
      <button aria-label="복제" title="복제" {...keepFocus} onClick={actions.duplicate}><Icon name="duplicate" size={18} />{text('복제')}</button>
      <button aria-label="앞으로" title="앞으로" {...keepFocus} disabled={!actions.canForward} onClick={actions.forward}><Icon name="front" size={18} />{text('앞으로')}</button>
      <button aria-label="뒤로" title="뒤로" {...keepFocus} disabled={!actions.canBackward} onClick={actions.backward}><Icon name="backward" size={18} />{text('뒤로')}</button>
      <button aria-label="삭제" title="삭제" {...keepFocus} onClick={actions.remove}><Icon name="trash" size={18} />{text('삭제')}</button>
    </>}
  </div>;
}
