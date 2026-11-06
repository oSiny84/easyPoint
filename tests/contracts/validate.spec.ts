import { test, expect } from '@playwright/test';
import { validateProject } from '../../src/domain/validate';
import type { Project } from '../../src/domain/types';
import { loadSample } from './helpers';

const first = (project: Project) => project.slides[0].elements;

test('공통 샘플 문서는 검사를 통과한다', () => expect(validateProject(loadSample())).toMatchObject({ ok: true }));

const bad: [string, (project: any) => void, string][] = [
  ['새로운 schemaVersion', p => { p.schemaVersion = 2; }, 'UNSUPPORTED_VERSION'],
  ['schemaVersion 없음', p => { delete p.schemaVersion; }, 'INVALID_VALUE'],
  ['알 수 없는 필드', p => { p.extra = 1; }, 'INVALID_VALUE'],
  ['요소의 알 수 없는 필드', p => { first(p)[0].rotation = 10; }, 'INVALID_VALUE'],
  ['슬라이드의 알 수 없는 필드', p => { p.slides[0].zIndex = 10; }, 'INVALID_VALUE'],
  ['잘못된 작품 ID', p => { p.id = '../x'; }, 'INVALID_VALUE'],
  ['제목 길이', p => { p.title = '가'.repeat(101); }, 'LIMIT_EXCEEDED'],
  ['음수 revision', p => { p.revision = -1; }, 'INVALID_VALUE'],
  ['잘못된 날짜', p => { p.createdAt = 'yesterday'; }, 'INVALID_VALUE'],
  ['슬라이드 크기', p => { p.width = 1920; }, 'INVALID_VALUE'],
  ['슬라이드 0장', p => { p.slides = []; }, 'INVALID_VALUE'],
  ['슬라이드 101장', p => { p.slides = Array.from({ length: 101 }, (_, i) => ({ id: `00000000-0000-4000-8000-1${String(i).padStart(11, '0')}`, background: { kind: 'solid', color: '#FFFFFF' }, elements: [] })); }, 'LIMIT_EXCEEDED'],
  ['슬라이드 ID 중복', p => { p.slides[1].id = p.slides[0].id; }, 'INVALID_VALUE'],
  ['요소 ID 중복', p => { first(p)[1].id = first(p)[0].id; }, 'INVALID_VALUE'],
  ['요소 ID가 슬라이드 ID와 중복', p => { first(p)[0].id = p.slides[0].id; }, 'INVALID_VALUE'],
  ['좌표가 문자열', p => { first(p)[0].x = '10'; }, 'INVALID_VALUE'],
  ['좌표 범위', p => { first(p)[0].y = 2000; }, 'INVALID_VALUE'],
  ['요소가 슬라이드와 겹치지 않음', p => { first(p)[0].x = 1500; }, 'INVALID_VALUE'],
  ['목록에 없는 글꼴', p => { first(p)[2].fontId = "Arial'; x"; }, 'INVALID_VALUE'],
  ['굵은 파일이 없는 글꼴의 굵게', p => { first(p)[2].fontId = 'round-jua'; first(p)[2].bold = true; }, 'INVALID_VALUE'],
  ['잘못된 정렬', p => { first(p)[2].align = 'justify'; }, 'INVALID_VALUE'],
  ['소문자 색', p => { first(p)[2].color = '#abcdef'; }, 'INVALID_VALUE'],
  ['글씨 길이', p => { first(p)[2].text = '가'.repeat(5001); }, 'LIMIT_EXCEEDED'],
  ['빈 글씨', p => { first(p)[2].text = '   '; }, 'INVALID_VALUE'],
  ['글씨 크기', p => { first(p)[2].fontSize = 1000; }, 'INVALID_VALUE'],
  ['줄 간격', p => { first(p)[2].lineHeight = 5; }, 'INVALID_VALUE'],
  ['획 점 범위', p => { first(p)[1].points = [0, 9999]; }, 'INVALID_VALUE'],
  ['획 점 문자열', p => { first(p)[1].points = ['1', '2']; }, 'INVALID_VALUE'],
  ['획 점 초과', p => { first(p)[1].points = new Array(10002).fill(1); }, 'LIMIT_EXCEEDED'],
  ['사진 자료 없음', p => { first(p)[0].assetId = 'f'.repeat(64); }, 'ASSET_MISSING'],
  ['사진 비율 위반', p => { first(p)[0].height = 100; }, 'INVALID_VALUE'],
  ['배경 자료 없음', p => { p.slides[1].background.assetId = 'f'.repeat(64); }, 'ASSET_MISSING'],
  ['배경 채우기 값', p => { p.slides[1].background.fit = 'stretch'; }, 'INVALID_VALUE'],
  ['자료 MIME', p => { p.assetManifest[0].mime = 'image/webp'; }, 'ASSET_INVALID'],
  ['자료 ID 형식', p => { p.assetManifest[0].id = '../../x'; }, 'ASSET_INVALID'],
  ['자료 크기', p => { p.assetManifest[0].pixelWidth = 9000; }, 'ASSET_INVALID'],
  ['자료 알 수 없는 필드', p => { p.assetManifest[0].originalName = '가족.jpg'; }, 'ASSET_INVALID'],
  ['자료 중복', p => { p.assetManifest.push(p.assetManifest[0]); }, 'ASSET_INVALID'],
];
for (const [name, change, code] of bad) test(`거부: ${name} → ${code}`, () => {
  const project = loadSample(); change(project);
  expect(validateProject(project)).toMatchObject({ ok: false, code });
});
test('요소 10만 개는 거부한다', () => {
  const project = loadSample();
  project.slides[3].elements = Array.from({ length: 100000 }, (_, i) => ({ id: `00000000-0000-4000-8000-2${String(i).padStart(11, '0')}`, type: 'stroke' as const, x: 0, y: 0, points: [0, 0], color: '#000000', strokeWidth: 4 }));
  expect(validateProject(project)).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED' });
});
test('입력이 객체가 아니면 거부한다', () => { for (const value of [null, 1, 'x', []]) expect(validateProject(value)).toMatchObject({ ok: false, code: 'INVALID_VALUE' }); });

test('등록된 글꼴은 모두 통과한다', () => {
  for (const fontId of ['sans-ko', 'round-jua', 'block-dohyeon', 'hand-gamja', 'hand-pen', 'hand-gaegu']) {
    const project = loadSample(); Object.assign(first(project)[2], { fontId, bold: false });
    expect(validateProject(project)).toMatchObject({ ok: true });
  }
});
