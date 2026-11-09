import { test, expect, type Page } from '@playwright/test';
import { newSlideProject } from './start';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ids, loadSample, sampleAssets } from '../contracts/helpers';

// 글씨 입력(Phase 6). 한글은 CDP 조합 입력으로 시험하며 실제 Windows 입력기 확인을 대신하지 않는다.
const OUT = 'artifacts/phase6';
const body = '00000000-0000-4000-8000-000000000014';
const title = ids.title;
const doc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__canvacraft.store.getProject())));
const history = (page: Page) => page.evaluate(() => (window as any).__canvacraft.store.historySize());
const selectedId = (page: Page) => page.evaluate(() => (window as any).__canvacraft.selectedId());
const area = (page: Page) => page.getByRole('textbox', { name: '슬라이드 글씨' });
const rail = (page: Page, name: string) => page.getByRole('navigation', { name: '도구' }).getByRole('button', { name });
const bar = (page: Page) => page.getByRole('toolbar', { name: '선택한 요소 설정' });
const element = async (page: Page, slide: number, id: string) => (await doc(page)).slides[slide].elements.find((item: any) => item.id === id);

async function sampleFile() {
  const project = loadSample(); const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format: 'canvacraft', schemaVersion: 1 }));
  zip.file('project.json', JSON.stringify(project));
  for (const asset of project.assetManifest) zip.file(`assets/${asset.id}.${asset.mime === 'image/png' ? 'png' : 'jpg'}`, sampleAssets().get(asset.id)!);
  return { name: 's.canvacraft', mimeType: 'application/zip', buffer: Buffer.from(await zip.generateAsync({ type: 'uint8array' })) };
}
async function open(page: Page, width = 1440, height = 1000) {
  await page.setViewportSize({ width, height });
  await newSlideProject(page);
  await page.getByTestId('open-file').setInputFiles(await sampleFile());
  await expect(page.getByRole('status')).toContainText('새 작품');
  await page.waitForTimeout(200);
}
async function screen(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('paper').boundingBox())!; const scale = box.width / 1280;
  return { x: box.x + x * scale, y: box.y + y * scale, scale };
}
const clickEmpty = async (page: Page) => { const work = (await page.getByTestId('work').boundingBox())!; await page.mouse.click(work.x + 5, work.y + 5); };
const openSlide = (page: Page, n: number) => page.getByRole('button', { name: `${n}번째 장`, exact: true }).click();

test('텍스트 패널: 제목을 넣고 입력한 뒤 다른 곳을 누르면 추가되고 취소 한 번으로 사라진다', async ({ page }) => {
  await open(page);
  await openSlide(page, 4);
  await rail(page, '텍스트').click();
  await page.getByRole('button', { name: '제목 추가', exact: true }).click();
  await expect(area(page)).toBeFocused();
  await expect(area(page)).toHaveAttribute('placeholder', '제목을 입력하세요');
  // 입력이 끝나기 전에는 문서가 바뀌지 않는다.
  const before = await doc(page);
  await page.keyboard.type('우리 반 소개');
  expect(await doc(page)).toEqual(before);
  await clickEmpty(page);
  await expect(area(page)).toHaveCount(0);
  const slide = (await doc(page)).slides[3];
  expect(slide.elements).toHaveLength(1);
  expect(slide.elements[0]).toMatchObject({ type: 'text', text: '우리 반 소개', fontSize: 64, bold: true, align: 'center', fontId: 'sans-ko', lineHeight: 1.3 });
  // 빈 곳을 눌러 끝내면 선택도 풀린다.
  expect(await selectedId(page)).toBeNull();
  await page.keyboard.press('Control+z');
  expect((await doc(page)).slides[3].elements).toHaveLength(0);
});

test('새 글씨를 비운 채 끝내면 문서·기록이 바뀌지 않는다. 공백만 있어도 같다', async ({ page }) => {
  await open(page);
  await rail(page, '텍스트').click();
  const before = await doc(page);
  await page.getByRole('button', { name: '본문 추가' }).click();
  await expect(area(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(area(page)).toHaveCount(0);
  await page.getByRole('button', { name: '부제목 추가' }).click();
  await page.keyboard.type('  ');
  await page.keyboard.press('Enter');
  await clickEmpty(page);
  await expect(area(page)).toHaveCount(0);
  expect(await doc(page)).toEqual(before);
  expect((await history(page)).undo).toBe(0);
});

test('더블클릭한 곳에 커서가 놓이고 고친 내용은 취소 한 번으로 돌아온다', async ({ page }) => {
  await open(page);
  // 제목 "우리 가족 소개"의 '가족' 앞쪽을 누른다.
  const start = await screen(page, 80 + 150, 60 + 40);
  await page.mouse.dblclick(start.x, start.y);
  await expect(area(page)).toBeFocused();
  await expect(area(page)).toHaveValue('우리 가족 소개');
  const caret = await area(page).evaluate((e: HTMLTextAreaElement) => e.selectionStart);
  expect(caret).toBeGreaterThan(0); expect(caret).toBeLessThan(8);
  await page.keyboard.type('X');
  await page.keyboard.press('Escape');
  await expect(area(page)).toHaveCount(0);
  const text = (await element(page, 0, title)).text;
  expect(text.length).toBe(9);
  expect(text.replace('X', '')).toBe('우리 가족 소개');
  expect(text.indexOf('X')).toBe(caret);
  expect(await selectedId(page)).toBe(title);
  expect((await history(page)).undo).toBe(1);
  await page.keyboard.press('Control+z');
  expect((await element(page, 0, title)).text).toBe('우리 가족 소개');
});

test('기존 글씨를 모두 지우면 삭제되고 취소 한 번으로 돌아온다', async ({ page }) => {
  await open(page);
  const start = await screen(page, 150, 90);
  await page.mouse.dblclick(start.x, start.y);
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete');
  await clickEmpty(page);
  expect(await element(page, 0, title)).toBeUndefined();
  expect(await selectedId(page)).toBeNull();
  expect((await history(page)).undo).toBe(1);
  await page.keyboard.press('Control+z');
  expect((await element(page, 0, title)).text).toBe('우리 가족 소개');
});

test('입력 중 Delete·Backspace·Ctrl+Z는 글씨 입력에만 쓰이고 Enter는 줄을 바꾼다', async ({ page }) => {
  await open(page);
  const start = await screen(page, 150, 90);
  await page.mouse.dblclick(start.x, start.y);
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace'); await page.keyboard.press('Delete');
  await expect(area(page)).toBeVisible();
  await expect(area(page)).toHaveValue('우리 가족 소');
  await page.keyboard.type('개');
  await page.keyboard.press('Enter');
  await page.keyboard.type('둘째');
  await expect(area(page)).toHaveValue('우리 가족 소개\n둘째');
  // 입력 중 되돌리기는 문서가 아니라 입력 칸이 처리한다.
  const revision = (await doc(page)).revision;
  await page.keyboard.press('Control+z');
  expect((await doc(page)).revision).toBe(revision);
  await expect(area(page)).toBeVisible();
  await page.keyboard.press('Escape');
  expect((await element(page, 0, title)).text).toContain('우리 가족 소');
});

test('한글 조합 중 Enter·Esc는 입력을 끝내지 않고 글자가 겹치지 않는다', async ({ page, context }) => {
  await open(page);
  await rail(page, '텍스트').click();
  await page.getByRole('button', { name: '본문 추가' }).click();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: '하', selectionStart: 1, selectionEnd: 1 });
  await area(page).dispatchEvent('keydown', { key: 'Escape', isComposing: true, keyCode: 229 });
  await area(page).dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
  await expect(area(page)).toBeVisible();
  await expect(area(page)).toHaveValue('하');
  await cdp.send('Input.imeSetComposition', { text: '한', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.insertText', { text: '한' });
  await cdp.send('Input.imeSetComposition', { text: '글', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.insertText', { text: '글' });
  await expect(area(page)).toHaveValue('한글');
  await page.keyboard.press('Escape');
  await expect(area(page)).toHaveCount(0);
  expect((await doc(page)).slides[0].elements.at(-1).text).toBe('한글');
});

test('조합 중 슬라이드를 옮겨도 글자가 사라지거나 겹치지 않는다', async ({ page, context }) => {
  await open(page);
  const start = await screen(page, 200, 240);
  await page.mouse.dblclick(start.x, start.y);
  await page.keyboard.press('Control+End');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: '끝', selectionStart: 1, selectionEnd: 1 });
  await openSlide(page, 2);
  await expect(area(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '2번째 장', exact: true })).toHaveAttribute('aria-current', 'true');
  const text: string = (await element(page, 0, body)).text;
  const original: string = loadSample().slides[0].elements.find((item: any) => item.id === body)!.text ?? '';
  expect(text.startsWith(original)).toBe(true);
  expect(text.length).toBeLessThanOrEqual(original.length + 1);
  expect((await history(page)).undo).toBeLessThanOrEqual(1);
});

for (const percent of [50, 100, 150]) test(`배율 ${percent}%에서 입력 칸이 글씨 자리와 같다`, async ({ page }) => {
  await open(page, 2300, 1400);
  await page.getByRole('slider', { name: '화면 배율' }).fill(String(percent));
  await expect(page.getByTestId('zoom-value')).toHaveText(`${percent}%`);
  await page.waitForTimeout(150);
  await page.addStyleTag({ content: '.selection-box,.handle,.more-button{display:none!important}.text-editor{caret-color:transparent!important}' });
  const start = await screen(page, 200, 240);
  const bands = async () => {
    const png = (await page.locator('.paper-wrap').screenshot()).toString('base64');
    return page.evaluate(async png => {
      const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const c = document.createElement('canvas'); c.width = image.width; c.height = image.height; const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(image, 0, 0);
      // 왼쪽 글씨 구역만 본다.
      const { data } = x.getImageData(0, 0, Math.floor(image.width * 0.52), image.height); const w = Math.floor(image.width * 0.52); const rows: number[][] = []; let from = -1; let left = w, right = 0;
      for (let row = 0; row < image.height; row++) {
        let ink = false;
        for (let col = 0; col < w; col++) { const i = (row * w + col) * 4; if (data[i] < 120 && data[i + 1] < 120 && data[i + 2] < 120) { ink = true; left = Math.min(left, col); right = Math.max(right, col); } }
        if (ink && from < 0) from = row;
        if (!ink && from >= 0) { rows.push([from, row, left, right]); from = -1; left = w; right = 0; }
      }
      return rows;
    }, png);
  };
  const before = await bands();
  await page.mouse.click(start.x, start.y);
  await page.mouse.dblclick(start.x, start.y);
  await expect(area(page)).toBeFocused();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(150);
  const during = await bands();
  expect(during.length).toBe(before.length);
  // 화면 2px 안에서 같은 자리다.
  before.forEach((band, i) => { expect(Math.abs(band[0] - during[i][0])).toBeLessThanOrEqual(2); expect(Math.abs(band[2] - during[i][2])).toBeLessThanOrEqual(2); expect(Math.abs(band[3] - during[i][3])).toBeLessThanOrEqual(3); });
  await page.keyboard.press('Escape');
});

test('설정 줄: 크기·굵게·색·정렬은 각각 취소 한 번, 입력 중 바꾼 것은 확정과 함께 한 번', async ({ page }) => {
  await open(page);
  const start = await screen(page, 200, 240);
  await page.mouse.click(start.x, start.y);
  expect(await selectedId(page)).toBe(body);
  await bar(page).getByRole('button', { name: '글씨 크게' }).click();
  expect((await element(page, 0, body)).fontSize).toBe(40);
  await bar(page).getByRole('button', { name: '글씨 작게' }).click();
  expect((await element(page, 0, body)).fontSize).toBe(36);
  await bar(page).getByRole('button', { name: '굵게' }).click();
  expect((await element(page, 0, body)).bold).toBe(true);
  await bar(page).getByRole('button', { name: '가운데 정렬' }).click();
  expect((await element(page, 0, body)).align).toBe('center');
  await bar(page).getByRole('textbox', { name: '글씨 크기' }).fill('50');
  await bar(page).getByRole('textbox', { name: '글씨 크기' }).press('Enter');
  expect((await element(page, 0, body)).fontSize).toBe(50);
  await bar(page).getByRole('textbox', { name: '글씨 크기' }).fill('9999');
  await bar(page).getByRole('textbox', { name: '글씨 크기' }).press('Enter');
  expect((await element(page, 0, body)).fontSize).toBe(240);
  await page.keyboard.press('Control+z').catch(() => undefined);
  await page.getByRole('button', { name: '되돌리기' }).click();
  await bar(page).locator('input[type=color]').evaluate((input: HTMLInputElement) => { input.value = '#123456'; input.dispatchEvent(new Event('change', { bubbles: true })); });
  expect((await element(page, 0, body)).color).toBe('#123456');
  const countBefore = (await history(page)).undo;
  // 입력 중에는 여러 번 바꿔도 확정할 때 기록 하나다.
  await page.mouse.dblclick(start.x, start.y);
  await expect(area(page)).toBeFocused();
  await bar(page).getByRole('button', { name: '글씨 크게' }).click();
  await bar(page).getByRole('button', { name: '왼쪽 정렬' }).click();
  await expect(area(page)).toBeFocused();
  await page.keyboard.type('!');
  await clickEmpty(page);
  await expect(area(page)).toHaveCount(0);
  expect((await history(page)).undo).toBe(countBefore + 1);
  const edited = await element(page, 0, body);
  expect(edited.align).toBe('left'); expect(edited.text).toContain('!');
});

test('입력 중 내려받기·되돌리기 버튼을 누르면 먼저 확정한다', async ({ page }) => {
  await open(page);
  const start = await screen(page, 150, 90);
  await page.mouse.dblclick(start.x, start.y);
  await page.keyboard.press('Control+End'); await page.keyboard.type(' 끝');
  await page.getByRole('button', { name: '되돌리기' }).click();
  await expect(area(page)).toHaveCount(0);
  // 먼저 확정된 입력을 되돌린 상태다.
  expect((await element(page, 0, title)).text).toBe('우리 가족 소개');
  await page.getByRole('button', { name: '다시 하기' }).click();
  expect((await element(page, 0, title)).text).toBe('우리 가족 소개 끝');
});

test('배경에 어울리는 색으로 새 글씨를 시작하고 있던 글씨 색은 바꾸지 않는다', async ({ page }) => {
  await open(page);
  await openSlide(page, 4);
  if (await rail(page, '배경').getAttribute('aria-pressed') !== 'true') await rail(page, '배경').click();
  await page.getByRole('region', { name: '배경 패널' }).getByRole('button', { name: '배경 우주 탐험' }).click();
  await expect.poll(async () => (await doc(page)).slides[3].background.kind).toBe('image');
  await rail(page, '텍스트').click();
  await page.getByRole('button', { name: '본문 추가' }).click();
  await page.keyboard.type('우주');
  await page.keyboard.press('Escape');
  expect((await doc(page)).slides[3].elements[0].color).toBe('#FFFFFF');
  // 어두운 단색 배경.
  if (await rail(page, '배경').getAttribute('aria-pressed') !== 'true') await rail(page, '배경').click();
  await page.getByRole('region', { name: '배경 패널' }).getByRole('button', { name: '배경 색 #FFF3B0' }).click();
  expect((await doc(page)).slides[3].elements[0].color).toBe('#FFFFFF');
  await rail(page, '텍스트').click();
  await page.getByRole('button', { name: '본문 추가' }).click();
  await page.keyboard.type('노랑');
  await page.keyboard.press('Escape');
  expect((await doc(page)).slides[3].elements.at(-1).color).toBe('#283B37');
});

test('글씨가 슬라이드 아래로 넘치면 안내한다', async ({ page }) => {
  await open(page);
  await openSlide(page, 4);
  await rail(page, '텍스트').click();
  await page.getByRole('button', { name: '아주 큰 글씨' }).click();
  for (let i = 0; i < 8; i++) { await page.keyboard.type('줄'); await page.keyboard.press('Enter'); }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('status')).toContainText('넘쳤어요');
});

test('Enter로 선택한 글씨 입력을 시작하고, 터치 두 번 누르기로도 시작한다', async ({ page, browser }) => {
  await open(page);
  const start = await screen(page, 150, 90);
  await page.mouse.click(start.x, start.y);
  await page.keyboard.press('Enter');
  await expect(area(page)).toBeFocused();
  await page.keyboard.press('Escape');

  const context = await browser.newContext({ hasTouch: true, viewport: { width: 1280, height: 800 } }); const touchPage = await context.newPage();
  await open(touchPage, 1280, 800);
  const cdp = await context.newCDPSession(touchPage);
  const point = await screen(touchPage, 150, 90);
  for (let i = 0; i < 2; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
  await expect(area(touchPage)).toBeVisible();
  await context.close();
});

test('템플릿 글씨를 고치면 PPT와 PDF에 반영된다', async ({ page }) => {
  await fs.mkdir(OUT, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await newSlideProject(page);
  await page.getByRole('navigation', { name: '도구' }).getByRole('button', { name: '템플릿' }).click();
  await page.getByRole('region', { name: '템플릿 패널' }).getByRole('button', { name: '템플릿 나를 소개해요' }).click();
  await expect(page.getByRole('status')).toContainText('새 작품');
  await page.waitForTimeout(400);
  const before = (await doc(page)).slides[0].elements.find((item: any) => item.type === 'text' && item.text.includes('안녕'));
  const start = await screen(page, before.x + 100, before.y + 20);
  await page.mouse.dblclick(start.x, start.y);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('안녕! 나는 민지야');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, 'editing-1366.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 'edited-1366.png') });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '공유' }).click();
  await page.getByRole('menuitem', { name: '다운로드' }).click();
  await page.getByRole('radio', { name: 'PowerPoint (.pptx)' }).check();
  await page.getByRole('button', { name: '내려받기', exact: true }).click();
  const saved = path.join(OUT, 'template-edited.pptx'); await (await download).saveAs(saved);
  const zip = await JSZip.loadAsync(await fs.readFile(saved));
  expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain('안녕! 나는 민지야');
});

test('텍스트 패널과 설정 줄 화면', async ({ page }) => {
  await fs.mkdir(OUT, { recursive: true });
  for (const [width, height] of [[1366, 768], [1280, 720], [1024, 768]]) {
    await open(page, width, height);
    const start = await screen(page, 200, 240);
    await page.mouse.click(start.x, start.y);
    if (!(await page.getByRole('region', { name: '텍스트 패널' }).count())) await rail(page, '텍스트').click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, `text-${width}.png`) });
    // 설정 줄이 잘리지 않는다.
    const row = (await page.locator('.selection-row').boundingBox())!;
    await bar(page).getByRole('button', { name: '삭제' }).scrollIntoViewIfNeeded();
    const remove = (await bar(page).getByRole('button', { name: '삭제' }).boundingBox())!;
    expect(remove.x + remove.width).toBeLessThanOrEqual(row.x + row.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  }
});

test('글꼴: 고르면 바로 바뀌고 저장·출력되며 굵은 파일이 없는 글꼴은 굵게를 끈다', async ({ page }) => {
  await fs.mkdir(OUT, { recursive: true });
  await open(page);
  const start = await screen(page, 150, 90);
  await page.mouse.click(start.x, start.y);
  expect(await selectedId(page)).toBe(title);
  expect((await element(page, 0, title)).bold).toBe(true);
  const font = bar(page).getByRole('combobox', { name: '글꼴' });
  await expect(font.locator('option')).toHaveCount(6);
  await font.selectOption('round-jua');
  expect(await element(page, 0, title)).toMatchObject({ fontId: 'round-jua', bold: false });
  await expect(bar(page).getByRole('button', { name: '굵게' })).toBeDisabled();
  await font.selectOption('hand-gaegu');
  await expect(bar(page).getByRole('button', { name: '굵게' })).toBeEnabled();
  await bar(page).getByRole('button', { name: '굵게' }).click();
  expect(await element(page, 0, title)).toMatchObject({ fontId: 'hand-gaegu', bold: true });
  // 모든 글꼴을 한 장에 넣어 화면과 출력을 비교한다.
  await page.evaluate(async slideId => {
    const { store } = (window as any).__canvacraft;
    const fonts = [['sans-ko', '기본 글씨 우리 가족 English 123'], ['round-jua', '주아체 우리 가족 English 123'], ['block-dohyeon', '도현체 우리 가족 English 123'], ['hand-gamja', '감자꽃체 우리 가족 English 123'], ['hand-pen', '나눔손글씨 펜 우리 가족 English 123'], ['hand-gaegu', '개구쟁이체 우리 가족 English 123']];
    fonts.forEach(([fontId, text], i) => { const p = store.getProject(); store.dispatch(p.id, p.revision, { type: 'addText', slideId, x: 80, y: 40 + i * 110, width: 1120, text, fontId, fontSize: 56, bold: false, color: '#283B37', align: 'left', lineHeight: 1.3 }); });
  }, ids.slide4);
  await openSlide(page, 4);
  await page.waitForTimeout(800);
  await page.getByTestId('paper').screenshot({ path: path.join(OUT, 'fonts-screen.png') });
  for (const [label, name] of [['PowerPoint (.pptx)', 'fonts.pptx'], ['모양 그대로 PowerPoint', 'fonts-image.pptx'], ['PDF', 'fonts.pdf']]) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '공유' }).click();
    await page.getByRole('menuitem', { name: '다운로드' }).click();
    await page.getByRole('radio', { name: label }).check();
    await page.getByRole('button', { name: '내려받기', exact: true }).click();
    await (await download).saveAs(path.join(OUT, name));
    await expect(page.getByRole('status')).toContainText('내려받았어요');
    if (label.startsWith('PowerPoint')) await expect(page.getByRole('status')).toContainText('맑은 고딕');
    await page.keyboard.press('Escape');
  }
});

// '가'가 든 글자 묶음을 받지 않는 글씨. 앱 화면은 기본 글씨만 쓰므로 다른 글꼴의 그 묶음은 저절로 받아지지 않는다.
test('글꼴: 드문 글자로만 된 글씨도 바꾸면 캔버스에 바로 나타나고 출력된다', async ({ page }) => {
  await open(page);
  const canvasHash = () => page.evaluate(() => {
    let value = 0;
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>('[data-testid=paper] canvas')) { const url = canvas.toDataURL(); for (let i = 0; i < url.length; i += 7) value = (value * 31 + url.charCodeAt(i)) | 0; }
    return value;
  });
  await page.evaluate(id => {
    const { store } = (window as any).__canvacraft; const p = store.getProject();
    const result = store.dispatch(p.id, p.revision, { type: 'updateText', slideId: p.slides[0].id, elementId: id, text: '튼튼' });
    if (!result.ok) throw new Error(result.message);
  }, title);
  const start = await screen(page, 150, 90);
  await page.mouse.click(start.x, start.y);
  expect(await selectedId(page)).toBe(title);
  const font = bar(page).getByRole('combobox', { name: '글꼴' });
  for (const fontId of ['round-jua', 'block-dohyeon', 'hand-gamja', 'hand-pen', 'hand-gaegu']) {
    const before = await canvasHash();
    await font.selectOption(fontId);
    await expect.poll(canvasHash, { timeout: 2000 }).not.toBe(before);
    await expect(page.locator('p.status')).not.toContainText('글꼴을 불러오지 못했어요');
  }
  // 고른 글꼴이 실제로 쓰였는지 본다. 대체 글꼴로 그렸으면 폭이 달라진다.
  const used = await page.evaluate(async () => {
    const { fontCss } = await import('/src/rendering/text/fonts.ts' as string);
    const element = (window as any).__canvacraft.store.getProject().slides[0].elements.find((item: any) => item.text === '튼튼');
    return document.fonts.check(fontCss(element), element.text);
  });
  expect(used).toBe(true);
  // 출력도 같은 준비 과정을 거친다.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '공유' }).click();
  await page.getByRole('menuitem', { name: '다운로드' }).click();
  await page.getByRole('radio', { name: 'PDF' }).check();
  await page.getByRole('button', { name: '내려받기', exact: true }).click();
  await download;
  await expect(page.locator('p.status')).toContainText('내려받았어요');
});

test('글꼴: 파일을 받지 못하면 안내하고, 화면은 지금 문서를 보여 주며, 출력은 멈춘다', async ({ page }) => {
  await open(page);
  await page.route(/gamja-flower/, route => route.abort());
  const start = await screen(page, 150, 90);
  await page.mouse.click(start.x, start.y);
  const canvasHash = () => page.evaluate(() => {
    let value = 0;
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>('[data-testid=paper] canvas')) { const url = canvas.toDataURL(); for (let i = 0; i < url.length; i += 7) value = (value * 31 + url.charCodeAt(i)) | 0; }
    return value;
  });
  await bar(page).getByRole('combobox', { name: '글꼴' }).selectOption('hand-gamja');
  await expect(page.locator('p.status')).toContainText('글꼴을 불러오지 못했어요');
  // 받지 못한 뒤의 편집도 화면에 나타난다. 이전 모습에 멈추지 않는다.
  const before = await canvasHash();
  await bar(page).getByRole('button', { name: '가운데 정렬' }).click();
  await expect.poll(canvasHash, { timeout: 2000 }).not.toBe(before);
  // 대체 글꼴로 된 PDF를 정상 결과로 내주지 않는다.
  await page.getByRole('button', { name: '공유' }).click();
  await page.getByRole('menuitem', { name: '다운로드' }).click();
  await page.getByRole('radio', { name: 'PDF' }).check();
  await page.getByRole('button', { name: '내려받기', exact: true }).click();
  await expect(page.locator('p.status')).toContainText('글꼴을 불러오지 못했어요');
  await page.keyboard.press('Escape');
  // 한 번 실패한 글꼴은 브라우저가 다시 받지 않는다. 새로고침하면 저장본이 고른 글꼴로 열린다.
  await page.unroute(/gamja-flower/);
  await expect(page.getByTestId('save-state')).toHaveText('저장됨', { timeout: 4000 });
  await page.reload();
  await expect(page.getByRole('status')).toContainText('저장된 작품을 열었어요');
  await expect(page.locator('p.status')).not.toContainText('글꼴을 불러오지 못했어요');
  const ready = await page.evaluate(async () => {
    const { fontCss } = await import('/src/rendering/text/fonts.ts' as string);
    const element = (window as any).__canvacraft.store.getProject().slides[0].elements.find((item: any) => item.fontId === 'hand-gamja');
    return document.fonts.check(fontCss(element), element.text);
  });
  expect(ready).toBe(true);
});
