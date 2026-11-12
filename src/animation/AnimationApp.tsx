// 애니메이션 편집기 진입점(애니메이션 계약 §6). 시작 화면에서 처음 들어올 때 불러온다(지연 로딩).
// 화면: 애니메이션 작품 목록 ↔ 편집기. 새로고침하면 기억한 작품으로 돌아온다. 편집 화면은 슬라이드의 Editor를 그대로 쓴다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { remember } from '../app/currentProject';
import { newId, now } from '../app/Editor';
import { createAssetStore, type AssetStore } from '../assets/assetStore';
import { createAnimationProject } from '../domain/animationProject';
import type { AnimationProject } from '../domain/animationTypes';
import { createAnimationStore, type AnimationStore } from '../state/animationStore';
import { acquireSession, ANIMATION_LOCKS, type SessionLock } from '../storage/locks';
import { loadBuiltins, type SoundItem } from '../video/builtins';
import { listAnimationSummaries, openAnimationProject } from './animationDatabase';
import { AnimationEditor } from './AnimationEditor';
import { deserializeAnimation } from './animationFile';
import { AnimationHome } from './AnimationHome';

export type AnimationSession = { store: AnimationStore; assets: AssetStore; lock: SessionLock };
type Screen = { kind: 'loading' } | { kind: 'home'; note?: string; key: number } | { kind: 'editor'; session: AnimationSession; note?: string; saved: boolean; key: number };

export function AnimationApp({ resumeId, onStart }: { resumeId: string | null; onStart: () => void }) {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  // 배경음악 목록(영상 편집기의 내장 음악). undefined: 읽는 중, null: 읽지 못함(그림은 그대로 만들 수 있다).
  const [music, setMusic] = useState<SoundItem[] | null | undefined>(undefined);
  const key = useRef(0);
  const current = useRef<AnimationSession | null>(null);
  const closeCurrent = useCallback(() => { current.current?.lock.release(); current.current?.assets.dispose(); current.current = null; }, []);
  useEffect(() => closeCurrent, [closeCurrent]);
  useEffect(() => { void loadBuiltins().then(builtins => setMusic(builtins.music), () => setMusic(null)); }, []);

  const show = useCallback(async (project: AnimationProject, assets: Map<string, Blob> | undefined, note: string | undefined, saved: boolean) => {
    closeCurrent();
    const lock = await acquireSession(project.id, ANIMATION_LOCKS);
    const session: AnimationSession = { store: createAnimationStore(project, { newId, now, readOnly: lock.readOnly }), assets: createAssetStore(assets), lock };
    current.current = session;
    remember({ kind: 'animation', id: project.id });
    setScreen({ kind: 'editor', session, note, saved, key: ++key.current });
  }, [closeCurrent]);
  const showHome = useCallback((note?: string) => { closeCurrent(); remember(null); setScreen({ kind: 'home', note, key: ++key.current }); }, [closeCurrent]);
  const showNew = useCallback(() => { void show(createAnimationProject(newId, now), undefined, undefined, true); }, [show]);
  const openSaved = useCallback(async (projectId: string, note: string) => {
    const opened = await openAnimationProject(projectId);
    if (opened.ok) await show(opened.project, opened.assets, note, true);
    else showHome(opened.message);
  }, [show, showHome]);
  // 원본 파일: 검사를 모두 통과한 뒤에만 새 작품으로 연다. 실패하면 작품 목록에서 까닭을 알린다.
  const openFile = useCallback(async (file: File) => {
    const result = await deserializeAnimation(file, newId);
    if (!result.ok) { showHome(result.message); return; }
    await show(result.project, result.assets, '작품 파일을 새 작품으로 열었어요.', false);
  }, [show, showHome]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      // 새로고침은 쓰던 작품으로 돌아온다. 저장한 적 없는 새 작품이면 작품 목록으로 간다.
      if (resumeId) {
        try {
          if ((await listAnimationSummaries()).some(row => row.projectId === resumeId)) { await openSaved(resumeId, '저장된 작품을 열었어요.'); return; }
        } catch { /* 저장소를 쓸 수 없으면 작품 목록에서 안내한다. */ }
      }
      showHome();
    })();
  }, [resumeId, openSaved, showHome]);

  if (screen.kind === 'loading') return <p className="status" role="status">작품을 준비하고 있어요…</p>;
  if (screen.kind === 'home') return <AnimationHome key={screen.key} note={screen.note} onStart={() => { closeCurrent(); remember(null); onStart(); }} onNew={showNew}
    onOpen={id => void openSaved(id, '저장된 작품을 열었어요.')} onFile={file => void openFile(file)} />;
  return <AnimationEditor key={screen.key} value={screen.session} music={music} initialNote={screen.note} initiallySaved={screen.saved}
    onOpen={(project, assets, note) => void show(project, assets, note, false)} onHome={() => showHome()} onNew={showNew} />;
}
