import { test, expect } from '@playwright/test';
import type { VideoCommand } from '../../src/commands/videoApply';
import { normalizeFps } from '../../src/domain/timeline';
import { createVideoProject } from '../../src/domain/videoProject';
import { validateVideoProject } from '../../src/domain/videoValidate';
import type { VideoProject } from '../../src/domain/videoTypes';
import { estimateVideoBytes } from '../../src/state/videoStore';
import { clock, nextId } from './helpers';
import { caption, catalog, lastOverlay, mediaA, mediaB, meme, runVideo, startVideo, twoClips, videoContent } from './videoHelpers';

// 영상 계약 §4·§5: 명령 18개의 실행 → 취소 → 다시 실행, 겹침 요소 따라가기, 동시 밈 수, 검사.

type Make = (project: VideoProject) => VideoCommand;
const clipId = (p: VideoProject, index = 0) => p.clips[index].id;
const overlayId = (p: VideoProject, index = 0) => p.overlays[index].id;

// 모든 명령이 쓸 수 있는 작품: 조각 2개, 자막 1개(0~2초), 스티커 1개(3~6초), 밈 영상 1개(1~4초).
function prepared() {
  const { store } = twoClips();
  runVideo(store, caption(0));
  runVideo(store, meme('cat-hop', 3000));
  runVideo(store, meme('dog-bark', 1000));
  return store;
}

const everyCommand: Record<string, Make> = {
  renameProject: () => ({ type: 'renameProject', title: '새 이름' }),
  addClip: () => ({ type: 'addClip', media: { ...mediaA, id: 'c'.repeat(64) } }),
  splitClip: p => ({ type: 'splitClip', clipId: clipId(p), atMs: 4000 }),
  trimClip: p => ({ type: 'trimClip', clipId: clipId(p), inMs: 500, outMs: 9000 }),
  deleteClip: p => ({ type: 'deleteClip', clipId: clipId(p, 1) }),
  reorderClip: p => ({ type: 'reorderClip', clipId: clipId(p), toIndex: 1 }),
  setClipMuted: p => ({ type: 'setClipMuted', clipId: clipId(p), muted: true }),
  addCaption: () => caption(8000, 3000, '새 자막'),
  updateCaption: p => ({ type: 'updateCaption', overlayId: overlayId(p), text: '바뀐 자막', color: '#ff0000' }),
  addMeme: () => meme('cat-hop', 10_000),
  setOverlayTime: p => ({ type: 'setOverlayTime', overlayId: overlayId(p), startMs: 5000, durationMs: 4000 }),
  moveOverlay: p => ({ type: 'moveOverlay', overlayId: overlayId(p), x: 100, y: 100 }),
  resizeOverlay: p => ({ type: 'resizeOverlay', overlayId: overlayId(p, 1), x: 400, y: 100, width: 400, height: 400 }),
  reorderOverlay: p => ({ type: 'reorderOverlay', overlayId: overlayId(p), toIndex: 2 }),
  duplicateOverlay: p => ({ type: 'duplicateOverlay', overlayId: overlayId(p) }),
  deleteOverlay: p => ({ type: 'deleteOverlay', overlayId: overlayId(p) }),
  setMemeSound: p => ({ type: 'setMemeSound', overlayId: overlayId(p, 1), soundOn: false }),
  setAudio: () => ({ type: 'setAudio', originalVolume: 0.5, musicId: 'happy', musicVolume: 1 }),
};

test('명령 목록이 계약의 18개와 같다', () => expect(Object.keys(everyCommand).length).toBe(18));

for (const [name, make] of Object.entries(everyCommand)) test(`${name}: 실행 → 취소 → 다시 실행`, () => {
  const store = prepared();
  const before = videoContent(store.getProject());
  const result = runVideo(store, make(store.getProject()));
  expect(result).toMatchObject({ ok: true, changed: true });
  const after = videoContent(store.getProject());
  expect(after).not.toEqual(before);
  expect(validateVideoProject(store.getProject(), catalog).ok).toBe(true);
  expect(store.undo()).toMatchObject({ ok: true, changed: true });
  expect(videoContent(store.getProject())).toEqual(before);
  expect(store.redo()).toMatchObject({ ok: true, changed: true });
  expect(videoContent(store.getProject())).toEqual(after);
});

test('첫 영상이 방향과 프레임률을 정하고, 다음 영상은 바꾸지 않는다', () => {
  const store = startVideo();
  runVideo(store, { type: 'addClip', media: mediaB });
  expect(store.getProject()).toMatchObject({ orientation: 'portrait', fps: 30 });
  runVideo(store, { type: 'addClip', media: mediaA });
  expect(store.getProject()).toMatchObject({ orientation: 'portrait', fps: 30 });
  // 조각을 모두 지운 뒤 다시 넣으면 그 영상이 다시 정한다.
  for (const clip of store.getProject().clips) runVideo(store, { type: 'deleteClip', clipId: clip.id });
  expect(store.getProject()).toMatchObject({ orientation: 'portrait', clips: [] });
  runVideo(store, { type: 'addClip', media: { ...mediaA, id: 'c'.repeat(64), fps: 25 } });
  expect(store.getProject()).toMatchObject({ orientation: 'landscape', fps: 25 });
});

test('작품 프레임률: 40 이하로 절반씩 줄이고 24·25·30 중 가장 가까운 값', () => {
  expect([60, 29.97, 23.976, 50, 120, 25, 30, 24, 48, 15].map(normalizeFps)).toEqual([30, 30, 24, 25, 30, 25, 30, 24, 24, 24]);
});

test('같은 해시의 영상을 다시 넣으면 자료는 하나, 조각만 늘어난다', () => {
  const store = startVideo();
  runVideo(store, { type: 'addClip', media: mediaA });
  runVideo(store, { type: 'addClip', media: mediaA });
  expect(store.getProject().mediaManifest).toHaveLength(1);
  expect(store.getProject().clips).toHaveLength(2);
});

test('영상 자료 등록은 addClip과 함께 되돌아가고, 조각을 지워도 자료 목록에는 남는다', () => {
  const store = startVideo();
  runVideo(store, { type: 'addClip', media: mediaA });
  store.undo();
  expect(store.getProject().mediaManifest).toEqual([]);
  store.redo();
  runVideo(store, { type: 'deleteClip', clipId: store.getProject().clips[0].id });
  expect(store.getProject().mediaManifest).toHaveLength(1);
});

test('따라가기: 앞 조각을 지우면 뒤 조각 위 자막은 앞으로 당겨지고, 지운 조각 위 자막은 함께 지워진다', () => {
  const { store, a } = twoClips();
  runVideo(store, caption(2000));                  // A 위
  runVideo(store, caption(11_000, 3000, 'B 위'));  // B의 원본 1초
  const result = runVideo(store, { type: 'deleteClip', clipId: a.id });
  expect(result).toMatchObject({ ok: true, adjustedOverlays: 1 });
  expect(store.getProject().overlays.map(item => [item.type === 'caption' && item.text, item.startMs, item.durationMs])).toEqual([['B 위', 1000, 3000]]);
  // 되돌리면 지운 자막까지 함께 돌아온다.
  store.undo();
  expect(store.getProject().overlays.map(item => item.startMs)).toEqual([2000, 11_000]);
});

test('따라가기: 앞부분을 다듬으면 같은 장면 위에 남고, 잘려 나간 구간 위 요소는 지워진다', () => {
  const { store, a } = twoClips();
  runVideo(store, caption(1000));          // 원본 1초 → 잘려 나감
  runVideo(store, caption(5000));          // 원본 5초 → 3초로
  runVideo(store, caption(12_000));        // B 원본 2초 → 10초로
  const result = runVideo(store, { type: 'trimClip', clipId: a.id, inMs: 2000, outMs: 10_000 });
  expect(result).toMatchObject({ ok: true, adjustedOverlays: 1 });
  expect(store.getProject().overlays.map(item => item.startMs)).toEqual([3000, 10_000]);
});

test('따라가기: 순서를 바꾸면 자막이 조각과 함께 움직인다', () => {
  const { store, a } = twoClips();
  runVideo(store, caption(1000, 2000, 'A'));
  runVideo(store, caption(12_000, 2000, 'B'));
  runVideo(store, { type: 'reorderClip', clipId: a.id, toIndex: 1 });
  expect(store.getProject().overlays.map(item => item.startMs)).toEqual([7000, 2000]);
});

test('따라가기: 자르기는 시각을 바꾸지 않고, 앞쪽 조각이 원래 id를 유지한다', () => {
  const { store, a } = twoClips();
  runVideo(store, caption(1000)); runVideo(store, caption(6000));
  const before = store.getProject().overlays;
  runVideo(store, { type: 'splitClip', clipId: a.id, atMs: 4000 });
  const clips = store.getProject().clips;
  expect(clips.map(clip => [clip.inMs, clip.outMs])).toEqual([[0, 4000], [4000, 10_000], [0, 6000]]);
  expect(clips[0].id).toBe(a.id);
  expect(store.getProject().overlays).toEqual(before);
  // 뒤쪽 조각을 지우면 그 위(원본 6초)의 자막만 함께 지워진다.
  runVideo(store, { type: 'deleteClip', clipId: clips[1].id });
  expect(store.getProject().overlays.map(item => item.startMs)).toEqual([1000]);
});

test('따라가기: 작품 끝을 넘게 되면 줄이고, 1초보다 짧아지면 지운다', () => {
  const { store, b } = twoClips();
  runVideo(store, caption(13_000, 3000, '줄어듦'));   // B 원본 3~6초
  runVideo(store, caption(10_500, 1500, '지워짐'));   // B 원본 0.5~2초
  // B를 원본 0~4초로 다듬으면 작품은 14초. 13초 자막은 1초로, 10.5초 자막은 그대로.
  let result = runVideo(store, { type: 'trimClip', clipId: b.id, inMs: 0, outMs: 4000 });
  expect(result).toMatchObject({ ok: true, adjustedOverlays: 1 });
  expect(store.getProject().overlays.map(item => [item.startMs, item.durationMs])).toEqual([[13_000, 1000], [10_500, 1500]]);
  // 원본 0~1초만 남기면 작품은 11초. 13초 자막은 구간째 사라지고 10.5초 자막은 0.5초가 되어 지워진다.
  result = runVideo(store, { type: 'trimClip', clipId: b.id, inMs: 0, outMs: 1000 });
  expect(result).toMatchObject({ ok: true, adjustedOverlays: 2 });
  expect(store.getProject().overlays).toEqual([]);
});

test('동시 밈 수: 밈 영상은 2개, 스티커는 4개까지이고 명령은 거부한다', () => {
  const { store } = twoClips();
  runVideo(store, meme('dog-bark', 0)); runVideo(store, meme('dog-bark', 1000));
  expect(runVideo(store, meme('dog-bark', 2000))).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED' });
  // 겹치지 않으면 된다.
  expect(runVideo(store, meme('dog-bark', 4000))).toMatchObject({ ok: true });
  for (const at of [0, 500, 1000, 1500]) expect(runVideo(store, meme('cat-hop', at))).toMatchObject({ ok: true });
  expect(runVideo(store, meme('cat-hop', 2000))).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED' });
  // 복제와 시간 변경도 같은 식이다.
  const firstClipMeme = store.getProject().overlays.find(item => item.type === 'meme' && item.memeKind === 'clip')!.id;
  expect(runVideo(store, { type: 'duplicateOverlay', overlayId: firstClipMeme })).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED' });
  const third = store.getProject().overlays.filter(item => item.type === 'meme' && item.memeKind === 'clip')[2].id;
  expect(runVideo(store, { type: 'setOverlayTime', overlayId: third, startMs: 2500, durationMs: 3000 })).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED' });
});

test('동시 밈 수: 조각 명령으로 넘게 되면 늦게 시작하는 밈부터 지운다', () => {
  const { store, a } = twoClips();
  runVideo(store, meme('dog-bark', 8000));          // A 원본 8초, 8~11초
  runVideo(store, meme('dog-bark', 11_000));        // B 원본 1초, 11~14초
  runVideo(store, meme('dog-bark', 11_500));        // B 원본 1.5초, 11.5~14.5초
  // A 끝을 8.5초로 다듬으면 B가 1.5초 앞당겨져 세 밈이 10초에 함께 보인다. 가장 늦게 시작한 밈이 지워진다.
  const result = runVideo(store, { type: 'trimClip', clipId: a.id, inMs: 0, outMs: 8500 });
  expect(result).toMatchObject({ ok: true, adjustedOverlays: 1 });
  expect(store.getProject().overlays.map(item => item.startMs)).toEqual([8000, 9500]);
});

const failures: [string, Make, string][] = [
  ['자르기 위치가 조각 끝에 너무 가까움', p => ({ type: 'splitClip', clipId: clipId(p), atMs: 50 }), 'INVALID_VALUE'],
  ['다듬은 조각이 0.1초보다 짧음', p => ({ type: 'trimClip', clipId: clipId(p), inMs: 1000, outMs: 1050 }), 'INVALID_VALUE'],
  ['다듬기가 원본 길이를 넘음', p => ({ type: 'trimClip', clipId: clipId(p), inMs: 0, outMs: 10_001 }), 'INVALID_VALUE'],
  ['보이는 시간이 작품 끝을 넘음', p => ({ type: 'setOverlayTime', overlayId: overlayId(p), startMs: 15_000, durationMs: 2000 }), 'INVALID_VALUE'],
  ['보이는 시간이 1초보다 짧음', p => ({ type: 'setOverlayTime', overlayId: overlayId(p), startMs: 0, durationMs: 900 }), 'INVALID_VALUE'],
  ['보이는 시간이 60초보다 김', p => ({ type: 'setOverlayTime', overlayId: overlayId(p), startMs: 0, durationMs: 60_001 }), 'INVALID_VALUE'],
  ['빈 자막', () => caption(0, 2000, '  \n '), 'INVALID_VALUE'],
  ['자막 200자 초과', () => caption(0, 2000, '가'.repeat(201)), 'LIMIT_EXCEEDED'],
  ['목록에 없는 밈', () => ({ ...meme('cat-hop', 0), memeId: 'no-such' }), 'ASSET_MISSING'],
  ['밈 종류가 목록과 다름', () => ({ ...meme('cat-hop', 0), memeKind: 'clip' as const }), 'INVALID_VALUE'],
  ['밈 비율이 목록과 다름', () => ({ ...meme('cat-hop', 0), height: 300 }), 'INVALID_VALUE'],
  ['화면 밖으로 완전히 나감', p => ({ type: 'moveOverlay', overlayId: overlayId(p), x: 1300, y: 100 }), 'INVALID_VALUE'],
  ['자막 폭이 캔버스보다 넓음', p => ({ type: 'updateCaption', overlayId: overlayId(p), width: 1281 }), 'INVALID_VALUE'],
  ['밈에 소리 설정이 아닌 것', p => ({ type: 'setMemeSound', overlayId: overlayId(p), soundOn: false }), 'INVALID_VALUE'],
  ['허용하지 않는 음량', () => ({ type: 'setAudio', originalVolume: 0.7 as never }), 'INVALID_VALUE'],
  ['목록에 없는 음악', () => ({ type: 'setAudio', musicId: 'no-such' }), 'ASSET_MISSING'],
  ['제목 100자 초과', () => ({ type: 'renameProject', title: 'a'.repeat(101) }), 'LIMIT_EXCEEDED'],
  ['영상 자료 필드 위반', () => ({ type: 'addClip', media: { ...mediaA, id: 'd'.repeat(64), mime: 'video/avi' as never } }), 'ASSET_INVALID'],
  ['10분 넘는 영상', () => ({ type: 'addClip', media: { ...mediaA, id: 'd'.repeat(64), durationMs: 600_001 } }), 'LIMIT_EXCEEDED'],
  ['작품 길이 10분 초과', () => ({ type: 'addClip', media: { ...mediaA, id: 'd'.repeat(64), durationMs: 590_000 } }), 'LIMIT_EXCEEDED'],
  ['없는 조각', () => ({ type: 'deleteClip', clipId: nextId() }), 'INVALID_VALUE'],
  ['범위 밖 순서', p => ({ type: 'reorderClip', clipId: clipId(p), toIndex: 2 }), 'INVALID_VALUE'],
];

for (const [name, make, code] of failures) test(`실패: ${name} → ${code}, 문서·기록 그대로`, () => {
  const store = prepared();
  const before = store.getProject(); const history = store.historySize();
  expect(runVideo(store, make(before))).toMatchObject({ ok: false, code });
  expect(store.getProject()).toBe(before);
  expect(store.historySize()).toEqual(history);
});

test('영상이 없으면 자막·밈을 넣을 수 없다', () => {
  const store = startVideo();
  expect(runVideo(store, caption(0))).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  expect(runVideo(store, meme('cat-hop', 0))).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
});

test('변화 없는 명령은 revision·기록을 늘리지 않는다', () => {
  const store = prepared(); const p = store.getProject();
  for (const command of [
    { type: 'renameProject', title: p.title }, { type: 'setClipMuted', clipId: clipId(p), muted: false }, { type: 'moveOverlay', overlayId: overlayId(p), x: 160, y: 540 },
    { type: 'reorderClip', clipId: clipId(p), toIndex: 0 }, { type: 'setAudio', originalVolume: 1 }, { type: 'trimClip', clipId: clipId(p), inMs: 0, outMs: 10_000 },
  ] as VideoCommand[]) {
    expect(runVideo(store, command)).toMatchObject({ ok: true, changed: false, revision: p.revision });
  }
  expect(store.getProject()).toBe(p);
});

test('자막을 모두 지우면 삭제이고 취소 한 번으로 돌아온다', () => {
  const store = prepared(); const id = overlayId(store.getProject());
  runVideo(store, { type: 'updateCaption', overlayId: id, text: '   ' });
  expect(store.getProject().overlays.some(item => item.id === id)).toBe(false);
  store.undo();
  expect(store.getProject().overlays[0]).toMatchObject({ id, text: '자막' });
});

test('복제: 원본 바로 앞(그리기 순서상 위), 20씩 이동, 화면 안으로 보정, 시간은 같다', () => {
  const store = prepared();
  runVideo(store, { type: 'moveOverlay', overlayId: overlayId(store.getProject(), 1), x: 960, y: 400 });
  const source = store.getProject().overlays[1];
  const result = runVideo(store, { type: 'duplicateOverlay', overlayId: source.id });
  const copy = store.getProject().overlays[2];
  expect(result).toMatchObject({ ok: true, focus: { kind: 'overlay', id: copy.id } });
  expect(copy).toMatchObject({ x: 960, y: 400, width: 320, startMs: source.startMs, durationMs: source.durationMs });
});

test('되돌리면 focus 요소를 돌려주고, 지운 요소는 되살린 요소를 가리킨다', () => {
  const store = prepared(); const p = store.getProject();
  runVideo(store, { type: 'deleteOverlay', overlayId: overlayId(p) });
  expect(store.undo()).toMatchObject({ focus: { kind: 'overlay', id: overlayId(p) } });
  runVideo(store, { type: 'deleteClip', clipId: clipId(p, 1) });
  expect(store.undo()).toMatchObject({ focus: { kind: 'clip', id: clipId(p, 1) } });
  // 다시 실행하면 지운 요소가 없으므로 선택하지 않는다.
  expect(store.redo()).toMatchObject({ focus: null });
  expect(runVideo(store, { type: 'setClipMuted', clipId: clipId(p), muted: true })).toMatchObject({ focus: { kind: 'clip', id: clipId(p) } });
});

test('읽기 전용·다른 작품·오래된 revision은 실패한다', () => {
  const store = startVideo(createVideoProject(nextId, clock()), { readOnly: true });
  expect(runVideo(store, { type: 'renameProject', title: 'x' })).toMatchObject({ ok: false, code: 'READ_ONLY' });
  const writable = startVideo(); const p = writable.getProject();
  expect(writable.dispatch(nextId(), p.revision, { type: 'renameProject', title: 'x' })).toMatchObject({ ok: false, code: 'REVISION_CONFLICT' });
  expect(writable.dispatch(p.id, p.revision + 1, { type: 'renameProject', title: 'x' })).toMatchObject({ ok: false, code: 'REVISION_CONFLICT' });
});

test('검사: 저장 형태를 그대로 통과하고, 알 수 없는 값·새 버전·빠진 자료·영상 없는 자막을 거부한다', () => {
  const p = prepared().getProject();
  expect(validateVideoProject(JSON.parse(JSON.stringify(p)), catalog)).toMatchObject({ ok: true });
  expect(validateVideoProject({ ...p, extra: 1 }, catalog)).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  expect(validateVideoProject({ ...p, schemaVersion: 2 }, catalog)).toMatchObject({ ok: false, code: 'UNSUPPORTED_VERSION' });
  expect(validateVideoProject({ ...p, kind: 'slide' }, catalog)).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  expect(validateVideoProject({ ...p, mediaManifest: p.mediaManifest.slice(1) }, catalog)).toMatchObject({ ok: false, code: 'ASSET_MISSING' });
  expect(validateVideoProject({ ...p, clips: [] }, catalog)).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  expect(validateVideoProject({ ...p, fps: 60 }, catalog)).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  expect(validateVideoProject({ ...p, clips: [...p.clips, { ...p.clips[0] }] }, catalog)).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  // 내장 목록이 비어 있으면 밈을 참조하는 문서는 열리지 않는다.
  expect(validateVideoProject(p, { meme: () => undefined, hasMusic: () => false })).toMatchObject({ ok: false, code: 'ASSET_MISSING' });
});

test('메모리 추정: 공유된 부분을 중복 합산하지 않고, 되돌리기 상한을 지킨다', () => {
  const p = prepared().getProject();
  const one = estimateVideoBytes([p]);
  expect(estimateVideoBytes([p, p])).toBe(one);
  expect(estimateVideoBytes([p, { ...p, title: 'x' }])).toBe(one);
  const store = startVideo(undefined, { maxEntries: 3 });
  runVideo(store, { type: 'addClip', media: mediaA });
  for (let i = 0; i < 5; i++) runVideo(store, { type: 'renameProject', title: `이름 ${i}` });
  expect(store.historySize().undo).toBe(3);
});
