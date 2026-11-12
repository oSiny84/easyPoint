import { test, expect } from '@playwright/test';
import type { AnimationCommand } from '../../src/commands/animationApply';
import type { Command } from '../../src/commands/apply';
import { frameCounts, durationMs, slideAtFrame, slideStartFrame, totalFrames, formatLength } from '../../src/animation/frameTimes';
import { createAnimationProject } from '../../src/domain/animationProject';
import { validateAnimationProject } from '../../src/domain/animationValidate';
import { DEFAULT_FONT_ID } from '../../src/domain/limits';
import type { Asset } from '../../src/domain/types';
import { createAnimationStore, estimateAnimationBytes } from '../../src/state/animationStore';
import { createStore } from '../../src/state/store';
import { animationContent, idSequence, loadAnimationSample } from './animationHelpers';
import { clock, contentOf, ids, loadSample } from './helpers';

// 애니메이션 계약 §4: 슬라이드 명령 18개는 슬라이드와 같은 결과를 내고 holds만 맞춘다. 새 명령은 setAnimation·setFrameHold 둘이다.
const NEW_ASSET: Asset = { id: 'a'.repeat(64), mime: 'image/png', pixelWidth: 400, pixelHeight: 300, byteLength: 1000 };
const textStyle = { fontId: DEFAULT_FONT_ID, fontSize: 36, bold: false, color: '#112233', align: 'left' as const, lineHeight: 1.3 };
const start = (project = loadAnimationSample(), options = {}) => createAnimationStore(project, { newId: idSequence(), now: clock(), ...options });
const run = (store: ReturnType<typeof createAnimationStore>, command: AnimationCommand) => { const p = store.getProject(); return store.dispatch(p.id, p.revision, command); };

// 슬라이드 계약 §4 표의 18개 명령(tests/contracts/commands.spec.ts와 같은 입력).
const slideCommands: Record<string, Command> = {
  renameProject: { type: 'renameProject', title: '새 이름' },
  addSlide: { type: 'addSlide', afterSlideId: ids.slide1 },
  duplicateSlide: { type: 'duplicateSlide', slideId: ids.slide1 },
  deleteSlide: { type: 'deleteSlide', slideId: ids.slide3 },
  clearSlide: { type: 'clearSlide', slideId: ids.slide1 },
  reorderSlide: { type: 'reorderSlide', slideId: ids.slide1, toIndex: 2 },
  setBackground: { type: 'setBackground', slideId: ids.slide1, background: { kind: 'solid', color: '#abcdef' } },
  addImage: { type: 'addImage', slideId: ids.slide4, assetId: NEW_ASSET.id, asset: NEW_ASSET, x: 10, y: 10, width: 400, height: 300 },
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

for (const [name, command] of Object.entries(slideCommands)) test(`${name}: 슬라이드 저장소와 같은 결과를 내고, 실행 → 취소 → 다시 실행이 된다`, () => {
  const store = start(); const original = store.getProject(); const before = animationContent(original);
  const slideStore = createStore(loadSample(), { newId: idSequence(), now: clock() });
  const slideProject = slideStore.getProject();
  const expected = slideStore.dispatch(slideProject.id, slideProject.revision, command);
  const applied = run(store, command);
  // 결과(바뀐 장·revision)와 슬라이드 부분의 내용이 슬라이드 편집기와 같다.
  expect(applied).toEqual(expected);
  expect(applied).toMatchObject({ ok: true, changed: true, revision: 1 });
  expect(contentOf(store.getProject())).toEqual(contentOf(slideStore.getProject()));
  expect(validateAnimationProject(store.getProject())).toMatchObject({ ok: true });
  // 애니메이션 설정은 슬라이드 명령으로 바뀌지 않는다.
  expect(store.getProject()).toMatchObject({ kind: 'animation', fps: 6, musicId: null, musicVolume: 0.5 });
  const after = animationContent(store.getProject());
  expect(animationContent(original)).toEqual(before);

  expect(store.undo()).toMatchObject({ ok: true, changed: true, revision: 2 });
  expect(animationContent(store.getProject())).toEqual(before);
  expect(store.redo()).toMatchObject({ ok: true, changed: true, revision: 3 });
  expect(animationContent(store.getProject())).toEqual(after);
});

test('슬라이드 명령의 실패는 그대로 전달되고 문서를 바꾸지 않는다', () => {
  const store = start(); const before = store.getProject();
  expect(run(store, { type: 'deleteSlide', slideId: 'nope' })).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  expect(run(store, { type: 'renameProject', title: '가'.repeat(101) })).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED' });
  expect(run(store, { type: 'addImage', slideId: ids.slide4, assetId: 'b'.repeat(64), x: 0, y: 0, width: 10, height: 10 })).toMatchObject({ ok: false, code: 'ASSET_MISSING' });
  expect(store.getProject()).toBe(before);
  expect(store.canUndo()).toBe(false);
});

test('변화 없는 슬라이드 명령은 revision·기록·holds 객체를 그대로 둔다', () => {
  const store = start(); const before = store.getProject();
  expect(run(store, { type: 'renameProject', title: before.title })).toMatchObject({ ok: true, changed: false, revision: 0 });
  expect(store.getProject()).toBe(before);
  run(store, { type: 'moveElement', slideId: ids.slide1, elementId: ids.photo1, x: 1, y: 1 });
  expect(store.getProject().holds).toBe(before.holds);
  expect(store.getProject().slides[1]).toBe(before.slides[1]);
});

// ---- setAnimation ----
const settings: [string, AnimationCommand, Record<string, unknown>][] = [
  ['빠르기', { type: 'setAnimation', fps: 12 }, { fps: 12 }],
  ['음악', { type: 'setAnimation', musicId: 'music-walk' }, { musicId: 'music-walk' }],
  ['음악 크기', { type: 'setAnimation', musicVolume: 1 }, { musicVolume: 1 }],
  ['한꺼번에', { type: 'setAnimation', fps: 2, musicId: 'music-walk', musicVolume: 1 }, { fps: 2, musicId: 'music-walk', musicVolume: 1 }],
];
for (const [name, command, expected] of settings) test(`setAnimation ${name}: 실행 → 취소 → 다시 실행, 지금 장은 그대로`, () => {
  const store = start(); const before = animationContent(store.getProject());
  expect(run(store, command)).toEqual({ ok: true, revision: 1, slideId: null, changed: true });
  expect(store.getProject()).toMatchObject(expected);
  expect(validateAnimationProject(store.getProject())).toMatchObject({ ok: true });
  // 장과 holds는 건드리지 않는다.
  expect(animationContent(store.getProject()).slides).toEqual(before.slides);
  expect(store.getProject().holds).toEqual(before.holds);
  expect(store.undo()).toMatchObject({ ok: true, changed: true, slideId: null });
  expect(animationContent(store.getProject())).toEqual(before);
  store.redo();
  expect(store.getProject()).toMatchObject(expected);
});

test('setAnimation: 음악을 끄면 musicId가 null이 된다', () => {
  const store = start({ ...loadAnimationSample(), musicId: 'music-walk' });
  expect(run(store, { type: 'setAnimation', musicId: null })).toMatchObject({ ok: true, changed: true });
  expect(store.getProject().musicId).toBeNull();
});

test('setAnimation: 지금과 같은 값은 변화 없는 명령이다', () => {
  const store = start(); const before = store.getProject();
  expect(run(store, { type: 'setAnimation', fps: 6, musicVolume: 0.5 })).toEqual({ ok: true, revision: 0, slideId: null, changed: false });
  expect(store.getProject()).toBe(before); expect(store.canUndo()).toBe(false);
});

const badSettings: [string, unknown][] = [
  ['허용하지 않는 빠르기', { type: 'setAnimation', fps: 5 }], ['문자열 빠르기', { type: 'setAnimation', fps: '6' }], ['0 빠르기', { type: 'setAnimation', fps: 0 }],
  ['대문자 음악 ID', { type: 'setAnimation', musicId: 'Music' }], ['빈 음악 ID', { type: 'setAnimation', musicId: '' }], ['숫자 음악 ID', { type: 'setAnimation', musicId: 3 }],
  ['너무 긴 음악 ID', { type: 'setAnimation', musicId: 'a'.repeat(65) }],
  ['음악 크기 0', { type: 'setAnimation', musicVolume: 0 }], ['음악 크기 0.7', { type: 'setAnimation', musicVolume: 0.7 }],
  ['바꿀 값 없음', { type: 'setAnimation' }],
  ['좋은 값과 나쁜 값이 섞임', { type: 'setAnimation', fps: 12, musicVolume: 3 }],
];
for (const [name, command] of badSettings) test(`setAnimation 실패: ${name}`, () => {
  const store = start(); const before = store.getProject();
  expect(run(store, command as AnimationCommand)).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  expect(store.getProject()).toBe(before);
});

// ---- setFrameHold ----
test('setFrameHold: 길게 → 아주 길게 → 보통, 보통은 holds에서 빠진다', () => {
  const store = start(); const before = animationContent(store.getProject());
  expect(run(store, { type: 'setFrameHold', slideId: ids.slide1, hold: 2 })).toEqual({ ok: true, revision: 1, slideId: ids.slide1, changed: true });
  expect(store.getProject().holds).toEqual({ [ids.slide2]: 2, [ids.slide1]: 2 });
  run(store, { type: 'setFrameHold', slideId: ids.slide1, hold: 4 });
  expect(store.getProject().holds).toEqual({ [ids.slide2]: 2, [ids.slide1]: 4 });
  run(store, { type: 'setFrameHold', slideId: ids.slide1, hold: 1 });
  expect(store.getProject().holds).toEqual({ [ids.slide2]: 2 });
  expect(ids.slide1 in store.getProject().holds).toBe(false);
  expect(validateAnimationProject(store.getProject())).toMatchObject({ ok: true });
  // 고르기 한 번이 되돌리기 한 번이다.
  store.undo(); expect(store.getProject().holds).toEqual({ [ids.slide2]: 2, [ids.slide1]: 4 });
  store.undo(); store.undo();
  expect(animationContent(store.getProject())).toEqual(before);
  expect(store.canUndo()).toBe(false);
});

test('setFrameHold: 지금과 같은 값은 변화 없는 명령이고, 잘못된 값·없는 장은 실패다', () => {
  const store = start(); const before = store.getProject();
  expect(run(store, { type: 'setFrameHold', slideId: ids.slide2, hold: 2 })).toEqual({ ok: true, revision: 0, slideId: ids.slide2, changed: false });
  expect(run(store, { type: 'setFrameHold', slideId: ids.slide1, hold: 1 })).toMatchObject({ ok: true, changed: false });
  for (const hold of [3, 0, 8, '2', null]) expect(run(store, { type: 'setFrameHold', slideId: ids.slide1, hold } as never)).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  expect(run(store, { type: 'setFrameHold', slideId: 'nope', hold: 2 })).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  expect(store.getProject()).toBe(before);
});

// ---- holds 맞추기 ----
test('장을 복사하면 길게 보이기도 복사되고, 되돌리면 함께 없어진다', () => {
  const store = start();
  const copied = run(store, { type: 'duplicateSlide', slideId: ids.slide2 });
  expect(copied).toMatchObject({ ok: true, changed: true });
  const copyId = (copied as { slideId: string }).slideId;
  expect(copyId).not.toBe(ids.slide2);
  expect(store.getProject().slides[2].id).toBe(copyId);
  expect(store.getProject().holds).toEqual({ [ids.slide2]: 2, [copyId]: 2 });
  expect(validateAnimationProject(store.getProject())).toMatchObject({ ok: true });
  store.undo();
  expect(store.getProject().holds).toEqual({ [ids.slide2]: 2 });
  store.redo();
  expect(store.getProject().holds).toEqual({ [ids.slide2]: 2, [copyId]: 2 });
});

test('보통 길이의 장을 복사하면 holds는 그대로다', () => {
  const store = start(); const before = store.getProject();
  run(store, { type: 'duplicateSlide', slideId: ids.slide1 });
  expect(store.getProject().holds).toBe(before.holds);
});

test('길게 보이는 장을 지우면 holds에서도 빠지고, 되돌리면 장과 함께 돌아온다', () => {
  const store = start();
  expect(run(store, { type: 'deleteSlide', slideId: ids.slide2 })).toMatchObject({ ok: true, changed: true });
  expect(store.getProject().holds).toEqual({});
  expect(validateAnimationProject(store.getProject())).toMatchObject({ ok: true });
  expect(store.undo()).toMatchObject({ ok: true, slideId: ids.slide2 });
  expect(store.getProject().holds).toEqual({ [ids.slide2]: 2 });
  expect(store.getProject().slides.map(slide => slide.id)).toEqual([ids.slide1, ids.slide2, ids.slide3, ids.slide4]);
});

test('다른 장을 지우거나 내용을 비우거나 순서를 바꿔도 길게 보이기는 그 장에 남는다', () => {
  const store = start(); const holds = store.getProject().holds;
  run(store, { type: 'deleteSlide', slideId: ids.slide4 });
  run(store, { type: 'clearSlide', slideId: ids.slide2 });
  run(store, { type: 'reorderSlide', slideId: ids.slide2, toIndex: 0 });
  expect(store.getProject().holds).toBe(holds);
  expect(store.getProject().slides[0].id).toBe(ids.slide2);
});

// ---- 저장소 규칙 ----
test('읽기 전용 세션과 어긋난 revision은 새 명령도 거부한다', () => {
  const readOnly = start(loadAnimationSample(), { readOnly: true });
  expect(run(readOnly, { type: 'setAnimation', fps: 12 })).toMatchObject({ ok: false, code: 'READ_ONLY' });
  const store = start(); const project = store.getProject();
  expect(store.dispatch(project.id, project.revision + 1, { type: 'setFrameHold', slideId: ids.slide1, hold: 2 })).toMatchObject({ ok: false, code: 'REVISION_CONFLICT' });
  expect(store.dispatch('other', project.revision, { type: 'setAnimation', fps: 12 })).toMatchObject({ ok: false, code: 'REVISION_CONFLICT' });
});

test('기록 메모리 추정은 holds를 한 번만 센다', () => {
  const store = start(); const first = store.getProject();
  const one = estimateAnimationBytes([first]);
  expect(estimateAnimationBytes([first, first])).toBe(one);
  run(store, { type: 'setFrameHold', slideId: ids.slide1, hold: 4 });
  // 장은 공유하고 holds 객체만 새로 생겼다: 16 + 키 2개 × 32.
  expect(estimateAnimationBytes([first, store.getProject()])).toBe(one + 16 + 2 * 32);
});

test('새 작품: 흰 빈 장 하나, 초당 6장, 음악 없음', () => {
  const project = createAnimationProject(idSequence(), clock());
  expect(project).toMatchObject({ kind: 'animation', schemaVersion: 1, revision: 0, width: 1280, height: 720, fps: 6, musicId: null, musicVolume: 0.5, holds: {}, assetManifest: [] });
  expect(project.slides).toHaveLength(1);
  expect(validateAnimationProject(project)).toMatchObject({ ok: true });
});

// ---- 시간 식(계약 §3) ----
test('장의 프레임 수: hold × 24 / fps, 합계와 길이', () => {
  const sample = loadAnimationSample();
  expect(frameCounts(sample)).toEqual([4, 8, 4, 4]);
  expect(totalFrames(frameCounts(sample))).toBe(20);
  expect(durationMs(sample)).toBe(833);
  for (const [fps, expected] of [[2, 12], [4, 6], [6, 4], [8, 3], [12, 2]] as const) expect(frameCounts({ ...sample, fps, holds: {} })).toEqual([expected, expected, expected, expected]);
  expect(frameCounts({ ...sample, fps: 2, holds: { [ids.slide1]: 4 } })[0]).toBe(48);
  // 100장 대표 값.
  const hundred = { slides: Array.from({ length: 100 }, (_, index) => ({ id: `s${index}`, background: { kind: 'solid' as const, color: '#FFFFFF' }, elements: [] })), fps: 6 as const, holds: {} };
  expect(totalFrames(frameCounts(hundred))).toBe(400); expect(durationMs(hundred)).toBe(16667);
  expect(totalFrames(frameCounts({ ...hundred, fps: 2, holds: Object.fromEntries(hundred.slides.map(slide => [slide.id, 4 as const])) }))).toBe(4800);
});

test('프레임 → 장: 구간 경계와 반복', () => {
  const counts = [4, 8, 4, 4];
  expect([0, 3, 4, 11, 12, 15, 16, 19].map(frame => slideAtFrame(counts, frame))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  // 전체 프레임 수를 넘으면 처음부터 다시 센다.
  expect([20, 23, 24, 40, 44].map(frame => slideAtFrame(counts, frame))).toEqual([0, 0, 1, 0, 1]);
  expect([0, 1, 2, 3].map(index => slideStartFrame(counts, index))).toEqual([0, 4, 12, 16]);
  expect(slideAtFrame([], 5)).toBe(0);
});

test('길이 표시', () => {
  expect([100, 833, 16667, 60000, 200000].map(formatLength)).toEqual(['0:01', '0:01', '0:17', '1:00', '3:20']);
});
