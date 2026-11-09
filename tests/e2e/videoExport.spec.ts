import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

// 영상 V7 내보내기: 만든 파일을 다시 해독해 계약 §3의 식과 비교한다(프레임 수·길이·소리 트랙·moov 위치,
// 자막·밈이 보이기 시작·끝나는 프레임, 소리가 실제로 들어 있는지). 진행률·취소·다시 내보내기, 결과 창 문구.
const FIXTURE = 'tests/fixtures/video';
const OUT = 'artifacts/video-v7';
const status = (page: Page) => page.getByRole('status');
const run = (page: Page, command: any) => page.evaluate(command => { const { store } = (window as any).__canvacraftVideo; const p = store.getProject(); return store.dispatch(p.id, p.revision, command); }, command);
const doc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__canvacraftVideo.store.getProject())));

async function videoWithClips(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '영상 만들기' }).click();
  await page.getByRole('button', { name: '새 작품' }).click();
  const file = async (name: string) => ({ name, mimeType: 'video/webm', buffer: await fs.readFile(path.join(FIXTURE, name)) });
  await page.getByTestId('import-video').setInputFiles([await file('a.webm'), await file('b.webm')]);
  await expect(status(page)).toContainText('영상 2개를 넣었어요', { timeout: 20000 });
}

// 내려받은 파일을 페이지에서 Mediabunny로 해독해 필요한 값만 돌려준다.
async function inspect(page: Page, file: string, frames: { k: number; x: number; y: number }[], fps: number) {
  const base64 = (await fs.readFile(file)).toString('base64');
  return page.evaluate(async ({ base64, frames, fps }) => {
    const mb = await import('/node_modules/mediabunny/dist/modules/src/index.js' as string);
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BufferSource(bytes) });
    const video = await input.getPrimaryVideoTrack(); const audio = await input.getPrimaryAudioTrack();
    let packets = 0;
    const packetSink = new mb.EncodedPacketSink(video);
    for (let packet = await packetSink.getFirstPacket({ metadataOnly: true }); packet; packet = await packetSink.getNextPacket(packet, { metadataOnly: true })) packets++;
    const canvas = new OffscreenCanvas(video.displayWidth, video.displayHeight); const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const sink = new mb.VideoSampleSink(video);
    const pixels: number[] = [];
    for (const { k, x, y } of frames) {
      // 프레임 경계 반올림을 피해 반 프레임 뒤를 묻는다.
      const sample = await sink.getSample((Math.floor((k * 1_000_000) / fps) + 500_000 / fps) / 1_000_000);
      sample.draw(ctx, 0, 0); sample.close();
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data; pixels.push(r + g + b);
    }
    // 소리: 처음 1초의 RMS.
    let sum = 0, count = 0;
    for await (const sample of new mb.AudioSampleSink(audio).samples(0, 1)) {
      const data = new Float32Array(sample.numberOfFrames); sample.copyTo(data, { planeIndex: 0, format: 'f32-planar' });
      for (const value of data) { sum += value * value; count++; }
      sample.close();
    }
    const result = { mime: await input.getMimeType(), duration: await input.computeDuration(), packets, width: video.displayWidth, height: video.displayHeight, audioCodec: audio?.codec ?? null, audioRms: Math.sqrt(sum / Math.max(1, count)), pixels };
    input.dispose();
    return result;
  }, { base64, frames, fps });
}

async function topBoxes(file: string) {
  const bytes = await fs.readFile(file); const boxes: string[] = [];
  for (let at = 0; at + 8 <= bytes.length && boxes.length < 6;) {
    let size = bytes.readUInt32BE(at); const type = bytes.subarray(at + 4, at + 8).toString('latin1');
    if (size === 1) size = Number(bytes.readBigUInt64BE(at + 8));
    boxes.push(type); if (size < 8) break; at += size;
  }
  return boxes;
}

test('내보내기: MP4를 만들고, 다시 해독하면 프레임 수·길이·소리와 자막·밈이 보이는 프레임이 계약과 같다', async ({ page }) => {
  await videoWithClips(page);
  // 자막 1.0~2.0초, 밈 영상(노란 배경) 2.0~3.0초, 스티커, 배경음악.
  expect(await run(page, { type: 'addCaption', text: '자막 시험', x: 160, y: 540, width: 960, startMs: 1000, durationMs: 1000, fontId: 'sans-ko', fontSize: 48, bold: true, color: '#FFFFFF', align: 'center', lineHeight: 1.3, backdrop: 'band' })).toMatchObject({ ok: true });
  expect(await run(page, { type: 'addMeme', memeId: 'clip-wow', memeKind: 'clip', x: 800, y: 60, width: 400, height: 225, startMs: 2000, durationMs: 1000, soundOn: true })).toMatchObject({ ok: true });
  expect(await run(page, { type: 'addMeme', memeId: 'heart-pop', memeKind: 'sticker', x: 40, y: 40, width: 200, height: 200, startMs: 0, durationMs: 3000, soundOn: true })).toMatchObject({ ok: true });
  expect(await run(page, { type: 'setAudio', musicId: 'music-happy', musicVolume: 1 })).toMatchObject({ ok: true });
  const project = await doc(page);
  const total = project.clips.reduce((sum: number, clip: any) => sum + clip.outMs - clip.inMs, 0);
  const fps = project.fps, frames = Math.ceil((total * fps) / 1000);

  const waiting = page.waitForEvent('download', { timeout: 60000 });
  await page.getByRole('button', { name: '내보내기' }).click();
  const download = await waiting;
  expect(download.suggestedFilename()).toBe('내 영상.mp4');
  await fs.mkdir(OUT, { recursive: true });
  const file = path.join(OUT, 'export.mp4'); await download.saveAs(file);
  const result = page.getByRole('dialog', { name: '내보내기 결과' });
  await expect(result.getByTestId('export-result')).toContainText('MP4 파일');
  await expect(result).toContainText('보호자 계정');
  await page.screenshot({ path: path.join(OUT, 'result.png') });
  await result.getByRole('button', { name: '닫기' }).click();

  // 프레임 k의 시각은 ⌊k×10⁶/fps⌋µs, 겹침 요소는 startMs ≤ t < 끝(계약 §3).
  const first = (ms: number) => Math.ceil((ms * fps) / 1000);
  const band = { x: Math.round((160 + 480) * 1.5), y: Math.round((540 - 4) * 1.5) };
  const meme = { x: Math.round((800 + 200) * 1.5), y: Math.round((60 + 20) * 1.5) };
  const checks = [
    { k: first(1000) - 1, ...band }, { k: first(1000), ...band }, { k: first(2000) - 1, ...band }, { k: first(2000), ...band },
    { k: first(2000) - 1, ...meme }, { k: first(2000), ...meme }, { k: first(3000) - 1, ...meme }, { k: first(3000), ...meme },
  ];
  const info = await inspect(page, file, checks, fps);
  console.log(JSON.stringify({ ...info, frames, total }));
  expect(info.mime).toContain('video/mp4');
  expect(info.packets).toBe(frames);
  expect(Math.abs(info.duration - total / 1000)).toBeLessThan(0.05);
  expect([info.width, info.height]).toEqual([1920, 1080]);
  expect(info.audioCodec).toBe('aac');
  expect(info.audioRms).toBeGreaterThan(0.02);
  const [beforeCaption, captionOn, captionLast, captionOff, beforeMeme, memeOn, memeLast, memeOff] = info.pixels;
  // 반투명 띠는 영상을 어둡게, 노란 밈 영상은 밝게 만든다.
  expect(captionOn).toBeLessThan(beforeCaption * 0.8);
  expect(captionLast).toBeLessThan(captionOff * 0.8);
  expect(memeOn).toBeGreaterThan(beforeMeme * 1.2);
  expect(memeLast).toBeGreaterThan(memeOff * 1.2);
  // YouTube 권장: moov가 mdat보다 앞(편집 목록 없음).
  const boxes = await topBoxes(file);
  expect(boxes.indexOf('moov')).toBeLessThan(boxes.indexOf('mdat'));
  // 출력 중에 고친 내용은 파일에 섞이지 않는다(스냅숏). 문서는 그대로다.
  expect((await doc(page)).revision).toBe(project.revision);
});

test('내보내기 취소: 멈추면 파일을 내려주지 않고, 다시 내보낼 수 있으며, 출력 중 편집은 파일에 섞이지 않는다', async ({ page }) => {
  await videoWithClips(page);
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: '영상 1 다시 넣기' }).click();
  let downloads = 0; page.on('download', () => { downloads++; });
  await page.getByRole('button', { name: '내보내기' }).click();
  const dialog = page.getByRole('dialog', { name: '내보내기' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '멈추기' }).click();
  await expect(status(page)).toContainText('멈췄어요', { timeout: 30000 });
  expect(downloads).toBe(0);
  // 남은 임시 파일이 없다.
  const temp = () => page.evaluate(async () => { const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('canvacraft-video'); const names: string[] = []; for await (const [name] of (await root.getDirectoryHandle('tmp') as any).entries()) names.push(name); return names; });
  expect((await temp()).filter(name => name.startsWith('export-'))).toEqual([]);
  // 다시 내보내기: 진행 중에 이름을 바꿔도 파일 이름은 시작할 때의 제목이다.
  const waiting = page.waitForEvent('download', { timeout: 120000 });
  await page.getByRole('button', { name: '내보내기' }).click();
  await run(page, { type: 'renameProject', title: '나중 제목' });
  const download = await waiting;
  expect(download.suggestedFilename()).toBe('내 영상.mp4');
});
