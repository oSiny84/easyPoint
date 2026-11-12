// 만화 작품의 저장 형태. docs/comic-contracts.md §2가 기준이다.
// 슬라이드 Project의 필드를 모두 같은 형태로 갖는다. 그래서 renderSlide·SlideList·Editor에 그대로 넘길 수 있다. 칸 하나가 장 하나다.
import type { Project, ProjectContent } from './types';

// 한 쪽의 칸 배치: 세로 A4에 3칸, 가로 A4에 2×2, 세로 A4에 2×4.
export type ComicLayout = 'rows3' | 'grid4' | 'grid8';
// 말풍선 짝. 키는 말풍선 그림(사진 요소) id, 값은 그 안의 글씨 요소 id다. 둘은 같은 칸에 있다.
export type Bubbles = Readonly<Record<string, string>>;
export type ComicSettings = { layout: ComicLayout; bubbles: Bubbles };

// 되돌리기가 복원하는 내용. revision·updatedAt은 내용과 분리한다.
export type ComicContent = ProjectContent & ComicSettings;
export type ComicProject = Project & ComicSettings & { kind: 'comic' };

// 작품 목록이 읽는 요약. 미리보기는 삭제·재생성 가능한 파생 저장물이다.
export type ComicSummary = {
  projectId: string; kind: 'comic'; title: string; updatedAt: string; revision: number; panelCount: number; pageCount: number;
  thumbnailRevision: number | null; thumbnail: Blob | null;
};
