import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

// 조각 빠르기(계약 §2 Clip.speed, §3 작품 시각, §8 소리): 화면에서 고르면 명령 하나, 미리보기 <video>의 재생 속도·높이,
// 출력 파일에서 프레임이 원본의 speed배 시각을 보여 주고 소리 높이가 speed배가 되는지 확인한다.
const FIXTURE = 'tests/fixtures/video';
const OUT = 'artifacts/video-speed';
const status = (page: Page) => page.getByRole('status');
const doc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__canvacraftVideo.store.getProject())));

async function videoWithClips(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '영상 만들기' }).click();
  await page.getByRole('button', { name: '새 작품' }).click();
  const file = async (name: string) => ({ name, mimeType: 'video/webm', buffer: await fs.readFile(path.join(FIXTURE, name)) });
  await page.getByTestId('import-video').setInputFiles([await file('a.webm'), await file('b.webm')]);
  await expect(status(page)).toContainText('영상 2개를 넣었어요', { timeout: 20000 });
}

async function chooseSpeed(page: Page, label: string) {
  await page.getByRole('button', { name: /^영상 1 조각/ }).click();
  await page.getByRole('combobox', { name: '조각 빠르기' }).selectOption({ label });
}

test('빠르기 고르기: 명령 하나로 바뀌고, 타임라인 길이·표시가 바뀌며, 미리보기는 그 빠르기로 소리 높이까지 바꿔 재생한다', async ({ page }) => {
  await videoWithClips(page);
  const before = await doc(page);
  await chooseSpeed(page, '빠르게 2배');
  const after = await doc(page);
  expect(after.clips[0].speed).toBe(2);
  expect(after.revision).toBe(before.revision + 1);
  await expect(page.getByTestId('timeline-total')).toHaveText('0:03'); // 2초 → 1초 + 1.5초
  await expect(page.getByRole('button', { name: /^영상 1 조각/ })).toContainText('2배');

  // 처음부터 재생하면 첫 조각의 <video>가 2배로, 높이 보정 없이 돈다.
  await page.evaluate(() => (window as any).__canvacraftVideo.player.seek(0));
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as any).__canvacraftVideo.player.play());
  await page.waitForTimeout(300);
  const playing = await page.evaluate(() => { const p = (window as any).__canvacraftVideo.player; const v = p.slots[p.active].video as HTMLVideoElement; return { rate: v.playbackRate, pitch: (v as any).preservesPitch, time: v.currentTime, work: p.state.timeMs }; });
  expect(playing.rate).toBe(2);
  expect(playing.pitch).toBe(false);
  // 원본 시각은 작품 시각의 2배 근처다(미리보기 허용 오차 안).
  expect(Math.abs(playing.time * 1000 - playing.work * 2)).toBeLessThan(300);
  // 다음 조각(1배)으로 넘어가면 1배로 돌아온다.
  await page.waitForTimeout(1200);
  const second = await page.evaluate(() => { const p = (window as any).__canvacraftVideo.player; const v = p.slots[p.active].video as HTMLVideoElement; return { rate: v.playbackRate, work: p.state.timeMs }; });
  expect(second.work).toBeGreaterThan(1000);
  expect(second.rate).toBe(1);
  await page.evaluate(() => (window as any).__canvacraftVideo.player.pause());

  // 되돌리기 한 번에 1배로(speed 없음) 돌아온다.
  await page.keyboard.press('Control+z');
  expect((await doc(page)).clips[0]).not.toHaveProperty('speed');
  await expect(page.getByTestId('timeline-total')).toHaveText('0:04');
});

test('빠르기 출력: 2배 조각의 프레임은 원본의 2배 시각을 보여 주고, 소리 높이도 2배가 된다', async ({ page }) => {
  await videoWithClips(page);
  await chooseSpeed(page, '빠르게 2배');
  const project = await doc(page);
  const fps = project.fps, total = 1000 + 1500, frames = Math.ceil((total * fps) / 1000);
  const waiting = page.waitForEvent('download', { timeout: 60000 });
  await page.getByRole('button', { name: '내보내기' }).click();
  const download = await waiting;
  await fs.mkdir(OUT, { recursive: true });
  const file = path.join(OUT, 'speed2.mp4'); await download.saveAs(file);
  await page.getByRole('dialog', { name: '내보내기 결과' }).getByRole('button', { name: '닫기' }).click();

  const output = (await fs.readFile(file)).toString('base64');
  const source = (await fs.readFile(path.join(FIXTURE, 'a.webm'))).toString('base64');
  // 출력 프레임 k(작품 시각 t)와 원본 a.webm의 2t·t 시각 프레임을 왼쪽 위 색으로 비교한다(원본 배경색이 프레임마다 3°씩 바뀐다).
  const result = await page.evaluate(async ({ output, source, fps }) => {
    const mb = await import('/node_modules/mediabunny/dist/modules/src/index.js' as string);
    const open = (base64: string) => new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BufferSource(Uint8Array.from(atob(base64), c => c.charCodeAt(0))) });
    const color = async (input: any, seconds: number) => {
      const track = await input.getPrimaryVideoTrack(); const sink = new mb.VideoSampleSink(track);
      const canvas = new OffscreenCanvas(track.displayWidth, track.displayHeight); const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const sample = await sink.getSample(seconds); sample.draw(ctx, 0, 0); sample.close();
      const x = Math.round(track.displayWidth * 0.05), y = Math.round(track.displayHeight * 0.05);
      return Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
    };
    const out = open(output), src = open(source);
    const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const rows = [];
    for (const k of [6, 15, 24]) {
      const t = (Math.floor((k * 1_000_000) / fps) + 500_000 / fps) / 1_000_000;
      const shown = await color(out, t);
      rows.push({ k, toDouble: distance(shown, await color(src, 2 * t)), toSame: distance(shown, await color(src, t)) });
    }
    // 소리: 원본은 440Hz 사인파. 2배 조각(작품 0~1초) 가운데 0.2~0.8초의 영점 교차 수로 높이를 잰다.
    const audio = await out.getPrimaryAudioTrack();
    let crossings = 0, previous = 0, frames = 0;
    for await (const sample of new mb.AudioSampleSink(audio).samples(0.2, 0.8)) {
      const data = new Float32Array(sample.numberOfFrames); sample.copyTo(data, { planeIndex: 0, format: 'f32-planar' });
      const skip = Math.max(0, Math.round((0.2 - sample.timestamp) * sample.sampleRate));
      for (let i = skip; i < data.length && frames < 0.6 * sample.sampleRate; i++, frames++) { if ((previous < 0) !== (data[i] < 0)) crossings++; previous = data[i]; }
      sample.close();
    }
    const packets = await (async () => { const sink = new mb.EncodedPacketSink(await out.getPrimaryVideoTrack()); let n = 0; for (let p = await sink.getFirstPacket({ metadataOnly: true }); p; p = await sink.getNextPacket(p, { metadataOnly: true })) n++; return n; })();
    return { rows, hz: crossings / 2 / 0.6, packets, duration: await out.computeDuration() };
  }, { output, source, fps });
  console.log(JSON.stringify(result));
  expect(result.packets).toBe(frames);
  expect(Math.abs(result.duration - total / 1000)).toBeLessThan(0.05);
  for (const row of result.rows) expect(row.toDouble).toBeLessThan(row.toSame);
  // 440Hz × 2 = 880Hz(인코딩 오차를 넉넉히 둔다).
  expect(result.hz).toBeGreaterThan(800);
  expect(result.hz).toBeLessThan(960);
});
