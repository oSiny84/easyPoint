import { test, expect } from '@playwright/test';
import type { Command } from '../../src/commands/apply';
import type { BubbleText, ComicCommand } from '../../src/commands/comicApply';
import { pageCount, pageLayout, pageOfPanel, panelsPerPage } from '../../src/comic/pageLayout';
import { carryBubble, followBubble } from '../../src/domain/comicBubbles';
import { createComicProject } from '../../src/domain/comicProject';
import type { ComicLayout } from '../../src/domain/comicTypes';
import { validateComicProject } from '../../src/domain/comicValidate';
import { DEFAULT_FONT_ID, LIMITS } from '../../src/domain/limits';
import type { Asset, ImageElement, TextElement } from '../../src/domain/types';
import { createComicStore, estimateComicBytes } from '../../src/state/comicStore';
import { createStore } from '../../src/state/store';
import { comicContent, idSequence, loadComicSample } from './comicHelpers';
import { clock, contentOf, ids, loadSample } from './helpers';

// 만화 계약 §4: 슬라이드 명령 18개는 슬라이드와 같은 결과를 내고 말풍선 짝만 맞춘다. 새 명령은 setComicLayout·addBubble 둘이다.
const NEW_ASSET: Asset = { id: 'a'.repeat(64), mime: 'image/png', pixelWidth: 512, pixelHeight: 400, byteLength: 1000 };
const textStyle = { fontId: DEFAULT_FONT_ID, fontSize: 36, bold: false, color: '#112233', align: 'left' as const, lineHeight: 1.3 };
const bubbleText: BubbleText = { x: 170, y: 150, width: 300, text: '말을 써요', fontId: 'round-jua', fontSize: 36, bold: false, color: '#1F2933', align: 'center', lineHeight: 1.3 };
const bubble = (slideId: string, extra: Partial<Extract<ComicCommand, { type: 'addBubble' }>> = {}): ComicCommand => ({ type: 'addBubble', slideId, assetId: NEW_ASSET.id, asset: NEW_ASSET, x: 100, y: 100, width: 440, height: 343.75, text: bubbleText, ...extra });
const start = (project = loadComicSample(), options = {}) => createComicStore(project, { newId: idSequence(), now: clock(), ...options });
type Store = ReturnType<typeof createComicStore>;
const run = (store: Store, command: ComicCommand) => { const p = store.getProject(); return store.dispatch(p.id, p.revision, command); };
const slideOf = (store: Store, slideId: string) => store.getProject().slides.find(slide => slide.id === slideId)!;
const element = <T extends ImageElement | TextElement>(store: Store, slideId: string, elementId: string) => slideOf(store, slideId).elements.find(item => item.id === elementId) as T;
const order = (store: Store, slideId: string) => slideOf(store, slideId).elements.map(item => item.id);
const valid = (store: Store) => expect(validateComicProject(store.getProject())).toMatchObject({ ok: true });
// 한 번 되돌리면 명령 전과 같고, 다시 하면 명령 뒤와 같다.
function undoRedo(store: Store, before: unknown) {
  const after = comicContent(store.getProject());
  expect(store.undo()).toMatchObject({ ok: true, changed: true });
  expect(comicContent(store.getProject())).toEqual(before);
  expect(store.redo()).toMatchObject({ ok: true, changed: true });
  expect(comicContent(store.getProject())).toEqual(after);
}

// 슬라이드 계약 §4 표의 18개 명령(tests/contracts/commands.spec.ts와 같은 입력).
const slideCommands: Record<string, Command> = {
  renameProject: { type: 'renameProject', title: '새 이름' },
  addSlide: { type: 'addSlide', afterSlideId: ids.slide1 },
  duplicateSlide: { type: 'duplicateSlide', slideId: ids.slide1 },
  deleteSlide: { type: 'deleteSlide', slideId: ids.slide3 },
  clearSlide: { type: 'clearSlide', slideId: ids.slide1 },
  reorderSlide: { type: 'reorderSlide', slideId: ids.slide1, toIndex: 2 },
  setBackground: { type: 'setBackground', slideId: ids.slide1, background: { kind: 'solid', color: '#abcdef' } },
  addImage: { type: 'addImage', slideId: ids.slide4, assetId: NEW_ASSET.id, asset: NEW_ASSET, x: 10, y: 10, width: 512, height: 400 },
  addText: { type: 'addText', slideId: ids.slide4, x: 10, y: 10, width: 400, text: '안녕', ...textStyle },
  updateText: { type: 'updateText', slideId: ids.slide1, elementId: ids.title, text: '바뀐 제목', bold: false },
  addStroke: { type: 'addStroke', slideId: ids.slide4, x: 10, y: 10, points: [0, 0, 10, 10], color: '#123456', strokeWidth: 8 },
  updateStrokeStyle: { type: 'updateStrokeStyle', slideId: ids.slide1, elementId: ids.stroke1, color: '#000000', strokeWidth: 3 },
  moveElement: { type: 'moveElement', slideId: ids.slide1, elementId: ids.photo1, x: 100, y: 100 },
  resizeImage: { type: 'resizeImage', slideId: ids.slide1, elementId: ids.photo1, x: 100, y: 100, width: 200, height: 150 },
  resizeText: { type: 'resizeText', slideId: ids.slide1, elementId: ids.title, x: 80, y: 60, width: 600, fontSize: 48 },
  reorderElement: { type: 'reorderElement', slideId: ids.slide1, elementId: ids.photo1, toIndex: 3 },
  duplicateElement: { type: 'duplicateElement', slideId: ids.slide1, elementId: ids.photo1 },
  deleteElement: { type: 'deleteElement', slideId: ids.slide1, elementId: ids.photo1 },
};

test('슬라이드 명령 목록이 계약의 18개와 같다', () => expect(Object.keys(slideCommands).length).toBe(18));

for (const [name, command] of Object.entries(slideCommands)) test(`${name}: 짝이 없는 작품에서는 슬라이드 저장소와 같은 결과를 내고, 실행 → 취소 → 다시 실행이 된다`, () => {
  const store = start(loadComicSample(false)); const original = store.getProject(); const before = comicContent(original);
  const slideStore = createStore(loadSample(), { newId: idSequence(), now: clock() });
  const slideProject = slideStore.getProject();
  const expected = slideStore.dispatch(slideProject.id, slideProject.revision, command);
  const applied = run(store, command);
  expect(applied).toEqual(expected);
  expect(applied).toMatchObject({ ok: true, changed: true, revision: 1 });
  expect(contentOf(store.getProject())).toEqual(contentOf(slideStore.getProject()));
  valid(store);
  // 만화 설정은 슬라이드 명령으로 바뀌지 않는다.
  expect(store.getProject()).toMatchObject({ kind: 'comic', layout: 'grid4', bubbles: {} });
  expect(comicContent(original)).toEqual(before);
  undoRedo(store, before);
});

for (const [name, command] of Object.entries(slideCommands)) test(`${name}: 짝이 있는 작품에서도 결과가 검사를 통과하고 한 번에 되돌아간다`, () => {
  const store = start(); const before = comicContent(store.getProject());
  expect(run(store, command)).toMatchObject({ ok: true, changed: true, revision: 1 });
  valid(store);
  undoRedo(store, before);
});

test('슬라이드 명령의 실패는 그대로 전달되고 문서를 바꾸지 않는다', () => {
  const store = start(); const before = store.getProject();
  expect(run(store, { type: 'deleteSlide', slideId: 'nope' })).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  expect(run(store, { type: 'renameProject', title: '가'.repeat(101) })).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED' });
  expect(run(store, { type: 'addImage', slideId: ids.slide4, assetId: 'b'.repeat(64), x: 0, y: 0, width: 10, height: 10 })).toMatchObject({ ok: false, code: 'ASSET_MISSING' });
  expect(store.getProject()).toBe(before);
  expect(store.canUndo()).toBe(false);
});

test('변화 없는 슬라이드 명령은 revision·기록·bubbles 객체를 그대로 둔다', () => {
  const store = start(); const before = store.getProject();
  expect(run(store, { type: 'renameProject', title: before.title })).toMatchObject({ ok: true, changed: false, revision: 0 });
  expect(store.getProject()).toBe(before);
  // 짝과 상관없는 요소를 옮기면 bubbles 객체와 다른 칸은 그대로다.
  run(store, { type: 'moveElement', slideId: ids.slide1, elementId: ids.title, x: 1, y: 1 });
  expect(store.getProject().bubbles).toBe(before.bubbles);
  expect(store.getProject().slides[1]).toBe(before.slides[1]);
});

// ---- setComicLayout ----
for (const layout of ['rows3', 'grid8'] as const) test(`setComicLayout ${layout}: 실행 → 취소 → 다시 실행, 칸과 짝은 그대로`, () => {
  const store = start(); const before = comicContent(store.getProject());
  expect(run(store, { type: 'setComicLayout', layout })).toEqual({ ok: true, revision: 1, slideId: null, changed: true });
  expect(store.getProject().layout).toBe(layout);
  expect(comicContent(store.getProject()).slides).toEqual(before.slides);
  expect(store.getProject().bubbles).toEqual(before.bubbles);
  valid(store);
  undoRedo(store, before);
});

test('setComicLayout: 지금과 같은 값은 변화 없는 명령이다', () => {
  const store = start(); const before = store.getProject();
  expect(run(store, { type: 'setComicLayout', layout: 'grid4' })).toEqual({ ok: true, revision: 0, slideId: null, changed: false });
  expect(store.getProject()).toBe(before); expect(store.canUndo()).toBe(false);
});

for (const [name, layout] of [['모르는 이름', 'grid6'], ['숫자', 4], ['없음', undefined], ['null', null]] as const) test(`setComicLayout 실패: ${name}`, () => {
  const store = start(); const before = store.getProject();
  expect(run(store, { type: 'setComicLayout', layout: layout as unknown as ComicLayout })).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  expect(store.getProject()).toBe(before);
});

// ---- addBubble ----
test('addBubble: 사진과 글씨를 칸의 맨 앞에 넣고 짝으로 적는다. 되돌리기 한 번에 둘 다 사라진다', () => {
  const store = start(loadComicSample(false)); const before = comicContent(store.getProject());
  expect(run(store, bubble(ids.slide4))).toEqual({ ok: true, revision: 1, slideId: ids.slide4, changed: true });
  const [image, text] = slideOf(store, ids.slide4).elements;
  expect(slideOf(store, ids.slide4).elements).toHaveLength(2);
  expect(image).toMatchObject({ type: 'image', assetId: NEW_ASSET.id, x: 100, y: 100, width: 440, height: 343.75 });
  expect(text).toMatchObject({ type: 'text', ...bubbleText });
  expect(store.getProject().bubbles).toEqual({ [image.id]: text.id });
  expect(store.getProject().assetManifest.at(-1)).toEqual(NEW_ASSET);
  valid(store);
  undoRedo(store, before);
  store.undo();
  expect(store.getProject().assetManifest).toHaveLength(2);
  expect(store.canUndo()).toBe(false);
});

test('addBubble: 다른 요소가 있는 칸에서는 그 위에 놓이고, 이미 있는 그림 자료는 다시 넘기지 않아도 된다', () => {
  const store = start();
  run(store, bubble(ids.slide1));
  expect(order(store, ids.slide1).slice(0, 6)).toEqual(loadSample().slides[0].elements.map(item => item.id));
  expect(run(store, bubble(ids.slide1, { asset: undefined, x: 300 }))).toMatchObject({ ok: true, changed: true });
  expect(Object.keys(store.getProject().bubbles)).toHaveLength(3);
  expect(store.getProject().assetManifest).toHaveLength(3);
  valid(store);
});

const badBubbles: [string, ComicCommand, string][] = [
  ['없는 칸', bubble('nope'), 'INVALID_VALUE'],
  ['그림 자료 없음', bubble(ids.slide4, { asset: undefined }), 'ASSET_MISSING'],
  ['빈 글씨', bubble(ids.slide4, { text: { ...bubbleText, text: '  \n ' } }), 'INVALID_VALUE'],
  ['글씨 정보 없음', bubble(ids.slide4, { text: undefined as unknown as BubbleText }), 'INVALID_VALUE'],
  ['등록되지 않은 글꼴', bubble(ids.slide4, { text: { ...bubbleText, fontId: 'comic-sans' } }), 'INVALID_VALUE'],
  ['비율이 다른 그림 크기', bubble(ids.slide4, { height: 100 }), 'INVALID_VALUE'],
];
for (const [name, command, code] of badBubbles) test(`addBubble 실패: ${name}. 사진만 들어간 채로 남지 않는다`, () => {
  const store = start(); const before = store.getProject();
  expect(run(store, command)).toMatchObject({ ok: false, code });
  expect(store.getProject()).toBe(before);
});

// ---- 짝 맞추기(계약 §4 표) ----
test('짝이 있는 사진을 옮기면 글씨가 같은 거리만큼 따라온다', () => {
  const store = start(); const before = comicContent(store.getProject());
  const text = element<TextElement>(store, ids.slide1, ids.body);
  expect(run(store, { type: 'moveElement', slideId: ids.slide1, elementId: ids.photo1, x: 700, y: 260 })).toMatchObject({ ok: true, changed: true, revision: 1 });
  expect(element(store, ids.slide1, ids.photo1)).toMatchObject({ x: 700, y: 260 });
  expect(element(store, ids.slide1, ids.body)).toMatchObject({ x: text.x - 60, y: text.y + 60, width: text.width, fontSize: text.fontSize });
  // 짝이 아닌 요소는 그대로다.
  expect(element(store, ids.slide1, ids.title)).toEqual(loadSample().slides[0].elements[2]);
  valid(store);
  undoRedo(store, before);
});

test('짝 글씨를 옮기면 말풍선 그림도 같은 거리만큼 움직인다', () => {
  const store = start(); const before = comicContent(store.getProject());
  // 글씨 80,200 → 100,260. 사진 760,200 → 780,260.
  expect(run(store, { type: 'moveElement', slideId: ids.slide1, elementId: ids.body, x: 100, y: 260 })).toMatchObject({ ok: true, changed: true, revision: 1 });
  expect(element(store, ids.slide1, ids.body)).toMatchObject({ x: 100, y: 260 });
  expect(element(store, ids.slide1, ids.photo1)).toMatchObject({ x: 780, y: 260, width: 400, height: 300 });
  expect(store.getProject().bubbles).toEqual({ [ids.photo1]: ids.body });
  valid(store);
  undoRedo(store, before);
});

test('짝 글씨의 상자 크기를 바꾸면 글씨만 바뀐다. 따라간 그림이 칸 밖으로 완전히 나가는 이동은 실패한다', () => {
  const store = start(); const photo = element(store, ids.slide1, ids.photo1);
  run(store, { type: 'resizeText', slideId: ids.slide1, elementId: ids.body, x: 120, y: 210, width: 500, fontSize: 30 });
  expect(element(store, ids.slide1, ids.body)).toMatchObject({ x: 120, y: 210, width: 500, fontSize: 30 });
  expect(element(store, ids.slide1, ids.photo1)).toBe(photo);
  const before = store.getProject();
  // 글씨를 오른쪽으로 600 옮기면 그림(760 + 600)은 칸 오른쪽 밖으로 완전히 나간다.
  expect(run(store, { type: 'moveElement', slideId: ids.slide1, elementId: ids.body, x: 720, y: 210 })).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  expect(store.getProject()).toBe(before);
});

test('짝이 있는 사진의 크기를 바꾸면 글씨의 자리와 너비가 같은 배율로 바뀌고 글씨 크기는 그대로다', () => {
  const store = start(); const before = comicContent(store.getProject());
  // 사진 760,200 400×300 → 660,150 600×450 (1.5배). 글씨 80,200 너비 620.
  run(store, { type: 'resizeImage', slideId: ids.slide1, elementId: ids.photo1, x: 660, y: 150, width: 600, height: 450 });
  expect(element(store, ids.slide1, ids.body)).toMatchObject({ x: 660 + (80 - 760) * 1.5, y: 150 + (200 - 200) * 1.5, width: 930, fontSize: 36 });
  valid(store);
  undoRedo(store, before);
});

test('글씨가 칸 밖으로 완전히 나가게 되는 이동은 명령 전체가 실패한다', () => {
  const store = start(); const before = store.getProject();
  // 사진은 칸에 걸쳐 있지만 글씨는 왼쪽 밖으로 완전히 나간다.
  expect(run(store, { type: 'moveElement', slideId: ids.slide1, elementId: ids.photo1, x: -300, y: 200 })).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  expect(store.getProject()).toBe(before);
  expect(store.canUndo()).toBe(false);
});

test('followBubble: 좌표와 너비는 허용 범위 끝에서 멈추고, 바뀐 것이 없으면 같은 객체를 돌려준다', () => {
  const photo = loadSample().slides[0].elements[0] as ImageElement, text = loadSample().slides[0].elements[3] as TextElement;
  expect(followBubble(photo, photo, text)).toBe(text);
  expect(followBubble(photo, { ...photo, x: -1200 }, text).x).toBe(LIMITS.xMin);
  expect(followBubble(photo, { ...photo, y: 1300 }, { ...text, y: 600 }).y).toBe(LIMITS.yMax);
  expect(followBubble(photo, { ...photo, width: 1200, height: 900 }, text).width).toBe(LIMITS.textWidthMax);
  expect(followBubble(photo, { ...photo, width: 4, height: 3 }, text).width).toBe(LIMITS.textWidthMin);
  expect(carryBubble(text, text, photo)).toBe(photo);
  expect(carryBubble(text, { ...text, x: text.x + 5000 }, photo).x).toBe(LIMITS.xMax);
  expect(carryBubble(text, { ...text, y: text.y - 5000 }, photo).y).toBe(LIMITS.yMin);
});

test('짝이 있는 사진을 지우면 글씨도 지워지고, 되돌리면 둘과 짝이 함께 돌아온다', () => {
  const store = start(); const before = comicContent(store.getProject());
  expect(run(store, { type: 'deleteElement', slideId: ids.slide1, elementId: ids.photo1 })).toMatchObject({ ok: true, changed: true });
  expect(order(store, ids.slide1)).toEqual([ids.stroke1, ids.title, '00000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000016']);
  expect(store.getProject().bubbles).toEqual({});
  valid(store);
  undoRedo(store, before);
});

test('짝 글씨를 지우거나 내용을 비우면 글씨만 사라지고 짝이 빠진다. 사진은 남는다', () => {
  for (const command of [{ type: 'deleteElement', slideId: ids.slide1, elementId: ids.body }, { type: 'updateText', slideId: ids.slide1, elementId: ids.body, text: '   ' }] as ComicCommand[]) {
    const store = start(); const before = comicContent(store.getProject());
    expect(run(store, command)).toMatchObject({ ok: true, changed: true });
    expect(order(store, ids.slide1)).toContain(ids.photo1);
    expect(order(store, ids.slide1)).not.toContain(ids.body);
    expect(store.getProject().bubbles).toEqual({});
    valid(store);
    undoRedo(store, before);
  }
});

test('짝이 있는 사진을 복제하면 글씨도 복제되어 사진 복제본 바로 앞에 놓이고 복제본끼리 짝이 된다', () => {
  const store = start(); const before = comicContent(store.getProject());
  expect(run(store, { type: 'duplicateElement', slideId: ids.slide1, elementId: ids.photo1 })).toMatchObject({ ok: true, changed: true, revision: 1 });
  const elements = slideOf(store, ids.slide1).elements;
  expect(elements).toHaveLength(8);
  const [source, copy, textCopy] = elements;
  expect(source.id).toBe(ids.photo1);
  expect(copy).toMatchObject({ type: 'image', x: 780, y: 220 });
  expect(textCopy).toMatchObject({ type: 'text', x: 100, y: 220, width: 620, text: (loadSample().slides[0].elements[3] as TextElement).text });
  expect(store.getProject().bubbles).toEqual({ [ids.photo1]: ids.body, [copy.id]: textCopy.id });
  expect(new Set(elements.map(item => item.id)).size).toBe(8);
  valid(store);
  undoRedo(store, before);
});

test('짝 글씨를 복제하면 글씨만 복제되고 복제본은 짝이 없다', () => {
  const store = start();
  run(store, { type: 'duplicateElement', slideId: ids.slide1, elementId: ids.body });
  expect(slideOf(store, ids.slide1).elements).toHaveLength(7);
  expect(store.getProject().bubbles).toEqual({ [ids.photo1]: ids.body });
  valid(store);
});

test('순서 바꾸기: 사진과 글씨가 한 묶음으로 다른 요소를 건너뛴다', () => {
  const store = start(); const before = comicContent(store.getProject());
  const [photo, stroke, title, body, s5, s6] = loadSample().slides[0].elements.map(item => item.id);
  // 사진을 한 칸 앞으로: 선 하나를 건너뛰고 글씨가 사진 바로 앞에 붙는다.
  expect(run(store, { type: 'reorderElement', slideId: ids.slide1, elementId: ids.photo1, toIndex: 1 })).toMatchObject({ ok: true, changed: true });
  expect(order(store, ids.slide1)).toEqual([stroke, photo, body, title, s5, s6]);
  valid(store);
  undoRedo(store, before);
  // 다시 한 칸 뒤로.
  run(store, { type: 'reorderElement', slideId: ids.slide1, elementId: ids.photo1, toIndex: 0 });
  expect(order(store, ids.slide1)).toEqual([photo, body, stroke, title, s5, s6]);
});

test('순서 바꾸기: 사진이 자기 글씨만 건너뛰는 요청은 다른 요소 하나를 더 건너뛰고, 더 갈 곳이 없으면 변화 없는 명령이다', () => {
  const store = start(loadComicSample(false));
  run(store, bubble(ids.slide4));
  run(store, { type: 'addStroke', slideId: ids.slide4, x: 10, y: 10, points: [0, 0, 10, 10], color: '#123456', strokeWidth: 8 });
  const [image, text, stroke] = order(store, ids.slide4);
  expect(run(store, { type: 'reorderElement', slideId: ids.slide4, elementId: image, toIndex: 1 })).toMatchObject({ ok: true, changed: true });
  expect(order(store, ids.slide4)).toEqual([stroke, image, text]);
  const top = store.getProject();
  expect(run(store, { type: 'reorderElement', slideId: ids.slide4, elementId: image, toIndex: 2 })).toMatchObject({ ok: true, changed: false, revision: top.revision });
  expect(store.getProject()).toBe(top);
  run(store, { type: 'reorderElement', slideId: ids.slide4, elementId: image, toIndex: 0 });
  expect(order(store, ids.slide4)).toEqual([image, text, stroke]);
  valid(store);
});

test('순서 바꾸기: 짝 글씨는 자기 말풍선보다 뒤로 가지 못하고, 앞으로는 갈 수 있다', () => {
  const store = start(loadComicSample(false));
  run(store, bubble(ids.slide4));
  run(store, { type: 'addStroke', slideId: ids.slide4, x: 10, y: 10, points: [0, 0, 10, 10], color: '#123456', strokeWidth: 8 });
  const [image, text, stroke] = order(store, ids.slide4);
  const before = store.getProject();
  expect(run(store, { type: 'reorderElement', slideId: ids.slide4, elementId: text, toIndex: 0 })).toMatchObject({ ok: true, changed: false });
  expect(store.getProject()).toBe(before);
  run(store, { type: 'reorderElement', slideId: ids.slide4, elementId: text, toIndex: 2 });
  expect(order(store, ids.slide4)).toEqual([image, stroke, text]);
  valid(store);
});

test('칸을 복제하면 복제된 칸의 요소끼리 새 짝이 생긴다', () => {
  const store = start(); const before = comicContent(store.getProject());
  const result = run(store, { type: 'duplicateSlide', slideId: ids.slide1 });
  expect(result).toMatchObject({ ok: true, changed: true });
  const copy = store.getProject().slides[1];
  expect(result.ok && result.slideId).toBe(copy.id);
  expect(store.getProject().bubbles).toEqual({ [ids.photo1]: ids.body, [copy.elements[0].id]: copy.elements[3].id });
  expect(copy.elements[0]).toMatchObject({ type: 'image' }); expect(copy.elements[3]).toMatchObject({ type: 'text' });
  valid(store);
  undoRedo(store, before);
  // 복제된 칸의 사진을 옮기면 복제된 글씨만 따라온다.
  run(store, { type: 'moveElement', slideId: copy.id, elementId: copy.elements[0].id, x: 700, y: 200 });
  expect(element(store, copy.id, copy.elements[3].id).x).toBe(20);
  expect(element(store, ids.slide1, ids.body).x).toBe(80);
});

test('칸을 지우거나 비우면 그 칸의 짝이 빠지고, 되돌리면 돌아온다', () => {
  for (const type of ['deleteSlide', 'clearSlide'] as const) {
    const store = start(); const before = comicContent(store.getProject());
    expect(run(store, { type, slideId: ids.slide1 })).toMatchObject({ ok: true, changed: true });
    expect(store.getProject().bubbles).toEqual({});
    valid(store);
    undoRedo(store, before);
  }
});

test('칸 순서를 바꿔도 짝은 그대로다', () => {
  const store = start();
  run(store, { type: 'reorderSlide', slideId: ids.slide1, toIndex: 3 });
  expect(store.getProject().bubbles).toEqual({ [ids.photo1]: ids.body });
  valid(store);
});

test('되돌리기 기록의 메모리 추정에 짝 목록이 들어간다', () => {
  const sample = loadComicSample();
  const base = estimateComicBytes([{ ...sample, bubbles: {} }]);
  expect(estimateComicBytes([sample])).toBe(base + 96);
  // 같은 bubbles 객체는 한 번만 센다.
  expect(estimateComicBytes([sample, { ...sample }])).toBe(base + 96);
});

test('읽기 전용 저장소는 만화 명령도 거부한다', () => {
  const store = start(loadComicSample(), { readOnly: true });
  expect(run(store, { type: 'setComicLayout', layout: 'rows3' })).toMatchObject({ ok: false, code: 'READ_ONLY' });
  expect(run(store, bubble(ids.slide4))).toMatchObject({ ok: false, code: 'READ_ONLY' });
});

test('새 작품: 흰 빈 칸 하나, 한 쪽에 4칸, 말풍선 없음', () => {
  const project = createComicProject(idSequence(), clock());
  expect(project).toMatchObject({ kind: 'comic', title: '내 만화', layout: 'grid4', bubbles: {}, revision: 0 });
  expect(project.slides).toHaveLength(1);
  expect(validateComicProject(project)).toMatchObject({ ok: true });
});

// ---- 쪽 구성(계약 §3) ----
test('쪽 수와 칸이 들어가는 쪽', () => {
  expect([panelsPerPage('rows3'), panelsPerPage('grid4'), panelsPerPage('grid8')]).toEqual([3, 4, 8]);
  expect([0, 1, 3, 4, 5, 100].map(count => pageCount(count, 'rows3'))).toEqual([1, 1, 1, 2, 2, 34]);
  expect([1, 4, 5, 8, 9, 100].map(count => pageCount(count, 'grid4'))).toEqual([1, 1, 2, 2, 3, 25]);
  expect([1, 8, 9, 100].map(count => pageCount(count, 'grid8'))).toEqual([1, 1, 2, 13]);
  expect([0, 3, 4, 7, 8].map(index => pageOfPanel(index, 'grid4'))).toEqual([0, 0, 1, 1, 2]);
});

for (const [layout, width, height, columns] of [['rows3', 595, 842, 1], ['grid4', 842, 595, 2], ['grid8', 595, 842, 2]] as const) test(`${layout}: 칸은 16:9이고 여백과 제목 줄 안에 겹치지 않게 순서대로 놓인다`, () => {
  const page = pageLayout(layout);
  expect(page).toMatchObject({ width, height });
  expect(page.panels).toHaveLength(panelsPerPage(layout));
  page.panels.forEach((panel, index) => {
    expect(panel.width / panel.height).toBeCloseTo(16 / 9, 6);
    expect(panel.x).toBeGreaterThanOrEqual(28 - 1e-9); expect(panel.x + panel.width).toBeLessThanOrEqual(width - 28 + 1e-9);
    expect(panel.y).toBeGreaterThanOrEqual(28 + 40 - 1e-9); expect(panel.y + panel.height).toBeLessThanOrEqual(height - 28 + 1e-9);
    // 순서: 왼쪽에서 오른쪽, 위에서 아래. 칸 사이는 12포인트다.
    const column = index % columns, row = Math.floor(index / columns);
    expect(panel.x).toBeCloseTo(page.panels[0].x + column * (panel.width + 12), 6);
    expect(panel.y).toBeCloseTo(page.panels[0].y + row * (panel.height + 12), 6);
  });
  // 칸 묶음은 가로 가운데에 놓인다.
  const last = page.panels.at(-1)!;
  expect(page.panels[0].x).toBeCloseTo(width - (last.x + last.width), 6);
});

test('칸 크기: 계약 §3의 식과 같다', () => {
  expect(pageLayout('grid4').panels[0].width).toBeCloseTo(387, 6);
  expect(pageLayout('grid8').panels[0].width).toBeCloseTo(263.5, 6);
  // rows3은 높이가 먼저 걸린다: (842 − 56 − 40 − 24) ÷ 3 × 16 ÷ 9.
  expect(pageLayout('rows3').panels[0].width).toBeCloseTo((722 / 3) * 16 / 9, 6);
});
