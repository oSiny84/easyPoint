// 작품 목록 화면. 잠금을 쥐지 않으며, 지우기는 다른 탭이 열려 있으면 미룬다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { libraryUrl, loadTemplates, type TemplateItem } from '../assets/library';
import { createAssetStore } from '../assets/assetStore';
import { Icon } from '../components/Icon';
import type { ProjectSummary } from '../domain/types';
import { deleteProject, listSummaries, openProject, removeOrphanAssets } from '../storage/database';
import { downloadName } from '../storage/fileName';
import { withExclusiveCatalog } from '../storage/locks';
import { serializeProject } from '../storage/projectFile';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SummaryThumb({ summary }: { summary: ProjectSummary }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!summary.thumbnail) return;
    const next = URL.createObjectURL(summary.thumbnail); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [summary.thumbnail]);
  return url ? <img src={url} alt="" /> : <span className="thumb-empty" />;
}

type Props = { note?: string; onOpen: (projectId: string) => void; onNew: () => void; onFile: (file: File) => void; onTemplate: (template: TemplateItem) => void };

export function Home({ note, onOpen, onNew, onFile, onTemplate }: Props) {
  const [summaries, setSummaries] = useState<ProjectSummary[]>();
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [status, setStatus] = useState(note ?? '');
  const [removing, setRemoving] = useState<ProjectSummary | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => { setSummaries(await listSummaries()); }, []);
  useEffect(() => {
    // 어떤 탭도 작품을 열고 있지 않으면 어디에도 쓰이지 않는 사진을 정리한다.
    void withExclusiveCatalog(removeOrphanAssets).catch(() => undefined);
    void refresh().catch(() => { setSummaries([]); setStatus('이 브라우저에서는 작품을 저장할 수 없어요. 원본 저장을 꼭 써 주세요.'); });
    void loadTemplates().then(setTemplates).catch(() => undefined);
  }, [refresh]);

  async function downloadOriginal(summary: ProjectSummary) {
    const opened = await openProject(summary.projectId);
    if (!opened.ok) { setStatus(opened.message); return; }
    const store = createAssetStore(opened.assets);
    const result = await serializeProject(opened.project, store.resolve);
    if (result.ok) download(result.blob, downloadName(opened.project.title, 'canvacraft')); else setStatus(result.message);
  }
  async function remove(summary: ProjectSummary) {
    const result = await withExclusiveCatalog(() => deleteProject(summary.projectId));
    setRemoving(null);
    // 다른 탭이 열려 있으면 그 탭이 쓰는 사진을 지울 수 있어 삭제를 미룬다.
    if (result.busy) { setStatus('다른 탭에서 작품을 열고 있어요. 그 탭을 닫은 뒤 다시 지워 주세요.'); return; }
    setStatus(`"${summary.title}"을(를) 이 컴퓨터에서 지웠어요.`);
    await refresh();
  }

  return <div className="home">
    <header className="topbar">
      <strong className="brand">CanvaCraft</strong>
      <span className="spacer" />
      <button className="on-gradient" onClick={() => fileInput.current?.click()}>원본 열기</button>
      <button className="share" onClick={onNew}><Icon name="plus" size={18} />새 작품</button>
      <input ref={fileInput} data-testid="open-file" type="file" accept=".canvacraft" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onFile(file); }} />
    </header>
    <main className="home-body">
      <p className="home-status" role="status">{status}</p>
      <h2>내 작품</h2>
      <p className="home-note">작품은 이 컴퓨터의 이 브라우저에만 저장돼요. 다른 컴퓨터로 옮기려면 원본을 내려받으세요. 공용 컴퓨터라면 다 쓴 뒤 원본을 내려받고 작품을 지워 주세요.</p>
      {summaries && summaries.length === 0 && <p className="panel-note">아직 저장된 작품이 없어요. 새 작품을 만들어 보세요.</p>}
      <ul className="work-grid" aria-label="내 작품">
        {summaries?.map(summary => <li key={summary.projectId} className="work-card">
          <button className="work-open" aria-label={`${summary.title || '이름 없는 작품'} 열기`} onClick={() => onOpen(summary.projectId)}><SummaryThumb summary={summary} /></button>
          <div className="work-info">
            <strong>{summary.title || '이름 없는 작품'}</strong>
            <small>{new Date(summary.updatedAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}</small>
          </div>
          <div className="work-actions">
            <button aria-label={`${summary.title} 원본 내려받기`} title="원본 내려받기" onClick={() => void downloadOriginal(summary)}><Icon name="download" size={16} /></button>
            <button aria-label={`${summary.title} 지우기`} title="이 컴퓨터에서 지우기" onClick={() => setRemoving(summary)}><Icon name="trash" size={16} /></button>
          </div>
        </li>)}
      </ul>
      <h2>템플릿으로 시작</h2>
      <div className="template-grid">
        {templates.map(item => <button key={item.id} className="template-card" aria-label={`템플릿 ${item.label}`} onClick={() => onTemplate(item)}><img src={libraryUrl(item.thumbnail)} alt="" loading="lazy" /><span>{item.label}</span></button>)}
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
