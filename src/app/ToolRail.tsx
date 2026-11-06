// 왼쪽 도구 모음과 세부 패널 틀(UI_REFERENCE §1·§2). 패널 내용은 panels.tsx에 있다.
import type { ReactNode } from 'react';
import { Icon } from '../components/Icon';

export const TOOLS = [
  { id: 'design', label: '디자인', icon: 'design' },
  { id: 'elements', label: '요소', icon: 'elements' },
  { id: 'text', label: '텍스트', icon: 'text' },
  { id: 'upload', label: '업로드', icon: 'upload' },
  { id: 'draw', label: '그리기', icon: 'draw' },
  { id: 'background', label: '배경', icon: 'background' },
] as const;
export type ToolId = typeof TOOLS[number]['id'];

export function ToolRail({ active, onChange, panel, disabled }: { active: ToolId | null; onChange: (tool: ToolId | null) => void; panel: ReactNode; disabled?: boolean }) {
  const tool = TOOLS.find(item => item.id === active);
  return <>
    <nav className="tool-rail" aria-label="도구">
      {TOOLS.map(item => <button key={item.id} disabled={disabled} aria-pressed={item.id === active} onClick={() => onChange(item.id === active ? null : item.id)}>
        <Icon name={item.icon} size={22} /><span>{item.label}</span>
      </button>)}
    </nav>
    {tool && <section className="tool-panel" aria-label={`${tool.label} 패널`}>
      <header><h2>{tool.label}</h2><button aria-label="패널 닫기" onClick={() => onChange(null)}><Icon name="close" size={18} /></button></header>
      {panel}
    </section>}
  </>;
}
