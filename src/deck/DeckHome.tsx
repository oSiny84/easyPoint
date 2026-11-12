// 장 묶음 문서(애니메이션·만화)의 작품 목록 공통 화면. 슬라이드 작품 목록과 같은 배치이고, 템플릿 대신 처음 쓰는 아이를 위한 안내 카드를 둔다.
// 잠금을 쥐지 않으며, 지우기는 다른 탭이 같은 편집기의 작품을 열고 있으면 미룬다. 글귀와 저장소 함수는 편집기마다 config로 넘긴다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createAssetStore } from '../assets/assetStore';
import { Icon } from '../components/Icon';
import type { Failure, Project } from '../domain/types';
import { downloadName } from '../storage/fileName';
import { withExclusiveCatalog, type LockNames } from '../storage/locks';
import type { AssetResolver } from '../storage/projectFile';
import type { DeckOpenResult, DeckSummaryBase } from './deckDatabase';

export type DeckHomeConfig<P extends Project, S extends DeckSummaryBase> = {
  // 화면 구분용 CSS 이름, 상단 이름, 목록 제목, 빈 목록 안내, 다른 탭이 열고 있을 때의 안내.
  className: string; brand: string; heading: string; emptyNote: string; busyNote: string;
  // 원본 열기 입력의 시험용 이름과 확장자.
  fileTestId: string; extension: string;
  locks: LockNames;
  list: () => Promise<S[]>; open: (projectId: string) => Promise<DeckOpenResult<P>>; remove: (projectId: string) => Promise<void>; removeOrphans: () => Promise<number>;
  // 목록을 열 때 고아 사진과 함께 치울 것(애니메이션의 내보내기 임시 파일).
  cleanup?: () => Promise<unknown>;
  serialize: (project: P, resolve: AssetResolver) => Promise<{ ok: true; blob: Blob } | Failure>;
  // 카드의 둘째 줄 앞부분(예: "4장 · 0.8초").
  describe: (summary: S) => string;
  guide: readonly { icon: string; title: string; text: string }[];
};

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Thumb({ thumbnail }: { thumbnail: Blob | null }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!thumbnail) return;
    const next = URL.createObjectURL(thumbnail); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [thumbnail]);
  return url ? <img src={url} alt="" /> : <span className="thumb-empty" />;
}

type Props<P extends Project, S extends DeckSummaryBase> = { config: DeckHomeConfig<P, S>; note?: string; onStart: () => void; onNew: () => void; onOpen: (projectId: string) => void; onFile: (file: File) => void };

export function DeckHome<P extends Project, S extends DeckSummaryBase>({ config, note, onStart, onNew, onOpen, onFile }: Props<P, S>) {
  const [summaries, setSummaries] = useState<S[]>();
  const [status, setStatus] = useState(note ?? '');
  const [removing, setRemoving] = useState<S | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => { setSummaries(await config.list()); }, [config]);
  useEffect(() => {
    // 어떤 탭도 이 편집기의 작품을 열고 있지 않으면 어디에도 쓰이지 않는 사진(과 임시 파일)을 정리한다.
    void withExclusiveCatalog(async () => { await config.removeOrphans(); await config.cleanup?.(); }, config.locks).catch(() => undefined);
    void refresh().catch(() => { setSummaries([]); setStatus('이 브라우저에서는 작품을 저장할 수 없어요. 원본 저장을 꼭 써 주세요.'); });
  }, [refresh, config]);

  async function downloadOriginal(summary: S) {
    const opened = await config.open(summary.projectId);
    if (!opened.ok) { setStatus(opened.message); return; }
    const store = createAssetStore(opened.assets);
    const result = await config.serialize(opened.project, store.resolve);
    if (result.ok) download(result.blob, downloadName(opened.project.title, config.extension)); else setStatus(result.message);
  }
  async function remove(summary: S) {
    const result = await withExclusiveCatalog(() => config.remove(summary.projectId), config.locks);
    setRemoving(null);
    // 다른 탭이 열려 있으면 그 탭이 쓰는 사진을 지울 수 있어 삭제를 미룬다.
    if (result.busy) { setStatus(config.busyNote); return; }
    setStatus(`"${summary.title}"을(를) 이 컴퓨터에서 지웠어요.`);
    await refresh();
  }

  return <div className={`home ${config.className}`}>
    <header className="topbar">
      <button className="on-gradient icon-only" aria-label="시작 화면" title="시작 화면" onClick={onStart}><Icon name="home" /></button>
      <strong className="brand">{config.brand}</strong>
      <span className="spacer" />
      <button className="on-gradient" onClick={() => fileInput.current?.click()}>원본 열기</button>
      <button className="share" onClick={onNew}><Icon name="plus" size={18} />새 작품</button>
      <input ref={fileInput} data-testid={config.fileTestId} type="file" accept={`.${config.extension}`} hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onFile(file); }} />
    </header>
    <main className="home-body">
      <p className="home-status" role="status">{status}</p>
      <h2>{config.heading}</h2>
      <p className="home-note">작품은 이 컴퓨터의 이 브라우저에만 저장돼요. 다른 컴퓨터로 옮기려면 원본을 내려받으세요. 공용 컴퓨터라면 다 쓴 뒤 원본을 내려받고 작품을 지워 주세요.</p>
      {summaries && summaries.length === 0 && <p className="panel-note">{config.emptyNote}</p>}
      <ul className="work-grid" aria-label={config.heading}>
        {summaries?.map(summary => <li key={summary.projectId} className="work-card">
          <button className="work-open" aria-label={`${summary.title || '이름 없는 작품'} 열기`} onClick={() => onOpen(summary.projectId)}><Thumb thumbnail={summary.thumbnail} /></button>
          <div className="work-info">
            <strong>{summary.title || '이름 없는 작품'}</strong>
            <small>{config.describe(summary)} · {new Date(summary.updatedAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}</small>
          </div>
          <div className="work-actions">
            <button aria-label={`${summary.title} 원본 내려받기`} title="원본 내려받기" onClick={() => void downloadOriginal(summary)}><Icon name="download" size={16} /></button>
            <button aria-label={`${summary.title} 지우기`} title="이 컴퓨터에서 지우기" onClick={() => setRemoving(summary)}><Icon name="trash" size={16} /></button>
          </div>
        </li>)}
      </ul>
      <h2>처음이면 이렇게</h2>
      <div className="guide-grid">
        {config.guide.map(item => <div key={item.title} className="guide-card"><Icon name={item.icon} size={28} /><strong>{item.title}</strong><span>{item.text}</span></div>)}
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
