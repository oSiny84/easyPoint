import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { pageLayout } from '../../src/comic/pageLayout';
import type { ComicLayout } from '../../src/domain/comicTypes';
import { loadComicSample } from '../contracts/comicHelpers';
import { ids, sampleAssets } from '../contracts/helpers';

// 만화 내려받기(만화 계약 §3·§8): 만화책 PDF와 그림 PNG. 내려받은 파일을 다시 읽어 쪽 수·종이 크기·칸 자리의 색을 계약의 식과 견준다.
const OUT = 'artifacts/comic';
const PPP = 3;
const status = (page: Page) => page.getByRole('status');
const saveState = (page: Page) => page.getByTestId('save-state');
const doc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__canvacraft.store.getProject())));
const dispatch = (page: Page, command: any) => page.evaluate(command => { const { store } = (window as any).__canvacraft; const p = store.getProject(); return store.dispatch(p.id, p.revision, command); }, command);
const slideButton = (page: Page, number: number) => page.getByRole('button', { name: `${number}번째 장`, exact: true });
const hex = (color: string) => [1, 3, 5].map(at => parseInt(color.slice(at, at + 2), 16));

async function openSample(page: Page) {
  const project = loadComicSample();
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format: 'canvacomic', schemaVersion: 1 }));
  zip.file('project.json', JSON.stringify(project));
  for (const asset of project.assetManifest) zip.file(`assets/${asset.id}.${asset.mime === 'image/png' ? 'png' : 'jpg'}`, sampleAssets().get(asset.id)!);
  await page.goto('/');
  await page.getByRole('button', { name: '만화 만들기' }).click();
  await page.getByTestId('open-comic-file').setInputFiles({ name: '탐정.canvacomic', mimeType: 'application/zip', buffer: Buffer.from(await zip.generateAsync({ type: 'uint8array' })) });
  await expect(status(page)).toContainText('새 작품으로 열었어요');
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 5000 });
}
// 내려받기 창에서 형식을 골라 내려받고 파일 바이트와 완료 안내를 돌려준다.
async function download(page: Page, format: string, afterClick?: () => Promise<unknown>) {
  await page.getByRole('button', { name: '공유' }).click();
  await page.getByRole('menuitem', { name: '다운로드' }).click();
  await page.locator('.download-panel .format', { hasText: format }).click();
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '내려받기', exact: true }).click();
  await afterClick?.();
  const file = await waiting;
  const bytes = await fs.readFile(await file.path());
  await expect(page.getByTestId('export-note')).toBeVisible();
  const note = await page.getByTestId('export-note').innerText();
  await page.keyboard.press('Escape');
  return { name: file.suggestedFilename(), bytes, note };
}
// PNG를 브라우저에서 해독해 크기와 여러 점의 색을 읽는다.
const readPng = (page: Page, bytes: Buffer, points: { x: number; y: number }[]) => page.evaluate(async ({ base64, points }) => {
  const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], { type: 'image/png' }));
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
  return { width: bitmap.width, height: bitmap.height, colors: points.map(point => [...context.getImageData(point.x, point.y, 1, 1).data].slice(0, 3)) };
}, { base64: bytes.toString('base64'), points });
// 칸 자리(포인트)의 픽셀 좌표: 안쪽 한 점(칸 왼쪽 위에서 조금 들어간 곳), 테두리 위의 한 점, 칸 바깥의 한 점.
function panelPoints(layout: ComicLayout, slot: number) {
  const rect = pageLayout(layout).panels[slot];
  const x = Math.round(rect.x * PPP), y = Math.round(rect.y * PPP);
  return { inside: { x: x + 12, y: y + 12 }, border: { x, y: y + 60 }, outside: { x: x - 12, y: y + 60 } };
}

test('만화책 PDF: 쪽 수·종이 크기·방향이 칸 배치와 맞고, 제목과 완료 안내가 있다', async ({ page }) => {
  await openSample(page);
  // 4칸 배치의 4칸: 가로 A4 한 쪽.
  let made = await download(page, '만화책 (PDF)');
  expect(made.name).toBe('우리 가족 소개.pdf');
  expect(made.note).toMatch(/^만화책을 내려받았어요\. PDF · 1쪽 · [\d.]+(KB|MB)\.$/);
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, 'sample-grid4.pdf'), made.bytes);
  let pdf = await PDFDocument.load(made.bytes);
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).getSize()).toEqual({ width: 842, height: 595 });
  expect(pdf.getTitle()).toBe('우리 가족 소개');

  // 3칸 배치로 바꾸면 세로 A4 두 쪽이다.
  await dispatch(page, { type: 'setComicLayout', layout: 'rows3' });
  made = await download(page, '만화책 (PDF)');
  expect(made.note).toContain('PDF · 2쪽');
  pdf = await PDFDocument.load(made.bytes);
  expect(pdf.getPageCount()).toBe(2);
  for (const sheet of pdf.getPages()) expect(sheet.getSize()).toEqual({ width: 595, height: 842 });

  // 8칸 배치에 칸을 9개로 늘리면 두 쪽이다.
  await dispatch(page, { type: 'setComicLayout', layout: 'grid8' });
  for (let count = 5; count <= 9; count++) await dispatch(page, { type: 'addSlide', afterSlideId: null });
  made = await download(page, '만화책 (PDF)');
  pdf = await PDFDocument.load(made.bytes);
  expect(pdf.getPageCount()).toBe(2);
  expect(pdf.getPage(1).getSize()).toEqual({ width: 595, height: 842 });
});

test('그림 PNG: 지금 칸이 들어 있는 쪽이 나오고, 칸 자리의 색이 그 칸의 색과 같다', async ({ page }) => {
  await openSample(page);
  const sample = await doc(page);
  // 다섯째 칸(노란 배경)을 더해 2쪽으로 만든다.
  await dispatch(page, { type: 'addSlide', afterSlideId: ids.slide4 });
  await dispatch(page, { type: 'setBackground', slideId: (await doc(page)).slides[4].id, background: { kind: 'solid', color: '#FFD43B' } });

  // 첫 칸에서 내려받으면 첫 쪽이다.
  await slideButton(page, 1).click();
  let made = await download(page, '그림 (PNG)');
  expect(made.name).toBe('우리 가족 소개.png');
  expect(made.note).toMatch(/^그림을 내려받았어요\. PNG · 2쪽 중 1쪽 · /);
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, 'sample-page1.png'), made.bytes);
  const first = panelPoints('grid4', 0), third = panelPoints('grid4', 2), fourth = panelPoints('grid4', 3);
  let read = await readPng(page, made.bytes, [first.inside, first.border, first.outside, third.inside, fourth.inside, { x: 20, y: 20 }]);
  expect([read.width, read.height]).toEqual([2526, 1785]);
  // 첫 칸·셋째 칸은 단색 배경이고 왼쪽 위 구석에는 요소가 없다. 넷째 칸은 흰 빈 칸이다.
  expect(read.colors[0]).toEqual(hex(sample.slides[0].background.color));
  expect(read.colors[3]).toEqual(hex(sample.slides[2].background.color));
  expect(read.colors[4]).toEqual([255, 255, 255]);
  // 테두리는 검정에 가깝고, 칸 바깥과 종이 구석은 흰색이다.
  expect(Math.max(...read.colors[1])).toBeLessThan(60);
  expect(read.colors[2]).toEqual([255, 255, 255]);
  expect(read.colors[5]).toEqual([255, 255, 255]);

  // 다섯째 칸에서 내려받으면 둘째 쪽이다: 첫 자리는 노랑, 둘째 자리는 빈 종이(테두리도 없다).
  await slideButton(page, 5).click();
  made = await download(page, '그림 (PNG)');
  expect(made.note).toContain('2쪽 중 2쪽');
  const second = panelPoints('grid4', 1);
  read = await readPng(page, made.bytes, [first.inside, second.inside, second.border]);
  expect(read.colors).toEqual([[255, 212, 59], [255, 255, 255], [255, 255, 255]]);
});

test('말풍선과 효과 글씨가 내려받은 그림에 들어간다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '만화 만들기' }).click();
  await page.getByRole('button', { name: '새 작품' }).click();
  await expect(page.getByTestId('paper')).toBeVisible();
  const panel = page.getByRole('region', { name: '만화 패널' });
  if (!await panel.isVisible()) await page.getByRole('navigation', { name: '도구' }).getByRole('button', { name: '만화' }).click();
  await dispatch(page, { type: 'setBackground', slideId: (await doc(page)).slides[0].id, background: { kind: 'solid', color: '#D0EBFF' } });
  await panel.getByRole('button', { name: '해설 상자', exact: true }).click();
  await expect(page.getByLabel('슬라이드 글씨')).toBeFocused();
  await page.keyboard.type('어느 날 아침');
  await page.keyboard.press('Escape');
  const [image] = (await doc(page)).slides[0].elements;
  const made = await download(page, '그림 (PNG)');
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, 'bubble-page.png'), made.bytes);
  // 해설 상자의 안쪽(연한 노랑 #FFF8DC)이 칸의 그 자리에 그려져 있다. 칸의 다른 곳은 하늘색 배경이다.
  const rect = pageLayout('grid4').panels[0]; const scale = rect.width * PPP / 1280;
  const at = (x: number, y: number) => ({ x: Math.round(rect.x * PPP + x * scale), y: Math.round(rect.y * PPP + y * scale) });
  const read = await readPng(page, made.bytes, [at(image.x + 30, image.y + 30), at(40, 40)]);
  expect(read.colors).toEqual([[255, 248, 220], [208, 235, 255]]);
});

test('내려받기를 누른 뒤의 편집은 파일에 섞이지 않는다', async ({ page }) => {
  await openSample(page);
  const made = await download(page, '만화책 (PDF)', () => dispatch(page, { type: 'renameProject', title: '나중에 바꾼 이름' }));
  expect((await doc(page)).title).toBe('나중에 바꾼 이름');
  expect(made.name).toBe('우리 가족 소개.pdf');
  expect((await PDFDocument.load(made.bytes)).getTitle()).toBe('우리 가족 소개');
});

test('취소·사진 누락은 파일을 만들지 않고 까닭을 돌려준다', async ({ page }) => {
  await openSample(page);
  const result = await page.evaluate(async () => {
    const { exportComicPdf, exportComicPng } = await import('/src/comic/exportComic.ts' as string);
    const { store, assets } = (window as any).__canvacraft; const project = store.getProject();
    const stopped = new AbortController(); stopped.abort();
    // 첫 쪽을 만든 뒤 취소한다.
    const later = new AbortController();
    const progress: number[] = [];
    const rows3 = { ...project, layout: 'rows3' };
    return {
      cancelled: await exportComicPdf(project, assets.resolve, { signal: stopped.signal }),
      cancelledLater: await exportComicPdf(rows3, assets.resolve, { signal: later.signal, onProgress: (done: number) => { progress.push(done); later.abort(); } }),
      progress,
      cancelledPng: await exportComicPng(project, project.slides[0].id, assets.resolve, { signal: stopped.signal }),
      missing: await exportComicPdf(project, async () => undefined),
      missingPng: await exportComicPng(project, project.slides[0].id, async () => undefined),
      // 모르는 칸 id는 첫 쪽으로 만든다.
      unknownSlide: await exportComicPng(rows3, 'nope', assets.resolve).then((made: any) => made.ok && { page: made.page, pages: made.pages }),
    };
  });
  expect(result.cancelled).toMatchObject({ ok: false, code: 'CANCELLED' });
  expect(result.cancelledLater).toMatchObject({ ok: false, code: 'CANCELLED' });
  expect(result.progress).toEqual([3]);
  expect(result.cancelledPng).toMatchObject({ ok: false, code: 'CANCELLED' });
  expect(result.missing).toMatchObject({ ok: false, code: 'ASSET_MISSING' });
  expect(result.missingPng).toMatchObject({ ok: false, code: 'ASSET_MISSING' });
  expect(result.unknownSlide).toEqual({ page: 1, pages: 2 });
});
