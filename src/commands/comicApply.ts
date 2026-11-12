// 만화 계약 §4의 편집 명령. 슬라이드 명령 18개는 슬라이드의 applyCommand에 그대로 맡긴 뒤 말풍선 짝을 맞춘다.
// 새 명령은 칸 배치(setComicLayout)와 말풍선 넣기(addBubble) 둘이다. 잘못된 요청은 부분 적용하지 않는다. DOM에 의존하지 않는다.
import { carryBubble, followBubble } from '../domain/comicBubbles';
import type { Bubbles, ComicContent, ComicLayout } from '../domain/comicTypes';
import { isComicLayout } from '../domain/comicValidate';
import { fail, type Asset, type Failure, type ImageElement, type ProjectContent, type Slide, type SlideElement, type TextAlign, type TextElement } from '../domain/types';
import { checkCounts, checkElement, isBlankText } from '../domain/validate';
import { applyCommand, type ApplyContext, type Command } from './apply';

export type BubbleText = { x: number; y: number; width: number; text: string; fontId: string; fontSize: number; bold: boolean; color: string; align: TextAlign; lineHeight: number };
export type ComicCommand = Command
  | { type: 'setComicLayout'; layout: ComicLayout }
  // 말풍선 그림(사진 요소)과 그 안의 글씨를 한 번에 넣고 짝으로 적는다. 새 그림은 asset을 함께 넘긴다(addImage와 같다).
  | { type: 'addBubble'; slideId: string; assetId: string; asset?: Asset; x: number; y: number; width: number; height: number; text: BubbleText };

export type ComicApplied = { ok: true; content: ComicContent; slideId: string | null; changed: boolean };
const invalid = (message: string) => fail('INVALID_VALUE', message);
const slidePart = (content: ComicContent): ProjectContent => ({ title: content.title, slides: content.slides, assetManifest: content.assetManifest });
const sameOrder = (a: readonly SlideElement[], b: readonly SlideElement[]) => a.length === b.length && a.every((element, index) => element.id === b[index].id);
const withSlide = (slides: readonly Slide[], slide: Slide) => slides.map(item => item.id === slide.id ? slide : item);

type Reconciled = { slides: Slide[]; bubbles: Bubbles } | 'unchanged' | Failure;

// 없어진 요소를 가리키는 짝, 둘이 다른 칸에 있는 짝을 뺀다. 뺄 것이 없으면 같은 객체를 돌려준다.
function prune(bubbles: Bubbles, slides: readonly Slide[]): Bubbles {
  const pairs = Object.entries(bubbles);
  if (!pairs.length) return bubbles;
  const where = new Map<string, string>();
  for (const slide of slides) for (const element of slide.elements) where.set(element.id, slide.id);
  const kept = pairs.filter(([imageId, textId]) => where.has(imageId) && where.get(imageId) === where.get(textId));
  return kept.length === pairs.length ? bubbles : Object.fromEntries(kept);
}

// 슬라이드 명령을 적용한 뒤의 장(after)에 짝 규칙을 적용한다. before는 명령 전 내용이다.
function reconcile(before: ComicContent, after: ProjectContent, command: Command, resultSlideId: string | null, context: ApplyContext): Reconciled {
  const bubbles = before.bubbles;
  let slides = after.slides;
  if (!Object.keys(bubbles).length) return { slides, bubbles };
  const textOwner = (textId: string) => Object.keys(bubbles).find(imageId => bubbles[imageId] === textId);

  switch (command.type) {
    case 'moveElement': case 'resizeImage': {
      const textId = bubbles[command.elementId];
      const slide = slides.find(item => item.id === command.slideId);
      const old = before.slides.find(item => item.id === command.slideId)?.elements.find(item => item.id === command.elementId);
      const moved = slide?.elements.find(item => item.id === command.elementId);
      const text = slide?.elements.find(item => item.id === textId);
      if (slide && command.type === 'moveElement' && old?.type === 'text' && moved?.type === 'text') {
        // 짝 글씨를 옮기면 말풍선 그림도 같은 거리만큼 옮긴다.
        const image = slide.elements.find(item => item.id === textOwner(command.elementId));
        if (image?.type !== 'image') break;
        const carried = carryBubble(old, moved, image);
        if (carried === image) break;
        const problem = checkElement(carried, after.assetManifest);
        if (problem) return problem;
        slides = withSlide(slides, { ...slide, elements: slide.elements.map(item => item === image ? carried : item) });
        break;
      }
      if (!textId || !slide || old?.type !== 'image' || moved?.type !== 'image' || text?.type !== 'text') break;
      const followed = followBubble(old, moved, text);
      if (followed === text) break;
      const problem = checkElement(followed, after.assetManifest);
      if (problem) return problem;
      slides = withSlide(slides, { ...slide, elements: slide.elements.map(item => item === text ? followed : item) });
      break;
    }
    case 'deleteElement': {
      // 말풍선 그림을 지우면 짝 글씨도 지운다. 글씨만 지운 경우는 아래 prune이 짝을 뺀다.
      const textId = bubbles[command.elementId];
      const slide = slides.find(item => item.id === command.slideId);
      if (textId && slide) slides = withSlide(slides, { ...slide, elements: slide.elements.filter(item => item.id !== textId) });
      break;
    }
    case 'duplicateElement': {
      const textId = bubbles[command.elementId];
      const slide = slides.find(item => item.id === command.slideId);
      if (!textId || !slide) break;
      const index = slide.elements.findIndex(item => item.id === command.elementId);
      const source = slide.elements[index], copy = slide.elements[index + 1];
      const text = slide.elements.find(item => item.id === textId);
      if (source?.type !== 'image' || copy?.type !== 'image' || text?.type !== 'text') break;
      // 글씨 복제본은 사진 복제본이 옮겨진 만큼 옮겨 그 바로 앞에 넣는다.
      const textCopy: TextElement = { ...followBubble(source, copy, text), id: context.newId() };
      const problem = checkElement(textCopy, after.assetManifest);
      if (problem) return problem;
      const elements = [...slide.elements]; elements.splice(index + 2, 0, textCopy);
      slides = withSlide(slides, { ...slide, elements });
      const counts = checkCounts(slides);
      if (counts) return counts;
      return { slides, bubbles: { ...bubbles, [copy.id]: textCopy.id } };
    }
    case 'reorderElement': {
      const slide = slides.find(item => item.id === command.slideId);
      const original = before.slides.find(item => item.id === command.slideId);
      if (!slide || !original) break;
      const pairedText = bubbles[command.elementId];
      let elements: SlideElement[] | null = null;
      if (pairedText) {
        // 사진과 글씨를 한 묶음으로 옮긴다. 다른 요소들 사이에서 사진이 놓일 자리를 세고, 자기 글씨만 건너뛴 요청이면 하나 더 건너뛴다.
        const image = slide.elements.find(item => item.id === command.elementId), text = slide.elements.find(item => item.id === pairedText);
        if (!image || !text) break;
        const othersBefore = (list: readonly SlideElement[]) => list.slice(0, list.findIndex(item => item.id === command.elementId)).filter(item => item.id !== pairedText).length;
        const from = othersBefore(original.elements); let to = othersBefore(slide.elements);
        const others = slide.elements.filter(item => item !== image && item !== text);
        if (to === from) to += command.toIndex > original.elements.findIndex(item => item.id === command.elementId) ? 1 : -1;
        to = Math.min(others.length, Math.max(0, to));
        elements = [...others.slice(0, to), image, text, ...others.slice(to)];
      } else {
        // 짝 글씨가 자기 말풍선보다 뒤로 가면 말풍선 바로 앞으로 되돌린다.
        const imageId = textOwner(command.elementId);
        const imageIndex = slide.elements.findIndex(item => item.id === imageId), textIndex = slide.elements.findIndex(item => item.id === command.elementId);
        if (!imageId || imageIndex < 0 || textIndex > imageIndex) break;
        const text = slide.elements[textIndex];
        elements = slide.elements.filter(item => item !== text);
        elements.splice(elements.findIndex(item => item.id === imageId) + 1, 0, text);
      }
      if (sameOrder(elements, original.elements)) return 'unchanged';
      slides = withSlide(slides, { ...slide, elements });
      break;
    }
    case 'duplicateSlide': {
      // 복제된 칸의 요소는 id가 새로 생긴다. 원래 칸과 요소 순서가 같으므로 순서로 맞춰 새 짝을 만든다.
      const source = before.slides.find(item => item.id === command.slideId);
      const copy = slides.find(item => item.id === resultSlideId);
      if (!source || !copy) break;
      const added: Record<string, string> = {};
      source.elements.forEach((element, index) => {
        const textIndex = bubbles[element.id] ? source.elements.findIndex(item => item.id === bubbles[element.id]) : -1;
        if (textIndex >= 0) added[copy.elements[index].id] = copy.elements[textIndex].id;
      });
      if (Object.keys(added).length) return { slides, bubbles: { ...bubbles, ...added } };
      break;
    }
    default: break;
  }
  return { slides, bubbles: prune(bubbles, slides) };
}

export function applyComicCommand(content: ComicContent, command: ComicCommand, context: ApplyContext): ComicApplied | Failure {
  if (command.type === 'setComicLayout') {
    if (!isComicLayout(command.layout)) return invalid('칸 배치가 올바르지 않아요.');
    if (command.layout === content.layout) return { ok: true, content, slideId: null, changed: false };
    return { ok: true, content: { ...content, layout: command.layout }, slideId: null, changed: true };
  }
  if (command.type === 'addBubble') {
    if (!command.text || typeof command.text.text !== 'string' || isBlankText(command.text.text)) return invalid('말풍선 글씨가 비었어요.');
    const image = applyCommand(slidePart(content), { type: 'addImage', slideId: command.slideId, assetId: command.assetId, asset: command.asset, x: command.x, y: command.y, width: command.width, height: command.height }, context);
    if (!image.ok) return image;
    const text = applyCommand(image.content, { type: 'addText', slideId: command.slideId, ...command.text }, context);
    if (!text.ok) return text;
    const [imageElement, textElement] = text.content.slides.find(slide => slide.id === command.slideId)!.elements.slice(-2) as [ImageElement, TextElement];
    return { ok: true, content: { ...content, ...text.content, bubbles: { ...content.bubbles, [imageElement.id]: textElement.id } }, slideId: command.slideId, changed: true };
  }
  // 슬라이드 명령: 슬라이드와 같은 세 필드만 넘기고 결과를 다시 합친다. apply.ts는 만화 필드를 알지 못한다.
  const result = applyCommand(slidePart(content), command, context);
  if (!result.ok) return result;
  if (!result.changed) return { ok: true, content, slideId: result.slideId, changed: false };
  const reconciled = reconcile(content, result.content, command, result.slideId, context);
  if (reconciled === 'unchanged') return { ok: true, content, slideId: result.slideId, changed: false };
  if ('ok' in reconciled) return reconciled;
  return { ok: true, content: { ...content, ...result.content, slides: reconciled.slides, bubbles: reconciled.bubbles }, slideId: result.slideId, changed: true };
}
