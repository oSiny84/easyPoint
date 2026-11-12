// 애니메이션 A2 기술 시험 Worker. 제품의 예정 구조(메인이 그린 그림을 한 장씩 받아 인코딩 → OPFS 흘려 쓰기)를 흉내 내 측정한다.
// 제품 코드가 아니다. 한 번에 받은 그림은 하나뿐이며, 그림을 닫은 뒤에 다음 장을 요청한다.
import { AudioSample, AudioSampleSource, CanvasSource, Mp4OutputFormat, Output, StreamTarget, WebMOutputFormat, type StreamTargetChunk } from 'mediabunny';
import { OUT_HEIGHT, OUT_WIDTH, OUTPUT_FPS, type FromWorker, type ToWorker } from './protocol';

const scope = self as unknown as { postMessage(message: FromWorker): void; onmessage: ((event: MessageEvent<ToWorker>) => void) | null };
const RATE = 48000, BITRATE = 8_000_000, AUDIO_CHUNK = 4800;
type SyncHandle = { write(data: Uint8Array, options: { at: number }): number; truncate(size: number): void; flush(): void; close(): void };

let deliver: ((bitmap: ImageBitmap) => void) | null = null;
const nextFrame = (index: number) => new Promise<ImageBitmap>(resolve => { deliver = resolve; scope.postMessage({ type: 'need', index }); });

async function run(job: Extract<ToWorker, { type: 'start' }>): Promise<Extract<FromWorker, { type: 'done' }>> {
  const mp4 = job.container === 'mp4';
  const videoOk = (await VideoEncoder.isConfigSupported({ codec: mp4 ? 'avc1.640028' : 'vp09.00.40.08', width: OUT_WIDTH, height: OUT_HEIGHT, bitrate: BITRATE, framerate: OUTPUT_FPS, ...(mp4 ? { avc: { format: 'avc' as const } } : {}) })).supported;
  const audioOk = (await AudioEncoder.isConfigSupported({ codec: mp4 ? 'mp4a.40.2' : 'opus', sampleRate: RATE, numberOfChannels: 2, bitrate: mp4 ? 192_000 : 128_000 })).supported;
  if (!videoOk || !audioOk) throw new Error(`${job.container} 코덱 조합을 쓸 수 없어요.`);

  const frames = job.frameCounts.reduce((sum, count) => sum + count, 0);
  const packets = job.mode === 'repeat' ? frames : job.frameCounts.length;
  const seconds = frames / OUTPUT_FPS;
  const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('animprobe', { create: true });
  const handle = await (await root.getFileHandle(job.file, { create: true }) as unknown as { createSyncAccessHandle(): Promise<SyncHandle> }).createSyncAccessHandle();
  handle.truncate(0);
  let written = 0;
  const stream = new WritableStream<StreamTargetChunk>({ write(chunk) { handle.write(chunk.data, { at: chunk.position }); written = Math.max(written, chunk.position + chunk.data.byteLength); } });
  try {
    const output = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: 'reserve' }) : new WebMOutputFormat(), target: new StreamTarget(stream, { chunked: true }) });
    const canvas = new OffscreenCanvas(OUT_WIDTH, OUT_HEIGHT); const ctx = canvas.getContext('2d')!;
    const video = new CanvasSource(canvas, { codec: mp4 ? 'avc' : 'vp9', fullCodecString: mp4 ? 'avc1.640028' : 'vp09.00.40.08', bitrate: BITRATE, keyFrameInterval: 2 });
    const audio = new AudioSampleSource({ codec: mp4 ? 'aac' : 'opus', bitrate: mp4 ? 192_000 : 128_000 });
    output.addVideoTrack(video, { frameRate: OUTPUT_FPS, maximumPacketCount: packets + 2 });
    output.addAudioTrack(audio, { maximumPacketCount: Math.ceil(mp4 ? (seconds * RATE) / 1024 : seconds * 50) + 64 });
    await output.start();

    // 무음 소리 트랙을 영상보다 0.5초 앞서 조금씩 넣는다(제품과 같은 방식).
    const totalSamples = Math.round(seconds * RATE); let mixed = 0;
    async function silenceUntil(until: number) {
      while (mixed < Math.min(until, totalSamples)) {
        const count = Math.min(AUDIO_CHUNK, totalSamples - mixed);
        const sample = new AudioSample({ data: new Float32Array(count * 2), format: 'f32-planar', numberOfChannels: 2, sampleRate: RATE, timestamp: mixed / RATE });
        await audio.add(sample); sample.close(); mixed += count;
      }
    }

    let encodeMs = 0, frame = 0;
    for (let index = 0; index < job.frameCounts.length; index++) {
      const bitmap = await nextFrame(index);
      const started = performance.now();
      ctx.drawImage(bitmap, 0, 0, OUT_WIDTH, OUT_HEIGHT); bitmap.close();
      const count = job.frameCounts[index];
      const stamp = (k: number) => Math.floor((k * 1_000_000) / OUTPUT_FPS) / 1_000_000;
      if (job.mode === 'repeat') {
        for (let j = 0; j < count; j++) { await video.add(stamp(frame + j), stamp(frame + j + 1) - stamp(frame + j)); await silenceUntil(Math.round((stamp(frame + j) + 0.5) * RATE)); }
      } else {
        await video.add(stamp(frame), stamp(frame + count) - stamp(frame)); await silenceUntil(Math.round((stamp(frame) + 0.5) * RATE));
      }
      frame += count; encodeMs += performance.now() - started;
    }
    await silenceUntil(Infinity);
    const finalizeStarted = performance.now();
    await output.finalize();
    handle.flush(); handle.close();
    return { type: 'done', bytes: written, frames, packets, encodeMs, finalizeMs: performance.now() - finalizeStarted };
  } catch (error) {
    try { handle.close(); } catch { /* 이미 닫혔다. */ }
    throw error;
  }
}

scope.onmessage = event => {
  const message = event.data;
  if (message.type === 'frame') { const resolve = deliver; deliver = null; resolve?.(message.bitmap); return; }
  void run(message).then(done => scope.postMessage(done), error => scope.postMessage({ type: 'fail', message: error instanceof Error ? error.message : String(error) }));
};
