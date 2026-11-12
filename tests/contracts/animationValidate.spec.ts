import { test, expect } from '@playwright/test';
import { validateAnimationProject } from '../../src/domain/animationValidate';
import { validateProject } from '../../src/domain/validate';
import { loadAnimationSample } from './animationHelpers';
import { ids, loadSample } from './helpers';

// 애니메이션 계약 §5: 슬라이드와 같은 10개 필드는 슬라이드 검사에 맡기고, 애니메이션 필드 5개만 직접 본다.
const sample = () => loadAnimationSample() as unknown as Record<string, unknown>;

test('공통 애니메이션 샘플은 검사를 통과한다', () => {
  expect(validateAnimationProject(loadAnimationSample())).toMatchObject({ ok: true });
});

const invalid: [string, (project: Record<string, unknown>) => void, string][] = [
  ['kind 없음', project => { delete project.kind; }, 'INVALID_VALUE'],
  ['다른 kind', project => { project.kind = 'video'; }, 'INVALID_VALUE'],
  ['알 수 없는 필드', project => { project.loop = true; }, 'INVALID_VALUE'],
  ['슬라이드 장에 알 수 없는 필드', project => { (project.slides as Record<string, unknown>[])[0].hold = 2; }, 'INVALID_VALUE'],
  ['빠르기 없음', project => { delete project.fps; }, 'INVALID_VALUE'],
  ['허용하지 않는 빠르기 5', project => { project.fps = 5; }, 'INVALID_VALUE'],
  ['빠르기 24', project => { project.fps = 24; }, 'INVALID_VALUE'],
  ['문자열 빠르기', project => { project.fps = '6'; }, 'INVALID_VALUE'],
  ['음악 없음(필드 자체)', project => { delete project.musicId; }, 'INVALID_VALUE'],
  ['음악 ID 형식 위반', project => { project.musicId = 'Bad ID'; }, 'INVALID_VALUE'],
  ['숫자 음악 ID', project => { project.musicId = 7; }, 'INVALID_VALUE'],
  ['음악 크기 0', project => { project.musicVolume = 0; }, 'INVALID_VALUE'],
  ['음악 크기 없음', project => { delete project.musicVolume; }, 'INVALID_VALUE'],
  ['holds 없음', project => { delete project.holds; }, 'INVALID_VALUE'],
  ['holds가 null', project => { project.holds = null; }, 'INVALID_VALUE'],
  ['holds가 배열', project => { project.holds = [2]; }, 'INVALID_VALUE'],
  ['holds가 없는 장을 가리킴', project => { project.holds = { '00000000-0000-4000-8000-000000009999': 2 }; }, 'INVALID_VALUE'],
  ['holds 값 1(1배는 저장하지 않는다)', project => { project.holds = { [ids.slide1]: 1 }; }, 'INVALID_VALUE'],
  ['holds 값 3', project => { project.holds = { [ids.slide1]: 3 }; }, 'INVALID_VALUE'],
  ['holds 값 문자열', project => { project.holds = { [ids.slide1]: '2' }; }, 'INVALID_VALUE'],
  ['더 새로운 버전', project => { project.schemaVersion = 2; }, 'UNSUPPORTED_VERSION'],
  ['버전 0', project => { project.schemaVersion = 0; }, 'INVALID_VALUE'],
  // 슬라이드 검사가 걸러 내는 것이 그대로 전달된다.
  ['장이 없음', project => { project.slides = []; project.holds = {}; }, 'INVALID_VALUE'],
  ['슬라이드 크기 다름', project => { project.width = 720; }, 'INVALID_VALUE'],
  ['작품 ID 형식 위반', project => { project.id = 'abc'; }, 'INVALID_VALUE'],
  ['제목 한도 초과', project => { project.title = '가'.repeat(101); }, 'LIMIT_EXCEEDED'],
  ['없는 사진을 쓰는 요소', project => { ((project.slides as { elements: Record<string, unknown>[] }[])[0].elements[0]).assetId = 'c'.repeat(64); }, 'ASSET_MISSING'],
  ['자료 목록 없음', project => { delete project.assetManifest; }, 'INVALID_VALUE'],
];
for (const [name, mutate, code] of invalid) test(`거부: ${name}`, () => {
  const project = sample(); mutate(project);
  expect(validateAnimationProject(project)).toMatchObject({ ok: false, code });
});

test('객체가 아닌 값은 거부한다', () => {
  for (const value of [null, undefined, 3, 'animation', [], [loadAnimationSample()]]) expect(validateAnimationProject(value)).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
});

test('두 편집기는 서로의 문서를 받지 않는다', () => {
  // 슬라이드 문서에는 kind가 없어 애니메이션 검사가 거부한다.
  expect(validateAnimationProject(loadSample())).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  // 애니메이션 문서는 슬라이드 검사가 알 수 없는 필드로 거부한다(슬라이드 검사는 바뀌지 않았다).
  expect(validateProject(loadAnimationSample())).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
});

test('검사는 문서를 고치지 않는다', () => {
  const project = loadAnimationSample(); const before = JSON.stringify(project);
  const checked = validateAnimationProject(project);
  expect(checked.ok && checked.project).toBe(project);
  expect(JSON.stringify(project)).toBe(before);
});
