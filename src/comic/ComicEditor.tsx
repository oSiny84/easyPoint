// 만화 편집 화면(만화 계약 §9). 슬라이드의 편집 화면(app/Editor.tsx)을 그대로 쓰고, 달라지는 지점만 채워 넘긴다:
// 저장·원본 파일, 여섯째 도구(만화 패널), 칸 목록 배지(쪽), 끄는 동안의 말풍선 짝 글씨, 만화 보기, 만화책 PDF·그림 PNG 내려받기.
// Editor는 만화 필드(칸 배치·말풍선 짝)를 알지 못한다. 이 파일이 만화 저장소를 구독해 필요한 값을 만든다.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Editor, type EditorApi, type EditorVariant } from '../app/Editor';
import type { ComicCommand } from '../commands/comicApply';
import type { DeckEditorProps } from '../deck/DeckApp';
import { carryBubble, followBubble } from '../domain/comicBubbles';
import type { ComicProject } from '../domain/comicTypes';
import type { ComicStore } from '../state/comicStore';
import { EFFECT_WORD_STYLE, loadComicImage, loadComicPack, placeBubble, placeEffect, placeWord, type ComicItem, type EFFECT_WORDS } from './comicAssets';
import { saveComicProject } from './comicDatabase';
import { COMIC_EXTENSION, deserializeComic, serializeComic } from './comicFile';
import { ComicPanel } from './ComicPanel';
import { ComicReader } from './ComicReader';
import { panelsPerPage } from './pageLayout';

const sizeText = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;

export function ComicEditor({ value, initialNote, initiallySaved, onOpen, onHome, onNew }: DeckEditorProps<ComicProject, ComicStore>) {
  const { store, assets } = value;
  const project = useSyncExternalStore(store.subscribe, store.getProject);
  // 만화 그림 묶음. undefined: 읽는 중, null: 읽지 못함(그리기는 그대로 된다).
  const [pack, setPack] = useState<ComicItem[] | null | undefined>(undefined);
  useEffect(() => { void loadComicPack().then(setPack, () => setPack(null)); }, []);
  const dispatch = (command: ComicCommand) => { const current = store.getProject(); return store.dispatch(current.id, current.revision, command); };
  // 그림을 받는 동안 칸이 바뀔 수 있으므로 패널이 마지막으로 받은 편집 화면 기능을 쓴다.
  const latest = useRef<EditorApi | null>(null);

  // 말풍선: 그림을 받아 사진 자료에 넣고, 그림과 글씨를 한 번에 넣은 뒤 글씨를 내용 전체를 고른 입력 상태로 연다.
  async function addBubble(item: ComicItem) {
    const loaded = await loadComicImage(item);
    const api = latest.current;
    if (!api) return;
    if (!loaded.ok) { api.setStatus(loaded.message); return; }
    assets.put(loaded.asset.id, loaded.blob);
    api.perform(() => {
      const placed = placeBubble(item, api.slide);
      const result = dispatch({ type: 'addBubble', slideId: api.slide.id, assetId: loaded.asset.id, asset: loaded.asset, ...placed.image, text: placed.text });
      const text = result.ok ? store.getProject().slides.find(slide => slide.id === api.slide.id)?.elements.at(-1) : undefined;
      if (text) api.editText(text.id, true);
      return result;
    });
  }
  async function addEffect(item: ComicItem) {
    const loaded = await loadComicImage(item);
    const api = latest.current;
    if (!api) return;
    if (!loaded.ok) { api.setStatus(loaded.message); return; }
    assets.put(loaded.asset.id, loaded.blob);
    api.perform(() => dispatch({ type: 'addImage', slideId: api.slide.id, assetId: loaded.asset.id, asset: loaded.asset, ...placeEffect(item, api.slide) }));
  }
  function addWord(word: typeof EFFECT_WORDS[number], api: EditorApi) {
    api.perform(() => dispatch({ type: 'addText', slideId: api.slide.id, text: word.text, color: word.color, ...EFFECT_WORD_STYLE, ...placeWord(api.slide) }));
  }

  const variant: EditorVariant = {
    // Editor가 넘기는 스냅숏은 이 편집기의 만화 저장소에서 온 문서다.
    save: (snapshot, resolve, extras) => saveComicProject(snapshot as ComicProject, resolve, extras),
    serialize: (snapshot, resolve) => serializeComic(snapshot as ComicProject, resolve),
    deserialize: deserializeComic,
    extension: COMIC_EXTENSION,
    tool: {
      label: '만화', icon: 'comic',
      panel: api => {
        latest.current = api;
        return <ComicPanel pack={pack} layout={project.layout} panelCount={project.slides.length} disabled={api.readOnly}
          onBubble={item => void addBubble(item)} onEffect={item => void addEffect(item)} onWord={word => addWord(word, api)}
          onLayout={layout => api.perform(() => dispatch({ type: 'setComicLayout', layout }))} />;
      },
    },
    slideList: {
      addLabel: '다음 칸 만들기',
      // 쪽이 시작되는 칸에 쪽 번호를 붙인다.
      badge: slide => {
        const index = project.slides.findIndex(item => item.id === slide.id), perPage = panelsPerPage(project.layout);
        return index >= 0 && index % perPage === 0 ? `${index / perPage + 1}쪽` : undefined;
      },
    },
    // 말풍선 그림을 끌거나 크기를 바꾸는 동안 짝 글씨도, 짝 글씨를 끄는 동안 말풍선 그림도 명령이 놓을 자리에 그린다.
    companions: (preview, slide) => {
      const original = slide.elements.find(item => item.id === preview.id);
      if (preview.type === 'image' && original?.type === 'image') {
        const text = slide.elements.find(item => item.id === project.bubbles[preview.id]);
        return text?.type === 'text' ? [followBubble(original, preview, text)] : [];
      }
      // 글씨 상자의 크기를 바꾸는 중이면(너비·글씨 크기가 달라진다) 말풍선은 그대로 둔다.
      if (preview.type === 'text' && original?.type === 'text' && preview.width === original.width && preview.fontSize === original.fontSize) {
        const imageId = Object.keys(project.bubbles).find(id => project.bubbles[id] === preview.id);
        const image = slide.elements.find(item => item.id === imageId);
        return image?.type === 'image' ? [carryBubble(original, preview, image)] : [];
      }
      return [];
    },
    present: {
      label: '만화 보기',
      render: ({ project: snapshot, slideId, onClose }) => <ComicReader project={snapshot as ComicProject} startSlideId={slideId} resolve={assets.resolve} onClose={onClose} />,
    },
    ownExportsOnly: true,
    // 내보내기 코드(pdf-lib 포함)는 내려받을 때 불러온다.
    exports: [{
      id: 'comic-pdf', label: '만화책 (PDF)', note: '칸들을 종이에 모아요. 인쇄할 수 있어요.',
      run: async (snapshot, resolve, options, signal) => {
        const { exportComicPdf } = await import('./exportComic');
        const result = await exportComicPdf(snapshot as ComicProject, resolve, { signal, onProgress: options.onProgress });
        if (!result.ok) return result;
        return { ok: true, blob: result.blob, warnings: [], extension: 'pdf', done: `만화책을 내려받았어요. PDF · ${result.pages}쪽 · ${sizeText(result.blob.size)}.` };
      },
    }, {
      id: 'comic-png', label: '그림 (PNG)', note: '지금 쪽을 그림 한 장으로 받아요.',
      run: async (snapshot, resolve, options, signal, context) => {
        const { exportComicPng } = await import('./exportComic');
        const result = await exportComicPng(snapshot as ComicProject, context.slideId, resolve, { signal, onProgress: options.onProgress });
        if (!result.ok) return result;
        return { ok: true, blob: result.blob, warnings: [], extension: 'png', done: `그림을 내려받았어요. PNG · ${result.pages}쪽 중 ${result.page}쪽 · ${sizeText(result.blob.size)}.` };
      },
    }],
  };

  // 칸 목록 배지의 색 같은 만화만의 모양을 구분하려고 감싼다. 배치에는 끼어들지 않는다(display: contents).
  return <div className="comic-editor">
    <Editor value={value} variant={variant} initialNote={initialNote} initiallySaved={initiallySaved}
      onOpen={(next, nextAssets, note) => onOpen(next as ComicProject, nextAssets, note)} onHome={onHome} onNew={onNew} />
  </div>;
}
