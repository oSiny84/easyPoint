// 애니메이션 A2 기술 시험 페이지. 제품 코드가 아니다. 자동 시험(tests/animation-phase2)이 window.animProbe를 부른다.
// 재는 것: 제품의 renderSlide로 장을 그리는 시간(출력 1.5배·양파 껍질 1배·재생 0.5배), 그림을 Worker에 넘겨 인코딩하는 전체 시간과 파일 크기,
// 출력 파일을 다시 해독한 프레임 수·길이·장 전환 프레임.
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/700.css';
import '@fontsource/jua/400.css';
import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input, VideoSampleSink } from 'mediabunny';
import type { Slide, SlideElement } from '../domain/types';
import { renderSlide } from '../rendering/renderSlide';
import { OUTPUT_FPS, type Container, type FromWorker, type Mode, type ToWorker } from './protocol';

export type DocKind = 'drawing' | 'photo';
const hex = (value: number) => value.toString(16).padStart(2, '0');
const fakeId = (n: number) => n.toString(16).padStart(64, '0');
// 고정 씨앗 난수: 매번 같은 문서가 나온다.
function random(seed: number) { let state = seed; return () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff; }; }

const blobs = new Map<string, Blob>();
const resolve = async (id: string) => blobs.get(id);

// 카메라 사진처럼 압축이 쉽지 않은 그림(색 띠 + 도형 + 잡음). 해독 시간이 실제 사진과 비슷하도록 한다.
async function makePhoto(id: string, width: number, height: number, seed: number) {
  if (blobs.has(id)) return;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!; const next = random(seed);
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsl(${Math.round(next() * 360)} 70% 60%)`); gradient.addColorStop(1, `hsl(${Math.round(next() * 360)} 70% 40%)`);
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 300; i++) { ctx.fillStyle = `hsla(${Math.round(next() * 360)} 80% 50% / 0.5)`; ctx.beginPath(); ctx.arc(next() * width, next() * height, 20 + next() * 160, 0, Math.PI * 2); ctx.fill(); }
  const tile = document.createElement('canvas'); tile.width = tile.height = 256;
  const tileCtx = tile.getContext('2d')!; const data = tileCtx.createImageData(256, 256);
  for (let i = 0; i < data.data.length; i += 4) { const v = Math.floor(next() * 255); data.data[i] = v; data.data[i + 1] = v; data.data[i + 2] = v; data.data[i + 3] = 40; }
  tileCtx.putImageData(data, 0, 0);
  ctx.fillStyle = ctx.createPattern(tile, 'repeat')!; ctx.fillRect(0, 0, width, height);
  blobs.set(id, await new Promise<Blob>(done => canvas.toBlob(blob => done(blob!), 'image/jpeg', 0.9)));
  canvas.width = canvas.height = 0;
}

// 투명 배경의 작은 그림(내장 스티커 크기).
async function makeSticker(id: string, seed: number) {
  if (blobs.has(id)) return;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 400;
  const ctx = canvas.getContext('2d')!; const next = random(seed);
  ctx.fillStyle = `hsl(${Math.round(next() * 360)} 80% 60%)`; ctx.beginPath(); ctx.arc(200, 200, 180, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(140, 160, 22, 0, Math.PI * 2); ctx.arc(260, 160, 22, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(200, 220, 90, 0.2, Math.PI - 0.2); ctx.stroke();
  blobs.set(id, await new Promise<Blob>(done => canvas.toBlob(blob => done(blob!), 'image/png')));
}

// 장 i의 배경색. 왼쪽 위 구석은 요소가 덮지 않으므로 출력 프레임에서 이 색으로 장을 구분한다.
// 이웃한 장이 한 채널에서 30 이상 다르게 해 코덱 오차와 섞이지 않게 한다. index = r단계 + 8 × g단계 + 64 × b단계.
export const markerColor = (index: number) => ({ r: 20 + (index % 8) * 30, g: 20 + (Math.floor(index / 8) % 8) * 30, b: 60 + Math.floor(index / 64) * 100 });
export const markerIndex = (color: { r: number; g: number; b: number }) => Math.round((color.r - 20) / 30) + 8 * Math.round((color.g - 20) / 30) + 64 * Math.round((color.b - 60) / 100);

async function buildDocument(kind: DocKind, count: number): Promise<Slide[]> {
  const slides: Slide[] = [];
  if (kind === 'drawing') { await makeSticker(fakeId(1), 11); await makeSticker(fakeId(2), 22); }
  else {
    for (let i = 0; i < 3; i++) await makePhoto(fakeId(100 + i), 2560, 1440, 1000 + i);
    for (let i = 0; i < 6; i++) await makePhoto(fakeId(200 + i), 2560, 1920, 2000 + i);
  }
  for (let index = 0; index < count; index++) {
    const next = random(777 + index); const elements: SlideElement[] = []; let id = 0;
    const newId = () => `${index}-${id++}`;
    if (kind === 'drawing') {
      // 손그림 30획 × 100점. 왼쪽 위 150px 안으로는 들어가지 않는다.
      for (let stroke = 0; stroke < 30; stroke++) {
        const points: number[] = []; let x = 0, y = 0;
        for (let p = 0; p < 100; p++) { x = Math.max(0, Math.min(700, x + (next() - 0.4) * 24)); y = Math.max(0, Math.min(400, y + (next() - 0.4) * 16)); points.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10); }
        elements.push({ id: newId(), type: 'stroke', x: 160 + next() * 300 + index, y: 160 + next() * 120, points, color: `#${hex(Math.floor(next() * 200))}${hex(Math.floor(next() * 200))}${hex(Math.floor(next() * 200))}`, strokeWidth: 4 + Math.floor(next() * 8) });
      }
      elements.push({ id: newId(), type: 'image', x: 200 + index * 8, y: 420, width: 200, height: 200, assetId: fakeId(1) });
      elements.push({ id: newId(), type: 'image', x: 1000 - index * 6, y: 200, width: 160, height: 160, assetId: fakeId(2) });
      elements.push({ id: newId(), type: 'text', x: 240, y: 40, width: 800, text: `안녕하세요! 움직이는 그림 ${index + 1}번째 장`, fontId: 'sans-ko', fontSize: 48, bold: true, color: '#FFFFFF', align: 'center', lineHeight: 1.3 });
      elements.push({ id: newId(), type: 'text', x: 240, y: 640, width: 800, text: '공이 통통 튀어요 🙂', fontId: 'round-jua', fontSize: 36, bold: false, color: '#222222', align: 'center', lineHeight: 1.3 });
      const marker = markerColor(index);
      slides.push({ id: `slide-${index}`, background: { kind: 'solid', color: `#${hex(marker.r)}${hex(marker.g)}${hex(marker.b)}`.toUpperCase() }, elements });
    } else {
      // 사진 배경 + 사진 3장 + 글씨(통합 시험 보고서의 "사진 3장" 문서와 같은 구성).
      for (let photo = 0; photo < 3; photo++) elements.push({ id: newId(), type: 'image', x: 80 + photo * 400 + index, y: 180 + photo * 20, width: 360, height: 270, assetId: fakeId(200 + ((index + photo) % 6)) });
      elements.push({ id: newId(), type: 'text', x: 240, y: 560, width: 800, text: `우리 가족 여행 ${index + 1}`, fontId: 'sans-ko', fontSize: 56, bold: true, color: '#FFFFFF', align: 'center', lineHeight: 1.3 });
      slides.push({ id: `slide-${index}`, background: { kind: 'image', assetId: fakeId(100 + (index % 3)), fit: 'center-cover' }, elements });
    }
  }
  return slides;
}

const stats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b); const sum = values.reduce((total, value) => total + value, 0);
  const round = (value: number) => Math.round(value * 10) / 10;
  return { count: values.length, sumMs: round(sum), meanMs: round(sum / values.length), p50Ms: round(sorted[Math.floor(sorted.length * 0.5)]), p95Ms: round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]), maxMs: round(sorted[sorted.length - 1]) };
};

async function renderToBitmap(slide: Slide, scale: number) {
  const started = performance.now();
  const rendered = await renderSlide(slide, resolve, scale);
  if (!rendered.ok) throw new Error(rendered.message);
  const drawn = performance.now();
  const bitmap = await createImageBitmap(rendered.canvas);
  rendered.canvas.width = rendered.canvas.height = 0;
  return { bitmap, renderMs: drawn - started, bitmapMs: performance.now() - drawn };
}

// 장마다 renderSlide → ImageBitmap을 만드는 시간. keep이면 재생 캐시처럼 그림을 쥐고 있는다.
async function renderTimes(kind: DocKind, count: number, scale: number, keep = false) {
  const slides = await buildDocument(kind, count);
  await renderToBitmap(slides[0], scale).then(first => first.bitmap.close()); // 글꼴·사진 해독기 준비는 재지 않는다.
  const render: number[] = [], bitmap: number[] = []; const kept: ImageBitmap[] = [];
  for (const slide of slides) {
    const result = await renderToBitmap(slide, scale);
    render.push(result.renderMs); bitmap.push(result.bitmapMs);
    if (keep) kept.push(result.bitmap); else result.bitmap.close();
  }
  const held = kept.length; (window as unknown as { keptBitmaps?: ImageBitmap[] }).keptBitmaps = kept;
  return { kind, scale, render: stats(render), bitmap: stats(bitmap), held };
}
function releaseKept() { const holder = window as unknown as { keptBitmaps?: ImageBitmap[] }; holder.keptBitmaps?.forEach(bitmap => bitmap.close()); holder.keptBitmaps = []; }

export type ExportJob = { kind: DocKind; count: number; fps: number; hold: number; container: Container; mode: Mode; file: string };

// 제품의 예정 흐름: Worker가 장을 요청 → 메인이 1.5배로 그려 넘김 → Worker가 인코딩. 한 번에 넘어가 있는 그림은 하나다.
async function exportRun(job: ExportJob) {
  const slides = await buildDocument(job.kind, job.count);
  const frameCounts = slides.map(() => (job.hold * OUTPUT_FPS) / job.fps);
  await renderToBitmap(slides[0], 1.5).then(first => first.bitmap.close());
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const render: number[] = [], bitmap: number[] = []; let longestBlockMs = 0;
  const started = performance.now();
  try {
    const done = await new Promise<Extract<FromWorker, { type: 'done' }>>((finish, reject) => {
      worker.onerror = event => reject(new Error(`Worker 오류: ${event.message}`));
      worker.onmessage = (event: MessageEvent<FromWorker>) => {
        const message = event.data;
        if (message.type === 'fail') { reject(new Error(message.message)); return; }
        if (message.type === 'done') { finish(message); return; }
        void renderToBitmap(slides[message.index], 1.5).then(result => {
          render.push(result.renderMs); bitmap.push(result.bitmapMs); longestBlockMs = Math.max(longestBlockMs, result.renderMs);
          const reply: ToWorker = { type: 'frame', index: message.index, bitmap: result.bitmap };
          worker.postMessage(reply, [result.bitmap]);
        }, reject);
      };
      const start: ToWorker = { type: 'start', file: job.file, frameCounts, container: job.container, mode: job.mode };
      worker.postMessage(start);
    });
    const totalMs = performance.now() - started;
    return { ...job, slides: slides.length, frames: done.frames, packets: done.packets, seconds: done.frames / OUTPUT_FPS, bytes: done.bytes, totalMs: Math.round(totalMs), render: stats(render), bitmap: stats(bitmap), encodeMs: Math.round(done.encodeMs), finalizeMs: Math.round(done.finalizeMs), longestRenderMs: Math.round(longestBlockMs) };
  } finally { worker.terminate(); }
}

async function probeFile(name: string) {
  const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('animprobe', { create: true });
  return (await root.getFileHandle(name)).getFile();
}

// 출력 파일을 다시 해독한다: 패킷 수, 길이, 지정한 프레임의 왼쪽 위 색(장 구분용).
async function inspect(name: string, frames: number[]) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(await probeFile(name)) });
  try {
    const video = (await input.getPrimaryVideoTrack())!; const audio = await input.getPrimaryAudioTrack();
    let packets = 0; const sink = new EncodedPacketSink(video);
    for (let packet = await sink.getFirstPacket({ metadataOnly: true }); packet; packet = await sink.getNextPacket(packet, { metadataOnly: true })) packets++;
    const canvas = new OffscreenCanvas(video.displayWidth, video.displayHeight); const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const samples = new VideoSampleSink(video); const colors: { r: number; g: number; b: number }[] = [];
    for (const k of frames) {
      // 프레임 경계 반올림을 피해 반 프레임 뒤를 묻는다.
      const sample = await samples.getSample((k + 0.5) / OUTPUT_FPS);
      sample!.draw(ctx, 0, 0); sample!.close();
      const [r, g, b] = ctx.getImageData(40, 40, 1, 1).data; colors.push({ r, g, b });
    }
    return { mime: await input.getMimeType(), duration: await input.computeDuration(), packets, width: video.displayWidth, height: video.displayHeight, audioCodec: audio?.codec ?? null, colors };
  } finally { input.dispose(); }
}

async function fileBase64(name: string) {
  const bytes = new Uint8Array(await (await probeFile(name)).arrayBuffer()); let text = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) text += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(text);
}

async function removeFiles() { await (await navigator.storage.getDirectory()).removeEntry('animprobe', { recursive: true }).catch(() => undefined); }

// 양파 껍질: 1280×720 그림을 투명도 0.35로 화면 크기 캔버스에 한 번 까는 비용.
async function onionDraw(kind: DocKind, repeats: number) {
  const [slide] = await buildDocument(kind, 1);
  const rendered = await renderSlide(slide, resolve, 1);
  if (!rendered.ok) throw new Error(rendered.message);
  const target = document.createElement('canvas'); target.width = 1280; target.height = 720; document.body.append(target);
  const ctx = target.getContext('2d')!; const times: number[] = [];
  for (let i = 0; i < repeats; i++) {
    const started = performance.now();
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 1280, 720); ctx.globalAlpha = 0.35; ctx.drawImage(rendered.canvas, 0, 0); ctx.globalAlpha = 1;
    ctx.getImageData(0, 0, 1, 1); // 그리기를 실제로 끝내게 한다.
    times.push(performance.now() - started);
  }
  target.remove();
  return stats(times);
}

const info = async () => ({ userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null, estimate: await navigator.storage.estimate() });

const api = { info, renderTimes, releaseKept, exportRun, inspect, fileBase64, removeFiles, onionDraw };
export type AnimProbe = typeof api;
(window as unknown as { animProbe: AnimProbe }).animProbe = api;
document.getElementById('status')!.textContent = '준비됐어요';
