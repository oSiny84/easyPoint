// 영상 편집 화면(영상 기획안 §3). 상단 바·왼쪽 도구·가운데 작업 공간·아래 띠는 슬라이드 편집기와 같은 모양이고, 아래 띠만 타임라인이다.
// V4 범위: 영상 가져오기(파일 선택·끌어놓기), 미리보기 재생, 타임라인(재생 막대·확대·다듬기), 자르기·지우기·순서·조각 소리.
// 자막은 V5, 밈·소리 패널은 V6, 내보내기는 V7에서 연결한다.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { Icon } from '../components/Icon';
import { Menu, type MenuAnchor } from '../components/Menu';
import { ToolRail, type Tool } from '../app/ToolRail';
import type { VideoCommand } from '../commands/videoApply';
import { clipLength, clipStarts, locate, totalMs } from '../domain/timeline';
import { CANVAS, VIDEO_LIMITS } from '../domain/videoLimits';
import type { Media, VideoProject } from '../domain/videoTypes';
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
import { expectedFileBytes, serializeVideoProject } from './videoFile';
import { VideoTimeline } from './VideoTimeline';

export type VideoSession = { store: VideoStore; lock: SessionLock };
type VideoToolId = 'video' | 'caption' | 'meme' | 'sound';
const VIDEO_TOOLS: readonly Tool<VideoToolId>[] = [
  { id: 'video', label: '영상', icon: 'video' },
  { id: 'caption', label: '자막', icon: 'caption' },
  { id: 'meme', label: '밈', icon: 'meme' },
  { id: 'sound', label: '소리', icon: 'sound' },
];
const PANEL_MIN_WINDOW = 1200;
const ZOOM_MIN = 5, ZOOM_MAX = 200;
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

// onOpenFile은 실패하면 안내 문구를 돌려준다. 그때 지금 작품은 그대로다.
type Props = { value: VideoSession; initialNote?: string; initiallySaved?: boolean; onHome: () => void; onNew: () => void; onOpenFile: (file: File) => Promise<string | null> };

export function VideoEditor({ value, initialNote, initiallySaved, onHome, onNew, onOpenFile }: Props) {
  const { store } = value;
  const readOnly = value.lock.readOnly;
  const project = useSyncExternalStore(store.subscribe, store.getProject);
  const [title, setTitle] = useState(project.title);
  const [status, setStatus] = useState(initialNote ?? '');
  const [saveState, setSaveState] = useState<SaveState>(() => initiallySaved || isUntouchedVideo(store.getProject()) ? 'saved' : 'dirty');
  const [tool, setTool] = useState<VideoToolId | null>(() => !readOnly && window.innerWidth >= PANEL_MIN_WINDOW ? 'video' : null);
  const [fileMenu, setFileMenu] = useState<MenuAnchor | null>(null);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [pending, setPending] = useState<{ next: () => void } | null>(null);
  const [confirmSave, setConfirmSave] = useState<{ bytes: number } | null>(null);
  const [player, setPlayer] = useState<PlayerState>({ playing: false, timeMs: 0 });
  // 타임라인 배율(초당 픽셀). null이면 작품 전체가 띠에 들어가게 맞춘다.
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
    } else setSelectedClip(null);
    setStatus(result.adjustedOverlays ? `자막·밈 ${result.adjustedOverlays}개가 영상과 함께 바뀌었어요.` : '');
  }, [store, seek]);
  const run = useCallback((command: VideoCommand) => { const current = store.getProject(); const result = store.dispatch(current.id, current.revision, command); report(result); return result; }, [store, report]);
  const undo = useCallback(() => report(store.undo(), true), [store, report]);
  const redo = useCallback(() => report(store.redo(), true), [store, report]);
  const togglePlay = useCallback(() => { const instance = preview.current; if (!instance) return; if (instance.state.playing) instance.pause(); else void instance.play(); }, []);

  // 파일 선택·끌어놓기가 모두 이 경로를 쓴다. 하나씩 넣고, 실패한 파일은 작품을 건드리지 않는다.
  async function importFiles(files: readonly File[]) {
    if (readOnly || importing || !files.length) return;
    const controller = new AbortController();
    let added = 0;
    for (const [index, file] of files.entries()) {
      if (controller.signal.aborted) break;
      setImporting({ done: 0, total: file.size, index, count: files.length, controller });
      const result = await importMedia(file, { signal: controller.signal, onProgress: (done, total) => setImporting({ done, total, index, count: files.length, controller }) });
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
      if (isTyping(event)) return;
      const key = event.key.toLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
        if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); redo(); }
        return;
      }
      if (event.key === ' ' && (event.target as HTMLElement).tagName !== 'BUTTON') { event.preventDefault(); togglePlay(); return; }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedClip && !readOnly) { event.preventDefault(); run({ type: 'deleteClip', clipId: selectedClip }); }
      if (event.key === 'Escape') setSelectedClip(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, togglePlay, run, selectedClip, readOnly]);

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
    preview.current?.pause();
    importing?.controller.abort();
    const saved = readOnly || !autosave.current || isUntouchedVideo(store.getProject()) || await autosave.current.flush();
    if (saved) next(); else setPending({ next });
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
  const fitZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (timelineWidth - 48) / Math.max(1, total / 1000)));
  const pxPerSecond = zoom ?? fitZoom;
  const clipIndex = project.clips.findIndex(clip => clip.id === selectedClip);
  const clip = clipIndex >= 0 ? project.clips[clipIndex] : null;
  // 재생 막대가 선택한 조각 안에서 양 끝 0.1초보다 안쪽이면 자를 수 있다. 안 되면 단추를 끈다(아이에게 오류를 보이지 않는다).
  const at = locate(project.clips, Math.min(player.timeMs, Math.max(0, total - 1)));
  const splitAt = clip && at?.clip.id === clip.id && at.sourceMs >= clip.inMs + VIDEO_LIMITS.splitMarginMs && at.sourceMs <= clip.outMs - VIDEO_LIMITS.splitMarginMs ? at.sourceMs : null;
  const mediaNumber = (mediaId: string) => project.mediaManifest.findIndex(media => media.id === mediaId) + 1;

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
    : <div className="panel-body"><p className="panel-note">{tool === 'caption' ? '자막' : tool === 'meme' ? '밈' : '소리'} 기능은 준비 중이에요.</p></div>;

  return <div className="app video-app" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void importFiles([...event.dataTransfer.files]); }}>
    <header className="topbar">
      <button className="on-gradient icon-only" aria-label="작품 목록" title="작품 목록" onClick={() => void afterSaved(onHome)}><Icon name="back" /></button>
      <button className="on-gradient" onClick={event => setFileMenu(anchorOf(event))}><Icon name="file" size={18} />파일<Icon name="chevron" size={14} /></button>
      <button className="on-gradient icon-only" aria-label="되돌리기" title="되돌리기 (Ctrl+Z)" disabled={!store.canUndo()} onClick={undo}><Icon name="undo" /></button>
      <button className="on-gradient icon-only" aria-label="다시 하기" title="다시 하기 (Ctrl+Shift+Z)" disabled={!store.canRedo()} onClick={redo}><Icon name="redo" /></button>
      <input className="title" aria-label="작품 이름" readOnly={readOnly} value={title} onChange={event => setTitle(event.target.value)} onBlur={() => run({ type: 'renameProject', title })} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
      <span className={saveState === 'failed' && !readOnly ? 'save-state failed' : 'save-state'} data-testid="save-state">{readOnly ? '읽기 전용' : isUntouchedVideo(project) ? '새 작품' : SAVE_LABEL[saveState]}</span>
      <span className="spacer" />
      <button className="share" disabled title="다음 단계에서 열려요"><Icon name="download" size={18} />내보내기</button>
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
      <ToolRail tools={VIDEO_TOOLS} active={tool} onChange={setTool} panel={panel} disabled={readOnly} />
      <main className="stage-area">
        <div className="selection-row">
          {clip && !readOnly ? <div className="selection-bar" role="toolbar" aria-label="선택한 조각 설정">
            <button disabled={splitAt === null} title={splitAt === null ? '재생 막대를 조각 안으로 옮기면 자를 수 있어요' : '재생 막대 위치에서 자르기'} onClick={() => { if (splitAt !== null) run({ type: 'splitClip', clipId: clip.id, atMs: splitAt }); }}><Icon name="cut" size={18} />여기서 자르기</button>
            <span className="bar-divider" />
            <button aria-label="앞으로 옮기기" title="앞으로 옮기기" disabled={clipIndex === 0} onClick={() => run({ type: 'reorderClip', clipId: clip.id, toIndex: clipIndex - 1 })}><Icon name="back" size={18} /></button>
            <button aria-label="뒤로 옮기기" title="뒤로 옮기기" disabled={clipIndex === project.clips.length - 1} onClick={() => run({ type: 'reorderClip', clipId: clip.id, toIndex: clipIndex + 1 })}><Icon name="forward" size={18} /></button>
            <button aria-pressed={clip.muted} onClick={() => run({ type: 'setClipMuted', clipId: clip.id, muted: !clip.muted })}><Icon name="sound" size={18} />{clip.muted ? '소리 켜기' : '소리 끄기'}</button>
            <span className="bar-divider" />
            <button aria-label="조각 지우기" title="조각 지우기" onClick={() => run({ type: 'deleteClip', clipId: clip.id })}><Icon name="trash" size={18} /></button>
          </div> : <span />}
          <p className="status" role="status">{readOnly ? (value.lock.reason === 'other-tab' ? '다른 탭에서 편집 중이라 읽기만 할 수 있어요.' : '이 브라우저에서는 편집할 수 없어요. Chrome이나 Edge를 써 주세요.') : status}</p>
        </div>
        <div className="work video-work">
          <div className={`video-stage ${project.orientation}`} data-testid="video-stage" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
            <canvas ref={canvas} data-testid="preview" aria-label="미리보기" />
            {!project.clips.length && <span className="stage-empty">왼쪽 영상 도구에서 영상을 가져오세요</span>}
          </div>
        </div>
        <div className="player-bar">
          <button className="play-button" aria-label={player.playing ? '일시정지' : '재생'} title={player.playing ? '일시정지 (스페이스)' : '재생 (스페이스)'} disabled={!total} onClick={togglePlay}><Icon name={player.playing ? 'pause' : 'play'} size={22} /></button>
          <span className="player-time" data-testid="player-time">{formatDuration(player.timeMs)} / {formatDuration(total)}</span>
          {importing && <span className="import-progress" role="progressbar" aria-label="영상 넣는 중" aria-valuenow={Math.round((importing.done / Math.max(1, importing.total)) * 100)}>
            영상을 넣고 있어요{importing.count > 1 ? ` (${importing.index + 1}/${importing.count})` : ''} {Math.round((importing.done / Math.max(1, importing.total)) * 100)}%
            <button className="outline" onClick={() => importing.controller.abort()}>멈추기</button>
          </span>}
          {project.overlays.length > 0 && <span className="player-note">자막·밈은 다음 단계에서 화면에 보여요</span>}
        </div>
        <div className="bottom timeline">
          <div className="timeline-box" ref={timelineBox}>
            <VideoTimeline project={project} timeMs={player.timeMs} pxPerSecond={pxPerSecond} selectedClip={selectedClip} readOnly={readOnly}
              onSeek={seek} onSelect={setSelectedClip} onTrim={(clipId, inMs, outMs) => run({ type: 'trimClip', clipId, inMs, outMs })} />
          </div>
          <div className="zoom" aria-label="타임라인 배율">
            <input type="range" aria-label="타임라인 배율" min={ZOOM_MIN} max={ZOOM_MAX} step={1} value={Math.round(pxPerSecond)} onChange={event => setZoom(Number(event.target.value))} />
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
