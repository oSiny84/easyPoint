import { test, expect } from '@playwright/test';
import { checkComicSettings, validateComicProject } from '../../src/domain/comicValidate';
import { validateProject } from '../../src/domain/validate';
import { loadComicSample } from './comicHelpers';
import { ids, loadSample } from './helpers';

// 만화 계약 §5: 슬라이드와 같은 10개 필드는 슬라이드 검사에 맡기고, kind·layout·bubbles만 직접 본다.
const mutate = (change: (project: Record<string, any>) => void) => { const project = loadComicSample() as unknown as Record<string, any>; change(project); return project; };
const MISSING = '00000000-0000-4000-8000-000000009999';

test('공통 만화 샘플은 검사를 통과하고 같은 객체를 돌려준다', () => {
  const project = loadComicSample();
  const checked = validateComicProject(project);
  expect(checked).toMatchObject({ ok: true });
  expect(checked.ok && checked.project).toBe(project);
  expect(validateComicProject(loadComicSample(false))).toMatchObject({ ok: true });
});

for (const layout of ['rows3', 'grid4', 'grid8']) test(`칸 배치 ${layout}은 허용값이다`, () => {
  expect(validateComicProject(mutate(project => { project.layout = layout; }))).toMatchObject({ ok: true });
});

const rejected: [string, (project: Record<string, any>) => void, string][] = [
  ['kind 없음', project => { delete project.kind; }, 'INVALID_VALUE'],
  ['kind가 애니메이션', project => { project.kind = 'animation'; }, 'INVALID_VALUE'],
  ['알 수 없는 필드', project => { project.extra = 1; }, 'INVALID_VALUE'],
  ['애니메이션 필드가 섞임', project => { project.fps = 6; }, 'INVALID_VALUE'],
  ['더 새로운 schemaVersion', project => { project.schemaVersion = 2; }, 'UNSUPPORTED_VERSION'],
  ['layout 없음', project => { delete project.layout; }, 'INVALID_VALUE'],
  ['모르는 layout', project => { project.layout = 'grid6'; }, 'INVALID_VALUE'],
  ['숫자 layout', project => { project.layout = 4; }, 'INVALID_VALUE'],
  ['bubbles 없음', project => { delete project.bubbles; }, 'INVALID_VALUE'],
  ['bubbles가 배열', project => { project.bubbles = []; }, 'INVALID_VALUE'],
  ['bubbles가 null', project => { project.bubbles = null; }, 'INVALID_VALUE'],
  ['bubbles가 문자열', project => { project.bubbles = 'x'; }, 'INVALID_VALUE'],
  ['짝의 사진이 없는 요소', project => { project.bubbles = { [MISSING]: ids.body }; }, 'INVALID_VALUE'],
  ['짝의 사진 자리에 글씨', project => { project.bubbles = { [ids.title]: ids.body }; }, 'INVALID_VALUE'],
  ['짝의 사진 자리에 선', project => { project.bubbles = { [ids.stroke1]: ids.body }; }, 'INVALID_VALUE'],
  ['짝의 글씨가 없는 요소', project => { project.bubbles = { [ids.photo1]: MISSING }; }, 'INVALID_VALUE'],
  ['짝의 글씨 자리에 사진', project => { project.bubbles = { [ids.photo1]: ids.photo1 }; }, 'INVALID_VALUE'],
  ['짝의 글씨 자리에 선', project => { project.bubbles = { [ids.photo1]: ids.stroke1 }; }, 'INVALID_VALUE'],
  ['짝의 글씨가 숫자', project => { project.bubbles = { [ids.photo1]: 3 }; }, 'INVALID_VALUE'],
  // 둘째 칸의 글씨(…021)는 첫 칸의 사진과 짝이 될 수 없다.
  ['짝의 글씨가 다른 칸에 있음', project => { project.bubbles = { [ids.photo1]: '00000000-0000-4000-8000-000000000021' }; }, 'INVALID_VALUE'],
  // 둘째 칸의 사진(…022)과 첫 칸의 사진이 같은 글씨를 가리킬 수 없다(다른 칸이기도 하다).
  ['글씨 하나가 말풍선 둘에 들어감', project => {
    const first = project.slides[0];
    first.elements.push({ ...first.elements[0], id: '00000000-0000-4000-8000-000000000019', x: 100 });
    project.bubbles = { [ids.photo1]: ids.body, '00000000-0000-4000-8000-000000000019': ids.body };
  }, 'INVALID_VALUE'],
  ['슬라이드 검사 실패: 칸이 없음', project => { project.slides = []; }, 'INVALID_VALUE'],
  ['슬라이드 검사 실패: 크기가 다름', project => { project.width = 1920; }, 'INVALID_VALUE'],
  ['슬라이드 검사 실패: 없는 사진 자료', project => { project.assetManifest = []; }, 'ASSET_MISSING'],
];
for (const [name, change, code] of rejected) test(`거부: ${name}`, () => {
  expect(validateComicProject(mutate(change))).toMatchObject({ ok: false, code });
});

for (const [name, value] of [['null', null], ['배열', []], ['문자열', 'comic'], ['숫자', 3]] as const) test(`거부: 문서가 ${name}`, () => {
  expect(validateComicProject(value)).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
});

test('슬라이드 검사의 실패 내용이 그대로 전달된다', () => {
  const broken = mutate(project => { project.slides[0].elements[2].fontId = 'comic-sans'; });
  const slideOnly = { ...loadSample() } as Record<string, any>; slideOnly.slides[0].elements[2].fontId = 'comic-sans';
  expect(validateComicProject(broken)).toEqual(validateProject(slideOnly));
});

test('만화 작품은 슬라이드 검사를 통과하지 못하고, 슬라이드 작품은 만화 검사를 통과하지 못한다', () => {
  expect(validateProject(loadComicSample())).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  expect(validateComicProject(loadSample())).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
});

test('checkComicSettings: 짝이 없으면 칸을 훑지 않고 통과한다', () => {
  expect(checkComicSettings({ layout: 'grid4', bubbles: {} }, [])).toBeNull();
  expect(checkComicSettings({ layout: 'grid4', bubbles: { [ids.photo1]: ids.body } }, loadSample().slides)).toBeNull();
});
