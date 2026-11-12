import { test, expect, type Page } from '@playwright/test';
import { loadComicSample } from '../contracts/comicHelpers';
import { ids, sampleAssets } from '../contracts/helpers';

// 만화 계약 §6 저장소: IndexedDB canvacraft-comic(projects·summaries·assets), 저장 순서, 오래된 revision 거부,
// 고아 사진 정리, 삭제, 잠금 이름. 브라우저 안에서 모듈을 직접 부른다. 슬라이드·애니메이션 저장소는 건드리지 않아야 한다.
async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '슬라이드 만들기' })).toBeVisible();
}
const input = () => ({ project: loadComicSample(), assets: [...sampleAssets()].map(([id, bytes]) => [id, Buffer.from(bytes).toString('base64')] as [string, string]) });

// 브라우저 안 도우미: 샘플 문서와 사진을 되살리고 저장소 모듈을 불러온다.
const SETUP = `
  const db = await import('/src/comic/comicDatabase.ts');
  const slideDb = await import('/src/storage/database.ts');
  const animationDb = await import('/src/animation/animationDatabase.ts');
  const blobs = new Map(input.assets.map(([id, base64]) => [id, new Blob([Uint8Array.from(atob(base64), char => char.charCodeAt(0))])]));
  const resolve = async id => blobs.get(id);
  const sample = (changes = {}) => ({ ...input.project, id: crypto.randomUUID(), ...changes });
  const openRaw = () => new Promise((done, fail) => { const request = indexedDB.open('canvacraft-comic', 1); request.onsuccess = () => done(request.result); request.onerror = () => fail(request.error); });
  const assetKeys = async () => { const opened = await openRaw(); try { return await new Promise((done, fail) => { const request = opened.transaction('assets').objectStore('assets').getAllKeys(); request.onsuccess = () => done(request.result); request.onerror = () => fail(request.error); }); } finally { opened.close(); } };
`;
const run = <T>(page: Page, body: string): Promise<T> => page.evaluate(`(async input => { ${SETUP} ${body} })(${JSON.stringify(input())})`) as Promise<T>;

test('저장·다시 열기: 문서·요약·사진을 저장하고, 슬라이드·애니메이션 저장소에는 아무것도 생기지 않는다', async ({ page }) => {
  await ready(page);
  const result = await run<Record<string, any>>(page, `
    const doc = sample({ title: '고양이 탐정', revision: 3 });
    const saved = await db.saveComicProject(doc, resolve);
    const summaries = await db.listComicSummaries();
    const opened = await db.openComicProject(doc.id);
    const sizes = opened.ok ? [...opened.assets].map(([id, blob]) => [id, blob.size]) : [];
    return { saved, summaries, opened: opened.ok ? opened.project : opened, same: opened.ok && JSON.stringify(opened.project) === JSON.stringify(doc), sizes, expectedSizes: [...blobs].map(([id, blob]) => [id, blob.size]),
      slideSummaries: await slideDb.listSummaries(), animationSummaries: await animationDb.listAnimationSummaries(), databases: (await indexedDB.databases()).map(item => item.name).sort() };
  `);
  expect(result.saved).toEqual({ ok: true, revision: 3 });
  expect(result.summaries).toHaveLength(1);
  // 요약: 칸 4개는 4칸 배치에서 한 쪽이다(계약 §3).
  expect(result.summaries[0]).toMatchObject({ kind: 'comic', title: '고양이 탐정', revision: 3, panelCount: 4, pageCount: 1, thumbnail: null, thumbnailRevision: null });
  expect(result.same).toBe(true);
  expect(result.opened).toMatchObject({ kind: 'comic', layout: 'grid4', bubbles: { [ids.photo1]: ids.body } });
  expect(result.sizes.sort()).toEqual(result.expectedSizes.sort());
  expect(result.slideSummaries).toEqual([]);
  expect(result.animationSummaries).toEqual([]);
  expect(result.databases).toContain('canvacraft-comic');
});

test('오래된 revision은 새 저장본을 덮어쓰지 못하고, 미리보기는 준비된 것만 바뀐다', async ({ page }) => {
  await ready(page);
  const result = await run<Record<string, any>>(page, `
    const doc = sample({ revision: 5 });
    const thumbnail = new Blob(['thumb'], { type: 'image/jpeg' });
    await db.saveComicProject(doc, resolve, { thumbnail: { blob: thumbnail, revision: 5 } });
    const older = await db.saveComicProject({ ...doc, title: '늦게 도착한 저장', revision: 4 }, resolve);
    const newer = await db.saveComicProject({ ...doc, title: '새 이름', revision: 6, layout: 'rows3' }, resolve);
    const [summary] = await db.listComicSummaries();
    const opened = await db.openComicProject(doc.id);
    return { older, newer, title: opened.project.title, revision: opened.project.revision, summary: { title: summary.title, pageCount: summary.pageCount, thumbnailRevision: summary.thumbnailRevision, thumbnailSize: summary.thumbnail.size } };
  `);
  expect(result.older).toMatchObject({ ok: false, code: 'REVISION_CONFLICT' });
  expect(result.newer).toEqual({ ok: true, revision: 6 });
  expect(result).toMatchObject({ title: '새 이름', revision: 6 });
  // 미리보기를 주지 않은 저장은 예전 그림과 그 revision을 유지한다. 쪽 수는 새 배치(3칸)로 다시 계산된다.
  expect(result.summary).toEqual({ title: '새 이름', pageCount: 2, thumbnailRevision: 5, thumbnailSize: 5 });
});

test('문서가 쓰는 사진이 없으면 저장하지 않고, 쓰지 않는 사진은 없어도 저장하고 연다', async ({ page }) => {
  await ready(page);
  const result = await run<Record<string, any>>(page, `
    const doc = sample();
    const missing = await db.saveComicProject(doc, async () => undefined);
    const afterMissing = await db.listComicSummaries();
    // 둘째 칸(배경 사진)을 뺀 문서: 그 사진은 자료 목록에만 남는다.
    const backgroundId = doc.slides[1].background.assetId;
    const trimmed = { ...doc, slides: doc.slides.filter((slide, index) => index !== 1) };
    const saved = await db.saveComicProject(trimmed, async id => id === backgroundId ? undefined : blobs.get(id));
    const opened = await db.openComicProject(doc.id);
    return { missing, afterMissing, saved, openedOk: opened.ok, assetCount: opened.ok ? opened.assets.size : -1, keys: await assetKeys() };
  `);
  expect(result.missing).toMatchObject({ ok: false, code: 'ASSET_MISSING' });
  expect(result.afterMissing).toEqual([]);
  expect(result.saved).toMatchObject({ ok: true });
  expect(result).toMatchObject({ openedOk: true, assetCount: 1 });
  expect(result.keys).toHaveLength(1);
});

test('저장된 문서가 검사를 통과하지 못하면 열지 않는다', async ({ page }) => {
  await ready(page);
  const result = await run<Record<string, any>>(page, `
    const doc = sample();
    await db.saveComicProject(doc, resolve);
    const opened = await openRaw();
    // 짝이 가리키는 글씨를 문서에서 뺀 상태로 바꿔 쓴다.
    const broken = { ...doc, slides: doc.slides.map((slide, index) => index === 0 ? { ...slide, elements: slide.elements.filter(element => element.id !== '${ids.body}') } : slide) };
    await new Promise((done, fail) => { const tx = opened.transaction('projects', 'readwrite'); tx.objectStore('projects').put(broken); tx.oncomplete = done; tx.onerror = () => fail(tx.error); });
    opened.close();
    return { broken: await db.openComicProject(doc.id), unknown: await db.openComicProject(crypto.randomUUID()) };
  `);
  expect(result.broken).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  expect(result.unknown).toMatchObject({ ok: false, code: 'INVALID_VALUE', message: '저장된 작품을 찾을 수 없어요.' });
});

test('작품 삭제와 고아 사진 정리: 다른 작품이 쓰는 사진은 남기고, 아무도 쓰지 않는 사진만 지운다', async ({ page }) => {
  await ready(page);
  const result = await run<Record<string, any>>(page, `
    const one = sample({ title: '하나' }), two = sample({ title: '둘' });
    await db.saveComicProject(one, resolve); await db.saveComicProject(two, resolve);
    const before = (await assetKeys()).length;
    await db.deleteComicProject(one.id);
    const afterFirst = { keys: (await assetKeys()).length, titles: (await db.listComicSummaries()).map(row => row.title), two: (await db.openComicProject(two.id)).ok };
    // 자료 목록에서 빠진 사진은 정리 때 지워진다.
    const backgroundId = two.slides[1].background.assetId;
    await db.saveComicProject({ ...two, revision: 1, slides: two.slides.filter((slide, index) => index !== 1), assetManifest: two.assetManifest.filter(asset => asset.id !== backgroundId) }, resolve);
    const removed = await db.removeOrphanComicAssets();
    const afterTrim = await assetKeys();
    await db.deleteComicProject(two.id);
    return { before, afterFirst, removed, afterTrim, backgroundId, afterAll: { keys: (await assetKeys()).length, summaries: (await db.listComicSummaries()).length } };
  `);
  expect(result.before).toBe(2);
  expect(result.afterFirst).toEqual({ keys: 2, titles: ['둘'], two: true });
  expect(result.removed).toBe(1);
  expect(result.afterTrim).toHaveLength(1);
  expect(result.afterTrim).not.toContain(result.backgroundId);
  expect(result.afterAll).toEqual({ keys: 0, summaries: 0 });
});

test('잠금 이름: 만화 잠금은 같은 id의 슬라이드·영상·애니메이션 잠금과 충돌하지 않고, 둘째 탭은 읽기 전용이며, 열린 작품이 있으면 정리를 미룬다', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const { acquireSession, withExclusiveCatalog, ANIMATION_LOCKS, COMIC_LOCKS, VIDEO_LOCKS } = await import('/src/storage/locks.ts' as string);
    const id = crypto.randomUUID();
    const comic = await acquireSession(id, COMIC_LOCKS), slide = await acquireSession(id), video = await acquireSession(id, VIDEO_LOCKS), animation = await acquireSession(id, ANIMATION_LOCKS), again = await acquireSession(id, COMIC_LOCKS);
    const busy = await withExclusiveCatalog(async () => 'ran', COMIC_LOCKS);
    const out = { comic: comic.readOnly, slide: slide.readOnly, video: video.readOnly, animation: animation.readOnly, again: again.readOnly, reason: again.reason, busy };
    comic.release(); slide.release(); video.release(); animation.release(); again.release();
    // 잠금은 release를 부른 뒤 브라우저가 다음 차례에 풀어 준다.
    await new Promise(resolve => setTimeout(resolve, 100));
    return { ...out, free: await withExclusiveCatalog(async () => 'ran', COMIC_LOCKS) };
  });
  expect(result).toEqual({ comic: false, slide: false, video: false, animation: false, again: true, reason: 'other-tab', busy: { busy: true }, free: { busy: false, value: 'ran' } });
});
