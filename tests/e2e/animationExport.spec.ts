import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadAnimationSample } from '../contracts/animationHelpers';
import { sampleAssets } from '../contracts/helpers';

// 애니메이션 MP4 내보내기(애니메이션 계약 §8 출력): 만든 파일을 다시 해독해 계약 §3의 식과 견준다
// (프레임 수·길이·장 전환 프레임·소리 트랙·moov 위치). 진행률·취소·임시 파일·출력 중 편집·없는 음악.
const OUT = 'artifacts/animation';
const status = (page: Page) => page.getByRole('status');
const saveState = (page: Page) => page.getByTestId('save-state');
const doc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__canvacraft.store.getProject())));
const dispatch = (page: Page, command: any) => page.evaluate(command => { const { store } = (window as any).__canvacraft; const p = store.getProject(); return store.dispatch(p.id, p.revision, command); }, command);
const note = (page: Page) => page.getByTestId('export-note');

async function openSample(page: Page, edit: (project: any) => any = project => project) {
  const project = edit(loadAnimationSample()); const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format: 'canvaanimation', schemaVersion: 1 }));
  zip.file('project.json', JSON.stringify(project));
  for (const asset of project.assetManifest) zip.file(`assets/${asset.id}.${asset.mime === 'image/png' ? 'png' : 'jpg'}`, sampleAssets().get(asset.id)!);
  await page.goto('/');
  await page.getByRole('button', { name: '애니메이션 만들기' }).click();
  await page.getByTestId('open-animation-file').setInputFiles({ name: '공.canvaanim', mimeType: 'application/zip', buffer: Buffer.from(await zip.generateAsync({ type: 'uint8array' })) });
  await expect(status(page)).toContainText('새 작품으로 열었어요');
  await expect(saveState(page)).toHaveText('저장됨', { timeout: 5000 });
}
async function openDownload(page: Page) {
  await page.getByRole('button', { name: '공유' }).click();
  await page.getByRole('menuitem', { name: '다운로드' }).click();
  // 영상이 형식 목록의 맨 위이고 처음부터 골라져 있다.
  await expect(page.getByRole('radio').first()).toBeChecked();
  await expect(page.getByRole('radio', { name: '영상 (MP4)' })).toBeChecked();
}
async function exportVideo(page: Page, name: string) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '내려받기', exact: true }).click();
  const download = await waiting;
  await fs.mkdir(OUT, { recursive: true });
  const saved = path.join(OUT, name); await download.saveAs(saved);
  return { saved, filename: download.suggestedFilename() };
}

// 내려받은 파일을 페이지에서 Mediabunny로 해독한다: 패킷 수, 길이, 지정한 프레임의 왼쪽 위 색, 처음 1초 소리의 크기.
async function inspect(page: Page, file: string, frames: number[]) {
  const base64 = (await fs.readFile(file)).toString('base64');
  return page.evaluate(async ({ base64, frames }) => {
    const mb = await import('/node_modules/mediabunny/dist/modules/src/index.js' as string);
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BufferSource(bytes) });
    const video = await input.getPrimaryVideoTrack(); const audio = await input.getPrimaryAudioTrack();
    let packets = 0;
    const packetSink = new mb.EncodedPacketSink(video);
    for (let packet = await packetSink.getFirstPacket({ metadataOnly: true }); packet; packet = await packetSink.getNextPacket(packet, { metadataOnly: true })) packets++;
    const canvas = new OffscreenCanvas(video.displayWidth, video.displayHeight); const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const sink = new mb.VideoSampleSink(video); const colors: number[][] = [];
    for (const k of frames) {
      // 프레임 경계 반올림을 피해 반 프레임 뒤를 묻는다.
      const sample = await sink.getSample((k + 0.5) / 24);
      sample.draw(ctx, 0, 0); sample.close();
      colors.push([...ctx.getImageData(30, 30, 1, 1).data.slice(0, 3)]);
    }
    let sum = 0, count = 0;
    if (audio) for await (const sample of new mb.AudioSampleSink(audio).samples(0, 1)) {
      const data = new Float32Array(sample.numberOfFrames); sample.copyTo(data, { planeIndex: 0, format: 'f32-planar' });
      for (const value of data) { sum += value * value; count++; }
      sample.close();
    }
    // 눈으로 볼 그림: 마지막으로 그린 프레임을 PNG로 돌려준다.
    const picture = await canvas.convertToBlob({ type: 'image/png' });
    const shot = btoa(Array.from(new Uint8Array(await picture.arrayBuffer()), byte => String.fromCharCode(byte)).join(''));
    const result = { mime: await input.getMimeType(), duration: await input.computeDuration(), packets, width: video.displayWidth, height: video.displayHeight, audioCodec: audio?.codec ?? null, audioRms: Math.sqrt(sum / Math.max(1, count)), colors, shot };
    input.dispose();
    return result;
  }, { base64, frames });
}
// 출력과 같은 그리기로 각 장을 그려 같은 자리의 색을 얻는다(기준값).
const slideColors = (page: Page) => page.evaluate(async () => {
  const { renderSlide } = await import('/src/rendering/renderSlide.ts' as string);
  const { store, assets } = (window as any).__canvacraft; const out: number[][] = [];
  for (const slide of store.getProject().slides) {
    const rendered = await renderSlide(slide, assets.resolve, 1.5);
    out.push([...rendered.canvas.getContext('2d').getImageData(30, 30, 1, 1).data.slice(0, 3)]);
  }
  return out;
});
const distance = (a: number[], b: number[]) => Math.max(...a.map((value, index) => Math.abs(value - b[index])));
async function topBoxes(file: string) {
  const bytes = await fs.readFile(file); const boxes: string[] = [];
  for (let at = 0; at + 8 <= bytes.length && boxes.length < 6;) {
    let size = bytes.readUInt32BE(at); const type = bytes.subarray(at + 4, at + 8).toString('latin1');
    if (size === 1) size = Number(bytes.readBigUInt64BE(at + 8));
    boxes.push(type); if (size < 8) break; at += size;
  }
  return boxes;
}
const tempFiles = (page: Page) => page.evaluate(async () => {
  const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('canvacraft-animation', { create: true });
  const names: string[] = []; for await (const [name] of (await root.getDirectoryHandle('tmp', { create: true }) as any).entries()) names.push(name);
  return names;
});

test('내보내기: MP4를 만들고, 다시 해독하면 프레임 수·길이·장 전환이 계약의 식과 같다', async ({ page }) => {
  // 초당 6장, 둘째 장은 길게(2배): 4·8·4·4프레임 = 20프레임 = 0.833초.
  await openSample(page);
  const before = await doc(page);
  const expected = await slideColors(page);
  // 네 장의 기준 색이 서로 구분된다(코덱 오차보다 크게 다르다).
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) expect(distance(expected[a], expected[b])).toBeGreaterThan(15);

  await openDownload(page);
  const { saved, filename } = await exportVideo(page, 'export.mp4');
  expect(filename).toBe('우리 가족 소개.mp4');
  await expect(note(page)).toContainText('영상을 내려받았어요. MP4 · 0:01 · ');
  await expect(note(page)).toContainText('보호자 계정으로 YouTube에 올릴 수 있어요');

  // 장 i가 보이는 프레임: [0,4) [4,12) [12,16) [16,20). 각 장의 첫 프레임과 마지막 프레임을 본다.
  const frames = [0, 3, 4, 11, 12, 15, 16, 19], slideOf = [0, 0, 1, 1, 2, 2, 3, 3];
  const result = await inspect(page, saved, frames);
  expect(result.mime).toContain('video/mp4');
  expect(result).toMatchObject({ packets: 20, width: 1920, height: 1080, audioCodec: 'aac' });
  expect(Math.abs(result.duration - 20 / 24)).toBeLessThan(0.05);
  result.colors.forEach((color, at) => {
    const nearest = expected.map((candidate, index) => ({ index, gap: distance(color, candidate) })).sort((a, b) => a.gap - b.gap)[0];
    expect(nearest, `프레임 ${frames[at]}`).toMatchObject({ index: slideOf[at] });
    expect(nearest.gap, `프레임 ${frames[at]}의 색 차이`).toBeLessThan(12);
  });
  // 눈으로 확인할 그림: 둘째 장의 마지막 프레임(11번)을 다시 해독해 남긴다.
  await fs.writeFile(path.join(OUT, 'export-frame-11.png'), Buffer.from((await inspect(page, saved, [11])).shot, 'base64'));
  // 음악이 없어도 무음 소리 트랙이 있다.
  expect(result.audioRms).toBe(0);
  // moov가 mdat 앞에 있다(YouTube 권장).
  const boxes = await topBoxes(saved);
  expect(boxes.indexOf('moov')).toBeGreaterThan(-1); expect(boxes.indexOf('moov')).toBeLessThan(boxes.indexOf('mdat'));
  // 내보내기는 문서를 바꾸지 않는다.
  expect(await doc(page)).toEqual(before);
});

test('내보내기: 배경음악을 고르면 소리가 들어가고, 빠르기를 바꾸면 길이가 바뀐다', async ({ page }) => {
  const manifest = JSON.parse(await fs.readFile('public/sounds/manifest.json', 'utf8'));
  const song = manifest.music.find((item: any) => !item.hidden);
  await openSample(page);
  expect(await dispatch(page, { type: 'setAnimation', musicId: song.id, musicVolume: 1, fps: 2 })).toMatchObject({ ok: true });
  await openDownload(page);
  const { saved } = await exportVideo(page, 'export-music.mp4');
  // 초당 2장: 12·24·12·12프레임 = 60프레임 = 2.5초.
  const result = await inspect(page, saved, [0, 11, 12, 35, 36, 59]);
  expect(result.packets).toBe(60);
  expect(Math.abs(result.duration - 2.5)).toBeLessThan(0.05);
  expect(result.audioRms).toBeGreaterThan(0.01);
  await expect(note(page)).toContainText('MP4 · 0:03 · ');
});

test('내보내기: 진행률을 보여 주고, 멈추면 파일을 내리지 않고 임시 파일도 남기지 않으며, 다시 받을 수 있다', async ({ page }) => {
  await openSample(page);
  // 장마다 잠깐 멈추게 해 도중에 멈출 수 있게 한다.
  await page.evaluate(() => { const original = window.createImageBitmap.bind(window); (window as any).createImageBitmap = (...args: any[]) => new Promise(resolve => setTimeout(resolve, 150)).then(() => (original as any)(...args)); });
  const downloads: string[] = []; page.on('download', item => downloads.push(item.suggestedFilename()));
  await openDownload(page);
  await page.getByRole('button', { name: '내려받기', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: '파일 만드는 중' })).toBeVisible();
  await expect(page.locator('.export-progress')).toContainText('/ 4장');
  await expect(page.getByRole('button', { name: '재생', exact: true })).toBeDisabled();
  await expect(page.locator('.export-progress')).toContainText('1 / 4장', { timeout: 10000 });
  await page.getByRole('button', { name: '취소' }).click();
  await expect(note(page)).toContainText('멈췄어요');
  await page.waitForTimeout(600);
  expect(downloads).toEqual([]);
  expect(await tempFiles(page)).toEqual([]);
  await expect(page.getByRole('button', { name: '재생', exact: true })).toBeEnabled();

  // 같은 창에서 다시 받는다.
  const { saved } = await exportVideo(page, 'export-retry.mp4');
  expect((await inspect(page, saved, [0])).packets).toBe(20);
  await expect(note(page)).toContainText('영상을 내려받았어요');
  // 내려준 파일은 임시 폴더에 하나만 남고, 다음 내보내기를 시작할 때 지워진다.
  expect(await tempFiles(page)).toHaveLength(1);
});

test('내보내기: 만드는 동안 고친 내용은 파일에 섞이지 않는다', async ({ page }) => {
  await openSample(page);
  await page.evaluate(() => { const original = window.createImageBitmap.bind(window); (window as any).createImageBitmap = (...args: any[]) => new Promise(resolve => setTimeout(resolve, 150)).then(() => (original as any)(...args)); });
  await openDownload(page);
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '내려받기', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: '파일 만드는 중' })).toBeVisible();
  // 만드는 중에 이름을 바꾸고 마지막 장을 지운다.
  const project = await doc(page);
  expect(await dispatch(page, { type: 'renameProject', title: '바뀐 이름' })).toMatchObject({ ok: true });
  expect(await dispatch(page, { type: 'deleteSlide', slideId: project.slides[3].id })).toMatchObject({ ok: true });
  const download = await waiting;
  expect(download.suggestedFilename()).toBe('우리 가족 소개.mp4');
  await fs.mkdir(OUT, { recursive: true });
  const saved = path.join(OUT, 'export-snapshot.mp4'); await download.saveAs(saved);
  // 스냅숏의 네 장(20프레임)이 모두 들어 있다.
  expect((await inspect(page, saved, [0])).packets).toBe(20);
  expect((await doc(page)).slides).toHaveLength(3);
});

test('내보내기: 목록에 없는 음악을 쓰는 작품은 소리 없는 파일을 내지 않고 다시 고르게 안내한다', async ({ page }) => {
  await openSample(page, project => ({ ...project, musicId: 'gone-song' }));
  const downloads: string[] = []; page.on('download', item => downloads.push(item.suggestedFilename()));
  await openDownload(page);
  await page.getByRole('button', { name: '내려받기', exact: true }).click();
  await expect(note(page)).toContainText('배경음악을 불러오지 못했어요');
  await page.waitForTimeout(300);
  expect(downloads).toEqual([]);
  expect(await tempFiles(page)).toEqual([]);
  // PDF는 음악과 관계없이 내려받을 수 있다(장마다 한 쪽).
  await page.getByRole('radio', { name: 'PDF' }).check();
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '내려받기', exact: true }).click();
  expect((await waiting).suggestedFilename()).toBe('우리 가족 소개.pdf');
});
