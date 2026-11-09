import { test, expect, type Page } from '@playwright/test';
import { newSlideProject } from './start';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import fs from 'node:fs/promises';
import path from 'node:path';
import { contentOf, ids, loadSample, sampleAssets } from '../contracts/helpers';

// 공통 샘플 문서의 전체 흐름: 화면 표시 → 명령 → 취소 → 저장 → 다시 열기 → 원본 왕복 → PPTX·PDF 출력.
// Phase 4~8은 이 시험이 계속 통과하는지 확인한다.
const OUT = 'artifacts/phase3';

async function sampleFile() {
  const project = loadSample(); const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format: 'canvacraft', schemaVersion: 1 }));
  zip.file('project.json', JSON.stringify(project));
  for (const asset of project.assetManifest) zip.file(`assets/${asset.id}.${asset.mime === 'image/png' ? 'png' : 'jpg'}`, sampleAssets().get(asset.id)!);
  return { name: '샘플.canvacraft', mimeType: 'application/zip', buffer: Buffer.from(await zip.generateAsync({ type: 'uint8array' })) };
}
const dev = (page: Page) => page.evaluate(() => { const { store } = (window as any).__canvacraft; return JSON.parse(JSON.stringify(store.getProject())); });
const shot = async (page: Page) => { await page.waitForTimeout(150); return (await page.getByTestId('paper').screenshot()).toString('base64'); };
const slideButtons = (page: Page) => page.getByRole('list', { name: '슬라이드 목록' }).getByRole('button', { name: /번째 장$/ });
const slideMenu = async (page: Page, index: number, item: string) => { await page.getByRole('button', { name: `${index + 1}번째 장 메뉴` }).click({ force: true }); await page.getByRole('menuitem', { name: item }).click(); };
const fileMenu = async (page: Page, item: string) => { await page.getByRole('button', { name: '파일' }).click(); await page.getByRole('menuitem', { name: item }).click(); };
const downloadAs = async (page: Page, format: string) => { await page.getByRole('button', { name: '공유' }).click(); await page.getByRole('menuitem', { name: '다운로드' }).click(); await page.getByRole('radio', { name: format }).check(); await page.getByRole('button', { name: '내려받기', exact: true }).click(); };

function watch(page: Page) {
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { const url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== 'http://127.0.0.1:5173') external.push(url.origin); });
  return { errors, external };
}

async function openSample(page: Page) {
  await newSlideProject(page);
  await page.getByTestId('open-file').setInputFiles(await sampleFile());
  await expect(page.getByRole('status')).toContainText('새 작품으로 열었어요');
  await expect(slideButtons(page)).toHaveCount(4);
}

// 화면(Konva)과 출력 렌더러가 같은 모양인지 픽셀 평균 차이로 비교한다.
async function screenVersusRender(page: Page, slideIndex: number) {
  const png = await shot(page);
  return page.evaluate(async ([png, slideIndex]) => {
    const { store, assets } = (window as any).__canvacraft;
    const { renderSlide } = await import('/src/rendering/renderSlide.ts' as string);
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    const size = [bitmap.width, bitmap.height];
    const read = (source: CanvasImageSource) => { const c = document.createElement('canvas'); c.width = size[0]; c.height = size[1]; const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(source, 0, 0, size[0], size[1]); return x.getImageData(0, 0, size[0], size[1]).data; };
    const rendered = await renderSlide(store.getProject().slides[slideIndex as number], assets.resolve, 2);
    const a = read(bitmap), b = read(rendered.canvas); let sum = 0;
    for (let i = 0; i < a.length; i += 4) sum += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
    return sum / (a.length / 4);
  }, [png, slideIndex] as const);
}

test('공통 샘플 문서의 전체 흐름', async ({ page, context, browser }) => {
  await fs.rm(OUT, { recursive: true, force: true }); await fs.mkdir(OUT, { recursive: true });
  const { errors, external } = watch(page);
  await openSample(page);
  const opened = await dev(page);
  expect(contentOf(opened)).toEqual(contentOf(loadSample()));
  expect(opened.revision).toBe(0);

  // 네 장 모두 화면과 출력 렌더가 같은 모양이다.
  const differences: number[] = [];
  for (let i = 0; i < 4; i++) {
    await slideButtons(page).nth(i).click();
    await page.waitForTimeout(300);
    differences.push(await screenVersusRender(page, i));
    await page.getByTestId('paper').screenshot({ path: path.join(OUT, `screen-${i + 1}.png`) });
  }
  await page.screenshot({ path: path.join(OUT, 'app.png') });
  console.log('화면과 출력 렌더 평균 차이', differences.map(value => value.toFixed(2)).join(', '));
  for (const value of differences) expect(value).toBeLessThan(6);

  // 명령 → 화면 반영 → 취소 → 원래 화면.
  await slideButtons(page).nth(0).click();
  const before = await shot(page);
  await page.evaluate(([slideId, elementId]) => { const { store } = (window as any).__canvacraft; const p = store.getProject(); return store.dispatch(p.id, p.revision, { type: 'moveElement', slideId, elementId, x: 100, y: 100 }).ok; }, [ids.slide1, ids.photo1]);
  const moved = await shot(page);
  expect(moved).not.toBe(before);
  await page.getByRole('button', { name: '되돌리기' }).click();
  expect(await shot(page)).toBe(before);
  await page.getByRole('button', { name: '다시 하기' }).click();
  expect(await shot(page)).toBe(moved);
  await page.keyboard.press('Control+z');
  expect(await shot(page)).toBe(before);
  expect((await dev(page)).revision).toBe(4);

  // 슬라이드 메뉴도 같은 명령 경로를 탄다.
  await page.getByRole('button', { name: '페이지 추가' }).click();
  await expect(slideButtons(page)).toHaveCount(5);
  await expect(slideButtons(page).nth(4)).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: '되돌리기' }).click();
  await expect(slideButtons(page)).toHaveCount(4);
  // 새 장이 사라지면 가장 가까운 남은 장(마지막 장)을 보여 준다.
  await expect(slideButtons(page).nth(3)).toHaveAttribute('aria-current', 'true');
  await slideMenu(page, 1, '복제');
  await expect(slideButtons(page)).toHaveCount(5);
  await expect(slideButtons(page).nth(2)).toHaveAttribute('aria-current', 'true');
  await slideMenu(page, 2, '오른쪽으로');
  await expect(slideButtons(page).nth(3)).toHaveAttribute('aria-current', 'true');
  await slideMenu(page, 3, '삭제');
  await expect(slideButtons(page)).toHaveCount(4);
  // 다른 장을 고른 뒤 되돌리면 지운 장으로 돌아간다.
  await slideButtons(page).nth(0).click();
  await page.getByRole('button', { name: '되돌리기' }).click();
  await expect(slideButtons(page)).toHaveCount(5);
  await expect(slideButtons(page).nth(3)).toHaveAttribute('aria-current', 'true');
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: '되돌리기' }).click();
  await expect(slideButtons(page)).toHaveCount(4);
  expect(contentOf(await dev(page))).toEqual(contentOf(loadSample()));

  // 작품 이름 변경.
  await page.getByRole('textbox', { name: '작품 이름' }).fill('우리 가족: 소개?');
  await page.getByRole('textbox', { name: '작품 이름' }).press('Enter');
  await expect.poll(async () => (await dev(page)).title).toBe('우리 가족: 소개?');

  // 자동 저장 → 새로고침 → 복원. revision을 이어 간다.
  await expect(page.getByTestId('save-state')).toHaveText('저장됨', { timeout: 4000 });
  const saved = await dev(page);
  await page.reload();
  await expect(page.getByRole('status')).toContainText('저장된 작품을 열었어요');
  const restored = await dev(page);
  expect(restored).toEqual(saved);
  await expect(slideButtons(page)).toHaveCount(4);
  await expect(page.getByTestId('save-state')).toHaveText('저장됨');
  await expect(page.getByRole('button', { name: '되돌리기' })).toBeDisabled();

  // 저장 후 바꾸면 변경 있음으로 돌아갔다가 다시 저장된다.
  await page.getByRole('button', { name: '페이지 추가' }).click();
  await expect(page.getByTestId('save-state')).toHaveText('변경 있음');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('save-state')).toHaveText('저장됨', { timeout: 4000 });

  // 손상 파일을 열어도 현재 작품은 그대로다.
  const current = await dev(page);
  await page.getByTestId('open-file').setInputFiles({ name: '깨짐.canvacraft', mimeType: 'application/zip', buffer: Buffer.from('not a zip') });
  await expect(page.getByRole('status')).toContainText('읽지 못했어요');
  expect(await dev(page)).toEqual(current);

  // 원본 파일 → 다른 프로필에서 열기.
  const waiting = page.waitForEvent('download');
  await fileMenu(page, '원본 저장');
  const original = await waiting;
  expect(original.suggestedFilename()).toBe('우리 가족 소개.canvacraft');
  const originalPath = path.join(OUT, 'sample.canvacraft'); await original.saveAs(originalPath);
  const other = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const otherPage = await other.newPage();
  await newSlideProject(otherPage);
  await otherPage.getByTestId('open-file').setInputFiles(originalPath);
  await expect(otherPage.getByRole('status')).toContainText('새 작품으로 열었어요');
  const reopened = await dev(otherPage);
  expect(contentOf(reopened)).toEqual(contentOf(current));
  expect(reopened.id).not.toBe(current.id); expect(reopened.revision).toBe(0);
  await other.close();

  // PPTX·PDF 출력. 내보내는 중 내용을 바꿔도 파일에 섞이지 않는 것은 스냅샷 시험에서 확인한다.
  for (const [label, name] of [['PowerPoint (.pptx)', 'editable.pptx'], ['모양 그대로 PowerPoint', 'image.pptx'], ['PDF', 'sample.pdf']]) {
    const download = page.waitForEvent('download');
    await downloadAs(page, label);
    const file = await download;
    await file.saveAs(path.join(OUT, name));
    await expect(page.getByRole('status')).toContainText('내려받았어요');
    await page.keyboard.press('Escape');
  }
  const pptx = await JSZip.loadAsync(await fs.readFile(path.join(OUT, 'editable.pptx')));
  expect(Object.keys(pptx.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length).toBe(4);
  // 첫 장의 그리기 순서: 사진 → 획 → 글씨 → 글씨 → 획(연속한 두 획은 한 PNG).
  const slide1 = await pptx.file('ppt/slides/slide1.xml')!.async('string');
  expect([...slide1.matchAll(/<p:(pic|sp)>/g)].map(match => match[1])).toEqual(['pic', 'pic', 'sp', 'sp', 'pic']);
  expect(slide1).toContain('우리 가족 소개'); expect(slide1).toContain('맑은 고딕');
  // 두 장이 함께 쓰는 사진은 한 파일만 들어간다.
  const media = Object.keys(pptx.files).filter(name => name.startsWith('ppt/media/') && !pptx.files[name].dir);
  const rels = await Promise.all([1, 2].map(n => pptx.file(`ppt/slides/_rels/slide${n}.xml.rels`)!.async('string')));
  const targets = rels.map(xml => [...xml.matchAll(/Target="\.\.\/media\/([^"]+)"/g)].map(match => match[1]));
  expect(targets[0].filter(name => targets[1].includes(name)).length).toBe(1);
  for (const list of targets) for (const name of list) expect(media).toContain(`ppt/media/${name}`);
  const image = await JSZip.loadAsync(await fs.readFile(path.join(OUT, 'image.pptx')));
  expect(await image.file('ppt/slides/slide1.xml')!.async('string')).not.toContain('<p:sp>');
  const pdf = await PDFDocument.load(await fs.readFile(path.join(OUT, 'sample.pdf')));
  expect(pdf.getPageCount()).toBe(4);
  expect(pdf.getPage(0).getSize()).toEqual({ width: 960, height: 540 });

  expect(errors).toEqual([]); expect(external).toEqual([]);
  void context;
});

test('마지막 장 삭제 안내와 빈 작품 시작', async ({ page }) => {
  await newSlideProject(page);
  await expect(slideButtons(page)).toHaveCount(1);
  await slideMenu(page, 0, '삭제');
  await expect(page.getByRole('status')).toContainText('내용 비우기');
  await expect(slideButtons(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: '되돌리기' })).toBeDisabled();
});

test('출력은 시작 시점의 문서만 담고 취소하면 파일을 내리지 않는다', async ({ page }) => {
  await openSample(page);
  const result = await page.evaluate(async id => {
    const { store, assets } = (window as any).__canvacraft;
    const { exportPptx } = await import('/src/export/exportPptx.ts' as string);
    const snapshot = store.getProject();
    const running = exportPptx(snapshot, assets.resolve, 'editable');
    store.dispatch(snapshot.id, snapshot.revision, { type: 'renameProject', title: '출력 중 바꾼 이름' });
    store.dispatch(snapshot.id, snapshot.revision + 1, { type: 'updateText', slideId: id, elementId: '00000000-0000-4000-8000-000000000013', text: '출력 중 바꾼 글씨' });
    const blob = (await running).blob;
    const controller = new AbortController(); controller.abort();
    const cancelled = await exportPptx(store.getProject(), assets.resolve, 'editable', {}, controller.signal);
    const missing = await exportPptx(store.getProject(), async () => undefined, 'editable');
    return { bytes: Array.from(new Uint8Array(await blob.arrayBuffer())), cancelled, missing };
  }, ids.slide1);
  expect(result.cancelled).toMatchObject({ ok: false, code: 'CANCELLED' });
  expect(result.missing).toMatchObject({ ok: false, code: 'ASSET_MISSING' });
  const zip = await JSZip.loadAsync(new Uint8Array(result.bytes));
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
  expect(xml).toContain('우리 가족 소개'); expect(xml).not.toContain('출력 중 바꾼 글씨');
});
