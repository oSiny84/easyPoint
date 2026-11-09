// 영상 편집기 V2 기술 시험 페이지. 제품 코드가 아니다.
// 다른 PC(RAM 8GB 등)에서는 이 페이지를 열고 단추를 눌러 결과 JSON을 내려받는다. 자동 시험은 window.videoProbe를 쓴다.
import type { Job, WorkerReply } from './protocol';

let worker: Worker | undefined;
let nextId = 1;
const waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; onProgress?: (value: number) => void }>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data; const entry = waiting.get(reply.id);
      if (!entry) return;
      if ('progress' in reply) { entry.onProgress?.(reply.progress); return; }
      waiting.delete(reply.id);
      if (reply.ok) entry.resolve(reply.result); else entry.reject(new Error(reply.error));
    };
    worker.onerror = event => { for (const entry of waiting.values()) entry.reject(new Error(`Worker 오류: ${event.message}`)); waiting.clear(); };
  }
  return worker;
}

function runJob<T = unknown>(job: Job, onProgress?: (value: number) => void) {
  return new Promise<T>((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve: resolve as (value: unknown) => void, reject, onProgress });
    getWorker().postMessage({ id, job });
  });
}

// ---- 메인 스레드 항목 ----
async function mainThreadInfo() {
  const g = window as unknown as Record<string, unknown>;
  const memory = (performance as unknown as { memory?: { jsHeapSizeLimit: number } }).memory;
  return {
    userAgent: navigator.userAgent, userAgentData: await (navigator as unknown as { userAgentData?: { getHighEntropyValues(keys: string[]): Promise<unknown> } }).userAgentData?.getHighEntropyValues(['platformVersion', 'fullVersionList', 'architecture']),
    apis: Object.fromEntries(['OfflineAudioContext', 'AudioContext', 'ImageDecoder', 'VideoEncoder', 'MediaStreamTrackProcessor'].map(name => [name, typeof g[name]])),
    estimate: await navigator.storage.estimate(), persisted: await navigator.storage.persisted(), jsHeapSizeLimit: memory?.jsHeapSizeLimit ?? null,
    gpu: gpuName(),
  };
}
function gpuName() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string : null;
  } catch { return null; }
}

function idbRequest<T>(request: IDBRequest<T>) { return new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function idbDone(tx: IDBTransaction) { return new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error); }); }

async function readAll(blob: Blob) {
  const reader = blob.stream().getReader(); let total = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; }
  return total;
}

// 500MB 영상 파일을 IndexedDB Blob과 OPFS에 저장하고, 가운데 1MB 읽기·전체 읽기·지우기 시간과 용량 추정 변화를 잰다.
// 실제 가져오기처럼 디스크에 있는 File(여기서는 OPFS에 먼저 쓴 파일)을 원본으로 쓴다.
async function storageTest(megabytes: number) {
  const usage = async () => (await navigator.storage.estimate()).usage ?? 0;
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('videoprobe', { create: true });
  const chunk = new Uint8Array(8 * 1024 * 1024);
  for (let i = 0; i < chunk.length; i += 4096) chunk[i] = i & 255;
  const sourceHandle = await dir.getFileHandle('storage-source.bin', { create: true }); const sourceWritable = await sourceHandle.createWritable();
  for (let i = 0; i < Math.ceil(megabytes / 8); i++) await sourceWritable.write(chunk);
  await sourceWritable.close();
  const source = await sourceHandle.getFile();
  const middle = Math.floor(source.size / 2);
  const result: Record<string, unknown> = { bytes: source.size, usageStart: await usage() };

  // IndexedDB(별도 시험 DB). 실제 앱 DB는 건드리지 않는다.
  const name = 'canvacraft-video-probe';
  await idbRequest(indexedDB.deleteDatabase(name));
  const open = indexedDB.open(name, 1); open.onupgradeneeded = () => open.result.createObjectStore('media', { keyPath: 'id' });
  const db = await idbRequest(open);
  // 메모리에서 만든 큰 Blob(같은 8MB 버퍼 반복)은 Chrome·Edge에서 InvalidBlob으로 실패했다. 재현 기록으로 남긴다.
  try {
    const memoryBlob = new Blob(Array.from({ length: Math.ceil(megabytes / 8) }, () => chunk));
    const tx = db.transaction('media', 'readwrite'); tx.objectStore('media').put({ id: 'memory', blob: memoryBlob }); await idbDone(tx);
    const del = db.transaction('media', 'readwrite'); del.objectStore('media').delete('memory'); await idbDone(del);
    result.memoryBlobPut = 'ok';
  } catch (error) { result.memoryBlobPut = String(error); }
  const usageBeforeIdb = await usage();
  let t = performance.now();
  const writeTx = db.transaction('media', 'readwrite'); writeTx.objectStore('media').put({ id: 'probe', blob: source }); await idbDone(writeTx);
  const idbWrite = (performance.now() - t) / 1000; const usageAfterIdb = await usage();
  t = performance.now();
  const row = await idbRequest(db.transaction('media').objectStore('media').get('probe')) as { blob: Blob };
  const slice = await row.blob.slice(middle, middle + 1024 * 1024).arrayBuffer(); const idbSliceMs = performance.now() - t;
  t = performance.now(); const idbReadBytes = await readAll(row.blob); const idbFullRead = (performance.now() - t) / 1000;
  t = performance.now();
  const deleteTx = db.transaction('media', 'readwrite'); deleteTx.objectStore('media').delete('probe'); await idbDone(deleteTx);
  const idbDelete = (performance.now() - t) / 1000; const usageAfterIdbDelete = await usage();
  db.close(); await idbRequest(indexedDB.deleteDatabase(name)); const usageAfterIdbDrop = await usage();
  await new Promise(resolve => setTimeout(resolve, 5000)); const usageAfterIdbDrop5s = await usage();
  result.indexedDb = { writeSeconds: idbWrite, mbPerSecond: megabytes / idbWrite, sliceMs: idbSliceMs, sliceOk: slice.byteLength === 1024 * 1024, fullReadSeconds: idbFullRead, fullReadOk: idbReadBytes === source.size, deleteSeconds: idbDelete, usageBefore: usageBeforeIdb, usageAfterWrite: usageAfterIdb, usageAfterDelete: usageAfterIdbDelete, usageAfterDropDb: usageAfterIdbDrop, usageAfterDropDb5s: usageAfterIdbDrop5s };

  // OPFS: 메인 스레드는 createWritable로 쓴다(동기 핸들은 Worker 전용).
  const usageBeforeOpfs = await usage();
  t = performance.now();
  const handle = await dir.getFileHandle('storage-probe.bin', { create: true });
  const writable = await handle.createWritable(); await source.stream().pipeTo(writable);
  const opfsWrite = (performance.now() - t) / 1000; const usageAfterOpfs = await usage();
  t = performance.now(); const file = await handle.getFile(); const opfsSlice = await file.slice(middle, middle + 1024 * 1024).arrayBuffer(); const opfsSliceMs = performance.now() - t;
  t = performance.now(); const opfsReadBytes = await readAll(file); const opfsFullRead = (performance.now() - t) / 1000;
  t = performance.now(); await dir.removeEntry('storage-probe.bin'); const opfsDelete = (performance.now() - t) / 1000;
  result.opfs = { writeSeconds: opfsWrite, mbPerSecond: megabytes / opfsWrite, sliceMs: opfsSliceMs, sliceOk: opfsSlice.byteLength === 1024 * 1024, fullReadSeconds: opfsFullRead, fullReadOk: opfsReadBytes === source.size, deleteSeconds: opfsDelete, usageBefore: usageBeforeOpfs, usageAfterWrite: usageAfterOpfs, usageAfterDelete: await usage() };
  await dir.removeEntry('storage-source.bin');
  return result;
}

// ---- .canvavideo 대용량: 압축하지 않는(STORE) ZIP을 디스크 Blob 조합으로 쓰고, 끝 레코드만 읽어 항목을 Blob 조각으로 꺼낸다 ----
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
async function streamCrc(blob: Blob) {
  const reader = blob.stream().getReader(); let c = 0xffffffff;
  for (;;) { const { done, value } = await reader.read(); if (done) break; for (let i = 0; i < value.length; i++) c = CRC_TABLE[(c ^ value[i]) & 255] ^ (c >>> 8); }
  return (c ^ 0xffffffff) >>> 0;
}
function le(bytes: number, value: number) { const out = new Uint8Array(bytes); for (let i = 0; i < bytes; i++) out[i] = Math.floor(value / 2 ** (8 * i)) & 255; return out; }
function cat(parts: Uint8Array[]) { const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; }

async function writeStoreZip(entries: { name: string; blob: Blob }[]) {
  const parts: BlobPart[] = []; const central: Uint8Array[] = []; let offset = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name); const crc = await streamCrc(entry.blob); const size = entry.blob.size;
    const local = cat([le(4, 0x04034b50), le(2, 20), le(2, 0x0800), le(2, 0), le(4, 0), le(4, crc), le(4, size), le(4, size), le(2, name.length), le(2, 0), name]);
    central.push(cat([le(4, 0x02014b50), le(2, 20), le(2, 20), le(2, 0x0800), le(2, 0), le(4, 0), le(4, crc), le(4, size), le(4, size), le(2, name.length), le(2, 0), le(2, 0), le(2, 0), le(2, 0), le(4, 0), le(4, offset), name]));
    parts.push(local, entry.blob); offset += local.length + size;
  }
  const directory = cat(central);
  const end = cat([le(4, 0x06054b50), le(2, 0), le(2, 0), le(2, entries.length), le(2, entries.length), le(4, directory.length), le(4, offset), le(2, 0)]);
  return new Blob([...parts, directory, end], { type: 'application/zip' });
}

async function readStoreZip(file: Blob) {
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 65557)).arrayBuffer());
  let at = tail.length - 22; while (at >= 0 && !(tail[at] === 0x50 && tail[at + 1] === 0x4b && tail[at + 2] === 5 && tail[at + 3] === 6)) at--;
  if (at < 0) throw new Error('ZIP 끝 레코드가 없어요.');
  const view = new DataView(tail.buffer, at); const count = view.getUint16(10, true), dirSize = view.getUint32(12, true), dirOffset = view.getUint32(16, true);
  const dir = new DataView(await file.slice(dirOffset, dirOffset + dirSize).arrayBuffer()); const entries: { name: string; crc: number; blob: Blob }[] = [];
  for (let p = 0, i = 0; i < count; i++) {
    const crc = dir.getUint32(p + 16, true), size = dir.getUint32(p + 20, true), nameLength = dir.getUint16(p + 28, true), extra = dir.getUint16(p + 30, true), comment = dir.getUint16(p + 32, true), local = dir.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLength));
    const localHead = new DataView(await file.slice(local, local + 30).arrayBuffer());
    const dataStart = local + 30 + localHead.getUint16(26, true) + localHead.getUint16(28, true);
    entries.push({ name, crc, blob: file.slice(dataStart, dataStart + size) });
    p += 46 + nameLength + extra + comment;
  }
  return entries;
}

async function zipTest(megabytes: number) {
  const heap = () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
  const root = await navigator.storage.getDirectory(); const dir = await root.getDirectoryHandle('videoprobe', { create: true });
  // 디스크에 있는 영상 Blob을 흉내 내려고 먼저 OPFS 파일로 만든다(메모리 Blob이 아니라 파일 기반 Blob).
  const chunk = new Uint8Array(8 * 1024 * 1024); for (let i = 0; i < chunk.length; i += 997) chunk[i] = i & 255;
  const mediaHandle = await dir.getFileHandle('zip-media.bin', { create: true }); const writable = await mediaHandle.createWritable();
  for (let i = 0; i < megabytes / 8; i++) await writable.write(chunk);
  await writable.close();
  const media = await mediaHandle.getFile(); const heapBefore = heap();
  let t = performance.now();
  const zip = await writeStoreZip([{ name: 'manifest.json', blob: new Blob([JSON.stringify({ format: 'canvavideo', schemaVersion: 1 })]) }, { name: `media/${'a'.repeat(64)}.mp4`, blob: media }]);
  const zipHandle = await dir.getFileHandle('zip-test.canvavideo', { create: true }); const zipWritable = await zipHandle.createWritable(); await zip.stream().pipeTo(zipWritable);
  const writeSeconds = (performance.now() - t) / 1000; const heapAfterWrite = heap();
  t = performance.now();
  const entries = await readStoreZip(await zipHandle.getFile());
  const mediaEntry = entries.find(entry => entry.name.startsWith('media/'))!;
  const indexSeconds = (performance.now() - t) / 1000;
  t = performance.now(); const crcOk = (await streamCrc(mediaEntry.blob)) === mediaEntry.crc; const verifySeconds = (performance.now() - t) / 1000;
  const sizeOk = mediaEntry.blob.size === media.size; const heapAfterRead = heap();
  // Media id 후보: crypto.subtle.digest는 입력 전체를 메모리에 받으므로 2GiB 파일을 한 번에 해시할 수 없다.
  // 8MiB 조각마다 SHA-256을 구하고 그 값들을 이어 다시 SHA-256 한다(조각 해시 방식). 속도와 힙을 잰다.
  t = performance.now();
  const digests: Uint8Array[] = [];
  for (let at = 0; at < media.size; at += 8 * 1024 * 1024) digests.push(new Uint8Array(await crypto.subtle.digest('SHA-256', await media.slice(at, at + 8 * 1024 * 1024).arrayBuffer())));
  const chunkedId = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', cat(digests))), b => b.toString(16).padStart(2, '0')).join('');
  const hashSeconds = (performance.now() - t) / 1000; const heapAfterHash = heap();
  await dir.removeEntry('zip-media.bin'); await dir.removeEntry('zip-test.canvavideo');
  return { megabytes, zipBytes: zip.size, writeSeconds, indexSeconds, verifySeconds, crcOk, sizeOk, entries: entries.map(entry => entry.name), hash: { seconds: hashSeconds, mbPerSecond: megabytes / hashSeconds, idLength: chunkedId.length }, heapMB: { before: Math.round(heapBefore / 1e6), afterWrite: Math.round(heapAfterWrite / 1e6), afterRead: Math.round(heapAfterRead / 1e6), afterHash: Math.round(heapAfterHash / 1e6) } };
}

async function workerOfflineAudio() {
  // Worker 안에서 OfflineAudioContext를 실제로 만들어 본다(타입 확인만으로 판단하지 않는다).
  const code = `try { const c = new OfflineAudioContext(2, 48000, 48000); postMessage({ ok: true, rate: c.sampleRate }); } catch (e) { postMessage({ ok: false, error: String(e) }); }`;
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    return await new Promise(resolve => { const w = new Worker(url); w.onmessage = event => { resolve(event.data); w.terminate(); }; w.onerror = event => { resolve({ ok: false, error: event.message }); w.terminate(); }; });
  } finally { URL.revokeObjectURL(url); }
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- 화면 ----
const status = document.getElementById('status')!; const log = document.getElementById('log')!;
const say = (text: string) => { status.textContent = text; log.textContent += `${new Date().toLocaleTimeString()} ${text}\n`; };

async function step<T>(results: Record<string, unknown>, key: string, work: () => Promise<T>) {
  say(`${key} 시작`); const started = performance.now();
  try { const value = await work(); results[key] = value; say(`${key} 끝 (${((performance.now() - started) / 1000).toFixed(1)}초)`); return value; }
  catch (error) { results[key] = { error: String(error) }; say(`${key} 실패: ${String(error)}`); return undefined; }
}

async function suite(minutes: number) {
  const results: Record<string, unknown> = { startedAt: new Date().toISOString(), minutes };
  const seconds = minutes * 60;
  await step(results, 'main', mainThreadInfo);
  await step(results, 'workerOfflineAudio', workerOfflineAudio);
  const support = await step(results, 'support', () => runJob<{ video: { codec: string; orientation: string; hardwareAcceleration: string; supported: boolean }[]; audio: { codec: string; supported: boolean }[] }>({ kind: 'support' }));
  const h264 = support?.video.some(v => v.codec === 'avc1.640028' && v.orientation === 'landscape' && v.supported) && support.audio.some(a => a.codec === 'mp4a.40.2' && a.supported);
  results.chosenPair = h264 ? 'mp4' : 'webm';
  await step(results, 'alpha', () => runJob({ kind: 'alpha' }));
  await step(results, 'webp', () => runJob({ kind: 'animatedImage', format: 'webp', size: 512, fps: 24, seconds: 5 }));
  await step(results, 'apng', () => runJob({ kind: 'animatedImage', format: 'png', size: 512, fps: 24, seconds: 5 }));
  for (const pair of h264 ? ['mp4', 'webm'] as const : ['webm'] as const) {
    const source = `src-${pair}-${minutes}m.${pair}`, out = `out-${pair}-${minutes}m.${pair}`;
    await step(results, `make-${pair}`, () => runJob({ kind: 'makeSource', name: source, pair, width: 1920, height: 1080, fps: 30, seconds, hardware: 'no-preference' }, p => say(`원본 ${pair} ${(p * 100).toFixed(0)}%`)));
    await step(results, `decode-${pair}`, () => runJob({ kind: 'decodeSpeed', name: source }));
    await step(results, `meme-${pair}`, () => runJob({ kind: 'makeSource', name: `meme-${pair}.${pair}`, pair, width: 1280, height: 720, fps: 30, seconds: 4, hardware: 'no-preference' }));
    await step(results, `export-${pair}-plain`, () => runJob({ kind: 'export', input: source, name: out, pair, seconds, caption: true, sticker: false, memeClips: [], hardware: 'no-preference', bitrate: 10_000_000 }, p => say(`출력 ${pair} ${(p * 100).toFixed(0)}%`)));
    await step(results, `verify-${pair}-plain`, () => runJob({ kind: 'verify', name: out, fps: 30, samples: 12 }));
    await step(results, `export-${pair}-memes`, () => runJob({ kind: 'export', input: source, name: out, pair, seconds, caption: true, sticker: true, memeClips: [`meme-${pair}.${pair}`, `meme-${pair}.${pair}`], hardware: 'no-preference', bitrate: 10_000_000 }, p => say(`밈 출력 ${pair} ${(p * 100).toFixed(0)}%`)));
    await step(results, `verify-${pair}-memes`, () => runJob({ kind: 'verify', name: out, fps: 30, samples: 12 }));
    await runJob({ kind: 'remove', names: [source, out, `meme-${pair}.${pair}`] });
  }
  await step(results, 'storage', () => storageTest(500));
  await step(results, 'zip', () => zipTest(1024));
  results.finishedAt = new Date().toISOString();
  return results;
}

for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-minutes]')) {
  button.addEventListener('click', async () => {
    for (const other of document.querySelectorAll('button')) other.disabled = true;
    const minutes = Number(button.dataset.minutes);
    const results = await suite(minutes);
    say('모두 끝났어요. 결과 파일을 내려받아요.');
    download(`canvacraft-video-probe-${minutes}m-${Date.now()}.json`, results);
    for (const other of document.querySelectorAll('button')) other.disabled = false;
  });
}

// OPFS에 쓴 출력 파일을 내려받는다(플레이어에서 직접 열어 보기 위해).
async function downloadFile(name: string) {
  const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('videoprobe');
  const file = await (await dir.getFileHandle(name)).getFile();
  const url = URL.createObjectURL(file);
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return file.size;
}

(window as unknown as { videoProbe: unknown }).videoProbe = { runJob, storageTest, zipTest, mainThreadInfo, workerOfflineAudio, suite, downloadFile };
status.textContent = '준비됐어요';
