// 애니메이션 작품 목록(애니메이션 계약 §6). 화면은 만화와 함께 쓰는 공통 틀(deck/DeckHome.tsx)이고, 여기서는 글귀와 저장소 함수만 정한다.
import { DeckHome, type DeckHomeConfig } from '../deck/DeckHome';
import type { DeckHomeProps } from '../deck/DeckApp';
import type { AnimationProject, AnimationSummary } from '../domain/animationTypes';
import { ANIMATION_LOCKS } from '../storage/locks';
import { deleteAnimationProject, listAnimationSummaries, openAnimationProject, removeOrphanAnimationAssets } from './animationDatabase';
import { ANIMATION_EXTENSION, serializeAnimation } from './animationFile';
import { clearExportFiles } from './exportFiles';
import { formatLength } from './frameTimes';

const CONFIG: DeckHomeConfig<AnimationProject, AnimationSummary> = {
  className: 'animation-home', brand: '애니메이션', heading: '내 애니메이션',
  emptyNote: '아직 만든 애니메이션이 없어요. 새 작품을 만들어 보세요.',
  busyNote: '다른 탭에서 애니메이션 작품을 열고 있어요. 그 탭을 닫은 뒤 다시 지워 주세요.',
  fileTestId: 'open-animation-file', extension: ANIMATION_EXTENSION, locks: ANIMATION_LOCKS,
  list: listAnimationSummaries, open: openAnimationProject, remove: deleteAnimationProject, removeOrphans: removeOrphanAnimationAssets,
  // 내보내기 임시 파일도 함께 치운다.
  cleanup: clearExportFiles,
  serialize: serializeAnimation,
  describe: summary => `${summary.frameCount}장 · ${formatLength(summary.durationMs)}`,
  guide: [
    { icon: 'draw', title: '1. 첫 장 그리기', text: '그리기·요소·글씨·사진으로 첫 장을 만들어요.' },
    { icon: 'plus', title: '2. 다음 장 만들기', text: '아래 +를 누르면 같은 그림의 다음 장이 생겨요. 조금씩 옮기거나 고쳐 그려요.' },
    { icon: 'play', title: '3. 재생하고 내려받기', text: '재생으로 움직임을 보고, 영상(MP4)으로 내려받아요.' },
    { icon: 'upload', title: '장난감·점토로 만들려면', text: '휴대폰으로 한 장씩 찍은 사진을 업로드로 장마다 넣어요.' },
  ],
};

export function AnimationHome(props: DeckHomeProps) {
  return <DeckHome config={CONFIG} {...props} />;
}
