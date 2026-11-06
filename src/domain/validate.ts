// 원본 파일·IndexedDB 읽기와 런타임 명령이 함께 쓰는 값 검사. 임의로 고쳐서 열지 않는다.
import { BOLD_FONT_IDS, FONT_IDS, LIMITS, SCHEMA_VERSION } from './limits';
import { fail, type Asset, type Background, type Failure, type ImageElement, type Project, type Slide, type SlideElement, type StrokeElement, type TextElement } from './types';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ASSET_ID = /^[0-9a-f]{64}$/;
export const COLOR = /^#[0-9A-F]{6}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const inRange = (value: unknown, min: number, max: number) => finite(value) && value >= min && value <= max;
export const codePoints = (text: string) => [...text].length;
const invalid = (message: string) => fail('INVALID_VALUE', message);

// 입력 색은 대문자로 정규화한다. 저장·검사 단계에서는 대문자만 허용한다.
export const normalizeColor = (color: unknown) => typeof color === 'string' ? color.toUpperCase() : color as string;
export const normalizeText = (text: string) => text.replace(/\r\n?/g, '\n');
export const isBlankText = (text: string) => text.trim().length === 0;

function onlyKeys(value: object, allowed: readonly string[], label: string): Failure | null {
  const extra = Object.keys(value).find(key => !allowed.includes(key));
  return extra ? invalid(`${label}에 알 수 없는 값이 있어요.`) : null;
}

// 글씨 높이는 줄 계산 전에는 모르므로 개행 수로 구한 최소 높이를 쓴다. 이 값으로 슬라이드와 겹치는지만 판단한다.
export function elementBounds(element: SlideElement) {
  if (element.type === 'image') return { left: element.x, top: element.y, right: element.x + element.width, bottom: element.y + element.height };
  if (element.type === 'text') {
    const lines = element.text.split('\n').length;
    return { left: element.x, top: element.y, right: element.x + element.width, bottom: element.y + lines * element.fontSize * element.lineHeight };
  }
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let i = 0; i < element.points.length; i += 2) {
    left = Math.min(left, element.points[i]); right = Math.max(right, element.points[i]);
    top = Math.min(top, element.points[i + 1]); bottom = Math.max(bottom, element.points[i + 1]);
  }
  const half = element.strokeWidth / 2;
  return { left: element.x + left - half, top: element.y + top - half, right: element.x + right + half, bottom: element.y + bottom + half };
}

function checkPosition(element: SlideElement): Failure | null {
  if (!inRange(element.x, LIMITS.xMin, LIMITS.xMax) || !inRange(element.y, LIMITS.yMin, LIMITS.yMax)) return invalid('요소 위치가 허용 범위를 벗어났어요.');
  const box = elementBounds(element);
  if (box.right <= 0 || box.bottom <= 0 || box.left >= LIMITS.slideWidth || box.top >= LIMITS.slideHeight) return invalid('요소가 슬라이드 밖으로 완전히 나갈 수 없어요.');
  return null;
}

export function checkText(element: TextElement): Failure | null {
  const keys = onlyKeys(element, ['id', 'type', 'x', 'y', 'width', 'text', 'fontId', 'fontSize', 'bold', 'color', 'align', 'lineHeight'], '글씨');
  if (keys) return keys;
  if (typeof element.text !== 'string' || isBlankText(element.text)) return invalid('빈 글씨는 저장할 수 없어요.');
  if (codePoints(element.text) > LIMITS.textCodePoints) return fail('LIMIT_EXCEEDED', '글씨가 너무 길어요.');
  if (!inRange(element.width, LIMITS.textWidthMin, LIMITS.textWidthMax)) return invalid('글씨 상자 폭이 허용 범위를 벗어났어요.');
  if (!(FONT_IDS as readonly string[]).includes(element.fontId)) return invalid('등록되지 않은 글꼴이에요.');
  if (!inRange(element.fontSize, LIMITS.fontSizeMin, LIMITS.fontSizeMax)) return invalid('글씨 크기가 허용 범위를 벗어났어요.');
  if (!inRange(element.lineHeight, LIMITS.lineHeightMin, LIMITS.lineHeightMax)) return invalid('줄 간격이 허용 범위를 벗어났어요.');
  if (typeof element.bold !== 'boolean') return invalid('굵기 값이 올바르지 않아요.');
  if (element.bold && !BOLD_FONT_IDS.includes(element.fontId)) return invalid('이 글꼴은 굵게 할 수 없어요.');
  if (!COLOR.test(element.color)) return invalid('색 값이 올바르지 않아요.');
  if (!['left', 'center', 'right'].includes(element.align)) return invalid('정렬 값이 올바르지 않아요.');
  return checkPosition(element);
}

export function checkImage(element: ImageElement, manifest: readonly Asset[]): Failure | null {
  const keys = onlyKeys(element, ['id', 'type', 'x', 'y', 'width', 'height', 'assetId'], '사진');
  if (keys) return keys;
  if (!inRange(element.width, 1, LIMITS.imageWidthMax) || !inRange(element.height, 1, LIMITS.imageHeightMax)) return invalid('사진 크기가 허용 범위를 벗어났어요.');
  const asset = manifest.find(item => item.id === element.assetId);
  if (!asset) return fail('ASSET_MISSING', '사진 자료를 찾을 수 없어요.');
  const wanted = asset.pixelWidth / asset.pixelHeight;
  if (Math.abs(element.width / element.height - wanted) / wanted > LIMITS.imageAspectTolerance) return invalid('사진 비율이 원본과 달라요.');
  return checkPosition(element);
}

export function checkStroke(element: StrokeElement): Failure | null {
  const keys = onlyKeys(element, ['id', 'type', 'x', 'y', 'points', 'color', 'strokeWidth'], '그림');
  if (keys) return keys;
  if (!Array.isArray(element.points) || element.points.length < 2 || element.points.length % 2 !== 0) return invalid('그림 점 데이터가 올바르지 않아요.');
  if (element.points.length / 2 > LIMITS.pointsPerStroke) return fail('LIMIT_EXCEEDED', '그림 한 획의 점이 너무 많아요.');
  for (let i = 0; i < element.points.length; i += 2) {
    if (!inRange(element.points[i], 0, LIMITS.slideWidth) || !inRange(element.points[i + 1], 0, LIMITS.slideHeight)) return invalid('그림 점 좌표가 허용 범위를 벗어났어요.');
  }
  if (!COLOR.test(element.color)) return invalid('색 값이 올바르지 않아요.');
  if (!inRange(element.strokeWidth, LIMITS.strokeWidthMin, LIMITS.strokeWidthMax)) return invalid('펜 굵기가 허용 범위를 벗어났어요.');
  return checkPosition(element);
}

export function checkElement(element: SlideElement, manifest: readonly Asset[]): Failure | null {
  if (!element || typeof element !== 'object') return invalid('요소 형식이 올바르지 않아요.');
  if (typeof element.id !== 'string' || !UUID.test(element.id)) return invalid('요소 ID가 올바르지 않아요.');
  if (element.type === 'text') return checkText(element);
  if (element.type === 'image') return checkImage(element, manifest);
  if (element.type === 'stroke') return checkStroke(element);
  return invalid('알 수 없는 요소 종류예요.');
}

export function checkBackground(background: Background, manifest: readonly Asset[]): Failure | null {
  if (!background || typeof background !== 'object') return invalid('배경 형식이 올바르지 않아요.');
  if (background.kind === 'solid') return onlyKeys(background, ['kind', 'color'], '배경') ?? (COLOR.test(background.color) ? null : invalid('배경 색 값이 올바르지 않아요.'));
  if (background.kind === 'image') {
    const keys = onlyKeys(background, ['kind', 'assetId', 'fit'], '배경');
    if (keys) return keys;
    if (background.fit !== 'center-cover') return invalid('배경 채우기 값이 올바르지 않아요.');
    return manifest.some(item => item.id === background.assetId) ? null : fail('ASSET_MISSING', '배경 사진 자료를 찾을 수 없어요.');
  }
  return invalid('알 수 없는 배경 종류예요.');
}

export function checkAsset(asset: Asset): Failure | null {
  if (!asset || typeof asset !== 'object') return fail('ASSET_INVALID', '사진 자료 형식이 올바르지 않아요.');
  if (onlyKeys(asset, ['id', 'mime', 'pixelWidth', 'pixelHeight', 'byteLength'], '사진 자료')) return fail('ASSET_INVALID', '사진 자료에 알 수 없는 값이 있어요.');
  if (typeof asset.id !== 'string' || !ASSET_ID.test(asset.id)) return fail('ASSET_INVALID', '사진 자료 ID가 올바르지 않아요.');
  if (asset.mime !== 'image/png' && asset.mime !== 'image/jpeg') return fail('ASSET_INVALID', 'PNG·JPEG 사진만 저장할 수 있어요.');
  const side = (value: number) => Number.isInteger(value) && value >= 1 && value <= LIMITS.assetSideMax;
  if (!side(asset.pixelWidth) || !side(asset.pixelHeight)) return fail('ASSET_INVALID', '사진 크기가 허용 범위를 벗어났어요.');
  if (!Number.isInteger(asset.byteLength) || asset.byteLength < 1 || asset.byteLength > LIMITS.assetBytesMax) return fail('ASSET_INVALID', '사진 파일 크기가 허용 범위를 벗어났어요.');
  return null;
}

// 장·요소·점 개수 상한을 전체 문서 기준으로 검사한다. 명령 적용 뒤에도 같은 함수를 쓴다.
export function checkCounts(slides: readonly Slide[]): Failure | null {
  if (slides.length < 1) return invalid('슬라이드가 한 장은 있어야 해요.');
  if (slides.length > LIMITS.slides) return fail('LIMIT_EXCEEDED', '슬라이드를 더 만들 수 없어요.');
  let elements = 0, points = 0;
  for (const slide of slides) {
    if (slide.elements.length > LIMITS.elementsPerSlide) return fail('LIMIT_EXCEEDED', '한 장에 넣을 수 있는 요소가 가득 찼어요.');
    elements += slide.elements.length;
    let slidePoints = 0;
    for (const element of slide.elements) if (element.type === 'stroke') slidePoints += element.points.length / 2;
    if (slidePoints > LIMITS.pointsPerSlide) return fail('LIMIT_EXCEEDED', '한 장에 그릴 수 있는 양이 가득 찼어요.');
    points += slidePoints;
  }
  if (elements > LIMITS.elementsPerProject) return fail('LIMIT_EXCEEDED', '작품에 넣을 수 있는 요소가 가득 찼어요.');
  if (points > LIMITS.pointsPerProject) return fail('LIMIT_EXCEEDED', '작품에 그릴 수 있는 양이 가득 찼어요.');
  return null;
}

export function validateProject(value: unknown): { ok: true; project: Project } | Failure {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('작품 파일 형식이 올바르지 않아요.');
  const project = value as Project;
  if (typeof project.schemaVersion === 'number' && project.schemaVersion > SCHEMA_VERSION) return fail('UNSUPPORTED_VERSION', '더 새로운 버전에서 만든 작품이라 열 수 없어요.');
  if (project.schemaVersion !== SCHEMA_VERSION) return invalid('작품 파일 버전이 올바르지 않아요.');
  const keys = onlyKeys(project, ['schemaVersion', 'id', 'title', 'revision', 'createdAt', 'updatedAt', 'width', 'height', 'slides', 'assetManifest'], '작품');
  if (keys) return keys;
  if (typeof project.id !== 'string' || !UUID.test(project.id)) return invalid('작품 ID가 올바르지 않아요.');
  if (typeof project.title !== 'string') return invalid('작품 이름이 올바르지 않아요.');
  if (codePoints(project.title) > LIMITS.titleCodePoints) return fail('LIMIT_EXCEEDED', '작품 이름이 너무 길어요.');
  if (!Number.isInteger(project.revision) || project.revision < 0) return invalid('작품 revision이 올바르지 않아요.');
  if (!ISO_DATE.test(project.createdAt) || !ISO_DATE.test(project.updatedAt)) return invalid('작품 날짜가 올바르지 않아요.');
  if (project.width !== LIMITS.slideWidth || project.height !== LIMITS.slideHeight) return invalid('슬라이드 크기가 올바르지 않아요.');
  if (!Array.isArray(project.assetManifest) || !Array.isArray(project.slides)) return invalid('작품 파일 형식이 올바르지 않아요.');

  if (project.assetManifest.length > LIMITS.assets) return fail('LIMIT_EXCEEDED', '사진 자료가 너무 많아요.');
  const assetIds = new Set<string>(); let assetBytes = 0;
  for (const asset of project.assetManifest) {
    const problem = checkAsset(asset);
    if (problem) return problem;
    if (assetIds.has(asset.id)) return fail('ASSET_INVALID', '사진 자료가 중복되어 있어요.');
    assetIds.add(asset.id); assetBytes += asset.byteLength;
  }
  if (assetBytes > LIMITS.assetsTotalBytes) return fail('LIMIT_EXCEEDED', '사진 자료 용량이 너무 커요.');

  const ids = new Set<string>();
  for (const slide of project.slides) {
    if (!slide || typeof slide !== 'object' || !Array.isArray(slide.elements)) return invalid('슬라이드 형식이 올바르지 않아요.');
    const slideKeys = onlyKeys(slide, ['id', 'background', 'elements'], '슬라이드');
    if (slideKeys) return slideKeys;
    if (typeof slide.id !== 'string' || !UUID.test(slide.id) || ids.has(slide.id)) return invalid('슬라이드 ID가 올바르지 않거나 중복되어 있어요.');
    ids.add(slide.id);
    const background = checkBackground(slide.background, project.assetManifest);
    if (background) return background;
  }
  const counts = checkCounts(project.slides);
  if (counts) return counts;
  for (const slide of project.slides) for (const element of slide.elements) {
    const problem = checkElement(element, project.assetManifest);
    if (problem) return problem;
    if (ids.has(element.id)) return invalid('요소 ID가 중복되어 있어요.');
    ids.add(element.id);
  }
  return { ok: true, project };
}
