import { test, expect, type Page } from '@playwright/test';

// 긴 작품의 타임라인(길이 한도 설정 뒤, 2026-11-10): 맞춤이면 몇 시간짜리도 한 화면에 들어오고,
// 눈금은 길이에 맞는 간격으로 화면에 보이는 만큼만 그린다. 배율을 끝까지 키워도 눈금 수가 늘지 않는다.
const run = (page: Page, command: unknown) => page.evaluate(command => { const { store } = (window as any).__canvacraftVideo; const p = store.getProject(); return store.dispatch(p.id, p.revision, command); }, command);
const media = (letter: string, minutes: number) => ({ id: letter.repeat(64), mime: 'video/mp4', byteLength: 5_000_000, durationMs: minutes * 60_000, width: 1280, height: 720, rotation: 0, fps: 30, hasAudio: false, videoCodec: 'avc1.64001f', audioCodec: null });
const shape = (page: Page) => page.getByTestId('timeline').evaluate(box => ({
  pps: Number((box as HTMLElement).dataset.pxPerSecond), scroll: box.scrollWidth, client: box.clientWidth,
  ticks: [...box.querySelectorAll('.tick')].map(tick => tick.textContent ?? ''),
}));

async function longWork(page: Page, minutes: number[]) {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('canvacraft.video.lengthLimit', JSON.stringify({ ms: null })));
  await page.getByRole('button', { name: '영상 만들기' }).click();
  await page.getByRole('button', { name: '새 작품' }).click();
  await page.waitForFunction(() => (window as any).__canvacraftVideo?.store);
  for (const [index, length] of minutes.entries()) expect(await run(page, { type: 'addClip', media: media('abcdef'[index], length) })).toMatchObject({ ok: true });
}

test('긴 작품 타임라인: 1시간 작품이 맞춤에서 한 화면에 들어오고 눈금은 분 단위로 몇 개만 나온다', async ({ page }) => {
  await longWork(page, [40, 20]);
  await expect(page.getByTestId('timeline-total')).toHaveText('1:00:00');
  await expect(page.getByRole('button', { name: '타임라인 맞춤' })).toHaveAttribute('aria-pressed', 'true');
  const fit = await shape(page);
  // 옆으로 밀 것이 없다(전체가 보인다).
  expect(fit.scroll).toBeLessThanOrEqual(fit.client);
  expect(fit.pps).toBeLessThan(1);
  // 눈금은 5분·10분처럼 넓은 간격이고 수십 개를 넘지 않는다.
  expect(fit.ticks.length).toBeGreaterThanOrEqual(4);
  expect(fit.ticks.length).toBeLessThanOrEqual(40);
  expect(fit.ticks[0]).toBe('0:00');
  expect(fit.ticks.every(text => /:00$/.test(text))).toBe(true);
  // 두 조각이 길이 비율대로(40분:20분) 화면 안에 놓인다.
  const widths = await page.locator('.clip-slot').evaluateAll(items => items.map(item => item.getBoundingClientRect().width));
  expect(widths).toHaveLength(2);
  expect(Math.abs(widths[0] / widths[1] - 2)).toBeLessThan(0.05);
});

test('긴 작품 타임라인: 배율을 끝까지 키우면 1초 눈금까지 보이지만 그리는 눈금은 화면에 보이는 만큼이다', async ({ page }) => {
  await longWork(page, [180, 120]);
  await expect(page.getByTestId('timeline-total')).toHaveText('5:00:00');
  const slider = page.getByRole('slider', { name: '타임라인 배율' });
  await slider.focus();
  await page.keyboard.press('End');
  const near = await shape(page);
  expect(near.pps).toBeGreaterThanOrEqual(100);
  expect(near.scroll).toBeGreaterThan(near.client * 100);
  expect(near.ticks.length).toBeGreaterThan(0);
  expect(near.ticks.length).toBeLessThanOrEqual(80);
  // 재생 막대를 작품 가운데로 옮기면 그 근처 눈금이 그려진다(보이는 곳을 따라간다).
  await page.evaluate(() => (window as any).__canvacraftVideo.player.seek(2.5 * 3_600_000));
  await expect.poll(async () => (await shape(page)).ticks.some(text => text.startsWith('2:30:'))).toBe(true);
  expect((await shape(page)).ticks.length).toBeLessThanOrEqual(80);
  // 배율을 끝까지 줄이면 다시 전체가 보인다.
  await slider.focus();
  await page.keyboard.press('Home');
  const far = await shape(page);
  expect(far.scroll).toBeLessThanOrEqual(far.client);
  // 맞춤 단추도 같은 결과다.
  await page.getByRole('button', { name: '타임라인 맞춤' }).click();
  expect((await shape(page)).scroll).toBeLessThanOrEqual(far.client);
});

test('짧은 작품 타임라인은 그대로다: 맞춤에서 전체가 보이고 눈금은 초 단위다', async ({ page }) => {
  await longWork(page, [1]);
  const fit = await shape(page);
  expect(fit.scroll).toBeLessThanOrEqual(fit.client);
  // 1분 작품을 이 화면 너비에 맞추면 초당 5~15px이라 10초 눈금이다(고치기 전과 같다).
  expect(fit.pps).toBeGreaterThanOrEqual(5);
  expect(fit.pps).toBeLessThan(15);
  expect(fit.ticks).toEqual(['0:00', '0:10', '0:20', '0:30', '0:40', '0:50', '1:00']);
});
