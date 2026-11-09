import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

// 영상 V5 자막: 추가·입력(한글 조합)·빈 글씨 규칙·서식·끌기·크기·보이는 시간(−/+, 지금부터, 타임라인 막대)·미리보기 시각 일치.
const FIXTURE = 'tests/fixtures/video';
const OUT = 'artifacts/video-v5';
const status = (page: Page) => page.getByRole('status');
const doc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__canvacraftVideo.store.getProject())));
const area = (page: Page) => page.getByRole('textbox', { name: '자막 글씨' });
const rail = (page: Page, name: string) => page.getByRole('navigation', { name: '도구' }).getByRole('button', { name });
const bar = (page: Page) => page.getByRole('toolbar', { name: '선택한 자막·밈 설정' });
const timeMs = (page: Page) => page.evaluate(() => (window as any).__canvacraftVideo.player.state.timeMs as number);
const seek = (page: Page, ms: number) => page.evaluate(ms => (window as any).__canvacraftVideo.player.seek(ms), ms);

async function videoWithClips(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '영상 만들기' }).click();
  await page.getByRole('button', { name: '새 작품' }).click();
  const file = async (name: string) => ({ name, mimeType: 'video/webm', buffer: await fs.readFile(path.join(FIXTURE, name)) });
  await page.getByTestId('import-video').setInputFiles([await file('a.webm'), await file('b.webm')]);
  await expect(status(page)).toContainText('영상 2개를 넣었어요', { timeout: 20000 });
  await seek(page, 0);
}
// 미리보기 캔버스의 논리 좌표 (x, y) 픽셀 밝기.
const brightness = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => {
  const canvas = document.querySelector('[data-testid=preview]') as HTMLCanvasElement;
  const [r, g, b] = canvas.getContext('2d')!.getImageData(x, y, 1, 1).data; return r + g + b;
}, [x, y]);
// 자막 띠 위쪽 여백 가운데(글씨가 없는 띠 자리)가 영상보다 어두우면 자막이 그려진 것이다.
// 가운데를 재는 이유: 세로 영상 구간은 양옆이 검은 여백이라 띠 끝에서는 차이가 없다.
const bandShown = (page: Page, caption: any) => brightness(page, Math.round(caption.x + (caption.width ?? 960) / 2), caption.y - 4);
async function stagePoint(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('video-stage').boundingBox())!;
  const scale = box.width / 1280;
  return { x: box.x + x * scale, y: box.y + y * scale, scale };
}

test('자막 추가: 입력을 확정하면 문서에 들어가고, 빈 자막은 남지 않으며, 미리보기에 띠와 함께 그려진다', async ({ page }) => {
  await videoWithClips(page);
  await rail(page, '자막').click();
  // 빈 채로 끝내면 아무것도 남지 않는다.
  await page.getByRole('button', { name: '보통 자막 추가' }).click();
  await expect(area(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(area(page)).toHaveCount(0);
  expect((await doc(page)).overlays).toEqual([]);
  expect(await page.evaluate(() => (window as any).__canvacraftVideo.store.historySize().undo)).toBe(2);

  const before = await bandShown(page, { x: 160, y: 540 });
  await page.getByRole('button', { name: '보통 자막 추가' }).click();
  await page.keyboard.type('안녕 고양이');
  await page.keyboard.press('Escape');
  const project = await doc(page);
  expect(project.overlays).toHaveLength(1);
  expect(project.overlays[0]).toMatchObject({ type: 'caption', text: '안녕 고양이', startMs: 0, durationMs: 3000, x: 160, y: 540, width: 960, fontSize: 48, bold: true, color: '#FFFFFF', backdrop: 'band' });
  await expect(page.getByTestId('overlay-selection')).toBeVisible();
  await expect.poll(() => bandShown(page, project.overlays[0])).toBeLessThan(before);
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'caption.png') });
  // 되돌리기 한 번에 사라진다.
  await page.keyboard.press('Control+z');
  expect((await doc(page)).overlays).toEqual([]);
  await page.keyboard.press('Control+Shift+z');
  expect((await doc(page)).overlays).toHaveLength(1);
});

test('한글 조합 중 Enter·Esc는 입력을 끝내지 않고 글자가 겹치지 않는다', async ({ page, context }) => {
  await videoWithClips(page);
  await rail(page, '자막').click();
  await page.getByRole('button', { name: '보통 자막 추가' }).click();
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
  // 조합 중에 재생을 누르면 조합이 끝난 뒤 확정하고 재생한다.
  await cdp.send('Input.imeSetComposition', { text: '자', selectionStart: 1, selectionEnd: 1 });
  await page.getByRole('button', { name: '재생' }).click();
  await expect(area(page)).toHaveCount(0);
  const texts = (await doc(page)).overlays.map((item: any) => item.text);
  expect(texts).toHaveLength(1);
  expect(texts[0].startsWith('한글')).toBe(true);
  expect(texts[0].length).toBeLessThanOrEqual(3);
});

test('자막 고치기: 두 번 눌러 고치고, 다 지우면 삭제이며, 서식·띠는 명령 하나씩이다', async ({ page }) => {
  await videoWithClips(page);
  await rail(page, '자막').click();
  await page.getByRole('button', { name: '크게 추가' }).click();
  await page.keyboard.type('처음 자막');
  await page.keyboard.press('Escape');
  let caption = (await doc(page)).overlays[0];
  expect(caption).toMatchObject({ fontSize: 72, width: 1120, x: 80 });
  // 서식 줄: 굵게 끄기, 띠 끄기.
  await bar(page).getByRole('button', { name: '굵게' }).click();
  await bar(page).getByRole('button', { name: '띠' }).click();
  caption = (await doc(page)).overlays[0];
  expect(caption).toMatchObject({ bold: false, backdrop: 'none' });
  // 두 번 눌러 고친다.
  const point = await stagePoint(page, caption.x + caption.width / 2, caption.y + 20);
  await page.mouse.dblclick(point.x, point.y);
  await expect(area(page)).toHaveValue('처음 자막');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('바뀐 자막');
  await page.keyboard.press('Escape');
  expect((await doc(page)).overlays[0].text).toBe('바뀐 자막');
  // 다 지우고 끝내면 삭제이고, 되돌리기 한 번에 돌아온다.
  await page.keyboard.press('Enter');
  await expect(area(page)).toBeVisible();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Escape');
  expect((await doc(page)).overlays).toEqual([]);
  await page.keyboard.press('Control+z');
  expect((await doc(page)).overlays[0].text).toBe('바뀐 자막');
});

test('끌기·크기: 끌면 옮겨지고(화면 밖으로 다 나가지 않음), 모서리는 폭과 글씨 크기를 같은 비율로 바꾼다', async ({ page }) => {
  await videoWithClips(page);
  await rail(page, '자막').click();
  await page.getByRole('button', { name: '보통 자막 추가' }).click();
  await page.keyboard.type('움직이는 자막');
  await page.keyboard.press('Escape');
  const caption = (await doc(page)).overlays[0];
  const start = await stagePoint(page, caption.x + 100, caption.y + 20);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x - 100 * start.scale, start.y - 200 * start.scale, { steps: 5 }); await page.mouse.up();
  let moved = (await doc(page)).overlays[0];
  expect(Math.abs(moved.x - (caption.x - 100))).toBeLessThan(2);
  expect(Math.abs(moved.y - (caption.y - 200))).toBeLessThan(2);
  // 아주 멀리 끌어도 화면 안에 남는다.
  const again = await stagePoint(page, moved.x + 100, moved.y + 20);
  await page.mouse.move(again.x, again.y); await page.mouse.down();
  await page.mouse.move(again.x + 3000, again.y + 3000, { steps: 5 }); await page.mouse.up();
  moved = (await doc(page)).overlays[0];
  expect(moved.x + moved.width).toBeLessThanOrEqual(1280.5);
  expect(moved.y).toBeLessThan(720);
  // 오른쪽 아래 모서리를 안쪽으로 끌면 폭과 글씨 크기가 함께 준다.
  await seek(page, 500);
  const handle = (await page.getByTestId('overlay-handle-se').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(handle.x - 240 * start.scale, handle.y, { steps: 5 }); await page.mouse.up();
  const resized = (await doc(page)).overlays[0];
  expect(resized.width).toBeLessThan(moved.width);
  expect(resized.fontSize / moved.fontSize).toBeCloseTo(resized.width / moved.width, 2);
});

test('보이는 시간: −/+는 1초씩, 지금부터는 재생 막대에서 시작하고, 영상 끝을 넘지 않게 줄이며, 미리보기와 같은 시각에 보인다', async ({ page }) => {
  await videoWithClips(page);
  const total = (await doc(page)).clips.reduce((sum: number, clip: any) => sum + clip.outMs - clip.inMs, 0);
  await rail(page, '자막').click();
  await page.getByRole('button', { name: '보통 자막 추가' }).click();
  await page.keyboard.type('시간 자막');
  await page.keyboard.press('Escape');
  const id = (await doc(page)).overlays[0].id;
  await bar(page).getByRole('button', { name: '보이는 시간 줄이기' }).click();
  expect((await doc(page)).overlays[0]).toMatchObject({ startMs: 0, durationMs: 2000 });
  await expect(page.getByTestId('overlay-duration')).toHaveText('2초');
  // 지금부터: 1초로 옮기고 시작을 바꾼다.
  await seek(page, 1000);
  await bar(page).getByRole('button', { name: '지금부터' }).click();
  expect((await doc(page)).overlays[0]).toMatchObject({ startMs: 1000, durationMs: 2000 });
  // 늘리면 영상 끝까지만 늘고 알린다. 끝에 닿으면 늘리기 단추가 꺼진다.
  await bar(page).getByRole('button', { name: '보이는 시간 늘리기' }).click();
  expect((await doc(page)).overlays[0]).toMatchObject({ startMs: 1000, durationMs: total - 1000 });
  await expect(status(page)).toContainText('영상 끝까지만');
  await expect(bar(page).getByRole('button', { name: '보이는 시간 늘리기' })).toBeDisabled();

  // 미리보기: 시작 직전에는 안 보이고 시작에는 보이며, 끝(포함하지 않음)에는 안 보인다.
  const caption = (await doc(page)).overlays[0];
  await bar(page).getByRole('button', { name: '보이는 시간 줄이기' }).click();
  const shorter = (await doc(page)).overlays[0];
  await page.keyboard.press('Escape');
  // 미리보기가 마지막으로 그린 시각과 그린 자막 id를 본다(타임라인 막대와 같은 startMs ≤ t < 끝 규칙).
  const shown = async (ms: number) => { await seek(page, ms); await expect.poll(() => page.evaluate(() => (window as any).__canvacraftVideo.drawn()?.t)).toBe(ms); return (await page.evaluate(() => (window as any).__canvacraftVideo.drawn().ids)).includes(caption.id); };
  expect(await shown(shorter.startMs - 1)).toBe(false);
  expect(await shown(shorter.startMs)).toBe(true);
  expect(await shown(shorter.startMs + shorter.durationMs - 1)).toBe(true);
  expect(await shown(shorter.startMs + shorter.durationMs)).toBe(false);

  // 타임라인 막대 뒤 끝을 끌어 늘린다(100ms 단위, 손을 뗄 때 명령 하나).
  await page.getByTestId('overlay-bar').click();
  const pps = Number(await page.getByTestId('timeline').getAttribute('data-px-per-second'));
  const undoBefore = await page.evaluate(() => (window as any).__canvacraftVideo.store.historySize().undo);
  await page.getByTestId('overlay-bar').click();
  const startHandle = (await page.getByTestId('bar-start').boundingBox())!;
  await page.mouse.move(startHandle.x + startHandle.width / 2, startHandle.y + startHandle.height / 2); await page.mouse.down();
  await page.mouse.move(startHandle.x + startHandle.width / 2 - pps, startHandle.y + 5, { steps: 4 }); await page.mouse.up();
  const dragged = (await doc(page)).overlays[0];
  expect(dragged.startMs + dragged.durationMs).toBe(shorter.startMs + shorter.durationMs);
  expect(Math.abs(dragged.startMs - (shorter.startMs - 1000))).toBeLessThanOrEqual(100);
  expect(dragged.startMs % 100).toBe(0);
  expect(await page.evaluate(() => (window as any).__canvacraftVideo.store.historySize().undo)).toBe(undoBefore + 1);
  // 막대를 누르기만 하면 그 자막의 시작으로 재생 막대가 간다.
  await seek(page, 0);
  await page.getByTestId('overlay-bar').click();
  await expect.poll(() => timeMs(page)).toBe(dragged.startMs);
  expect(id).toBe(dragged.id);
});

test('세로 작품: 자막 기본 위치·폭이 세로 화면에 맞고, 화면 밖으로 나가지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '영상 만들기' }).click();
  await page.getByRole('button', { name: '새 작품' }).click();
  await page.getByTestId('import-video').setInputFiles({ name: 'b.webm', mimeType: 'video/webm', buffer: await fs.readFile(path.join(FIXTURE, 'b.webm')) });
  await expect(status(page)).toContainText('영상을 넣었어요', { timeout: 20000 });
  await rail(page, '자막').click();
  await page.getByRole('button', { name: '보통 자막 추가' }).click();
  await page.keyboard.type('세로 자막');
  await page.keyboard.press('Escape');
  expect((await doc(page)).overlays[0]).toMatchObject({ x: 60, y: 1000, width: 600, durationMs: 1500 });
  await expect(status(page)).toContainText('영상 끝까지만');
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'portrait.png') });
});
