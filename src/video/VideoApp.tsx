// 영상 편집기 진입점(영상 기획안 §2). 시작 화면에서 처음 들어올 때 불러온다(지연 로딩).
// 화면: 영상 작품 목록 ↔ 영상 편집기. 새로고침하면 기억한 작품으로 돌아온다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { remember } from '../app/currentProject';
import { createVideoProject, EMPTY_CATALOG } from '../domain/videoProject';
import type { VideoProject } from '../domain/videoTypes';
import { createVideoStore } from '../state/videoStore';
import { acquireSession, VIDEO_LOCKS } from '../storage/locks';
import { storeVerifiedMedia } from './mediaStore';
import { openVideoProject } from './videoDatabase';
import { downloadOriginal, VideoEditor, type VideoSession } from './VideoEditor';
import { deserializeVideoProject } from './videoFile';
import { VideoHome } from './VideoHome';

const newId = () => crypto.randomUUID();
const now = () => new Date().toISOString();
// 내장 밈·음악 목록은 V6에서 채운다(domain/videoProject.ts).
const catalog = EMPTY_CATALOG;

type Screen = { kind: 'loading' } | { kind: 'home'; note?: string; key: number } | { kind: 'editor'; session: VideoSession; note?: string; saved: boolean; key: number };

async function openSession(project: VideoProject): Promise<VideoSession> {
  const lock = await acquireSession(project.id, VIDEO_LOCKS);
  return { store: createVideoStore(project, { newId, now, readOnly: lock.readOnly, catalog }), lock };
}

export function VideoApp({ resumeId, onStart }: { resumeId: string | null; onStart: () => void }) {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const key = useRef(0);
  const current = useRef<VideoSession | null>(null);
  const closeCurrent = useCallback(() => { current.current?.lock.release(); current.current = null; }, []);
  useEffect(() => closeCurrent, [closeCurrent]);

  const show = useCallback(async (project: VideoProject, note: string | undefined, saved: boolean) => {
    closeCurrent();
    const session = await openSession(project);
    current.current = session;
    remember({ kind: 'video', id: project.id });
    setScreen({ kind: 'editor', session, note, saved, key: ++key.current });
  }, [closeCurrent]);
  const showHome = useCallback((note?: string) => { closeCurrent(); remember(null); setScreen({ kind: 'home', note, key: ++key.current }); }, [closeCurrent]);
  const showNew = useCallback(() => { void show(createVideoProject(newId, now), undefined, true); }, [show]);
  const openSaved = useCallback(async (projectId: string, note: string) => {
    const opened = await openVideoProject(projectId, catalog);
    if (opened.ok) await show(opened.project, note, true);
    else showHome(opened.message);
  }, [show, showHome]);
  // 원본 파일: 검사를 모두 통과한 뒤 영상 바이트를 저장소에 넣고 새 작품으로 연다. 실패하면 지금 화면은 그대로다.
  const openFile = useCallback(async (file: File): Promise<string | null> => {
    const result = await deserializeVideoProject(file, newId, catalog);
    if (!result.ok) return result.message;
    for (const [id, blob] of result.media) {
      const stored = await storeVerifiedMedia(id, blob);
      if (!stored.ok) return stored.message;
    }
    await show(result.project, '작품 파일을 새 작품으로 열었어요.', false);
    return null;
  }, [show]);
  const downloadSaved = useCallback(async (projectId: string) => {
    const opened = await openVideoProject(projectId, catalog);
    return opened.ok ? downloadOriginal(opened.project) : opened.message;
  }, []);

  useEffect(() => {
    if (resumeId) void openSaved(resumeId, '저장된 작품을 열었어요.');
    else showHome();
  }, [resumeId, openSaved, showHome]);

  if (screen.kind === 'loading') return <p className="status" role="status">작품을 준비하고 있어요…</p>;
  if (screen.kind === 'home') return <VideoHome key={screen.key} note={screen.note} onStart={() => { closeCurrent(); remember(null); onStart(); }} onNew={showNew}
    onOpen={id => void openSaved(id, '저장된 작품을 열었어요.')} onFile={file => void openFile(file).then(problem => { if (problem) showHome(problem); })} onDownload={downloadSaved} />;
  return <VideoEditor key={screen.key} value={screen.session} initialNote={screen.note} initiallySaved={screen.saved}
    onHome={() => showHome()} onNew={showNew} onOpenFile={openFile} />;
}
