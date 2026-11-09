import { test, expect, type Page } from '@playwright/test';
import { newSlideProject } from './start';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ids, loadSample, sampleAssets } from '../contracts/helpers';

// 그리기(Phase 7). 터치는 CDP 입력이며 실제 터치 기기 확인을 대신하지 않는다.
const OUT = 'artifacts/phase7';
const doc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__canvacraft.store.getProject())));
const history = (page: Page) => page.evaluate(() => (window as any).__canvacraft.store.historySize());
const strokes = async (page: Page, slide = 3) => (await doc(page)).slides[slide].elements.filter((item: any) => item.type === 'stroke');
const rail = (page: Page, name: string) => page.getByRole('navigation', { name: '도구' }).getByRole('button', { name });
const panel = (page: Page) => page.getByRole('region', { name: '그리기 패널' });
const bar = (page: Page) => page.getByRole('toolbar', { name: '선택한 요소 설정' });

async function sampleFile() {
  const project = loadSample(); const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format: 'canvacraft', schemaVersion: 1 }));
  zip.file('project.json', JSON.stringify(project));
  for (const asset of project.assetManifest) zip.file(`assets/${asset.id}.${asset.mime === 'image/png' ? 'png' : 'jpg'}`, sampleAssets().get(asset.id)!);
  return { name: 's.canvacraft', mimeType: 'application/zip', buffer: Buffer.from(await zip.generateAsync({ type: 'uint8array' })) };
}
async function open(page: Page, slide = 4, width = 1440, height = 1000) {
  await page.setViewportSize({ width, height });
  await newSlideProject(page);
  await page.getByTestId('open-file').setInputFiles(await sampleFile());
  await expect(page.getByRole('status')).toContainText('새 작품');
  await page.getByRole('button', { name: `${slide}번째 장`, exact: true }).click();
  await page.waitForTimeout(150);
}
async function screen(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('paper').boundingBox())!; const scale = box.width / 1280;
  return { x: box.x + x * scale, y: box.y + y * scale, scale };
}
async function drawPath(page: Page, points: [number, number][]) {
  const first = await screen(page, ...points[0]);
  await page.mouse.move(first.x, first.y); await page.mouse.down();
  for (const point of points.slice(1)) { const p = await screen(page, ...point); await page.mouse.move(p.x, p.y, { steps: 4 }); }
  await page.mouse.up();
}

test('펜: 한 획이 요소 하나가 되고 취소·다시 실행 한 번으로 오간다', async ({ page }) => {
  await open(page);
  await rail(page, '그리기').click();
  await expect(panel(page)).toBeVisible();
  await expect(page.getByTestId('draw-layer')).toBeVisible();
  await drawPath(page, [[200, 200], [400, 300], [600, 200]]);
  const [stroke] = await strokes(page);
  expect(stroke).toMatchObject({ type: 'stroke', color: '#283B37', strokeWidth: 8 });
  expect(stroke.x).toBeCloseTo(200, 0); expect(stroke.y).toBeCloseTo(200, 0);
  // 곧은 구간의 중간 점은 줄어든다.
  expect(stroke.points.length).toBeLessThan(14);
  expect(Math.max(...stroke.points.filter((_: number, i: number) => i % 2 === 0))).toBeCloseTo(400, -1);
  expect((await history(page)).undo).toBe(1);
  await page.keyboard.press('Control+z');
  expect(await strokes(page)).toHaveLength(0);
  await page.keyboard.press('Control+Shift+z');
  expect(await strokes(page)).toHaveLength(1);
});

test('눌렀다 떼기만 하면 둥근 점이 되고 화면에 보인다', async ({ page }) => {
  await open(page);
  await rail(page, '그리기').click();
  await panel(page).getByRole('button', { name: '펜 색 #E03131' }).click();
  await panel(page).getByRole('button', { name: '펜 굵기 32' }).click();
  const p = await screen(page, 640, 360);
  await page.mouse.click(p.x, p.y);
  const [dot] = await strokes(page);
  expect(dot.points).toEqual([0, 0]);
  expect(dot).toMatchObject({ color: '#E03131', strokeWidth: 32 });
  await page.waitForTimeout(100);
  const png = (await page.getByTestId('paper').screenshot()).toString('base64');
  const red = await page.evaluate(async png => {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    const c = document.createElement('canvas'); c.width = image.width; c.height = image.height; const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(image, 0, 0);
    return [...x.getImageData(image.width / 2, image.height / 2, 1, 1).data];
  }, png);
  expect(red[0]).toBeGreaterThan(200); expect(red[1]).toBeLessThan(80);
});

for (const percent of [50, 100, 150]) test(`배율 ${percent}%에서 그린 자리에 획이 저장된다`, async ({ page }) => {
  await open(page, 4, 2300, 1400);
  await page.getByRole('slider', { name: '화면 배율' }).fill(String(percent));
  await expect(page.getByTestId('zoom-value')).toHaveText(`${percent}%`);
  await page.waitForTimeout(100);
  await rail(page, '그리기').click();
  await drawPath(page, [[300, 200], [700, 200], [700, 500]]);
  const [stroke] = await strokes(page);
  expect(stroke.x).toBeCloseTo(300, -0.5); expect(stroke.y).toBeCloseTo(200, -0.5);
  const xs = stroke.points.filter((_: number, i: number) => i % 2 === 0), ys = stroke.points.filter((_: number, i: number) => i % 2 === 1);
  expect(Math.max(...xs)).toBeCloseTo(400, -0.5); expect(Math.max(...ys)).toBeCloseTo(300, -0.5);
});

test('그리기 모드에서는 사진이 움직이거나 선택되지 않는다', async ({ page }) => {
  await open(page, 1);
  await rail(page, '그리기').click();
  const before = (await doc(page)).slides[0].elements[0];
  await drawPath(page, [[900, 400], [1000, 450]]);
  const after = await doc(page);
  expect(after.slides[0].elements[0]).toEqual(before);
  await expect(page.getByTestId('selection-box')).toHaveCount(0);
  expect(after.slides[0].elements.at(-1).type).toBe('stroke');
  await expect(bar(page).getByRole('button')).toHaveCount(0);
});

test('슬라이드 밖으로 나가도 좌표가 안쪽에 머물고 다음 획이 막히지 않는다', async ({ page }) => {
  await open(page);
  await rail(page, '그리기').click();
  const start = await screen(page, 1200, 300);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 600, start.y + 2000, { steps: 8 });
  await page.mouse.up();
  const [stroke] = await strokes(page);
  const xs = stroke.points.filter((_: number, i: number) => i % 2 === 0).map((v: number) => v + stroke.x), ys = stroke.points.filter((_: number, i: number) => i % 2 === 1).map((v: number) => v + stroke.y);
  expect(Math.max(...xs)).toBeLessThanOrEqual(1280); expect(Math.max(...ys)).toBeLessThanOrEqual(720);
  await drawPath(page, [[100, 100], [200, 200]]);
  expect(await strokes(page)).toHaveLength(2);
});

test('Esc는 그리던 획을 버리고, 한 번 더 누르면 선택으로 돌아간다', async ({ page }) => {
  await open(page);
  await rail(page, '그리기').click();
  const start = await screen(page, 200, 200);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 100, start.y + 100, { steps: 3 });
  await page.keyboard.press('Escape'); await page.mouse.up();
  expect(await strokes(page)).toHaveLength(0);
  await expect(page.getByTestId('draw-layer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('draw-layer')).toHaveCount(0);
  await expect(panel(page)).toHaveCount(0);
});

test('터치: 입력 취소는 획을 버리고 멈추지 않으며, 둘째 손가락은 무시한다', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 1280, height: 800 } }); const page = await context.newPage();
  await open(page, 4, 1280, 800);
  await rail(page, '그리기').click();
  const cdp = await context.newCDPSession(page);
  const touch = (type: string, points: { x: number; y: number; id?: number }[]) => cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: points });
  const a = await screen(page, 200, 200);
  await touch('touchStart', [a]); await touch('touchMove', [{ x: a.x + 80, y: a.y + 80 }]); await touch('touchCancel', []);
  await page.waitForTimeout(50);
  expect(await strokes(page)).toHaveLength(0);
  // 취소 뒤 다음 획이 정상이다.
  await touch('touchStart', [a]);
  for (let i = 1; i <= 5; i++) await touch('touchMove', [{ x: a.x + i * 30, y: a.y }]);
  await touch('touchEnd', []);
  await page.waitForTimeout(50);
  expect(await strokes(page)).toHaveLength(1);
  // 그리는 중 둘째 손가락이 닿아도 획이 튀지 않는다.
  const b = await screen(page, 200, 400); const far = await screen(page, 1100, 650);
  await touch('touchStart', [{ ...b, id: 0 }]);
  await touch('touchMove', [{ x: b.x + 60, y: b.y, id: 0 }]);
  await touch('touchStart', [{ x: b.x + 60, y: b.y, id: 0 }, { ...far, id: 1 }]);
  await touch('touchMove', [{ x: b.x + 120, y: b.y, id: 0 }, { x: far.x + 5, y: far.y, id: 1 }]);
  await touch('touchEnd', [{ x: far.x + 5, y: far.y, id: 1 }]);
  await touch('touchEnd', []);
  await page.waitForTimeout(50);
  const all = await strokes(page);
  expect(all).toHaveLength(2);
  const second = all[1]; const xs = second.points.filter((_: number, i: number) => i % 2 === 0);
  expect(Math.max(...xs) + second.x).toBeLessThan(600);
  await context.close();
});

test('획 지우개: 획만 지우고 사진·글씨는 남으며 한 획이 취소 한 번이다', async ({ page }) => {
  await open(page, 1);
  await rail(page, '그리기').click();
  await panel(page).getByRole('button', { name: '획 지우개' }).click();
  const before = (await doc(page)).slides[0].elements.length;
  // 사진과 글씨를 눌러도 지워지지 않는다.
  for (const [x, y] of [[1000, 470], [200, 240], [600, 650]] as const) { const p = await screen(page, x, y); await page.mouse.click(p.x, p.y); }
  expect((await doc(page)).slides[0].elements.length).toBe(before);
  expect((await history(page)).undo).toBe(0);
  // 사진 위 둘째 획(900,330 → 1020,360)을 누른다.
  const onStroke = await screen(page, 960, 345);
  await page.mouse.click(onStroke.x, onStroke.y);
  expect((await doc(page)).slides[0].elements.length).toBe(before - 1);
  expect((await history(page)).undo).toBe(1);
  await page.keyboard.press('Control+z');
  expect((await doc(page)).slides[0].elements.length).toBe(before);
});

test('획 지우개로 문지르면 지나간 획이 각각 지워지고 각각 되돌린다', async ({ page }) => {
  await open(page);
  await rail(page, '그리기').click();
  await drawPath(page, [[200, 100], [200, 300]]);
  await drawPath(page, [[400, 100], [400, 300]]);
  await drawPath(page, [[600, 100], [600, 300]]);
  await drawPath(page, [[1000, 100], [1000, 300]]);
  await panel(page).getByRole('button', { name: '획 지우개' }).click();
  await drawPath(page, [[100, 200], [700, 200]]);
  const left = await strokes(page);
  expect(left).toHaveLength(1);
  expect(left[0].x).toBeCloseTo(1000, -0.5);
  expect((await history(page)).undo).toBe(4 + 3);
  await page.keyboard.press('Control+z');
  expect(await strokes(page)).toHaveLength(2);
});

test('선택으로 돌아가면 획을 옮기고 색·굵기를 바꾼다. 각각 취소 한 번이다', async ({ page }) => {
  await open(page);
  await rail(page, '그리기').click();
  await drawPath(page, [[300, 300], [600, 300]]);
  await panel(page).getByRole('button', { name: '선택으로 돌아가기' }).click();
  await expect(page.getByTestId('draw-layer')).toHaveCount(0);
  // 패널이 닫혀 슬라이드 크기가 바뀐 뒤의 좌표를 쓴다.
  await page.waitForTimeout(150);
  const p = await screen(page, 450, 300);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('selection-box')).toBeVisible();
  await expect(page.getByTestId('handle-se')).toHaveCount(0);
  await bar(page).getByRole('button', { name: '획 굵게' }).click();
  expect((await strokes(page))[0].strokeWidth).toBe(10);
  await expect(page.getByTestId('stroke-width')).toHaveText('10');
  await bar(page).locator('input[type=color]').evaluate((input: HTMLInputElement) => { input.value = '#ff0000'; input.dispatchEvent(new Event('change', { bubbles: true })); });
  expect((await strokes(page))[0].color).toBe('#FF0000');
  const undoBefore = (await history(page)).undo;
  expect(undoBefore).toBe(3);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x, p.y + 50, { steps: 3 }); await page.mouse.up();
  expect((await strokes(page))[0].y).toBeGreaterThan(300);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect((await strokes(page))[0].color).toBe('#283B37');
  await page.keyboard.press('Control+z');
  expect((await strokes(page))[0].strokeWidth).toBe(8);
});

test('입력 중 그리기 도구를 누르면 글씨를 먼저 확정한다', async ({ page }) => {
  await open(page);
  await rail(page, '텍스트').click();
  await page.getByRole('button', { name: '본문 추가' }).click();
  await page.keyboard.type('글씨 먼저');
  await rail(page, '그리기').click();
  await expect(page.getByTestId('draw-layer')).toBeVisible();
  expect((await doc(page)).slides[3].elements[0].text).toBe('글씨 먼저');
});

test('그림·사진·글씨 앞뒤 순서가 저장·출력까지 유지된다', async ({ page }) => {
  await fs.mkdir(OUT, { recursive: true });
  await open(page, 1);
  await rail(page, '그리기').click();
  await panel(page).getByRole('button', { name: '펜 색 #1C7ED6' }).click();
  await panel(page).getByRole('button', { name: '펜 굵기 16' }).click();
  await drawPath(page, [[120, 420], [300, 620], [500, 440], [640, 620]]);
  const p = await screen(page, 900, 620); await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, 'draw-1366.png') });
  await page.getByTestId('paper').screenshot({ path: path.join(OUT, 'screen.png') });
  const project = await doc(page);
  for (const [label, name] of [['PowerPoint (.pptx)', 'editable.pptx'], ['모양 그대로 PowerPoint', 'image.pptx'], ['PDF', 'sample.pdf']]) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '공유' }).click();
    await page.getByRole('menuitem', { name: '다운로드' }).click();
    await page.getByRole('radio', { name: label }).check();
    await page.getByRole('button', { name: '내려받기', exact: true }).click();
    await (await download).saveAs(path.join(OUT, name));
    await expect(page.getByRole('status')).toContainText('내려받았어요');
    await page.keyboard.press('Escape');
  }
  const zip = await JSZip.loadAsync(await fs.readFile(path.join(OUT, 'editable.pptx')));
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
  // 사진 → 획 → 글씨 → 글씨 → 획 묶음(기존 2개 + 새 2개 연속). 다른 요소를 넘어 묶지 않는다.
  expect([...xml.matchAll(/<p:(pic|sp)>/g)].map(match => match[1])).toEqual(['pic', 'pic', 'sp', 'sp', 'pic']);
  expect(project.slides[0].elements.at(-1).type).toBe('stroke');
  void ids;
});

test('300획×200점 장에서 그려도 프레임이 밀리지 않는다', async ({ page }) => {
  await open(page);
  await page.evaluate(async slideId => {
    const { store } = (window as any).__canvacraft;
    let seed = 11; const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let n = 0; n < 300; n++) {
      let x = 100 + random() * 1000, y = 100 + random() * 500, angle = random() * 7; const raw: number[] = [];
      for (let i = 0; i < 200; i++) { angle += (random() - 0.5) * 0.5; x = Math.min(1270, Math.max(5, x + Math.cos(angle) * 4)); y = Math.min(710, Math.max(5, y + Math.sin(angle) * 4)); raw.push(+x.toFixed(1), +y.toFixed(1)); }
      const p = store.getProject(); store.dispatch(p.id, p.revision, { type: 'addStroke', slideId, x: 0, y: 0, points: raw, color: '#577590', strokeWidth: 8 });
    }
  }, ids.slide4);
  await page.waitForTimeout(500);
  await rail(page, '그리기').click();
  await page.evaluate(() => { const w = window as any; w.frames = []; w.running = true; const loop = (t: number) => { w.frames.push(t); if (w.running) requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
  const start = await screen(page, 200, 200);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  for (let i = 1; i <= 120; i++) await page.mouse.move(start.x + i * 5, start.y + Math.sin(i / 5) * 80);
  await page.mouse.up();
  const gaps: number[] = await page.evaluate(() => { const w = window as any; w.running = false; return w.frames.slice(1).map((t: number, i: number) => t - w.frames[i]); });
  const sorted = [...gaps].sort((a, b) => a - b); const p95 = sorted[Math.floor(sorted.length * 0.95)];
  console.log(`그리기 프레임 간격 p95 ${p95.toFixed(1)}ms, 최대 ${sorted.at(-1)!.toFixed(1)}ms`);
  expect(p95).toBeLessThan(40);
  expect(await strokes(page)).toHaveLength(301);
});
