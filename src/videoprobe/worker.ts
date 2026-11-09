// 영상 편집기 V2 기술 시험 Worker. 제품 출력 구조(Worker 안에서 해독→합성→인코딩→OPFS 흘려 쓰기)를 그대로 흉내 내 측정한다.
import {
  ALL_FORMATS, AudioSample, AudioSampleSink, AudioSampleSource, BlobSource, BufferTarget, CanvasSource, EncodedPacketSink,
  Input, Mp4OutputFormat, Output, StreamTarget, VideoSampleSink, WebMOutputFormat,
  type StreamTargetChunk, type VideoSample,
} from 'mediabunny';
import { buildAnimatedWebp, buildApng, drawStickerFrame } from './animated';
import { BIT_COUNT, BIT_LEFT, BIT_SIZE, BIT_STEP, BIT_TOP, frameTimeUs, LOOKUP_TOLERANCE_S, type HardwarePref, type Job, type Pair, type WorkerReply, type WorkerRequest } from './protocol';
import notoBold from '@fontsource/noto-sans-kr/files/noto-sans-kr-korean-700-normal.woff2?url';

const scope = self as unknown as { postMessage(message: WorkerReply): void; onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null; fonts?: FontFaceSet };
const SAMPLE_RATE = 48000, CHANNELS = 2;

const CODECS: Record<Pair, { video: 'avc' | 'vp9'; videoString: string; audio: 'aac' | 'opus'; audioString: string; audioBitrate: number }> = {
  mp4: { video: 'avc', videoString: 'avc1.640028', audio: 'aac', audioString: 'mp4a.40.2', audioBitrate: 192_000 },
  webm: { video: 'vp9', videoString: 'vp09.00.40.08', audio: 'opus', audioString: 'opus', audioBitrate: 128_000 },
};
const extension = (pair: Pair) => (pair === 'mp4' ? 'mp4' : 'webm');

// ---- OPFS ----
async function probeDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('videoprobe', { create: true });
}
async function opfsFile(name: string) { return (await (await probeDir()).getFileHandle(name)).getFile(); }

// 동기 접근 핸들은 Worker에서만 열 수 있다. Mediabunny가 주는 위치에 바로 쓴다.
async function opfsWritable(name: string) {
  // DOM 타입에는 Worker 전용 메서드가 없어 좁은 타입을 붙인다.
  type SyncHandle = { write(data: Uint8Array, options: { at: number }): number; truncate(size: number): void; flush(): void; close(): void };
  const fileHandle = await (await probeDir()).getFileHandle(name, { create: true }) as unknown as { createSyncAccessHandle(): Promise<SyncHandle> };
  const handle = await fileHandle.createSyncAccessHandle();
  handle.truncate(0);
  let written = 0;
  const stream = new WritableStream<StreamTargetChunk>({
    write(chunk) { handle.write(chunk.data, { at: chunk.position }); written += chunk.data.byteLength; },
    close() { handle.flush(); handle.close(); },
    abort() { handle.close(); },
  });
  return { stream, written: () => written };
}

// ---- 합성 그림 ----
let noise: OffscreenCanvas | undefined;
function noiseTile() {
  if (noise) return noise;
  // 실제 카메라 영상처럼 압축이 쉽지 않도록 잡음 무늬를 깐다. 고정 씨앗이라 매번 같다.
  noise = new OffscreenCanvas(256, 256);
  const ctx = noise.getContext('2d')!; const image = ctx.createImageData(256, 256); let seed = 12345;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff; const v = seed & 255;
    image.data[i] = v; image.data[i + 1] = (v * 7) & 255; image.data[i + 2] = (v * 13) & 255; image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return noise;
}

function drawBits(ctx: OffscreenCanvasRenderingContext2D, index: number) {
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, BIT_LEFT * 2 + BIT_STEP * BIT_COUNT, BIT_TOP * 2 + BIT_SIZE);
  for (let bit = 0; bit < BIT_COUNT; bit++) {
    ctx.fillStyle = (index >> bit) & 1 ? '#ffffff' : '#000000';
    ctx.fillRect(BIT_LEFT + bit * BIT_STEP, BIT_TOP, BIT_SIZE, BIT_SIZE);
  }
}
function readBits(ctx: OffscreenCanvasRenderingContext2D) {
  const strip = ctx.getImageData(0, 0, BIT_LEFT * 2 + BIT_STEP * BIT_COUNT, BIT_TOP * 2 + BIT_SIZE);
  let value = 0;
  for (let bit = 0; bit < BIT_COUNT; bit++) {
    const x = BIT_LEFT + bit * BIT_STEP + BIT_SIZE / 2, y = BIT_TOP + BIT_SIZE / 2;
    const at = (y * strip.width + x) * 4;
    if (strip.data[at] + strip.data[at + 1] + strip.data[at + 2] > 384) value |= 1 << bit;
  }
  return value;
}

function drawSynthetic(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, index: number) {
  const tile = noiseTile(); const offset = (index * 7) % 256;
  ctx.save(); ctx.translate(-offset, -((index * 3) % 256));
  for (let y = 0; y < height + 256; y += 256) for (let x = 0; x < width + 256; x += 256) ctx.drawImage(tile, x, y);
  ctx.restore();
  ctx.fillStyle = `hsla(${(index * 2) % 360}, 70%, 50%, 0.55)`; ctx.fillRect(0, 0, width, height);
  const cx = width / 2 + Math.cos(index / 15) * width * 0.3, cy = height / 2 + Math.sin(index / 20) * height * 0.3;
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, cy, Math.min(width, height) * 0.08, 0, Math.PI * 2); ctx.fill();
  drawBits(ctx, index);
}

// 자막: 논리 좌표(계약 §3 기본값)를 1.5배로 그린다. 띠 rgba(0,0,0,0.5), 안쪽 여백 8, 모서리 8.
let fontReady: Promise<void> | undefined;
function loadFont() {
  if (!fontReady) {
    fontReady = (async () => {
      if (!scope.fonts) return;
      const face = new FontFace('Noto Sans KR', `url(${notoBold})`, { weight: '700' });
      scope.fonts.add(await face.load());
    })();
  }
  return fontReady;
}
function drawCaption(ctx: OffscreenCanvasRenderingContext2D, scale: number) {
  const text = '우리 고양이 최고! 냥냥 🐱', fontSize = 48, x = 160, y = 540, width = 960, pad = 8;
  ctx.save(); ctx.scale(scale, scale);
  ctx.font = `bold ${fontSize}px "Noto Sans KR", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const lineHeight = fontSize * 1.3; const measured = Math.min(width, ctx.measureText(text).width);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath(); ctx.roundRect(x + width / 2 - measured / 2 - pad, y - pad, measured + pad * 2, lineHeight + pad * 2, 8); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.fillText(text, x + width / 2, y + (lineHeight - fontSize) / 2, width);
  ctx.restore();
}

// ---- 소리 ----
// 원본 소리 대용: 440Hz + 매 초 0~50ms 1kHz 삑 소리. 샘플 번호로 계산하므로 반복해도 같은 값이다.
function syntheticTone(startFrame: number, frames: number) {
  const data = new Float32Array(frames * CHANNELS);
  for (let i = 0; i < frames; i++) {
    const n = startFrame + i, t = n / SAMPLE_RATE, inSecond = n % SAMPLE_RATE;
    const v = 0.2 * Math.sin(2 * Math.PI * 440 * t) + (inSecond < SAMPLE_RATE * 0.05 ? 0.3 * Math.sin(2 * Math.PI * 1000 * t) : 0);
    data[i] = v; data[frames + i] = v;
  }
  return data;
}

function videoConfig(pair: Pair, hardware: HardwarePref, bitrate: number, onConfig: (config: VideoEncoderConfig) => void, onPacket?: () => void) {
  const codec = CODECS[pair];
  return { codec: codec.video, fullCodecString: codec.videoString, bitrate, hardwareAcceleration: hardware, keyFrameInterval: 2, onEncoderConfig: onConfig, onEncodedPacket: onPacket } as const;
}

// 메모리 조사용 기록: 1초마다 [Date.now(), 넣은 프레임 수, 인코더가 내놓은 패킷 수, 쓴 바이트]. 운영체제 메모리 기록과 시각으로 맞춘다.
class Tracer {
  readonly rows: number[][] = [];
  packets = 0;
  private next = 0;
  constructor(readonly on: boolean) {}
  tick(frames: number, written: number) {
    if (!this.on) return;
    const now = Date.now(); if (now < this.next) return;
    this.next = now + 1000; this.rows.push([now, frames, this.packets, written]);
  }
}
function audioConfig(pair: Pair) {
  const codec = CODECS[pair];
  return { codec: codec.audio, bitrate: codec.audioBitrate } as const;
}
function format(pair: Pair, fastStart: 'end' | 'reserve' = 'end') {
  // 기본은 MP4 메타데이터를 끝에 둔다(메모리를 가장 적게 쓴다). 'reserve'는 앞에 자리를 비워 두고 마지막에 채운다(YouTube 권장 Fast Start).
  return pair === 'mp4' ? new Mp4OutputFormat({ fastStart: fastStart === 'reserve' ? 'reserve' : false }) : new WebMOutputFormat();
}
// 'reserve'에 필요한 트랙별 최대 패킷 수. AAC는 1024샘플, Opus는 20ms마다 한 패킷이다.
function packetBudget(pair: Pair, seconds: number, fps: number) {
  return { video: Math.ceil(seconds * fps) + 2, audio: Math.ceil(pair === 'mp4' ? (seconds * SAMPLE_RATE) / 1024 : seconds * 50) + 64 };
}

// ---- 작업: 합성 원본 만들기 ----
async function makeSource(job: Extract<Job, { kind: 'makeSource' }>, progress: (value: number) => void) {
  const started = performance.now();
  const canvas = new OffscreenCanvas(job.width, job.height); const ctx = canvas.getContext('2d')!;
  const target = await opfsWritable(job.name);
  const output = new Output({ format: format(job.pair), target: new StreamTarget(target.stream, { chunked: true }) });
  let encoderConfig: VideoEncoderConfig | undefined;
  const tracer = new Tracer(!!job.trace);
  const video = new CanvasSource(canvas, videoConfig(job.pair, job.hardware, 8_000_000, config => { encoderConfig = config; }, () => { tracer.packets++; }));
  const audio = new AudioSampleSource(audioConfig(job.pair));
  output.addVideoTrack(video, { frameRate: job.fps }); output.addAudioTrack(audio);
  await output.start();
  const frames = Math.round(job.seconds * job.fps); const audioChunk = SAMPLE_RATE / 10; let audioFrame = 0;
  for (let k = 0; k < frames; k++) {
    drawSynthetic(ctx, job.width, job.height, k);
    const t = frameTimeUs(k, job.fps) / 1e6;
    await video.add(t, (frameTimeUs(k + 1, job.fps) - frameTimeUs(k, job.fps)) / 1e6);
    // 소리는 영상보다 0.5초 앞서 넣는다. 한쪽만 쌓이면 다중화가 메모리에 버퍼를 늘린다.
    while (audioFrame / SAMPLE_RATE < t + 0.5 && audioFrame < job.seconds * SAMPLE_RATE) {
      const data = syntheticTone(audioFrame, audioChunk);
      const sample = new AudioSample({ data, format: 'f32-planar', numberOfChannels: CHANNELS, sampleRate: SAMPLE_RATE, timestamp: audioFrame / SAMPLE_RATE });
      await audio.add(sample); sample.close(); audioFrame += audioChunk;
    }
    if (k % 30 === 0) progress(k / frames);
    tracer.tick(k + 1, target.written());
  }
  await output.finalize();
  return { name: job.name, frames, seconds: (performance.now() - started) / 1000, bytes: target.written(), encoderConfig, trace: tracer.on ? tracer.rows : undefined };
}

// ---- 작업: 내보내기(해독→합성→인코딩) ----
class LoopingClip {
  private iterator: AsyncGenerator<VideoSample | null> | undefined;
  private current: VideoSample | null = null;
  private constructor(private sink: VideoSampleSink, private lengthS: number, private fps: number) {}
  static async open(name: string, fps: number) {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(await opfsFile(name)) });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('밈 영상에 영상 트랙이 없어요.');
    return new LoopingClip(new VideoSampleSink(track), await track.computeDuration(), fps);
  }
  private restart() {
    const fps = this.fps, length = this.lengthS, tolerance = LOOKUP_TOLERANCE_S;
    function* times() { for (let k = 0; frameTimeUs(k, fps) / 1e6 < length; k++) yield frameTimeUs(k, fps) / 1e6 + tolerance; }
    this.iterator = this.sink.samplesAtTimestamps(times());
  }
  // 밈 반복 프레임 (t − startMs) mod L 을 순서대로 꺼낸다(계약 §3).
  async next() {
    if (!this.iterator) this.restart();
    let step = await this.iterator!.next();
    if (step.done) { this.restart(); step = await this.iterator!.next(); }
    if (step.value) { this.current?.close(); this.current = step.value; }
    return this.current;
  }
  close() { this.current?.close(); void this.iterator?.return(undefined); }
}

async function buildStickerDecoder(size: number, fps: number, seconds: number) {
  const frames = await renderStickerFrames('webp', size, fps * seconds, fps);
  const bytes = buildAnimatedWebp(frames, size, size, Math.round(1000 / fps));
  const decoder = new ImageDecoder({ data: bytes, type: 'image/webp' });
  await decoder.tracks.ready;
  return { decoder, count: decoder.tracks.selectedTrack!.frameCount };
}

async function exportProject(job: Extract<Job, { kind: 'export' }>, progress: (value: number) => void) {
  const started = performance.now();
  const fps = 30, width = 1920, height = 1080, scale = 1.5;
  if (job.caption) await loadFont();
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(await opfsFile(job.input)) });
  const videoTrack = await input.getPrimaryVideoTrack(); const audioTrack = await input.getPrimaryAudioTrack();
  if (!videoTrack) throw new Error('원본에 영상 트랙이 없어요.');
  const sink = new VideoSampleSink(videoTrack);
  const memes = await Promise.all(job.memeClips.map(name => LoopingClip.open(name, fps)));
  const sticker = job.sticker ? await buildStickerDecoder(512, 24, 5) : undefined;
  const setupSeconds = (performance.now() - started) / 1000;

  const canvas = new OffscreenCanvas(width, height); const ctx = canvas.getContext('2d')!;
  const target = await opfsWritable(job.name);
  const output = new Output({ format: format(job.pair, job.fastStart), target: new StreamTarget(target.stream, { chunked: true }) });
  let encoderConfig: VideoEncoderConfig | undefined;
  const tracer = new Tracer(!!job.trace);
  const videoOut = new CanvasSource(canvas, videoConfig(job.pair, job.hardware, job.bitrate, config => { encoderConfig = config; }, () => { tracer.packets++; }));
  const audioOut = new AudioSampleSource(audioConfig(job.pair));
  const budget = packetBudget(job.pair, job.seconds, fps);
  output.addVideoTrack(videoOut, { frameRate: fps, maximumPacketCount: budget.video }); output.addAudioTrack(audioOut, { maximumPacketCount: budget.audio });
  await output.start();

  // 소리: 원본을 AudioDecoder로 풀고 배경음악(330Hz 대용)을 0.5배로 더해 ±1로 자른다(Worker 안 직접 합산 방식).
  const audioIterator = audioTrack ? new AudioSampleSink(audioTrack).samples(0, job.seconds) : undefined;
  let audioDoneS = 0; let audioEnded = !audioIterator; let mixMs = 0;
  async function pumpAudio(untilS: number) {
    while (!audioEnded && audioDoneS < untilS) {
      const step = await audioIterator!.next();
      if (step.done) { audioEnded = true; break; }
      const sample = step.value; const mixStart = performance.now();
      const frames = sample.numberOfFrames; const channels = sample.numberOfChannels;
      const planes = new Float32Array(frames * CHANNELS);
      for (let c = 0; c < CHANNELS; c++) sample.copyTo(planes.subarray(c * frames, (c + 1) * frames), { planeIndex: Math.min(c, channels - 1), format: 'f32-planar' });
      const base = Math.round(sample.timestamp * sample.sampleRate);
      for (let i = 0; i < frames; i++) {
        const music = 0.5 * 0.2 * Math.sin(2 * Math.PI * 330 * ((base + i) / sample.sampleRate));
        for (let c = 0; c < CHANNELS; c++) { const at = c * frames + i; planes[at] = Math.max(-1, Math.min(1, planes[at] + music)); }
      }
      const mixed = new AudioSample({ data: planes, format: 'f32-planar', numberOfChannels: CHANNELS, sampleRate: sample.sampleRate, timestamp: sample.timestamp });
      mixMs += performance.now() - mixStart;
      audioDoneS = sample.timestamp + sample.duration; sample.close();
      await audioOut.add(mixed); mixed.close();
    }
  }

  const frames = Math.round(job.seconds * fps);
  const tolerance = job.lookupToleranceS ?? LOOKUP_TOLERANCE_S;
  function* times() { for (let k = 0; k < frames; k++) yield frameTimeUs(k, fps) / 1e6 + tolerance; }
  let k = 0, missing = 0, decodeWaitMs = 0, composeMs = 0, encodeWaitMs = 0, stickerMs = 0;
  const iterator = sink.samplesAtTimestamps(times());
  for (;;) {
    let waitStart = performance.now();
    const step = await iterator.next(); decodeWaitMs += performance.now() - waitStart;
    if (step.done) break;
    const sample = step.value; const t = frameTimeUs(k, fps) / 1e6;
    const composeStart = performance.now();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
    if (sample) {
      // contain 맞춤(계약 §3). 같은 크기면 그대로.
      const fit = Math.min(width / sample.displayWidth, height / sample.displayHeight);
      const w = sample.displayWidth * fit, h = sample.displayHeight * fit;
      sample.draw(ctx, (width - w) / 2, (height - h) / 2, w, h); sample.close();
    } else missing++;
    waitStart = performance.now();
    for (let m = 0; m < memes.length; m++) {
      const frame = await memes[m].next();
      if (frame) frame.draw(ctx, width - 520 - m * 500, height - 320, 480, 270);
    }
    if (sticker) {
      const stickerStart = performance.now();
      const index = Math.floor(((t * 1000) % 5000) / (1000 / 24)) % sticker.count;
      const result = await sticker.decoder.decode({ frameIndex: index });
      ctx.drawImage(result.image, 1200, 120, 480, 480); result.image.close();
      stickerMs += performance.now() - stickerStart;
    }
    if (job.caption) drawCaption(ctx, scale);
    composeMs += performance.now() - composeStart;
    waitStart = performance.now();
    await videoOut.add(t, (frameTimeUs(k + 1, fps) - frameTimeUs(k, fps)) / 1e6);
    encodeWaitMs += performance.now() - waitStart;
    await pumpAudio(t + 0.5);
    k++;
    if (k % 30 === 0) progress(k / frames);
    tracer.tick(k, target.written());
  }
  await pumpAudio(Infinity);
  await output.finalize();
  for (const meme of memes) meme.close();
  sticker?.decoder.close();
  input.dispose();
  return { name: job.name, frames: k, missing, seconds: (performance.now() - started) / 1000, setupSeconds, bytes: target.written(), encoderConfig,
    breakdownMs: { decodeWait: Math.round(decodeWaitMs), compose: Math.round(composeMs), sticker: Math.round(stickerMs), encodeWait: Math.round(encodeWaitMs), audioMix: Math.round(mixMs) }, trace: tracer.on ? tracer.rows : undefined };
}

// ---- 작업: 출력물 검사 ----
async function verify(job: Extract<Job, { kind: 'verify' }>) {
  const file = await opfsFile(job.name);
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  const videoTrack = await input.getPrimaryVideoTrack(); const audioTrack = await input.getPrimaryAudioTrack();
  if (!videoTrack) throw new Error('영상 트랙이 없어요.');
  let packets = 0, keyPackets = 0; const packetSink = new EncodedPacketSink(videoTrack);
  for (let packet = await packetSink.getFirstPacket({ metadataOnly: true }); packet; packet = await packetSink.getNextPacket(packet, { metadataOnly: true })) {
    packets++; if (packet.type === 'key') keyPackets++;
  }
  const duration = await input.computeDuration();
  const videoDuration = await videoTrack.computeDuration(); const audioDuration = audioTrack ? await audioTrack.computeDuration() : null;
  // 고르게 뽑은 프레임 시각에서 왼쪽 위 번호를 읽어 기대한 번호와 비교한다(프레임 시각은 반 프레임 뒤를 물어 경계 반올림을 피한다).
  const total = packets; const checks: { k: number; read: number }[] = [];
  const indices = Array.from({ length: job.samples }, (_, i) => Math.min(total - 1, Math.floor((i * (total - 1)) / Math.max(1, job.samples - 1))));
  const sink = new VideoSampleSink(videoTrack);
  const canvas = new OffscreenCanvas(videoTrack.displayWidth, videoTrack.displayHeight); const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  let i = 0;
  for await (const sample of sink.samplesAtTimestamps(indices.map(k => (frameTimeUs(k, job.fps) + 500_000 / job.fps) / 1e6))) {
    if (sample) { sample.draw(ctx, 0, 0); checks.push({ k: indices[i], read: readBits(ctx) }); sample.close(); }
    else checks.push({ k: indices[i], read: -1 });
    i++;
  }
  // MP4 최상위 상자 순서(moov가 앞인지).
  const topBoxes: string[] = [];
  if (job.name.endsWith('.mp4')) {
    for (let pos = 0; pos < file.size && topBoxes.length < 8;) {
      const head = new DataView(await file.slice(pos, pos + 16).arrayBuffer());
      let length = head.getUint32(0); const type = String.fromCharCode(head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7));
      if (length === 1) length = Number(head.getBigUint64(8));
      topBoxes.push(type); if (length < 8) break; pos += length;
    }
  }
  const result = {
    name: job.name, bytes: file.size, topBoxes, mime: await input.getMimeType(), duration, videoDuration, audioDuration,
    video: { codec: videoTrack.codec, codecString: await videoTrack.getCodecParameterString(), width: videoTrack.displayWidth, height: videoTrack.displayHeight, packets, keyPackets },
    audio: audioTrack ? { codec: audioTrack.codec, codecString: await audioTrack.getCodecParameterString(), sampleRate: audioTrack.sampleRate, channels: audioTrack.numberOfChannels } : null,
    frameChecks: checks, frameMismatches: checks.filter(check => check.k !== check.read).length,
  };
  input.dispose();
  return result;
}

async function decodeSpeed(job: Extract<Job, { kind: 'decodeSpeed' }>) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(await opfsFile(job.name)) });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('영상 트랙이 없어요.');
  const started = performance.now(); let frames = 0;
  for await (const sample of new VideoSampleSink(track).samples()) { frames++; sample.close(); }
  const seconds = (performance.now() - started) / 1000;
  const duration = await track.computeDuration();
  input.dispose();
  return { name: job.name, frames, seconds, fps: frames / seconds, realtimeFactor: duration / seconds };
}

async function snapshot(job: Extract<Job, { kind: 'snapshot' }>) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(await opfsFile(job.name)) });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('영상 트랙이 없어요.');
  const sample = await new VideoSampleSink(track).getSample(job.atSeconds);
  if (!sample) throw new Error('프레임이 없어요.');
  const canvas = new OffscreenCanvas(sample.displayWidth, sample.displayHeight); sample.draw(canvas.getContext('2d')!, 0, 0); sample.close();
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  input.dispose();
  return { png: new Uint8Array(await blob.arrayBuffer()) };
}

// ---- 작업: 코덱 지원표 ----
async function support() {
  const sizes = { landscape: [1920, 1080], portrait: [1080, 1920] } as const;
  const video: Record<string, unknown>[] = [];
  for (const codec of ['avc1.640028', 'vp09.00.40.08', 'av01.0.08M.08']) {
    for (const [orientation, [width, height]] of Object.entries(sizes)) {
      for (const hardwareAcceleration of ['no-preference', 'prefer-hardware', 'prefer-software'] as const) {
        const config: VideoEncoderConfig = { codec, width, height, framerate: 30, bitrate: 10_000_000, hardwareAcceleration, ...(codec.startsWith('avc') ? { avc: { format: 'avc' } } : {}) };
        try { const result = await VideoEncoder.isConfigSupported(config); video.push({ codec, orientation, hardwareAcceleration, supported: result.supported }); }
        catch (error) { video.push({ codec, orientation, hardwareAcceleration, supported: false, error: String(error) }); }
      }
    }
  }
  const audio: Record<string, unknown>[] = [];
  for (const [codec, bitrate] of [['mp4a.40.2', 192_000], ['opus', 128_000]] as const) {
    try { audio.push({ codec, supported: (await AudioEncoder.isConfigSupported({ codec, sampleRate: SAMPLE_RATE, numberOfChannels: CHANNELS, bitrate })).supported }); }
    catch (error) { audio.push({ codec, supported: false, error: String(error) }); }
  }
  const decode: Record<string, unknown>[] = [];
  for (const [codec, width, height] of [['avc1.640028', 1920, 1080], ['avc1.64002A', 1920, 1080], ['hvc1.1.6.L120.90', 1920, 1080], ['hev1.1.6.L120.90', 1920, 1080], ['hvc1.2.4.L150.90', 3840, 2160], ['vp09.00.40.08', 1920, 1080], ['vp8', 1280, 720], ['av01.0.08M.08', 1920, 1080]] as const) {
    for (const hardwareAcceleration of ['no-preference', 'prefer-hardware', 'prefer-software'] as const) {
      try { decode.push({ codec, hardwareAcceleration, supported: (await VideoDecoder.isConfigSupported({ codec, codedWidth: width, codedHeight: height, hardwareAcceleration })).supported }); }
      catch (error) { decode.push({ codec, hardwareAcceleration, supported: false, error: String(error) }); }
    }
  }
  const audioDecode: Record<string, unknown>[] = [];
  for (const codec of ['mp4a.40.2', 'opus', 'vorbis', 'mp3']) {
    try { audioDecode.push({ codec, supported: (await AudioDecoder.isConfigSupported({ codec, sampleRate: SAMPLE_RATE, numberOfChannels: CHANNELS })).supported }); }
    catch (error) { audioDecode.push({ codec, supported: false, error: String(error) }); }
  }
  const g = self as unknown as Record<string, unknown>;
  const workerApis = Object.fromEntries(['OfflineAudioContext', 'AudioContext', 'ImageDecoder', 'VideoEncoder', 'AudioEncoder', 'OffscreenCanvas', 'FontFace'].map(name => [name, typeof g[name]]));
  const imageTypes = typeof ImageDecoder === 'undefined' ? null : Object.fromEntries(await Promise.all(['image/webp', 'image/png', 'image/apng', 'image/gif'].map(async type => [type, await ImageDecoder.isTypeSupported(type)])));
  const syncHandle = typeof (FileSystemFileHandle.prototype as unknown as Record<string, unknown>).createSyncAccessHandle;
  return { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null, video, audio, decode, audioDecode, workerApis, imageTypes, syncHandle };
}

// ---- 작업: 투명 WebM(VP9 알파) ----
async function alpha() {
  const size = 256, fps = 24, frames = 24;
  const canvas = new OffscreenCanvas(size, size); const ctx = canvas.getContext('2d')!;
  const target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });
  let encoderConfig: VideoEncoderConfig | undefined;
  const source = new CanvasSource(canvas, { codec: 'vp9', bitrate: 1_000_000, alpha: 'keep', onEncoderConfig: config => { encoderConfig = config; } });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();
  for (let k = 0; k < frames; k++) { drawStickerFrame(ctx, size, k, frames); await source.add(k / fps, 1 / fps); }
  await output.finalize();
  const bytes = target.buffer!;
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(new Blob([bytes])) });
  const track = await input.getPrimaryVideoTrack();
  const sample = await new VideoSampleSink(track!).getSample(0.5);
  const read = new OffscreenCanvas(size, size); const readCtx = read.getContext('2d', { willReadFrequently: true })!;
  let corner: number[] = [], centerish: number[] = [], format: string | null = null, hasAlpha: boolean | null = null;
  if (sample) {
    format = sample.format; hasAlpha = sample.hasAlpha;
    sample.draw(readCtx, 0, 0); sample.close();
    corner = Array.from(readCtx.getImageData(2, size - 3, 1, 1).data);
    const pixels = readCtx.getImageData(0, 0, size, size).data; let opaque = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 200) opaque++;
    centerish = [opaque, size * size];
  }
  input.dispose();
  return { bytes: bytes.byteLength, encoderConfig, decodedFormat: format, hasAlpha, cornerRgba: corner, opaquePixels: centerish };
}

// ---- 작업: 애니메이션 WebP·APNG ----
async function renderStickerFrames(type: 'webp' | 'png', size: number, count: number, fps: number) {
  void fps;
  const canvas = new OffscreenCanvas(size, size); const ctx = canvas.getContext('2d')!;
  const frames: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    drawStickerFrame(ctx, size, i, count);
    const blob = await canvas.convertToBlob(type === 'webp' ? { type: 'image/webp', quality: 0.8 } : { type: 'image/png' });
    frames.push(new Uint8Array(await blob.arrayBuffer()));
  }
  return frames;
}

async function animatedImage(job: Extract<Job, { kind: 'animatedImage' }>) {
  const count = job.fps * job.seconds;
  const buildStart = performance.now();
  const frames = await renderStickerFrames(job.format, job.size, count, job.fps);
  const bytes = job.format === 'webp' ? buildAnimatedWebp(frames, job.size, job.size, Math.round(1000 / job.fps)) : buildApng(frames, job.size, job.size, job.fps);
  const buildSeconds = (performance.now() - buildStart) / 1000;
  const type = job.format === 'webp' ? 'image/webp' : 'image/png';
  const decoder = new ImageDecoder({ data: bytes, type });
  await decoder.tracks.ready; await decoder.completed;
  const track = decoder.tracks.selectedTrack!;
  const timings: number[] = []; const timestamps: number[] = []; let alphaPixels = -1; let frameFormat: string | null = null;
  const decodeStart = performance.now();
  for (let i = 0; i < track.frameCount; i++) {
    const start = performance.now();
    const { image } = await decoder.decode({ frameIndex: i });
    timings.push(performance.now() - start); timestamps.push(image.timestamp);
    if (i === 0) {
      frameFormat = image.format;
      const canvas = new OffscreenCanvas(job.size, job.size); const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(image, 0, 0); const data = ctx.getImageData(0, 0, job.size, job.size).data; alphaPixels = 0;
      for (let p = 3; p < data.length; p += 4) if (data[p] === 0) alphaPixels++;
    }
    image.close();
  }
  const decodeSeconds = (performance.now() - decodeStart) / 1000;
  // 두 번째 바퀴: 이미 한 번 푼 뒤 임의 접근 비용.
  const randomStart = performance.now();
  for (let i = 0; i < 30; i++) { const { image } = await decoder.decode({ frameIndex: (i * 37) % track.frameCount }); image.close(); }
  const randomMsPerFrame = (performance.now() - randomStart) / 30;
  decoder.close();
  timings.sort((a, b) => a - b);
  return {
    format: job.format, bytes: bytes.length, frames: track.frameCount, animated: track.animated, repetitionCount: track.repetitionCount, buildSeconds, decodeSeconds,
    msPerFrame: { median: timings[Math.floor(timings.length / 2)], p95: timings[Math.floor(timings.length * 0.95)], max: timings[timings.length - 1] }, randomMsPerFrame,
    firstTimestamps: timestamps.slice(0, 4), lastTimestamp: timestamps[timestamps.length - 1], transparentPixelsFirstFrame: alphaPixels, frameFormat,
    rgbaBytesIfAllFramesKept: job.size * job.size * 4 * track.frameCount,
  };
}

async function remove(names: string[]) {
  const dir = await probeDir();
  for (const name of names) await dir.removeEntry(name).catch(() => undefined);
  return { removed: names.length };
}

async function run(job: Job, progress: (value: number) => void): Promise<unknown> {
  switch (job.kind) {
    case 'support': return support();
    case 'makeSource': return makeSource(job, progress);
    case 'export': return exportProject(job, progress);
    case 'verify': return verify(job);
    case 'decodeSpeed': return decodeSpeed(job);
    case 'alpha': return alpha();
    case 'animatedImage': return animatedImage(job);
    case 'snapshot': return snapshot(job);
    case 'remove': return remove(job.names);
  }
}

scope.onmessage = event => {
  const { id, job } = event.data;
  run(job, value => scope.postMessage({ id, progress: value }))
    .then(result => scope.postMessage({ id, ok: true, result: result as never }))
    .catch(error => scope.postMessage({ id, ok: false, error: error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error) }));
};

export { extension };
