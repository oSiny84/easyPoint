import type { AnimationProject } from '../../src/domain/animationTypes';
import { ids, loadSample } from './helpers';

// 공통 애니메이션 샘플: 슬라이드 공통 샘플 문서(tests/fixtures/sample)에 애니메이션 필드를 더한 것이다.
// 장·요소·사진이 슬라이드 샘플과 같아 두 편집기의 결과를 그대로 견줄 수 있다. 둘째 장은 길게(2배)다.
export const loadAnimationSample = (): AnimationProject => ({ ...loadSample(), kind: 'animation', fps: 6, musicId: null, musicVolume: 0.5, holds: { [ids.slide2]: 2 } });

export const animationContent = (project: AnimationProject) => JSON.parse(JSON.stringify({
  title: project.title, slides: project.slides, assetManifest: project.assetManifest, fps: project.fps, musicId: project.musicId, musicVolume: project.musicVolume, holds: project.holds,
}));

// 시험마다 같은 순서의 새 ID를 만든다. 슬라이드 저장소와 애니메이션 저장소가 같은 ID를 받아 결과를 비교할 수 있다.
export const idSequence = (start = 5000) => { let counter = start; return () => `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`; };
