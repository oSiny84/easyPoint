import { test, expect } from '@playwright/test';
import type { Command } from '../../src/commands/apply';
import { DEFAULT_FONT_ID, LIMITS } from '../../src/domain/limits';
import { validateProject } from '../../src/domain/validate';
import type { Asset, Project, StrokeElement, TextElement } from '../../src/domain/types';
import { createStore, estimateBytes } from '../../src/state/store';
import { clock, contentOf, ids, loadSample, nextId } from './helpers';

const NEW_ASSET: Asset = { id: 'a'.repeat(64), mime: 'image/png', pixelWidth: 400, pixelHeight: 300, byteLength: 1000 };
const photoAsset = (project: Project) => project.assetManifest[0];
const start = (project = loadSample(), options = {}) => createStore(project, { newId: nextId, now: clock(), ...options });
const run = (store: ReturnType<typeof createStore>, command: Command) => { const p = store.getProject(); return store.dispatch(p.id, p.revision, command); };
const textStyle = { fontId: DEFAULT_FONT_ID, fontSize: 36, bold: false, color: '#112233', align: 'left' as const, lineHeight: 1.3 };

// 계약 §4 표의 18개 명령 전체. 각 명령은 실제로 문서를 바꾸는 입력이다.
const everyCommand: Record<string, (project: Project) => Command> = {
  renameProject: () => ({ type: 'renameProject', title: '새 이름' }),
  addSlide: () => ({ type: 'addSlide', afterSlideId: ids.slide1 }),
  duplicateSlide: () => ({ type: 'duplicateSlide', slideId: ids.slide1 }),
  deleteSlide: () => ({ type: 'deleteSlide', slideId: ids.slide2 }),
  clearSlide: () => ({ type: 'clearSlide', slideId: ids.slide1 }),
  reorderSlide: () => ({ type: 'reorderSlide', slideId: ids.slide1, toIndex: 2 }),
  setBackground: () => ({ type: 'setBackground', slideId: ids.slide1, background: { kind: 'solid', color: '#abcdef' } }),
  addImage: () => ({ type: 'addImage', slideId: ids.slide4, assetId: NEW_ASSET.id, asset: NEW_ASSET, x: 10, y: 10, width: 400, height: 300 }),
  addText: () => ({ type: 'addText', slideId: ids.slide4, x: 10, y: 10, width: 400, text: '안녕', ...textStyle }),
  updateText: () => ({ type: 'updateText', slideId: ids.slide1, elementId: ids.title, text: '바뀐 제목', bold: false }),
  addStroke: () => ({ type: 'addStroke', slideId: ids.slide4, x: 10, y: 10, points: [0, 0, 10, 10], color: '#123456', strokeWidth: 8 }),
  updateStrokeStyle: () => ({ type: 'updateStrokeStyle', slideId: ids.slide1, elementId: ids.stroke1, color: '#000000', strokeWidth: 3 }),
  moveElement: () => ({ type: 'moveElement', slideId: ids.slide1, elementId: ids.photo1, x: 100, y: 100 }),
  resizeImage: () => ({ type: 'resizeImage', slideId: ids.slide1, elementId: ids.photo1, x: 100, y: 100, width: 200, height: 150 }),
  resizeText: () => ({ type: 'resizeText', slideId: ids.slide1, elementId: ids.title, x: 80, y: 60, width: 600, fontSize: 48 }),
  reorderElement: () => ({ type: 'reorderElement', slideId: ids.slide1, elementId: ids.photo1, toIndex: 3 }),
  duplicateElement: () => ({ type: 'duplicateElement', slideId: ids.slide1, elementId: ids.photo1 }),
  deleteElement: () => ({ type: 'deleteElement', slideId: ids.slide1, elementId: ids.photo1 }),
};

test('명령 목록이 계약의 18개와 같다', () => expect(Object.keys(everyCommand).length).toBe(18));

for (const [name, make] of Object.entries(everyCommand)) test(`${name}: 실행 → 취소 → 다시 실행`, () => {
  const store = start(); const original = store.getProject(); const before = contentOf(original);
  const applied = run(store, make(original));
  expect(applied).toMatchObject({ ok: true, changed: true, revision: 1 });
  const after = contentOf(store.getProject());
  expect(after).not.toEqual(before);
  expect(validateProject(store.getProject())).toMatchObject({ ok: true });
  // 원본 객체는 바뀌지 않는다.
  expect(contentOf(original)).toEqual(before);

  expect(store.undo()).toMatchObject({ ok: true, changed: true, revision: 2 });
  expect(contentOf(store.getProject())).toEqual(before);
  expect(store.redo()).toMatchObject({ ok: true, changed: true, revision: 3 });
  expect(contentOf(store.getProject())).toEqual(after);
});

test('바뀌지 않은 슬라이드는 이전 객체를 그대로 공유한다', () => {
  const store = start(); const before = store.getProject();
  run(store, { type: 'moveElement', slideId: ids.slide1, elementId: ids.photo1, x: 1, y: 1 });
  const after = store.getProject();
  expect(after.slides[1]).toBe(before.slides[1]);
  expect(after.slides[0].elements[1]).toBe(before.slides[0].elements[1]);
  expect(after.slides[0]).not.toBe(before.slides[0]);
});

const failures: [string, (project: Project) => Command, string][] = [
  ['이름 한도 초과', () => ({ type: 'renameProject', title: '가'.repeat(101) }), 'LIMIT_EXCEEDED'],
  ['없는 기준 장', () => ({ type: 'addSlide', afterSlideId: 'nope' }), 'INVALID_VALUE'],
  ['없는 장 복제', () => ({ type: 'duplicateSlide', slideId: 'nope' }), 'INVALID_VALUE'],
  ['없는 장 삭제', () => ({ type: 'deleteSlide', slideId: 'nope' }), 'INVALID_VALUE'],
  ['없는 장 비우기', () => ({ type: 'clearSlide', slideId: 'nope' }), 'INVALID_VALUE'],
  ['범위 밖 장 이동', () => ({ type: 'reorderSlide', slideId: ids.slide1, toIndex: 4 }), 'INVALID_VALUE'],
  ['소수 장 이동', () => ({ type: 'reorderSlide', slideId: ids.slide1, toIndex: 1.5 }), 'INVALID_VALUE'],
  ['잘못된 배경 색', () => ({ type: 'setBackground', slideId: ids.slide1, background: { kind: 'solid', color: 'red' } }), 'INVALID_VALUE'],
  ['잘못된 배경 종류', () => ({ type: 'setBackground', slideId: ids.slide1, background: { kind: 'video' } as never }), 'INVALID_VALUE'],
  ['없는 배경 사진', () => ({ type: 'setBackground', slideId: ids.slide1, background: { kind: 'image', assetId: 'b'.repeat(64), fit: 'center-cover' } }), 'ASSET_MISSING'],
  ['없는 사진', () => ({ type: 'addImage', slideId: ids.slide4, assetId: 'b'.repeat(64), x: 0, y: 0, width: 10, height: 10 }), 'ASSET_MISSING'],
  ['사진 비율 위반', p => ({ type: 'addImage', slideId: ids.slide4, assetId: photoAsset(p).id, x: 0, y: 0, width: 400, height: 100 }), 'INVALID_VALUE'],
  ['잘못된 새 자료', () => ({ type: 'addImage', slideId: ids.slide4, assetId: 'c'.repeat(64), asset: { ...NEW_ASSET, id: 'c'.repeat(64), mime: 'image/gif' as never }, x: 0, y: 0, width: 400, height: 300 }), 'ASSET_INVALID'],
  ['빈 글씨 추가', () => ({ type: 'addText', slideId: ids.slide4, x: 0, y: 0, width: 400, text: '  \n ', ...textStyle }), 'INVALID_VALUE'],
  ['미등록 글꼴', () => ({ type: 'addText', slideId: ids.slide4, x: 0, y: 0, width: 400, text: '가', ...textStyle, fontId: 'Comic Sans' }), 'INVALID_VALUE'],
  ['글씨 길이 초과', () => ({ type: 'addText', slideId: ids.slide4, x: 0, y: 0, width: 400, text: '가'.repeat(5001), ...textStyle }), 'LIMIT_EXCEEDED'],
  ['글씨 아닌 요소 수정', () => ({ type: 'updateText', slideId: ids.slide1, elementId: ids.photo1, text: '가' }), 'INVALID_VALUE'],
  ['글씨 크기 범위', () => ({ type: 'updateText', slideId: ids.slide1, elementId: ids.title, fontSize: 500 }), 'INVALID_VALUE'],
  ['홀수 점', () => ({ type: 'addStroke', slideId: ids.slide4, x: 0, y: 0, points: [1, 2, 3], color: '#000000', strokeWidth: 4 }), 'INVALID_VALUE'],
  ['빈 점', () => ({ type: 'addStroke', slideId: ids.slide4, x: 0, y: 0, points: [], color: '#000000', strokeWidth: 4 }), 'INVALID_VALUE'],
  ['점 수 초과', () => ({ type: 'addStroke', slideId: ids.slide4, x: 0, y: 0, points: new Array(10002).fill(1), color: '#000000', strokeWidth: 4 }), 'LIMIT_EXCEEDED'],
  ['점 좌표 범위', () => ({ type: 'addStroke', slideId: ids.slide4, x: 0, y: 0, points: [-1, 0], color: '#000000', strokeWidth: 4 }), 'INVALID_VALUE'],
  ['NaN 좌표', () => ({ type: 'addStroke', slideId: ids.slide4, x: 0, y: 0, points: [NaN, 0], color: '#000000', strokeWidth: 4 }), 'INVALID_VALUE'],
  ['그림 아닌 요소 서식', () => ({ type: 'updateStrokeStyle', slideId: ids.slide1, elementId: ids.title, color: '#000000' }), 'INVALID_VALUE'],
  ['펜 굵기 범위', () => ({ type: 'updateStrokeStyle', slideId: ids.slide1, elementId: ids.stroke1, strokeWidth: 100 }), 'INVALID_VALUE'],
  ['없는 요소 이동', () => ({ type: 'moveElement', slideId: ids.slide1, elementId: 'nope', x: 0, y: 0 }), 'INVALID_VALUE'],
  ['화면 밖 완전 이탈', () => ({ type: 'moveElement', slideId: ids.slide1, elementId: ids.photo1, x: 1300, y: 0 }), 'INVALID_VALUE'],
  ['무한대 좌표', () => ({ type: 'moveElement', slideId: ids.slide1, elementId: ids.photo1, x: Infinity, y: 0 }), 'INVALID_VALUE'],
  ['문자열 좌표', () => ({ type: 'moveElement', slideId: ids.slide1, elementId: ids.photo1, x: '10' as never, y: 0 }), 'INVALID_VALUE'],
  ['사진 아닌 요소 크기', () => ({ type: 'resizeImage', slideId: ids.slide1, elementId: ids.title, x: 0, y: 0, width: 400, height: 300 }), 'INVALID_VALUE'],
  ['사진 크기 비율 위반', () => ({ type: 'resizeImage', slideId: ids.slide1, elementId: ids.photo1, x: 0, y: 0, width: 400, height: 400 }), 'INVALID_VALUE'],
  ['글씨 아닌 요소 크기', () => ({ type: 'resizeText', slideId: ids.slide1, elementId: ids.photo1, x: 0, y: 0, width: 400, fontSize: 30 }), 'INVALID_VALUE'],
  ['글씨 폭 범위', () => ({ type: 'resizeText', slideId: ids.slide1, elementId: ids.title, x: 0, y: 0, width: 5, fontSize: 30 }), 'INVALID_VALUE'],
  ['요소 순서 범위', () => ({ type: 'reorderElement', slideId: ids.slide1, elementId: ids.photo1, toIndex: 99 }), 'INVALID_VALUE'],
  ['없는 요소 복제', () => ({ type: 'duplicateElement', slideId: ids.slide1, elementId: 'nope' }), 'INVALID_VALUE'],
  ['없는 요소 삭제', () => ({ type: 'deleteElement', slideId: ids.slide1, elementId: 'nope' }), 'INVALID_VALUE'],
];
for (const [name, make, code] of failures) test(`실패: ${name} → ${code}, 문서·기록 그대로`, () => {
  const store = start(); const before = store.getProject();
  expect(run(store, make(before))).toMatchObject({ ok: false, code });
  expect(store.getProject()).toBe(before);
  expect(store.canUndo()).toBe(false);
});

const noChange: [string, Command][] = [
  ['같은 이름', { type: 'renameProject', title: '우리 가족 소개' }],
  ['같은 위치 이동', { type: 'moveElement', slideId: ids.slide1, elementId: ids.photo1, x: 760, y: 200 }],
  ['같은 순서', { type: 'reorderSlide', slideId: ids.slide1, toIndex: 0 }],
  ['같은 요소 순서', { type: 'reorderElement', slideId: ids.slide1, elementId: ids.photo1, toIndex: 0 }],
  ['같은 배경', { type: 'setBackground', slideId: ids.slide1, background: { kind: 'solid', color: '#fff8e8' } }],
  ['이미 빈 장 비우기', { type: 'clearSlide', slideId: ids.slide4 }],
  ['같은 글씨', { type: 'updateText', slideId: ids.slide1, elementId: ids.title, text: '우리 가족 소개' }],
];
for (const [name, command] of noChange) test(`변화 없음: ${name} → revision·기록 그대로`, () => {
  const store = start(); const before = store.getProject();
  expect(run(store, command)).toMatchObject({ ok: true, changed: false, revision: 0 });
  expect(store.getProject()).toBe(before);
  expect(store.canUndo()).toBe(false);
});

test('마지막 한 장은 지울 수 없다', () => {
  const store = start();
  for (const slideId of [ids.slide1, ids.slide2, ids.slide3]) expect(run(store, { type: 'deleteSlide', slideId })).toMatchObject({ ok: true });
  expect(run(store, { type: 'deleteSlide', slideId: ids.slide4 })).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  expect(store.getProject().slides.length).toBe(1);
});

test('장 수 한도를 넘지 못한다', () => {
  const project = loadSample(); const store = start(project);
  for (let i = project.slides.length; i < LIMITS.slides; i++) expect(run(store, { type: 'addSlide', afterSlideId: ids.slide1 })).toMatchObject({ ok: true });
  expect(run(store, { type: 'addSlide', afterSlideId: ids.slide1 })).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED' });
  expect(run(store, { type: 'duplicateSlide', slideId: ids.slide1 })).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED' });
});

test('addSlide 기준 장이 없으면 첫 위치에 넣는다', () => {
  const store = start(); const result = run(store, { type: 'addSlide' });
  expect(result).toMatchObject({ ok: true }); expect(store.getProject().slides[0].id).toBe((result as { slideId: string }).slideId);
});

test('슬라이드 복제: 원본 다음, 요소 ID 새로 발급, 사진 공유, 한쪽 편집이 다른 쪽을 바꾸지 않음', () => {
  const store = start(); const result = run(store, { type: 'duplicateSlide', slideId: ids.slide1 }) as { slideId: string };
  const { slides } = store.getProject();
  expect(slides[1].id).toBe(result.slideId);
  const a = slides[0].elements, b = slides[1].elements;
  expect(b.length).toBe(a.length);
  b.forEach((element, i) => { expect(element.id).not.toBe(a[i].id); expect({ ...element, id: '' }).toEqual({ ...a[i], id: '' }); });
  run(store, { type: 'moveElement', slideId: result.slideId, elementId: b[0].id, x: 5, y: 5 });
  expect(store.getProject().slides[0].elements[0]).toBe(a[0]);
  const allIds = store.getProject().slides.flatMap(slide => [slide.id, ...slide.elements.map(element => element.id)]);
  expect(new Set(allIds).size).toBe(allIds.length);
});

test('요소 복제: 원본 바로 앞, 20px 이동, 화면 안으로 보정, 사진 공유', () => {
  const store = start();
  run(store, { type: 'duplicateElement', slideId: ids.slide1, elementId: ids.photo1 });
  let elements = store.getProject().slides[0].elements;
  expect(elements[0].id).toBe(ids.photo1);
  expect(elements[1]).toMatchObject({ type: 'image', x: 780, y: 220, width: 400, height: 300 });
  expect((elements[1] as { assetId: string }).assetId).toBe((elements[0] as { assetId: string }).assetId);
  run(store, { type: 'moveElement', slideId: ids.slide1, elementId: ids.photo1, x: 880, y: 420 });
  run(store, { type: 'duplicateElement', slideId: ids.slide1, elementId: ids.photo1 });
  elements = store.getProject().slides[0].elements;
  expect(elements[1]).toMatchObject({ x: 880, y: 420 });
});

test('글씨를 모두 지우면 삭제이고 취소 한 번으로 돌아온다', () => {
  const store = start(); const before = contentOf(store.getProject());
  expect(run(store, { type: 'updateText', slideId: ids.slide1, elementId: ids.title, text: ' \n ' })).toMatchObject({ ok: true, changed: true });
  expect(store.getProject().slides[0].elements.some(element => element.id === ids.title)).toBe(false);
  expect(store.historySize().undo).toBe(1);
  store.undo();
  expect(contentOf(store.getProject())).toEqual(before);
});

test('입력값 정규화: 색 대문자, 줄바꿈 LF', () => {
  const store = start();
  run(store, { type: 'addText', slideId: ids.slide4, x: 0, y: 0, width: 400, text: '가\r\n나\r다', ...textStyle, color: '#abcdef' });
  expect(store.getProject().slides[3].elements[0]).toMatchObject({ color: '#ABCDEF', text: '가\n나\n다' } satisfies Partial<TextElement>);
});

test('새 사진 자료 등록은 명령과 함께 되돌아간다', () => {
  const store = start();
  run(store, everyCommand.addImage(store.getProject()));
  expect(store.getProject().assetManifest.some(asset => asset.id === NEW_ASSET.id)).toBe(true);
  store.undo();
  expect(store.getProject().assetManifest.some(asset => asset.id === NEW_ASSET.id)).toBe(false);
});

test('dispatch: 다른 작품·오래된 revision·읽기 전용은 실패', () => {
  const store = start(); const { id } = store.getProject(); const command = everyCommand.renameProject(store.getProject());
  expect(store.dispatch('other', 0, command)).toMatchObject({ ok: false, code: 'REVISION_CONFLICT' });
  expect(store.dispatch(id, 5, command)).toMatchObject({ ok: false, code: 'REVISION_CONFLICT' });
  const readOnly = start(loadSample(), { readOnly: true });
  expect(run(readOnly, command)).toMatchObject({ ok: false, code: 'READ_ONLY' });
  expect(readOnly.undo()).toMatchObject({ ok: false, code: 'READ_ONLY' });
  expect(readOnly.redo()).toMatchObject({ ok: false, code: 'READ_ONLY' });
});

test('revision은 되돌리기에서도 다시 쓰지 않는다 (늦은 저장 완료가 최신 내용으로 표시되는 경우 방지)', () => {
  const store = start();
  run(store, { type: 'renameProject', title: '하나' });
  const saving = store.getProject().revision; // 이 시점의 저장이 시작됐다고 본다.
  store.undo();
  run(store, { type: 'renameProject', title: '둘' });
  expect(store.getProject().revision).toBeGreaterThan(saving);
  const seen = [0, saving, store.getProject().revision];
  store.undo(); seen.push(store.getProject().revision); store.redo(); seen.push(store.getProject().revision);
  expect(new Set(seen).size).toBe(seen.length);
});

test('updatedAt은 명령·취소·다시 실행마다 바뀌고 createdAt은 유지된다', () => {
  const store = start(); const first = store.getProject();
  run(store, { type: 'renameProject', title: '하나' }); const a = store.getProject().updatedAt; store.undo(); const b = store.getProject().updatedAt; store.redo(); const c = store.getProject().updatedAt;
  expect(new Set([first.updatedAt, a, b, c]).size).toBe(4);
  expect(store.getProject().createdAt).toBe(first.createdAt);
});

test('취소 후 새 명령은 다시 실행 기록을 비운다', () => {
  const store = start();
  run(store, { type: 'renameProject', title: '하나' }); store.undo(); expect(store.canRedo()).toBe(true);
  run(store, { type: 'renameProject', title: '둘' }); expect(store.canRedo()).toBe(false);
  expect(store.redo()).toMatchObject({ ok: true, changed: false });
});

test('되돌리면 관련 장을 돌려주고, 장이 사라지면 가장 가까운 장을 돌려준다', () => {
  const store = start();
  run(store, { type: 'moveElement', slideId: ids.slide3, elementId: '00000000-0000-4000-8000-000000000032', x: 200, y: 200 });
  expect(store.undo()).toMatchObject({ slideId: ids.slide3 });
  const added = run(store, { type: 'addSlide', afterSlideId: ids.slide2 }) as { slideId: string };
  expect(store.undo()).toMatchObject({ slideId: ids.slide3 }); // 새 장 자리의 다음 장
  expect(store.redo()).toMatchObject({ slideId: added.slideId });
  run(store, { type: 'deleteSlide', slideId: ids.slide2 });
  expect(store.undo()).toMatchObject({ slideId: ids.slide2 }); // 지운 장이 복원되면 그 장으로
  expect(run(store, { type: 'renameProject', title: '하나' })).toMatchObject({ slideId: null });
  expect(store.undo()).toMatchObject({ slideId: null }); // 이름 변경은 현재 장 유지
});

test('획 100개를 그린 뒤에도 그 전의 사진 이동을 되돌릴 수 있다', () => {
  const store = start();
  run(store, { type: 'moveElement', slideId: ids.slide1, elementId: ids.photo1, x: 111, y: 111 });
  for (let i = 0; i < 100; i++) run(store, { type: 'addStroke', slideId: ids.slide4, x: 0, y: 0, points: [0, 0, i, i], color: '#000000', strokeWidth: 4 });
  for (let i = 0; i < 100; i++) store.undo();
  expect(store.getProject().slides[0].elements[0]).toMatchObject({ x: 111, y: 111 });
  store.undo();
  expect(store.getProject().slides[0].elements[0]).toMatchObject({ x: 760, y: 200 });
});

test('취소 기록은 500개까지 남고 오래된 것부터 지운다', () => {
  const store = start();
  for (let i = 1; i <= 505; i++) run(store, { type: 'moveElement', slideId: ids.slide1, elementId: ids.photo1, x: i, y: 1 });
  expect(store.historySize().undo).toBe(500);
  while (store.canUndo()) store.undo();
  expect(store.getProject().slides[0].elements[0]).toMatchObject({ x: 5 });
});

// 그림 300획×200점 문서: 구조 공유가 합산에 반영되는지 확인한다.
function drawingProject() {
  const project = loadSample();
  const strokes: StrokeElement[] = Array.from({ length: 300 }, () => ({ id: nextId(), type: 'stroke', x: 0, y: 0, points: Array.from({ length: 400 }, (_, i) => i % 300), color: '#000000', strokeWidth: 4 }));
  project.slides[3].elements = strokes;
  return project;
}

test('메모리 추정: 공유된 부분을 중복 합산하지 않는다', () => {
  const project = drawingProject(); const one = estimateBytes([project]);
  expect(estimateBytes([project, project])).toBe(one);
  const store = start(project);
  for (let i = 1; i <= 500; i++) run(store, { type: 'moveElement', slideId: ids.slide1, elementId: ids.photo1, x: i, y: 1 });
  const { bytes, undo } = store.historySize();
  expect(undo).toBe(500);
  // 이동 500번이 문서 500벌이 되면 수백 MB다. 공유하면 문서 한 벌 + 소량이어야 한다.
  expect(bytes).toBeLessThan(one + 500 * 2000);
  console.log(`문서 ${(one / 1048576).toFixed(2)}MiB, 이동 500회 기록 ${(bytes / 1048576).toFixed(2)}MiB`);
});

test('메모리 한도를 넘으면 오래된 기록부터 지운다', () => {
  const store = start(loadSample(), { maxBytes: 200000 });
  // 획을 그렸다 지우기를 반복하면 문서는 작게 유지되고 기록만 지운 획을 붙잡고 있다.
  for (let i = 0; i < 20; i++) {
    const added = run(store, { type: 'addStroke', slideId: ids.slide4, x: 0, y: 0, points: new Array(4000).fill(1), color: '#000000', strokeWidth: 4 });
    expect(added).toMatchObject({ ok: true });
    const id = store.getProject().slides[3].elements.at(-1)!.id;
    run(store, { type: 'deleteElement', slideId: ids.slide4, elementId: id });
  }
  const { undo, bytes } = store.historySize();
  expect(undo).toBeLessThan(40); expect(undo).toBeGreaterThan(0); expect(bytes).toBeLessThanOrEqual(200000);
  expect(store.getProject().slides[3].elements.length).toBe(0);
});

test('구독자는 변경 때만 호출되고 해제할 수 있다', () => {
  const store = start(); let calls = 0; const stop = store.subscribe(() => { calls++; });
  run(store, { type: 'renameProject', title: '우리 가족 소개' }); expect(calls).toBe(0);
  run(store, { type: 'renameProject', title: '하나' }); expect(calls).toBe(1);
  store.undo(); expect(calls).toBe(2);
  stop(); store.redo(); expect(calls).toBe(2);
});
