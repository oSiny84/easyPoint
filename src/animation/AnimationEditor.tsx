// 애니메이션 편집 화면(애니메이션 계약 §9). 슬라이드의 편집 화면(app/Editor.tsx)을 그대로 쓰고, 달라지는 지점만 채워 넘긴다:
// 저장·원본 파일, 여섯째 도구(애니메이션 패널), + 타일(지금 장 복사), 장 메뉴·배지(길게 보이기), 양파 껍질, 재생, MP4 내보내기.
// Editor는 애니메이션 필드(빠르기·음악·길게 보이기)를 알지 못한다. 이 파일이 애니메이션 저장소를 구독해 필요한 값을 만든다.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Editor, type EditorVariant } from '../app/Editor';
import type { AnimationCommand } from '../commands/animationApply';
import { Icon } from '../components/Icon';
import type { AnimationProject, FrameHold } from '../domain/animationTypes';
import type { AnimationSession } from './AnimationApp';
import { saveAnimationProject } from './animationDatabase';
import { ANIMATION_EXTENSION, deserializeAnimation, serializeAnimation } from './animationFile';
import { AnimationPanel } from './AnimationPanel';
import { AnimationPlayer } from './AnimationPlayer';
import { durationMs, formatLength } from './frameTimes';
import { OnionSkin } from './OnionSkin';
import { createPreviewCache } from './previewCache';
import type { SoundItem } from '../video/builtins';

const HOLDS: { hold: 1 | FrameHold; label: string }[] = [{ hold: 1, label: '보통' }, { hold: 2, label: '길게 (2배)' }, { hold: 4, label: '아주 길게 (4배)' }];

type Props = {
  value: AnimationSession; music: readonly SoundItem[] | null | undefined; initialNote?: string; initiallySaved?: boolean;
  onOpen: (project: AnimationProject, assets: Map<string, Blob>, note: string) => void; onHome: () => void; onNew: () => void;
};

export function AnimationEditor({ value, music, initialNote, initiallySaved, onOpen, onHome, onNew }: Props) {
  const { store, assets } = value;
  const project = useSyncExternalStore(store.subscribe, store.getProject);
  // 앞 장 겹쳐 보기. 작품을 여는 동안만 유지한다(계약 §8).
  const [onion, setOnion] = useState(true);
  const cache = useMemo(() => createPreviewCache(assets.resolve), [assets]);
  useEffect(() => () => cache.dispose(), [cache]);
  const dispatch = (command: AnimationCommand) => { const current = store.getProject(); return store.dispatch(current.id, current.revision, command); };

  const variant: EditorVariant = {
    // Editor가 넘기는 스냅숏은 이 편집기의 애니메이션 저장소에서 온 문서다.
    save: (snapshot, resolve, extras) => saveAnimationProject(snapshot as AnimationProject, resolve, extras),
    serialize: (snapshot, resolve) => serializeAnimation(snapshot as AnimationProject, resolve),
    deserialize: deserializeAnimation,
    extension: ANIMATION_EXTENSION,
    tool: {
      label: '애니메이션', icon: 'animation',
      panel: api => <AnimationPanel fps={project.fps} musicId={project.musicId} musicVolume={project.musicVolume} slideCount={project.slides.length} lengthMs={durationMs(project)}
        music={music} disabled={api.readOnly} onion={onion} onOnion={setOnion} onChange={patch => api.perform(() => dispatch({ type: 'setAnimation', ...patch }))} />,
    },
    addSlide: 'copy-current',
    slideList: {
      addLabel: '다음 장 만들기',
      badge: slide => project.holds[slide.id] ? `×${project.holds[slide.id]}` : undefined,
      extraItems: (slide, api) => [
        { label: '빈 장 추가', onSelect: () => api.perform(() => dispatch({ type: 'addSlide', afterSlideId: slide.id })) },
        ...HOLDS.map(item => ({ label: `길게 보이기: ${item.label}`, disabled: (project.holds[slide.id] ?? 1) === item.hold, onSelect: () => api.perform(() => dispatch({ type: 'setFrameHold', slideId: slide.id, hold: item.hold })) })),
      ],
    },
    Underlay: onion ? OnionSkin : undefined,
    zoomExtra: <button className="icon-only" aria-label="앞 장 겹쳐 보기" title="앞 장 겹쳐 보기" aria-pressed={onion} onClick={() => setOnion(!onion)}><Icon name="onion" size={18} /></button>,
    present: {
      label: '재생',
      render: ({ project: snapshot, slideId, onClose }) => {
        const playing = snapshot as AnimationProject;
        return <AnimationPlayer project={playing} startSlideId={slideId} cache={cache} music={music?.find(item => item.id === playing.musicId) ?? null} onClose={onClose} />;
      },
    },
    exports: [{
      id: 'video', label: '영상 (MP4)', note: '움직이는 영상으로 만들어요. 보호자와 함께 YouTube에 올릴 수 있어요.',
      // 내보내기 코드는 내려받을 때 불러온다(첫 화면 크기를 늘리지 않는다).
      run: async (snapshot, resolve, options, signal) => {
        const { exportAnimation } = await import('./exportAnimation');
        const result = await exportAnimation(snapshot as AnimationProject, resolve, music, { signal, onProgress: options.onProgress });
        if (!result.ok) return result;
        const size = result.bytes >= 1024 * 1024 ? `${(result.bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(result.bytes / 1024))}KB`;
        return { ok: true, blob: result.blob, warnings: [], extension: result.container,
          done: `영상을 내려받았어요. ${result.container === 'mp4' ? 'MP4' : 'WebM'} · ${formatLength(result.durationMs)} · ${size}. 보호자 계정으로 YouTube에 올릴 수 있어요.` };
      },
    }],
  };

  return <Editor value={value} variant={variant} initialNote={initialNote} initiallySaved={initiallySaved}
    onOpen={(next, nextAssets, note) => onOpen(next as AnimationProject, nextAssets, note)} onHome={onHome} onNew={onNew} />;
}
