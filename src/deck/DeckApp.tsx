// 장 묶음 문서(애니메이션·만화) 편집기의 공통 진입 화면: 작품 목록 ↔ 편집기. 새로고침하면 기억한 작품으로 돌아온다.
// 편집기마다 문서 종류·저장소·잠금 이름이 다르므로 config로 넘기고, 목록과 편집 화면은 그리는 함수로 받는다.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { remember, type Remembered } from '../app/currentProject';
import { newId, now } from '../app/Editor';
import { createAssetStore, type AssetStore } from '../assets/assetStore';
import type { Failure, Project } from '../domain/types';
import type { StoreOptions } from '../state/store';
import { acquireSession, type LockNames, type SessionLock } from '../storage/locks';
import type { DeckOpenResult } from './deckDatabase';
import type { DeckCandidate } from './deckFile';

export type DeckSession<Store> = { store: Store; assets: AssetStore; lock: SessionLock };
// 값이 바뀌지 않는 설정이어야 한다(모듈 상수로 둔다).
export type DeckAppConfig<P extends Project, Store> = {
  kind: Remembered['kind']; locks: LockNames;
  createProject: (newId: () => string, now: () => string) => P;
  createStore: (project: P, options: StoreOptions) => Store;
  list: () => Promise<{ projectId: string }[]>; open: (projectId: string) => Promise<DeckOpenResult<P>>;
  deserialize: (file: Blob, newId: () => string) => Promise<DeckCandidate<P> | Failure>;
};
export type DeckHomeProps = { note?: string; onStart: () => void; onNew: () => void; onOpen: (projectId: string) => void; onFile: (file: File) => void };
export type DeckEditorProps<P extends Project, Store> = { value: DeckSession<Store>; initialNote?: string; initiallySaved?: boolean; onOpen: (project: P, assets: Map<string, Blob>, note: string) => void; onHome: () => void; onNew: () => void };

type Screen<Store> = { kind: 'loading' } | { kind: 'home'; note?: string; key: number } | { kind: 'editor'; session: DeckSession<Store>; note?: string; saved: boolean; key: number };
type Props<P extends Project, Store> = {
  config: DeckAppConfig<P, Store>; resumeId: string | null; onStart: () => void;
  renderHome: (props: DeckHomeProps, key: number) => ReactNode; renderEditor: (props: DeckEditorProps<P, Store>, key: number) => ReactNode;
};

export function DeckApp<P extends Project, Store>({ config, resumeId, onStart, renderHome, renderEditor }: Props<P, Store>) {
  const [screen, setScreen] = useState<Screen<Store>>({ kind: 'loading' });
  const key = useRef(0);
  const current = useRef<DeckSession<Store> | null>(null);
  const closeCurrent = useCallback(() => { current.current?.lock.release(); current.current?.assets.dispose(); current.current = null; }, []);
  useEffect(() => closeCurrent, [closeCurrent]);

  const show = useCallback(async (project: P, assets: Map<string, Blob> | undefined, note: string | undefined, saved: boolean) => {
    closeCurrent();
    const lock = await acquireSession(project.id, config.locks);
    const session: DeckSession<Store> = { store: config.createStore(project, { newId, now, readOnly: lock.readOnly }), assets: createAssetStore(assets), lock };
    current.current = session;
    remember({ kind: config.kind, id: project.id });
    setScreen({ kind: 'editor', session, note, saved, key: ++key.current });
  }, [closeCurrent, config]);
  const showHome = useCallback((note?: string) => { closeCurrent(); remember(null); setScreen({ kind: 'home', note, key: ++key.current }); }, [closeCurrent]);
  const showNew = useCallback(() => { void show(config.createProject(newId, now), undefined, undefined, true); }, [show, config]);
  const openSaved = useCallback(async (projectId: string, note: string) => {
    const opened = await config.open(projectId);
    if (opened.ok) await show(opened.project, opened.assets, note, true);
    else showHome(opened.message);
  }, [show, showHome, config]);
  // 원본 파일: 검사를 모두 통과한 뒤에만 새 작품으로 연다. 실패하면 작품 목록에서 까닭을 알린다.
  const openFile = useCallback(async (file: File) => {
    const result = await config.deserialize(file, newId);
    if (!result.ok) { showHome(result.message); return; }
    await show(result.project, result.assets, '작품 파일을 새 작품으로 열었어요.', false);
  }, [show, showHome, config]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      // 새로고침은 쓰던 작품으로 돌아온다. 저장한 적 없는 새 작품이면 작품 목록으로 간다.
      if (resumeId) {
        try {
          if ((await config.list()).some(row => row.projectId === resumeId)) { await openSaved(resumeId, '저장된 작품을 열었어요.'); return; }
        } catch { /* 저장소를 쓸 수 없으면 작품 목록에서 안내한다. */ }
      }
      showHome();
    })();
  }, [resumeId, openSaved, showHome, config]);

  if (screen.kind === 'loading') return <p className="status" role="status">작품을 준비하고 있어요…</p>;
  if (screen.kind === 'home') return renderHome({ note: screen.note, onStart: () => { closeCurrent(); remember(null); onStart(); }, onNew: showNew,
    onOpen: id => void openSaved(id, '저장된 작품을 열었어요.'), onFile: file => void openFile(file) }, screen.key);
  return renderEditor({ value: screen.session, initialNote: screen.note, initiallySaved: screen.saved,
    onOpen: (project, assets, note) => void show(project, assets, note, false), onHome: () => showHome(), onNew: showNew }, screen.key);
}
