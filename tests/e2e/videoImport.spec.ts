import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

// 영상 V4: 가져오기(Worker 검사·복사·해시), 미리보기 재생과 조각 경계 끊김, 타임라인 자르기·다듬기·지우기·순서, 손상 파일.
const FIXTURE = 'tests/fixtures/video';
const OUT = 'artifacts/video-v4';
const status = (page: Page) => page.getByRole('status');
const saveState = (page: Page) => page.getByTestId('save-state');
const doc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__canvacraftVideo.store.getProject())));
const clipButtons = (page: Page) => page.getByRole('list', { name: '영상 조각' }).getByRole('button');
const fixtureMedia = async () => JSON.parse(await fs.readFile(path.join(FIXTURE, 'project.json'), 'utf8')).mediaManifest;
const file = async (name: string, rename = name) => ({ name: rename, mimeType: 'video/webm', buffer: await fs.readFile(path.join(FIXTURE, name)) });

async function newVideo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '영상 만들기' }).click();
  await page.getByRole('button', { name: '새 작품' }).click();
  await expect(page.getByTestId('video-stage')).toBeVisible();
}
async function importBoth(page: Page) {
  await page.getByTestId('import-video').setInputFiles([await file('a.webm', '우리집 고양이 비밀.webm'), await file('b.webm')]);
  await expect(status(page)).toContainText('영상 2개를 넣었어요', { timeout: 20000 });
}

test('가져오기: 두 영상을 넣으면 조각이 생기고, 자료 값은 fixture와 같으며 파일 이름은 남지 않는다', async ({ page }) => {
  await newVideo(page);
  await importBoth(page);
  const project = await doc(page);
  const expected = await fixtureMedia();
  expect(project.mediaManifest.map((media: any) => media.id)).toEqual(expected.map((media: any) => media.id));
  expect(project.mediaManifest.map((media: any) => [media.mime, media.byteLength, media.width, media.height, media.hasAudio])).toEqual(expected.map((media: any) => [media.mime, media.byteLength, media.width, media.height, media.hasAudio]));
  for (const [index, media] of project.mediaManifest.entries()) expect(Math.abs(media.durationMs - expected[index].durationMs)).toBeLessThanOrEqual(50);
  // 첫 영상(가로)이 방향·프레임률을 정한다.
  expect(project).toMatchObject({ orientation: 'landscape', fps: 30 });
  await expect(clipButtons(page)).toHaveCount(2);
  await expect(page.getByRole('list', { name: '가져온 영상' }).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByTestId('free-space')).toContainText('이 컴퓨터에 영상을 더 넣을 자리');
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 5000 });
  // 원본 파일 이름은 문서·저장소 어디에도 없다.
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const open = indexedDB.open('canvacraft-video'); open.onsuccess = () => resolve(open.result); });
    const all = (name: string) => new Promise<any[]>(resolve => { const req = db.transaction(name).objectStore(name).getAll(); req.onsuccess = () => resolve(req.result); });
    const text = JSON.stringify([await all('projects'), await all('media'), (await all('summaries')).map(row => ({ ...row, thumbnail: !!row.thumbnail }))]);
    db.close(); return text;
  });
  expect(stored).not.toContain('비밀');
  expect(stored).toContain('"thumbnail":true');
  // 같은 영상을 다시 넣으면 자료는 그대로이고 조각만 는다.
  await page.getByRole('button', { name: '영상 1 다시 넣기' }).click();
  expect((await doc(page)).mediaManifest).toHaveLength(2);
  await expect(clipButtons(page)).toHaveCount(3);
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'imported.png') });
});

test('가져오기 실패: 영상이 아닌 파일·깨진 파일·지원하지 않는 형식은 작품과 저장소를 바꾸지 않는다', async ({ page }) => {
  await newVideo(page);
  await page.getByTestId('import-video').setInputFiles(await file('a.webm'));
  await expect(status(page)).toContainText('영상을 넣었어요', { timeout: 20000 });
  const before = await doc(page);
  const ids = () => page.evaluate(async () => (await import('/src/video/mediaStore.ts' as string)).listMediaIds());
  const beforeIds = await ids();
  const cases: [string, Buffer, RegExp][] = [
    ['메모.webm', Buffer.from('그냥 글자 파일이에요'), /영상 파일이 아니에요/],
    // MP4 머리(ftyp)만 있고 나머지는 엉터리.
    ['깨짐.mp4', Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(4000, 7)]), /읽지 못했어요|영상이 들어 있지 않은/],
    // 앞 4KB만 남은 WebM.
    ['잘림.webm', (await fs.readFile(path.join(FIXTURE, 'b.webm'))).subarray(0, 4096), /읽지 못했어요|영상이 들어 있지 않은|너무 짧아요|읽을 수 없어요/],
  ];
  for (const [name, buffer, message] of cases) {
    await page.getByTestId('import-video').setInputFiles({ name, mimeType: 'video/webm', buffer });
    await expect(status(page), name).toHaveText(message, { timeout: 20000 });
    expect(await doc(page), name).toEqual(before);
  }
  expect(await ids()).toEqual(beforeIds);
  // 임시 파일도 남지 않는다.
  expect(await page.evaluate(async () => { const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('canvacraft-video'); const names: string[] = []; for await (const [name] of (await root.getDirectoryHandle('tmp') as any).entries()) names.push(name); return names; })).toEqual([]);
});

test('미리보기: 재생하면 시계를 따라 두 조각을 이어 재생하고, 조각 경계에서 크게 끊기지 않는다', async ({ page }) => {
  await newVideo(page);
  await importBoth(page);
  // V4 완료 기준은 "이어 붙여 자른 결과"의 재생이다. 첫 영상을 1초에서 잘라 같은 영상끼리의 경계와 다른 영상 사이의 경계를 함께 잰다.
  const ruler = (await page.getByTestId('timeline-ruler').boundingBox())!;
  const pps = Number(await page.getByTestId('timeline').getAttribute('data-px-per-second'));
  await clipButtons(page).first().click({ position: { x: 10, y: 20 } });
  await page.mouse.click(ruler.x + 12 + pps, ruler.y + ruler.height / 2);
  await page.getByRole('toolbar', { name: '선택한 조각 설정' }).getByRole('button', { name: '여기서 자르기' }).click();
  await expect(clipButtons(page)).toHaveCount(3);
  // 넣은 직후·자른 직후 재생 막대를 처음으로 옮긴다.
  await page.mouse.click(ruler.x + 12, ruler.y + ruler.height / 2);
  await expect(page.getByTestId('player-time')).toHaveText(/^0:00 \//);
  await page.getByRole('button', { name: '재생' }).click();
  await expect(page.getByRole('button', { name: '일시정지' })).toBeVisible();
  await expect(page.getByRole('button', { name: '재생' })).toBeVisible({ timeout: 10000 });
  const project = await doc(page);
  const total = project.clips.reduce((sum: number, clip: any) => sum + clip.outMs - clip.inMs, 0);
  await expect(page.getByTestId('player-time')).toHaveText(`0:0${Math.round(total / 1000)} / 0:0${Math.round(total / 1000)}`);
  const frames = await page.evaluate(() => (window as any).__canvacraftVideo.player.frames as { at: number; clipIndex: number; mediaTime: number }[]);
  for (const index of [0, 1, 2]) expect(frames.some(frame => frame.clipIndex === index), `조각 ${index}`).toBe(true);
  // 다음 조각의 첫 프레임이 앞 조각의 마지막 프레임 뒤 얼마 만에 나왔는지. 1→2는 같은 영상(자른 자리), 2→3은 다른 영상이다.
  const boundaries = [1, 2].map(next => frames.findIndex(frame => frame.clipIndex === next));
  const gaps = boundaries.map(at => frames[at].at - frames[at - 1].at);
  const steady = frames.slice(1).map((frame, index) => frame.at - frames[index].at).filter((_, index) => !boundaries.includes(index + 1)).sort((a, b) => a - b);
  console.log(`자른 자리 경계 ${gaps[0].toFixed(0)}ms, 다른 영상 경계 ${gaps[1].toFixed(0)}ms, 평소 간격 중앙값 ${steady[Math.floor(steady.length / 2)].toFixed(0)}ms, 최대 ${steady.at(-1)!.toFixed(0)}ms, 프레임 ${frames.length}개`);
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, 'boundary.json'), JSON.stringify({ splitGap: gaps[0], mediaGap: gaps[1], frames: frames.length, steadyMedian: steady[Math.floor(steady.length / 2)], steadyMax: steady.at(-1) }, null, 2));
  for (const gap of gaps) expect(gap).toBeLessThanOrEqual(200);
  // 자른 뒤쪽 조각은 원본 1초 근처에서, 다음 영상은 원본 처음부터 나온다.
  expect(Math.abs(frames[boundaries[0]].mediaTime - project.clips[1].inMs / 1000)).toBeLessThan(0.1);
  expect(frames[boundaries[1]].mediaTime).toBeLessThan(0.2);
});

test('타임라인: 재생 막대로 옮겨 자르고, 취소 한 번에 돌아오며, 다듬기·순서·소리·지우기가 명령 하나씩이다', async ({ page }) => {
  await newVideo(page);
  await importBoth(page);
  const ruler = (await page.getByTestId('timeline-ruler').boundingBox())!;
  // 처음에는 작품 전체가 띠에 들어가도록 배율을 맞춘다.
  const pps = Number(await page.getByTestId('timeline').getAttribute('data-px-per-second'));
  expect(pps * 3.5).toBeGreaterThan(ruler.width * 0.8);
  // 조각을 누르면 선택하면서 그 자리로 재생 막대가 온다. 그다음 눈금에서 1초 지점(왼쪽 여백 12px)을 누른다.
  await clipButtons(page).first().click({ position: { x: 10, y: 20 } });
  await page.mouse.click(ruler.x + 12 + pps, ruler.y + ruler.height / 2);
  await expect(page.getByTestId('player-time')).toHaveText(/^0:01 \//);
  const cut = page.getByRole('toolbar', { name: '선택한 조각 설정' }).getByRole('button', { name: '여기서 자르기' });
  await expect(cut).toBeEnabled();
  const before = await doc(page);
  const playhead = () => page.evaluate(() => (window as any).__canvacraftVideo.player.state.timeMs);
  const atCut = await playhead();
  await cut.click();
  let after = await doc(page);
  // 일반 명령은 재생 막대를 옮기지 않는다(되돌리기·다시 하기만 옮긴다, 계약 §4).
  expect(await playhead()).toBe(atCut);
  expect(after.clips).toHaveLength(3);
  expect(after.clips[0].outMs).toBe(after.clips[1].inMs);
  expect(Math.abs(after.clips[0].outMs - 1000)).toBeLessThanOrEqual(30);
  await page.keyboard.press('Control+z');
  expect((await doc(page)).clips).toEqual(before.clips);
  await page.keyboard.press('Control+Shift+z');
  expect((await doc(page)).clips).toEqual(after.clips);

  // 재생 막대가 조각 끝에 너무 가까우면 자르기를 끈다.
  // 첫 조각은 선택된 채로 둔다(조각 끝에는 다듬기 손잡이가 있다).
  await page.mouse.click(ruler.x + 12 + 1, ruler.y + ruler.height / 2);
  await expect(clipButtons(page).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(cut).toBeDisabled();

  // 둘째 조각의 뒷부분을 끌어 다듬는다(손을 뗄 때 명령 하나).
  await clipButtons(page).nth(1).click();
  const handle = (await page.getByTestId('trim-out').boundingBox())!;
  const undoBefore = await page.evaluate(() => (window as any).__canvacraftVideo.store.historySize().undo);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - pps / 4, handle.y + 20, { steps: 3 });
  await page.mouse.move(handle.x + handle.width / 2 - pps / 2, handle.y + 20, { steps: 3 });
  await page.mouse.up();
  after = await doc(page);
  expect(after.clips[1].outMs).toBeLessThan(before.clips[0].outMs);
  expect(Math.abs(after.clips[1].outMs - (before.clips[0].outMs - 500))).toBeLessThanOrEqual(60);
  expect(await page.evaluate(() => (window as any).__canvacraftVideo.store.historySize().undo)).toBe(undoBefore + 1);

  // 순서·소리·지우기.
  const bar = page.getByRole('toolbar', { name: '선택한 조각 설정' });
  const moved = after.clips[1].id;
  await bar.getByRole('button', { name: '뒤로 옮기기' }).click();
  expect((await doc(page)).clips[2].id).toBe(moved);
  await bar.getByRole('button', { name: '소리 끄기' }).click();
  expect((await doc(page)).clips[2].muted).toBe(true);
  await page.keyboard.press('Delete');
  expect((await doc(page)).clips.map((clip: any) => clip.id)).not.toContain(moved);
  // 되돌리면 지운 조각이 다시 선택되고 재생 막대가 그 시작으로 간다.
  await page.keyboard.press('Control+z');
  await expect(clipButtons(page).nth(2)).toHaveAttribute('aria-pressed', 'true');
  const restored = await doc(page);
  const start = restored.clips.slice(0, 2).reduce((sum: number, clip: any) => sum + clip.outMs - clip.inMs, 0);
  await expect.poll(() => page.evaluate(() => (window as any).__canvacraftVideo.player.state.timeMs)).toBe(start);
  // 멈춘 상태에서도 재생 막대 위치의 프레임이 미리보기에 그려진다(검은 화면이 아니다).
  const centerPixel = () => page.evaluate(() => { const canvas = document.querySelector('[data-testid=preview]') as HTMLCanvasElement; return [...canvas.getContext('2d')!.getImageData(canvas.width / 2, canvas.height / 4, 1, 1).data].slice(0, 3).reduce((a, b) => a + b, 0); });
  await expect.poll(centerPixel, { timeout: 3000 }).toBeGreaterThan(60);
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'timeline.png') });
});

test('끌어놓기: 영상 파일을 편집 화면에 끌어다 놓으면 넣는다', async ({ page }) => {
  await newVideo(page);
  const base64 = (await fs.readFile(path.join(FIXTURE, 'b.webm'))).toString('base64');
  await page.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    const transfer = new DataTransfer(); transfer.items.add(new File([bytes], '세로.webm', { type: 'video/webm' }));
    const target = document.querySelector('[data-testid=video-stage]')!;
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, base64);
  await expect(status(page)).toContainText('영상을 넣었어요', { timeout: 20000 });
  // 첫 영상이 세로이므로 세로 작품이 된다.
  expect(await doc(page)).toMatchObject({ orientation: 'portrait', fps: 24 });
  await expect(page.getByTestId('video-stage')).toHaveClass(/portrait/);
});
