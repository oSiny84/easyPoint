// 만화 그림 묶음(만화 계약 §7): public/comic/manifest.json의 말풍선·효과 그림을 읽고, 칸에 처음 놓을 자리를 정한다.
// 그림 파일은 슬라이드의 내장 그림과 같은 절차(형식·크기·라이선스 정보·해시 확인)로 받는다.
import { libraryUrl, loadLibraryImage, placeInCenter } from '../assets/library';
import type { BubbleText } from '../commands/comicApply';
import { DEFAULT_LINE_HEIGHT, LIMITS } from '../domain/limits';
import type { Slide } from '../domain/types';

export type ComicItem = {
  id: string; kind: 'bubble' | 'effect'; label: string; image: string; thumbnail: string; width: number; height: number;
  defaultWidth: number; defaultHeight: number; pngSha256: string;
  // 말풍선만: 글씨가 들어갈 네모(그림 크기에 대한 비율).
  inner?: { x: number; y: number; width: number; height: number };
};
type Box = { x: number; y: number; width: number; height: number };

let pack: Promise<ComicItem[]> | undefined;
// 실패하면 다음에 다시 시도할 수 있게 기억하지 않는다.
export function loadComicPack(): Promise<ComicItem[]> {
  return pack ??= (async () => {
    const response = await fetch(libraryUrl('/comic/manifest.json'));
    if (!response.ok) throw new Error(String(response.status));
    return (await response.json() as { assets: ComicItem[] }).assets;
  })().catch(error => { pack = undefined; throw error; });
}

export const loadComicImage = (item: ComicItem) => loadLibraryImage({ ...item, kind: 'sticker', category: '', tags: [], license: '' });

const round = (value: number) => Math.round(value * 100) / 100;
// 말풍선 글씨의 처음 값(계약 §7).
export const BUBBLE_TEXT = { text: '말을 써요', fontId: 'round-jua', fontSize: 36, bold: false, color: '#1F2933', align: 'center', lineHeight: DEFAULT_LINE_HEIGHT } as const;
// 효과 글씨 6종: 그림이 아니라 글씨 요소다.
export const EFFECT_WORDS = [
  { text: '쾅!', color: '#E03131' }, { text: '두근두근', color: '#D6336C' }, { text: '반짝!', color: '#F08C00' },
  { text: '휘익~', color: '#1C7ED6' }, { text: '하하하', color: '#2F9E44' }, { text: '으악!', color: '#7048E8' },
] as const;
export const EFFECT_WORD_STYLE = { fontId: 'block-dohyeon', fontSize: 96, bold: false, align: 'center', lineHeight: DEFAULT_LINE_HEIGHT, width: 520 } as const;

// 같은 자리에 같은 종류가 이미 있으면 겹쳐 가려지지 않게 조금씩 옮긴다.
function clear(slide: Slide, type: 'image' | 'text', x: number, y: number) {
  while (slide.elements.some(item => item.type === type && item.x === x && item.y === y)) { x += 30; y += 30; }
  return { x, y };
}

// 말풍선은 칸 가운데에, 글씨는 그림의 inner 네모 가운데에 한 줄이 오게 놓는다. 그림의 세로 크기는 픽셀 비율에서 다시 계산한다(문서 검사 0.1%).
export function placeBubble(item: ComicItem, slide: Slide): { image: Box; text: BubbleText } {
  const width = item.defaultWidth, height = round(width * item.height / item.width);
  const { x, y } = clear(slide, 'image', round((LIMITS.slideWidth - width) / 2), round((LIMITS.slideHeight - height) / 2));
  const inner = item.inner ?? { x: 0.15, y: 0.15, width: 0.7, height: 0.6 };
  const line = BUBBLE_TEXT.fontSize * BUBBLE_TEXT.lineHeight;
  return {
    image: { x, y, width, height },
    text: { ...BUBBLE_TEXT, x: round(x + inner.x * width), y: round(y + inner.y * height + (inner.height * height - line) / 2), width: round(inner.width * width) },
  };
}

// 효과 그림: 칸 가운데에 처음 크기로. 칸 전체를 덮는 그림(집중선)은 칸에 꼭 맞게 놓는다.
export function placeEffect(item: ComicItem, slide: Slide): Box {
  if (item.defaultWidth >= LIMITS.slideWidth) return { x: 0, y: 0, width: LIMITS.slideWidth, height: round(LIMITS.slideWidth * item.height / item.width) };
  const box = placeInCenter(item.width, item.height, item.defaultWidth, item.defaultHeight);
  return { ...box, ...clear(slide, 'image', box.x, box.y) };
}

export function placeWord(slide: Slide) {
  const height = EFFECT_WORD_STYLE.fontSize * EFFECT_WORD_STYLE.lineHeight;
  return clear(slide, 'text', (LIMITS.slideWidth - EFFECT_WORD_STYLE.width) / 2, round((LIMITS.slideHeight - height) / 2));
}
