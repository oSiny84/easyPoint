// 화면 이동: 시작 화면, 슬라이드 작품 목록·편집기, 영상 편집기, 애니메이션 편집기, 만화 편집기. 슬라이드 편집 화면 자체는 Editor.tsx에 있다.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { loadTemplateFile, type TemplateItem } from '../assets/library';
import { createProject } from '../domain/project';
import type { Project } from '../domain/types';
import { listSummaries, openProject } from '../storage/database';
import { deserializeProject } from '../storage/projectFile';
import { remember, remembered } from './currentProject';
import { Editor, newId, now, openSession, type Session } from './Editor';
import { Home } from './Home';
import { StartScreen, type EditorKind, type RecentWork } from './StartScreen';

type Screen = { kind: 'loading' } | { kind: 'start'; note?: string; key: number } | { kind: 'home'; note?: string; key: number }
  | { kind: 'editor'; session: Session; note?: string; saved?: boolean; key: number } | { kind: 'video'; resumeId: string | null; key: number }
  | { kind: 'animation'; resumeId: string | null; key: number } | { kind: 'comic'; resumeId: string | null; key: number };

// 영상 편집기는 처음 들어갈 때 불러온다. 슬라이드만 쓰는 첫 화면의 크기를 늘리지 않는다.
const VideoApp = lazy(() => import('../video/VideoApp').then(module => ({ default: module.VideoApp })));
// 애니메이션 편집기도 처음 들어갈 때 불러온다. 편집 화면(Editor)은 슬라이드와 함께 쓰므로 이미 받은 코드다.
const AnimationApp = lazy(() => import('../animation/AnimationApp').then(module => ({ default: module.AnimationApp })));
// 만화 편집기도 처음 들어갈 때 불러온다.
const ComicApp = lazy(() => import('../comic/ComicApp').then(module => ({ default: module.ComicApp })));

// 시작 화면의 최근 작품: 슬라이드·영상·애니메이션·만화 저장소의 요약을 각각 읽어 최근순으로 섞는다. 한 곳을 읽지 못해도 나머지는 보여 준다.
async function loadRecentWorks(): Promise<RecentWork[]> {
  const [slides, videos, animations, comics] = await Promise.allSettled([
    listSummaries(),
    import('../video/videoDatabase').then(module => module.listVideoSummaries()),
    import('../animation/animationDatabase').then(module => module.listAnimationSummaries()),
    import('../comic/comicDatabase').then(module => module.listComicSummaries()),
  ]);
  if (slides.status === 'rejected' && videos.status === 'rejected' && animations.status === 'rejected' && comics.status === 'rejected') throw slides.reason;
  const rows: RecentWork[] = [];
  if (slides.status === 'fulfilled') rows.push(...slides.value.map(row => ({ kind: 'slide' as const, projectId: row.projectId, title: row.title, updatedAt: row.updatedAt, thumbnail: row.thumbnail })));
  if (videos.status === 'fulfilled') rows.push(...videos.value.map(row => ({ kind: 'video' as const, projectId: row.projectId, title: row.title, updatedAt: row.updatedAt, thumbnail: row.thumbnail })));
  if (animations.status === 'fulfilled') rows.push(...animations.value.map(row => ({ kind: 'animation' as const, projectId: row.projectId, title: row.title, updatedAt: row.updatedAt, thumbnail: row.thumbnail })));
  if (comics.status === 'fulfilled') rows.push(...comics.value.map(row => ({ kind: 'comic' as const, projectId: row.projectId, title: row.title, updatedAt: row.updatedAt, thumbnail: row.thumbnail })));
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const editorKey = useRef(0);
  const current = useRef<Session | null>(null);

  const closeCurrent = useCallback(() => { current.current?.lock.release(); current.current?.assets.dispose(); current.current = null; }, []);
  const show = useCallback(async (project: Project, assets: Map<string, Blob> | undefined, note: string | undefined, saved: boolean) => {
    closeCurrent();
    const session = await openSession(project, assets);
    current.current = session;
    remember({ kind: 'slide', id: project.id });
    setScreen({ kind: 'editor', session, note, saved, key: ++editorKey.current });
  }, [closeCurrent]);
  const showHome = useCallback((note?: string) => { closeCurrent(); remember(null); setScreen({ kind: 'home', note, key: ++editorKey.current }); }, [closeCurrent]);
  const showStart = useCallback((note?: string) => { closeCurrent(); remember(null); setScreen({ kind: 'start', note, key: ++editorKey.current }); }, [closeCurrent]);
  const showVideo = useCallback((resumeId: string | null) => { closeCurrent(); setScreen({ kind: 'video', resumeId, key: ++editorKey.current }); }, [closeCurrent]);
  const showAnimation = useCallback((resumeId: string | null) => { closeCurrent(); setScreen({ kind: 'animation', resumeId, key: ++editorKey.current }); }, [closeCurrent]);
  const showComic = useCallback((resumeId: string | null) => { closeCurrent(); setScreen({ kind: 'comic', resumeId, key: ++editorKey.current }); }, [closeCurrent]);
  const showNew = useCallback(() => { void show(createProject(newId, now), undefined, undefined, true); }, [show]);
  const openSaved = useCallback(async (projectId: string, note: string) => {
    const opened = await openProject(projectId);
    if (opened.ok) await show(opened.project, opened.assets, note, true);
    else showHome(opened.message);
  }, [show, showHome]);

  useEffect(() => {
    void (async () => {
      // 새로고침은 쓰던 작품의 편집기로 돌아온다. 기억한 작품이 없으면 항상 시작 화면이다(영상 기획안 §2).
      const resume = remembered();
      if (resume?.kind === 'video') { showVideo(resume.id); return; }
      if (resume?.kind === 'animation') { showAnimation(resume.id); return; }
      if (resume?.kind === 'comic') { showComic(resume.id); return; }
      if (resume) {
        try {
          const summaries = await listSummaries();
          if (summaries.some(row => row.projectId === resume.id)) { await openSaved(resume.id, '저장된 작품을 열었어요.'); return; }
        } catch { /* 저장소를 쓸 수 없으면 시작 화면에서 안내한다. */ }
      }
      showStart();
    })();
  }, [openSaved, showStart, showVideo, showAnimation, showComic]);

  const choose = useCallback((kind: EditorKind) => { if (kind === 'slide') showHome(); else if (kind === 'video') showVideo(null); else if (kind === 'animation') showAnimation(null); else showComic(null); }, [showHome, showVideo, showAnimation, showComic]);
  const openRecent = useCallback((work: RecentWork) => {
    if (work.kind === 'slide') void openSaved(work.projectId, '저장된 작품을 열었어요.');
    else if (work.kind === 'video') showVideo(work.projectId);
    else if (work.kind === 'animation') showAnimation(work.projectId);
    else showComic(work.projectId);
  }, [openSaved, showVideo, showAnimation, showComic]);

  const openFile = useCallback(async (file: File) => {
    const result = await deserializeProject(file, newId);
    if (!result.ok) { showHome(result.message); return; }
    await show(result.project, result.assets, '작품 파일을 새 작품으로 열었어요.', false);
  }, [show, showHome]);
  const openTemplate = useCallback(async (template: TemplateItem) => {
    try {
      const result = await deserializeProject(await loadTemplateFile(template), newId);
      if (!result.ok) { showHome(result.message); return; }
      await show(result.project, result.assets, `${template.label} 템플릿을 새 작품으로 열었어요.`, false);
    } catch { showHome('템플릿을 불러오지 못했어요. 다시 시도해 주세요.'); }
  }, [show, showHome]);

  if (screen.kind === 'loading') return <p className="status" role="status">작품을 준비하고 있어요…</p>;
  if (screen.kind === 'start') return <StartScreen key={screen.key} note={screen.note} loadRecent={loadRecentWorks} onChoose={choose} onOpen={openRecent} />;
  if (screen.kind === 'video') return <Suspense fallback={<p className="status" role="status">영상 편집기를 준비하고 있어요…</p>}>
    <VideoApp key={screen.key} resumeId={screen.resumeId} onStart={showStart} />
  </Suspense>;
  if (screen.kind === 'animation') return <Suspense fallback={<p className="status" role="status">애니메이션 편집기를 준비하고 있어요…</p>}>
    <AnimationApp key={screen.key} resumeId={screen.resumeId} onStart={showStart} />
  </Suspense>;
  if (screen.kind === 'comic') return <Suspense fallback={<p className="status" role="status">만화 편집기를 준비하고 있어요…</p>}>
    <ComicApp key={screen.key} resumeId={screen.resumeId} onStart={showStart} />
  </Suspense>;
  if (screen.kind === 'home') return <Home key={screen.key} note={screen.note} onOpen={id => void openSaved(id, '저장된 작품을 열었어요.')} onNew={showNew} onFile={file => void openFile(file)} onTemplate={template => void openTemplate(template)} onStart={() => showStart()} />;
  return <Editor key={screen.key} value={screen.session} initialNote={screen.note} initiallySaved={screen.saved}
    onOpen={(project, assets, note) => void show(project, assets, note, false)} onHome={() => showHome()} onNew={showNew} />;
}
