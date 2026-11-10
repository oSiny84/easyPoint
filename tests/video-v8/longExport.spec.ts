import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { expect, openProbe, runJob, startMemorySampler, test } from '../video-phase2/helpers';
import type { Page } from '@playwright/test';

// V8 측정: 10분(599초) 1080p30 작품을 제품 화면에서 내보내 걸린 시간과 브라우저 메모리를 잰다.
// 원본은 V2 측정 페이지로 한 번 합성해 디스크에 두고 다시 쓴다(잡음 무늬 + 프레임 번호, H.264+AAC MP4).
// 작품: 원본 1개 + 자막 10개·스티커 10개·밈 영상 20개(2개씩 겹침)가 전 구간을 덮고 배경음악. 겹침 요소 상한(60초)이 있어 60초씩 나눴다.
// 측정 기록은 artifacts/video-v8/(Git 제외), 요약은 docs/video-contracts.md §9 V8 행.
const OUT = 'artifacts/video-v8';
const SECONDS = 599; // 영상 길이 상한 600,000ms를 넘지 않도록 1초 줄였다.
const SOURCE = `${OUT}/source-${SECONDS}s.mp4`;

const run = (page: Page, command: unknown) => page.evaluate(command => { const { store } = (window as any).__canvacraftVideo; const p = store.getProject(); return store.dispatch(p.id, p.revision, command); }, command);

async function makeSource(page: Page) {
  if (existsSync(SOURCE)) return { reused: true };
  await fs.mkdir(OUT, { recursive: true });
  await openProbe(page);
  const made = await runJob(page, { kind: 'makeSource', name: 'v8-source.mp4', pair: 'mp4', width: 1920, height: 1080, fps: 30, seconds: SECONDS, hardware: 'no-preference' });
  // OPFS 파일을 내려받기로 꺼낸다(디스크에 있는 File이라 메모리에 통째로 올리지 않는다).
  const waiting = page.waitForEvent('download', { timeout: 600_000 });
  await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('videoprobe');
    const file = await (await dir.getFileHandle('v8-source.mp4')).getFile();
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = 'source.mp4'; document.body.append(a); a.click();
  });
  await (await waiting).saveAs(SOURCE);
  await page.evaluate(async () => { const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('videoprobe'); await dir.removeEntry('v8-source.mp4'); });
  return made;
}

// 내려받은 출력을 파일 선택 경로로 다시 읽어 길이·패킷 수·소리 트랙과 몇 프레임의 원본 번호 판독 대신 밝기만 확인한다.
async function inspect(page: Page, file: string) {
  await page.evaluate(() => { const input = document.createElement('input'); input.type = 'file'; input.id = 'pick'; document.body.append(input); });
  await page.setInputFiles('#pick', file);
  return page.evaluate(async () => {
    const mb = await import('/node_modules/mediabunny/dist/modules/src/index.js' as string);
    const picked = (document.getElementById('pick') as HTMLInputElement).files![0];
    const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(picked) });
    const video = await input.getPrimaryVideoTrack(); const audio = await input.getPrimaryAudioTrack();
    let packets = 0;
    const sink = new mb.EncodedPacketSink(video);
    for (let packet = await sink.getFirstPacket({ metadataOnly: true }); packet; packet = await sink.getNextPacket(packet, { metadataOnly: true })) packets++;
    const result = { mime: await input.getMimeType(), duration: await input.computeDuration(), packets, width: video.displayWidth, height: video.displayHeight, videoCodec: video.codec, audioCodec: audio?.codec ?? null, bytes: picked.size };
    input.dispose(); document.getElementById('pick')!.remove();
    return result;
  });
}

test('10분 작품 제품 내보내기 시간·메모리', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium', '번들 Chromium은 메모리 표본 프로세스 이름이 맞지 않는다(V2 결과 §2).');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const made = await makeSource(page);

  await page.goto('/');
  await page.getByRole('button', { name: '영상 만들기' }).click();
  await page.getByRole('button', { name: '새 작품' }).click();
  const importStarted = Date.now();
  await page.getByTestId('import-video').setInputFiles(SOURCE);
  await expect(page.getByRole('status')).toContainText('영상을 넣었어요', { timeout: 600_000 });
  const importSeconds = (Date.now() - importStarted) / 1000;

  const minute = 60_000, total = SECONDS * 1000;
  for (let start = 0; start < total; start += minute) {
    const durationMs = Math.min(minute, total - start);
    if (durationMs < 1000) break;
    expect(await run(page, { type: 'addCaption', text: `자막 ${start / minute + 1}분 😀`, x: 160, y: 560, width: 960, startMs: start, durationMs, fontId: 'sans-ko', fontSize: 48, bold: true, color: '#FFFFFF', align: 'center', lineHeight: 1.3, backdrop: 'band' })).toMatchObject({ ok: true });
    expect(await run(page, { type: 'addMeme', memeId: 'heart-pop', memeKind: 'sticker', x: 40, y: 40, width: 200, height: 200, startMs: start, durationMs, soundOn: true })).toMatchObject({ ok: true });
    expect(await run(page, { type: 'addMeme', memeId: 'clip-wow', memeKind: 'clip', x: 840, y: 40, width: 400, height: 225, startMs: start, durationMs, soundOn: true })).toMatchObject({ ok: true });
    expect(await run(page, { type: 'addMeme', memeId: 'clip-boing', memeKind: 'clip', x: 840, y: 300, width: 400, height: 225, startMs: start, durationMs, soundOn: true })).toMatchObject({ ok: true });
  }
  expect(await run(page, { type: 'setAudio', musicId: 'music-happy', musicVolume: 0.5 })).toMatchObject({ ok: true });
  const overlays = await page.evaluate(() => (window as any).__canvacraftVideo.store.getProject().overlays.length);

  const sampler = startMemorySampler();
  const started = Date.now();
  const waiting = page.waitForEvent('download', { timeout: 3_000_000 });
  await page.getByRole('button', { name: '내보내기' }).click();
  const download = await waiting;
  const exportSeconds = (Date.now() - started) / 1000;
  const memory = sampler.stop();
  const name = `long-${testInfo.project.name}${download.suggestedFilename().endsWith('.webm') ? '.webm' : '.mp4'}`;
  await download.saveAs(`${OUT}/${name}`);
  const output = await inspect(page, `${OUT}/${name}`);

  const result = { project: testInfo.project.name, browser: page.context().browser()?.version() ?? null, seconds: SECONDS, source: made, importSeconds, overlays, exportSeconds, ratio: exportSeconds / SECONDS, memory, output, errors };
  await fs.writeFile(`${OUT}/long-${testInfo.project.name}.json`, JSON.stringify({ ...result, series: sampler.series() }, null, 2));
  console.log(JSON.stringify(result, null, 2));
  expect(output.packets).toBe(Math.ceil(SECONDS * 30));
  expect(errors).toEqual([]);
});
