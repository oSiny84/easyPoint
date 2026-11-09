import { test, expect, type Page } from '@playwright/test';
import { newSlideProject, slideHome } from './start';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadSample, sampleAssets } from '../contracts/helpers';

// 자동 저장·작품 목록·탭 잠금·복구(Phase 8).
const OUT = 'artifacts/phase8';
const doc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__canvacraft.store.getProject())));
const saveState = (page: Page) => page.getByTestId('save-state');
const works = (page: Page) => page.getByRole('list', { name: '내 작품' }).getByRole('listitem');
const status = (page: Page) => page.getByRole('status');
const dispatch = (page: Page, command: any) => page.evaluate(command => { const { store } = (window as any).__canvacraft; const p = store.getProject(); return store.dispatch(p.id, p.revision, command); }, command);
const addSlide = (page: Page) => page.getByRole('button', { name: '페이지 추가' }).click();
const database = (page: Page) => page.evaluate(async () => {
  const { openDatabase } = await import('/src/storage/database.ts' as string);
  const db = await openDatabase();
  const read = (store: string) => new Promise<any>(resolve => { const req = db.transaction(store).objectStore(store).getAll(); req.onsuccess = () => resolve(req.result); });
  const [projects, summaries] = [await read('projects'), await read('summaries')];
  const assetKeys = await new Promise<string[]>(resolve => { const req = db.transaction('assets').objectStore('assets').getAllKeys(); req.onsuccess = () => resolve(req.result as string[]); });
  db.close();
  return { projects: projects.map((p: any) => ({ id: p.id, title: p.title, revision: p.revision })), summaries: summaries.map((s: any) => ({ id: s.projectId, title: s.title, revision: s.revision, thumbnailRevision: s.thumbnailRevision, hasThumbnail: !!s.thumbnail })), assetKeys };
});

async function sampleFile(title = '우리 가족 소개') {
  const project = loadSample(); project.title = title; const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format: 'canvacraft', schemaVersion: 1 }));
  zip.file('project.json', JSON.stringify(project));
  for (const asset of project.assetManifest) zip.file(`assets/${asset.id}.${asset.mime === 'image/png' ? 'png' : 'jpg'}`, sampleAssets().get(asset.id)!);
  return { name: 's.canvacraft', mimeType: 'application/zip', buffer: Buffer.from(await zip.generateAsync({ type: 'uint8array' })) };
}
async function openSample(page: Page, title?: string) {
  await slideHome(page); await expect(page.getByTestId('open-file')).toBeAttached();
  await page.getByTestId('open-file').setInputFiles(await sampleFile(title));
  await expect(status(page)).toContainText('새 작품');
  await expect(saveState(page)).toHaveText('저장됨');
}

test('처음 들어오면 시작 화면이고, 새 작품은 아무것도 안 하면 저장하지 않는다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '슬라이드 만들기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '영상 만들기' })).toBeVisible();
  await expect(page.getByTestId('paper')).toHaveCount(0);
  await page.getByRole('button', { name: '슬라이드 만들기' }).click();
  await page.getByRole('button', { name: '새 작품' }).click();
  await expect(page.getByTestId('paper')).toBeVisible();
  await expect(saveState(page)).toHaveText('새 작품');
  await page.waitForTimeout(1300);
  expect((await database(page)).projects).toEqual([]);
});

test('바꾸면 저장 버튼 없이 저장되고 새로고침해도 남는다', async ({ page }) => {
  await newSlideProject(page);
  await addSlide(page);
  await expect(saveState(page)).toHaveText('변경 있음');
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 3000 });
  const saved = await doc(page);
  expect((await database(page)).projects).toEqual([{ id: saved.id, title: saved.title, revision: saved.revision }]);
  await page.reload();
  await expect(status(page)).toContainText('저장된 작품을 열었어요');
  expect(await doc(page)).toEqual(saved);
  await expect(saveState(page)).toHaveText('저장됨');
  // 다시 연 뒤에도 revision을 이어 간다.
  await addSlide(page);
  expect((await doc(page)).revision).toBe(saved.revision + 1);
});

test('탭을 숨기면 예약을 기다리지 않고 저장을 시도한다', async ({ page }) => {
  await newSlideProject(page);
  await addSlide(page);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(async () => (await database(page)).projects.length, { timeout: 500, intervals: [50] }).toBe(1);
});

test('작품 목록: 새 탭에서 저장된 작품이 미리보기와 함께 보이고 열고 돌아온다', async ({ page, context }) => {
  await fs.mkdir(OUT, { recursive: true });
  await openSample(page, '가족 소개');
  const { id } = await doc(page);
  await page.getByRole('button', { name: '작품 목록' }).click();
  await expect(works(page)).toHaveCount(1);
  await expect(works(page).first()).toContainText('가족 소개');
  await expect(works(page).first().locator('img')).toBeVisible();
  expect((await database(page)).summaries[0]).toMatchObject({ id, hasThumbnail: true, thumbnailRevision: 0 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 'home.png') });
  await page.getByRole('button', { name: '가족 소개 열기' }).click();
  await expect(status(page)).toContainText('저장된 작품을 열었어요');
  expect((await doc(page)).id).toBe(id);
  await page.getByRole('button', { name: '작품 목록' }).click();
  await expect(works(page)).toHaveCount(1);
  // 새 탭은 시작 화면에서 시작한다(기억한 작품은 탭마다 따로다).
  const other = await context.newPage();
  await slideHome(other);
  await expect(works(other)).toHaveCount(1);
  await other.close();
});

test('새 작품: 손대지 않은 빈 작품은 목록에 남지 않고, 바꾼 작품은 각각 저장된다', async ({ page }) => {
  await openSample(page, '첫째');
  await page.getByRole('button', { name: '파일' }).click();
  await page.getByRole('menuitem', { name: '새 작품' }).click();
  await expect(saveState(page)).toHaveText('새 작품');
  await page.getByRole('button', { name: '작품 목록' }).click();
  await expect(works(page)).toHaveCount(1);
  await page.getByRole('button', { name: '새 작품' }).click();
  await expect(saveState(page)).toHaveText('새 작품');
  await page.getByRole('textbox', { name: '작품 이름' }).fill('둘째');
  await page.getByRole('textbox', { name: '작품 이름' }).press('Enter');
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 3000 });
  await page.getByRole('button', { name: '작품 목록' }).click();
  await expect(works(page)).toHaveCount(2);
  // 최근에 고친 작품이 앞에 온다.
  await expect(works(page).first()).toContainText('둘째');
});

test('입력 중 작품 목록으로 가면 글씨를 확정해서 저장한다', async ({ page }) => {
  await openSample(page, '글씨');
  await page.getByRole('navigation', { name: '도구' }).getByRole('button', { name: '텍스트' }).click();
  await page.getByRole('button', { name: '본문 추가' }).click();
  await page.keyboard.type('마지막 글씨');
  await page.getByRole('button', { name: '작품 목록' }).click();
  await expect(works(page)).toHaveCount(1);
  await page.getByRole('button', { name: '글씨 열기' }).click();
  await expect(status(page)).toContainText('저장된 작품을 열었어요');
  expect((await doc(page)).slides[0].elements.at(-1).text).toBe('마지막 글씨');
});

test('지우기: 확인 후 지우고, 다른 작품이 쓰는 사진은 남긴다', async ({ page }) => {
  await openSample(page, '하나');
  await page.getByRole('button', { name: '작품 목록' }).click();
  await page.getByTestId('open-file').setInputFiles(await sampleFile('둘'));
  await expect(status(page)).toContainText('새 작품');
  await expect(saveState(page)).toHaveText('저장됨');
  const before = await database(page);
  expect(before.projects).toHaveLength(2);
  expect(before.assetKeys).toHaveLength(2);
  await page.getByRole('button', { name: '작품 목록' }).click();
  await expect(works(page)).toHaveCount(2);

  await page.getByRole('button', { name: '하나 지우기' }).click();
  const dialog = page.getByRole('alertdialog', { name: '작품 지우기' });
  await expect(dialog).toContainText('되돌릴 수 없어요');
  await dialog.getByRole('button', { name: '취소' }).click();
  await expect(works(page)).toHaveCount(2);

  // 지우기 전에 원본을 내려받을 수 있다.
  await page.getByRole('button', { name: '하나 지우기' }).click();
  const waiting = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '원본 내려받기' }).click();
  expect((await waiting).suggestedFilename()).toBe('하나.canvacraft');
  await dialog.getByRole('button', { name: '지우기' }).click();
  await expect(works(page)).toHaveCount(1);
  await expect(status(page)).toContainText('지웠어요');
  const after = await database(page);
  expect(after.projects.map((p: any) => p.title)).toEqual(['둘']);
  expect(after.assetKeys).toHaveLength(2);

  // 남은 작품은 사진까지 온전히 열린다.
  await page.getByRole('button', { name: '둘 열기' }).click();
  await expect(status(page)).toContainText('저장된 작품을 열었어요');
  await page.getByRole('button', { name: '작품 목록' }).click();
  // 마지막 작품을 지우면 사진도 함께 지워진다.
  await page.getByRole('button', { name: '둘 지우기' }).click();
  await dialog.getByRole('button', { name: '지우기' }).click();
  await expect(works(page)).toHaveCount(0);
  expect((await database(page)).assetKeys).toEqual([]);
});

test('다른 탭이 작품을 열고 있으면 지우지 않는다', async ({ page, context }) => {
  await openSample(page, '열린 작품');
  const other = await context.newPage();
  await slideHome(other);
  await expect(works(other)).toHaveCount(1);
  await other.getByRole('button', { name: '열린 작품 지우기' }).click();
  await other.getByRole('alertdialog').getByRole('button', { name: '지우기' }).click();
  await expect(other.getByRole('status')).toContainText('다른 탭');
  await expect(works(other)).toHaveCount(1);
  await other.close();
  // 내려받기·저장은 계속된다.
  await addSlide(page);
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 3000 });
});

test('같은 작품을 둘째 탭에서 열면 읽기 전용이고, 첫 탭을 닫은 뒤 새로 열면 편집된다', async ({ page, context }) => {
  await openSample(page, '탭 시험');
  const second = await context.newPage();
  await slideHome(second);
  await second.getByRole('button', { name: '탭 시험 열기' }).click();
  await expect(second.getByRole('status')).toContainText('다른 탭에서 편집 중');
  await expect(saveState(second)).toHaveText('읽기 전용');
  await expect(second.getByRole('navigation', { name: '도구' }).getByRole('button', { name: '요소' })).toBeDisabled();
  expect(await dispatch(second, { type: 'renameProject', title: '바꿈' })).toMatchObject({ ok: false, code: 'READ_ONLY' });
  // 고칠 수 있어 보이는 버튼을 두지 않는다.
  await expect(second.getByRole('button', { name: '페이지 추가' })).toHaveCount(0);
  await expect(second.getByRole('button', { name: '1번째 장 메뉴' })).toHaveCount(0);
  await expect(second.getByRole('textbox', { name: '작품 이름' })).not.toBeEditable();
  await second.mouse.click((await second.getByTestId('paper').boundingBox())!.x + 150, (await second.getByTestId('paper').boundingBox())!.y + 70);
  await expect(second.getByRole('toolbar', { name: '선택한 요소 설정' })).toHaveCount(0);
  // 장을 눌러 넘겨 보는 것은 된다.
  await second.getByRole('button', { name: '2번째 장' }).click();
  await second.getByRole('button', { name: '1번째 장' }).click();
  // 글씨를 두 번 눌러도 입력이 시작되지 않는다.
  const box = (await second.getByTestId('paper').boundingBox())!; const s = box.width / 1280;
  await second.mouse.dblclick(box.x + 150 * s, box.y + 90 * s);
  await expect(second.getByRole('textbox', { name: '슬라이드 글씨' })).toHaveCount(0);
  // 내려받기는 된다.
  const waiting = second.waitForEvent('download');
  await second.getByRole('button', { name: '파일' }).click();
  await second.getByRole('menuitem', { name: '원본 저장' }).click();
  await waiting;
  // 첫 탭은 계속 편집한다.
  await addSlide(page);
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 3000 });
  await page.close();
  await second.reload();
  await expect(second.getByRole('status')).toContainText('저장된 작품을 열었어요');
  await expect(saveState(second)).toHaveText('저장됨');
  expect((await doc(second)).slides).toHaveLength(5);
  expect(await dispatch(second, { type: 'renameProject', title: '이제 됨' })).toMatchObject({ ok: true });
});

test('서로 다른 작품은 두 탭에서 동시에 편집한다', async ({ page, context }) => {
  await openSample(page, '왼쪽');
  const second = await context.newPage();
  await slideHome(second);
  await second.getByRole('button', { name: '새 작품' }).click();
  await addSlide(second);
  await expect(saveState(second)).toHaveText('저장됨', { timeout: 3000 });
  await addSlide(page);
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 3000 });
});

test('저장에 실패하면 알려 주고 편집은 메모리에 남으며, 원본을 받을 수 있고 복구되면 다시 저장한다', async ({ page }) => {
  await openSample(page, '실패 시험');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put; (window as any).restorePut = () => { IDBObjectStore.prototype.put = original; };
    IDBObjectStore.prototype.put = function () { throw new DOMException('가득 참', 'QuotaExceededError'); };
  });
  await addSlide(page);
  await expect(saveState(page)).toHaveText('저장 실패', { timeout: 3000 });
  await expect(status(page)).toContainText('저장 공간이 부족');
  expect((await doc(page)).slides).toHaveLength(5);
  // 저장에 실패해도 원본을 내려받을 수 있고 그 파일에 마지막 내용이 들어 있다.
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '파일' }).click();
  await page.getByRole('menuitem', { name: '원본 저장' }).click();
  const saved = path.join(OUT, 'failed-save.canvacraft'); await fs.mkdir(OUT, { recursive: true }); await (await waiting).saveAs(saved);
  const zip = await JSZip.loadAsync(await fs.readFile(saved));
  expect(JSON.parse(await zip.file('project.json')!.async('string')).slides).toHaveLength(5);
  // 다른 화면으로 가려 하면 먼저 묻고, 취소하면 그대로다.
  await page.getByRole('button', { name: '작품 목록' }).click();
  const dialog = page.getByRole('alertdialog', { name: '저장 실패' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '취소' }).click();
  await expect(page.getByTestId('paper')).toBeVisible();
  // 복구되면 다시 저장된다.
  await page.evaluate(() => (window as any).restorePut());
  await addSlide(page);
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 3000 });
  expect((await database(page)).projects[0].revision).toBe((await doc(page)).revision);
});

test('저장이 끊겨도 이전 문서는 온전하고, 남은 사진은 작품을 닫으면 정리된다', async ({ page }) => {
  await openSample(page, '복구 시험');
  const saved = await doc(page);
  // 사진만 기록되고 문서 기록 전에 탭이 닫힌 상태를 만든다.
  await page.evaluate(async () => {
    const { openDatabase } = await import('/src/storage/database.ts' as string);
    const db = await openDatabase();
    await new Promise<void>(resolve => { const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').put({ id: 'f'.repeat(64), blob: new Blob(['x']) }); tx.oncomplete = () => resolve(); });
    db.close();
  });
  expect((await database(page)).assetKeys).toHaveLength(3);
  await page.reload();
  await expect(status(page)).toContainText('저장된 작품을 열었어요');
  expect(await doc(page)).toEqual(saved);
  // 작품을 연 동안에는 지우지 않고, 닫으면 정리한다.
  expect((await database(page)).assetKeys).toHaveLength(3);
  await page.getByRole('button', { name: '작품 목록' }).click();
  await expect(works(page)).toHaveCount(1);
  await expect.poll(async () => (await database(page)).assetKeys.length).toBe(2);
});

test('강제로 닫아도 마지막 저장본으로 열린다', async ({ page, context }) => {
  await openSample(page, '강제 종료');
  await addSlide(page);
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 3000 });
  const saved = await doc(page);
  await dispatch(page, { type: 'renameProject', title: '저장 전에 닫힘' });
  await page.close({ runBeforeUnload: false });
  const next = await context.newPage();
  await slideHome(next);
  await expect(works(next)).toHaveCount(1);
  await expect(works(next).first()).toContainText('강제 종료');
  await next.getByRole('button', { name: '강제 종료 열기' }).click();
  await expect(next.getByRole('status')).toContainText('저장된 작품을 열었어요');
  expect(await doc(next)).toEqual(saved);
});

test('사진·글씨·그림이 섞인 작품이 재시작과 원본 파일 왕복에서 복원된다', async ({ page, browser }) => {
  await openSample(page, '왕복');
  await page.getByRole('navigation', { name: '도구' }).getByRole('button', { name: '그리기' }).click();
  const box = (await page.getByTestId('paper').boundingBox())!; const s = box.width / 1280;
  await page.mouse.move(box.x + 100 * s, box.y + 600 * s); await page.mouse.down(); await page.mouse.move(box.x + 500 * s, box.y + 650 * s, { steps: 5 }); await page.mouse.up();
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 3000 });
  const saved = await doc(page);
  await page.reload();
  await expect(status(page)).toContainText('저장된 작품을 열었어요');
  expect(await doc(page)).toEqual(saved);
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '파일' }).click();
  await page.getByRole('menuitem', { name: '원본 저장' }).click();
  await fs.mkdir(OUT, { recursive: true });
  const file = path.join(OUT, 'roundtrip.canvacraft'); await (await waiting).saveAs(file);
  const other = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const otherPage = await other.newPage();
  await newSlideProject(otherPage);
  await otherPage.getByTestId('open-file').setInputFiles(file);
  await expect(saveState(otherPage)).toHaveText('저장됨', { timeout: 3000 });
  const opened = await doc(otherPage);
  expect(opened.slides[0].elements.at(-1).type).toBe('stroke');
  expect(opened.slides.map((slide: any) => slide.elements.length)).toEqual(saved.slides.map((slide: any) => slide.elements.length));
  await other.close();
});

test('오래된 저장은 새 revision을 덮어쓰지 못한다', async ({ page }) => {
  await openSample(page, '순서');
  await addSlide(page);
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 3000 });
  const latest = await doc(page);
  const result = await page.evaluate(async latest => {
    const { saveProject, openProject } = await import('/src/storage/database.ts' as string);
    const { assets } = (window as any).__canvacraft;
    const older = { ...latest, title: '늦게 도착한 저장', revision: latest.revision - 1 };
    const outcome = await saveProject(older, async (id: string) => assets.get(id));
    const stored = await openProject(latest.id);
    return { outcome, storedTitle: stored?.project?.title, storedRevision: stored?.project?.revision };
  }, latest);
  expect(result.outcome).toMatchObject({ ok: false, code: 'REVISION_CONFLICT' });
  expect(result.storedTitle).toBe(latest.title);
  expect(result.storedRevision).toBe(latest.revision);
});

test('잠금을 지원하지 않는 브라우저는 읽기 전용으로 열고 까닭을 알린다', async ({ page }) => {
  await openSample(page, '잠금 없음');
  await page.addInitScript(() => { Object.defineProperty(navigator, 'locks', { configurable: true, get: () => undefined }); });
  await page.reload();
  await expect(saveState(page)).toHaveText('읽기 전용');
  await expect(status(page)).toContainText('브라우저');
  expect(await dispatch(page, { type: 'renameProject', title: '바꿈' })).toMatchObject({ ok: false, code: 'READ_ONLY' });
});

test('파일을 연 직후에는 저장을 마치기 전까지 저장됨으로 표시하지 않는다', async ({ page }) => {
  await newSlideProject(page);
  await page.evaluate(() => {
    const seen: string[] = []; (window as any).labels = seen;
    let last = '';
    new MutationObserver(() => { const text = document.querySelector('[data-testid=save-state]')?.textContent ?? ''; if (text !== last) { last = text; seen.push(text); } }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await page.getByTestId('open-file').setInputFiles(await sampleFile('표시 시험'));
  await expect(saveState(page)).toHaveText('저장됨');
  const labels = await page.evaluate(() => (window as any).labels as string[]);
  expect(labels.indexOf('저장됨')).toBeGreaterThan(labels.indexOf('저장 중…'));
  expect(labels).toContain('저장 중…');
  // 저장됨이 보이는 때에는 저장소에 이미 있다.
  expect((await database(page)).projects.map((row: any) => row.title)).toEqual(['표시 시험']);
});
