// 시작 화면(영상 기획안 §2, 영상 계약 §6, 애니메이션 계약 §6, 만화 계약 §6). 슬라이드·영상·애니메이션·만화 중 하나를 고르고, 네 종류의 최근 작품을 섞어 보여 준다.
// 잠금을 쥐지 않는다. 각 저장소의 요약만 읽는다.
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';

export type EditorKind = 'slide' | 'video' | 'animation' | 'comic';
export type RecentWork = { kind: EditorKind; projectId: string; title: string; updatedAt: string; thumbnail: Blob | null };
export const RECENT_COUNT = 6;

function Thumb({ blob, kind }: { blob: Blob | null; kind: EditorKind }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  if (url) return <img src={url} alt="" />;
  // 영상 미리보기 그림은 영상을 넣는 단계(V4)부터 만든다. 그 전에는 아이콘으로 종류를 보여 준다.
  return kind === 'video' ? <span className="thumb-empty video-thumb-empty"><Icon name="video" size={32} /></span> : <span className="thumb-empty" />;
}

const KIND_LABEL: Record<EditorKind, string> = { slide: '슬라이드', video: '영상', animation: '애니메이션', comic: '만화' };
const KIND_ICON: Record<EditorKind, string> = { slide: 'template', video: 'video', animation: 'animation', comic: 'comic' };

type Props = { note?: string; loadRecent: () => Promise<RecentWork[]>; onChoose: (kind: EditorKind) => void; onOpen: (work: RecentWork) => void };

export function StartScreen({ note, loadRecent, onChoose, onOpen }: Props) {
  const [recent, setRecent] = useState<RecentWork[]>();
  const [status, setStatus] = useState(note ?? '');
  useEffect(() => {
    let active = true;
    void loadRecent().then(rows => { if (active) setRecent(rows.slice(0, RECENT_COUNT)); }, () => { if (active) { setRecent([]); setStatus('이 브라우저에서는 작품을 저장할 수 없어요. 원본 저장을 꼭 써 주세요.'); } });
    return () => { active = false; };
  }, [loadRecent]);

  return <div className="home start">
    <header className="topbar"><strong className="brand">easyCraft</strong></header>
    <main className="home-body">
      <p className="home-status" role="status">{status}</p>
      <h1 className="start-title">무엇을 만들까요?</h1>
      <div className="start-tiles">
        <button className="start-tile tile-slide" onClick={() => onChoose('slide')}><Icon name="template" size={56} /><span>슬라이드 만들기</span></button>
        <button className="start-tile tile-video" onClick={() => onChoose('video')}><Icon name="video" size={56} /><span>영상 만들기</span></button>
        <button className="start-tile tile-animation" onClick={() => onChoose('animation')}><Icon name="animation" size={56} /><span>애니메이션 만들기</span></button>
        <button className="start-tile tile-comic" onClick={() => onChoose('comic')}><Icon name="comic" size={56} /><span>만화 만들기</span></button>
      </div>
      {recent && recent.length > 0 && <>
        <h2>최근 작품</h2>
        <ul className="work-grid" aria-label="최근 작품">
          {recent.map(work => <li key={`${work.kind}-${work.projectId}`} className="work-card">
            <button className="work-open" aria-label={`${KIND_LABEL[work.kind]} ${work.title || '이름 없는 작품'} 열기`} onClick={() => onOpen(work)}><Thumb blob={work.thumbnail} kind={work.kind} /></button>
            <div className="work-info">
              <strong><span className={`kind-badge kind-${work.kind}`}><Icon name={KIND_ICON[work.kind]} size={14} />{KIND_LABEL[work.kind]}</span>{work.title || '이름 없는 작품'}</strong>
              <small>{new Date(work.updatedAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}</small>
            </div>
          </li>)}
        </ul>
      </>}
    </main>
  </div>;
}
