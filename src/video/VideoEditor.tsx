// 영상 편집 화면 틀(영상 기획안 §3). 상단 바·왼쪽 도구·가운데 작업 공간·아래 띠는 슬라이드 편집기와 같은 모양이고, 아래 띠만 타임라인이다.
// V3 범위: 작품 이름·되돌리기·자동 저장·원본 열기/저장과 조각 목록 표시. 영상 넣기·미리보기·타임라인 조작은 V4, 자막은 V5, 밈·소리는 V6, 내보내기는 V7에서 연결한다.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { Icon } from '../components/Icon';
import { Menu, type MenuAnchor } from '../components/Menu';
import { ToolRail, type Tool } from '../app/ToolRail';
import type { VideoCommand } from '../commands/videoApply';
import { clipLength, totalMs } from '../domain/timeline';
import { CANVAS } from '../domain/videoLimits';
import type { VideoProject } from '../domain/videoTypes';
import { createAutosave, type Autosave, type SaveState } from '../state/autosave';
import type { VideoDispatchResult, VideoStore } from '../state/videoStore';
import { requestPersistence } from '../storage/database';
import { downloadName } from '../storage/fileName';
import type { SessionLock } from '../storage/locks';
import { formatBytes, formatDuration } from './format';
import { readMedia } from './mediaStore';
import { saveVideoProject } from './videoDatabase';
import { expectedFileBytes, serializeVideoProject } from './videoFile';

export type VideoSession = { store: VideoStore; lock: SessionLock };
type VideoToolId = 'video' | 'caption' | 'meme' | 'sound';
const VIDEO_TOOLS: readonly Tool<VideoToolId>[] = [
  { id: 'video', label: '영상', icon: 'video' },
  { id: 'caption', label: '자막', icon: 'caption' },
  { id: 'meme', label: '밈', icon: 'meme' },
  { id: 'sound', label: '소리', icon: 'sound' },
];
const PANEL_MIN_WINDOW = 1200;
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
  return event.isComposing || event.keyCode === 229 || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

// 원본 파일로 만든다. 실패하면 안내 문구를 돌려준다.
export async function downloadOriginal(project: VideoProject): Promise<string | null> {
  const result = await serializeVideoProject(project, readMedia);
  if (!result.ok) return result.message;
  download(result.blob, downloadName(project.title, 'canvavideo'));
  return null;
}

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
  const autosave = useRef<Autosave | null>(null);
  const openInput = useRef<HTMLInputElement>(null);
  useEffect(() => { setTitle(project.title); }, [project.title]);

  const report = useCallback((result: VideoDispatchResult) => {
    if (!result.ok) { setStatus(result.message); return; }
    // 되돌린 뒤에는 focus의 조각을 선택한다. 없어졌으면 선택을 푼다(계약 §4).
    if (result.changed) {
      setSelectedClip(result.focus?.kind === 'clip' ? result.focus.id : null);
      setStatus(result.adjustedOverlays ? `자막·밈 ${result.adjustedOverlays}개가 영상과 함께 바뀌었어요.` : '');
    }
  }, []);
  const run = useCallback((command: VideoCommand) => { const current = store.getProject(); const result = store.dispatch(current.id, current.revision, command); report(result); return result; }, [store, report]);

  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __canvacraftVideo: { store } });
  }, [store]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event)) return;
      const key = event.key.toLowerCase();
      if (!(event.ctrlKey || event.metaKey)) return;
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); report(store.undo()); }
      if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); report(store.redo()); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, report]);

  // 자동 저장(슬라이드와 같은 시점 규칙, 영상 계약 §6). 미리보기 그림은 영상 넣기(V4) 뒤에 만든다.
  useEffect(() => {
    if (readOnly) return;
    let persisted = false;
    const saver = createAutosave({
      getRevision: () => store.getProject().revision,
      initiallySaved: !!initiallySaved || isUntouchedVideo(store.getProject()),
      onState: (state, message) => { setSaveState(state); if (message) setStatus(message); },
      save: async () => {
        const result = await saveVideoProject(store.getProject());
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

  const canvas = CANVAS[project.orientation];
  const total = totalMs(project.clips);
  const mediaNumber = (mediaId: string) => project.mediaManifest.findIndex(media => media.id === mediaId) + 1;
  const panel = tool === 'video'
    ? <div className="panel-body">
      <button className="primary" disabled title="다음 단계에서 열려요">영상 가져오기</button>
      <p className="panel-note">영상 넣기는 준비 중이에요. 지금은 원본 파일(.canvavideo)을 열어 볼 수 있어요.</p>
      {project.mediaManifest.length > 0 && <>
        <h3>가져온 영상</h3>
        <ul className="media-list" aria-label="가져온 영상">
          {project.mediaManifest.map((media, index) => <li key={media.id}><Icon name="video" size={16} />영상 {index + 1}<small>{formatDuration(media.durationMs)}</small></li>)}
        </ul>
      </>}
    </div>
    : <div className="panel-body"><p className="panel-note">{tool === 'caption' ? '자막' : tool === 'meme' ? '밈' : '소리'} 기능은 준비 중이에요.</p></div>;

  return <div className="app video-app">
    <header className="topbar">
      <button className="on-gradient icon-only" aria-label="작품 목록" title="작품 목록" onClick={() => void afterSaved(onHome)}><Icon name="back" /></button>
      <button className="on-gradient" onClick={event => setFileMenu(anchorOf(event))}><Icon name="file" size={18} />파일<Icon name="chevron" size={14} /></button>
      <button className="on-gradient icon-only" aria-label="되돌리기" title="되돌리기 (Ctrl+Z)" disabled={!store.canUndo()} onClick={() => report(store.undo())}><Icon name="undo" /></button>
      <button className="on-gradient icon-only" aria-label="다시 하기" title="다시 하기 (Ctrl+Shift+Z)" disabled={!store.canRedo()} onClick={() => report(store.redo())}><Icon name="redo" /></button>
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
    <div className="workspace">
      <ToolRail tools={VIDEO_TOOLS} active={tool} onChange={setTool} panel={panel} disabled={readOnly} />
      <main className="stage-area">
        <div className="selection-row">
          <span />
          <p className="status" role="status">{readOnly ? (value.lock.reason === 'other-tab' ? '다른 탭에서 편집 중이라 읽기만 할 수 있어요.' : '이 브라우저에서는 편집할 수 없어요. Chrome이나 Edge를 써 주세요.') : status}</p>
        </div>
        <div className="work video-work">
          <div className={`video-stage ${project.orientation}`} data-testid="video-stage" style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}>
            <span>{project.clips.length ? `영상 ${project.clips.length}조각 · ${formatDuration(total)}` : '영상을 넣으면 여기에 보여요'}</span>
          </div>
        </div>
        <div className="bottom timeline">
          <span className="timeline-total" data-testid="timeline-total">{formatDuration(total)}</span>
          <ol className="clip-strip" aria-label="영상 조각">
            {project.clips.map(clip => <li key={clip.id}>
              <button className={clip.id === selectedClip ? 'clip-chip current' : 'clip-chip'} aria-pressed={clip.id === selectedClip} onClick={() => setSelectedClip(clip.id)}>
                <Icon name="video" size={16} />영상 {mediaNumber(clip.mediaId)}<small>{formatDuration(clipLength(clip))}</small>
              </button>
            </li>)}
            {!project.clips.length && <li className="clip-empty">아직 영상이 없어요</li>}
          </ol>
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
