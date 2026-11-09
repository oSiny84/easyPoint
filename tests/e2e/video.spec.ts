import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeStoreZip } from '../../src/storage/storeZip';
import { newSlideProject } from './start';

// 영상 V3: 시작 화면 → 영상 작품 목록 → 영상 편집기, 새로고침 복원, 자동 저장, 원본(.canvavideo) 왕복, 잠금, 지우기.
// 공통 영상 fixture는 tests/fixtures/video(WebM 2개 + 문서, scripts/make-video-fixture.mjs로 다시 만든다).
const FIXTURE = 'tests/fixtures/video';
const OUT = 'artifacts/video-v3';
const status = (page: Page) => page.getByRole('status');
const saveState = (page: Page) => page.getByTestId('save-state');
const videoDoc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__canvacraftVideo.store.getProject())));
const videoContent = (doc: any) => { const { id: _id, revision: _revision, createdAt: _c, updatedAt: _u, ...rest } = doc; return rest; };

async function fixtureFile(edit: (project: any) => any = project => project) {
  const project = edit(JSON.parse(await fs.readFile(path.join(FIXTURE, 'project.json'), 'utf8')));
  const entries = [
    { name: 'manifest.json', blob: new Blob([JSON.stringify({ format: 'canvavideo', schemaVersion: 1 })]) },
    { name: 'project.json', blob: new Blob([JSON.stringify(project)]) },
    ...await Promise.all(['a', 'b'].map(async (name, index) => ({ name: `media/${project.mediaManifest[index].id}.webm`, blob: new Blob([await fs.readFile(path.join(FIXTURE, `${name}.webm`))]) }))),
  ];
  return { name: '고양이.canvavideo', mimeType: 'application/zip', buffer: Buffer.from(await (await writeStoreZip(entries)).arrayBuffer()) };
}

async function videoHome(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '영상 만들기' }).click();
  await expect(page.getByRole('list', { name: '내 영상' })).toBeAttached();
}
async function openFixture(page: Page) {
  await videoHome(page);
  await page.getByTestId('open-video-file').setInputFiles(await fixtureFile());
  await expect(status(page)).toContainText('새 작품으로 열었어요');
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 5000 });
}

test('시작 화면에서 영상 편집기로 들어가고, 바꾸면 저장되며 새로고침해도 그 작품으로 돌아온다', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', request => requested.push(new URL(request.url()).pathname));
  await page.goto('/');
  await expect(page.getByRole('button', { name: '영상 만들기' })).toBeVisible();
  // 영상 편집기 코드는 타일을 누르기 전에는 받지 않는다(지연 로딩).
  expect(requested.some(item => item.endsWith('/video/VideoApp.tsx'))).toBe(false);
  await page.getByRole('button', { name: '영상 만들기' }).click();
  await expect(page.getByRole('list', { name: '내 영상' })).toBeAttached();
  expect(requested.some(item => item.endsWith('/video/VideoApp.tsx'))).toBe(true);
  await expect(page.getByText('처음이면 이렇게')).toBeVisible();

  await page.getByRole('button', { name: '새 작품' }).click();
  await expect(page.getByTestId('video-stage')).toBeVisible();
  await expect(saveState(page)).toHaveText('새 작품');
  await page.getByRole('navigation', { name: '도구' }).getByRole('button', { name: '자막' }).click();
  await expect(page.getByRole('region', { name: '자막 패널' })).toContainText('준비 중');
  await page.getByRole('textbox', { name: '작품 이름' }).fill('우리 고양이');
  await page.getByRole('textbox', { name: '작품 이름' }).press('Enter');
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 3000 });
  // 되돌리기는 키보드로도 된다.
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('textbox', { name: '작품 이름' })).toHaveValue('내 영상');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByRole('textbox', { name: '작품 이름' })).toHaveValue('우리 고양이');
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 3000 });
  const saved = await videoDoc(page);
  expect(await page.evaluate(() => sessionStorage.getItem('canvacraft.current-project'))).toBe(JSON.stringify({ kind: 'video', id: saved.id }));

  await page.reload();
  await expect(status(page)).toContainText('저장된 작품을 열었어요');
  expect(await videoDoc(page)).toEqual(saved);

  // 작품 목록 → 시작 화면: 최근 작품에 영상이 보이고 누르면 바로 영상 편집기다.
  await page.getByRole('button', { name: '작품 목록' }).click();
  await expect(page.getByRole('list', { name: '내 영상' }).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: '시작 화면' }).click();
  const recent = page.getByRole('list', { name: '최근 작품' });
  await expect(recent.getByRole('listitem')).toHaveCount(1);
  await recent.getByRole('button', { name: '영상 우리 고양이 열기' }).click();
  await expect(status(page)).toContainText('저장된 작품을 열었어요');
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'video-editor.png') });
});

test('시작 화면 최근 작품은 슬라이드와 영상을 최근순으로 섞어 6개까지 보여 준다', async ({ page }) => {
  await newSlideProject(page);
  await page.getByRole('button', { name: '페이지 추가' }).click();
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 3000 });
  // 같은 탭은 슬라이드 작품을 기억하므로 화면을 따라 시작 화면으로 간다.
  await page.getByRole('button', { name: '작품 목록' }).click();
  await page.getByRole('button', { name: '시작 화면' }).click();
  await page.getByRole('button', { name: '영상 만들기' }).click();
  // 원본 파일로 연 작품은 파일에 적힌 수정 시각(fixture: 2026-11-09 00:00 UTC)을 이어 간다(슬라이드 원본과 같다). 그래서 방금 고친 슬라이드보다 뒤에 온다.
  await page.getByTestId('open-video-file').setInputFiles(await fixtureFile());
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 5000 });
  await page.getByRole('button', { name: '작품 목록' }).click();
  await page.getByRole('button', { name: '시작 화면' }).click();
  const cards = page.getByRole('list', { name: '최근 작품' }).getByRole('listitem');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('슬라이드');
  await expect(cards.nth(1)).toContainText('영상');
  await expect(cards.nth(1)).toContainText('고양이 두 장면');
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'start.png') });
  // 슬라이드 카드는 슬라이드 편집기로 연다.
  await cards.first().getByRole('button').click();
  await expect(page.getByTestId('paper')).toBeVisible();
  expect(JSON.parse((await page.evaluate(() => sessionStorage.getItem('canvacraft.current-project')))!)).toMatchObject({ kind: 'slide' });
  // 7개째부터는 보이지 않는다.
  await page.evaluate(async () => {
    const { saveVideoProject } = await import('/src/video/videoDatabase.ts' as string);
    const { createVideoProject } = await import('/src/domain/videoProject.ts' as string);
    for (let i = 0; i < 6; i++) await saveVideoProject({ ...createVideoProject(() => crypto.randomUUID(), () => new Date(Date.UTC(2030, 0, 1, 0, 0, i)).toISOString()), title: `미래 ${i}`, revision: 1 });
  });
  await page.getByRole('button', { name: '작품 목록' }).click();
  await page.getByRole('button', { name: '시작 화면' }).click();
  await expect(cards).toHaveCount(6);
  await expect(cards.first()).toContainText('미래 5');
});

test('옛 기억 값(작품 id 문자열)은 슬라이드 작품으로 읽는다', async ({ page }) => {
  await newSlideProject(page);
  await page.getByRole('button', { name: '페이지 추가' }).click();
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 3000 });
  const id = await page.evaluate(() => (window as any).__canvacraft.store.getProject().id);
  await page.evaluate(id => sessionStorage.setItem('canvacraft.current-project', id), id);
  await page.reload();
  await expect(status(page)).toContainText('저장된 작품을 열었어요');
  await expect(page.getByTestId('paper')).toBeVisible();
});

test('원본 열기: fixture를 새 작품으로 열고 저장·새로고침·원본 저장·다른 브라우저에서 다시 열기까지 같은 내용이다', async ({ page, browser }) => {
  await openFixture(page);
  const opened = await videoDoc(page);
  const fixture = JSON.parse(await fs.readFile(path.join(FIXTURE, 'project.json'), 'utf8'));
  expect(opened.id).not.toBe(fixture.id);
  expect(videoContent(opened)).toEqual(videoContent(fixture));
  await expect(page.getByRole('list', { name: '영상 조각' }).getByRole('button')).toHaveText([/영상 1\s*0:02/, /영상 2 · 소리 끔\s*0:02/]);
  await expect(page.getByTestId('timeline-total')).toHaveText('0:04');
  await expect(page.getByTestId('preview')).toBeVisible();

  await page.reload();
  await expect(status(page)).toContainText('저장된 작품을 열었어요');
  expect(await videoDoc(page)).toEqual(opened);

  await page.getByRole('button', { name: '파일' }).click();
  await page.getByRole('menuitem', { name: '원본 저장' }).click();
  const dialog = page.getByRole('alertdialog', { name: '원본 저장' });
  await expect(dialog).toContainText('약 1MB');
  const waiting = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '내려받기' }).click();
  const download = await waiting;
  expect(download.suggestedFilename()).toBe('고양이 두 장면.canvavideo');
  await fs.mkdir(OUT, { recursive: true });
  const file = path.join(OUT, 'roundtrip.canvavideo'); await download.saveAs(file);

  const other = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const otherPage = await other.newPage();
  await videoHome(otherPage);
  await otherPage.getByTestId('open-video-file').setInputFiles(file);
  await expect(saveState(otherPage)).toHaveText('저장됨', { timeout: 5000 });
  expect(videoContent(await videoDoc(otherPage))).toEqual(videoContent(fixture));
  const bytes = await otherPage.evaluate(async ids => { const { readMedia } = await import('/src/video/mediaStore.ts' as string); return Promise.all(ids.map(async (id: string) => (await readMedia(id))?.size)); }, fixture.mediaManifest.map((media: any) => media.id));
  expect(bytes).toEqual(fixture.mediaManifest.map((media: any) => media.byteLength));
  await other.close();
});

test('원본 열기 실패: 손상·다른 형식 파일은 안내하고 지금 화면은 그대로다', async ({ page }) => {
  await openFixture(page);
  const before = await videoDoc(page);
  await page.getByTestId('open-video-file').setInputFiles({ name: '깨짐.canvavideo', mimeType: 'application/zip', buffer: Buffer.from('not a zip at all, just text') });
  await expect(status(page)).toContainText('읽지 못했어요');
  expect(await videoDoc(page)).toEqual(before);
  await page.getByTestId('open-video-file').setInputFiles(await fixtureFile(project => ({ ...project, mediaManifest: [{ ...project.mediaManifest[0], byteLength: 1 }, project.mediaManifest[1]] })));
  await expect(status(page)).toContainText('크기가 문서와 달라요');
  expect(await videoDoc(page)).toEqual(before);
  // 작품 목록에서도 같은 안내를 한다.
  await page.getByRole('button', { name: '작품 목록' }).click();
  await page.getByTestId('open-video-file').setInputFiles({ name: '슬라이드.canvavideo', mimeType: 'application/zip', buffer: Buffer.from(await (await writeStoreZip([{ name: 'manifest.json', blob: new Blob([JSON.stringify({ format: 'canvacraft', schemaVersion: 1 })]) }, { name: 'project.json', blob: new Blob(['{}']) }])).arrayBuffer()) });
  await expect(status(page)).toContainText('영상 작품 파일이 아니에요');
  await expect(page.getByRole('list', { name: '내 영상' }).getByRole('listitem')).toHaveCount(1);
});

test('같은 영상 작품을 둘째 탭에서 열면 읽기 전용이다', async ({ page, context }) => {
  await openFixture(page);
  const second = await context.newPage();
  await videoHome(second);
  await second.getByRole('button', { name: '고양이 두 장면 열기' }).click();
  await expect(saveState(second)).toHaveText('읽기 전용');
  await expect(second.getByRole('status')).toContainText('다른 탭에서 편집 중');
  await expect(second.getByRole('navigation', { name: '도구' }).getByRole('button', { name: '영상' })).toBeDisabled();
  expect(await second.evaluate(() => { const { store } = (window as any).__canvacraftVideo; const p = store.getProject(); return store.dispatch(p.id, p.revision, { type: 'renameProject', title: '바꿈' }); })).toMatchObject({ ok: false, code: 'READ_ONLY' });
  await second.close();
});

test('지우기: 확인 후 지우고, 그 작품만 쓰던 영상 바이트도 정리한다', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: '작품 목록' }).click();
  const items = page.getByRole('list', { name: '내 영상' }).getByRole('listitem');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('0:04');
  await page.getByRole('button', { name: '고양이 두 장면 지우기' }).click();
  const dialog = page.getByRole('alertdialog', { name: '작품 지우기' });
  await expect(dialog).toContainText('되돌릴 수 없어요');
  await dialog.getByRole('button', { name: '지우기' }).click();
  await expect(items).toHaveCount(0);
  await expect(status(page)).toContainText('지웠어요');
  expect(await page.evaluate(async () => (await import('/src/video/mediaStore.ts' as string)).listMediaIds())).toEqual([]);
});
