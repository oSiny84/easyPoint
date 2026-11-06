import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ids, loadSample, sampleAssets } from '../contracts/helpers';

// UI_REFERENCE §4: 선택·이동·크기 조절·설정 줄·단축키·장 순서.
const OUT = 'artifacts/phase4';
const body = '00000000-0000-4000-8000-000000000014';
const stroke2 = '00000000-0000-4000-8000-000000000015';

async function sampleFile() {
  const project = loadSample(); const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format: 'canvacraft', schemaVersion: 1 }));
  zip.file('project.json', JSON.stringify(project));
  for (const asset of project.assetManifest) zip.file(`assets/${asset.id}.${asset.mime === 'image/png' ? 'png' : 'jpg'}`, sampleAssets().get(asset.id)!);
  return { name: '샘플.canvacraft', mimeType: 'application/zip', buffer: Buffer.from(await zip.generateAsync({ type: 'uint8array' })) };
}
async function open(page: Page, width = 1440, height = 1000) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await expect(page.getByTestId('paper')).toBeVisible();
  await page.getByTestId('open-file').setInputFiles(await sampleFile());
  await expect(page.getByRole('status')).toContainText('새 작품으로 열었어요');
  await expect(page.locator('.paper canvas').first()).toBeVisible();
  await page.waitForTimeout(150);
}
const doc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__canvacraft.store.getProject())));
const element = async (page: Page, slide: number, id: string) => (await doc(page)).slides[slide].elements.find((item: any) => item.id === id);
const history = (page: Page) => page.evaluate(() => (window as any).__canvacraft.store.historySize());
const selectedId = (page: Page) => page.evaluate(() => (window as any).__canvacraft.selectedId());
async function setZoom(page: Page, percent: number) {
  await page.getByRole('slider', { name: '화면 배율' }).fill(String(percent));
  await expect(page.getByTestId('zoom-value')).toHaveText(`${percent}%`);
  await page.waitForTimeout(100);
}
// 논리 좌표를 화면 좌표로 바꾼다. 스크롤과 배율을 모두 반영한다.
async function screen(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('paper').boundingBox())!; const scale = box.width / 1280;
  return { x: box.x + x * scale, y: box.y + y * scale, scale };
}
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 }); await page.mouse.up();
}

for (const percent of [50, 100, 150]) test(`배율 ${percent}%에서 끈 만큼 정확히 옮기고 취소 한 번으로 돌아온다`, async ({ page }) => {
  await open(page, 2300, 1400);
  await setZoom(page, percent);
  const start = await screen(page, 900, 300);
  const scale = start.scale;
  // 논리 100, 50px만큼 끈다.
  const before = await history(page);
  await drag(page, start, { x: start.x + 100 * scale, y: start.y + 50 * scale });
  const moved = await element(page, 0, ids.photo1);
  expect(moved.x).toBeCloseTo(860, 0); expect(moved.y).toBeCloseTo(250, 0);
  expect(moved.width).toBe(400); expect(moved.height).toBe(300);
  expect((await history(page)).undo).toBe(before.undo + 1);
  // 선택 테두리가 새 위치에 있다.
  const box = (await page.getByTestId('selection-box').boundingBox())!; const origin = await screen(page, 860, 250);
  expect(Math.abs(box.x - origin.x)).toBeLessThan(3); expect(Math.abs(box.y - origin.y)).toBeLessThan(3);
  expect(Math.abs(box.width - 400 * scale)).toBeLessThan(5);
  await page.getByRole('button', { name: '되돌리기' }).click();
  expect(await element(page, 0, ids.photo1)).toMatchObject({ x: 760, y: 200 });
  // 손잡이 크기 조절도 같은 배율에서 맞는다.
  const handle = (await page.getByTestId('handle-se').boundingBox())!;
  const center = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  await drag(page, center, { x: center.x - 200 * scale, y: center.y - 150 * scale });
  const resized = await element(page, 0, ids.photo1);
  expect(resized.x).toBe(760); expect(resized.y).toBe(200);
  expect(resized.width).toBeCloseTo(200, -1); expect(resized.width / resized.height).toBeCloseTo(4 / 3, 2);
  await page.keyboard.press('Control+z');
  expect(await element(page, 0, ids.photo1)).toMatchObject({ width: 400, height: 300 });
});

test('화면보다 큰 배율에서 스크롤한 뒤에도 좌표가 맞는다', async ({ page }) => {
  await open(page, 1366, 768);
  await setZoom(page, 150);
  await page.getByTestId('work').evaluate(work => { work.scrollLeft = work.scrollWidth; work.scrollTop = 200; });
  const start = await screen(page, 900, 300);
  await drag(page, start, { x: start.x - 60 * start.scale, y: start.y + 30 * start.scale });
  const moved = await element(page, 0, ids.photo1);
  expect(moved.x).toBeCloseTo(700, 0); expect(moved.y).toBeCloseTo(230, 0);
});

test('선택: 클릭, 빈 곳, Escape, 작업 영역. 끌지 않은 클릭은 문서를 바꾸지 않는다', async ({ page }) => {
  await open(page);
  const before = await doc(page);
  const photo = await screen(page, 1000, 450);
  await page.mouse.click(photo.x, photo.y);
  expect(await selectedId(page)).toBe(ids.photo1);
  await expect(page.getByTestId('selection-box')).toBeVisible();
  await expect(page.getByRole('toolbar', { name: '선택한 요소 설정' }).getByRole('button', { name: '삭제' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await selectedId(page)).toBeNull();
  await page.mouse.click(photo.x, photo.y);
  const empty = await screen(page, 600, 650);
  await page.mouse.click(empty.x, empty.y);
  expect(await selectedId(page)).toBeNull();
  await page.mouse.click(photo.x, photo.y);
  const work = (await page.getByTestId('work').boundingBox())!;
  await page.mouse.click(work.x + 5, work.y + 5);
  expect(await selectedId(page)).toBeNull();
  await expect(page.getByTestId('selection-box')).toHaveCount(0);
  expect(await doc(page)).toEqual(before);
});

test('앞에 그려진 요소가 먼저 잡히고, 획은 선 근처에서만 잡히며 손잡이가 없다', async ({ page }) => {
  await open(page);
  // 사진 위 둘째 획(900,330 ~ 1140,330 부근).
  const onStroke = await screen(page, 1020, 360);
  await page.mouse.click(onStroke.x, onStroke.y);
  expect(await selectedId(page)).toBe(stroke2);
  await expect(page.getByTestId('handle-se')).toHaveCount(0);
  // 획의 영역 안이지만 선이 아닌 곳은 아래 사진이 잡힌다.
  const offStroke = await screen(page, 1020, 480);
  await page.mouse.click(offStroke.x, offStroke.y);
  expect(await selectedId(page)).toBe(ids.photo1);
  // 획도 끌어서 옮긴다.
  const start = await screen(page, 1020, 360);
  await drag(page, start, { x: start.x - 50 * start.scale, y: start.y + 20 * start.scale });
  const moved = await element(page, 0, stroke2);
  expect(moved.x).toBeCloseTo(850, 0); expect(moved.y).toBeCloseTo(350, 0);
  expect(moved.points).toEqual([0, 0, 120, 30, 240, 0]);
});

test('글씨: 좌우 손잡이는 폭만, 모서리는 글씨 크기도 바꾸고, 더블클릭하면 입력을 시작한다', async ({ page }) => {
  await open(page);
  const text = await screen(page, 200, 240);
  await page.mouse.click(text.x, text.y);
  expect(await selectedId(page)).toBe(body);
  await expect(page.getByTestId('handle-e')).toBeVisible();
  const e = (await page.getByTestId('handle-e').boundingBox())!;
  await drag(page, { x: e.x + e.width / 2, y: e.y + e.height / 2 }, { x: e.x + e.width / 2 - 100 * text.scale, y: e.y + e.height / 2 });
  let current = await element(page, 0, body);
  expect(current.width).toBeCloseTo(520, -1); expect(current.fontSize).toBe(36); expect(current.x).toBe(80);
  const se = (await page.getByTestId('handle-se').boundingBox())!;
  await drag(page, { x: se.x + se.width / 2, y: se.y + se.height / 2 }, { x: se.x + se.width / 2 - 130 * text.scale, y: se.y + se.height / 2 });
  current = await element(page, 0, body);
  expect(current.width).toBeCloseTo(390, -1); expect(current.fontSize).toBeCloseTo(27, 0);
  expect((await history(page)).undo).toBe(2);
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
  expect(await element(page, 0, body)).toMatchObject({ width: 620, fontSize: 36 });
  await page.mouse.dblclick(text.x, text.y);
  await expect(page.getByRole('textbox', { name: '슬라이드 글씨' })).toBeVisible();
});

test('이동은 슬라이드 안으로 제한되고 Escape로 끄는 중 취소한다', async ({ page }) => {
  await open(page);
  const start = await screen(page, 900, 300);
  await drag(page, start, { x: start.x + 2000, y: start.y + 2000 });
  expect(await element(page, 0, ids.photo1)).toMatchObject({ x: 880, y: 420 });
  await page.keyboard.press('Control+z');
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 80, start.y + 80, { steps: 3 });
  await page.keyboard.press('Escape'); await page.mouse.up();
  expect(await element(page, 0, ids.photo1)).toMatchObject({ x: 760, y: 200 });
});

test('설정 줄·더보기·우클릭·Delete·단축키가 같은 명령을 쓴다', async ({ page }) => {
  await open(page);
  const photo = await screen(page, 1000, 450);
  await page.mouse.click(photo.x, photo.y);
  const bar = page.getByRole('toolbar', { name: '선택한 요소 설정' });
  await expect(bar.getByRole('button', { name: '뒤로' })).toBeDisabled();
  await bar.getByRole('button', { name: '복제' }).click();
  let slide = (await doc(page)).slides[0];
  expect(slide.elements.length).toBe(7);
  expect(slide.elements[1]).toMatchObject({ type: 'image', x: 780, y: 220, assetId: slide.elements[0].assetId });
  expect(await selectedId(page)).toBe(slide.elements[1].id);
  await bar.getByRole('button', { name: '앞으로' }).click();
  slide = (await doc(page)).slides[0];
  expect(slide.elements[2].type).toBe('image');
  await bar.getByRole('button', { name: '뒤로' }).click();
  expect((await doc(page)).slides[0].elements[1].type).toBe('image');
  await page.getByRole('button', { name: '더보기' }).click();
  await page.getByRole('menuitem', { name: '삭제' }).click();
  expect((await doc(page)).slides[0].elements.length).toBe(6);
  expect(await selectedId(page)).toBeNull();
  await page.mouse.click(photo.x, photo.y, { button: 'right' });
  await expect(page.getByRole('menu', { name: '요소 메뉴' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: '요소 메뉴' })).toHaveCount(0);
  expect(await selectedId(page)).toBe(ids.photo1);
  await page.keyboard.press('Delete');
  expect((await doc(page)).slides[0].elements.some((item: any) => item.id === ids.photo1)).toBe(false);
  await page.keyboard.press('Control+z');
  expect((await doc(page)).slides[0].elements[0].id).toBe(ids.photo1);
  await page.keyboard.press('Control+Shift+z');
  expect((await doc(page)).slides[0].elements.some((item: any) => item.id === ids.photo1)).toBe(false);
  await page.keyboard.press('Control+z');
  // 입력창에서는 Delete·Ctrl+Z가 문서에 끼어들지 않는다.
  await page.mouse.click(photo.x, photo.y);
  const revision = (await doc(page)).revision;
  await page.getByRole('textbox', { name: '작품 이름' }).click();
  await page.keyboard.press('Delete'); await page.keyboard.press('Control+z');
  expect((await doc(page)).revision).toBe(revision);
});

test('슬라이드 복제 후 한쪽 편집이 다른 쪽을 바꾸지 않는다', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '1번째 장 메뉴' }).click({ force: true });
  await page.getByRole('menuitem', { name: '복제' }).click();
  await page.waitForTimeout(200);
  const start = await screen(page, 900, 300);
  await drag(page, start, { x: start.x - 50, y: start.y - 50 });
  const { slides } = await doc(page);
  expect(slides[0].elements[0]).toMatchObject({ x: 760, y: 200 });
  expect(slides[1].elements[0].x).toBeLessThan(760);
  expect(slides[1].elements[0].id).not.toBe(slides[0].elements[0].id);
});

test('하단 목록: 끌어서 순서를 바꾸고 취소 한 번으로 돌아온다', async ({ page }) => {
  await open(page);
  const order = async () => (await doc(page)).slides.map((slide: any) => slide.id);
  const thumb = (index: number) => page.getByRole('button', { name: `${index + 1}번째 장`, exact: true });
  const first = (await thumb(0).boundingBox())!, third = (await thumb(2).boundingBox())!;
  await drag(page, { x: first.x + 40, y: first.y + 30 }, { x: third.x + third.width - 5, y: third.y + 30 });
  expect(await order()).toEqual([ids.slide2, ids.slide3, ids.slide1, ids.slide4]);
  expect((await history(page)).undo).toBe(1);
  await page.keyboard.press('Control+z');
  expect(await order()).toEqual([ids.slide1, ids.slide2, ids.slide3, ids.slide4]);
  // 살짝 움직인 클릭은 장 선택이다.
  const second = (await thumb(1).boundingBox())!;
  await page.mouse.click(second.x + 40, second.y + 30);
  await expect(thumb(1)).toHaveAttribute('aria-current', 'true');
  expect(await order()).toEqual([ids.slide1, ids.slide2, ids.slide3, ids.slide4]);
});

test('패널: 열고 닫으면 슬라이드가 남은 영역에 맞고 패널이 덮지 않는다', async ({ page }) => {
  await open(page);
  // 넓은 화면은 배경 패널이 열린 채 시작한다.
  await page.getByRole('button', { name: '패널 닫기' }).click();
  await page.waitForTimeout(150);
  const closed = (await page.getByTestId('paper').boundingBox())!;
  await page.getByRole('navigation', { name: '도구' }).getByRole('button', { name: '요소' }).click();
  const panel = page.getByRole('region', { name: '요소 패널' });
  await expect(panel).toBeVisible();
  await page.waitForTimeout(150);
  const opened = (await page.getByTestId('paper').boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(opened.x).toBeGreaterThanOrEqual(panelBox.x + panelBox.width);
  expect(opened.width).toBeLessThanOrEqual(closed.width);
  await page.getByRole('navigation', { name: '도구' }).getByRole('button', { name: '배경' }).click();
  await expect(page.getByRole('region', { name: '배경 패널' })).toBeVisible();
  await expect(panel).toHaveCount(0);
  await page.getByRole('button', { name: '패널 닫기' }).click();
  await expect(page.getByRole('region', { name: '배경 패널' })).toHaveCount(0);
  await page.waitForTimeout(150);
  expect((await page.getByTestId('paper').boundingBox())!.width).toBeCloseTo(closed.width, 0);
});

for (const [width, height] of [[1366, 768], [1280, 720], [1024, 768]]) test(`${width}×${height}: 화면 구역이 잘리지 않고 겹치지 않는다`, async ({ page }) => {
  await fs.mkdir(OUT, { recursive: true });
  await open(page, width, height);
  const photo = await screen(page, 1000, 450);
  await page.mouse.click(photo.x, photo.y);
  await page.getByRole('navigation', { name: '도구' }).getByRole('button', { name: '요소' }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, `screen-${width}x${height}.png`) });
  const overflow = await page.evaluate(() => ({ x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight }));
  expect(overflow).toEqual({ x: 0, y: 0 });
  const boxes = { top: await page.locator('.topbar').boundingBox(), bottom: await page.locator('.bottom').boundingBox(), paper: await page.getByTestId('paper').boundingBox(), zoom: await page.locator('.zoom').boundingBox(), list: await page.locator('.slide-list').boundingBox() };
  expect(boxes.top!.y).toBe(0);
  expect(boxes.bottom!.y + boxes.bottom!.height).toBeLessThanOrEqual(height);
  expect(boxes.paper!.y).toBeGreaterThanOrEqual(boxes.top!.height);
  expect(boxes.paper!.y + boxes.paper!.height).toBeLessThanOrEqual(boxes.bottom!.y);
  expect(boxes.list!.x + boxes.list!.width).toBeLessThanOrEqual(boxes.zoom!.x + 1);
  // 버튼 터치 영역 목표 44px.
  for (const name of ['되돌리기', '공유', '페이지 추가']) expect((await page.getByRole('button', { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('터치: 끌어서 옮기고, 입력 취소는 문서를 바꾸지 않으며 다음 조작이 막히지 않는다', async ({ browser }) => {
  // CDP 터치 입력이다. 실제 터치 기기 확인을 대신하지 않는다.
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await open(page, 1280, 800);
  const cdp = await context.newCDPSession(page);
  const touch = (type: string, x?: number, y?: number) => cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: x === undefined ? [] : [{ x, y: y! }] });
  // 터치는 잡는 여유가 넓으므로 획에서 먼 사진 위치를 고른다.
  const start = await screen(page, 1000, 470);
  await touch('touchStart', start.x, start.y);
  await touch('touchMove', start.x + 60, start.y + 30);
  await touch('touchCancel');
  expect(await element(page, 0, ids.photo1)).toMatchObject({ x: 760, y: 200 });
  await touch('touchStart', start.x, start.y);
  for (let i = 1; i <= 5; i++) await touch('touchMove', start.x + i * 20 * start.scale, start.y + i * 10 * start.scale);
  await touch('touchEnd');
  await page.waitForTimeout(100);
  const moved = await element(page, 0, ids.photo1);
  expect(moved.x).toBeCloseTo(860, 0); expect(moved.y).toBeCloseTo(250, 0);
  expect(await page.evaluate(() => (window as any).__canvacraft.store.historySize().undo)).toBe(1);
  await context.close();
});

test('300획 문서에서 끌기 중 프레임이 밀리지 않는다', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async slideId => {
    const { store } = (window as any).__canvacraft;
    let seed = 7; const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let n = 0; n < 300; n++) {
      let x = 100 + random() * 300, y = 100 + random() * 200, angle = random() * 7; const points: number[] = [];
      for (let i = 0; i < 200; i++) { angle += (random() - 0.5) * 0.5; x = Math.min(1270, Math.max(5, x + Math.cos(angle) * 4)); y = Math.min(710, Math.max(5, y + Math.sin(angle) * 4)); points.push(+x.toFixed(1), +y.toFixed(1)); }
      const p = store.getProject(); store.dispatch(p.id, p.revision, { type: 'addStroke', slideId, x: 0, y: 0, points, color: '#577590', strokeWidth: 8 });
    }
    return store.getProject().slides[3].elements.length;
  }, ids.slide4);
  expect(result).toBe(300);
  await page.getByRole('button', { name: '4번째 장', exact: true }).click();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const w = window as any; w.frames = []; w.running = true;
    const loop = (t: number) => { w.frames.push(t); if (w.running) requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  });
  // 그림 한가운데의 획 하나를 끈다.
  const scene = await page.evaluate(() => { const { store } = (window as any).__canvacraft; const el = store.getProject().slides[3].elements[299]; return { x: el.points[200], y: el.points[201] }; });
  const start = await screen(page, scene.x, scene.y);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  for (let i = 1; i <= 60; i++) await page.mouse.move(start.x + i * 2, start.y + i);
  await page.mouse.up();
  const gaps = await page.evaluate(() => { const w = window as any; w.running = false; return w.frames.slice(1).map((t: number, i: number) => t - w.frames[i]); });
  const sorted = [...gaps].sort((a: number, b: number) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)], max = sorted[sorted.length - 1];
  console.log(`끌기 프레임 간격 p95 ${p95.toFixed(1)}ms, 최대 ${max.toFixed(1)}ms, ${gaps.length}프레임`);
  expect(p95).toBeLessThan(50);
  expect((await doc(page)).slides[3].elements.length).toBe(300);
});
