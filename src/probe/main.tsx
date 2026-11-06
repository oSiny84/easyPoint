// Phase 2 기술 시험 화면. 측정 기록을 재현하기 위해 고정해 둔 코드이며 제품 코드가 아니다.
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Stage, Layer, Rect, Text, Line, Circle, Image as KonvaImage } from 'react-konva';
import Konva from 'konva';
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/700.css';
import { FONT, TEXT_LANG, WIDTH, HEIGHT, sample, layoutText, prepareFonts, type Slide, type Item, type PhotoItem, type TextItem } from './model';
import { download, loadImage, makePptx, makePdf, renderSlide } from './export';
import './style.css';

type DragStart = (event: Konva.KonvaEventObject<DragEvent>) => void;
function Photo({ item, onStart, onMove }: { item: PhotoItem; onStart: DragStart; onMove: (event: Konva.KonvaEventObject<DragEvent>) => void }) {
  const [image, setImage] = useState<HTMLImageElement>();
  useEffect(() => { let active = true; loadImage(item.source).then(value => { if (active) setImage(value); }); return () => { active = false; }; }, [item.source]);
  return <KonvaImage {...item} image={image} draggable onDragStart={onStart} onDragEnd={onMove} />;
}

function App() {
  const [slide, setSlide] = useState<Slide>(structuredClone(sample));
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<'select' | 'draw'>('select');
  const [edit, setEdit] = useState<TextItem | null>(null);
  const [composing, setComposing] = useState(false);
  const [status, setStatus] = useState('글꼴을 준비하고 있어요…');
  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(0.75);
  const stage = useRef<Konva.Stage>(null);
  const container = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const pointer = useRef<{ id: number; points: number[] } | null>(null);
  const draftLine = useRef<Konva.Line>(null);
  // 끌리는 요소만 별도 레이어로 옮겨 기존 요소 전체를 매 프레임 다시 그리지 않는다.
  const dragLayer = useRef<Konva.Layer>(null);
  const dragHome = useRef<{ layer: Konva.Layer; index: number } | null>(null);
  const startDrag: DragStart = event => { const node = event.target; const layer = node.getLayer()!; dragHome.current = { layer, index: node.zIndex() }; node.moveTo(dragLayer.current!); layer.batchDraw(); };
  function endDrag(event: Konva.KonvaEventObject<DragEvent>, id: string) { const node = event.target; const home = dragHome.current; if (home) { node.moveTo(home.layer); node.zIndex(home.index); home.layer.batchDraw(); dragLayer.current?.batchDraw(); dragHome.current = null; } update(id, { x: node.x(), y: node.y() }); }
  function showDraft(points: number[]) { const line = draftLine.current; if (!line) return; line.points(points); line.visible(points.length > 0); line.getLayer()?.batchDraw(); }

  useEffect(() => { prepareFonts(slide).then(() => { setReady(true); setStatus('준비됐어요. 글씨를 두 번 누르면 수정할 수 있어요.'); }).catch(error => setStatus(String(error))); }, []);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setScale(Math.min(0.85, (entries[0].contentRect.width - 32) / WIDTH)));
    observer.observe(container.current!); return () => observer.disconnect();
  }, []);

  // Phase 2 측정이 실제 앱 화면에 시험 문서를 넣기 위한 개발 전용 연결.
  useEffect(() => { if (import.meta.env.DEV) Object.assign((window as any).craftProbe, { setSlide, getScale: () => scale }); }, [scale]);

  function update(id: string, patch: Partial<Item>) {
    setSlide(value => ({ ...value, elements: value.elements.map(item => item.id === id ? { ...item, ...patch } as Item : item) }));
  }
  async function importFile(selected?: File) {
    if (!selected) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type) || selected.size > 20 * 1024 * 1024) { setStatus('20MB 이하 PNG·JPEG·WebP 사진을 골라 주세요.'); return; }
    try {
      const url = URL.createObjectURL(selected);
      let image: HTMLImageElement;
      try { image = await loadImage(url); } finally { URL.revokeObjectURL(url); }
      // Probe only: production header inspection belongs to Phase 5.
      if (image.width * image.height > 40_000_000) throw new Error('사진 크기가 너무 커요.');
      const ratio = Math.min(1, 2560 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
      canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
      const width = Math.min(440, canvas.width); const height = width * canvas.height / canvas.width;
      setSlide(value => ({ ...value, elements: [...value.elements, { id: crypto.randomUUID(), type: 'image', source: canvas.toDataURL('image/png'), x: 750, y: 220, width, height }] }));
      setStatus('사진을 넣었어요. 끌어서 움직여 보세요.');
    } catch (error) { setStatus(`사진 입력 실패: ${String(error)}`); }
  }
  async function finishEdit() {
    if (!edit || composing) return;
    try { await prepareFonts({ ...slide, elements: [edit] }); update(edit.id, edit); setEdit(null); }
    catch (error) { setStatus(String(error)); }
  }
  async function output(kind: 'auto' | 'explicit' | 'image' | 'pdf-png' | 'pdf-jpeg') {
    if (edit) { setStatus('먼저 글씨 입력 완료를 눌러 주세요.'); return; }
    setBusy(true); setStatus('파일을 만들고 있어요…');
    try {
      const start = performance.now(); const snapshot = structuredClone(slide);
      const blob = kind.startsWith('pdf') ? await makePdf(snapshot, kind === 'pdf-png' ? 'png' : 'jpeg') : await makePptx(snapshot, kind as 'auto' | 'explicit' | 'image');
      download(blob, `CanvaCraft-${kind}.${kind.startsWith('pdf') ? 'pdf' : 'pptx'}`);
      setStatus(`${kind} · ${(blob.size / 1024).toFixed(0)}KB · ${((performance.now() - start) / 1000).toFixed(2)}초`);
    } catch (error) { setStatus(`출력 실패: ${String(error)}`); } finally { setBusy(false); }
  }
  function position(event: React.PointerEvent) {
    const rect = event.currentTarget.getBoundingClientRect(); return [(event.clientX - rect.left) / scale, (event.clientY - rect.top) / scale];
  }

  return <main>
    <header><div className="brand">✳ CanvaCraft <span>기술 실험실</span></div><span className="badge">PHASE 02</span></header>
    <section className="intro"><p className="eyebrow">작은 생각을, 멋진 발표로</p><h1>사진도 붙이고, 마음껏 그려요.</h1><p>한글 입력과 그림, 파일 출력을 먼저 살펴보는 시험 화면이에요. 작업은 자동 저장되지 않아요.</p></section>
    <div className="workspace"><aside><h2>만들기 도구</h2>
      <button className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')}>↖ 선택 · 이동</button>
      <button onClick={() => file.current?.click()}>▧ 사진 넣기</button>
      <button className={tool === 'draw' ? 'active' : ''} onClick={() => { if (!edit) setTool('draw'); }}>〰 그림 그리기</button>
      <label>배경 색<input aria-label="배경 색" type="color" value={slide.background} onChange={event => setSlide(value => ({ ...value, background: event.target.value }))}/></label>
      <p className="hint">사진을 끌어놓거나 복사한 이미지를 붙여넣어도 돼요.</p><input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ''; }}/>
      <h2>시험할 출력</h2>{(['auto', 'explicit', 'image', 'pdf-png', 'pdf-jpeg'] as const).map((kind, i) => <button disabled={busy || !ready || !!edit} key={kind} onClick={() => void output(kind)}>{['PPT · 자동 줄바꿈', 'PPT · 줄 고정', 'PPT · 모양 그대로', 'PDF · PNG', 'PDF · JPEG'][i]}</button>)}
    </aside><div ref={container} className="canvas-area" tabIndex={0} onPaste={event => { if ((event.target as HTMLElement).tagName === 'TEXTAREA') return; const image = [...event.clipboardData.items].find(item => item.type.startsWith('image/')); if (image) { event.preventDefault(); void importFile(image.getAsFile() ?? undefined); } }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void importFile(event.dataTransfer.files[0]); }}>
      <div className="slide-top"><span>01 / 우리 가족 소개</span><span>{Math.round(scale * 100)}%</span></div>
      <div className="paper" lang={TEXT_LANG} style={{ width: WIDTH * scale, height: HEIGHT * scale }}>
        {ready && <Stage ref={stage} width={WIDTH * scale} height={HEIGHT * scale} scaleX={scale} scaleY={scale} listening={tool === 'select'}><Layer>
          <Rect width={WIDTH} height={HEIGHT} fill={slide.background}/>
          {slide.elements.map(item => item.type === 'text' ? <Text key={item.id} x={item.x} y={item.y} width={item.width} text={layoutText(item).lines.join('\n')} wrap="none" fontFamily={FONT} fontSize={item.fontSize} fontStyle={item.bold ? 'bold' : 'normal'} lineHeight={1.3} fill={item.color} visible={edit?.id !== item.id} draggable={!edit} onDragStart={startDrag} onDragEnd={event => endDrag(event, item.id)} onDblClick={() => setEdit({ ...item })} onDblTap={() => setEdit({ ...item })}/> : item.type === 'image' ? <Photo key={item.id} item={item} onStart={startDrag} onMove={event => endDrag(event, item.id)}/> : item.points.length === 2 ? <Circle key={item.id} x={item.points[0]} y={item.points[1]} radius={item.strokeWidth/2} fill={item.color}/> : <Line key={item.id} points={item.points} stroke={item.color} strokeWidth={item.strokeWidth} lineCap="round" lineJoin="round"/>)}
        </Layer><Layer ref={dragLayer}/><Layer listening={false}><Line ref={draftLine} visible={false} stroke="#ED8F65" strokeWidth={10} lineCap="round" lineJoin="round"/></Layer></Stage>}
        {tool === 'draw' && <div className="draw-surface" data-testid="draw-surface" onPointerDown={event => { if (pointer.current) return; event.currentTarget.setPointerCapture(event.pointerId); pointer.current = { id: event.pointerId, points: position(event) }; showDraft(pointer.current.points); }} onPointerMove={event => { if (pointer.current?.id !== event.pointerId) return; pointer.current.points.push(...position(event)); showDraft([...pointer.current.points]); }} onPointerUp={event => { if (pointer.current?.id !== event.pointerId) return; const points = pointer.current.points; setSlide(value => ({ ...value, elements: [...value.elements, { id: crypto.randomUUID(), type:'stroke', points, color:'#ED8F65', strokeWidth:10 }] })); pointer.current=null; requestAnimationFrame(() => showDraft([])); }} onPointerCancel={() => { pointer.current=null; showDraft([]); }}/ >}
        {edit && <textarea autoFocus aria-label="슬라이드 글씨" value={edit.text} onChange={event => setEdit({ ...edit, text: event.target.value })} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} style={{ left: edit.x*scale, top: edit.y*scale, width: edit.width, height: Math.max(180,layoutText(edit).height+30), fontSize:edit.fontSize,fontWeight:edit.bold?700:400,lineHeight:'1.3',color:edit.color,transform:`scale(${scale})` }} onKeyDown={event => { if (event.nativeEvent.isComposing || event.keyCode === 229) return; if (event.key === 'Escape') setEdit(null); }}/ >}
      </div>
      {edit && <button className="finish" disabled={composing} onClick={() => void finishEdit()}>글씨 입력 완료</button>}
      <p role="status">{status}</p>
    </div></div>
    <footer>실험 범위: 한글 · 사진 · 펜 입력 · PPTX/PDF 변환 <span>사진은 이 브라우저 안에서 처리돼요.</span></footer>
  </main>;
}

// Phase 2 automation uses the same production export functions; not included in production builds.
if (import.meta.env.DEV) Object.assign(window, { craftProbe: { sample, makePptx, makePdf, renderSlide, layoutText, prepareFonts } });
createRoot(document.getElementById('root')!).render(<App/>);
