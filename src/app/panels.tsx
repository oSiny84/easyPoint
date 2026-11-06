// 왼쪽 세부 패널 내용(UI_REFERENCE §2·§3).
import { useEffect, useMemo, useRef, useState } from 'react';
import { categoriesOf, libraryUrl, loadBackgrounds, loadLibrary, loadTemplates, readRecent, rememberRecent, searchLibrary, type ColorVariant, type Library, type LibraryItem, type LibraryKind, type ProvidedBackground, type TemplateItem } from '../assets/library';
import type { Asset, Background } from '../domain/types';

const TABS: { id: LibraryKind | 'all'; label: string }[] = [{ id: 'all', label: '전체' }, { id: 'shape', label: '도형' }, { id: 'character', label: '캐릭터' }, { id: 'sticker', label: '스티커' }];

function useLoaded<T>(load: () => Promise<T>, onError: (message: string) => void) {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let active = true;
    load().then(result => { if (active) setValue(result); }).catch(() => { if (active) onError('그림 목록을 불러오지 못했어요. 새로고침해 주세요.'); });
    return () => { active = false; };
  }, [load, onError]);
  return value;
}

function ElementCard({ item, variant, onAdd }: { item: LibraryItem; variant?: ColorVariant; onAdd: (item: LibraryItem, variant?: ColorVariant) => void }) {
  // 도형 색을 고르면 그 색의 그림을 보여 준다. 기본 색은 작은 미리보기를 쓴다.
  const src = variant && variant.image !== item.image ? variant.image : item.thumbnail;
  return <button className="element-card" aria-label={item.label} title={item.label} onClick={() => onAdd(item, variant)}><img src={libraryUrl(src)} alt="" loading="lazy" draggable={false} /></button>;
}

export function ElementsPanel({ onAdd, onError }: { onAdd: (item: LibraryItem, variant?: ColorVariant) => void; onError: (message: string) => void }) {
  const library = useLoaded<Library>(loadLibrary, onError);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<LibraryKind | 'all'>('all');
  const [category, setCategory] = useState<string | null>(null);
  const [colorId, setColorId] = useState<string | null>(null);
  const [recent, setRecent] = useState(readRecent);

  const items = library?.assets ?? [];
  const results = useMemo(() => searchLibrary(items, { query, kind, category }), [items, query, kind, category]);
  const categories = useMemo(() => categoriesOf(items, kind), [items, kind]);
  const recentItems = recent.map(id => items.find(item => item.id === id)).filter((item): item is LibraryItem => !!item);
  const showsShapes = results.some(item => item.kind === 'shape');
  const variantOf = (item: LibraryItem) => item.colorVariants?.find(variant => variant.id === colorId);
  const add = (item: LibraryItem, variant?: ColorVariant) => { setRecent(rememberRecent(item.id)); onAdd(item, variant); };

  return <div className="panel-body">
    <input className="panel-search" type="search" aria-label="요소 검색" placeholder="고양이, 하트, 화살표…" value={query} onChange={event => setQuery(event.target.value)} />
    <div className="panel-tabs" role="tablist" aria-label="요소 종류">
      {TABS.map(tab => <button key={tab.id} role="tab" aria-selected={kind === tab.id} onClick={() => { setKind(tab.id); setCategory(null); }}>{tab.label}</button>)}
    </div>
    <div className="panel-chips" aria-label="분류">
      {categories.map(name => <button key={name} className="chip" aria-pressed={category === name} onClick={() => setCategory(category === name ? null : name)}>{name}</button>)}
    </div>
    {showsShapes && library && <div className="swatches" role="group" aria-label="도형 색">
      {Object.entries(library.palette).map(([id, color]) => <button key={id} className="swatch" aria-label={`도형 색 ${id}`} aria-pressed={colorId === id} style={{ background: color }} onClick={() => setColorId(colorId === id ? null : id)} />)}
    </div>}
    {!query && kind === 'all' && !category && recentItems.length > 0 && <section aria-label="최근 사용"><h3>최근 사용</h3><div className="card-grid">
      {recentItems.map(item => <ElementCard key={item.id} item={item} variant={variantOf(item)} onAdd={add} />)}
    </div></section>}
    <section aria-label="요소 목록">
      <h3>{results.length}개</h3>
      {library && results.length === 0 && <p className="panel-note">찾는 그림이 없어요. 다른 말로 찾아보세요.</p>}
      <div className="card-grid">{results.map(item => <ElementCard key={item.id} item={item} variant={variantOf(item)} onAdd={add} />)}</div>
    </section>
    <p className="panel-note"><a href={libraryUrl('/library/licenses/fluent-emoji-MIT.txt')} target="_blank" rel="noreferrer">그림 출처와 사용 조건</a></p>
  </div>;
}

const SOLID_COLORS = ['#FFFFFF', '#FFF8E8', '#FDE2E4', '#FFE5B4', '#FFF3B0', '#D8F3DC', '#CFEFFF', '#E2D9FF', '#F1F3F5', '#ADB5BD', '#334155', '#000000'];

const matches = (item: { label: string; category: string; tags: string[] }, query: string) => {
  const words = query.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const haystack = [item.label, item.category, ...item.tags].join(' ').normalize('NFKC').toLowerCase();
  return words.every(word => haystack.includes(word));
};

// 제공 배경 24종. 분류를 고르거나 검색해서 찾고, 고르면 지금 장의 배경만 바뀐다.
export function ProvidedBackgrounds({ onPick, onError }: { onPick: (background: ProvidedBackground) => void; onError: (message: string) => void }) {
  const backgrounds = useLoaded(loadBackgrounds, onError);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const groups = useMemo(() => [...new Set((backgrounds ?? []).map(item => item.category))], [backgrounds]);
  const shown = (backgrounds ?? []).filter(item => (!category || item.category === category) && matches(item, query));
  return <>
    <input className="panel-search" type="search" aria-label="배경 검색" placeholder="우주, 바다, 생일…" value={query} onChange={event => setQuery(event.target.value)} />
    <div className="panel-chips" aria-label="배경 분류">
      {groups.map(name => <button key={name} className="chip" aria-pressed={category === name} onClick={() => setCategory(category === name ? null : name)}>{name}</button>)}
    </div>
    {backgrounds && shown.length === 0 && <p className="panel-note">찾는 배경이 없어요.</p>}
    <div className="background-grid">
      {shown.map(item => <button key={item.id} className="background-card" aria-label={`배경 ${item.label}`} title={item.label} onClick={() => onPick(item)}><img src={libraryUrl(item.thumbnail)} alt="" loading="lazy" draggable={false} /></button>)}
    </div>
  </>;
}

// 시작 템플릿은 지금 작품을 바꾸지 않고 새 작품으로 연다.
export function DesignPanel({ onTemplate, onPick, onError }: { onTemplate: (template: TemplateItem) => void; onPick: (background: ProvidedBackground) => void; onError: (message: string) => void }) {
  const templates = useLoaded(loadTemplates, onError);
  return <div className="panel-body">
    <h3>새 작품으로 시작</h3>
    <div className="background-grid">
      {(templates ?? []).map(item => <button key={item.id} className="template-card" aria-label={`템플릿 ${item.label}`} onClick={() => onTemplate(item)}><img src={libraryUrl(item.thumbnail)} alt="" loading="lazy" draggable={false} /><span>{item.label}</span></button>)}
    </div>
    <h3>지금 장의 배경</h3>
    <ProvidedBackgrounds onPick={onPick} onError={onError} />
  </div>;
}

// 넣은 사진의 작은 미리보기. 원본 크기로 디코딩한 사진을 목록에 붙잡아 두지 않는다.
function AssetThumb({ asset, resolve }: { asset: Asset; resolve: (id: string) => Promise<Blob | undefined> }) {
  const [url, setUrl] = useState(thumbCache.get(asset.id));
  useEffect(() => {
    if (thumbCache.has(asset.id)) return;
    let active = true;
    void (async () => {
      const blob = await resolve(asset.id);
      if (!blob) return;
      const bitmap = await createImageBitmap(blob, asset.pixelWidth >= asset.pixelHeight ? { resizeWidth: 160, resizeQuality: 'medium' } : { resizeHeight: 160, resizeQuality: 'medium' });
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0); bitmap.close();
      const data = canvas.toDataURL(asset.mime === 'image/png' ? 'image/png' : 'image/jpeg', 0.8);
      thumbCache.set(asset.id, data);
      if (active) setUrl(data);
    })().catch(() => undefined);
    return () => { active = false; };
  }, [asset, resolve]);
  return url ? <img src={url} alt="" draggable={false} /> : <span className="thumb-empty" />;
}
const thumbCache = new Map<string, string>();

function PhotoGrid({ photos, resolve, label, onPick }: { photos: Asset[]; resolve: (id: string) => Promise<Blob | undefined>; label: string; onPick: (asset: Asset) => void }) {
  return <div className="photo-grid">{photos.map((asset, index) => <button key={asset.id} className="photo-card" aria-label={`${label} ${index + 1}`} onClick={() => onPick(asset)}><AssetThumb asset={asset} resolve={resolve} /></button>)}</div>;
}

export function UploadPanel({ photos, resolve, onUpload, onPick }: { photos: Asset[]; resolve: (id: string) => Promise<Blob | undefined>; onUpload: () => void; onPick: (asset: Asset) => void }) {
  return <div className="panel-body">
    <button className="primary wide" onClick={onUpload}>파일 업로드</button>
    <p className="panel-note">사진을 끌어다 놓거나 복사한 그림을 Ctrl+V로 붙여 넣어도 돼요. 붙여넣기가 안 되면 파일 업로드를 써 주세요.</p>
    <h3>넣은 사진</h3>
    {photos.length === 0 ? <p className="panel-note">아직 넣은 사진이 없어요.</p> : <PhotoGrid photos={photos} resolve={resolve} label="넣은 사진" onPick={onPick} />}
  </div>;
}

export function BackgroundPanel({ current, photos, resolve, onSolid, onProvided, onPhoto, onUpload, onError }: { current: Background; photos: Asset[]; resolve: (id: string) => Promise<Blob | undefined>; onSolid: (color: string) => void; onProvided: (background: ProvidedBackground) => void; onPhoto: (asset: Asset) => void; onUpload: () => void; onError: (message: string) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  // 색 고르는 창에서는 값이 계속 바뀌므로 창을 닫아 확정할 때 한 번만 명령을 보낸다.
  useEffect(() => {
    const input = picker.current!; const commit = () => onSolid(input.value);
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, [onSolid]);
  const solid = current.kind === 'solid' ? current.color : '#FFFFFF';
  useEffect(() => { picker.current!.value = solid.toLowerCase(); }, [solid]);
  return <div className="panel-body">
    <h3>단색</h3>
    <div className="swatches" role="group" aria-label="배경 색">
      {SOLID_COLORS.map(color => <button key={color} className="swatch" aria-label={`배경 색 ${color}`} aria-pressed={current.kind === 'solid' && current.color === color} style={{ background: color }} onClick={() => onSolid(color)} />)}
      <label className="swatch custom" title="다른 색 고르기"><input ref={picker} type="color" aria-label="다른 배경 색" defaultValue={solid.toLowerCase()} /></label>
    </div>
    <ProvidedBackgrounds onPick={onProvided} onError={onError} />
    <h3>사진 배경</h3>
    <button className="wide outline" onClick={onUpload}>사진 골라서 배경으로</button>
    {photos.length > 0 && <PhotoGrid photos={photos} resolve={resolve} label="배경으로 쓸 사진" onPick={onPhoto} />}
  </div>;
}

export type TextPreset = { label: string; placeholder: string; width: number; fontSize: number; bold: boolean; align: 'left' | 'center'; color?: string };
export const TEXT_PRESETS: TextPreset[] = [
  { label: '제목 추가', placeholder: '제목을 입력하세요', width: 900, fontSize: 64, bold: true, align: 'center' },
  { label: '부제목 추가', placeholder: '부제목을 입력하세요', width: 800, fontSize: 40, bold: true, align: 'center' },
  { label: '본문 추가', placeholder: '내용을 입력하세요', width: 700, fontSize: 28, bold: false, align: 'left' },
];
const TEXT_STYLES: TextPreset[] = [
  { label: '아주 큰 글씨', placeholder: '크게 쓰기', width: 1000, fontSize: 96, bold: true, align: 'center' },
  { label: '주황 강조', placeholder: '강조할 말', width: 800, fontSize: 48, bold: true, align: 'center', color: '#E8590C' },
  { label: '파랑 강조', placeholder: '강조할 말', width: 800, fontSize: 48, bold: true, align: 'center', color: '#1C7ED6' },
  { label: '작은 설명', placeholder: '설명을 입력하세요', width: 600, fontSize: 20, bold: false, align: 'left' },
];

export function TextPanel({ onAdd }: { onAdd: (preset: TextPreset) => void }) {
  return <div className="panel-body">
    <div className="text-presets">
      {TEXT_PRESETS.map(preset => <button key={preset.label} className="text-preset" style={{ fontSize: Math.min(26, 12 + preset.fontSize / 4), fontWeight: preset.bold ? 700 : 400 }} onClick={() => onAdd(preset)}>{preset.label}</button>)}
    </div>
    <h3>글씨 스타일</h3>
    <div className="text-presets">
      {TEXT_STYLES.map(preset => <button key={preset.label} className="text-preset" style={{ fontSize: Math.min(22, 11 + preset.fontSize / 5), fontWeight: preset.bold ? 700 : 400, color: preset.color }} onClick={() => onAdd(preset)}>{preset.label}</button>)}
    </div>
    <p className="panel-note">글씨를 두 번 누르면 고칠 수 있어요. Esc를 누르거나 다른 곳을 누르면 입력이 끝나요.</p>
  </div>;
}

export type PenSettings = { color: string; width: number };
const PEN_COLORS = ['#283B37', '#000000', '#FFFFFF', '#E03131', '#F76707', '#FCC419', '#37B24D', '#1C7ED6', '#7048E8', '#E64980', '#8D6E4F', '#ADB5BD'];
const PEN_WIDTHS = [4, 8, 16, 32];

export function DrawPanel({ mode, pen, onMode, onPen, onExit }: { mode: 'pen' | 'eraser'; pen: PenSettings; onMode: (mode: 'pen' | 'eraser') => void; onPen: (pen: PenSettings) => void; onExit: () => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const latest = useRef(pen);
  latest.current = pen;
  useEffect(() => { picker.current!.value = pen.color.toLowerCase(); }, [pen.color]);
  useEffect(() => {
    const input = picker.current!; const commit = () => onPen({ ...latest.current, color: input.value.toUpperCase() });
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, [onPen]);
  return <div className="panel-body">
    <div className="panel-tabs two" role="group" aria-label="그리기 도구">
      <button aria-pressed={mode === 'pen'} onClick={() => onMode('pen')}>펜</button>
      <button aria-pressed={mode === 'eraser'} onClick={() => onMode('eraser')}>획 지우개</button>
    </div>
    <p className="panel-note">{mode === 'pen' ? '슬라이드 위에 그려 보세요.' : '지울 획을 누르거나 문지르세요. 사진과 글씨는 지워지지 않아요.'}</p>
    <h3>색</h3>
    <div className="swatches" role="group" aria-label="펜 색">
      {PEN_COLORS.map(color => <button key={color} className="swatch" aria-label={`펜 색 ${color}`} aria-pressed={pen.color === color} style={{ background: color }} onClick={() => { onPen({ ...pen, color }); onMode('pen'); }} />)}
      <label className="swatch custom" title="다른 색 고르기"><input ref={picker} type="color" aria-label="다른 펜 색" defaultValue={pen.color.toLowerCase()} /></label>
    </div>
    <h3>굵기</h3>
    <div className="width-presets" role="group" aria-label="펜 굵기">
      {PEN_WIDTHS.map(width => <button key={width} aria-label={`펜 굵기 ${width}`} aria-pressed={pen.width === width} onClick={() => { onPen({ ...pen, width }); onMode('pen'); }}><span style={{ width: Math.min(28, width), height: Math.min(28, width), background: pen.color === '#FFFFFF' ? '#ADB5BD' : pen.color }} /></button>)}
    </div>
    <label className="width-slider">자세히<input type="range" aria-label="펜 굵기 자세히" min={1} max={64} value={pen.width} onChange={event => onPen({ ...pen, width: Number(event.target.value) })} /><span>{pen.width}</span></label>
    <button className="wide outline" onClick={onExit}>선택으로 돌아가기</button>
  </div>;
}
