// 영상 작품 목록(영상 기획안 §2). 슬라이드 작품 목록과 같은 배치이고, 템플릿 대신 처음 쓰는 아이를 위한 안내 카드를 둔다.
// 잠금을 쥐지 않으며, 지우기는 다른 탭이 영상 작품을 열고 있으면 미룬다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import type { VideoProjectSummary } from '../domain/videoTypes';
import { withExclusiveCatalog, VIDEO_LOCKS } from '../storage/locks';
import { deleteVideoProject, listVideoSummaries, removeOrphanMedia } from './videoDatabase';
import { formatDuration } from './format';
import { describeLength, LENGTH_LIMIT_MAX_MS, type LengthLimit } from '../domain/videoLength';
import { readLengthLimit, writeLengthLimit } from './lengthSetting';

function Thumb({ summary }: { summary: VideoProjectSummary }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!summary.thumbnail) return;
    const next = URL.createObjectURL(summary.thumbnail); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [summary.thumbnail]);
  return url ? <img src={url} alt="" /> : <span className="thumb-empty video-thumb-empty"><Icon name="video" size={32} /></span>;
}

const GUIDE = [
  { icon: 'upload', title: '1. 영상 가져오기', text: '휴대폰으로 찍은 영상을 넣고 필요 없는 부분을 잘라요.' },
  { icon: 'caption', title: '2. 자막·밈 넣기', text: '하고 싶은 말을 자막으로 달고 움직이는 밈을 얹어요.' },
  { icon: 'download', title: '3. 내보내기', text: 'MP4 파일로 만들어 보호자와 함께 YouTube에 올려요.' },
];

const MINUTE = 60_000, HOUR = 60 * MINUTE;

// 보호자 설정: 작품 하나의 길이 한도(분·시간·무제한). 이 브라우저에만 저장된다(계약 §5).
function LengthLimitDialog({ limit, onSave, onClose }: { limit: LengthLimit; onSave: (limit: LengthLimit) => void; onClose: () => void }) {
  const [unlimited, setUnlimited] = useState(limit === null);
  const startUnit: 'minute' | 'hour' = limit !== null && limit % HOUR === 0 ? 'hour' : 'minute';
  const [unit, setUnit] = useState<'minute' | 'hour'>(startUnit);
  const [amount, setAmount] = useState(String(limit === null ? 10 : limit / (startUnit === 'hour' ? HOUR : MINUTE)));
  const max = unit === 'hour' ? LENGTH_LIMIT_MAX_MS / HOUR : LENGTH_LIMIT_MAX_MS / MINUTE;
  const count = Number(amount);
  const valid = unlimited || (Number.isInteger(count) && count >= 1 && count <= max);
  const chosen: LengthLimit = unlimited ? null : count * (unit === 'hour' ? HOUR : MINUTE);
  return <div className="dialog-backdrop"><div className="dialog length-dialog" role="dialog" aria-modal="true" aria-label="영상 길이 한도">
    <h2>영상 길이 한도</h2>
    <p>작품 하나와 넣는 영상 하나의 최대 길이예요. 이 컴퓨터의 이 브라우저에만 적용돼요.</p>
    <label className="length-choice"><input type="radio" name="length-kind" checked={!unlimited} onChange={() => setUnlimited(false)} />
      <input type="number" aria-label="한도 숫자" min={1} max={max} step={1} value={amount} disabled={unlimited} onChange={event => setAmount(event.target.value)} />
      <select aria-label="한도 단위" value={unit} disabled={unlimited} onChange={event => setUnit(event.target.value as 'minute' | 'hour')}><option value="minute">분</option><option value="hour">시간</option></select>
      까지
    </label>
    <label className="length-choice"><input type="radio" name="length-kind" checked={unlimited} onChange={() => setUnlimited(true)} />무제한</label>
    {!valid && <p className="length-error" role="alert">1부터 {max}까지의 정수를 넣어 주세요.</p>}
    <p className="panel-note">길게 정할수록 느린 컴퓨터에서 내보내기가 오래 걸리고 저장 공간을 많이 써요. 영상 파일 크기 한도도 길이에 맞춰 늘어나요(10분마다 2GB, 무제한이면 남은 저장 공간까지). 한도를 줄여도 이미 만든 작품은 그대로 열려요.</p>
    <div className="dialog-actions">
      <button className="primary" disabled={!valid} onClick={() => onSave(chosen)}>저장</button>
      <button className="outline" onClick={onClose}>취소</button>
    </div>
  </div></div>;
}

type Props = { note?: string; onStart: () => void; onNew: () => void; onOpen: (projectId: string) => void; onFile: (file: File) => void; onDownload: (projectId: string) => Promise<string | null> };

export function VideoHome({ note, onStart, onNew, onOpen, onFile, onDownload }: Props) {
  const [summaries, setSummaries] = useState<VideoProjectSummary[]>();
  const [status, setStatus] = useState(note ?? '');
  const [removing, setRemoving] = useState<VideoProjectSummary | null>(null);
  const [limit, setLimit] = useState<LengthLimit>(readLengthLimit);
  const [editingLimit, setEditingLimit] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => { setSummaries(await listVideoSummaries()); }, []);
  useEffect(() => {
    // 어떤 탭도 영상 작품을 열고 있지 않으면 어디에도 쓰이지 않는 영상 바이트를 정리한다.
    void withExclusiveCatalog(removeOrphanMedia, VIDEO_LOCKS).catch(() => undefined);
    void refresh().catch(() => { setSummaries([]); setStatus('이 브라우저에서는 작품을 저장할 수 없어요. 원본 저장을 꼭 써 주세요.'); });
  }, [refresh]);

  async function download(summary: VideoProjectSummary) {
    const problem = await onDownload(summary.projectId);
    if (problem) setStatus(problem);
  }
  async function remove(summary: VideoProjectSummary) {
    const result = await withExclusiveCatalog(() => deleteVideoProject(summary.projectId), VIDEO_LOCKS);
    setRemoving(null);
    if (result.busy) { setStatus('다른 탭에서 영상 작품을 열고 있어요. 그 탭을 닫은 뒤 다시 지워 주세요.'); return; }
    setStatus(`"${summary.title}"을(를) 이 컴퓨터에서 지웠어요.`);
    await refresh();
  }

  return <div className="home video-home">
    <header className="topbar">
      <button className="on-gradient icon-only" aria-label="시작 화면" title="시작 화면" onClick={onStart}><Icon name="home" /></button>
      <strong className="brand">영상</strong>
      <span className="spacer" />
      <button className="on-gradient" title="보호자 설정: 영상 길이 한도" onClick={() => setEditingLimit(true)}>길이 한도 {describeLength(limit)}</button>
      <button className="on-gradient" onClick={() => fileInput.current?.click()}>원본 열기</button>
      <button className="share" onClick={onNew}><Icon name="plus" size={18} />새 작품</button>
      <input ref={fileInput} data-testid="open-video-file" type="file" accept=".canvavideo" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onFile(file); }} />
    </header>
    <main className="home-body">
      <p className="home-status" role="status">{status}</p>
      <h2>내 영상</h2>
      <p className="home-note">영상 작품과 넣은 영상은 이 컴퓨터의 이 브라우저에만 저장돼요. 다른 컴퓨터로 옮기려면 원본을 내려받으세요.</p>
      {summaries && summaries.length === 0 && <p className="panel-note">아직 만든 영상이 없어요. 새 작품을 만들어 보세요.</p>}
      <ul className="work-grid" aria-label="내 영상">
        {summaries?.map(summary => <li key={summary.projectId} className="work-card">
          <button className="work-open" aria-label={`${summary.title || '이름 없는 작품'} 열기`} onClick={() => onOpen(summary.projectId)}><Thumb summary={summary} /></button>
          <div className="work-info">
            <strong>{summary.title || '이름 없는 작품'}</strong>
            <small>{formatDuration(summary.durationMs)} · {new Date(summary.updatedAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}</small>
          </div>
          <div className="work-actions">
            <button aria-label={`${summary.title} 원본 내려받기`} title="원본 내려받기" onClick={() => void download(summary)}><Icon name="download" size={16} /></button>
            <button aria-label={`${summary.title} 지우기`} title="이 컴퓨터에서 지우기" onClick={() => setRemoving(summary)}><Icon name="trash" size={16} /></button>
          </div>
        </li>)}
      </ul>
      <h2>처음이면 이렇게</h2>
      <div className="guide-grid">
        {GUIDE.map(item => <div key={item.title} className="guide-card"><Icon name={item.icon} size={28} /><strong>{item.title}</strong><span>{item.text}</span></div>)}
      </div>
    </main>
    {editingLimit && <LengthLimitDialog limit={limit} onClose={() => setEditingLimit(false)} onSave={next => {
      setEditingLimit(false);
      if (!writeLengthLimit(next)) { setStatus('이 브라우저에서는 설정을 저장할 수 없어요.'); return; }
      setLimit(next); setStatus(next === null ? '영상 길이 한도를 없앴어요.' : `영상 길이 한도를 ${describeLength(next)}으로 바꿨어요.`);
    }} />}
    {removing && <div className="dialog-backdrop"><div className="dialog" role="alertdialog" aria-modal="true" aria-label="작품 지우기">
      <h2>"{removing.title}"을(를) 이 컴퓨터에서 지울까요?</h2>
      <p>지우면 되돌릴 수 없어요. 이 작품에만 쓴 영상도 함께 지워져요. 원본 파일을 내려받아 두면 나중에 다시 열 수 있어요.</p>
      <div className="dialog-actions">
        <button className="outline" onClick={() => void download(removing)}>원본 내려받기</button>
        <button className="danger" onClick={() => void remove(removing)}>지우기</button>
        <button className="outline" onClick={() => setRemoving(null)}>취소</button>
      </div>
    </div></div>}
  </div>;
}
