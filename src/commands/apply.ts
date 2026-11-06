// 계약 §4의 편집 명령. 입력을 검사한 뒤 새 내용을 만들고, 바뀌지 않은 부분은 이전 객체를 그대로 공유한다.
// 잘못된 요청은 부분 적용하지 않는다. DOM에 의존하지 않는다.
import { LIMITS } from '../domain/limits';
import { blankSlide } from '../domain/project';
import { fail, type Asset, type Background, type Failure, type ImageElement, type ProjectContent, type Slide, type SlideElement, type StrokeElement, type TextAlign, type TextElement } from '../domain/types';
import { checkAsset, checkBackground, checkCounts, checkElement, codePoints, elementBounds, isBlankText, normalizeColor, normalizeText } from '../domain/validate';

type TextStyle = { fontId: string; fontSize: number; bold: boolean; color: string; align: TextAlign; lineHeight: number };

export type Command =
  | { type: 'renameProject'; title: string }
  | { type: 'addSlide'; afterSlideId?: string | null }
  | { type: 'duplicateSlide'; slideId: string }
  | { type: 'deleteSlide'; slideId: string }
  | { type: 'clearSlide'; slideId: string }
  | { type: 'reorderSlide'; slideId: string; toIndex: number }
  // 새 사진은 asset을 함께 넘겨 문서의 자료 목록에 같은 작업으로 등록한다. 되돌리면 등록도 함께 되돌아간다.
  | { type: 'setBackground'; slideId: string; background: Background; asset?: Asset }
  | { type: 'addImage'; slideId: string; assetId: string; x: number; y: number; width: number; height: number; asset?: Asset }
  | ({ type: 'addText'; slideId: string; x: number; y: number; width: number; text: string } & TextStyle)
  | { type: 'updateText'; slideId: string; elementId: string; text?: string; width?: number } & Partial<TextStyle>
  | { type: 'addStroke'; slideId: string; x: number; y: number; points: number[]; color: string; strokeWidth: number }
  | { type: 'updateStrokeStyle'; slideId: string; elementId: string; color?: string; strokeWidth?: number }
  | { type: 'moveElement'; slideId: string; elementId: string; x: number; y: number }
  | { type: 'resizeImage'; slideId: string; elementId: string; x: number; y: number; width: number; height: number }
  | { type: 'resizeText'; slideId: string; elementId: string; x: number; y: number; width: number; fontSize: number }
  | { type: 'reorderElement'; slideId: string; elementId: string; toIndex: number }
  | { type: 'duplicateElement'; slideId: string; elementId: string }
  | { type: 'deleteElement'; slideId: string; elementId: string };

export type Applied = { ok: true; content: ProjectContent; slideId: string | null; changed: boolean };
export type ApplyContext = { newId: () => string };

const invalid = (message: string) => fail('INVALID_VALUE', message);
const unchanged = (content: ProjectContent, slideId: string | null): Applied => ({ ok: true, content, slideId, changed: false });
const noSlide = () => invalid('슬라이드를 찾을 수 없어요.');
const noElement = () => invalid('요소를 찾을 수 없어요.');

function replaceSlide(content: ProjectContent, slide: Slide): ProjectContent {
  return { ...content, slides: content.slides.map(item => item.id === slide.id ? slide : item) };
}

function validIndex(index: unknown, length: number) { return Number.isInteger(index) && (index as number) >= 0 && (index as number) < length; }

function move<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next;
}

// 새 사진 자료를 목록에 더한다. 이미 있으면 목록을 그대로 쓴다.
function withAsset(manifest: Asset[], assetId: string, asset?: Asset): { manifest: Asset[] } | Failure {
  if (manifest.some(item => item.id === assetId)) return { manifest };
  if (!asset || asset.id !== assetId) return fail('ASSET_MISSING', '사진 자료를 찾을 수 없어요.');
  const problem = checkAsset(asset);
  if (problem) return problem;
  if (manifest.length + 1 > LIMITS.assets) return fail('LIMIT_EXCEEDED', '사진 자료가 너무 많아요.');
  if (manifest.reduce((sum, item) => sum + item.byteLength, asset.byteLength) > LIMITS.assetsTotalBytes) return fail('LIMIT_EXCEEDED', '사진 자료 용량이 너무 커요.');
  return { manifest: [...manifest, asset] };
}

function samePatch(element: SlideElement, patch: Partial<SlideElement>) {
  return Object.entries(patch).every(([key, value]) => (element as Record<string, unknown>)[key] === value);
}

// 요소 하나를 고친다. 값이 같으면 문서를 그대로 돌려주어 revision·기록을 늘리지 않는다.
function patchElement(content: ProjectContent, slide: Slide, element: SlideElement, patch: Partial<SlideElement>): Applied | Failure {
  if (samePatch(element, patch)) return unchanged(content, slide.id);
  const next = { ...element, ...patch } as SlideElement;
  const problem = checkElement(next, content.assetManifest);
  if (problem) return problem;
  return { ok: true, content: replaceSlide(content, { ...slide, elements: slide.elements.map(item => item === element ? next : item) }), slideId: slide.id, changed: true };
}

function addElement(content: ProjectContent, slide: Slide, element: SlideElement, index = slide.elements.length): Applied | Failure {
  const problem = checkElement(element, content.assetManifest);
  if (problem) return problem;
  const elements = [...slide.elements]; elements.splice(index, 0, element);
  const next = replaceSlide(content, { ...slide, elements });
  const counts = checkCounts(next.slides);
  return counts ?? { ok: true, content: next, slideId: slide.id, changed: true };
}

// 복제본이 전체가 들어가는 크기면 슬라이드 안으로 옮긴다.
function keepInside(element: SlideElement): SlideElement {
  const box = elementBounds(element);
  let dx = 0, dy = 0;
  if (box.right - box.left <= LIMITS.slideWidth) dx = box.left < 0 ? -box.left : box.right > LIMITS.slideWidth ? LIMITS.slideWidth - box.right : 0;
  if (box.bottom - box.top <= LIMITS.slideHeight) dy = box.top < 0 ? -box.top : box.bottom > LIMITS.slideHeight ? LIMITS.slideHeight - box.bottom : 0;
  return { ...element, x: element.x + dx, y: element.y + dy };
}

export function applyCommand(content: ProjectContent, command: Command, context: ApplyContext): Applied | Failure {
  const findSlide = (id: string) => content.slides.find(slide => slide.id === id);

  switch (command.type) {
    case 'renameProject': {
      if (typeof command.title !== 'string') return invalid('작품 이름이 올바르지 않아요.');
      if (codePoints(command.title) > LIMITS.titleCodePoints) return fail('LIMIT_EXCEEDED', '작품 이름이 너무 길어요.');
      if (command.title === content.title) return unchanged(content, null);
      return { ok: true, content: { ...content, title: command.title }, slideId: null, changed: true };
    }
    case 'addSlide': {
      let index = 0;
      if (command.afterSlideId !== undefined && command.afterSlideId !== null) {
        const found = content.slides.findIndex(slide => slide.id === command.afterSlideId);
        if (found < 0) return noSlide();
        index = found + 1;
      }
      const slide = blankSlide(context.newId());
      const slides = [...content.slides]; slides.splice(index, 0, slide);
      const counts = checkCounts(slides);
      return counts ?? { ok: true, content: { ...content, slides }, slideId: slide.id, changed: true };
    }
    case 'duplicateSlide': {
      const index = content.slides.findIndex(slide => slide.id === command.slideId);
      if (index < 0) return noSlide();
      const source = content.slides[index];
      const copy: Slide = { id: context.newId(), background: source.background, elements: source.elements.map(element => ({ ...element, id: context.newId() })) };
      const slides = [...content.slides]; slides.splice(index + 1, 0, copy);
      const counts = checkCounts(slides);
      return counts ?? { ok: true, content: { ...content, slides }, slideId: copy.id, changed: true };
    }
    case 'deleteSlide': {
      const index = content.slides.findIndex(slide => slide.id === command.slideId);
      if (index < 0) return noSlide();
      if (content.slides.length === 1) return invalid('마지막 한 장은 지울 수 없어요. 내용 비우기를 써 주세요.');
      const slides = content.slides.filter(slide => slide.id !== command.slideId);
      return { ok: true, content: { ...content, slides }, slideId: slides[Math.min(index, slides.length - 1)].id, changed: true };
    }
    case 'clearSlide': {
      const slide = findSlide(command.slideId);
      if (!slide) return noSlide();
      if (!slide.elements.length && slide.background.kind === 'solid' && slide.background.color === '#FFFFFF') return unchanged(content, slide.id);
      return { ok: true, content: replaceSlide(content, blankSlide(slide.id)), slideId: slide.id, changed: true };
    }
    case 'reorderSlide': {
      const index = content.slides.findIndex(slide => slide.id === command.slideId);
      if (index < 0) return noSlide();
      if (!validIndex(command.toIndex, content.slides.length)) return invalid('옮길 위치가 올바르지 않아요.');
      if (index === command.toIndex) return unchanged(content, command.slideId);
      return { ok: true, content: { ...content, slides: move(content.slides, index, command.toIndex) }, slideId: command.slideId, changed: true };
    }
    case 'setBackground': {
      const slide = findSlide(command.slideId);
      if (!slide) return noSlide();
      const background: Background = command.background?.kind === 'solid' ? { ...command.background, color: normalizeColor(command.background.color) } : command.background;
      let manifest = content.assetManifest;
      if (background?.kind === 'image') {
        const added = withAsset(manifest, background.assetId, command.asset);
        if ('ok' in added) return added;
        manifest = added.manifest;
      }
      const problem = checkBackground(background, manifest);
      if (problem) return problem;
      if (JSON.stringify(background) === JSON.stringify(slide.background)) return unchanged(content, slide.id);
      return { ok: true, content: { ...replaceSlide(content, { ...slide, background }), assetManifest: manifest }, slideId: slide.id, changed: true };
    }
    case 'addImage': {
      const slide = findSlide(command.slideId);
      if (!slide) return noSlide();
      const added = withAsset(content.assetManifest, command.assetId, command.asset);
      if ('ok' in added) return added;
      const element: ImageElement = { id: context.newId(), type: 'image', x: command.x, y: command.y, width: command.width, height: command.height, assetId: command.assetId };
      return addElement({ ...content, assetManifest: added.manifest }, slide, element);
    }
    case 'addText': {
      const slide = findSlide(command.slideId);
      if (!slide) return noSlide();
      const element: TextElement = { id: context.newId(), type: 'text', x: command.x, y: command.y, width: command.width, text: normalizeText(String(command.text ?? '')), fontId: command.fontId, fontSize: command.fontSize, bold: command.bold, color: normalizeColor(command.color), align: command.align, lineHeight: command.lineHeight };
      return addElement(content, slide, element);
    }
    case 'updateText': {
      const slide = findSlide(command.slideId);
      if (!slide) return noSlide();
      const element = slide.elements.find(item => item.id === command.elementId);
      if (!element) return noElement();
      if (element.type !== 'text') return invalid('글씨가 아닌 요소예요.');
      const { type: _type, slideId: _slideId, elementId: _elementId, ...patch } = command;
      if (patch.text !== undefined) {
        patch.text = normalizeText(String(patch.text));
        // 내용을 모두 지우면 같은 작업에서 요소를 삭제해 취소 한 번으로 되돌린다.
        if (isBlankText(patch.text)) return { ok: true, content: replaceSlide(content, { ...slide, elements: slide.elements.filter(item => item !== element) }), slideId: slide.id, changed: true };
      }
      if (patch.color !== undefined) patch.color = normalizeColor(patch.color);
      return patchElement(content, slide, element, patch as Partial<TextElement>);
    }
    case 'addStroke': {
      const slide = findSlide(command.slideId);
      if (!slide) return noSlide();
      const element: StrokeElement = { id: context.newId(), type: 'stroke', x: command.x, y: command.y, points: command.points, color: normalizeColor(command.color), strokeWidth: command.strokeWidth };
      return addElement(content, slide, element);
    }
    case 'updateStrokeStyle': {
      const slide = findSlide(command.slideId);
      if (!slide) return noSlide();
      const element = slide.elements.find(item => item.id === command.elementId);
      if (!element) return noElement();
      if (element.type !== 'stroke') return invalid('그림이 아닌 요소예요.');
      const patch: Partial<StrokeElement> = {};
      if (command.color !== undefined) patch.color = normalizeColor(command.color);
      if (command.strokeWidth !== undefined) patch.strokeWidth = command.strokeWidth;
      return patchElement(content, slide, element, patch);
    }
    case 'moveElement': {
      const slide = findSlide(command.slideId);
      if (!slide) return noSlide();
      const element = slide.elements.find(item => item.id === command.elementId);
      if (!element) return noElement();
      return patchElement(content, slide, element, { x: command.x, y: command.y });
    }
    case 'resizeImage': {
      const slide = findSlide(command.slideId);
      if (!slide) return noSlide();
      const element = slide.elements.find(item => item.id === command.elementId);
      if (!element) return noElement();
      if (element.type !== 'image') return invalid('사진이 아닌 요소예요.');
      return patchElement(content, slide, element, { x: command.x, y: command.y, width: command.width, height: command.height } as Partial<ImageElement>);
    }
    case 'resizeText': {
      const slide = findSlide(command.slideId);
      if (!slide) return noSlide();
      const element = slide.elements.find(item => item.id === command.elementId);
      if (!element) return noElement();
      if (element.type !== 'text') return invalid('글씨가 아닌 요소예요.');
      return patchElement(content, slide, element, { x: command.x, y: command.y, width: command.width, fontSize: command.fontSize } as Partial<TextElement>);
    }
    case 'reorderElement': {
      const slide = findSlide(command.slideId);
      if (!slide) return noSlide();
      const index = slide.elements.findIndex(item => item.id === command.elementId);
      if (index < 0) return noElement();
      if (!validIndex(command.toIndex, slide.elements.length)) return invalid('옮길 위치가 올바르지 않아요.');
      if (index === command.toIndex) return unchanged(content, slide.id);
      return { ok: true, content: replaceSlide(content, { ...slide, elements: move(slide.elements, index, command.toIndex) }), slideId: slide.id, changed: true };
    }
    case 'duplicateElement': {
      const slide = findSlide(command.slideId);
      if (!slide) return noSlide();
      const index = slide.elements.findIndex(item => item.id === command.elementId);
      if (index < 0) return noElement();
      const source = slide.elements[index];
      // 뒤쪽이 앞에 그려지므로 원본 바로 앞은 배열의 다음 위치다.
      return addElement(content, slide, keepInside({ ...source, id: context.newId(), x: source.x + 20, y: source.y + 20 }), index + 1);
    }
    case 'deleteElement': {
      const slide = findSlide(command.slideId);
      if (!slide) return noSlide();
      if (!slide.elements.some(item => item.id === command.elementId)) return noElement();
      return { ok: true, content: replaceSlide(content, { ...slide, elements: slide.elements.filter(item => item.id !== command.elementId) }), slideId: slide.id, changed: true };
    }
    default: return invalid('알 수 없는 명령이에요.');
  }
}
