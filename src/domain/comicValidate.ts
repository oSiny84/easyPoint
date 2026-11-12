// 만화 작품 검사(만화 계약 §5). 원본 파일·저장소 읽기·명령이 같은 규칙을 쓴다. DOM에 의존하지 않는다.
// 칸·요소·사진·개수 검사는 슬라이드의 validateProject에 그대로 맡기고, 여기서는 만화 필드(칸 배치·말풍선 짝)만 본다.
import { COMIC_LAYOUTS, COMIC_SCHEMA_VERSION } from './comicLimits';
import type { ComicProject, ComicSettings } from './comicTypes';
import { fail, type Failure, type Slide } from './types';
import { onlyKeys, validateProject } from './validate';

const SLIDE_KEYS = ['schemaVersion', 'id', 'title', 'revision', 'createdAt', 'updatedAt', 'width', 'height', 'slides', 'assetManifest'] as const;
const OWN_KEYS = ['kind', 'layout', 'bubbles'] as const;
const invalid = (message: string) => fail('INVALID_VALUE', message);

export const isComicLayout = (value: unknown) => (COMIC_LAYOUTS as readonly unknown[]).includes(value);

// 말풍선 짝: 키는 사진 요소, 값은 같은 칸의 글씨 요소다. 글씨 하나는 짝 하나에만 들어간다.
export function checkComicSettings(settings: ComicSettings, slides: readonly Slide[]): Failure | null {
  if (!isComicLayout(settings.layout)) return invalid('칸 배치가 올바르지 않아요.');
  const bubbles = settings.bubbles as unknown;
  if (!bubbles || typeof bubbles !== 'object' || Array.isArray(bubbles)) return invalid('말풍선 값이 올바르지 않아요.');
  const pairs = Object.entries(bubbles);
  if (!pairs.length) return null;
  const where = new Map<string, { slideId: string; type: string }>();
  for (const slide of slides) for (const element of slide.elements) where.set(element.id, { slideId: slide.id, type: element.type });
  const used = new Set<string>();
  for (const [imageId, textId] of pairs) {
    const image = where.get(imageId);
    if (!image || image.type !== 'image') return invalid('말풍선이 없는 그림을 가리켜요.');
    const text = typeof textId === 'string' ? where.get(textId) : undefined;
    if (!text || text.type !== 'text' || text.slideId !== image.slideId) return invalid('말풍선이 없는 글씨를 가리켜요.');
    if (used.has(textId as string)) return invalid('글씨 하나가 말풍선 둘에 들어 있어요.');
    used.add(textId as string);
  }
  return null;
}

export function validateComicProject(value: unknown): { ok: true; project: ComicProject } | Failure {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('작품 파일 형식이 올바르지 않아요.');
  const project = value as ComicProject;
  if (typeof project.schemaVersion === 'number' && project.schemaVersion > COMIC_SCHEMA_VERSION) return fail('UNSUPPORTED_VERSION', '더 새로운 버전에서 만든 작품이라 열 수 없어요.');
  if (project.kind !== 'comic') return invalid('만화 작품 파일 형식이 올바르지 않아요.');
  const keys = onlyKeys(project, [...SLIDE_KEYS, ...OWN_KEYS], '작품');
  if (keys) return keys;
  // 슬라이드와 같은 필드만 뽑아 슬라이드 검사에 넘긴다. 없는 필드는 그대로 없게 두어 그쪽이 걸러 내게 한다.
  const slidePart: Record<string, unknown> = {};
  for (const key of SLIDE_KEYS) if (key in project) slidePart[key] = project[key];
  const checked = validateProject(slidePart);
  if (!checked.ok) return checked;
  const problem = checkComicSettings(project, project.slides);
  if (problem) return problem;
  return { ok: true, project };
}
