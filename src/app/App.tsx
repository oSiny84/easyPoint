// 편집 화면. 배치 기준은 docs/UI_REFERENCE.md다. 자동 저장·작품 목록은 Phase 8, 발표는 Phase 9에서 연결한다.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createAssetStore, type AssetStore } from '../assets/assetStore';
import { readPngText } from '../assets/imageHeader';
import { importAsset } from '../assets/importAsset';
import { loadBackgroundImage, loadBackgrounds, loadLibraryImage, loadTemplateFile, loadTemplates, placeInCenter, suggestedTextColor, type ColorVariant, type LibraryItem, type ProvidedBackground, type TemplateItem } from '../assets/library';
import type { Command } from '../commands/apply';
import { Icon } from '../components/Icon';
import { Menu, type MenuAnchor } from '../components/Menu';
import { SlideList, type SlideActions } from '../components/SlideList';
import { DEFAULT_FONT_ID, DEFAULT_LINE_HEIGHT, LIMITS } from '../domain/limits';
import { createProject } from '../domain/project';
import { fail, type Asset, type Project, type Slide, type SlideElement, type TextElement } from '../domain/types';
import { centeredAt, type Point } from '../editor/geometry';
import { DrawLayer, type NewStroke } from '../editor/DrawLayer';
import { menuItems, SelectionBar, type ElementActions, type StrokeStylePatch, type TextStylePatch } from '../editor/SelectionBar';
import { SelectionLayer } from '../editor/SelectionLayer';
import { SlideCanvas } from '../editor/SlideCanvas';
import { TextEditor, type TextEditorHandle } from '../editor/TextEditor';
import { caretOffsetAt, layoutText } from '../rendering/text/layoutText';
import type { ExportResult } from '../export/exportPptx';
import { createStore, type DispatchResult, type ProjectStore } from '../state/store';
import { listSummaries, openProject, requestPersistence, saveProject } from '../storage/database';
import { acquireSession, type SessionLock } from '../storage/locks';
import { createAutosave, type Autosave, type SaveState } from '../state/autosave';
import { renderSlide } from '../rendering/renderSlide';
import { downloadName } from '../storage/fileName';
import { deserializeProject, serializeProject } from '../storage/projectFile';
import { BackgroundPanel, DrawPanel, ElementsPanel, TemplatePanel, TextPanel, UploadPanel, type PenSettings, type TextPreset } from './panels';
import { Home } from './Home';
import { ToolRail, type ToolId } from './ToolRail';
import { Presenter } from './Presenter';
import { TopBar, type ExportKind, type ExportProgress } from './TopBar';

type Session = { store: ProjectStore; assets: AssetStore; lock: SessionLock };
const newId = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const ZOOM_MIN = 25, ZOOM_MAX = 200;
// 사진은 슬라이드의 60% 안에 들어가는 크기로 처음 넣는다.
const PHOTO_WIDTH = LIMITS.slideWidth * 0.6, PHOTO_HEIGHT = LIMITS.slideHeight * 0.6;
// 넓은 화면은 처음부터 패널을 연다. 태블릿 폭에서는 슬라이드 공간을 위해 닫아 둔다(UI_REFERENCE §6).
const PANEL_MIN_WINDOW = 1200;
const THUMBNAIL_SCALE = 0.25;
const CURRENT_KEY = 'canvacraft.current-project';
const MISSING_PHOTO = '이 사진의 자료를 찾을 수 없어요. 파일 업로드로 다시 넣어 주세요.';
const SAVE_LABEL: Record<SaveState, string> = { saved: '저장됨', dirty: '변경 있음', saving: '저장 중…', failed: '저장 실패' };

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const remember = (id: string | null) => { try { if (id) sessionStorage.setItem(CURRENT_KEY, id); else sessionStorage.removeItem(CURRENT_KEY); } catch { /* 새로고침 복원만 못 할 뿐이다. */ } };
const rememberedProject = () => { try { return sessionStorage.getItem(CURRENT_KEY); } catch { return null; } };
const isUntouched = (project: Project) => project.revision === 0 && project.slides.length === 1 && !project.slides[0].elements.length && project.slides[0].background.kind === 'solid' && project.slides[0].background.color === '#FFFFFF';

async function openSession(project: Project, assets?: Map<string, Blob>): Promise<Session> {
  const lock = await acquireSession(project.id);
  return { store: createStore(project, { newId, now, readOnly: lock.readOnly }), assets: createAssetStore(assets), lock };
}

// 입력 중에는 문서 단축키가 끼어들지 않는다. 한글 조합 중인 키도 제외한다.
function isTyping(event: KeyboardEvent) {
  const target = event.target as HTMLElement;
  return event.isComposing || event.keyCode === 229 || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

// 입력 중인 글씨. 새 글씨는 내용을 확정할 때 문서에 추가한다(계약 §3).
type TextEdit = { slideId: string; elementId: string | null; draft: TextElement; initialText: string; caret: number | null; placeholder: string; session: number };
const DRAFT_ID = 'draft';

function Editor({ value, onOpen, onHome, onNew, initialNote, initiallySaved }: { value: Session; onOpen: (project: Project, assets: Map<string, Blob>, note: string) => void; onHome: () => void; onNew: () => void; initialNote?: string; initiallySaved?: boolean }) {
  const { store, assets } = value;
  const readOnly = value.lock.readOnly;
  const project = useSyncExternalStore(store.subscribe, store.getProject);
  const [slideId, setSlideId] = useState(project.slides[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const [preview, setPreview] = useState<SlideElement | null>(null);
  const [elementMenu, setElementMenu] = useState<MenuAnchor | null>(null);
  const [tool, setTool] = useState<ToolId | null>(() => !value.lock.readOnly && window.innerWidth >= PANEL_MIN_WINDOW ? 'background' : null);
  const [photos, setPhotos] = useState<Asset[]>([]);
  const [drawMode, setDrawMode] = useState<'pen' | 'eraser'>('pen');
  const [pen, setPen] = useState<PenSettings>({ color: '#283B37', width: 8 });
  const [edit, setEdit] = useState<TextEdit | null>(null);
  const [provided, setProvided] = useState<ProvidedBackground[]>([]);
  const editRef = useRef<TextEdit | null>(null);
  editRef.current = edit;
  const editor = useRef<TextEditorHandle>(null);
  const afterComposition = useRef<(() => void) | null>(null);
  const editSession = useRef(0);
  const uploadTarget = useRef<'element' | 'background'>('element');
  const classified = useRef(new Set<string>());
  const [status, setStatus] = useState(initialNote ?? '');
  // 저장하지 않은 문서(열어 온 파일, 템플릿)는 첫 화면부터 저장됨으로 보이면 안 된다.
  const [saveState, setSaveState] = useState<SaveState>(() => initiallySaved || isUntouched(value.store.getProject()) ? 'saved' : 'dirty');
  const autosave = useRef<Autosave | null>(null);
  const [title, setTitle] = useState(project.title);
  const [exporting, setExporting] = useState<AbortController | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportNote, setExportNote] = useState('');
  const [presenting, setPresenting] = useState<{ project: Project; slideId: string } | null>(null);
  // 작품을 떠나면 만들던 파일도 멈춘다. 진행 표시가 사라진 채 나중에 파일이 내려오지 않게 한다.
  const exportingRef = useRef<AbortController | null>(null);
  exportingRef.current = exporting;
  useEffect(() => () => exportingRef.current?.abort(), []);
  const presentingRef = useRef(false);
  presentingRef.current = !!presenting;
  // 저장에 실패한 채 다른 작품으로 넘어가려 할 때 잠시 보관하는 다음 동작.
  const [pending, setPending] = useState<{ next: () => void } | null>(null);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [fitScale, setFitScale] = useState(0.5);
  const openInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const work = useRef<HTMLDivElement>(null);

  const slide = project.slides.find(item => item.id === slideId) ?? project.slides[0];
  const elementIndex = slide.elements.findIndex(item => item.id === selectedId);
  // 되돌리기로 사라진 요소의 선택은 저절로 풀린다.
  const selected = elementIndex >= 0 ? slide.elements[elementIndex] : null;
  const scale = zoom === 'fit' ? fitScale : zoom;
  useEffect(() => { setTitle(project.title); }, [project.title]);

  const report = useCallback((result: DispatchResult) => {
    if (!result.ok) { setStatus(result.message); return; }
    if (result.slideId) setSlideId(result.slideId);
    if (result.changed) setStatus('');
  }, []);
  const run = useCallback((command: Command) => {
    const current = store.getProject(); const result = store.dispatch(current.id, current.revision, command);
    report(result);
    return result;
  }, [store, report]);

  useEffect(() => { void loadBackgrounds().then(setProvided).catch(() => undefined); }, []);

  // 입력을 문서에 확정한다. 내용이 비었으면 새 글씨는 아무 기록도 남기지 않고, 기존 글씨는 취소할 수 있는 삭제가 된다.
  const commitEdit = useCallback(() => {
    const current = editRef.current;
    if (!current || !editor.current) return;
    const text = editor.current.value();
    editRef.current = null; setEdit(null);
    const blank = text.trim().length === 0;
    const { draft } = current;
    if (current.elementId === null) {
      if (blank) return;
      const result = run({ type: 'addText', slideId: current.slideId, x: draft.x, y: draft.y, width: draft.width, text, fontId: draft.fontId, fontSize: draft.fontSize, bold: draft.bold, color: draft.color, align: draft.align, lineHeight: draft.lineHeight });
      if (result.ok) setSelectedId(store.getProject().slides.find(item => item.id === current.slideId)!.elements.at(-1)!.id);
    } else {
      const result = run({ type: 'updateText', slideId: current.slideId, elementId: current.elementId, text, width: draft.width, fontId: draft.fontId, fontSize: draft.fontSize, bold: draft.bold, color: draft.color, align: draft.align });
      if (result.ok && blank) setSelectedId(null);
    }
    if (!blank && draft.y + layoutText({ ...draft, text }).height > LIMITS.slideHeight) setStatus('글씨가 슬라이드 아래로 넘쳤어요. 크기를 줄이거나 상자를 넓혀 보세요.');
  }, [run, store]);

  // 입력 중이면 끝낸 뒤 다음 일을 한다. 한글 조합 중에는 강제로 끊지 않고 조합이 끝나기를 기다린다(계약 §4).
  const flushEdit = useCallback((then?: () => void) => {
    if (!editRef.current) { then?.(); return; }
    if (editor.current?.isComposing()) {
      afterComposition.current = () => { commitEdit(); then?.(); };
      // 초점을 빼면 입력기가 조합을 마치고 compositionend를 보낸다. 오지 않을 때를 대비해 시간 제한을 둔다.
      editor.current.blur();
      setTimeout(() => { const pendingAction = afterComposition.current; afterComposition.current = null; pendingAction?.(); }, 300);
      return;
    }
    commitEdit(); then?.();
  }, [commitEdit]);
  const onCompositionFinished = useCallback(() => { const pendingAction = afterComposition.current; afterComposition.current = null; pendingAction?.(); }, []);

  const selectSlide = useCallback((id: string) => { flushEdit(() => { setSlideId(id); setSelectedId(null); setPreview(null); }); }, [flushEdit]);

  // 도구를 바꿀 때 입력을 먼저 끝낸다. 그리기 모드에서는 선택을 풀어 요소가 우연히 움직이지 않게 한다.
  const changeTool = useCallback((next: ToolId | null) => {
    flushEdit(() => {
      setTool(next);
      if (next === 'draw') { setSelectedId(null); setPreview(null); setDrawMode('pen'); }
    });
  }, [flushEdit]);
  const applyStrokeStyle = useCallback((patch: StrokeStylePatch) => {
    if (selectedRef.current) run({ type: 'updateStrokeStyle', slideId: slide.id, elementId: selectedRef.current, ...patch });
  }, [run, slide.id]);
  function addStroke(stroke: NewStroke) {
    run({ type: 'addStroke', slideId: slide.id, x: stroke.x, y: stroke.y, points: stroke.points, color: pen.color, strokeWidth: pen.width });
  }
  const eraseStroke = (elementId: string) => { run({ type: 'deleteElement', slideId: slide.id, elementId }); };

  function startTextEdit(element: TextElement, point: Point | null) {
    if (readOnly) return;
    setSelectedId(element.id);
    setEdit({ slideId: slide.id, elementId: element.id, draft: element, initialText: element.text, caret: point ? caretOffsetAt(element, point.x, point.y) : null, placeholder: '', session: ++editSession.current });
  }
  // 새 글씨는 슬라이드 가운데에서 입력을 시작한다. 내용이 생기기 전에는 문서를 바꾸지 않는다.
  function addTextBox(preset: TextPreset) {
    flushEdit(() => {
      const lineHeight = DEFAULT_LINE_HEIGHT; const height = preset.fontSize * lineHeight;
      let x = (LIMITS.slideWidth - preset.width) / 2, y = (LIMITS.slideHeight - height) / 2;
      while (slide.elements.some(item => item.type === 'text' && item.x === x && item.y === y)) { x += 20; y += 40; }
      const draft: TextElement = { id: DRAFT_ID, type: 'text', x, y, width: preset.width, text: '', fontId: DEFAULT_FONT_ID, fontSize: preset.fontSize, bold: preset.bold, color: preset.color ?? suggestedTextColor(slide.background, provided), align: preset.align, lineHeight };
      setSelectedId(null);
      setEdit({ slideId: slide.id, elementId: null, draft, initialText: '', caret: 0, placeholder: preset.placeholder, session: ++editSession.current });
    });
  }
  // 입력 중에는 초안에만 적용해 확정할 때 취소 한 번으로 묶는다. 입력 중이 아니면 바로 명령을 보낸다.
  const applyStyle = useCallback((patch: TextStylePatch) => {
    const current = editRef.current;
    if (current) { const next = { ...current, draft: { ...current.draft, ...patch } }; editRef.current = next; setEdit(next); return; }
    if (selectedRef.current) run({ type: 'updateText', slideId: slide.id, elementId: selectedRef.current, ...patch });
  }, [run, slide.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event) || (event.target as HTMLElement).tagName === 'SELECT') return;
      const key = event.key.toLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (key === 'z' && !event.shiftKey) { event.preventDefault(); report(store.undo()); }
        if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); report(store.redo()); }
        return;
      }
      if (event.key === 'Escape') {
        if (editRef.current) flushEdit();
        else if (tool === 'draw') changeTool(null);
        else setSelectedId(null);
        return;
      }
      // 선택한 글씨에서 Enter를 누르면 바로 입력을 시작한다.
      if (event.key === 'Enter' && selectedId) {
        const target = slide.elements.find(item => item.id === selectedId);
        if (target?.type === 'text' && (event.target as HTMLElement).tagName !== 'BUTTON') { event.preventDefault(); startTextEdit(target, null); }
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault();
        const result = run({ type: 'deleteElement', slideId: slide.id, elementId: selectedId });
        if (result.ok) setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // 패널을 열고 닫아도 남은 영역에 슬라이드를 맞춘다.
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setFitScale(Math.max(0.1, Math.min(width / LIMITS.slideWidth, height / LIMITS.slideHeight)));
    });
    observer.observe(work.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __canvacraft: { store, assets, currentSlideId: () => slide.id, selectedId: () => selectedId } });
  }, [store, assets, slide.id, selectedId]);

  // 문서의 자료 중 사용자 사진만 '넣은 사진' 목록에 보여 준다. 되돌려도 목록에서 다시 고를 수 있게 지우지 않는다.
  useEffect(() => {
    let active = true;
    void (async () => {
      const fresh = project.assetManifest.filter(asset => !classified.current.has(asset.id));
      if (!fresh.length) return;
      fresh.forEach(asset => classified.current.add(asset.id));
      const found: Asset[] = [];
      // 템플릿의 틀 그림은 라이선스 정보가 없는 것도 있어 목록으로 구분한다.
      const templateAssets = new Set((await loadTemplates().catch(() => [] as TemplateItem[])).flatMap(item => item.assets.map(asset => asset.assetId)));
      for (const asset of fresh) {
        if (templateAssets.has(asset.id)) continue;
        // 내장 그림·배경 PNG에는 라이선스 정보가 들어 있고, 재인코딩한 사용자 사진에는 없다.
        const blob = await assets.resolve(asset.id);
        // 자료를 잃은 사진은 넣어도 빈 칸이 되므로 목록에 내놓지 않는다.
        if (!blob) continue;
        if (asset.mime === 'image/png' && readPngText(new Uint8Array(await blob.arrayBuffer()), 'License')) continue;
        found.push(asset);
      }
      if (active && found.length) setPhotos(current => [...current, ...found.filter(asset => !current.some(item => item.id === asset.id))]);
    })();
    return () => { active = false; };
  }, [project.assetManifest, assets]);

  // 새 요소는 현재 장의 맨 앞에 넣고 바로 선택한다. 기존 내용은 그대로다.
  function placeImage(asset: Asset, blob: Blob | null, box: { x: number; y: number; width: number; height: number }) {
    if (blob) assets.put(asset.id, blob);
    if (!assets.has(asset.id)) { setStatus(MISSING_PHOTO); return false; }
    // 같은 그림을 연달아 넣어도 겹쳐 가려지지 않게 조금씩 옮긴다.
    let { x, y } = box;
    while (slide.elements.some(item => item.type === 'image' && item.assetId === asset.id && item.x === x && item.y === y)) { x += 20; y += 20; }
    const result = run({ type: 'addImage', slideId: slide.id, assetId: asset.id, asset, x, y, width: box.width, height: box.height });
    if (result.ok) setSelectedId(store.getProject().slides.find(item => item.id === slide.id)!.elements.at(-1)!.id);
    return result.ok;
  }
  const photoBox = (asset: Asset) => placeInCenter(asset.pixelWidth, asset.pixelHeight, PHOTO_WIDTH, PHOTO_HEIGHT);
  const placePhoto = (asset: Asset, blob: Blob | null) => placeImage(asset, blob, photoBox(asset));

  // 끌어다 놓으면 놓은 곳에, 누르기만 하면 가운데에 넣는다.
  async function addLibraryItem(item: LibraryItem, variant?: ColorVariant, at?: Point) {
    const loaded = await loadLibraryImage(item, variant);
    if (!loaded.ok) { setStatus(loaded.message); return; }
    const box = placeInCenter(item.width, item.height, item.defaultWidth, item.defaultHeight);
    placeImage(loaded.asset, loaded.blob, at ? centeredAt(box, at) : box);
  }
  async function useProvidedBackground(background: ProvidedBackground) {
    const loaded = await loadBackgroundImage(background);
    if (!loaded.ok) { setStatus(loaded.message); return; }
    assets.put(loaded.asset.id, loaded.blob);
    run({ type: 'setBackground', slideId: slide.id, background: { kind: 'image', assetId: loaded.asset.id, fit: 'center-cover' }, asset: loaded.asset });
  }
  const usePhotoBackground = (asset: Asset) => { if (!assets.has(asset.id)) { setStatus(MISSING_PHOTO); return; } run({ type: 'setBackground', slideId: slide.id, background: { kind: 'image', assetId: asset.id, fit: 'center-cover' }, asset }); };
  const setSolid = useCallback((color: string) => { run({ type: 'setBackground', slideId: slide.id, background: { kind: 'solid', color } }); }, [run, slide.id]);

  // 파일 선택·끌어놓기·붙여넣기가 모두 이 경로를 쓴다. 실패한 파일은 작업 중인 문서를 건드리지 않는다.
  async function importFiles(files: readonly Blob[], target: 'element' | 'background' = 'element') {
    for (const file of files) {
      const imported = await importAsset(file);
      if (!imported.ok) { setStatus(imported.message); continue; }
      assets.put(imported.asset.id, imported.blob);
      if (target === 'background') { usePhotoBackground(imported.asset); setStatus('배경을 바꿨어요.'); }
      else if (placePhoto(imported.asset, null)) setStatus('사진을 넣었어요.');
    }
  }
  const importFilesRef = useRef(importFiles);
  importFilesRef.current = importFiles;
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (presentingRef.current) return;
      const target = event.target as HTMLElement;
      // 글씨 입력 중 Ctrl+V는 일반 글씨 붙여넣기다.
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      const images = [...(event.clipboardData?.items ?? [])].filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => !!file);
      if (images.length) { event.preventDefault(); void importFilesRef.current(images); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);
  const openUpload = (target: 'element' | 'background') => { uploadTarget.current = target; uploadInput.current?.click(); };

  // 자동 저장. 첫 장이 바뀌었을 때만 작품 목록의 미리보기를 다시 만든다.
  useEffect(() => {
    if (readOnly) return;
    let thumbnailSlide: Slide | null = null;
    const known = new Set<string>();
    let persisted = false;
    const saver = createAutosave({
      getRevision: () => store.getProject().revision,
      initiallySaved: !!initiallySaved || isUntouched(store.getProject()),
      onState: (state, message) => { setSaveState(state); if (message) setStatus(message); },
      save: async () => {
        const snapshot = store.getProject();
        let thumbnail: { blob: Blob; revision: number } | undefined;
        if (snapshot.slides[0] !== thumbnailSlide) {
          const rendered = await renderSlide(snapshot.slides[0], assets.resolve, THUMBNAIL_SCALE).catch(() => null);
          if (rendered?.ok) {
            const blob = await new Promise<Blob | null>(resolve => rendered.canvas.toBlob(resolve, 'image/jpeg', 0.8));
            if (blob) { thumbnail = { blob, revision: snapshot.revision }; thumbnailSlide = snapshot.slides[0]; }
          }
        }
        const result = await saveProject(snapshot, assets.resolve, { thumbnail, knownAssets: known });
        if (result.ok && !persisted) { persisted = true; void requestPersistence(); }
        return result.ok ? result : { ok: false as const, message: result.message };
      },
    });
    autosave.current = saver;
    setSaveState(saver.getState());
    const stop = store.subscribe(() => saver.notifyChange());
    // 탭이 숨겨질 때도 저장을 시도한다. 탭 종료 이벤트에만 의존하지 않는다.
    const onHidden = () => { if (document.visibilityState === 'hidden') void saver.flush(); };
    const onLeave = (event: BeforeUnloadEvent) => { if (saver.getState() !== 'saved') event.preventDefault(); };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('beforeunload', onLeave);
    return () => { stop(); saver.dispose(); document.removeEventListener('visibilitychange', onHidden); window.removeEventListener('beforeunload', onLeave); };
  }, [store, assets, readOnly, initiallySaved]);

  // 저장을 마친 뒤 다음 화면으로 간다. 실패하면 내용을 잃지 않도록 먼저 묻는다.
  function afterSaved(next: () => void) {
    flushEdit(() => {
      void (async () => {
        const saved = readOnly || !autosave.current || isUntouched(store.getProject()) || await autosave.current.flush();
        if (saved) next(); else setPending({ next });
      })();
    });
  }
  function save() { flushEdit(() => { void autosave.current?.flush(); }); }
  function saveFile() { flushEdit(() => void saveFileNow()); }
  async function saveFileNow() {
    const result = await serializeProject(store.getProject(), assets.resolve);
    if (result.ok) download(result.blob, downloadName(store.getProject().title, 'canvacraft'));
    else setStatus(result.message);
  }
  async function openFile(file?: File) {
    if (!file) return;
    // 검사를 모두 통과한 뒤에만 현재 작품을 바꾼다. 실패하면 작업 중인 작품은 그대로다.
    const result = await deserializeProject(file, newId);
    if (!result.ok) { setStatus(result.message); return; }
    afterSaved(() => onOpen(result.project, result.assets, '작품 파일을 새 작품으로 열었어요.'));
  }
  async function openTemplate(template: TemplateItem) {
    try {
      const result = await deserializeProject(await loadTemplateFile(template), newId);
      if (!result.ok) { setStatus(result.message); return; }
      afterSaved(() => onOpen(result.project, result.assets, `${template.label} 템플릿을 새 작품으로 열었어요.`));
    } catch { setStatus('템플릿을 불러오지 못했어요. 다시 시도해 주세요.'); }
  }
  function present() { flushEdit(() => setPresenting({ project: store.getProject(), slideId: slide.id })); }
  function exportFile(kind: ExportKind) { flushEdit(() => void exportNow(kind)); }
  async function exportNow(kind: ExportKind) {
    const controller = new AbortController(); setExporting(controller); setStatus('파일을 만들고 있어요…');
    const snapshot = store.getProject();
    setExportNote(''); setExportProgress({ done: 0, total: snapshot.slides.length });
    const onProgress = (done: number, total: number) => { setExportProgress({ done, total }); setStatus(`파일을 만들고 있어요… ${done} / ${total}장`); };
    // 출력 라이브러리는 크므로 내려받을 때 불러온다. 앱을 연 뒤 새 버전이 배포되면 불러오지 못할 수 있다.
    let result: ExportResult;
    try {
      result = kind === 'pdf'
        ? await (await import('../export/exportPdf')).exportPdf(snapshot, assets.resolve, { onProgress }, controller.signal)
        : await (await import('../export/exportPptx')).exportPptx(snapshot, assets.resolve, kind === 'pptx' ? 'editable' : 'image', { onProgress }, controller.signal);
    } catch {
      result = fail('EXPORT_FAILED', '파일 만드는 도구를 불러오지 못했어요. 새로고침한 뒤 다시 시도해 주세요.');
    }
    setExporting(null); setExportProgress(null);
    if (!result.ok) { setStatus(result.message); setExportNote(result.message); return; }
    download(result.blob, downloadName(snapshot.title, kind === 'pdf' ? 'pdf' : 'pptx'));
    // 내려받기 창이 상태 줄을 가리므로 창 안에도 같은 안내를 보여 준다.
    const done = ['파일을 내려받았어요.', ...result.warnings].join(' ');
    setStatus(done); setExportNote(done);
  }

  const actions: ElementActions | null = selected && {
    canForward: elementIndex < slide.elements.length - 1,
    canBackward: elementIndex > 0,
    duplicate() {
      flushEdit(() => {
        const result = run({ type: 'duplicateElement', slideId: slide.id, elementId: selected.id });
        // 복제본은 원본 바로 앞(배열의 다음 위치)에 놓인다.
        if (result.ok) setSelectedId(store.getProject().slides.find(item => item.id === slide.id)!.elements[elementIndex + 1].id);
      });
    },
    forward() { flushEdit(() => { run({ type: 'reorderElement', slideId: slide.id, elementId: selected.id, toIndex: elementIndex + 1 }); }); },
    backward() { flushEdit(() => { run({ type: 'reorderElement', slideId: slide.id, elementId: selected.id, toIndex: elementIndex - 1 }); }); },
    // 입력 중 삭제는 입력을 버리고 지운다. 빈 글씨 확정과 겹쳐 기록이 둘 생기지 않게 한다.
    remove() { editRef.current = null; setEdit(null); const result = run({ type: 'deleteElement', slideId: slide.id, elementId: selected.id }); if (result.ok) setSelectedId(null); },
  };

  const slideActions: SlideActions = {
    add() { flushEdit(() => { run({ type: 'addSlide', afterSlideId: store.getProject().slides.at(-1)!.id }); setSelectedId(null); }); },
    duplicate(id) { flushEdit(() => { run({ type: 'duplicateSlide', slideId: id }); setSelectedId(null); }); },
    remove(id) { flushEdit(() => { run({ type: 'deleteSlide', slideId: id }); setSelectedId(null); }); },
    clear(id) { flushEdit(() => { run({ type: 'clearSlide', slideId: id }); setSelectedId(null); }); },
    move(id, toIndex) { flushEdit(() => { run({ type: 'reorderSlide', slideId: id, toIndex }); }); },
  };

  const onCanvasError = useCallback((message: string) => setStatus(message), []);

  const panel = tool === 'elements' ? <ElementsPanel onAdd={(item, variant, at) => void addLibraryItem(item, variant, at)} onError={onCanvasError} />
    : tool === 'template' ? <TemplatePanel onTemplate={template => void openTemplate(template)} onError={onCanvasError} />
    : tool === 'upload' ? <UploadPanel photos={photos} resolve={assets.resolve} onUpload={() => openUpload('element')} onPick={asset => { placePhoto(asset, null); }} photoBox={photoBox} onDropPhoto={(asset, at) => { placeImage(asset, null, centeredAt(photoBox(asset), at)); }} />
    : tool === 'background' ? <BackgroundPanel current={slide.background} photos={photos} resolve={assets.resolve} onSolid={setSolid} onProvided={background => void useProvidedBackground(background)} onPhoto={usePhotoBackground} onUpload={() => openUpload('background')} onError={onCanvasError} />
    : tool === 'text' ? <TextPanel onAdd={addTextBox} />
    : <DrawPanel mode={drawMode} pen={pen} onMode={setDrawMode} onPen={setPen} onExit={() => changeTool(null)} />;

  return <div className="app" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const files = [...event.dataTransfer.files]; if (files.length) void importFiles(files); }}>
    <TopBar title={title} onTitle={setTitle} onTitleCommit={() => run({ type: 'renameProject', title })} saveState={readOnly ? '읽기 전용' : isUntouched(project) ? '새 작품' : SAVE_LABEL[saveState]}
      canUndo={store.canUndo() || !!edit} canRedo={store.canRedo()} onUndo={() => flushEdit(() => report(store.undo()))} onRedo={() => flushEdit(() => report(store.redo()))}
      onOpenFile={() => openInput.current?.click()} onSaveFile={saveFile} onSave={save} readOnly={readOnly} saveDisabled={readOnly || saveState === 'saved' || saveState === 'saving'} onHome={() => afterSaved(onHome)} onNew={() => afterSaved(onNew)}
      exporting={!!exporting} exportProgress={exportProgress} exportNote={exportNote} onOpenDownload={() => setExportNote('')} onExport={exportFile} onCancelExport={() => exporting?.abort()} onPresent={present} />
    <input ref={openInput} data-testid="open-file" type="file" accept=".canvacraft" hidden onChange={event => { void openFile(event.target.files?.[0]); event.target.value = ''; }} />
    <input ref={uploadInput} data-testid="upload-file" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={event => { void importFiles([...(event.target.files ?? [])], uploadTarget.current); event.target.value = ''; }} />
    <div className="workspace">
      <ToolRail active={tool} onChange={changeTool} panel={panel} disabled={readOnly} />
      <main className="stage-area">
        <div className="selection-row">
          {!readOnly && <SelectionBar actions={actions} textStyle={edit?.draft ?? (selected?.type === 'text' ? selected : null)} onStyle={applyStyle} strokeStyle={selected?.type === 'stroke' ? selected : null} onStrokeStyle={applyStrokeStyle} />}
          <p className="status" role="status">{readOnly ? (value.lock.reason === 'other-tab' ? '다른 탭에서 편집 중이라 읽기만 할 수 있어요.' : '이 브라우저에서는 편집할 수 없어요. Chrome이나 Edge를 써 주세요.') : status}</p>
        </div>
        <div ref={work} className="work" data-testid="work" onPointerDownCapture={event => { if ((event.target as HTMLElement).tagName !== 'TEXTAREA') flushEdit(); }} onPointerDown={event => { if (event.target === event.currentTarget) setSelectedId(null); }}>
          <div className="paper-wrap" style={{ width: LIMITS.slideWidth * scale, height: LIMITS.slideHeight * scale }}>
            <SlideCanvas slide={slide} preview={preview} hiddenId={edit?.elementId} scale={scale} assets={assets} onError={onCanvasError} />
            {tool === 'draw'
              ? <DrawLayer slide={slide} scale={scale} mode={drawMode} color={pen.color} strokeWidth={pen.width} onStroke={addStroke} onErase={eraseStroke} />
              : <SelectionLayer slide={slide} manifest={project.assetManifest} selected={edit ? edit.draft : selected} preview={preview} scale={scale} onSelect={setSelectedId} onPreview={setPreview} onCommit={run} editing={!!edit}
                onMenu={(x, y) => setElementMenu({ x, y })} onEditText={(element, point) => startTextEdit(element, point)} />}
            {edit && <TextEditor key={edit.session} ref={editor} draft={edit.draft} scale={scale} initialText={edit.initialText} caret={edit.caret} placeholder={edit.placeholder}
              onInput={text => { const current = editRef.current; if (current) { const next = { ...current, draft: { ...current.draft, text } }; editRef.current = next; setEdit(next); } }}
              onCommitRequest={() => flushEdit()} onCompositionFinished={onCompositionFinished} />}
          </div>
        </div>
        <div className="bottom">
          <SlideList slides={project.slides} currentId={slide.id} resolve={assets.resolve} onSelect={selectSlide} actions={slideActions} readOnly={readOnly} />
          <div className="zoom" aria-label="화면 배율">
            <input type="range" aria-label="화면 배율" min={ZOOM_MIN} max={ZOOM_MAX} step={1} value={Math.round(scale * 100)} onChange={event => setZoom(Number(event.target.value) / 100)} />
            <span className="zoom-value" data-testid="zoom-value">{Math.round(scale * 100)}%</span>
            <button className="icon-only" aria-label="화면 맞춤" title="화면 맞춤" aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}><Icon name="fit" size={18} /></button>
            <button className="icon-only" aria-label="전체 화면" title="전체 화면" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen(); }}><Icon name="full" size={18} /></button>
          </div>
        </div>
      </main>
    </div>
    {pending && <div className="dialog-backdrop"><div className="dialog" role="alertdialog" aria-modal="true" aria-label="저장 실패">
      <h2>지금 작품을 저장하지 못했어요</h2>
      <p>이대로 넘어가면 마지막 변경이 사라질 수 있어요. 원본 파일을 내려받아 두면 나중에 다시 열 수 있어요.</p>
      <div className="dialog-actions">
        <button className="primary" onClick={() => void saveFileNow().then(() => { pending.next(); setPending(null); })}>원본 내려받고 넘어가기</button>
        <button className="outline" onClick={() => { pending.next(); setPending(null); }}>저장하지 않고 넘어가기</button>
        <button className="outline" onClick={() => setPending(null)}>취소</button>
      </div>
    </div></div>}
    {presenting && <Presenter project={presenting.project} startSlideId={presenting.slideId} resolve={assets.resolve} onClose={slideId => { setPresenting(null); selectSlide(slideId); }} />}
    {elementMenu && actions && <Menu anchor={elementMenu} label="요소 메뉴" onClose={() => setElementMenu(null)} items={menuItems(actions)} />}
  </div>;
}

type Screen = { kind: 'loading' } | { kind: 'home'; note?: string; key: number } | { kind: 'editor'; session: Session; note?: string; saved?: boolean; key: number };

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const editorKey = useRef(0);
  const current = useRef<Session | null>(null);

  const closeCurrent = useCallback(() => { current.current?.lock.release(); current.current?.assets.dispose(); current.current = null; }, []);
  const show = useCallback(async (project: Project, assets: Map<string, Blob> | undefined, note: string | undefined, saved: boolean) => {
    closeCurrent();
    const session = await openSession(project, assets);
    current.current = session;
    remember(project.id);
    setScreen({ kind: 'editor', session, note, saved, key: ++editorKey.current });
  }, [closeCurrent]);
  const showHome = useCallback((note?: string) => { closeCurrent(); remember(null); setScreen({ kind: 'home', note, key: ++editorKey.current }); }, [closeCurrent]);
  const showNew = useCallback(() => { void show(createProject(newId, now), undefined, undefined, true); }, [show]);
  const openSaved = useCallback(async (projectId: string, note: string) => {
    const opened = await openProject(projectId);
    if (opened.ok) await show(opened.project, opened.assets, note, true);
    else showHome(opened.message);
  }, [show, showHome]);

  useEffect(() => {
    void (async () => {
      // 새로고침은 쓰던 작품으로 돌아온다. 저장된 작품이 있으면 목록에서, 없으면 바로 새 작품으로 시작한다.
      const resume = rememberedProject();
      try {
        const summaries = await listSummaries();
        if (resume && summaries.some(row => row.projectId === resume)) { await openSaved(resume, '저장된 작품을 열었어요.'); return; }
        if (summaries.length) { showHome(); return; }
      } catch { /* 브라우저 저장소를 쓸 수 없어도 메모리 편집과 원본 다운로드는 유지한다. */ }
      showNew();
    })();
  }, [openSaved, showHome, showNew]);

  const openFile = useCallback(async (file: File) => {
    const result = await deserializeProject(file, newId);
    if (!result.ok) { showHome(result.message); return; }
    await show(result.project, result.assets, '작품 파일을 새 작품으로 열었어요.', false);
  }, [show, showHome]);
  const openTemplate = useCallback(async (template: TemplateItem) => {
    try {
      const result = await deserializeProject(await loadTemplateFile(template), newId);
      if (!result.ok) { showHome(result.message); return; }
      await show(result.project, result.assets, `${template.label} 템플릿을 새 작품으로 열었어요.`, false);
    } catch { showHome('템플릿을 불러오지 못했어요. 다시 시도해 주세요.'); }
  }, [show, showHome]);

  if (screen.kind === 'loading') return <p className="status" role="status">작품을 준비하고 있어요…</p>;
  if (screen.kind === 'home') return <Home key={screen.key} note={screen.note} onOpen={id => void openSaved(id, '저장된 작품을 열었어요.')} onNew={showNew} onFile={file => void openFile(file)} onTemplate={template => void openTemplate(template)} />;
  return <Editor key={screen.key} value={screen.session} initialNote={screen.note} initiallySaved={screen.saved}
    onOpen={(project, assets, note) => void show(project, assets, note, false)} onHome={() => showHome()} onNew={showNew} />;
}
