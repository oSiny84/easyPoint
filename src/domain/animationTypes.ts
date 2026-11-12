// 애니메이션 작품의 저장 형태. docs/animation-contracts.md §2가 기준이다.
// 슬라이드 Project의 필드를 모두 같은 형태로 갖는다. 그래서 renderSlide·exportPdf·SlideList·Editor에 그대로 넘길 수 있다.
import type { Project, ProjectContent } from './types';

export type AnimationFps = 2 | 4 | 6 | 8 | 12;
export type FrameHold = 2 | 4;
export type MusicVolume = 0.5 | 1;
// 길게 보이는 장. 키는 장 id다. 1배인 장은 넣지 않는다.
export type Holds = Readonly<Record<string, FrameHold>>;
export type AnimationSettings = { fps: AnimationFps; musicId: string | null; musicVolume: MusicVolume; holds: Holds };

// 되돌리기가 복원하는 내용. revision·updatedAt은 내용과 분리한다.
export type AnimationContent = ProjectContent & AnimationSettings;
export type AnimationProject = Project & AnimationSettings & { kind: 'animation' };

// 작품 목록이 읽는 요약. 미리보기는 삭제·재생성 가능한 파생 저장물이다.
export type AnimationSummary = {
  projectId: string; kind: 'animation'; title: string; updatedAt: string; revision: number; frameCount: number; durationMs: number;
  thumbnailRevision: number | null; thumbnail: Blob | null;
};
