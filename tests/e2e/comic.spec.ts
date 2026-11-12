import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadComicSample } from '../contracts/comicHelpers';
import { ids, loadSample, sampleAssets } from '../contracts/helpers';

// 만화 편집기(만화 계약 §6·§8·§9): 시작 화면의 넷째 타일 → 만화 작품 목록 → 편집기.
// 편집 화면은 슬라이드의 Editor를 그대로 쓰므로 여기서는 달라지는 지점(저장소·원본 파일·만화 패널·말풍선 짝·칸 목록·만화 보기)을 본다.
const OUT = 'artifacts/comic';
const status = (page: Page) => page.getByRole('status');
const saveState = (page: Page) => page.getByTestId('save-state');
const doc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__canvacraft.store.getProject())));
const dispatch = (page: Page, command: any) => page.evaluate(command => { const { store } = (window as any).__canvacraft; const p = store.getProject(); return store.dispatch(p.id, p.revision, command); }, command);
const rail = (page: Page, name: string) => page.getByRole('navigation', { name: '도구' }).getByRole('button', { name });
const panel = (page: Page) => page.getByRole('region', { name: '만화 패널' });
const works = (page: Page) => page.getByRole('list', { name: '내 만화' }).getByRole('listitem');
const slideButton = (page: Page, number: number) => page.getByRole('button', { name: `${number}번째 장`, exact: true });
const currentSlide = (page: Page) => page.evaluate(() => (window as any).__canvacraft.currentSlideId());
const textarea = (page: Page) => page.getByLabel('슬라이드 글씨');
const reader = (page: Page) => page.getByTestId('comic-reader');
const content = (project: any) => { const { id: _id, revision: _revision, createdAt: _c, updatedAt: _u, ...rest } = project; return rest; };
const databases = (page: Page) => page.evaluate(async () => {
  const db = await import('/src/comic/comicDatabase.ts' as string); const slideDb = await import('/src/storage/database.ts' as string); const animationDb = await import('/src/animation/animationDatabase.ts' as string);
  return { comics: (await db.listComicSummaries()).map((row: any) => ({ id: row.projectId, title: row.title, panelCount: row.panelCount, pageCount: row.pageCount, hasThumbnail: !!row.thumbnail })), slides: (await slideDb.listSummaries()).length, animations: (await animationDb.listAnimationSummaries()).length };
});

async function zipFile(project: any, format: string, name: string) {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format, schemaVersion: 1 }));
  zip.file('project.json', JSON.stringify(project));
  for (const asset of project.assetManifest) zip.file(`assets/${asset.id}.${asset.mime === 'image/png' ? 'png' : 'jpg'}`, sampleAssets().get(asset.id)!);
  return { name, mimeType: 'application/zip', buffer: Buffer.from(await zip.generateAsync({ type: 'uint8array' })) };
}
const comicFile = (edit: (project: any) => any = project => project) => zipFile(edit(loadComicSample()), 'canvacomic', '탐정.canvacomic');

async function comicHome(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '만화 만들기' }).click();
  await expect(page.getByRole('list', { name: '내 만화' })).toBeAttached();
}
async function newComic(page: Page) {
  await comicHome(page);
  await page.getByRole('button', { name: '새 작품' }).click();
  await expect(page.getByTestId('paper')).toBeVisible();
}
async function openSample(page: Page, edit?: (project: any) => any) {
  await comicHome(page);
  await page.getByTestId('open-comic-file').setInputFiles(await comicFile(edit));
  await expect(status(page)).toContainText('새 작품으로 열었어요');
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 5000 });
  await expect(page.locator('.paper canvas').first()).toBeVisible();
}
async function openPanel(page: Page) {
  if (!await panel(page).isVisible()) await rail(page, '만화').click();
  await expect(panel(page)).toBeVisible();
}
async function screen(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('paper').boundingBox())!; const scale = box.width / 1280;
  return { x: box.x + x * scale, y: box.y + y * scale };
}
// 말풍선 하나를 넣고 대사를 쓴다. 넣은 그림과 글씨 요소를 돌려준다.
async function addBubble(page: Page, label: string, words: string) {
  await openPanel(page);
  await panel(page).getByRole('button', { name: label, exact: true }).click();
  await expect(textarea(page)).toBeFocused();
  await page.keyboard.type(words);
  await page.keyboard.press('Escape');
  await expect(textarea(page)).toHaveCount(0);
  const project = await doc(page); const slideId = await currentSlide(page);
  const elements = project.slides.find((slide: any) => slide.id === slideId).elements;
  return { image: elements.at(-2), text: elements.at(-1) };
}
// 조작 중인 요소를 그리는 가운데 레이어에서 논리 좌표 네모 안에 그려진 점이 있는지.
const drawnInMoveLayer = (page: Page, box: { x: number; y: number; width: number; height: number }) => page.evaluate(box => {
  const canvas = document.querySelectorAll<HTMLCanvasElement>('[data-testid="paper"] canvas')[1];
  const scale = canvas.width / 1280;
  const data = canvas.getContext('2d')!.getImageData(Math.round(box.x * scale), Math.round(box.y * scale), Math.max(1, Math.round(box.width * scale)), Math.max(1, Math.round(box.height * scale))).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
  return false;
}, box);

test('시작 화면의 넷째 타일로 들어가고, 손대지 않은 새 작품은 저장하지 않는다', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', request => requested.push(new URL(request.url()).pathname));
  await page.goto('/');
  for (const name of ['슬라이드 만들기', '영상 만들기', '애니메이션 만들기', '만화 만들기']) await expect(page.getByRole('button', { name })).toBeVisible();
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'start.png') });
  // 만화 편집기 코드는 타일을 누르기 전에는 받지 않는다(지연 로딩).
  expect(requested.some(item => item.endsWith('/comic/ComicApp.tsx'))).toBe(false);
  await page.getByRole('button', { name: '만화 만들기' }).click();
  await expect(page.getByRole('list', { name: '내 만화' })).toBeAttached();
  expect(requested.some(item => item.endsWith('/comic/ComicApp.tsx'))).toBe(true);
  await expect(page.getByText('처음이면 이렇게')).toBeVisible();
  await expect(page.getByText('아직 만든 만화가 없어요')).toBeVisible();
  await page.screenshot({ path: path.join(OUT, 'home.png') });

  await page.getByRole('button', { name: '새 작품' }).click();
  await expect(page.getByTestId('paper')).toBeVisible();
  await expect(saveState(page)).toHaveText('새 작품');
  // 도구는 템플릿 대신 만화이고, 발표 대신 만화 보기다. 나머지 다섯 도구는 슬라이드와 같다.
  for (const name of ['배경', '요소', '텍스트', '업로드', '그리기', '만화']) await expect(rail(page, name)).toBeVisible();
  await expect(rail(page, '템플릿')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '만화 보기', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '발표', exact: true })).toHaveCount(0);
  const created = await doc(page);
  expect(created).toMatchObject({ kind: 'comic', layout: 'grid4', bubbles: {}, title: '내 만화' });
  expect(await page.evaluate(() => sessionStorage.getItem('canvacraft.current-project'))).toBe(JSON.stringify({ kind: 'comic', id: created.id }));
  await page.waitForTimeout(1300);
  expect(await databases(page)).toEqual({ comics: [], slides: 0, animations: 0 });
  // 저장한 적 없는 새 작품에서 새로고침하면 작품 목록으로 돌아온다.
  await page.reload();
  await expect(page.getByRole('list', { name: '내 만화' })).toBeAttached();
});

test('타일 4개는 좁은 창에서도 화면 밖으로 나가지 않는다', async ({ page }) => {
  for (const width of [1280, 1024, 700]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    for (const name of ['슬라이드 만들기', '영상 만들기', '애니메이션 만들기', '만화 만들기']) {
      const box = (await page.getByRole('button', { name }).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
  }
});

test('말풍선을 누르면 그림과 글씨가 함께 들어가고 바로 대사를 쓴다. 되돌리기는 대사 한 번, 말풍선 한 번이다', async ({ page }) => {
  await newComic(page);
  await openPanel(page);
  await expect(panel(page).getByRole('button', { name: /풍선|해설/ })).toHaveCount(9);
  await panel(page).getByRole('button', { name: '말풍선 (왼쪽 꼬리)', exact: true }).click();
  // 글씨가 입력 상태로 열리고 처음 글씨 전체가 골라져 있다.
  await expect(textarea(page)).toBeFocused();
  expect(await textarea(page).evaluate((area: HTMLTextAreaElement) => ({ value: area.value, start: area.selectionStart, end: area.selectionEnd }))).toEqual({ value: '말을 써요', start: 0, end: 5 });
  let project = await doc(page);
  const [image, text] = project.slides[0].elements;
  expect(project.slides[0].elements).toHaveLength(2);
  expect(image).toMatchObject({ type: 'image', width: 440, height: 343.75 });
  expect(text).toMatchObject({ type: 'text', text: '말을 써요', fontId: 'round-jua', fontSize: 36, align: 'center' });
  expect(project.bubbles).toEqual({ [image.id]: text.id });
  // 글씨 상자는 말풍선 그림 안에 있다.
  expect(text.x).toBeGreaterThan(image.x); expect(text.x + text.width).toBeLessThan(image.x + image.width);
  expect(text.y).toBeGreaterThan(image.y); expect(text.y).toBeLessThan(image.y + image.height);

  await page.keyboard.type('안녕, 나는 탐정이야!');
  await page.keyboard.press('Escape');
  project = await doc(page);
  expect(project.slides[0].elements[1].text).toBe('안녕, 나는 탐정이야!');
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'bubble.png') });

  await page.keyboard.press('Control+z');
  expect((await doc(page)).slides[0].elements[1].text).toBe('말을 써요');
  await page.keyboard.press('Control+z');
  project = await doc(page);
  expect(project.slides[0].elements).toHaveLength(0);
  expect(project.bubbles).toEqual({});
  await page.keyboard.press('Control+y');
  expect(Object.keys((await doc(page)).bubbles)).toHaveLength(1);
  // 같은 말풍선을 한 번 더 넣으면 겹치지 않게 조금 옮겨 넣는다.
  await page.keyboard.press('Escape');
  const second = await addBubble(page, '말풍선 (왼쪽 꼬리)', '둘째');
  expect(second.image).toMatchObject({ x: image.x + 30, y: image.y + 30 });
  expect((await doc(page)).assetManifest).toHaveLength(1);
});

test('말풍선을 끌면 글씨가 함께 움직이고, 글씨를 잡고 끌어도 말풍선이 통째로 움직인다', async ({ page }) => {
  await newComic(page);
  const { image, text } = await addBubble(page, '말풍선 (오른쪽 꼬리)', '따라와!');
  await page.keyboard.press('Escape');
  // 말풍선의 글씨 바깥 자리(위쪽 가장자리 근처)를 잡고 끈다.
  const grab = await screen(page, image.x + image.width / 2, image.y + 40), drop = await screen(page, image.x + image.width / 2 - 200, image.y + 40 + 120);
  await page.mouse.move(grab.x, grab.y); await page.mouse.down();
  await page.mouse.move((grab.x + drop.x) / 2, (grab.y + drop.y) / 2, { steps: 4 });
  await page.mouse.move(drop.x, drop.y, { steps: 4 });
  // 끄는 동안: 문서는 아직 그대로이고, 글씨는 조작 레이어에서 따라간 자리에 그려진다.
  expect((await doc(page)).slides[0].elements[1]).toMatchObject({ x: text.x, y: text.y });
  await expect.poll(() => drawnInMoveLayer(page, { x: text.x - 200, y: text.y + 120, width: text.width, height: 46 })).toBe(true);
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'bubble-drag.png') });
  await page.mouse.up();
  let [movedImage, movedText] = (await doc(page)).slides[0].elements;
  expect(movedImage.x).toBeCloseTo(image.x - 200, 0); expect(movedImage.y).toBeCloseTo(image.y + 120, 0);
  expect(movedText.x - movedImage.x).toBeCloseTo(text.x - image.x, 1); expect(movedText.y - movedImage.y).toBeCloseTo(text.y - image.y, 1);

  // 되돌리기 한 번에 둘 다 제자리로 간다.
  await page.keyboard.press('Control+z');
  expect((await doc(page)).slides[0].elements).toMatchObject([{ x: image.x, y: image.y }, { x: text.x, y: text.y }]);

  // 글씨를 잡고 끌어도 말풍선이 함께 움직인다.
  const onText = await screen(page, text.x + text.width / 2, text.y + 20), there = await screen(page, text.x + text.width / 2 + 150, text.y + 20 - 60);
  await page.mouse.move(onText.x, onText.y); await page.mouse.down();
  await page.mouse.move(there.x, there.y, { steps: 6 });
  await page.mouse.up();
  [movedImage, movedText] = (await doc(page)).slides[0].elements;
  expect(movedText.x).toBeCloseTo(text.x + 150, 0); expect(movedText.y).toBeCloseTo(text.y - 60, 0);
  expect(movedImage.x - movedText.x).toBeCloseTo(image.x - text.x, 1); expect(movedImage.y - movedText.y).toBeCloseTo(image.y - text.y, 1);
});

test('말풍선을 지우면 글씨도 지워지고, 복제하면 글씨도 복제된다', async ({ page }) => {
  await newComic(page);
  const { image } = await addBubble(page, '생각 풍선 (왼쪽 꼬리)', '음…');
  await page.keyboard.press('Escape');
  const edge = await screen(page, image.x + image.width / 2, image.y + 40);
  await page.mouse.click(edge.x, edge.y);
  expect(await page.evaluate(() => (window as any).__canvacraft.selectedId())).toBe(image.id);
  await page.getByRole('button', { name: '복제' }).click();
  let project = await doc(page);
  expect(project.slides[0].elements.map((item: any) => item.type)).toEqual(['image', 'image', 'text', 'text']);
  expect(Object.keys(project.bubbles)).toHaveLength(2);
  // 복제본이 골라진 상태에서 지우면 복제된 글씨도 함께 사라진다.
  await page.keyboard.press('Delete');
  project = await doc(page);
  expect(project.slides[0].elements.map((item: any) => item.type)).toEqual(['image', 'text']);
  expect(project.bubbles).toEqual({ [image.id]: project.slides[0].elements[1].id });
  await page.keyboard.press('Control+z');
  expect((await doc(page)).slides[0].elements).toHaveLength(4);
});

test('효과 그림·효과 글씨·칸 배치: 누르면 들어가고, 배치를 바꾸면 쪽 수가 달라진다', async ({ page }) => {
  await newComic(page);
  await openPanel(page);
  await panel(page).getByRole('button', { name: '반짝', exact: true }).click();
  await expect.poll(async () => (await doc(page)).slides[0].elements.length).toBe(1);
  await panel(page).getByRole('button', { name: '집중선', exact: true }).click();
  await expect.poll(async () => (await doc(page)).slides[0].elements.length).toBe(2);
  await panel(page).getByRole('button', { name: '쾅!', exact: true }).click();
  let project = await doc(page);
  expect(project.slides[0].elements).toMatchObject([{ type: 'image', width: 220, height: 220 }, { type: 'image', x: 0, y: 0, width: 1280, height: 720 }, { type: 'text', text: '쾅!', fontId: 'block-dohyeon', fontSize: 96, color: '#E03131' }]);
  expect(project.bubbles).toEqual({});
  // 만화 그림은 '넣은 사진' 목록에 나오지 않는다(내장 그림으로 구분된다).
  await rail(page, '업로드').click();
  await expect(page.getByText('아직 넣은 사진이 없어요.')).toBeVisible();
  await openPanel(page);

  for (let count = 2; count <= 9; count++) await dispatch(page, { type: 'addSlide', afterSlideId: null });
  await expect(page.getByTestId('comic-size')).toHaveText('9칸 · 3쪽');
  await panel(page).getByRole('button', { name: '한 쪽에 8칸' }).click();
  await expect(page.getByTestId('comic-size')).toHaveText('9칸 · 2쪽');
  expect((await doc(page)).layout).toBe('grid8');
  await panel(page).getByRole('button', { name: '한 쪽에 3칸' }).click();
  await expect(page.getByTestId('comic-size')).toHaveText('9칸 · 3쪽');
  await expect(panel(page).getByRole('button', { name: '한 쪽에 3칸' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+z');
  expect((await doc(page)).layout).toBe('grid8');
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'panel.png') });
});

test('칸 목록: + 타일은 맨 뒤에 빈 칸을 만들고, 쪽이 시작되는 칸에 쪽 번호가 붙는다', async ({ page }) => {
  await newComic(page);
  const add = page.getByRole('button', { name: '다음 칸 만들기' });
  for (let count = 2; count <= 6; count++) { await add.click(); await expect(slideButton(page, count)).toBeVisible(); }
  const project = await doc(page);
  expect(project.slides).toHaveLength(6);
  expect(await currentSlide(page)).toBe(project.slides[5].id);
  expect(project.slides[5].elements).toEqual([]);
  // 4칸 배치: 첫 칸과 다섯째 칸이 쪽의 시작이다.
  await expect(page.locator('.slide-badge')).toHaveText(['1쪽', '2쪽']);
  await dispatch(page, { type: 'setComicLayout', layout: 'rows3' });
  await expect(page.locator('.slide-badge')).toHaveText(['1쪽', '2쪽']);
  await dispatch(page, { type: 'setComicLayout', layout: 'grid8' });
  await expect(page.locator('.slide-badge')).toHaveText(['1쪽']);
});

test('만화 보기: 지금 칸의 쪽부터 열고, 쪽을 넘기고, 칸을 누르면 그 칸으로 간다. 보는 동안 편집 단축키는 닿지 않는다', async ({ page }) => {
  await openSample(page);
  // 샘플 4칸에 2칸을 더해 2쪽으로 만든다.
  await dispatch(page, { type: 'addSlide', afterSlideId: ids.slide4 });
  await dispatch(page, { type: 'setBackground', slideId: (await doc(page)).slides[4].id, background: { kind: 'solid', color: '#FFD43B' } });
  const before = await doc(page);
  await slideButton(page, 5).click();
  await page.getByRole('button', { name: '만화 보기', exact: true }).click();
  await expect(reader(page)).toBeVisible();
  await expect(page.getByTestId('reader-position')).toHaveText('2 / 2');
  await expect(page.getByTestId('reader-page')).toHaveAttribute('data-page', '2');
  expect(await page.getByTestId('reader-page').evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height])).toEqual([1684, 1190]);
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'reader-page2.png') });
  // 둘째 쪽의 첫 칸 자리는 다섯째 칸의 노란 배경이고, 둘째 칸 자리는 빈 종이다.
  const pixel = (x: number, y: number) => page.getByTestId('reader-page').evaluate((canvas: HTMLCanvasElement, at) => [...canvas.getContext('2d')!.getImageData(at.x, at.y, 1, 1).data].slice(0, 3), { x, y });
  expect(await pixel(400, 400)).toEqual([255, 212, 59]);
  expect(await pixel(1200, 400)).toEqual([255, 255, 255]);

  // 편집 단축키(Delete, Ctrl+Z)는 닿지 않는다.
  await page.keyboard.press('Delete'); await page.keyboard.press('Control+z');
  expect(content(await doc(page))).toEqual(content(before));
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('reader-position')).toHaveText('1 / 2');
  await expect(page.getByTestId('reader-page')).toHaveAttribute('data-page', '1');
  await expect(page.getByRole('button', { name: '이전 쪽' })).toBeDisabled();
  await page.screenshot({ path: path.join(OUT, 'reader-page1.png') });
  await page.getByRole('button', { name: '다음 쪽' }).click();
  await expect(page.getByTestId('reader-position')).toHaveText('2 / 2');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('reader-page')).toHaveAttribute('data-page', '1');
  // 첫 쪽의 셋째 칸(아래 왼쪽)을 누르면 닫히면서 그 칸으로 간다.
  const box = (await page.getByTestId('reader-page').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.72);
  await expect(reader(page)).toHaveCount(0);
  expect(await currentSlide(page)).toBe(ids.slide3);
  // Esc로 닫으면 들어올 때의 칸에 그대로 있다.
  await page.getByRole('button', { name: '만화 보기', exact: true }).click();
  await expect(page.getByTestId('reader-position')).toHaveText('1 / 2');
  await page.keyboard.press('Escape');
  await expect(reader(page)).toHaveCount(0);
  expect(await currentSlide(page)).toBe(ids.slide3);
});

test('저절로 저장되고 새로고침하면 그 작품으로 돌아온다. 목록에는 칸 수와 쪽 수가 보이고, 시작 화면의 최근 작품에 만화 배지가 붙는다', async ({ page }) => {
  await newComic(page);
  await addBubble(page, '외침 풍선 (왼쪽 꼬리)', '으악!');
  await page.getByRole('button', { name: '다음 칸 만들기' }).click();
  await page.getByLabel('작품 이름').fill('고양이 탐정'); await page.getByLabel('작품 이름').press('Enter');
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 5000 });
  const saved = await doc(page);
  expect(await databases(page)).toEqual({ comics: [{ id: saved.id, title: '고양이 탐정', panelCount: 2, pageCount: 1, hasThumbnail: true }], slides: 0, animations: 0 });
  await page.reload();
  await expect(page.getByTestId('paper')).toBeVisible();
  expect(content(await doc(page))).toEqual(content(saved));
  await expect(page.getByRole('button', { name: '만화 보기', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '작품 목록' }).click();
  await expect(works(page)).toHaveCount(1);
  await expect(works(page).first()).toContainText('고양이 탐정');
  await expect(works(page).first()).toContainText('2칸 · 1쪽');
  await page.getByRole('button', { name: '시작 화면' }).click();
  const recent = page.getByRole('list', { name: '최근 작품' }).getByRole('listitem');
  await expect(recent).toHaveCount(1);
  await expect(recent.first().locator('.kind-comic')).toHaveText('만화');
  // 슬라이드·애니메이션 작품 목록에는 나오지 않는다.
  await page.getByRole('button', { name: '애니메이션 만들기' }).click();
  await expect(page.getByText('아직 만든 애니메이션이 없어요')).toBeVisible();
  await page.getByRole('button', { name: '시작 화면' }).click();
  await recent.first().getByRole('button', { name: '만화 고양이 탐정 열기' }).click();
  await expect(page.getByTestId('paper')).toBeVisible();
  expect((await doc(page)).id).toBe(saved.id);
});

test('원본 파일: 내려받아 다시 열면 같은 작품이고, 다른 편집기의 파일은 열지 않는다', async ({ page }) => {
  await openSample(page);
  const opened = await doc(page);
  expect(opened).toMatchObject({ kind: 'comic', layout: 'grid4', bubbles: { [ids.photo1]: ids.body } });
  const [download] = await Promise.all([page.waitForEvent('download'), (async () => { await page.getByRole('button', { name: '파일' }).click(); await page.getByRole('menuitem', { name: '원본 저장' }).click(); })()]);
  expect(download.suggestedFilename()).toMatch(/\.canvacomic$/);
  const saved = await fs.readFile(await download.path());
  const zip = await JSZip.loadAsync(saved);
  expect(JSON.parse(await zip.file('manifest.json')!.async('string'))).toEqual({ format: 'canvacomic', schemaVersion: 1 });

  await page.getByRole('button', { name: '작품 목록' }).click();
  await page.getByTestId('open-comic-file').setInputFiles({ name: '다시.canvacomic', mimeType: 'application/zip', buffer: saved });
  await expect(status(page)).toContainText('새 작품으로 열었어요');
  const again = await doc(page);
  expect(content(again)).toEqual(content(opened));
  expect(again.id).not.toBe(opened.id);

  // 슬라이드 원본과 애니메이션 원본은 만화에서 열리지 않는다.
  await page.getByRole('button', { name: '작품 목록' }).click();
  await page.getByTestId('open-comic-file').setInputFiles(await zipFile(loadSample(), 'canvacraft', '슬라이드.canvacomic'));
  await expect(status(page)).toHaveText('만화 작품 파일이 아니에요.');
  await page.getByTestId('open-comic-file').setInputFiles(await comicFile(project => ({ ...project, bubbles: { [ids.photo1]: ids.stroke1 } })));
  await expect(status(page)).toHaveText('말풍선이 없는 글씨를 가리켜요.');
  // 만화 원본은 슬라이드에서 열리지 않는다.
  await page.getByRole('button', { name: '시작 화면' }).click();
  await page.getByRole('button', { name: '슬라이드 만들기' }).click();
  await page.getByTestId('open-file').setInputFiles({ name: '만화.canvacraft', mimeType: 'application/zip', buffer: saved });
  await expect(status(page)).toHaveText('슬라이드 작품 파일이 아니에요.');
});

test('내려받기 창에는 만화책 PDF와 그림 PNG만 있다', async ({ page }) => {
  await newComic(page);
  await page.getByRole('button', { name: '공유' }).click();
  await page.getByRole('menuitem', { name: '다운로드' }).click();
  const formats = page.locator('.download-panel .format strong');
  await expect(formats).toHaveText(['만화책 (PDF)', '그림 (PNG)']);
  await expect(page.locator('.download-panel input[type=radio]').first()).toBeChecked();
});

test('만화 그림 묶음을 읽지 못해도 작품이 열리고 그리기와 칸 배치가 된다', async ({ page }) => {
  await page.route('**/comic/manifest.json', route => route.abort());
  await newComic(page);
  await openPanel(page);
  await expect(panel(page).getByText('만화 그림을 불러오지 못했어요')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: /풍선/ })).toHaveCount(0);
  await panel(page).getByRole('button', { name: '두근두근', exact: true }).click();
  await panel(page).getByRole('button', { name: '한 쪽에 3칸' }).click();
  expect(await doc(page)).toMatchObject({ layout: 'rows3', slides: [{ elements: [{ type: 'text', text: '두근두근' }] }] });
});

test('둘째 탭은 읽기 전용이다: 만화 패널의 단추가 꺼져 있고 만화 보기는 된다', async ({ page, context }) => {
  await openSample(page);
  const saved = await doc(page);
  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('button', { name: '만화 만들기' }).click();
  await second.getByRole('button', { name: `${saved.title} 열기` }).click();
  await expect(second.getByTestId('save-state')).toHaveText('읽기 전용');
  await expect(rail(second, '만화')).toBeDisabled();
  await second.getByRole('button', { name: '만화 보기', exact: true }).click();
  await expect(reader(second)).toBeVisible();
  await expect(second.getByTestId('reader-position')).toHaveText('1 / 1');
});
