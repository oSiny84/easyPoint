import { test, expect, type Page } from '@playwright/test';
import { newSlideProject } from './start';
import fs from 'node:fs/promises';

// 왼쪽 패널의 그림을 끌어 슬라이드에 넣기.
const OUT = 'artifacts/phase5';
const doc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__canvacraft.store.getProject())));
const elements = async (page: Page) => (await doc(page)).slides[0].elements;
const selectedId = (page: Page) => page.evaluate(() => (window as any).__canvacraft.selectedId());
const rail = (page: Page, name: string) => page.getByRole('navigation', { name: '도구' }).getByRole('button', { name });
const card = (page: Page) => page.getByRole('region', { name: '요소 목록' }).getByRole('button', { name: '원', exact: true });
const ghost = (page: Page) => page.locator('.drag-ghost');

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await newSlideProject(page);
  await rail(page, '요소').click();
  await expect(card(page)).toBeVisible();
}
async function pressCard(page: Page) {
  await card(page).scrollIntoViewIfNeeded();
  const box = (await card(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  return box;
}
async function onPaper(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('paper').boundingBox())!; const s = box.width / 1280;
  return { x: box.x + x * s, y: box.y + y * s };
}
async function dropAt(page: Page, x: number, y: number) {
  await pressCard(page);
  const at = await onPaper(page, x, y);
  await page.mouse.move(at.x, at.y, { steps: 6 });
  await page.mouse.up();
}

test('끌어 놓으면 놓은 곳이 가운데가 되고 선택되며, 취소 한 번으로 사라진다', async ({ page }) => {
  await open(page);
  await dropAt(page, 800, 450);
  await expect.poll(async () => (await elements(page)).length).toBe(1);
  const [added] = await elements(page);
  expect(added.type).toBe('image');
  expect(Math.abs(added.x + added.width / 2 - 800)).toBeLessThanOrEqual(2);
  expect(Math.abs(added.y + added.height / 2 - 450)).toBeLessThanOrEqual(2);
  expect(await selectedId(page)).toBe(added.id);
  await expect(ghost(page)).toHaveCount(0);
  await page.getByRole('button', { name: '되돌리기' }).click();
  expect(await elements(page)).toEqual([]);
});

test('끄는 동안 그림이 따라오고 슬라이드 위에서 표시가 나며, 실제 넣을 크기로 보인다', async ({ page }) => {
  await open(page);
  await pressCard(page);
  // 조금 움직인 것은 끌기가 아니다.
  const box = (await card(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2 + 2);
  await expect(ghost(page)).toHaveCount(0);
  const at = await onPaper(page, 640, 360);
  await page.mouse.move(at.x, at.y, { steps: 4 });
  await expect(ghost(page)).toBeVisible();
  await expect(page.locator('.paper.drop-target')).toBeVisible();
  const seen = (await ghost(page).boundingBox())!;
  expect(Math.abs(seen.x + seen.width / 2 - at.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(seen.y + seen.height / 2 - at.y)).toBeLessThanOrEqual(2);
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/drag-element.png` });
  await page.mouse.up();
  await expect.poll(async () => (await elements(page)).length).toBe(1);
  // 따라오던 크기가 실제 넣은 크기와 같다.
  const paper = (await page.getByTestId('paper').boundingBox())!;
  const [added] = await elements(page);
  expect(seen.width).toBeCloseTo(added.width * paper.width / 1280, 0);
  expect(seen.height).toBeCloseTo(added.height * paper.width / 1280, 0);
});

test('슬라이드 밖에 놓거나 Esc를 누르거나 카드로 되돌리면 넣지 않는다', async ({ page }) => {
  await open(page);
  // 슬라이드 옆 회색 영역.
  await pressCard(page);
  const paper = (await page.getByTestId('paper').boundingBox())!;
  await page.mouse.move(paper.x + paper.width + 10, paper.y + 10, { steps: 4 });
  await expect(ghost(page)).toBeVisible();
  await expect(page.locator('.paper.drop-target')).toHaveCount(0);
  await page.mouse.up();
  await expect(ghost(page)).toHaveCount(0);
  // 왼쪽 패널 위.
  await pressCard(page);
  await page.mouse.move(40, 400, { steps: 4 });
  await page.mouse.up();
  // 끌다가 Esc. 손을 슬라이드 위에서 떼도 넣지 않는다.
  await pressCard(page);
  const at = await onPaper(page, 640, 360);
  await page.mouse.move(at.x, at.y, { steps: 4 });
  await page.keyboard.press('Escape');
  await expect(ghost(page)).toHaveCount(0);
  await expect(page.locator('.paper.drop-target')).toHaveCount(0);
  await page.mouse.up();
  // 끌었다가 카드 위로 돌아와 떼기. 뒤따르는 click으로 들어가면 안 된다.
  const box = await pressCard(page);
  await page.mouse.move(box.x + 120, box.y + 80, { steps: 3 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await elements(page)).toEqual([]);
  // 끌기를 취소한 뒤의 첫 누르기는 삼켜지지 않는다.
  await card(page).click();
  await expect.poll(async () => (await elements(page)).length).toBe(1);
  const [added] = await elements(page);
  expect(added.x + added.width / 2).toBeCloseTo(640, 0);
  expect(added.y + added.height / 2).toBeCloseTo(360, 0);
});

test('가장자리에 놓아도 슬라이드 안에 들어오고, 같은 곳에 또 놓으면 겹치지 않게 비켜 난다', async ({ page }) => {
  await open(page);
  await dropAt(page, 2, 2);
  await expect.poll(async () => (await elements(page)).length).toBe(1);
  expect((await elements(page))[0]).toMatchObject({ x: 0, y: 0 });
  await dropAt(page, 1278, 718);
  await expect.poll(async () => (await elements(page)).length).toBe(2);
  const corner = (await elements(page))[1];
  expect(corner.x + corner.width).toBe(1280); expect(corner.y + corner.height).toBe(720);
  await dropAt(page, 2, 2);
  await expect.poll(async () => (await elements(page)).length).toBe(3);
  expect((await elements(page))[2]).toMatchObject({ x: 20, y: 20 });
});

test('화면 배율이 달라도 놓은 곳에 들어간다', async ({ page }) => {
  await open(page);
  for (const zoom of ['50', '150']) {
    await page.getByRole('slider').fill(zoom);
    const before = (await elements(page)).length;
    await page.getByTestId('work').evaluate(node => { node.scrollLeft = 0; node.scrollTop = 0; });
    await dropAt(page, 300, 250);
    await expect.poll(async () => (await elements(page)).length).toBe(before + 1);
    const added = (await elements(page)).at(-1);
    // 같은 곳에 두 번째로 놓으면 비켜 날 수 있으므로 여유를 둔다.
    expect(Math.abs(added.x + added.width / 2 - 300)).toBeLessThanOrEqual(22);
    expect(Math.abs(added.y + added.height / 2 - 250)).toBeLessThanOrEqual(22);
  }
});

test('작업 영역 밖으로 잘린 슬라이드 부분에 놓으면 넣지 않는다', async ({ page }) => {
  await open(page);
  await page.getByRole('slider').fill('200');
  const paper = (await page.getByTestId('paper').boundingBox())!;
  const work = (await page.getByTestId('work').boundingBox())!;
  expect(paper.y + paper.height).toBeGreaterThan(work.y + work.height);
  // 아래 슬라이드 목록 위. 좌표로는 슬라이드 안이지만 가려진 부분이다.
  await pressCard(page);
  await page.mouse.move(work.x + 200, work.y + work.height + 30, { steps: 4 });
  await expect(page.locator('.paper.drop-target')).toHaveCount(0);
  await page.mouse.up();
  await page.waitForTimeout(200);
  expect(await elements(page)).toEqual([]);
});

test('최근 사용에 남고, 도형 색을 고르면 그 색으로 들어가며, 입력 중이던 글씨는 확정된다', async ({ page }) => {
  await open(page);
  await rail(page, '텍스트').click();
  await page.getByRole('button', { name: '본문 추가' }).click();
  await page.keyboard.type('먼저 쓴 글씨');
  await rail(page, '요소').click();
  await expect(card(page)).toBeVisible();
  await dropAt(page, 300, 300);
  await expect.poll(async () => (await elements(page)).length).toBe(2);
  const [text, plain] = await elements(page);
  expect(text.text).toBe('먼저 쓴 글씨');
  expect(plain.type).toBe('image');
  await page.getByRole('button', { name: /도형 색/ }).nth(2).click();
  await dropAt(page, 700, 300);
  await expect.poll(async () => (await elements(page)).length).toBe(3);
  expect((await elements(page))[2].assetId).not.toBe(plain.assetId);
  // 패널을 다시 열면 최근 사용에 있다.
  await rail(page, '요소').click();
  await rail(page, '요소').click();
  await expect(page.getByRole('region', { name: '최근 사용' }).getByRole('button', { name: '원', exact: true })).toBeVisible();
});

test('넣은 사진도 끌어서 넣는다. 배경 패널의 사진은 끌어도 넣지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await newSlideProject(page);
  const png = await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 400; c.height = 200; const x = c.getContext('2d')!; x.fillStyle = '#3a7'; x.fillRect(0, 0, 400, 200); const blob = await new Promise<Blob>(next => c.toBlob(b => next(b!), 'image/jpeg')); const r = new FileReader(); return new Promise<string>(next => { r.onload = () => next(String(r.result).split(',')[1]); r.readAsDataURL(blob); }); });
  await rail(page, '업로드').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '파일 업로드' }).click();
  await (await chooser).setFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(png, 'base64') });
  await expect.poll(async () => (await elements(page)).length).toBe(1);
  const photo = page.getByRole('button', { name: '넣은 사진 1' });
  await expect(photo).toBeVisible();
  const box = (await photo.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // 사진이 커서 가장자리 근처에 놓으면 안쪽으로 밀리므로 가운데 가까이 놓는다.
  const at = await onPaper(page, 660, 380);
  await page.mouse.move(at.x, at.y, { steps: 5 });
  await expect(ghost(page)).toBeVisible();
  await page.mouse.up();
  await expect.poll(async () => (await elements(page)).length).toBe(2);
  const added = (await elements(page))[1];
  expect(added.assetId).toBe((await elements(page))[0].assetId);
  expect(Math.abs(added.x + added.width / 2 - 660)).toBeLessThanOrEqual(2);
  expect(Math.abs(added.y + added.height / 2 - 380)).toBeLessThanOrEqual(2);

  await rail(page, '배경').click();
  const inBackground = page.getByRole('region', { name: '배경 패널' }).locator('.photo-card').first();
  await expect(inBackground).toBeVisible();
  const other = (await inBackground.boundingBox())!;
  await page.mouse.move(other.x + other.width / 2, other.y + other.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x, at.y, { steps: 5 });
  await expect(ghost(page)).toHaveCount(0);
  await page.mouse.up();
  await page.waitForTimeout(200);
  expect(await elements(page)).toHaveLength(2);
});

test('터치는 끌기를 시작하지 않는다', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  const page = await context.newPage();
  await open(page);
  await card(page).scrollIntoViewIfNeeded();
  const box = (await card(page).boundingBox())!;
  const session = await context.newCDPSession(page);
  const point = (x: number, y: number) => ({ touchPoints: [{ x, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', ...point(box.x + 10, box.y + 10) });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', ...point(box.x + 200, box.y + 40) });
  await expect(ghost(page)).toHaveCount(0);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await elements(page)).toEqual([]);
  await context.close();
});

// 슬라이드에서 지운 사진도 넣은 사진 목록에 남으므로, 다시 열어도 자료가 있어야 한다.
const works = (page: Page) => page.getByRole('list', { name: '내 작품' });
async function uploadRedPhoto(page: Page) {
  const data = await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 800; c.height = 320; const x = c.getContext('2d')!; x.fillStyle = '#CC3333'; x.fillRect(0, 0, 800, 320); const blob = await new Promise<Blob>(next => c.toBlob(b => next(b!), 'image/jpeg', 1)); const r = new FileReader(); return new Promise<string>(next => { r.onload = () => next(String(r.result).split(',')[1]); r.readAsDataURL(blob); }); });
  await rail(page, '업로드').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '파일 업로드' }).click();
  await (await chooser).setFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(data, 'base64') });
  await expect.poll(async () => (await elements(page)).length).toBe(1);
  await expect(page.getByTestId('save-state')).toHaveText('저장됨', { timeout: 5000 });
}
async function deleteOnlyPhoto(page: Page) {
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await elements(page)).length).toBe(0);
  await expect(page.getByTestId('save-state')).toHaveText('저장됨', { timeout: 5000 });
}
const pixelAt = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => {
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>('[data-testid=paper] canvas')];
  const paper = document.querySelector('[data-testid=paper]')!.getBoundingClientRect(); const s = paper.width / 1280;
  const c = canvases[0]; const ratio = c.width / paper.width;
  return [...c.getContext('2d')!.getImageData(Math.round(x * s * ratio), Math.round(y * s * ratio), 1, 1).data].slice(0, 3);
}, [x, y]);
async function dragPhoto(page: Page, x: number, y: number) {
  const photo = page.getByRole('button', { name: '넣은 사진 1' });
  await expect(photo.locator('img')).toBeVisible();
  const box = (await photo.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const at = await onPaper(page, x, y);
  await page.mouse.move(at.x, at.y, { steps: 5 });
  await page.mouse.up();
}

test('슬라이드에서 지운 사진은 작품을 닫았다 열어도 넣은 사진에서 끌어 넣을 수 있다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await newSlideProject(page);
  await uploadRedPhoto(page);
  await deleteOnlyPhoto(page);
  // 작품 목록에 들어가면 안 쓰는 사진을 정리한다. 넣은 사진 목록에 있는 것은 남아야 한다.
  await page.getByRole('button', { name: '작품 목록' }).click();
  await expect(works(page)).toBeVisible();
  await page.waitForTimeout(400);
  await works(page).getByRole('button', { name: /열기$/ }).first().click();
  await expect(page.locator('p.status')).toContainText('저장된 작품을 열었어요');
  await rail(page, '업로드').click();
  await dragPhoto(page, 660, 380);
  await expect.poll(async () => (await elements(page)).length).toBe(1);
  await expect(page.locator('p.status')).not.toContainText('사진을 읽지 못했어요');
  await expect(page.getByTestId('save-state')).toHaveText('저장됨', { timeout: 5000 });
  // 빈 칸이 아니라 사진이 실제로 그려진다.
  await expect.poll(async () => { const [r, g, b] = await pixelAt(page, 660, 380); return r > 180 && g < 90 && b < 90; }).toBe(true);
  await page.screenshot({ path: `${OUT}/drag-photo-reopened.png` });

  // 새로고침한 뒤 눌러서 넣기도 같다.
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await elements(page)).length).toBe(0);
  await expect(page.getByTestId('save-state')).toHaveText('저장됨', { timeout: 5000 });
  await page.reload();
  await expect(page.locator('p.status')).toContainText('저장된 작품을 열었어요');
  await rail(page, '업로드').click();
  await expect(page.getByRole('button', { name: '넣은 사진 1' }).locator('img')).toBeVisible();
  await page.getByRole('button', { name: '넣은 사진 1' }).click();
  await expect.poll(async () => (await elements(page)).length).toBe(1);
  await expect(page.getByTestId('save-state')).toHaveText('저장됨', { timeout: 5000 });
  await expect.poll(async () => { const [r, g, b] = await pixelAt(page, 640, 360); return r > 180 && g < 90 && b < 90; }).toBe(true);
});

test('이미 자료를 잃은 작품: 목록에 내놓지 않고, 자동 저장과 원본 저장은 계속된다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await newSlideProject(page);
  await uploadRedPhoto(page);
  const [photo] = (await doc(page)).assetManifest;
  await deleteOnlyPhoto(page);
  // 고치기 전 저장본과 같은 상태를 만든다. 문서 목록에는 있지만 자료가 없다.
  await page.getByRole('button', { name: '작품 목록' }).click();
  await expect(works(page)).toBeVisible();
  await page.evaluate(async id => {
    const { openDatabase } = await import('/src/storage/database.ts' as string);
    const db = await openDatabase();
    await new Promise<void>(resolve => { const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').delete(id); tx.oncomplete = () => resolve(); });
    db.close();
  }, photo.id);
  await works(page).getByRole('button', { name: /열기$/ }).first().click();
  await expect(page.locator('p.status')).toContainText('저장된 작품을 열었어요');
  await rail(page, '업로드').click();
  await expect(page.getByRole('button', { name: '넣은 사진 1' })).toHaveCount(0);
  await page.getByRole('button', { name: '페이지 추가' }).click();
  await expect(page.getByTestId('save-state')).toHaveText('저장됨', { timeout: 5000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '파일', exact: true }).click();
  await page.getByRole('menuitem', { name: '원본 저장' }).click();
  await download;
});

test('자료가 없는 사진이 문서에 있어도 안내하고 다른 편집은 화면에 나타난다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await newSlideProject(page);
  await uploadRedPhoto(page);
  // 문서에는 있는데 자료가 사라진 사진을 만든다.
  await page.evaluate(async () => {
    const { store } = (window as any).__canvacraft; const p = store.getProject();
    const lost = { id: 'a'.repeat(64), mime: 'image/png', pixelWidth: 100, pixelHeight: 100, byteLength: 10 };
    const result = store.dispatch(p.id, p.revision, { type: 'addImage', slideId: p.slides[0].id, assetId: lost.id, asset: lost, x: 0, y: 0, width: 100, height: 100 });
    if (!result.ok) throw new Error(result.message);
  });
  await expect(page.locator('p.status')).toContainText('사진을 읽지 못했어요');
  // 멈추지 않고 뒤따르는 편집을 그린다.
  await page.evaluate(() => { const { store } = (window as any).__canvacraft; const p = store.getProject(); store.dispatch(p.id, p.revision, { type: 'setBackground', slideId: p.slides[0].id, background: { kind: 'solid', color: '#1122CC' } }); });
  await expect.poll(async () => { const [r, g, b] = await pixelAt(page, 1270, 710); return r < 40 && g < 60 && b > 180; }).toBe(true);
});
