import { test, expect, type Page } from '@playwright/test';

// 영상 계약 §6 저장소: OPFS 바이트(조각 해시 id), IndexedDB canvacraft-video, 잠금 이름, 고아 정리, 삭제. 브라우저 안에서 모듈을 직접 부른다.

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '영상 만들기' })).toBeVisible();
}

// 브라우저 안에서 쓰는 도우미: 임의 바이트 영상 자료를 저장소에 넣고 문서를 만든다.
const SETUP = `
  const media = await import('/src/video/mediaStore.ts');
  const db = await import('/src/video/videoDatabase.ts');
  const { mediaId } = await import('/src/storage/mediaHash.ts');
  const { createVideoProject, EMPTY_CATALOG } = await import('/src/domain/videoProject.ts');
  const { createVideoStore } = await import('/src/state/videoStore.ts');
  const random = size => { const data = new Uint8Array(size); for (let i = 0; i < size; i += 65536) crypto.getRandomValues(data.subarray(i, Math.min(size, i + 65536))); return new Blob([data]); };
  const describe = (id, byteLength, durationMs = 5000) => ({ id, mime: 'video/webm', byteLength, durationMs, width: 640, height: 360, rotation: 0, fps: 30, hasAudio: false, videoCodec: 'vp09.00.10.08', audioCodec: null });
  const project = (...items) => { const store = createVideoStore(createVideoProject(() => crypto.randomUUID(), () => new Date().toISOString()), { catalog: EMPTY_CATALOG }); for (const item of items) { const p = store.getProject(); const r = store.dispatch(p.id, p.revision, { type: 'addClip', media: item }); if (!r.ok) throw new Error(r.message); } return store.getProject(); };
`;
const run = <T>(page: Page, body: string): Promise<T> => page.evaluate(`(async () => { ${SETUP} ${body} })()`) as Promise<T>;

test('영상 바이트: 복사하면서 계산한 id가 조각 해시와 같고, 같은 영상은 한 번만 저장한다', async ({ page }) => {
  await ready(page);
  const result = await run<Record<string, unknown>>(page, `
    const blob = random(20 * 1024 * 1024 + 4321);
    const first = await media.storeMedia(blob);
    const second = await media.storeMedia(blob);
    const stored = await media.readMedia(first.id);
    const same = new Uint8Array(await stored.slice(9_000_000, 9_000_100).arrayBuffer()).join() === new Uint8Array(await blob.slice(9_000_000, 9_000_100).arrayBuffer()).join();
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('canvacraft-video');
    const temp = []; for await (const [name] of (await root.getDirectoryHandle('tmp')).entries()) temp.push(name);
    return { first, second, expected: await mediaId(blob), size: stored.size, same, ids: await media.listMediaIds(), temp };
  `);
  expect(result.first).toMatchObject({ ok: true, byteLength: 20 * 1024 * 1024 + 4321 });
  expect((result.first as { id: string }).id).toBe(result.expected);
  expect(result.second).toEqual(result.first);
  expect(result).toMatchObject({ size: 20 * 1024 * 1024 + 4321, same: true, temp: [] });
  expect(result.ids).toEqual([result.expected]);
});

test('영상 바이트: 남은 자리가 파일 크기의 1.1배보다 작으면 복사하지 않는다', async ({ page }) => {
  await ready(page);
  const result = await run<Record<string, unknown>>(page, `
    const estimate = navigator.storage.estimate.bind(navigator.storage);
    navigator.storage.estimate = async () => { const real = await estimate(); return { ...real, quota: real.usage + 1_000_000 }; };
    const full = await media.storeMedia(random(1_000_000));
    navigator.storage.estimate = estimate;
    return { full, ids: await media.listMediaIds() };
  `);
  expect(result).toMatchObject({ full: { ok: false, code: 'STORAGE_FULL' }, ids: [] });
});

test('저장·다시 열기: 문서와 요약을 함께 저장하고, 오래된 revision은 덮어쓰지 못하며, 바이트가 없으면 열지 않는다', async ({ page }) => {
  await ready(page);
  const result = await run<Record<string, unknown>>(page, `
    const a = await media.storeMedia(random(300_000)), b = await media.storeMedia(random(200_000));
    const doc = project(describe(a.id, 300_000), describe(b.id, 200_000, 3000));
    const saved = await db.saveVideoProject(doc);
    const summaries = await db.listVideoSummaries();
    const opened = await db.openVideoProject(doc.id, EMPTY_CATALOG);
    const conflict = await db.saveVideoProject({ ...doc, revision: doc.revision - 1, title: '늦은 저장' });
    const reopened = await db.openVideoProject(doc.id, EMPTY_CATALOG);
    // 조각이 쓰지 않는 영상의 바이트가 없으면 목록에서만 뺀다. 조각이 쓰는 영상이면 열지 않는다.
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('canvacraft-video');
    const withUnused = { ...doc, revision: doc.revision + 1, mediaManifest: [...doc.mediaManifest, describe('f'.repeat(64), 10)] };
    const store = await (await db.openVideoDatabase()); await new Promise(r => { const tx = store.transaction('projects', 'readwrite'); tx.objectStore('projects').put(withUnused); tx.oncomplete = r; }); store.close();
    const dropped = await db.openVideoProject(doc.id, EMPTY_CATALOG);
    await (await root.getDirectoryHandle('media')).removeEntry(b.id);
    const missing = await db.openVideoProject(doc.id, EMPTY_CATALOG);
    const unsaved = await db.saveVideoProject({ ...doc, revision: doc.revision + 5 });
    return { saved, summaries, same: JSON.stringify(opened.project) === JSON.stringify(doc), conflict, title: reopened.project.title, droppedCount: dropped.project?.mediaManifest.length, missing, unsaved, revision: doc.revision };
  `);
  expect(result.saved).toMatchObject({ ok: true });
  expect(result.summaries).toEqual([expect.objectContaining({ kind: 'video', durationMs: 8000, thumbnail: null, title: '내 영상' })]);
  expect(result).toMatchObject({ same: true, conflict: { ok: false, code: 'REVISION_CONFLICT' }, title: '내 영상', droppedCount: 2, missing: { ok: false, code: 'ASSET_MISSING' }, unsaved: { ok: false, code: 'ASSET_MISSING' } });
});

test('지우기와 고아 정리: 다른 작품이 쓰는 영상은 남기고, 편집 세션이 있으면 정리하지 않는다', async ({ page }) => {
  await ready(page);
  const result = await run<Record<string, unknown>>(page, `
    const { withExclusiveCatalog, acquireSession, VIDEO_LOCKS } = await import('/src/storage/locks.ts');
    const shared = await media.storeMedia(random(100_000)), own = await media.storeMedia(random(50_000)), loose = await media.storeMedia(random(10_000));
    const one = project(describe(shared.id, 100_000), describe(own.id, 50_000)), two = project(describe(shared.id, 100_000));
    await db.saveVideoProject(one); await db.saveVideoProject(two);
    // 편집 세션(공유 잠금)이 있으면 배타 잠금을 얻지 못해 미룬다.
    const session = await acquireSession(two.id, VIDEO_LOCKS);
    const busy = await withExclusiveCatalog(() => db.deleteVideoProject(one.id), VIDEO_LOCKS);
    session.release();
    // 잠금 해제는 비동기로 끝나므로 풀릴 때까지 몇 번 다시 시도한다.
    let deleted = { busy: true };
    for (let i = 0; i < 20 && deleted.busy; i++) { await new Promise(r => setTimeout(r, 25)); deleted = await withExclusiveCatalog(() => db.deleteVideoProject(one.id), VIDEO_LOCKS); }
    const ids = await media.listMediaIds();
    const summaries = (await db.listVideoSummaries()).map(row => row.projectId);
    return { busy, deleted: deleted.busy, ids, expected: [shared.id], summaries, two: two.id, sessionWritable: !session.readOnly, loose: loose.id };
  `);
  expect(result.busy).toEqual({ busy: true });
  expect(result).toMatchObject({ deleted: false, sessionWritable: true });
  expect(result.ids).toEqual(result.expected);
  expect(result.summaries).toEqual([result.two]);
});

test('잠금 이름: 영상 작품 잠금은 같은 id의 슬라이드 잠금과 충돌하지 않고, 둘째 탭은 읽기 전용이다', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const { acquireSession, VIDEO_LOCKS } = await import('/src/storage/locks.ts' as string);
    const id = crypto.randomUUID();
    const video = await acquireSession(id, VIDEO_LOCKS), slide = await acquireSession(id), again = await acquireSession(id, VIDEO_LOCKS);
    const out = { video: video.readOnly, slide: slide.readOnly, again: again.readOnly, reason: again.reason };
    video.release(); slide.release(); again.release();
    return out;
  });
  expect(result).toEqual({ video: false, slide: false, again: true, reason: 'other-tab' });
});
