// 상단 바(UI_REFERENCE §1·§5).
import { useState, type MouseEvent } from 'react';
import { Icon } from '../components/Icon';
import { Menu, Popover, type MenuAnchor } from '../components/Menu';

export type ExportKind = 'pptx' | 'pdf' | 'image';
export type ExportProgress = { done: number; total: number };
const FORMATS: { id: ExportKind; label: string; note: string }[] = [
  { id: 'pptx', label: 'PowerPoint (.pptx)', note: '글씨와 사진을 PowerPoint에서 고칠 수 있어요. 글꼴은 맑은 고딕으로 바뀌고 줄이 화면과 다르게 나뉠 수 있어요.' },
  { id: 'pdf', label: 'PDF', note: '어디서나 같은 모양으로 볼 수 있어요.' },
  { id: 'image', label: '모양 그대로 PowerPoint', note: '화면과 같은 모양이지만 글씨를 하나씩 고칠 수 없어요.' },
];
const anchorOf = (event: MouseEvent, alignRight = false): MenuAnchor => { const rect = event.currentTarget.getBoundingClientRect(); return { x: alignRight ? rect.right : rect.left, y: rect.bottom + 6, alignRight }; };

type Props = {
  title: string; onTitle: (value: string) => void; onTitleCommit: () => void; saveState: string; canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
  onOpenFile: () => void; onSaveFile: () => void; onSave: () => void; saveDisabled: boolean; readOnly?: boolean; onHome: () => void; onNew: () => void; exporting: boolean; exportProgress: ExportProgress | null; exportNote: string; onOpenDownload: () => void; onExport: (kind: string) => void; onCancelExport: () => void; onPresent: () => void;
  // 애니메이션 편집기: 발표 단추의 이름(재생)과 형식 목록 맨 위에 더하는 형식(영상). 주지 않으면 슬라이드 동작이다.
  presentLabel?: string; extraFormats?: { id: string; label: string; note: string }[];
};

export function TopBar(props: Props) {
  const [fileMenu, setFileMenu] = useState<MenuAnchor | null>(null);
  const [shareMenu, setShareMenu] = useState<MenuAnchor | null>(null);
  const [download, setDownload] = useState<MenuAnchor | null>(null);
  const formats = [...(props.extraFormats ?? []), ...FORMATS];
  const [format, setFormat] = useState<string>(formats[0].id);
  const presentLabel = props.presentLabel ?? '발표';

  return <header className="topbar">
    <button className="on-gradient icon-only" aria-label="작품 목록" title="작품 목록" onClick={props.onHome}><Icon name="back" /></button>
    <button className="on-gradient" onClick={event => setFileMenu(anchorOf(event))}><Icon name="file" size={18} />파일<Icon name="chevron" size={14} /></button>
    <button className="on-gradient icon-only" aria-label="되돌리기" title="되돌리기 (Ctrl+Z)" disabled={!props.canUndo} onClick={props.onUndo}><Icon name="undo" /></button>
    <button className="on-gradient icon-only" aria-label="다시 하기" title="다시 하기 (Ctrl+Shift+Z)" disabled={!props.canRedo} onClick={props.onRedo}><Icon name="redo" /></button>
    <input className="title" aria-label="작품 이름" readOnly={props.readOnly} value={props.title} onChange={event => props.onTitle(event.target.value)} onBlur={props.onTitleCommit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
    <span className={props.saveState === '저장 실패' ? 'save-state failed' : 'save-state'} data-testid="save-state">{props.saveState}</span>
    <span className="spacer" />
    <button className="on-gradient" disabled={props.exporting} title={props.exporting ? `파일을 다 만든 뒤에 ${presentLabel}할 수 있어요` : presentLabel} onClick={props.onPresent}><Icon name="play" size={16} />{presentLabel}</button>
    <button className="share" onClick={event => setShareMenu(anchorOf(event, true))}><Icon name="share" size={18} />공유</button>

    {fileMenu && <Menu anchor={fileMenu} label="파일 메뉴" onClose={() => setFileMenu(null)} items={[
      { label: '새 작품', onSelect: props.onNew },
      { label: '원본 열기', onSelect: props.onOpenFile },
      { label: '원본 저장', onSelect: props.onSaveFile },
      { label: '이 컴퓨터에 저장', disabled: props.saveDisabled, onSelect: props.onSave },
    ]} />}
    {shareMenu && <Menu anchor={shareMenu} label="공유 메뉴" onClose={() => setShareMenu(null)} items={[{ label: '다운로드', onSelect: () => { props.onOpenDownload(); setDownload(shareMenu); } }]} />}
    {download && <Popover anchor={download} label="내려받기" onClose={() => setDownload(null)}>
      <div className="download-panel">
        <h2>내려받기</h2>
        {formats.map(item => <label key={item.id} className={format === item.id ? 'format selected' : 'format'}>
          <input type="radio" name="format" disabled={props.exporting} checked={format === item.id} onChange={() => setFormat(item.id)} />
          <span><strong>{item.label}</strong><small>{item.note}</small></span>
        </label>)}
        {props.exporting && props.exportProgress && <div className="export-progress">
          <progress aria-label="파일 만드는 중" value={props.exportProgress.done} max={props.exportProgress.total} />
          <span>{props.exportProgress.done < props.exportProgress.total ? `${props.exportProgress.done} / ${props.exportProgress.total}장` : '마무리하고 있어요…'}</span>
        </div>}
        {!props.exporting && props.exportNote && <p className="export-note" data-testid="export-note">{props.exportNote}</p>}
        {props.exporting
          ? <button className="primary" onClick={props.onCancelExport}>취소</button>
          : <button className="primary" onClick={() => props.onExport(format)}>내려받기</button>}
      </div>
    </Popover>}
  </header>;
}
