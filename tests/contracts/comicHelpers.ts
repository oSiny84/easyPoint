import type { ComicProject } from '../../src/domain/comicTypes';
import { ids, loadSample } from './helpers';

// 공통 만화 샘플: 슬라이드 공통 샘플 문서(tests/fixtures/sample)에 만화 필드를 더한 것이다.
// 칸·요소·사진이 슬라이드 샘플과 같아 두 편집기의 결과를 그대로 견줄 수 있다.
// paired가 참이면 첫 칸의 사진(photo1)과 본문 글씨(body)를 말풍선 짝으로 적는다. 첫 칸의 요소 순서는 사진·선·제목·본문·선·선이다.
export const loadComicSample = (paired = true): ComicProject => ({ ...loadSample(), kind: 'comic', layout: 'grid4', bubbles: paired ? { [ids.photo1]: ids.body } : {} });

export const comicContent = (project: ComicProject) => JSON.parse(JSON.stringify({
  title: project.title, slides: project.slides, assetManifest: project.assetManifest, layout: project.layout, bubbles: project.bubbles,
}));

// 시험마다 같은 순서의 새 ID를 만든다. 슬라이드 저장소와 만화 저장소가 같은 ID를 받아 결과를 비교할 수 있다.
export const idSequence = (start = 5000) => { let counter = start; return () => `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`; };
