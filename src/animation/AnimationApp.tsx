// 애니메이션 편집기 진입점(애니메이션 계약 §6). 시작 화면에서 처음 들어올 때 불러온다(지연 로딩).
// 화면 이동(작품 목록 ↔ 편집기, 새로고침 복원)은 만화와 함께 쓰는 공통 틀(deck/DeckApp.tsx)이 맡는다. 편집 화면은 슬라이드의 Editor를 그대로 쓴다.
import { useEffect, useState } from 'react';
import { DeckApp, type DeckAppConfig, type DeckSession } from '../deck/DeckApp';
import { createAnimationProject } from '../domain/animationProject';
import type { AnimationProject } from '../domain/animationTypes';
import { createAnimationStore, type AnimationStore } from '../state/animationStore';
import { ANIMATION_LOCKS } from '../storage/locks';
import { loadBuiltins, type SoundItem } from '../video/builtins';
import { listAnimationSummaries, openAnimationProject } from './animationDatabase';
import { AnimationEditor } from './AnimationEditor';
import { deserializeAnimation } from './animationFile';
import { AnimationHome } from './AnimationHome';

export type AnimationSession = DeckSession<AnimationStore>;

const CONFIG: DeckAppConfig<AnimationProject, AnimationStore> = {
  kind: 'animation', locks: ANIMATION_LOCKS,
  createProject: (newId, now) => createAnimationProject(newId, now),
  createStore: createAnimationStore,
  list: listAnimationSummaries, open: openAnimationProject, deserialize: deserializeAnimation,
};

export function AnimationApp({ resumeId, onStart }: { resumeId: string | null; onStart: () => void }) {
  // 배경음악 목록(영상 편집기의 내장 음악). undefined: 읽는 중, null: 읽지 못함(그림은 그대로 만들 수 있다).
  const [music, setMusic] = useState<SoundItem[] | null | undefined>(undefined);
  useEffect(() => { void loadBuiltins().then(builtins => setMusic(builtins.music), () => setMusic(null)); }, []);

  return <DeckApp config={CONFIG} resumeId={resumeId} onStart={onStart}
    renderHome={(props, key) => <AnimationHome key={key} {...props} />}
    renderEditor={(props, key) => <AnimationEditor key={key} music={music} {...props} />} />;
}
