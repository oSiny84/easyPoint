// 만화 편집기 진입점(만화 계약 §6). 시작 화면에서 처음 들어올 때 불러온다(지연 로딩).
// 화면 이동(작품 목록 ↔ 편집기, 새로고침 복원)은 애니메이션과 함께 쓰는 공통 틀(deck/DeckApp.tsx)이 맡는다. 편집 화면은 슬라이드의 Editor를 그대로 쓴다.
import { DeckApp, type DeckAppConfig } from '../deck/DeckApp';
import { createComicProject } from '../domain/comicProject';
import type { ComicProject } from '../domain/comicTypes';
import { createComicStore, type ComicStore } from '../state/comicStore';
import { COMIC_LOCKS } from '../storage/locks';
import { listComicSummaries, openComicProject } from './comicDatabase';
import { ComicEditor } from './ComicEditor';
import { deserializeComic } from './comicFile';
import { ComicHome } from './ComicHome';

const CONFIG: DeckAppConfig<ComicProject, ComicStore> = {
  kind: 'comic', locks: COMIC_LOCKS,
  createProject: (newId, now) => createComicProject(newId, now),
  createStore: createComicStore,
  list: listComicSummaries, open: openComicProject, deserialize: deserializeComic,
};

export function ComicApp({ resumeId, onStart }: { resumeId: string | null; onStart: () => void }) {
  return <DeckApp config={CONFIG} resumeId={resumeId} onStart={onStart}
    renderHome={(props, key) => <ComicHome key={key} {...props} />}
    renderEditor={(props, key) => <ComicEditor key={key} {...props} />} />;
}
