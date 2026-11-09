import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

// 영상 V6: 밈 패널(스티커·밈 영상), 넣기 기본값, 끌어놓기, 비율 유지 크기, 동시 밈 수 상한, 밈 소리, 소리 패널, 미리보기 그리기·소리 계획.
const FIXTURE = 'tests/fixtures/video';
const OUT = 'artifacts/video-v6';
const status = (page: Page) => page.getByRole('status');
const doc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__canvacraftVideo.store.getProject())));
const rail = (page: Page, name: string) => page.getByRole('navigation', { name: '도구' }).getByRole('button', { name });
const bar = (page: Page) => page.getByRole('toolbar', { name: '선택한 자막·밈 설정' });
const seek = (page: Page, ms: number) => page.evaluate(ms => (window as any).__canvacraftVideo.player.seek(ms), ms);
const drawnAt = async (page: Page, ms: number) => { await seek(page, ms); await expect.poll(() => page.evaluate(() => (window as any).__canvacraftVideo.drawn()?.t)).toBe(ms); return page.evaluate(() => (window as any).__canvacraftVideo.drawn().ids as string[]); };

async function videoWithClips(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '영상 만들기' }).click();
  await page.getByRole('button', { name: '새 작품' }).click();
  const file = async (name: string) => ({ name, mimeType: 'video/webm', buffer: await fs.readFile(path.join(FIXTURE, name)) });
  await page.getByTestId('import-video').setInputFiles([await file('a.webm'), await file('b.webm')]);
  await expect(status(page)).toContainText('영상 2개를 넣었어요', { timeout: 20000 });
  await seek(page, 0);
  await rail(page, '밈').click();
}

test('스티커: 누르면 가운데에 기본 크기·3초로 들어가고, 미리보기에 움직이며 그려지고, 모서리는 비율을 지킨다', async ({ page }) => {
  await videoWithClips(page);
  await expect(page.getByRole('list', { name: '밈 목록' }).getByRole('button')).toHaveCount(6);
  await page.getByRole('group', { name: '밈 분류' }).getByRole('button', { name: '고양이' }).click();
  await expect(page.getByRole('list', { name: '밈 목록' }).getByRole('button')).toHaveCount(1);
  await page.getByRole('button', { name: '스티커 깡충 고양이 넣기' }).click();
  const meme = (await doc(page)).overlays[0];
  expect(meme).toMatchObject({ type: 'meme', memeId: 'cat-hop', memeKind: 'sticker', width: 256, height: 256, x: 512, y: 232, startMs: 0, durationMs: 3000, soundOn: true });
  // 프레임을 풀면 미리보기에 그려진다. 다른 시각에는 다른 프레임이다(움직인다).
  await expect.poll(async () => (await drawnAt(page, 100)).includes(meme.id), { timeout: 5000 }).toBe(true);
  await drawnAt(page, 0); await page.waitForTimeout(200); const first = await page.evaluate(() => (document.querySelector('[data-testid=preview]') as HTMLCanvasElement).toDataURL());
  await drawnAt(page, 250); await page.waitForTimeout(200); const later = await page.evaluate(() => (document.querySelector('[data-testid=preview]') as HTMLCanvasElement).toDataURL());
  expect(later).not.toBe(first);
  // 오른쪽 아래 모서리를 끌어도 비율(1:1)을 지킨다.
  const box = (await page.getByTestId('video-stage').boundingBox())!; const scale = box.width / 1280;
  const handle = (await page.getByTestId('overlay-handle-se').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(handle.x + 100 * scale, handle.y + 20 * scale, { steps: 5 }); await page.mouse.up();
  const resized = (await doc(page)).overlays[0];
  expect(resized.width).toBeGreaterThan(256);
  expect(resized.width).toBeCloseTo(resized.height, 1);
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'sticker.png') });
});

test('밈 영상: 같은 시각에 2개까지이고 셋째는 안내하며, 밈 소리를 끄고 켤 수 있고, 미리보기에 그려진다', async ({ page }) => {
  await videoWithClips(page);
  await page.getByRole('button', { name: '밈 영상 통통 공 넣기' }).click();
  await page.getByRole('button', { name: '밈 영상 와아 넣기' }).click();
  expect((await doc(page)).overlays.map((item: any) => item.memeId)).toEqual(['clip-boing', 'clip-wow']);
  expect((await doc(page)).overlays[0]).toMatchObject({ width: 480, height: 270, durationMs: 3000 });
  await page.getByRole('button', { name: '밈 영상 통통 공 넣기' }).click();
  await expect(status(page)).toContainText('2개까지');
  expect((await doc(page)).overlays).toHaveLength(2);
  // 밈 소리.
  await bar(page).getByRole('button', { name: '밈 소리 끄기' }).click();
  expect((await doc(page)).overlays[1].soundOn).toBe(false);
  await bar(page).getByRole('button', { name: '밈 소리 켜기' }).click();
  expect((await doc(page)).overlays[1].soundOn).toBe(true);
  // 밈 영상이 준비되면 그려진다.
  const ids = (await doc(page)).overlays.map((item: any) => item.id);
  await expect.poll(async () => (await drawnAt(page, 500)).filter(id => ids.includes(id)).length, { timeout: 8000 }).toBe(2);
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'clips.png') });
});

test('끌어놓기: 밈 카드를 화면에 끌어다 놓으면 놓은 곳이 밈의 가운데가 된다', async ({ page }) => {
  await videoWithClips(page);
  const box = (await page.getByTestId('video-stage').boundingBox())!; const scale = box.width / 1280;
  await page.getByRole('button', { name: '스티커 반짝 별 넣기' }).dragTo(page.getByTestId('video-stage'), { targetPosition: { x: 300 * scale, y: 300 * scale } });
  const meme = (await doc(page)).overlays[0];
  expect(meme.memeId).toBe('star-spin');
  expect(Math.abs(meme.x + meme.width / 2 - 300)).toBeLessThanOrEqual(2);
  expect(Math.abs(meme.y + meme.height / 2 - 300)).toBeLessThanOrEqual(2);
});

test('소리 패널: 원본 소리·배경음악·음악 크기가 명령 하나씩이고, 재생하면 음악과 효과음을 같은 시계로 낸다', async ({ page }) => {
  await videoWithClips(page);
  await page.getByRole('button', { name: '스티커 깡충 고양이 넣기' }).click();
  await rail(page, '소리').click();
  const original = page.getByRole('group', { name: '영상 원래 소리 크기' });
  await original.getByRole('button', { name: '작게' }).click();
  await page.getByRole('list', { name: '배경음악' }).getByRole('button', { name: '신나는 노래', exact: true }).click();
  await page.getByRole('group', { name: '배경음악 크기' }).getByRole('button', { name: '크게' }).click();
  expect((await doc(page)).audio).toEqual({ originalVolume: 0.5, musicId: 'music-happy', musicVolume: 1 });
  await page.keyboard.press('Control+z');
  expect((await doc(page)).audio).toEqual({ originalVolume: 0.5, musicId: 'music-happy', musicVolume: 0.5 });
  // 재생하면 배경음악 1개 + 고양이 효과음 1개를 예약한다(소리를 풀 때까지 잠깐 기다린다).
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '재생' }).click();
  await expect(page.getByRole('button', { name: '일시정지' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__canvacraftVideo.player.sources.length)).toBe(2);
  await page.getByRole('button', { name: '일시정지' }).click();
  expect(await page.evaluate(() => (window as any).__canvacraftVideo.player.sources.length)).toBe(0);
  // 밈 소리를 끄면 효과음도 끈다.
  await page.getByTestId('overlay-bar').click();
  await bar(page).getByRole('button', { name: '밈 소리 끄기' }).click();
  await page.getByRole('button', { name: '재생' }).click();
  await expect(page.getByRole('button', { name: '일시정지' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__canvacraftVideo.player.sources.length)).toBe(1);
});
