import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

// 빠르기를 바꾼 조각으로 넘어갈 때의 미리보기(계약 §8): 한 영상을 두 번 잘라 가운데 조각만 빠르게 하고 이어 재생한다.
// 넘어간 직후 화면이 검게 깜빡이지 않는지, <video> 위치를 되풀이해 다시 맞추지 않는지 확인한다.
const FIXTURE = 'tests/fixtures/video';
const OUT = 'artifacts/video-speed';
const status = (page: Page) => page.getByRole('status');
const doc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__canvacraftVideo.store.getProject())));
const clipButtons = (page: Page) => page.getByRole('list', { name: '영상 조각' }).getByRole('button');

// a.webm(2초)을 0.6초·1.4초에서 잘라 세 조각으로 만들고 재생 막대를 처음으로 옮긴다.
async function threePieces(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '영상 만들기' }).click();
  await page.getByRole('button', { name: '새 작품' }).click();
  await page.getByTestId('import-video').setInputFiles({ name: 'a.webm', mimeType: 'video/webm', buffer: await fs.readFile(path.join(FIXTURE, 'a.webm')) });
  await expect(status(page)).toContainText('영상을 넣었어요', { timeout: 20000 });
  const ruler = (await page.getByTestId('timeline-ruler').boundingBox())!;
  const pps = Number(await page.getByTestId('timeline').getAttribute('data-px-per-second'));
  const cut = page.getByRole('toolbar', { name: '선택한 조각 설정' }).getByRole('button', { name: '여기서 자르기' });
  for (const [count, seconds] of [[2, 1.4], [3, 0.6]] as const) {
    await clipButtons(page).first().click({ position: { x: 10, y: 20 } });
    await page.mouse.click(ruler.x + 12 + pps * seconds, ruler.y + ruler.height / 2);
    await cut.click();
    await expect(clipButtons(page)).toHaveCount(count);
  }
  await page.mouse.click(ruler.x + 12, ruler.y + ruler.height / 2);
  await expect(page.getByTestId('player-time')).toHaveText(/^0:00 \//);
}

// 재생하는 동안 그릴 때마다 화면 가운데가 검은지, 그때 <video>가 어떤 상태였는지 적는다.
async function watchDraws(page: Page) {
  await page.evaluate(() => {
    const player = (window as any).__canvacraftVideo.player;
    const log: any[] = (window as any).__draws = [];
    const original = player.draw;
    player.draw = function (video: HTMLVideoElement | null) {
      original.call(this, video);
      if (!this.playing) return;
      const canvas = this.canvas as HTMLCanvasElement;
      const pixels = canvas.getContext('2d')!.getImageData(canvas.width / 2 - 8, canvas.height / 2 - 8, 16, 16).data;
      let sum = 0; for (let i = 0; i < pixels.length; i += 4) sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
      const at = this.project.clips.findIndex((clip: any) => clip.id === this.slots[this.active].clipId);
      log.push({ at: performance.now(), work: this.time, clipIndex: at, black: sum === 0, readyState: video?.readyState ?? -1, seeking: !!video?.seeking, source: (video?.currentTime ?? 0) * 1000, rate: video?.playbackRate });
    };
  });
}

async function playThrough(page: Page) {
  await page.getByRole('button', { name: '재생' }).click();
  await expect(page.getByRole('button', { name: '일시정지' })).toBeVisible();
  await expect(page.getByRole('button', { name: '재생' })).toBeVisible({ timeout: 10000 });
  return page.evaluate(() => ({ draws: (window as any).__draws as any[], events: (window as any).__canvacraftVideo.player.events as any[] }));
}

// 고치기 전에는 <video>가 재생을 시작하며 잠깐 멈춰 있는 시간을 어긋남으로 세었고, 빠른 조각에서는 그 값이 빠르기만큼 커져
// 위치를 되풀이해 다시 맞췄다. 맞추는 동안에는 화면을 검게 그렸다(소리가 늦게 나가는 장치에서는 보통 빠르기 조각에서도 그랬다).
for (const [label, speed] of [['빠르게 2배', 2], ['아주 빠르게 4배', 4]] as const) {
  test(`${speed}배 조각으로 넘어갈 때 미리보기가 검게 깜빡이지 않고, 위치를 다시 맞추지 않는다`, async ({ page }) => {
    await threePieces(page);
    await clipButtons(page).nth(1).click({ position: { x: 10, y: 20 } });
    await page.getByRole('combobox', { name: '조각 빠르기' }).selectOption({ label });
    expect((await doc(page)).clips.map((clip: any) => clip.speed ?? 1)).toEqual([1, speed, 1]);
    const ruler = (await page.getByTestId('timeline-ruler').boundingBox())!;
    await page.mouse.click(ruler.x + 12, ruler.y + ruler.height / 2);
    await watchDraws(page);
    const { draws, events } = await playThrough(page);

    const black = draws.filter(draw => draw.black);
    const drifts = events.filter(event => event.type === 'drift');
    const perClip = (list: any[]) => [0, 1, 2].map(index => list.filter(item => item.clipIndex === index).length).join('·');
    console.log(`${speed}배: 그린 횟수 ${draws.length}(조각별 ${perClip(draws)}), 검은 화면 ${black.length}(조각별 ${perClip(black)}), 위치 다시 맞춤 ${drifts.length}회`);
    await fs.mkdir(OUT, { recursive: true });
    await fs.writeFile(path.join(OUT, `fast-boundary-${speed}x.json`), JSON.stringify({ draws, events }, null, 1));
    expect(draws.filter(draw => draw.clipIndex === 1).length, '빠른 조각을 그린 횟수').toBeGreaterThan(3);
    expect(black.length, '검게 그린 횟수').toBe(0);
    expect(drifts.length, '위치를 다시 맞춘 횟수').toBe(0);
  });
}

test('재생 중에 재생 막대를 옮기면 그 자리에서 이어 재생하고, 위치를 되풀이해 다시 맞추지 않는다', async ({ page }) => {
  await threePieces(page);
  const ruler = (await page.getByTestId('timeline-ruler').boundingBox())!;
  const pps = Number(await page.getByTestId('timeline').getAttribute('data-px-per-second'));
  await page.getByRole('button', { name: '재생' }).click();
  await expect(page.getByRole('button', { name: '일시정지' })).toBeVisible();
  await page.waitForTimeout(200);
  await page.mouse.click(ruler.x + 12 + pps * 0.8, ruler.y + ruler.height / 2);
  // <video>가 옮긴 자리(가운데 조각, 원본 0.8초)에서 다시 움직일 때까지 기다린다.
  await expect.poll(() => page.evaluate(() => { const p = (window as any).__canvacraftVideo.player; return p.state.playing && p.project.clips.findIndex((clip: any) => clip.id === p.slots[p.active].clipId) >= 1 && p.slots[p.active].video.currentTime > 0.85; })).toBe(true);
  const state = await page.evaluate(() => { const p = (window as any).__canvacraftVideo.player; return { work: p.state.timeMs as number, source: p.slots[p.active].video.currentTime * 1000 as number }; });
  // 조각이 모두 보통 빠르기라 원본 시각과 작품 시각이 같다. 시작 지연(소리 장치에 따라 0.4초 안팎)만큼만 뒤에 있다.
  expect(state.work).toBeGreaterThan(800);
  expect(state.work - state.source).toBeLessThan(600);
  await expect(page.getByRole('button', { name: '재생' })).toBeVisible({ timeout: 10000 });
  const drifts = await page.evaluate(() => ((window as any).__canvacraftVideo.player.events as any[]).filter(event => event.type === 'drift').length);
  expect(drifts, '위치를 다시 맞춘 횟수').toBeLessThanOrEqual(1);
});
