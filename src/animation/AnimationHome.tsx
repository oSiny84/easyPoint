// 애니메이션 작품 목록(애니메이션 계약 §6). 슬라이드 작품 목록과 같은 배치이고, 템플릿 대신 처음 쓰는 아이를 위한 안내 카드를 둔다.
// 잠금을 쥐지 않으며, 지우기는 다른 탭이 애니메이션 작품을 열고 있으면 미룬다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createAssetStore } from '../assets/assetStore';
import { Icon } from '../components/Icon';
import type { AnimationSummary } from '../domain/animationTypes';
import { downloadName } from '../storage/fileName';
import { ANIMATION_LOCKS, withExclusiveCatalog } from '../storage/locks';
import { deleteAnimationProject, listAnimationSummaries, openAnimationProject, removeOrphanAnimationAssets } from './animationDatabase';
import { ANIMATION_EXTENSION, serializeAnimation } from './animationFile';
import { clearExportFiles } from './exportFiles';
import { formatLength } from './frameTimes';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Thumb({ summary }: { summary: AnimationSummary }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!summary.thumbnail) return;
    const next = URL.createObjectURL(summary.thumbnail); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [summary.thumbnail]);
  return url ? <img src={url} alt="" /> : <span className="thumb-empty" />;
}

const GUIDE = [
  { icon: 'draw', title: '1. 첫 장 그리기', text: '그리기·요소·글씨·사진으로 첫 장을 만들어요.' },
  { icon: 'plus', title: '2. 다음 장 만들기', text: '아래 +를 누르면 같은 그림의 다음 장이 생겨요. 조금씩 옮기거나 고쳐 그려요.' },
  { icon: 'play', title: '3. 재생하고 내려받기', text: '재생으로 움직임을 보고, 영상(MP4)으로 내려받아요.' },
  { icon: 'upload', title: '장난감·점토로 만들려면', text: '휴대폰으로 한 장씩 찍은 사진을 업로드로 장마다 넣어요.' },
];

type Props = { note?: string; onStart: () => void; onNew: () => void; onOpen: (projectId: string) => void; onFile: (file: File) => void };

export function AnimationHome({ note, onStart, onNew, onOpen, onFile }: Props) {
  const [summaries, setSummaries] = useState<AnimationSummary[]>();
  const [status, setStatus] = useState(note ?? '');
  const [removing, setRemoving] = useState<AnimationSummary | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => { setSummaries(await listAnimationSummaries()); }, []);
  useEffect(() => {
    // 어떤 탭도 애니메이션 작품을 열고 있지 않으면 어디에도 쓰이지 않는 사진과 내보내기 임시 파일을 정리한다.
    void withExclusiveCatalog(async () => { await removeOrphanAnimationAssets(); await clearExportFiles(); }, ANIMATION_LOCKS).catch(() => undefined);
    void refresh().catch(() => { setSummaries([]); setStatus('이 브라우저에서는 작품을 저장할 수 없어요. 원본 저장을 꼭 써 주세요.'); });
  }, [refresh]);

  async function downloadOriginal(summary: AnimationSummary) {
    const opened = await openAnimationProject(summary.projectId);
    if (!opened.ok) { setStatus(opened.message); return; }
    const store = createAssetStore(opened.assets);
    const result = await serializeAnimation(opened.project, store.resolve);
    if (result.ok) download(result.blob, downloadName(opened.project.title, ANIMATION_EXTENSION)); else setStatus(result.message);
  }
  async function remove(summary: AnimationSummary) {
    const result = await withExclusiveCatalog(() => deleteAnimationProject(summary.projectId), ANIMATION_LOCKS);
    setRemoving(null);
    // 다른 탭이 열려 있으면 그 탭이 쓰는 사진을 지울 수 있어 삭제를 미룬다.
    if (result.busy) { setStatus('다른 탭에서 애니메이션 작품을 열고 있어요. 그 탭을 닫은 뒤 다시 지워 주세요.'); return; }
    setStatus(`"${summary.title}"을(를) 이 컴퓨터에서 지웠어요.`);
    await refresh();
  }

  return <div className="home animation-home">
    <header className="topbar">
      <button className="on-gradient icon-only" aria-label="시작 화면" title="시작 화면" onClick={onStart}><Icon name="home" /></button>
      <strong className="brand">애니메이션</strong>
      <span className="spacer" />
      <button className="on-gradient" onClick={() => fileInput.current?.click()}>원본 열기</button>
      <button className="share" onClick={onNew}><Icon name="plus" size={18} />새 작품</button>
      <input ref={fileInput} data-testid="open-animation-file" type="file" accept={`.${ANIMATION_EXTENSION}`} hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onFile(file); }} />
    </header>
    <main className="home-body">
      <p className="home-status" role="status">{status}</p>
      <h2>내 애니메이션</h2>
      <p className="home-note">작품은 이 컴퓨터의 이 브라우저에만 저장돼요. 다른 컴퓨터로 옮기려면 원본을 내려받으세요. 공용 컴퓨터라면 다 쓴 뒤 원본을 내려받고 작품을 지워 주세요.</p>
      {summaries && summaries.length === 0 && <p className="panel-note">아직 만든 애니메이션이 없어요. 새 작품을 만들어 보세요.</p>}
      <ul className="work-grid" aria-label="내 애니메이션">
        {summaries?.map(summary => <li key={summary.projectId} className="work-card">
          <button className="work-open" aria-label={`${summary.title || '이름 없는 작품'} 열기`} onClick={() => onOpen(summary.projectId)}><Thumb summary={summary} /></button>
          <div className="work-info">
            <strong>{summary.title || '이름 없는 작품'}</strong>
            <small>{summary.frameCount}장 · {formatLength(summary.durationMs)} · {new Date(summary.updatedAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}</small>
          </div>
          <div className="work-actions">
            <button aria-label={`${summary.title} 원본 내려받기`} title="원본 내려받기" onClick={() => void downloadOriginal(summary)}><Icon name="download" size={16} /></button>
            <button aria-label={`${summary.title} 지우기`} title="이 컴퓨터에서 지우기" onClick={() => setRemoving(summary)}><Icon name="trash" size={16} /></button>
          </div>
        </li>)}
      </ul>
      <h2>처음이면 이렇게</h2>
      <div className="guide-grid">
        {GUIDE.map(item => <div key={item.title} className="guide-card"><Icon name={item.icon} size={28} /><strong>{item.title}</strong><span>{item.text}</span></div>)}
      </div>
    </main>
    {removing && <div className="dialog-backdrop"><div className="dialog" role="alertdialog" aria-modal="true" aria-label="작품 지우기">
      <h2>"{removing.title}"을(를) 이 컴퓨터에서 지울까요?</h2>
      <p>지우면 되돌릴 수 없어요. 원본 파일을 내려받아 두면 나중에 다시 열 수 있어요. 이미 내려받은 파일은 지워지지 않아요.</p>
      <div className="dialog-actions">
        <button className="outline" onClick={() => void downloadOriginal(removing)}>원본 내려받기</button>
        <button className="danger" onClick={() => void remove(removing)}>지우기</button>
        <button className="outline" onClick={() => setRemoving(null)}>취소</button>
      </div>
    </div></div>}
  </div>;
}
