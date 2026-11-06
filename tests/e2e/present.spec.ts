import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { loadSample, sampleAssets } from '../contracts/helpers';

// 발표와 출력 화면(Phase 9).
const OUT = 'artifacts/phase9';
const doc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__canvacraft.store.getProject())));
const stage = (page: Page) => page.getByRole('dialog', { name: '발표' });
const count = (page: Page) => page.getByTestId('presenter-count');
const shown = (page: Page) => page.getByTestId('presenter-slide');
const current = (page: Page) => page.getByRole('list', { name: '슬라이드 목록' }).locator('button[aria-current="true"]');

async function sampleFile() {
  const project = loadSample(); const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format: 'canvacraft', schemaVersion: 1 }));
  zip.file('project.json', JSON.stringify(project));
  for (const asset of project.assetManifest) zip.file(`assets/${asset.id}.${asset.mime === 'image/png' ? 'png' : 'jpg'}`, sampleAssets().get(asset.id)!);
  return { name: 's.canvacraft', mimeType: 'application/zip', buffer: Buffer.from(await zip.generateAsync({ type: 'uint8array' })) };
}
async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/'); await expect(page.getByTestId('paper')).toBeVisible();
  await page.getByTestId('open-file').setInputFiles(await sampleFile());
  await expect(page.getByTestId('save-state')).toHaveText('저장됨');
}
async function present(page: Page) {
  await page.getByRole('button', { name: '발표' }).click();
  await expect(stage(page)).toBeVisible();
}
const slideIds = (project: any) => project.slides.map((slide: any) => slide.id);
const expectShown = (page: Page, project: any, index: number) => expect(shown(page)).toHaveAttribute('data-slide', slideIds(project)[index]);

async function openDownload(page: Page, label: string) {
  await page.getByRole('button', { name: '공유' }).click();
  await page.getByRole('menuitem', { name: '다운로드' }).click();
  await page.getByRole('radio', { name: label }).check();
}

test('발표: 전체 화면으로 지금 장부터 시작하고 키로 넘기며, 끝내면 그 장으로 돌아온다', async ({ page }) => {
  await open(page);
  const project = await doc(page);
  await page.getByRole('button', { name: '2번째 장', exact: true }).click();
  await present(page);
  await expect(count(page)).toHaveText('2 / 4');
  await expectShown(page, project, 1);
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('aria-label'))).toBe('발표');

  for (const [key, index] of [['ArrowRight', 2], [' ', 3], ['ArrowLeft', 2], ['PageUp', 1], ['Enter', 2], ['Home', 0], ['End', 3]] as const) {
    await page.keyboard.press(key);
    await expect(count(page)).toHaveText(`${index + 1} / 4`);
    await expectShown(page, project, index);
  }
  // 양 끝에서는 더 넘어가지 않는다.
  await page.keyboard.press('ArrowRight');
  await expect(count(page)).toHaveText('4 / 4');
  await expect(page.getByRole('button', { name: '다음 장' })).toBeDisabled();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowLeft');
  await expect(count(page)).toHaveText('1 / 4');
  await expect(page.getByRole('button', { name: '이전 장' })).toBeDisabled();

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(count(page)).toHaveText('3 / 4');
  await page.keyboard.press('Escape');
  await expect(stage(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await expect(current(page)).toHaveAttribute('aria-label', '3번째 장');
});

test('발표: 누르기와 버튼으로 넘기고 끝내기로 닫는다', async ({ page }) => {
  await open(page);
  const project = await doc(page);
  await present(page);
  await expect(count(page)).toHaveText('1 / 4');
  const size = page.viewportSize()!;
  await page.mouse.click(size.width * 0.8, size.height / 2);
  await expect(count(page)).toHaveText('2 / 4');
  await page.mouse.click(size.width * 0.1, size.height / 2);
  await expect(count(page)).toHaveText('1 / 4');
  await page.getByRole('button', { name: '다음 장' }).click();
  await expect(count(page)).toHaveText('2 / 4');
  await expectShown(page, project, 1);
  await page.getByRole('button', { name: '이전 장' }).click();
  await expect(count(page)).toHaveText('1 / 4');
  await page.getByRole('button', { name: '끝내기' }).click();
  await expect(stage(page)).toHaveCount(0);
});

test('발표: 전체 화면을 사용자가 빠져나오면 발표도 끝난다', async ({ page }) => {
  await open(page);
  await present(page);
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await expect(stage(page)).toHaveCount(0);
});

test('발표: 전체 화면을 쓸 수 없어도 창을 채워 발표한다', async ({ page }) => {
  await page.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new TypeError('막힘')); });
  await open(page);
  const project = await doc(page);
  await present(page);
  await expectShown(page, project, 0);
  await page.keyboard.press('ArrowRight');
  await expectShown(page, project, 1);
  const box = (await stage(page).boundingBox())!;
  expect(box).toMatchObject({ x: 0, y: 0, width: 1440, height: 900 });
  await page.keyboard.press('Escape');
  await expect(stage(page)).toHaveCount(0);
});

test('발표: 문서와 저장 상태를 바꾸지 않고 편집 단축키도 막는다', async ({ page }) => {
  await open(page);
  // 글씨를 선택해 둔 채 시작한다. 발표 중 Delete·되돌리기가 먹으면 문서가 바뀐다.
  const paper = (await page.getByTestId('paper').boundingBox())!; const s = paper.width / 1280;
  await page.mouse.click(paper.x + 150 * s, paper.y + 90 * s);
  const before = await doc(page);
  await present(page);
  for (const key of ['Delete', 'Backspace', 'Control+z', 'Control+y', 'Control+d']) await page.keyboard.press(key);
  await page.evaluate(() => { const data = new DataTransfer(); data.items.add(new File([new Uint8Array(8)], 'a.png', { type: 'image/png' })); window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true })); });
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await expect(stage(page)).toHaveCount(0);
  expect(await doc(page)).toEqual(before);
  await expect(page.getByTestId('save-state')).toHaveText('저장됨');
});

test('발표: 입력 중이면 글씨를 확정하고 시작하며, 읽기 전용 탭에서도 된다', async ({ page, context }) => {
  await open(page);
  await page.getByRole('navigation', { name: '도구' }).getByRole('button', { name: '텍스트' }).click();
  await page.getByRole('button', { name: '본문 추가' }).click();
  await page.keyboard.type('발표 전 글씨');
  await present(page);
  await page.keyboard.press('Escape');
  await expect(stage(page)).toHaveCount(0);
  expect((await doc(page)).slides[0].elements.at(-1).text).toBe('발표 전 글씨');
  await expect(page.getByTestId('save-state')).toHaveText('저장됨', { timeout: 4000 });

  const second = await context.newPage(); await second.goto('/');
  await second.getByRole('list', { name: '내 작품' }).getByRole('button', { name: /열기$/ }).first().click();
  await expect(second.getByTestId('save-state')).toHaveText('읽기 전용');
  await present(second);
  await expect(count(second)).toHaveText('1 / 4');
  await second.keyboard.press('ArrowRight');
  await expect(count(second)).toHaveText('2 / 4');
  await second.keyboard.press('Escape');
  await expect(stage(second)).toHaveCount(0);
  await second.close();
});

test('발표: 조작 줄은 가만히 두면 숨고 움직이면 나타나며, 화면을 16:9로 채운다', async ({ page }) => {
  await fs.mkdir(OUT, { recursive: true });
  await open(page);
  const project = await doc(page);
  await present(page);
  await expectShown(page, project, 0);
  const bar = page.locator('.presenter-bar');
  await expect(bar).toHaveCSS('opacity', '1');
  await page.screenshot({ path: path.join(OUT, 'present-bar.png') });
  await expect(page.locator('.presenter.idle')).toBeVisible({ timeout: 5000 });
  await expect(bar).toHaveCSS('opacity', '0');
  await page.screenshot({ path: path.join(OUT, 'present-idle.png') });
  const box = (await shown(page).locator('canvas').boundingBox())!;
  expect(box.width).toBe(1440); expect(Math.round(box.height)).toBe(810); expect(box.y).toBe(45);
  await page.mouse.move(300, 300);
  await expect(page.locator('.presenter.idle')).toHaveCount(0);
  await expect(bar).toHaveCSS('opacity', '1');
  await page.keyboard.press('Escape');
});

test('발표: 창 크기가 달라져도 비율을 지키고 넘치지 않는다', async ({ page }) => {
  // 전체 화면에서는 창 크기를 바꿀 수 없으므로 전체 화면 없이 잰다.
  await page.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new TypeError('막힘')); });
  await open(page);
  const project = await doc(page);
  await present(page);
  await expectShown(page, project, 0);
  for (const size of [{ width: 800, height: 600 }, { width: 1280, height: 720 }, { width: 1000, height: 400 }]) {
    await page.setViewportSize(size);
    const fit = (await shown(page).locator('canvas').boundingBox())!;
    expect(fit.width / fit.height).toBeCloseTo(16 / 9, 2);
    expect(fit.width).toBeLessThanOrEqual(size.width); expect(fit.height).toBeLessThanOrEqual(size.height);
  }
  await page.keyboard.press('Escape');
});

test('발표: 빠르게 넘겨도 마지막에 고른 장이 나오고 고해상도 이미지를 쌓아 두지 않는다', async ({ page }) => {
  await open(page);
  // 20장을 만든다.
  await page.evaluate(() => { const { store } = (window as any).__canvacraft; for (let i = 0; i < 16; i++) { const p = store.getProject(); store.dispatch(p.id, p.revision, { type: 'addSlide', afterSlideId: p.slides.at(-1).id }); } });
  const project = await doc(page);
  expect(project.slides).toHaveLength(20);
  await page.getByRole('button', { name: '1번째 장', exact: true }).click();
  await present(page);
  await expectShown(page, project, 0);
  for (let i = 0; i < 19; i++) await page.keyboard.press('ArrowRight');
  await expect(count(page)).toHaveText('20 / 20');
  await expectShown(page, project, 19);
  await page.waitForTimeout(300);
  // 화면에는 캔버스 한 장만 있다.
  await expect(shown(page).locator('canvas')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(current(page)).toHaveAttribute('aria-label', '20번째 장');
});

test('발표: 사진이 없는 장은 알리고 다른 장은 계속 넘긴다', async ({ page }) => {
  await open(page);
  const project = await doc(page);
  // 첫 장의 사진만 읽지 못하게 한다.
  await page.evaluate(() => { const bitmap = window.createImageBitmap; (window as any).createImageBitmap = () => Promise.reject(new Error('깨짐')); (window as any).restoreBitmap = () => { window.createImageBitmap = bitmap; }; });
  await present(page);
  await expect(page.getByRole('alert')).toContainText('이 장을 보여 주지 못했어요');
  await page.evaluate(() => (window as any).restoreBitmap());
  await page.keyboard.press('End');
  await expectShown(page, project, 3);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(stage(page)).toHaveCount(0);
});

test('출력: 진행률을 보여 주고, 취소하면 파일을 내리지 않으며 다시 받을 수 있다', async ({ page }) => {
  await fs.mkdir(OUT, { recursive: true });
  await open(page);
  // 장마다 잠깐 멈추게 해 도중에 취소할 수 있게 한다.
  await page.evaluate(() => { const original = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (...args: any[]) { setTimeout(() => original.apply(this, args as any), 300); }; });
  const downloads: string[] = []; page.on('download', item => downloads.push(item.suggestedFilename()));
  await openDownload(page, 'PDF');
  await page.getByRole('button', { name: '내려받기', exact: true }).click();
  const progress = page.getByRole('progressbar', { name: '파일 만드는 중' });
  await expect(progress).toBeVisible();
  await expect(page.locator('.export-progress')).toContainText('/ 4장');
  await expect(page.getByRole('radio', { name: 'PDF' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '발표' })).toBeDisabled();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, 'export-progress.png') });
  await page.getByRole('button', { name: '취소' }).click();
  await expect(page.getByTestId('export-note')).toContainText('취소');
  await page.waitForTimeout(500);
  expect(downloads).toEqual([]);
  await expect(page.getByRole('button', { name: '발표' })).toBeEnabled();

  // 같은 창에서 다시 받는다.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '내려받기', exact: true }).click();
  const file = await download;
  const saved = path.join(OUT, 'retry.pdf'); await file.saveAs(saved);
  expect((await PDFDocument.load(await fs.readFile(saved))).getPageCount()).toBe(4);
  await expect(page.getByTestId('export-note')).toContainText('내려받았어요');
});

test('출력: 만드는 동안 고친 내용은 파일에 섞이지 않고 경고는 내려받기 창에서도 보인다', async ({ page }) => {
  await open(page);
  const before = await doc(page);
  // 첫 장 처리 뒤에 바꿀 틈을 만든다.
  await page.evaluate(() => { const original = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (...args: any[]) { setTimeout(() => original.apply(this, args as any), 150); }; });
  await page.evaluate(() => { const { store } = (window as any).__canvacraft; const p = store.getProject(); const text = p.slides[0].elements.find((e: any) => e.type === 'text'); store.dispatch(p.id, p.revision, { type: 'updateText', slideId: p.slides[0].id, elementId: text.id, fontId: 'round-jua', bold: false }); });
  const fonted = await doc(page);
  await openDownload(page, 'PowerPoint (.pptx)');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '내려받기', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: '파일 만드는 중' })).toBeVisible();
  await page.evaluate(() => { const { store } = (window as any).__canvacraft; const p = store.getProject(); store.dispatch(p.id, p.revision, { type: 'renameProject', title: '출력 중 바꾼 이름' }); const q = store.getProject(); const text = q.slides[0].elements.find((e: any) => e.type === 'text'); store.dispatch(q.id, q.revision, { type: 'updateText', slideId: q.slides[0].id, elementId: text.id, text: '출력 중 바꾼 글씨' }); });
  const file = await download;
  expect(file.suggestedFilename()).toBe(`${before.title}.pptx`);
  const saved = path.join(OUT, 'snapshot.pptx'); await fs.mkdir(OUT, { recursive: true }); await file.saveAs(saved);
  const zip = await JSZip.loadAsync(await fs.readFile(saved));
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
  expect(xml).toContain(fonted.slides[0].elements.find((e: any) => e.type === 'text').text);
  expect(xml).not.toContain('출력 중 바꾼 글씨');
  await expect(page.getByTestId('export-note')).toContainText('맑은 고딕');
  expect((await doc(page)).title).toBe('출력 중 바꾼 이름');
});

test('출력: 만드는 중 작품 목록으로 가면 멈추고 파일을 내리지 않으며, 지난 결과는 다시 열 때 지운다', async ({ page }) => {
  await open(page);
  const downloads: string[] = []; page.on('download', item => downloads.push(item.suggestedFilename()));
  // 먼저 한 번 받아 결과 안내가 남은 상태를 만든다.
  await openDownload(page, 'PDF');
  await page.getByRole('button', { name: '내려받기', exact: true }).click();
  await expect(page.getByTestId('export-note')).toContainText('내려받았어요');
  await page.keyboard.press('Escape');
  await openDownload(page, 'PDF');
  await expect(page.getByTestId('export-note')).toHaveCount(0);
  downloads.length = 0;

  await page.evaluate(() => { const original = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (...args: any[]) { setTimeout(() => original.apply(this, args as any), 300); }; });
  await page.getByRole('button', { name: '내려받기', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: '파일 만드는 중' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '작품 목록' }).click();
  await expect(page.getByRole('list', { name: '내 작품' })).toBeVisible();
  await page.waitForTimeout(2000);
  expect(downloads).toEqual([]);
});
