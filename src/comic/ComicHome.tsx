// 만화 작품 목록(만화 계약 §6). 화면은 애니메이션과 함께 쓰는 공통 틀(deck/DeckHome.tsx)이고, 여기서는 글귀와 저장소 함수만 정한다.
import { DeckHome, type DeckHomeConfig } from '../deck/DeckHome';
import type { DeckHomeProps } from '../deck/DeckApp';
import type { ComicProject, ComicSummary } from '../domain/comicTypes';
import { COMIC_LOCKS } from '../storage/locks';
import { deleteComicProject, listComicSummaries, openComicProject, removeOrphanComicAssets } from './comicDatabase';
import { COMIC_EXTENSION, serializeComic } from './comicFile';

const CONFIG: DeckHomeConfig<ComicProject, ComicSummary> = {
  className: 'comic-home', brand: '만화', heading: '내 만화',
  emptyNote: '아직 만든 만화가 없어요. 새 작품을 만들어 보세요.',
  busyNote: '다른 탭에서 만화 작품을 열고 있어요. 그 탭을 닫은 뒤 다시 지워 주세요.',
  fileTestId: 'open-comic-file', extension: COMIC_EXTENSION, locks: COMIC_LOCKS,
  list: listComicSummaries, open: openComicProject, remove: deleteComicProject, removeOrphans: removeOrphanComicAssets,
  serialize: serializeComic,
  describe: summary => `${summary.panelCount}칸 · ${summary.pageCount}쪽`,
  guide: [
    { icon: 'draw', title: '1. 첫 칸 그리기', text: '배경을 고르고 요소·그리기·사진으로 장면을 만들어요.' },
    { icon: 'comic', title: '2. 말풍선 넣기', text: '만화 도구에서 말풍선을 누르고 말을 써요. 말풍선을 옮기면 글씨도 따라와요.' },
    { icon: 'plus', title: '3. 다음 칸 만들기', text: '아래 +를 누르면 새 칸이 생겨요. 이야기를 이어서 그려요.' },
    { icon: 'download', title: '4. 만화 보기와 내려받기', text: '만화 보기로 종이에 모인 모습을 보고, 만화책(PDF)으로 내려받아 인쇄해요.' },
  ],
};

export function ComicHome(props: DeckHomeProps) {
  return <DeckHome config={CONFIG} {...props} />;
}
