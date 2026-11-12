import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadAnimationSample } from '../contracts/animationHelpers';
import { ids, loadSample, sampleAssets } from '../contracts/helpers';
import { slideHome } from './start';

// 애니메이션 편집기(애니메이션 계약 §6·§8·§9): 시작 화면의 셋째 타일 → 애니메이션 작품 목록 → 편집기.
// 편집 화면은 슬라이드의 Editor를 그대로 쓰므로 여기서는 달라지는 지점(저장소·원본 파일·+ 타일·패널·길게 보이기·양파 껍질·재생)을 본다.
const OUT = 'artifacts/animation';
const status = (page: Page) => page.getByRole('status');
const saveState = (page: Page) => page.getByTestId('save-state');
const doc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__canvacraft.store.getProject())));
const dispatch = (page: Page, command: any) => page.evaluate(command => { const { store } = (window as any).__canvacraft; const p = store.getProject(); return store.dispatch(p.id, p.revision, command); }, command);
const rail = (page: Page, name: string) => page.getByRole('navigation', { name: '도구' }).getByRole('button', { name });
const panel = (page: Page) => page.getByRole('region', { name: '애니메이션 패널' });
const works = (page: Page) => page.getByRole('list', { name: '내 애니메이션' }).getByRole('listitem');
const slideButton = (page: Page, number: number) => page.getByRole('button', { name: `${number}번째 장`, exact: true });
const currentSlide = (page: Page) => page.evaluate(() => (window as any).__canvacraft.currentSlideId());
const content = (project: any) => { const { id: _id, revision: _revision, createdAt: _c, updatedAt: _u, ...rest } = project; return rest; };
const animationDatabase = (page: Page) => page.evaluate(async () => {
  const db = await import('/src/animation/animationDatabase.ts' as string); const slideDb = await import('/src/storage/database.ts' as string);
  return { animations: (await db.listAnimationSummaries()).map((row: any) => ({ id: row.projectId, title: row.title, frameCount: row.frameCount, durationMs: row.durationMs, hasThumbnail: !!row.thumbnail })), slides: (await slideDb.listSummaries()).length };
});

async function zipFile(project: any, format: string, name: string) {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format, schemaVersion: 1 }));
  zip.file('project.json', JSON.stringify(project));
  for (const asset of project.assetManifest) zip.file(`assets/${asset.id}.${asset.mime === 'image/png' ? 'png' : 'jpg'}`, sampleAssets().get(asset.id)!);
  return { name, mimeType: 'application/zip', buffer: Buffer.from(await zip.generateAsync({ type: 'uint8array' })) };
}
const animationFile = (edit: (project: any) => any = project => project) => zipFile(edit(loadAnimationSample()), 'canvaanimation', '공.canvaanim');

async function animationHome(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '애니메이션 만들기' }).click();
  await expect(page.getByRole('list', { name: '내 애니메이션' })).toBeAttached();
}
async function newAnimation(page: Page) {
  await animationHome(page);
  await page.getByRole('button', { name: '새 작품' }).click();
  await expect(page.getByTestId('paper')).toBeVisible();
}
async function openSample(page: Page, edit?: (project: any) => any) {
  await animationHome(page);
  await page.getByTestId('open-animation-file').setInputFiles(await animationFile(edit));
  await expect(status(page)).toContainText('새 작품으로 열었어요');
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 5000 });
  await expect(page.locator('.paper canvas').first()).toBeVisible();
}
async function screen(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('paper').boundingBox())!; const scale = box.width / 1280;
  return { x: box.x + x * scale, y: box.y + y * scale };
}
// 캔버스의 배경 레이어(양파 껍질이 깔리는 레이어)에서 논리 좌표 한 점의 색.
const layerPixel = (page: Page, x: number, y: number) => page.evaluate(({ x, y }) => {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="paper"] canvas')!;
  // 캔버스의 실제 픽셀 수는 화면 배율과 기기 픽셀 비율에 따라 달라진다.
  const scale = canvas.width / 1280;
  const [r, g, b] = canvas.getContext('2d')!.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data;
  return { r, g, b };
}, { x, y });

test('시작 화면의 셋째 타일로 들어가고, 손대지 않은 새 작품은 저장하지 않는다', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', request => requested.push(new URL(request.url()).pathname));
  await page.goto('/');
  for (const name of ['슬라이드 만들기', '영상 만들기', '애니메이션 만들기']) await expect(page.getByRole('button', { name })).toBeVisible();
  // 애니메이션 편집기 코드는 타일을 누르기 전에는 받지 않는다(지연 로딩).
  expect(requested.some(item => item.endsWith('/animation/AnimationApp.tsx'))).toBe(false);
  await page.getByRole('button', { name: '애니메이션 만들기' }).click();
  await expect(page.getByRole('list', { name: '내 애니메이션' })).toBeAttached();
  expect(requested.some(item => item.endsWith('/animation/AnimationApp.tsx'))).toBe(true);
  await expect(page.getByText('처음이면 이렇게')).toBeVisible();
  await expect(page.getByText('아직 만든 애니메이션이 없어요')).toBeVisible();

  await page.getByRole('button', { name: '새 작품' }).click();
  await expect(page.getByTestId('paper')).toBeVisible();
  await expect(saveState(page)).toHaveText('새 작품');
  // 도구는 템플릿 대신 애니메이션이고, 발표 대신 재생이다. 나머지 다섯 도구는 슬라이드와 같다.
  for (const name of ['배경', '요소', '텍스트', '업로드', '그리기', '애니메이션']) await expect(rail(page, name)).toBeVisible();
  await expect(rail(page, '템플릿')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '발표', exact: true })).toHaveCount(0);
  expect(await doc(page)).toMatchObject({ kind: 'animation', fps: 6, musicId: null, musicVolume: 0.5, holds: {}, title: '내 애니메이션' });
  const created = await doc(page);
  expect(await page.evaluate(() => sessionStorage.getItem('canvacraft.current-project'))).toBe(JSON.stringify({ kind: 'animation', id: created.id }));
  await page.waitForTimeout(1300);
  expect(await animationDatabase(page)).toEqual({ animations: [], slides: 0 });
  // 저장한 적 없는 새 작품에서 새로고침하면 작품 목록으로 돌아온다.
  await page.reload();
  await expect(page.getByRole('list', { name: '내 애니메이션' })).toBeAttached();
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'home.png') });
});

test('+ 타일은 지금 장을 복사하고, 저절로 저장되며, 새로고침하면 그 작품으로 돌아온다', async ({ page }) => {
  await newAnimation(page);
  const first = (await doc(page)).slides[0].id;
  expect(await dispatch(page, { type: 'addStroke', slideId: first, x: 200, y: 300, points: [0, 0, 300, 0], color: '#000000', strokeWidth: 20 })).toMatchObject({ ok: true });
  await page.getByRole('button', { name: '다음 장 만들기' }).click();
  await page.getByRole('button', { name: '다음 장 만들기' }).click();
  const made = await doc(page);
  expect(made.slides).toHaveLength(3);
  // 복사한 장은 같은 그림이고 요소 ID만 새것이다. 지금 장은 방금 만든 장이다.
  for (const slide of made.slides) expect(slide.elements.map(({ id: _id, ...rest }: any) => rest)).toEqual([{ type: 'stroke', x: 200, y: 300, points: [0, 0, 300, 0], color: '#000000', strokeWidth: 20 }]);
  expect(new Set(made.slides.flatMap((slide: any) => slide.elements.map((item: any) => item.id))).size).toBe(3);
  expect(await currentSlide(page)).toBe(made.slides[2].id);
  await expect(slideButton(page, 3)).toHaveAttribute('aria-current', 'true');
  // 되돌리기 한 번에 복사 한 번이 돌아간다.
  await page.keyboard.press('Control+z');
  expect((await doc(page)).slides).toHaveLength(2);
  await page.keyboard.press('Control+Shift+z');
  expect((await doc(page)).slides).toHaveLength(3);

  await page.getByRole('textbox', { name: '작품 이름' }).fill('튀는 공');
  await page.getByRole('textbox', { name: '작품 이름' }).press('Enter');
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 4000 });
  const saved = await doc(page);
  expect(await animationDatabase(page)).toEqual({ animations: [{ id: saved.id, title: '튀는 공', frameCount: 3, durationMs: 500, hasThumbnail: true }], slides: 0 });

  await page.reload();
  await expect(status(page)).toContainText('저장된 작품을 열었어요');
  expect(await doc(page)).toEqual(saved);
  await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible();

  // 작품 목록: 장 수와 길이가 보인다. 슬라이드 작품 목록에는 나오지 않고, 시작 화면 최근 작품에는 종류가 붙는다.
  await page.getByRole('button', { name: '작품 목록' }).click();
  await expect(works(page)).toHaveCount(1);
  await expect(works(page).first()).toContainText('튀는 공');
  await expect(works(page).first()).toContainText('3장 · 0:01');
  await page.getByRole('button', { name: '시작 화면' }).click();
  const recent = page.getByRole('list', { name: '최근 작품' });
  await expect(recent.getByRole('listitem')).toHaveCount(1);
  await expect(recent.getByRole('listitem').first()).toContainText('애니메이션');
  await page.getByRole('button', { name: '슬라이드 만들기' }).click();
  await expect(page.getByRole('list', { name: '내 작품' }).getByRole('listitem')).toHaveCount(0);
  await page.getByRole('button', { name: '시작 화면' }).click();
  await page.getByRole('list', { name: '최근 작품' }).getByRole('button', { name: '애니메이션 튀는 공 열기' }).click();
  await expect(status(page)).toContainText('저장된 작품을 열었어요');
  expect((await doc(page)).id).toBe(saved.id);
});

test('원본 파일(.canvaanim) 왕복과 형식 구분', async ({ page }) => {
  await openSample(page);
  const opened = await doc(page); const sample = loadAnimationSample();
  expect(content(opened)).toEqual(content(sample));
  expect(opened.id).not.toBe(sample.id);
  // 원본 저장 → 내려받은 파일을 다시 열면 내용이 같다.
  await dispatch(page, { type: 'setAnimation', fps: 12 });
  await page.getByRole('button', { name: '파일' }).click();
  const waiting = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: '원본 저장' }).click();
  const download = await waiting;
  expect(download.suggestedFilename()).toBe('우리 가족 소개.canvaanim');
  await fs.mkdir(OUT, { recursive: true });
  const saved = path.join(OUT, 'roundtrip.canvaanim'); await download.saveAs(saved);
  const zip = await JSZip.loadAsync(await fs.readFile(saved));
  expect(JSON.parse(await zip.file('manifest.json')!.async('string'))).toEqual({ format: 'canvaanimation', schemaVersion: 1 });
  expect(JSON.parse(await zip.file('project.json')!.async('string'))).toMatchObject({ kind: 'animation', fps: 12, holds: { [ids.slide2]: 2 } });
  const before = await doc(page);
  await page.getByTestId('open-file').setInputFiles(saved);
  await expect.poll(async () => (await doc(page)).id).not.toBe(before.id);
  expect(content(await doc(page))).toEqual({ ...content(before), title: before.title });

  // 슬라이드 원본은 애니메이션 편집기에서 열리지 않고 지금 작품은 그대로다.
  const here = await doc(page);
  await page.getByTestId('open-file').setInputFiles(await zipFile(loadSample(), 'canvacraft', 's.canvacraft'));
  await expect(status(page)).toContainText('애니메이션 작품 파일이 아니에요');
  expect(await doc(page)).toEqual(here);
  // 애니메이션 원본은 슬라이드 편집기에서 열리지 않는다(슬라이드 쪽 코드는 바뀌지 않았다).
  // 같은 탭은 쓰던 작품으로 돌아오므로 시작 화면으로 나간 뒤 슬라이드로 들어간다.
  await page.getByRole('button', { name: '작품 목록' }).click();
  await page.getByRole('button', { name: '시작 화면' }).click();
  await slideHome(page);
  await page.getByTestId('open-file').setInputFiles(await animationFile());
  await expect(status(page)).toContainText('슬라이드 작품 파일이 아니에요');
  await expect(page.getByTestId('paper')).toHaveCount(0);
});

test('편집은 슬라이드와 같다: 그리기 도구로 획을 그리고, 요소를 끌어 옮기고, 각각 되돌린다', async ({ page }) => {
  await openSample(page);
  await slideButton(page, 4).click();
  await rail(page, '그리기').click();
  await expect(page.getByTestId('draw-layer')).toBeVisible();
  const from = await screen(page, 300, 300), to = await screen(page, 700, 450);
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
  const drawn = (await doc(page)).slides[3].elements;
  expect(drawn).toHaveLength(1); expect(drawn[0]).toMatchObject({ type: 'stroke' });
  await page.keyboard.press('Escape');
  // 첫 장의 사진을 끌어 옮긴다(선택 → 끌기 → 명령 하나).
  await slideButton(page, 1).click();
  const photo = (await doc(page)).slides[0].elements.find((item: any) => item.id === ids.photo1);
  // 사진 위에 획이 겹쳐 있으므로 획이 없는 왼쪽 아래를 잡는다.
  const grab = await screen(page, photo.x + 40, photo.y + 250), drop = await screen(page, photo.x + 40 - 200, photo.y + 250 + 60);
  await page.mouse.move(grab.x, grab.y); await page.mouse.down(); await page.mouse.move(drop.x, drop.y, { steps: 6 }); await page.mouse.up();
  const moved = (await doc(page)).slides[0].elements.find((item: any) => item.id === ids.photo1);
  expect(moved.x).toBeCloseTo(photo.x - 200, 0); expect(moved.y).toBeCloseTo(photo.y + 60, 0);
  await page.keyboard.press('Control+z');
  expect((await doc(page)).slides[0].elements.find((item: any) => item.id === ids.photo1)).toMatchObject({ x: photo.x, y: photo.y });
  await page.keyboard.press('Control+z');
  expect((await doc(page)).slides[3].elements).toHaveLength(0);
  // 애니메이션 설정은 편집으로 바뀌지 않는다.
  expect(await doc(page)).toMatchObject({ kind: 'animation', fps: 6, holds: { [ids.slide2]: 2 } });
});

test('애니메이션 패널: 빠르기·음악·음악 크기를 고르고 각각 되돌린다', async ({ page }) => {
  const manifest = JSON.parse(await fs.readFile('public/sounds/manifest.json', 'utf8'));
  const song = manifest.music.find((item: any) => !item.hidden);
  await openSample(page);
  await rail(page, '애니메이션').click();
  await expect(panel(page)).toBeVisible();
  // 4장: 4·8·4·4프레임 = 20프레임 = 0.83초.
  await expect(page.getByTestId('animation-length')).toHaveText('4장 · 0:01');
  await expect(panel(page).getByRole('button', { name: '1초에 6장' })).toHaveAttribute('aria-pressed', 'true');
  await panel(page).getByRole('button', { name: '1초에 2장' }).click();
  expect((await doc(page)).fps).toBe(2);
  // 12·24·12·12프레임 = 60프레임 = 2.5초.
  await expect(page.getByTestId('animation-length')).toHaveText('4장 · 0:03');
  await expect(panel(page).getByRole('button', { name: '1초에 2장' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+z');
  expect((await doc(page)).fps).toBe(6);
  await expect(panel(page).getByRole('button', { name: '1초에 6장' })).toHaveAttribute('aria-pressed', 'true');

  const music = panel(page).getByRole('list', { name: '배경음악' });
  await expect(music.getByRole('button', { name: '음악 없음' })).toHaveAttribute('aria-pressed', 'true');
  await music.getByRole('button', { name: song.label, exact: true }).click();
  expect((await doc(page)).musicId).toBe(song.id);
  await panel(page).getByRole('group', { name: '배경음악 크기' }).getByRole('button', { name: '크게' }).click();
  expect(await doc(page)).toMatchObject({ musicId: song.id, musicVolume: 1 });
  await music.getByRole('button', { name: '음악 없음' }).click();
  expect((await doc(page)).musicId).toBeNull();
  // 같은 값을 다시 고르면 기록이 늘지 않는다.
  const revision = (await doc(page)).revision;
  await music.getByRole('button', { name: '음악 없음' }).click();
  expect((await doc(page)).revision).toBe(revision);
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 4000 });
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'panel.png') });
});

test('목록에 없는 음악을 가진 작품도 열리고, 패널은 음악 없음으로 보여 준다', async ({ page }) => {
  await openSample(page, project => ({ ...project, musicId: 'gone-song' }));
  await rail(page, '애니메이션').click();
  await expect(panel(page).getByRole('list', { name: '배경음악' }).getByRole('button', { name: '음악 없음' })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page)).toContainText('고른 음악을 찾을 수 없어요');
  expect((await doc(page)).musicId).toBe('gone-song');
});

test('장 메뉴: 길게 보이기와 빈 장 추가, 카드의 배지', async ({ page }) => {
  await openSample(page);
  const badge = (number: number) => page.locator('.slide-list li').nth(number - 1).locator('.slide-badge');
  await expect(badge(2)).toHaveText('×2');
  await expect(badge(1)).toHaveCount(0);
  await page.getByRole('button', { name: '2번째 장 메뉴' }).click({ force: true });
  await expect(page.getByRole('menuitem', { name: '길게 보이기: 길게 (2배)' })).toBeDisabled();
  await page.getByRole('menuitem', { name: '길게 보이기: 아주 길게 (4배)' }).click();
  expect((await doc(page)).holds).toEqual({ [ids.slide2]: 4 });
  await expect(badge(2)).toHaveText('×4');
  // 길게 보이기를 바꾼 장으로 간다.
  expect(await currentSlide(page)).toBe(ids.slide2);
  await page.keyboard.press('Control+z');
  expect((await doc(page)).holds).toEqual({ [ids.slide2]: 2 });
  await page.getByRole('button', { name: '2번째 장 메뉴' }).click({ force: true });
  await page.getByRole('menuitem', { name: '길게 보이기: 보통' }).click();
  expect((await doc(page)).holds).toEqual({});
  await expect(badge(2)).toHaveCount(0);

  // 빈 장 추가: 고른 장 바로 뒤에 흰 빈 장이 생기고 그 장으로 간다.
  await page.getByRole('button', { name: '1번째 장 메뉴' }).click({ force: true });
  await page.getByRole('menuitem', { name: '빈 장 추가' }).click();
  const after = await doc(page);
  expect(after.slides).toHaveLength(5);
  expect(after.slides[1]).toMatchObject({ background: { kind: 'solid', color: '#FFFFFF' }, elements: [] });
  expect(await currentSlide(page)).toBe(after.slides[1].id);
  // 길게 보이는 장을 복제하면 배지도 따라간다.
  await dispatch(page, { type: 'setFrameHold', slideId: ids.slide3, hold: 2 });
  await page.getByRole('button', { name: '4번째 장 메뉴' }).click({ force: true });
  await page.getByRole('menuitem', { name: '복제' }).click();
  await expect(badge(4)).toHaveText('×2'); await expect(badge(5)).toHaveText('×2');
});

test('양파 껍질: 앞 장이 흐리게 깔리고, 끄면 사라지며, 출력 그림에는 들어가지 않는다', async ({ page }) => {
  await newAnimation(page);
  const first = (await doc(page)).slides[0].id;
  // 첫 장에 굵은 검은 선을 긋고 장을 복사한 뒤, 둘째 장에서 그 선을 지운다. 둘째 장의 그 자리는 앞 장의 선이 비쳐 보여야 한다.
  await dispatch(page, { type: 'addStroke', slideId: first, x: 300, y: 360, points: [0, 0, 600, 0], color: '#000000', strokeWidth: 60 });
  await page.getByRole('button', { name: '다음 장 만들기' }).click();
  const second = (await doc(page)).slides[1];
  await dispatch(page, { type: 'deleteElement', slideId: second.id, elementId: second.elements[0].id });
  const toggle = page.getByRole('button', { name: '앞 장 겹쳐 보기' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  // 흰 바탕 위에 검정을 투명도 0.35로 깔면 255 × 0.65 ≈ 166이다.
  await expect.poll(async () => (await layerPixel(page, 600, 360)).r, { timeout: 5000 }).toBeLessThan(200);
  const ghost = await layerPixel(page, 600, 360);
  expect(ghost.r).toBeGreaterThan(140); expect(ghost.r).toBeLessThan(190);
  expect((await layerPixel(page, 600, 100)).r).toBe(255);
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'onion.png') });

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await layerPixel(page, 600, 360)).r).toBe(255);
  await toggle.click();
  await expect.poll(async () => (await layerPixel(page, 600, 360)).r, { timeout: 5000 }).toBeLessThan(200);
  // 패널의 켜기/끄기도 같은 값을 바꾼다.
  await rail(page, '애니메이션').click();
  await panel(page).getByRole('group', { name: '앞 장 겹쳐 보기' }).getByRole('button', { name: '끄기' }).click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await panel(page).getByRole('group', { name: '앞 장 겹쳐 보기' }).getByRole('button', { name: '켜기' }).click();

  // 첫 장에는 앞 장이 없다: 선은 진한 검정 그대로이고 다른 곳은 흰색이다.
  await slideButton(page, 1).click();
  await expect.poll(async () => (await layerPixel(page, 600, 360)).r).toBeLessThan(20);
  expect((await layerPixel(page, 600, 100)).r).toBe(255);

  // 출력과 같은 그리기(renderSlide)로 둘째 장을 그리면 그 자리는 흰색이다. 문서도 양파 껍질 때문에 바뀌지 않았다.
  const rendered = await page.evaluate(async () => {
    const { renderSlide } = await import('/src/rendering/renderSlide.ts' as string);
    const { store, assets } = (window as any).__canvacraft;
    const result = await renderSlide(store.getProject().slides[1], assets.resolve, 1);
    const [r, g, b] = result.canvas.getContext('2d').getImageData(600, 360, 1, 1).data;
    return { r, g, b };
  });
  expect(rendered).toEqual({ r: 255, g: 255, b: 255 });
  expect((await doc(page)).slides[1].elements).toEqual([]);
});

test('재생: 지금 장에서 시작해 계약의 식대로 넘어가고 반복하며, 멈춘 장으로 돌아온다', async ({ page }) => {
  // 초당 2장: 12·24·12·12프레임 → 0.5·1.0·0.5·0.5초(둘째 장은 길게 2배).
  await openSample(page, project => ({ ...project, fps: 2 }));
  await page.getByRole('button', { name: '1번째 장', exact: true }).click();
  const before = await doc(page);
  await page.getByRole('button', { name: '재생', exact: true }).click();
  const player = page.getByTestId('animation-player');
  await expect(player).toBeVisible();
  // 재생 화면이 그리는 장 번호를 30ms마다 3.2초 동안 적는다.
  const samples = await page.evaluate(async () => {
    const position = document.querySelector('[data-testid="player-position"]')!; const out: [number, string][] = []; const started = performance.now();
    while (performance.now() - started < 3200) { out.push([performance.now() - started, position.textContent ?? '']); await new Promise(resolve => setTimeout(resolve, 30)); }
    return out;
  });
  const order = samples.map(item => item[1]).filter((value, index, all) => index === 0 || value !== all[index - 1]);
  expect(order.slice(0, 5)).toEqual(['1 / 4', '2 / 4', '3 / 4', '4 / 4', '1 / 4']);
  // 장이 바뀐 시각(재생 시작이 측정 시작보다 조금 앞서므로 넉넉히 본다): 0.5, 1.5, 2.0, 2.5초.
  const firstSeen = (value: string, after = 0) => samples.find(item => item[1] === value && item[0] >= after)![0];
  expect(firstSeen('2 / 4')).toBeGreaterThan(250); expect(firstSeen('2 / 4')).toBeLessThan(650);
  expect(firstSeen('3 / 4')).toBeGreaterThan(1250); expect(firstSeen('3 / 4')).toBeLessThan(1650);
  expect(firstSeen('4 / 4')).toBeGreaterThan(1750); expect(firstSeen('4 / 4')).toBeLessThan(2150);
  expect(firstSeen('1 / 4', 2000)).toBeGreaterThan(2250); expect(firstSeen('1 / 4', 2000)).toBeLessThan(2650);
  // 재생 화면에 그림이 실제로 그려졌다(흰 바탕이 아닌 점이 있다).
  const painted = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="animation-player"] canvas')!;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) return true;
    return false;
  });
  expect(painted).toBe(true);
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'player.png') });

  // 재생 중 편집 단축키는 닿지 않는다.
  await page.keyboard.press('Delete'); await page.keyboard.press('Control+z');
  const shown = await page.getByTestId('player-position').textContent();
  await page.keyboard.press('Escape');
  await expect(player).toHaveCount(0);
  // 문서는 바뀌지 않았고, 멈춘 순간의 장으로 간다(Esc를 누르는 사이 한 장 넘어갈 수 있다).
  expect(await doc(page)).toEqual(before);
  const index = before.slides.map((slide: any) => slide.id).indexOf(await currentSlide(page));
  const expected = Number(shown!.split(' / ')[0]) - 1;
  expect([expected, (expected + 1) % 4]).toContain(index);
});

test('재생: 고른 장에서 시작하고, 멈추기 단추와 바깥 누르기로 끝난다', async ({ page }) => {
  await openSample(page, project => ({ ...project, fps: 2 }));
  await slideButton(page, 3).click();
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await expect(page.getByTestId('player-position')).toHaveText('3 / 4');
  await page.getByRole('button', { name: '멈추기' }).click();
  await expect(page.getByTestId('animation-player')).toHaveCount(0);
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await expect(page.getByTestId('animation-player')).toBeVisible();
  await page.getByTestId('animation-player').click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId('animation-player')).toHaveCount(0);
});

test('같은 작품을 둘째 탭에서 열면 읽기 전용이다', async ({ page, context }) => {
  await openSample(page);
  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('button', { name: '애니메이션 만들기' }).click();
  await second.getByRole('list', { name: '내 애니메이션' }).getByRole('button', { name: /열기$/ }).first().click();
  await expect(second.getByTestId('save-state')).toHaveText('읽기 전용');
  await expect(second.getByRole('status').last()).toContainText('다른 탭에서 편집 중');
  expect(await second.evaluate(() => { const { store } = (window as any).__canvacraft; const p = store.getProject(); return store.dispatch(p.id, p.revision, { type: 'setAnimation', fps: 12 }); })).toMatchObject({ ok: false, code: 'READ_ONLY' });
  await expect(second.getByRole('button', { name: '다음 장 만들기' })).toHaveCount(0);
});

test('300획 장을 복사한 다음 장에서 양파 껍질을 켠 채 끌어도 프레임이 밀리지 않는다', async ({ page }) => {
  await openSample(page);
  // 넷째 장에 300획 × 200점을 넣고(슬라이드 select.spec의 측정과 같은 그림) 복사한다. 다섯째 장 아래에는 넷째 장이 흐리게 깔린다.
  const count = await page.evaluate(async slideId => {
    const { store } = (window as any).__canvacraft;
    let seed = 7; const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let n = 0; n < 300; n++) {
      let x = 100 + random() * 300, y = 100 + random() * 200, angle = random() * 7; const points: number[] = [];
      for (let i = 0; i < 200; i++) { angle += (random() - 0.5) * 0.5; x = Math.min(1270, Math.max(5, x + Math.cos(angle) * 4)); y = Math.min(710, Math.max(5, y + Math.sin(angle) * 4)); points.push(+x.toFixed(1), +y.toFixed(1)); }
      const p = store.getProject(); store.dispatch(p.id, p.revision, { type: 'addStroke', slideId, x: 0, y: 0, points, color: '#577590', strokeWidth: 8 });
    }
    return store.getProject().slides[3].elements.length;
  }, ids.slide4);
  expect(count).toBe(300);
  await slideButton(page, 4).click();
  await page.getByRole('button', { name: '다음 장 만들기' }).click();
  await expect(slideButton(page, 5)).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('button', { name: '앞 장 겹쳐 보기' })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const w = window as any; w.frames = []; w.running = true;
    const loop = (t: number) => { w.frames.push(t); if (w.running) requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  });
  const scene = await page.evaluate(() => { const { store } = (window as any).__canvacraft; const el = store.getProject().slides[4].elements[299]; return { x: el.points[200], y: el.points[201] }; });
  const start = await screen(page, scene.x, scene.y);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  for (let i = 1; i <= 60; i++) await page.mouse.move(start.x + i * 2, start.y + i);
  await page.mouse.up();
  const gaps = await page.evaluate(() => { const w = window as any; w.running = false; return w.frames.slice(1).map((t: number, i: number) => t - w.frames[i]); });
  const sorted = [...gaps].sort((a: number, b: number) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)], max = sorted[sorted.length - 1];
  console.log(`양파 껍질 켠 끌기 프레임 간격 p95 ${p95.toFixed(1)}ms, 최대 ${max.toFixed(1)}ms, ${gaps.length}프레임`);
  expect(p95).toBeLessThan(50);
  // 끈 획은 실제로 옮겨졌고 앞 장은 그대로다.
  const after = await doc(page);
  expect(after.slides[4].elements).toHaveLength(300);
  expect(after.slides[4].elements[299].x).not.toBe(0);
  expect(after.slides[3].elements[299].x).toBe(0);
});
