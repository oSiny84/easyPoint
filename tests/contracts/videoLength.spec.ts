import { test, expect } from '@playwright/test';
import { totalMs } from '../../src/domain/timeline';
import { describeLength, isLengthLimit, limitsFor, type LengthLimit } from '../../src/domain/videoLength';
import { validateVideoProject } from '../../src/domain/videoValidate';
import type { Media } from '../../src/domain/videoTypes';
import { formatDuration } from '../../src/video/format';
import { catalog, mediaA, runVideo, startVideo } from './videoHelpers';

// 영상 길이 한도 설정(계약 §5, 2026-11-10): 작품을 늘리는 명령만 설정을 따르고, 이미 있는 작품은 한도와 상관없이 열린다.
const MINUTE = 60_000, GiB = 1024 ** 3;
const media = (id: string, durationMs: number, byteLength = 5_000_000): Media => ({ ...mediaA, id: id.repeat(64), durationMs, byteLength });
const storeWith = (limit: LengthLimit) => { let value = limit; const store = startVideo(undefined, { lengthLimit: () => value }); return { store, set: (next: LengthLimit) => { value = next; } }; };

test('한도 표시와 설정값 검사: 분·시간·무제한, 1분 ~ 99시간, 분 단위', () => {
  expect([10 * MINUTE, 60 * MINUTE, 90 * MINUTE, 120 * MINUTE, null].map(describeLength)).toEqual(['10분', '1시간', '1시간 30분', '2시간', '무제한']);
  expect([MINUTE, 99 * 60 * MINUTE, null].every(isLengthLimit)).toBe(true);
  expect([0, 30_000, 100 * 60 * MINUTE, 1.5 * MINUTE, '10', undefined].some(isLengthLimit)).toBe(false);
  expect([59_000, 600_000, 3_599_000, 3_600_000, 5_430_000].map(formatDuration)).toEqual(['0:59', '10:00', '59:59', '1:00:00', '1:30:30']);
});

test('파일 크기 한도는 길이 한도에 비례한다(10분마다 2GiB·합계 4GiB, 무제한은 없음)', () => {
  expect(limitsFor(10 * MINUTE)).toEqual({ totalMs: 600_000, mediaDurationMaxMs: 600_000, mediaBytesMax: 2 * GiB, mediaTotalBytes: 4 * GiB });
  expect(limitsFor(5 * MINUTE).mediaBytesMax).toBe(2 * GiB);
  expect(limitsFor(25 * MINUTE)).toMatchObject({ mediaBytesMax: 6 * GiB, mediaTotalBytes: 12 * GiB });
  expect(limitsFor(null)).toEqual({ totalMs: Infinity, mediaDurationMaxMs: Infinity, mediaBytesMax: Infinity, mediaTotalBytes: Infinity });
});

test('기본(설정 없음)은 10분이고, 안내에 한도가 나온다', () => {
  const store = startVideo();
  expect(runVideo(store, { type: 'addClip', media: media('d', 600_001) })).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED', message: '영상이 너무 길어요. 10분까지 넣을 수 있어요.' });
  expect(runVideo(store, { type: 'addClip', media: media('d', 600_000, 2 * GiB + 1) })).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED', message: '영상 파일이 너무 커요. 2GB까지 넣을 수 있어요.' });
});

test('한도를 늘리면 긴 영상과 큰 파일을 넣을 수 있고, 무제한은 몇 시간짜리도 받는다', () => {
  const { store } = storeWith(30 * MINUTE);
  expect(runVideo(store, { type: 'addClip', media: media('d', 20 * MINUTE, 5 * GiB) })).toMatchObject({ ok: true });
  expect(runVideo(store, { type: 'addClip', media: media('e', 15 * MINUTE) })).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED', message: '작품이 너무 길어져요. 30분까지 만들 수 있어요.' });
  expect(runVideo(store, { type: 'addClip', media: media('e', 5 * MINUTE, 7 * GiB) })).toMatchObject({ ok: false, message: '영상 파일이 너무 커요. 6GB까지 넣을 수 있어요.' });
  const free = storeWith(null).store;
  expect(runVideo(free, { type: 'addClip', media: media('d', 3 * 60 * MINUTE, 20 * GiB) })).toMatchObject({ ok: true });
  expect(runVideo(free, { type: 'addClip', media: media('e', 2 * 60 * MINUTE, 15 * GiB) })).toMatchObject({ ok: true });
  expect(totalMs(free.getProject().clips)).toBe(5 * 60 * MINUTE);
  expect(validateVideoProject(free.getProject(), catalog)).toMatchObject({ ok: true });
});

test('한도를 줄여도 이미 만든 긴 작품은 열리고, 줄이는 편집은 되며, 늘리는 편집만 막는다', () => {
  const { store, set } = storeWith(60 * MINUTE);
  runVideo(store, { type: 'addClip', media: media('d', 40 * MINUTE) });
  set(10 * MINUTE);
  const p = store.getProject();
  expect(validateVideoProject(JSON.parse(JSON.stringify(p)), catalog)).toMatchObject({ ok: true });
  const clipId = p.clips[0].id;
  // 줄이기(다듬기·빠르게)는 한도를 넘은 채로도 된다.
  expect(runVideo(store, { type: 'trimClip', clipId, inMs: 0, outMs: 30 * MINUTE })).toMatchObject({ ok: true });
  expect(runVideo(store, { type: 'setClipSpeed', clipId, speed: 2 })).toMatchObject({ ok: true });
  // 늘리기(느리게·영상 더하기·다시 늘리기)는 막는다.
  expect(runVideo(store, { type: 'setClipSpeed', clipId, speed: 0.5 })).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED', message: '작품이 너무 길어져요. 10분까지 만들 수 있어요.' });
  expect(runVideo(store, { type: 'addClip', media: media('e', MINUTE) })).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED' });
  expect(runVideo(store, { type: 'trimClip', clipId, inMs: 0, outMs: 40 * MINUTE })).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED' });
  // 한도를 다시 늘리면 된다(설정은 명령마다 읽는다).
  set(null);
  expect(runVideo(store, { type: 'addClip', media: media('e', MINUTE) })).toMatchObject({ ok: true });
});
