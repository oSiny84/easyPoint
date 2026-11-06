// 내장 요소·배경 라이브러리. 파일 형식은 docs/ASSET_LIBRARY_READY.md에 있다.
// 라이브러리 항목 id와 문서의 assetId는 다르다. 문서는 PNG·JPEG 바이트의 SHA-256만 참조한다.
// 사용자 사진과 달리 검증한 내장 파일은 원본 바이트를 유지해 PNG의 라이선스 정보를 보존한다.
import { LIMITS } from '../domain/limits';
import { fail, type Asset, type Background, type Failure } from '../domain/types';
import { readImageHeader, readPngText, sha256Hex } from './imageHeader';

export type LibraryKind = 'shape' | 'character' | 'sticker';
export type ColorVariant = { id: string; color: string; image: string };
export type LibraryItem = {
  id: string; kind: LibraryKind; label: string; category: string; tags: string[]; image: string; thumbnail: string;
  width: number; height: number; defaultWidth: number; defaultHeight: number; license: string; pngSha256: string; recolorable?: boolean; colorVariants?: ColorVariant[];
};
export type Library = { categories: Record<LibraryKind, string>; palette: Record<string, string>; assets: LibraryItem[] };
export type ProvidedBackground = { id: string; label: string; category: string; tags: string[]; image: string; thumbnail: string; pngSha256: string; width: number; height: number; recommendedTextColor: string };
export type TemplateItem = { id: string; label: string; category: string; tags: string[]; thumbnail: string; file: string; assets: { assetId: string }[] };

export const libraryUrl = (path: string) => `${import.meta.env?.BASE_URL ?? '/'}${path.replace(/^\//, '')}`;

const once = <T,>(load: () => Promise<T>) => { let value: Promise<T> | undefined; return () => (value ??= load().catch(error => { value = undefined; throw error; })); };
const fetchJson = async <T,>(path: string): Promise<T> => { const response = await fetch(libraryUrl(path)); if (!response.ok) throw new Error(String(response.status)); return response.json() as Promise<T>; };
export const loadLibrary = once(() => fetchJson<Library>('/library/manifest.json'));
// 그림 배경을 먼저 보여 준다. 두 묶음은 만드는 도구가 달라 manifest를 따로 둔다.
export const loadBackgrounds = once(async () => {
  const [illustrated, provided] = await Promise.all(['/backgrounds-illustrated/manifest.json', '/backgrounds/manifest.json'].map(path => fetchJson<{ assets: ProvidedBackground[] }>(path)));
  return [...illustrated.assets, ...provided.assets];
});
export const loadTemplates = once(async () => (await fetchJson<{ templates: TemplateItem[] }>('/templates/manifest.json')).templates);

const normalize = (text: string) => text.normalize('NFKC').toLowerCase().trim();

// 이름·태그·분류에서 찾는다. 검색어를 띄어 쓰면 모두 포함하는 항목만 남긴다.
export function searchLibrary(items: readonly LibraryItem[], filter: { query?: string; kind?: LibraryKind | 'all'; category?: string | null }) {
  const words = normalize(filter.query ?? '').split(/\s+/).filter(Boolean);
  return items.filter(item => {
    if (filter.kind && filter.kind !== 'all' && item.kind !== filter.kind) return false;
    if (filter.category && item.category !== filter.category) return false;
    const haystack = normalize([item.label, item.category, ...item.tags].join(' '));
    return words.every(word => haystack.includes(word));
  });
}

export const categoriesOf = (items: readonly LibraryItem[], kind: LibraryKind | 'all') => [...new Set(items.filter(item => kind === 'all' || item.kind === kind).map(item => item.category))];

// 슬라이드에 넣을 크기. 비율은 픽셀 크기에서 다시 계산해 문서 검사(0.1%)를 항상 통과하게 한다.
export function placeInCenter(pixelWidth: number, pixelHeight: number, wantedWidth: number, wantedHeight: number) {
  const aspect = pixelWidth / pixelHeight;
  const maxWidth = LIMITS.slideWidth * 0.9, maxHeight = LIMITS.slideHeight * 0.9;
  let width = Math.min(wantedWidth, maxWidth); let height = width / aspect;
  if (height > Math.min(wantedHeight, maxHeight)) { height = Math.min(wantedHeight, maxHeight); width = height * aspect; }
  return { x: (LIMITS.slideWidth - width) / 2, y: (LIMITS.slideHeight - height) / 2, width, height };
}

export type LoadedImage = { ok: true; asset: Asset; blob: Blob };

// 같은 origin의 파일을 읽어 형식·크기·라이선스·해시를 확인한다. 하나라도 다르면 넣지 않는다.
async function loadVerified(path: string, expected: { width: number; height: number; mime: Asset['mime']; sha256?: string; requireLicense: boolean }): Promise<LoadedImage | Failure> {
  const problem = fail('ASSET_INVALID', '그림을 불러오지 못했어요. 다시 시도해 주세요.');
  let bytes: Uint8Array;
  try {
    const response = await fetch(libraryUrl(path));
    if (!response.ok) return problem;
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch { return problem; }
  const header = readImageHeader(bytes);
  if (!header || header.mime !== expected.mime || header.width !== expected.width || header.height !== expected.height) return problem;
  if (expected.requireLicense && !readPngText(bytes, 'License')) return problem;
  const id = await sha256Hex(bytes);
  if (expected.sha256 && id !== expected.sha256) return problem;
  return { ok: true, blob: new Blob([new Uint8Array(bytes)], { type: expected.mime }), asset: { id, mime: expected.mime, pixelWidth: header.width, pixelHeight: header.height, byteLength: bytes.length } };
}

export function loadLibraryImage(item: LibraryItem, variant?: ColorVariant) {
  // 색 변형 파일은 manifest에 해시가 없어 형식·크기·라이선스만 확인한다.
  const isBase = !variant || variant.image === item.image;
  return loadVerified(variant?.image ?? item.image, { width: item.width, height: item.height, mime: 'image/png', sha256: isBase ? item.pngSha256 : undefined, requireLicense: true });
}
export const loadBackgroundImage = (background: ProvidedBackground) => loadVerified(background.image, { width: background.width, height: background.height, mime: 'image/png', sha256: background.pngSha256, requireLicense: true });

// 시작 템플릿 파일을 읽는다. 내용 검사는 원본 파일과 같은 deserializeProject가 맡는다.
export async function loadTemplateFile(template: TemplateItem) {
  const response = await fetch(libraryUrl(template.file));
  if (!response.ok) throw new Error(String(response.status));
  return response.blob();
}

// 최근 사용 항목은 이 브라우저에만 남기는 편의 기능이다. 저장소를 못 써도 동작한다.
const RECENT_KEY = 'canvacraft.recent-elements', RECENT_MAX = 9;
export function readRecent(): string[] {
  try { const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, RECENT_MAX) : []; }
  catch { return []; }
}
export function rememberRecent(id: string) {
  const next = [id, ...readRecent().filter(item => item !== id)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* 저장하지 못해도 삽입에는 영향이 없다. */ }
  return next;
}

// 새 글씨의 첫 색. 이미 있는 글씨의 색은 바꾸지 않는다(BACKGROUNDS_READY.md).
export function suggestedTextColor(background: Background, provided: readonly ProvidedBackground[]) {
  if (background.kind === 'image') return provided.find(item => item.pngSha256 === background.assetId)?.recommendedTextColor ?? DARK_TEXT;
  const channel = (at: number) => parseInt(background.color.slice(at, at + 2), 16) / 255;
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance < 0.45 ? '#FFFFFF' : DARK_TEXT;
}
const DARK_TEXT = '#283B37';
