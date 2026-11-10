// 영상 편집 화면(영상 기획안 §3). 상단 바·왼쪽 도구·가운데 작업 공간·아래 띠는 슬라이드 편집기와 같은 모양이고, 아래 띠만 타임라인이다.
// 영상 가져오기(파일 선택·끌어놓기), 미리보기 재생, 타임라인(재생 막대·확대·다듬기), 자르기·지우기·순서·조각 소리(V4),
// 자막 추가·입력·서식·끌기·크기·보이는 시간(V5), 움직이는 밈·밈 영상·효과음·원본 소리·배경음악(V6), MP4/WebM 내보내기(V7).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { Icon } from '../components/Icon';
import { Menu, type MenuAnchor } from '../components/Menu';
import { ToolRail, type Tool } from '../app/ToolRail';
import { TextControls, type TextStylePatch } from '../editor/SelectionBar';
import { TextEditor, type TextEditorHandle } from '../editor/TextEditor';
import type { VideoCommand } from '../commands/videoApply';
import { clipLength, clipStarts, locate, totalMs } from '../domain/timeline';
import { CANVAS, CLIP_SPEEDS, VIDEO_LIMITS } from '../domain/videoLimits';
import type { AudioSettings, CaptionOverlay, ClipSpeed, Media, MemeOverlay, Overlay, VideoProject } from '../domain/videoTypes';
import { centeredAt, toLogical, type Point } from '../editor/geometry';
import { layoutText } from '../rendering/text/layoutText';
import { createAutosave, type Autosave, type SaveState } from '../state/autosave';
import type { VideoDispatchResult, VideoStore } from '../state/videoStore';
import { requestPersistence } from '../storage/database';
import { downloadName } from '../storage/fileName';
import type { SessionLock } from '../storage/locks';
import { formatBytes, formatDuration } from './format';
import { frameAt } from './frameAt';
import { importMedia } from './importMedia';
import { freeBytes, readMedia } from './mediaStore';
import { PreviewPlayer, type PlayerState } from './previewPlayer';
import { saveVideoProject } from './videoDatabase';
import { exportVideo } from './exportVideo';
import { expectedFileBytes, serializeVideoProject } from './videoFile';
import { builtinBlob, type Builtins, type MemeItem } from './builtins';
import { cachedCaption } from './captionImage';
import { MEME_DRAG_TYPE, MemePanel } from './MemePanel';
import { MemePreview } from './memePreview';
import { SoundPanel } from './SoundPanel';
import { drawOverlays, isVisible, type ComposeAssets } from './compose';
import { OverlayLayer } from './OverlayLayer';
import { VideoTimeline } from './VideoTimeline';
import { readLengthLimit } from './lengthSetting';
import { clampZoom, stepOfZoom, zoomAtStep, zoomRange, ZOOM_STEPS } from './timelineScale';

export type VideoSession = { store: VideoStore; lock: SessionLock };
type VideoToolId = 'video' | 'caption' | 'meme' | 'sound';
const VIDEO_TOOLS: readonly Tool<VideoToolId>[] = [
  { id: 'video', label: '영상', icon: 'video' },
  { id: 'caption', label: '자막', icon: 'caption' },
  { id: 'meme', label: '밈', icon: 'meme' },
  { id: 'sound', label: '소리', icon: 'sound' },
];
const PANEL_MIN_WINDOW = 1200;
const ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm';
const SAVE_LABEL: Record<SaveState, string> = { saved: '저장됨', dirty: '변경 있음', saving: '저장 중…', failed: '저장 실패' };
export const isUntouchedVideo = (project: VideoProject) => project.revision === 0 && !project.clips.length && !project.overlays.length;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const anchorOf = (event: MouseEvent): MenuAnchor => { const rect = event.currentTarget.getBoundingClientRect(); return { x: rect.left, y: rect.bottom + 6 }; };

// 입력 중에는 문서 단축키가 끼어들지 않는다. 한글 조합 중인 키도 제외한다.
function isTyping(event: KeyboardEvent) {
  const target = event.target as HTMLElement;
  return event.isComposing || event.keyCode === 229 || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
}

// 스페이스가 재생·일시정지로 쓰이는 자리인지 정한다. 마우스로 누른 단추·고르기 상자·배율 막대에 초점이 남아 있어도 재생을 바꾼다.
// 글자를 넣는 칸, 창·메뉴 안, Tab으로 옮겨 간 단추(byKeyboard)에서는 그 자리의 원래 동작을 둔다.
const SPACE_KEEPS_NATIVE = new Set(['BUTTON', 'SELECT', 'INPUT', 'A', 'SUMMARY']);
const NOT_TEXT_INPUT = new Set(['range', 'checkbox', 'radio', 'button', 'color', 'file']);
function spaceTogglesPlay(event: KeyboardEvent, byKeyboard: boolean) {
  const target = event.target as HTMLElement;
  if (event.isComposing || event.keyCode === 229 || target.tagName === 'TEXTAREA' || target.isContentEditable) return false;
  if (target.tagName === 'INPUT' && !NOT_TEXT_INPUT.has((target as HTMLInputElement).type)) return false;
  if (target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]')) return false;
  return !(byKeyboard && SPACE_KEEPS_NATIVE.has(target.tagName));
}

// 원본 파일로 만든다. 실패하면 안내 문구를 돌려준다.
export async function downloadOriginal(project: VideoProject): Promise<string | null> {
  const result = await serializeVideoProject(project, readMedia);
  if (!result.ok) return result.message;
  download(result.blob, downloadName(project.title, 'canvavideo'));
  return null;
}

function MediaThumb({ media, blob }: { media: Media; blob?: Blob | null }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true, made: string | undefined;
    const show = (value: Blob | null) => { if (active && value) { made = URL.createObjectURL(value); setUrl(made); } };
    if (blob) show(blob); else void frameAt(media.id, 0, 96, 54).then(show);
    return () => { active = false; if (made) URL.revokeObjectURL(made); };
  }, [media.id, blob]);
  return url ? <img src={url} alt="" /> : <span className="media-thumb-empty"><Icon name="video" size={18} /></span>;
}

type Importing = { done: number; total: number; index: number; count: number; controller: AbortController };

// 자막 기본값과 스타일 예시 3개(영상 계약 §3). 세로 작품은 폭·위치가 다르다.
type CaptionPreset = { key: string; label: string; fontSize: number; backdrop: 'none' | 'band'; landscape: { width: number; x: number }; portrait: { width: number; x: number } };
// 조각 빠르기 선택 문구. 빠르기를 바꾸면 그 조각의 소리 높이도 함께 바뀐다.
const SPEED_LABEL: Record<ClipSpeed, string> = { 0.5: '느리게 0.5배', 1: '보통 빠르기', 1.5: '조금 빠르게 1.5배', 2: '빠르게 2배', 4: '아주 빠르게 4배' };

const CAPTION_PRESETS: CaptionPreset[] = [
  { key: 'normal', label: '보통 자막', fontSize: 48, backdrop: 'band', landscape: { width: 960, x: 160 }, portrait: { width: 600, x: 60 } },
  { key: 'large', label: '크게', fontSize: 72, backdrop: 'band', landscape: { width: 1120, x: 80 }, portrait: { width: 660, x: 30 } },
  { key: 'plain', label: '띠 없음', fontSize: 48, backdrop: 'none', landscape: { width: 960, x: 160 }, portrait: { width: 600, x: 60 } },
];
const CAPTION_Y = { landscape: 540, portrait: 1000 } as const;
const DEFAULT_OVERLAY_MS = 3000;
const DRAFT_ID = 'draft';
// 입력 중인 자막. 새 자막은 내용을 확정할 때 문서에 추가한다(계약 §3 빈 글씨 규칙).
// note: 새 자막을 만들며 시간을 줄였을 때의 안내. 확정 뒤에 보여 준다(확정 명령이 상태 줄을 비우기 때문).
type CaptionEdit = { overlayId: string | null; draft: CaptionOverlay; initialText: string; session: number; note?: string };
const seconds = (ms: number) => `${Math.round(ms / 100) / 10}초`;
type Exporting = { done: number; total: number; controller: AbortController };
type Exported = { file: File; container: 'mp4' | 'webm'; bytes: number; durationMs: number; name: string };

// onOpenFile은 실패하면 안내 문구를 돌려준다. 그때 지금 작품은 그대로다.
type Props = { value: VideoSession; builtins: Builtins | null; initialNote?: string; initiallySaved?: boolean; onHome: () => void; onNew: () => void; onOpenFile: (file: File) => Promise<string | null> };

export function VideoEditor({ value, builtins, initialNote, initiallySaved, onHome, onNew, onOpenFile }: Props) {
  const { store } = value;
  const readOnly = value.lock.readOnly;
  const project = useSyncExternalStore(store.subscribe, store.getProject);
  const [title, setTitle] = useState(project.title);
  const [status, setStatus] = useState(initialNote ?? '');
  const [saveState, setSaveState] = useState<SaveState>(() => initiallySaved || isUntouchedVideo(store.getProject()) ? 'saved' : 'dirty');
  const [tool, setTool] = useState<VideoToolId | null>(() => !readOnly && window.innerWidth >= PANEL_MIN_WINDOW ? 'video' : null);
  const [fileMenu, setFileMenu] = useState<MenuAnchor | null>(null);
  const [selectedClip, setSelectedClipState] = useState<string | null>(null);
  const [selectedOverlay, setSelectedOverlayState] = useState<string | null>(null);
  const [overlayPreview, setOverlayPreview] = useState<Overlay | null>(null);
  const [edit, setEdit] = useState<CaptionEdit | null>(null);
  const editRef = useRef<CaptionEdit | null>(null);
  editRef.current = edit;
  const editor = useRef<TextEditorHandle>(null);
  const editSession = useRef(0);
  const afterComposition = useRef<(() => void) | null>(null);
  const [stageScale, setStageScale] = useState(0.5);
  const stage = useRef<HTMLDivElement>(null);
  // 조각과 자막·밈은 하나만 고른다.
  const setSelectedClip = useCallback((id: string | null) => { setSelectedClipState(id); if (id) setSelectedOverlayState(null); }, []);
  const setSelectedOverlay = useCallback((id: string | null) => { setSelectedOverlayState(id); if (id) setSelectedClipState(null); }, []);
  const [pending, setPending] = useState<{ next: () => void } | null>(null);
  const [confirmSave, setConfirmSave] = useState<{ bytes: number } | null>(null);
  const [exporting, setExporting] = useState<Exporting | null>(null);
  const [exported, setExported] = useState<Exported | null>(null);
  const exportingRef = useRef<Exporting | null>(null);
  exportingRef.current = exporting;
  // 작품을 떠나면 만들던 파일도 멈춘다.
  useEffect(() => () => exportingRef.current?.controller.abort(), []);
  const [player, setPlayer] = useState<PlayerState>({ playing: false, timeMs: 0 });
  // 타임라인 배율(초당 픽셀). null이면 작품 전체가 띠에 들어가게 맞춘다(범위·눈금은 timelineScale.ts).
  const [zoom, setZoom] = useState<number | null>(null);
  const [timelineWidth, setTimelineWidth] = useState(800);
  const timelineBox = useRef<HTMLDivElement>(null);
  const [importing, setImporting] = useState<Importing | null>(null);
  const [free, setFree] = useState<number | null>(null);
  const [thumbs, setThumbs] = useState<Map<string, Blob | null>>(new Map());
  const autosave = useRef<Autosave | null>(null);
  const openInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useRef<PreviewPlayer | null>(null);
  useEffect(() => { setTitle(project.title); }, [project.title]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setTimelineWidth(entry.contentRect.width));
    observer.observe(timelineBox.current!);
    return () => observer.disconnect();
  }, []);

  // 미리보기 재생기. 문서가 바뀌면 알려 준다(재생 중이면 멈춘다).
  useEffect(() => {
    const instance = new PreviewPlayer(canvas.current!, store.getProject(), setPlayer);
    preview.current = instance;
    if (import.meta.env.DEV) Object.assign(window, { __canvacraftVideo: { store, player: instance } });
    return () => { instance.destroy(); preview.current = null; };
  }, [store]);
  useEffect(() => { preview.current?.setProject(project); }, [project]);
  // 미리보기 배율: 화면에 보이는 크기 / 논리 크기.
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setStageScale(entry.contentRect.width / CANVAS[store.getProject().orientation].width));
    observer.observe(stage.current!);
    return () => observer.disconnect();
  }, [store, project.orientation]);
  // 자막·밈 그리기. 끄는 중인 요소는 preview 값으로, 입력 중인 자막은 입력 칸이 보여 주므로 그리지 않는다.
  const paintState = useRef<{ overlays: readonly Overlay[]; hidden: string | null; drawn?: { t: number; ids: string[] } }>({ overlays: [], hidden: null });
  paintState.current = { ...paintState.current, overlays: overlayPreview ? project.overlays.map(item => item.id === overlayPreview.id ? overlayPreview : item) : project.overlays, hidden: edit?.overlayId ?? null };
  // 밈 그림(스티커 프레임·밈 영상)과 효과음·배경음악(재생할 때 Web Audio로 같은 시계에 맞춘다).
  const memes = useRef<MemePreview | null>(null);
  const sounds = useRef(new Map<string, AudioBuffer | null>());
  useEffect(() => {
    const instance = new MemePreview(() => { if (!preview.current?.state.playing) preview.current?.redraw(); });
    memes.current = instance;
    return () => { instance.destroy(); memes.current = null; };
  }, []);
  useEffect(() => { memes.current?.setItems(builtins?.memes ?? []); preview.current?.redraw(); }, [builtins]);
  useEffect(() => { if (!player.playing) memes.current?.pauseAll(); }, [player.playing]);
  // 쓰는 소리만 풀어 둔다(배경음악 + 소리 켠 밈의 효과음).
  useEffect(() => {
    if (!builtins) return;
    const wanted = new Set<string>();
    if (project.audio.musicId) wanted.add(project.audio.musicId);
    for (const overlay of project.overlays) if (overlay.type === 'meme' && overlay.soundOn) { const soundId = builtins.memes.find(item => item.id === overlay.memeId)?.soundId; if (soundId) wanted.add(soundId); }
    for (const id of wanted) {
      if (sounds.current.has(id)) continue;
      const item = [...builtins.sfx, ...builtins.music].find(sound => sound.id === id);
      if (!item) continue;
      sounds.current.set(id, null);
      void builtinBlob('sounds', item).then(blob => blob && preview.current ? blob.arrayBuffer().then(bytes => preview.current!.decodeAudio(bytes)) : null)
        .then(buffer => { if (buffer) sounds.current.set(id, buffer); else sounds.current.delete(id); }, () => sounds.current.delete(id));
    }
  }, [builtins, project.audio.musicId, project.overlays]);
  useEffect(() => {
    preview.current?.setSoundPlan(() => {
      const current = store.getProject();
      const music = current.audio.musicId ? sounds.current.get(current.audio.musicId) : null;
      const effects = current.overlays.flatMap(overlay => {
        if (overlay.type !== 'meme' || !overlay.soundOn) return [];
        const soundId = builtins?.memes.find(item => item.id === overlay.memeId)?.soundId;
        const buffer = soundId ? sounds.current.get(soundId) : null;
        return buffer ? [{ atMs: overlay.startMs, buffer }] : [];
      });
      return { music: music ? { buffer: music, volume: current.audio.musicVolume } : null, effects };
    });
  }, [store, builtins]);
  useEffect(() => {
    const assets: ComposeAssets = {
      caption: overlay => overlay.type === 'caption' ? cachedCaption(overlay, 1) : null,
      meme: (overlay, elapsed) => memes.current?.frame(overlay, elapsed, !!preview.current?.state.playing) ?? null,
    };
    preview.current?.setPainter((ctx, t) => {
      paintState.current.drawn = { t, ids: drawOverlays(ctx, paintState.current.overlays, t, assets, 1, paintState.current.hidden) };
      memes.current?.settle(new Set(paintState.current.overlays.filter(item => item.type === 'meme' && item.memeKind === 'clip' && isVisible(item, t)).map(item => item.id)));
    });
    if (import.meta.env.DEV) Object.assign(window, { __canvacraftVideo: { ...(window as unknown as { __canvacraftVideo: object }).__canvacraftVideo, drawn: () => paintState.current.drawn } });
  }, [store]);
  useEffect(() => { if (!player.playing) preview.current?.redraw(); }, [project.overlays, overlayPreview, edit?.overlayId, player.playing]);
  useEffect(() => { if (tool === 'video') void freeBytes().then(setFree); }, [tool, project.mediaManifest]);

  const seek = useCallback((ms: number) => { void preview.current?.seek(ms); }, []);
  // fromHistory: 되돌리기·다시 하기의 결과. 그때만 재생 막대를 focus 조각의 시작으로 옮긴다(계약 §4).
  // 자르기·다듬기 같은 일반 명령은 조각만 선택하고 재생 막대는 그대로 둔다.
  const report = useCallback((result: VideoDispatchResult, fromHistory = false) => {
    if (!result.ok) { setStatus(result.message); return; }
    if (!result.changed) return;
    const focus = result.focus;
    if (focus?.kind === 'clip') {
      setSelectedClip(focus.id);
      const current = store.getProject(); const index = current.clips.findIndex(clip => clip.id === focus.id);
      if (fromHistory && index >= 0) seek(clipStarts(current.clips)[index]);
    } else if (focus?.kind === 'overlay') {
      setSelectedOverlay(focus.id);
      const overlay = store.getProject().overlays.find(item => item.id === focus.id);
      if (fromHistory && overlay) seek(overlay.startMs);
    } else { setSelectedClipState(null); setSelectedOverlayState(null); }
    setStatus(result.adjustedOverlays ? `자막·밈 ${result.adjustedOverlays}개가 영상과 함께 바뀌었어요.` : '');
  }, [store, seek, setSelectedClip, setSelectedOverlay]);
  const run = useCallback((command: VideoCommand) => { const current = store.getProject(); const result = store.dispatch(current.id, current.revision, command); report(result); return result; }, [store, report]);
  const undo = useCallback(() => report(store.undo(), true), [store, report]);
  const redo = useCallback(() => report(store.redo(), true), [store, report]);
  // byKeyboard: 마지막으로 Tab으로 초점을 옮겼는지(마우스를 누르면 풀린다). spaceHandled: 스페이스를 재생에 썼으니 뗄 때의 기본 동작도 막는다.
  const byKeyboard = useRef(false), spaceHandled = useRef(false);
  const togglePlay = useCallback(() => { const instance = preview.current; if (!instance) return; if (instance.state.playing) instance.pause(); else void instance.play(); }, []);

  // 자막 입력을 문서에 확정한다. 새 자막은 내용이 있을 때만 addCaption, 기존 자막은 updateCaption(비우면 삭제, 계약 §3).
  const commitEdit = useCallback(() => {
    const current = editRef.current;
    if (!current || !editor.current) return;
    const text = editor.current.value();
    editRef.current = null; setEdit(null);
    const blank = text.trim().length === 0;
    const { draft } = current;
    if (current.overlayId === null) {
      if (blank) return;
      const result = run({ type: 'addCaption', text, x: draft.x, y: draft.y, width: draft.width, startMs: draft.startMs, durationMs: draft.durationMs, fontId: draft.fontId, fontSize: draft.fontSize, bold: draft.bold, color: draft.color, align: draft.align, lineHeight: draft.lineHeight, backdrop: draft.backdrop });
      if (result.ok) { setSelectedOverlay(store.getProject().overlays.at(-1)!.id); if (current.note) setStatus(current.note); }
    } else {
      run({ type: 'updateCaption', overlayId: current.overlayId, text, width: draft.width, fontId: draft.fontId, fontSize: draft.fontSize, bold: draft.bold, color: draft.color, align: draft.align, backdrop: draft.backdrop });
    }
    const size = CANVAS[store.getProject().orientation];
    if (!blank && draft.y + layoutText({ ...draft, text }).height > size.height) setStatus('자막이 화면 아래로 넘쳤어요. 크기를 줄이거나 상자를 넓혀 보세요.');
  }, [run, store, setSelectedOverlay]);
  // 입력 중이면 끝낸 뒤 다음 일을 한다. 한글 조합 중에는 조합이 끝나기를 기다린다(슬라이드 계약 §4).
  const flushEdit = useCallback((then?: () => void) => {
    if (!editRef.current) { then?.(); return; }
    if (editor.current?.isComposing()) {
      afterComposition.current = () => { commitEdit(); then?.(); };
      editor.current.blur();
      setTimeout(() => { const pendingAction = afterComposition.current; afterComposition.current = null; pendingAction?.(); }, 300);
      return;
    }
    commitEdit(); then?.();
  }, [commitEdit]);
  const onCompositionFinished = useCallback(() => { const pendingAction = afterComposition.current; afterComposition.current = null; pendingAction?.(); }, []);

  // 새 자막: 재생 막대 시각에서 3초 보이게 시작한다. 영상 끝을 넘으면 먼저 줄이고, 1초도 안 남으면 끝에서 1초 앞으로 옮긴다(계약 §3).
  function addCaptionDraft(preset: CaptionPreset) {
    flushEdit(() => {
      const current = store.getProject(); const length = totalMs(current.clips);
      if (!length) { setStatus('영상을 먼저 넣어 주세요.'); return; }
      if (length < VIDEO_LIMITS.overlayMinMs) { setStatus('영상이 1초보다 짧아서 자막을 넣을 수 없어요.'); return; }
      preview.current?.pause();
      let startMs = Math.floor(Math.min(preview.current?.state.timeMs ?? 0, length - 1));
      let note = '';
      if (length - startMs < VIDEO_LIMITS.overlayMinMs) { startMs = length - VIDEO_LIMITS.overlayMinMs; note = '영상 끝이라 조금 앞에서 시작하게 했어요.'; }
      const durationMs = Math.min(DEFAULT_OVERLAY_MS, length - startMs);
      if (durationMs < DEFAULT_OVERLAY_MS && !note) note = '영상 끝까지만 보이도록 줄였어요.';
      const place = preset[current.orientation];
      let y: number = CAPTION_Y[current.orientation];
      while (current.overlays.some(item => item.type === 'caption' && item.y === y && item.x === place.x && isVisible(item, startMs))) y -= 80;
      const draft: CaptionOverlay = { id: DRAFT_ID, type: 'caption', startMs, durationMs, x: place.x, y, width: place.width, text: '', fontId: 'sans-ko', fontSize: preset.fontSize, bold: true, color: '#FFFFFF', align: 'center', lineHeight: 1.3, backdrop: preset.backdrop };
      if (startMs !== Math.floor(preview.current?.state.timeMs ?? 0)) seek(startMs);
      setSelectedOverlayState(null); setSelectedClipState(null);
      setEdit({ overlayId: null, draft, initialText: '', session: ++editSession.current, note });
      setStatus(note);
    });
  }
  function startCaptionEdit(caption: CaptionOverlay) {
    if (readOnly) return;
    preview.current?.pause();
    setSelectedOverlay(caption.id);
    setEdit({ overlayId: caption.id, draft: caption, initialText: caption.text, session: ++editSession.current });
  }
  // 밈 넣기: 누르면 가운데, 끌어다 놓으면 놓은 곳(계약 §3 새 밈 기본값). 스티커는 폭 320(더 작으면 원래 크기), 밈 영상은 가로 480·세로 360.
  // 보이는 시간은 밈 길이를 1초 단위로 올린 값(최소 3초)이고, 영상 끝을 넘으면 먼저 줄인다.
  function addMeme(item: MemeItem, at?: Point) {
    flushEdit(() => {
      const current = store.getProject(); const length = totalMs(current.clips);
      if (!length) { setStatus('영상을 먼저 넣어 주세요.'); return; }
      if (length < VIDEO_LIMITS.overlayMinMs) { setStatus('영상이 1초보다 짧아서 밈을 넣을 수 없어요.'); return; }
      const canvasSize = CANVAS[current.orientation];
      const width = item.kind === 'sticker' ? Math.min(320, item.width) : current.orientation === 'landscape' ? 480 : 360;
      const height = Math.round((width * item.height / item.width) * 100) / 100;
      const box = at ? centeredAt({ width, height }, at, canvasSize) : { x: Math.round((canvasSize.width - width) / 2), y: Math.round((canvasSize.height - height) / 2), width, height };
      // 같은 자리에 연달아 넣어도 겹쳐 가려지지 않게 조금씩 옮긴다(슬라이드 그림과 같은 규칙). 화면 밖으로는 밀지 않는다.
      while (!at && current.overlays.some(item => item.type === 'meme' && item.x === box.x && item.y === box.y) && box.x + width + 20 <= canvasSize.width && box.y + height + 20 <= canvasSize.height) { box.x += 20; box.y += 20; }
      let startMs = Math.floor(Math.min(preview.current?.state.timeMs ?? 0, length - 1)), note = '';
      if (length - startMs < VIDEO_LIMITS.overlayMinMs) { startMs = length - VIDEO_LIMITS.overlayMinMs; note = '영상 끝이라 조금 앞에서 시작하게 했어요.'; }
      const wanted = Math.max(DEFAULT_OVERLAY_MS, Math.ceil(item.durationMs / 1000) * 1000);
      const durationMs = Math.min(wanted, length - startMs, VIDEO_LIMITS.overlayMaxMs);
      if (durationMs < wanted && !note) note = '영상 끝까지만 보이도록 줄였어요.';
      const result = run({ type: 'addMeme', memeId: item.id, memeKind: item.kind, x: box.x, y: box.y, width, height, startMs, durationMs, soundOn: true });
      if (result.ok) { setSelectedOverlay(store.getProject().overlays.at(-1)!.id); if (note) setStatus(note); }
    });
  }
  function dropOnStage(event: React.DragEvent) {
    const id = event.dataTransfer.getData(MEME_DRAG_TYPE);
    const item = builtins?.memes.find(meme => meme.id === id);
    if (!item || !stage.current) return false;
    addMeme(item, toLogical(event.clientX, event.clientY, stage.current.getBoundingClientRect(), stageScale));
    return true;
  }
  const changeAudio = (patch: Partial<AudioSettings>) => run({ type: 'setAudio', ...patch });

  // 입력 중에는 초안에만 적용해 확정할 때 취소 한 번으로 묶는다. 입력 중이 아니면 바로 명령을 보낸다.
  const applyCaptionStyle = useCallback((patch: TextStylePatch & { backdrop?: 'none' | 'band' }) => {
    const current = editRef.current;
    if (current) { const next = { ...current, draft: { ...current.draft, ...patch } }; editRef.current = next; setEdit(next); return; }
    if (selectedOverlay) run({ type: 'updateCaption', overlayId: selectedOverlay, ...patch });
  }, [run, selectedOverlay]);

  // 파일 선택·끌어놓기가 모두 이 경로를 쓴다. 하나씩 넣고, 실패한 파일은 작품을 건드리지 않는다.
  async function importFiles(files: readonly File[]) {
    if (readOnly || importing || !files.length) return;
    const controller = new AbortController();
    let added = 0;
    for (const [index, file] of files.entries()) {
      if (controller.signal.aborted) break;
      setImporting({ done: 0, total: file.size, index, count: files.length, controller });
      const result = await importMedia(file, { signal: controller.signal, lengthLimit: readLengthLimit(), onProgress: (done, total) => setImporting({ done, total, index, count: files.length, controller }) });
      if (!result.ok) { setStatus(files.length > 1 ? `${index + 1}번째 파일: ${result.message}` : result.message); continue; }
      setThumbs(current => new Map(current).set(result.media.id, result.thumbnail));
      const outcome = run({ type: 'addClip', media: result.media });
      if (outcome.ok) added++;
    }
    setImporting(null);
    if (added) { setStatus(added > 1 ? `영상 ${added}개를 넣었어요.` : '영상을 넣었어요.'); seek(totalMs(store.getProject().clips) - clipLength(store.getProject().clips.at(-1)!)); }
    void freeBytes().then(setFree);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab') byKeyboard.current = true;
      if (event.key === ' ' && !event.ctrlKey && !event.metaKey && !event.altKey && spaceTogglesPlay(event, byKeyboard.current)) {
        // 기본 동작(초점이 있는 단추 누르기, 목록 열기, 화면 내리기)을 막는다. 단추는 키를 뗄 때 눌리는 브라우저가 있어 keyup도 막는다.
        event.preventDefault(); spaceHandled.current = true;
        if (!event.repeat) togglePlay();
        return;
      }
      if (isTyping(event)) return;
      const key = event.key.toLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
        if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); redo(); }
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !readOnly) {
        if (selectedClip) { event.preventDefault(); run({ type: 'deleteClip', clipId: selectedClip }); }
        else if (selectedOverlay) { event.preventDefault(); run({ type: 'deleteOverlay', overlayId: selectedOverlay }); }
      }
      // 고른 자막에서 Enter를 누르면 바로 입력을 시작한다.
      if (event.key === 'Enter' && selectedOverlay && (event.target as HTMLElement).tagName !== 'BUTTON') {
        const target = store.getProject().overlays.find(item => item.id === selectedOverlay);
        if (target?.type === 'caption') { event.preventDefault(); startCaptionEdit(target); }
      }
      if (event.key === 'Escape') { setSelectedClipState(null); setSelectedOverlayState(null); }
    };
    const onKeyUp = (event: KeyboardEvent) => { if (event.key === ' ' && spaceHandled.current) { spaceHandled.current = false; event.preventDefault(); } };
    const onPointer = () => { byKeyboard.current = false; };
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKeyUp); window.addEventListener('pointerdown', onPointer, true);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('pointerdown', onPointer, true); };
  });

  // 자동 저장(슬라이드와 같은 시점 규칙, 영상 계약 §6). 첫 조각의 시작 프레임이 바뀌었을 때만 작품 목록의 미리보기를 다시 만든다.
  useEffect(() => {
    if (readOnly) return;
    let persisted = false;
    let thumbnailKey: string | null = null;
    const saver = createAutosave({
      getRevision: () => store.getProject().revision,
      initiallySaved: !!initiallySaved || isUntouchedVideo(store.getProject()),
      onState: (state, message) => { setSaveState(state); if (message) setStatus(message); },
      save: async () => {
        const snapshot = store.getProject();
        const first = snapshot.clips[0];
        let thumbnail: { blob: Blob; revision: number } | undefined;
        const key = first ? `${first.mediaId}:${first.inMs}:${snapshot.orientation}` : null;
        if (first && key !== thumbnailKey) {
          const [width, height] = snapshot.orientation === 'landscape' ? [320, 180] : [180, 320];
          const blob = await frameAt(first.mediaId, first.inMs, width, height).catch(() => null);
          if (blob) { thumbnail = { blob, revision: snapshot.revision }; thumbnailKey = key; }
        }
        const result = await saveVideoProject(snapshot, { thumbnail });
        if (result.ok && !persisted) { persisted = true; void requestPersistence(); }
        return result.ok ? result : { ok: false as const, message: result.message };
      },
    });
    autosave.current = saver;
    setSaveState(saver.getState());
    const stop = store.subscribe(() => saver.notifyChange());
    const onHidden = () => { if (document.visibilityState === 'hidden') void saver.flush(); };
    const onLeave = (event: BeforeUnloadEvent) => { if (saver.getState() !== 'saved') event.preventDefault(); };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('beforeunload', onLeave);
    return () => { stop(); saver.dispose(); document.removeEventListener('visibilitychange', onHidden); window.removeEventListener('beforeunload', onLeave); };
  }, [store, readOnly, initiallySaved]);

  // 저장을 마친 뒤 다음 화면으로 간다. 실패하면 내용을 잃지 않도록 먼저 묻는다.
  async function afterSaved(next: () => void) {
    if (editRef.current) { flushEdit(() => void afterSaved(next)); return; }
    preview.current?.pause();
    importing?.controller.abort();
    const saved = readOnly || !autosave.current || isUntouchedVideo(store.getProject()) || await autosave.current.flush();
    if (saved) next(); else setPending({ next });
  }
  // 내보내기: 지금 문서를 스냅숏으로 넘긴다. 끝나면 파일을 내려받고 결과 창을 보여 준다(계약 §8 결과 창).
  function startExport() {
    flushEdit(() => void (async () => {
      preview.current?.pause();
      const snapshot = store.getProject();
      const controller = new AbortController();
      setExported(null); setExporting({ done: 0, total: 1, controller });
      const result = await exportVideo(snapshot, builtins, { signal: controller.signal, onProgress: (done, total) => setExporting({ done, total, controller }) });
      setExporting(null);
      if (!result.ok) { setStatus(result.message); return; }
      const name = downloadName(snapshot.title, result.container);
      download(result.file, name);
      setExported({ file: result.file, container: result.container, bytes: result.bytes, durationMs: result.durationMs, name });
      setStatus('영상 파일을 내려받았어요.');
    })());
  }

  async function saveFileNow() {
    setConfirmSave(null);
    setStatus('원본 파일을 만들고 있어요…');
    const problem = await downloadOriginal(store.getProject());
    setStatus(problem ?? '원본 파일을 내려받았어요.');
    return !problem;
  }

  const size = CANVAS[project.orientation];
  const total = totalMs(project.clips);
  // 긴 작품은 맞춤 배율이 아주 작아진다(1시간이면 초당 0.3px쯤). 직접 고른 배율은 지금 작품의 범위 안으로 맞춘다.
  const zoomLimits = zoomRange(timelineWidth, total);
  const pxPerSecond = zoom === null ? zoomLimits.fit : clampZoom(zoom, zoomLimits);
  const clipIndex = project.clips.findIndex(clip => clip.id === selectedClip);
  const clip = clipIndex >= 0 ? project.clips[clipIndex] : null;
  // 재생 막대가 선택한 조각 안에서 양 끝 0.1초보다 안쪽이면 자를 수 있다. 안 되면 단추를 끈다(아이에게 오류를 보이지 않는다).
  const at = locate(project.clips, Math.min(player.timeMs, Math.max(0, total - 1)));
  // 빠르기를 바꾼 조각의 원본 시각은 소수일 수 있어 정수 ms로 맞춘다.
  const atSource = at ? Math.round(at.sourceMs) : 0;
  const splitAt = clip && at?.clip.id === clip.id && atSource >= clip.inMs + VIDEO_LIMITS.splitMarginMs && atSource <= clip.outMs - VIDEO_LIMITS.splitMarginMs ? atSource : null;
  const memeHasSound = (meme: MemeOverlay) => { const item = builtins?.memes.find(entry => entry.id === meme.memeId); return !!item && (item.hasSound || !!item.soundId); };
  const overlayIndex = project.overlays.findIndex(item => item.id === selectedOverlay);
  const overlay = overlayIndex >= 0 ? project.overlays[overlayIndex] : null;
  const captionStyle = edit?.draft ?? (overlay?.type === 'caption' ? overlay : null);
  // 보이는 시간 −/+(1초 단위)와 '지금부터'. 영상 끝을 넘지 않게 먼저 줄이고 알려 준다(계약 §3).
  function changeDuration(delta: number) {
    if (!overlay) return;
    // 시작은 그대로 두고 길이만 바꾼다. 1초 단위로 맞추고, 영상 끝·1~60초 범위 안으로 줄인다.
    const wanted = Math.round((overlay.durationMs + delta) / 1000) * 1000;
    const room = total - overlay.startMs;
    const durationMs = Math.max(Math.min(VIDEO_LIMITS.overlayMinMs, room), Math.min(wanted, room, VIDEO_LIMITS.overlayMaxMs));
    // 명령 결과가 상태 줄을 비우므로 안내는 명령 뒤에 쓴다.
    if (durationMs !== overlay.durationMs) run({ type: 'setOverlayTime', overlayId: overlay.id, startMs: overlay.startMs, durationMs });
    if (durationMs < wanted) setStatus('영상 끝까지만 보일 수 있어요.');
  }
  function startFromHere() {
    if (!overlay) return;
    let startMs = Math.floor(Math.min(player.timeMs, total - 1)), durationMs = overlay.durationMs, note = '';
    if (startMs + durationMs > total) { durationMs = total - startMs; note = '영상 끝까지만 보이도록 줄였어요.'; }
    if (durationMs < VIDEO_LIMITS.overlayMinMs) { startMs = Math.max(0, total - VIDEO_LIMITS.overlayMinMs); durationMs = Math.min(VIDEO_LIMITS.overlayMinMs, total); note = '영상 끝이라 조금 앞에서 시작하게 했어요.'; }
    run({ type: 'setOverlayTime', overlayId: overlay.id, startMs, durationMs });
    if (note) setStatus(note);
  }

  const panel = tool === 'video'
    ? <div className="panel-body">
      <button className="primary" disabled={readOnly || !!importing} onClick={() => importInput.current?.click()}><Icon name="upload" size={18} />영상 가져오기</button>
      <p className="panel-note">MP4·MOV·WebM 영상을 넣을 수 있어요. 영상 파일을 화면에 끌어다 놓아도 돼요.</p>
      {free !== null && <p className="panel-note" data-testid="free-space">이 컴퓨터에 영상을 더 넣을 자리: 약 {formatBytes(free)}</p>}
      {project.mediaManifest.length > 0 && <>
        <h3>가져온 영상</h3>
        <ul className="media-list" aria-label="가져온 영상">
          {project.mediaManifest.map((media, index) => <li key={media.id}>
            <MediaThumb media={media} blob={thumbs.get(media.id)} />
            <span>영상 {index + 1}<small>{formatDuration(media.durationMs)}</small></span>
            <button className="outline" disabled={readOnly} aria-label={`영상 ${index + 1} 다시 넣기`} onClick={() => run({ type: 'addClip', media })}>다시 넣기</button>
          </li>)}
        </ul>
      </>}
    </div>
    : tool === 'caption'
    ? <div className="panel-body">
      <div className="caption-presets">
        {CAPTION_PRESETS.map(preset => <button key={preset.key} className="text-preset" disabled={readOnly} onClick={() => addCaptionDraft(preset)}
          style={{ fontSize: preset.key === 'large' ? 20 : 16, fontWeight: 700, background: preset.backdrop === 'band' ? '#1f2430' : '#fff', color: preset.backdrop === 'band' ? '#fff' : 'var(--ink)' }}>{preset.label} 추가</button>)}
      </div>
      <p className="panel-note">재생 막대가 있는 곳부터 3초 동안 보여요. 아래 타임라인의 보라색 막대를 끌어 보이는 시간을 바꿀 수 있어요.</p>
    </div>
    : tool === 'meme'
    ? <MemePanel memes={builtins?.memes ?? null} disabled={readOnly} onAdd={item => addMeme(item)} />
    : <SoundPanel audio={project.audio} music={builtins?.music ?? null} disabled={readOnly} onChange={changeAudio} />;

  return <div className="app video-app" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (event.dataTransfer.types.includes(MEME_DRAG_TYPE)) { dropOnStage(event); return; } void importFiles([...event.dataTransfer.files]); }}>
    <header className="topbar">
      <button className="on-gradient icon-only" aria-label="작품 목록" title="작품 목록" onClick={() => void afterSaved(onHome)}><Icon name="back" /></button>
      <button className="on-gradient" onClick={event => setFileMenu(anchorOf(event))}><Icon name="file" size={18} />파일<Icon name="chevron" size={14} /></button>
      <button className="on-gradient icon-only" aria-label="되돌리기" title="되돌리기 (Ctrl+Z)" disabled={!store.canUndo() && !edit} onClick={() => flushEdit(undo)}><Icon name="undo" /></button>
      <button className="on-gradient icon-only" aria-label="다시 하기" title="다시 하기 (Ctrl+Shift+Z)" disabled={!store.canRedo()} onClick={() => flushEdit(redo)}><Icon name="redo" /></button>
      <input className="title" aria-label="작품 이름" readOnly={readOnly} value={title} onChange={event => setTitle(event.target.value)} onBlur={() => run({ type: 'renameProject', title })} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
      <span className={saveState === 'failed' && !readOnly ? 'save-state failed' : 'save-state'} data-testid="save-state">{readOnly ? '읽기 전용' : isUntouchedVideo(project) ? '새 작품' : SAVE_LABEL[saveState]}</span>
      <span className="spacer" />
      <button className="share" disabled={!total || !!exporting} title={total ? 'MP4 영상 파일로 만들기' : '영상을 넣으면 내보낼 수 있어요'} onClick={startExport}><Icon name="download" size={18} />내보내기</button>
      {fileMenu && <Menu anchor={fileMenu} label="파일 메뉴" onClose={() => setFileMenu(null)} items={[
        { label: '새 작품', onSelect: () => void afterSaved(onNew) },
        { label: '원본 열기', onSelect: () => openInput.current?.click() },
        { label: '원본 저장', onSelect: () => setConfirmSave({ bytes: expectedFileBytes(store.getProject()) }) },
        { label: '이 컴퓨터에 저장', disabled: readOnly || saveState === 'saved' || saveState === 'saving', onSelect: () => void autosave.current?.flush() },
      ]} />}
    </header>
    <input ref={openInput} data-testid="open-video-file" type="file" accept=".canvavideo" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void afterSaved(() => void onOpenFile(file).then(problem => { if (problem) setStatus(problem); })); }} />
    <input ref={importInput} data-testid="import-video" type="file" accept={ACCEPT} multiple hidden onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; void importFiles(files); }} />
    <div className="workspace">
      <ToolRail tools={VIDEO_TOOLS} active={tool} onChange={next => flushEdit(() => setTool(next))} panel={panel} disabled={readOnly} />
      <main className="stage-area">
        <div className="selection-row">
          {(edit || overlay) && !readOnly ? <div className="selection-bar" role="toolbar" aria-label="선택한 자막·밈 설정">
            {captionStyle && <>
              <TextControls style={captionStyle} onStyle={applyCaptionStyle} />
              <button aria-pressed={captionStyle.backdrop === 'band'} title="반투명 띠" onPointerDown={event => event.preventDefault()} onClick={() => applyCaptionStyle({ backdrop: captionStyle.backdrop === 'band' ? 'none' : 'band' })}>띠</button>
              <span className="bar-divider" />
            </>}
            {overlay && !edit && <>
              <span className="time-control" role="group" aria-label="보이는 시간">
                <button className="icon-only" aria-label="보이는 시간 줄이기" disabled={overlay.durationMs <= VIDEO_LIMITS.overlayMinMs} onClick={() => changeDuration(-1000)}>−</button>
                <span data-testid="overlay-duration">{seconds(overlay.durationMs)}</span>
                <button className="icon-only" aria-label="보이는 시간 늘리기" disabled={overlay.durationMs >= VIDEO_LIMITS.overlayMaxMs || overlay.startMs + overlay.durationMs >= total} onClick={() => changeDuration(1000)}>+</button>
              </span>
              <button title="재생 막대 위치부터 보이게" onClick={startFromHere}>지금부터</button>
              {overlay.type === 'meme' && memeHasSound(overlay) && <button aria-pressed={!overlay.soundOn} onClick={() => run({ type: 'setMemeSound', overlayId: overlay.id, soundOn: !overlay.soundOn })}><Icon name="sound" size={18} />{overlay.soundOn ? '밈 소리 끄기' : '밈 소리 켜기'}</button>}
              <span className="bar-divider" />
              <button aria-label="앞으로 가져오기" title="앞으로" disabled={overlayIndex === project.overlays.length - 1} onClick={() => run({ type: 'reorderOverlay', overlayId: overlay.id, toIndex: overlayIndex + 1 })}><Icon name="front" size={18} /></button>
              <button aria-label="뒤로 보내기" title="뒤로" disabled={overlayIndex === 0} onClick={() => run({ type: 'reorderOverlay', overlayId: overlay.id, toIndex: overlayIndex - 1 })}><Icon name="backward" size={18} /></button>
              <button aria-label="복제" title="복제" onClick={() => run({ type: 'duplicateOverlay', overlayId: overlay.id })}><Icon name="duplicate" size={18} /></button>
              <button aria-label="자막·밈 지우기" title="지우기" onClick={() => run({ type: 'deleteOverlay', overlayId: overlay.id })}><Icon name="trash" size={18} /></button>
            </>}
          </div> : clip && !readOnly ? <div className="selection-bar" role="toolbar" aria-label="선택한 조각 설정">
            <button disabled={splitAt === null} title={splitAt === null ? '재생 막대를 조각 안으로 옮기면 자를 수 있어요' : '재생 막대 위치에서 자르기'} onClick={() => { if (splitAt !== null) run({ type: 'splitClip', clipId: clip.id, atMs: splitAt }); }}><Icon name="cut" size={18} />여기서 자르기</button>
            <span className="bar-divider" />
            <button aria-label="앞으로 옮기기" title="앞으로 옮기기" disabled={clipIndex === 0} onClick={() => run({ type: 'reorderClip', clipId: clip.id, toIndex: clipIndex - 1 })}><Icon name="back" size={18} /></button>
            <button aria-label="뒤로 옮기기" title="뒤로 옮기기" disabled={clipIndex === project.clips.length - 1} onClick={() => run({ type: 'reorderClip', clipId: clip.id, toIndex: clipIndex + 1 })}><Icon name="forward" size={18} /></button>
            <button aria-pressed={clip.muted} onClick={() => run({ type: 'setClipMuted', clipId: clip.id, muted: !clip.muted })}><Icon name="sound" size={18} />{clip.muted ? '소리 켜기' : '소리 끄기'}</button>
            <select className="speed-select" aria-label="조각 빠르기" title="이 조각을 빠르게·느리게 재생해요" value={clip.speed ?? 1} onChange={event => run({ type: 'setClipSpeed', clipId: clip.id, speed: Number(event.target.value) as ClipSpeed })}>
              {CLIP_SPEEDS.map(speed => <option key={speed} value={speed}>{SPEED_LABEL[speed]}</option>)}
            </select>
            <span className="bar-divider" />
            <button aria-label="조각 지우기" title="조각 지우기" onClick={() => run({ type: 'deleteClip', clipId: clip.id })}><Icon name="trash" size={18} /></button>
          </div> : <span />}
          <p className="status" role="status">{readOnly ? (value.lock.reason === 'other-tab' ? '다른 탭에서 편집 중이라 읽기만 할 수 있어요.' : '이 브라우저에서는 편집할 수 없어요. Chrome이나 Edge를 써 주세요.') : status}</p>
        </div>
        <div className="work video-work" onPointerDownCapture={event => { if ((event.target as HTMLElement).tagName !== 'TEXTAREA') flushEdit(); }}>
          <div ref={stage} className={`video-stage ${project.orientation}`} data-testid="video-stage" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
            <canvas ref={canvas} data-testid="preview" aria-label="미리보기" />
            {!project.clips.length && <span className="stage-empty">왼쪽 영상 도구에서 영상을 가져오세요</span>}
            {project.clips.length > 0 && <OverlayLayer overlays={paintState.current.overlays} timeMs={player.timeMs} canvas={size} scale={stageScale} selected={overlay} preview={overlayPreview} editingId={edit?.overlayId ?? (edit ? DRAFT_ID : null)} readOnly={readOnly}
              onSelect={id => { setSelectedOverlay(id); if (!id) setSelectedClipState(null); }} onPreview={setOverlayPreview} onCommit={run} onEditCaption={startCaptionEdit} />}
            {edit && <TextEditor key={edit.session} ref={editor} draft={edit.draft} scale={stageScale} initialText={edit.initialText} caret={null} placeholder="자막을 입력하세요" label="자막 글씨" maxLength={VIDEO_LIMITS.captionCodePoints}
              onInput={text => { const current = editRef.current; if (current) { const next = { ...current, draft: { ...current.draft, text } }; editRef.current = next; setEdit(next); } }}
              onCommitRequest={() => flushEdit()} onCompositionFinished={onCompositionFinished} />}
          </div>
        </div>
        <div className="player-bar">
          <button className="play-button" aria-label={player.playing ? '일시정지' : '재생'} title={player.playing ? '일시정지 (스페이스)' : '재생 (스페이스)'} disabled={!total} onClick={() => flushEdit(togglePlay)}><Icon name={player.playing ? 'pause' : 'play'} size={22} /></button>
          <span className="player-time" data-testid="player-time">{formatDuration(player.timeMs)} / {formatDuration(total)}</span>
          {importing && <span className="import-progress" role="progressbar" aria-label="영상 넣는 중" aria-valuenow={Math.round((importing.done / Math.max(1, importing.total)) * 100)}>
            영상을 넣고 있어요{importing.count > 1 ? ` (${importing.index + 1}/${importing.count})` : ''} {Math.round((importing.done / Math.max(1, importing.total)) * 100)}%
            <button className="outline" onClick={() => importing.controller.abort()}>멈추기</button>
          </span>}
        </div>
        <div className="bottom timeline">
          <div className="timeline-box" ref={timelineBox}>
            <VideoTimeline project={project} timeMs={player.timeMs} pxPerSecond={pxPerSecond} selectedClip={selectedClip} selectedOverlay={selectedOverlay} readOnly={readOnly}
              onSeek={ms => flushEdit(() => seek(ms))} onSelect={id => flushEdit(() => setSelectedClip(id))} onTrim={(clipId, inMs, outMs) => run({ type: 'trimClip', clipId, inMs, outMs })}
              memeLabel={id => builtins?.memes.find(item => item.id === id)?.label ?? id} onSelectOverlay={id => flushEdit(() => setSelectedOverlay(id))} onOverlayTime={(overlayId, startMs, durationMs) => run({ type: 'setOverlayTime', overlayId, startMs, durationMs })} />
          </div>
          <div className="zoom" aria-label="타임라인 배율">
            <input type="range" aria-label="타임라인 배율" min={0} max={ZOOM_STEPS} step={1} value={stepOfZoom(pxPerSecond, zoomLimits)} onChange={event => setZoom(zoomAtStep(Number(event.target.value), zoomLimits))} />
            <button className="icon-only" aria-label="타임라인 맞춤" title="전체가 보이게 맞춤" aria-pressed={zoom === null} onClick={() => setZoom(null)}><Icon name="fit" size={18} /></button>
            <span className="timeline-total" data-testid="timeline-total">{formatDuration(total)}</span>
          </div>
        </div>
      </main>
    </div>
    {confirmSave && <div className="dialog-backdrop"><div className="dialog" role="alertdialog" aria-modal="true" aria-label="원본 저장">
      <h2>원본 파일을 내려받을까요?</h2>
      <p>넣은 영상이 함께 들어가서 파일 크기가 약 {formatBytes(confirmSave.bytes)}예요. 다른 컴퓨터에서 이 파일로 작품을 다시 열 수 있어요.</p>
      <div className="dialog-actions">
        <button className="primary" onClick={() => void saveFileNow()}>내려받기</button>
        <button className="outline" onClick={() => setConfirmSave(null)}>취소</button>
      </div>
    </div></div>}
    {exporting && <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="내보내기">
      <h2>영상 파일을 만들고 있어요</h2>
      <div className="export-progress">
        <progress aria-label="영상 파일 만드는 중" value={exporting.done} max={exporting.total} />
        <span>{Math.round((exporting.done / Math.max(1, exporting.total)) * 100)}%</span>
      </div>
      <p>다 만들면 저절로 내려받아요. 긴 영상은 몇 분 걸릴 수 있어요. 그동안 다른 창을 써도 되지만 이 탭은 닫지 마세요.</p>
      <div className="dialog-actions"><button className="outline" onClick={() => exporting.controller.abort()}>멈추기</button></div>
    </div></div>}
    {exported && <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="내보내기 결과">
      <h2>영상 파일을 만들었어요</h2>
      <p data-testid="export-result">{exported.container === 'mp4' ? 'MP4' : 'WebM'} 파일 · 길이 {formatDuration(exported.durationMs)} · 크기 약 {formatBytes(exported.bytes)}{exported.container === 'webm' ? ' · 이 파일도 YouTube에 올릴 수 있어요.' : ''}</p>
      <p>YouTube에 올리려면 보호자 계정으로 올려 주세요. 보호자와 함께 YouTube 스튜디오에서 '만들기 → 동영상 업로드'를 누르고 이 파일을 고르면 돼요.</p>
      <div className="dialog-actions">
        <button className="outline" onClick={() => download(exported.file, exported.name)}>다시 받기</button>
        <button className="primary" onClick={() => setExported(null)}>닫기</button>
      </div>
    </div></div>}
    {pending && <div className="dialog-backdrop"><div className="dialog" role="alertdialog" aria-modal="true" aria-label="저장 실패">
      <h2>지금 작품을 저장하지 못했어요</h2>
      <p>이대로 넘어가면 마지막 변경이 사라질 수 있어요. 원본 파일을 내려받아 두면 나중에 다시 열 수 있어요.</p>
      <div className="dialog-actions">
        <button className="primary" onClick={() => void saveFileNow().then(() => { pending.next(); setPending(null); })}>원본 내려받고 넘어가기</button>
        <button className="outline" onClick={() => { pending.next(); setPending(null); }}>저장하지 않고 넘어가기</button>
        <button className="outline" onClick={() => setPending(null)}>취소</button>
      </div>
    </div></div>}
  </div>;
}
