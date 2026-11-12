// 내보내기(영상 계약 §8 출력). mediaWorker 안에서 돈다. 메인 화면이 넘긴 스냅숏·자막 그림·내장 밈/소리로
// 프레임 k = 0부터 §3의 식으로 조각 프레임을 해독해 1.5배 캔버스에 그리고(composeFrame), 소리를 섞어 인코딩한 뒤
// OPFS 임시 파일로 흘려 쓴다. 실패·취소하면 임시 파일을 지우고 부분 파일을 내주지 않는다.
import {
  ALL_FORMATS, AudioSample, AudioSampleSource, BlobSource, CanvasSource, Input, Mp4OutputFormat, Output, StreamTarget, VideoSampleSink, WebMOutputFormat,
  type StreamTargetChunk, type VideoSample,
} from 'mediabunny';
import type { ErrorCode } from '../domain/types';
import { clipLength, clipSpeed, clipStarts, frameAtOrBefore, locate, memeTime, totalMs } from '../domain/timeline';
import { CANVAS } from '../domain/videoLimits';
import type { MemeOverlay, VideoProject } from '../domain/videoTypes';
import { drawOverlays, isVisible, type CaptionImage } from './compose';
import { AudioReader, LoopReader, MIX_RATE } from './audioMix';
import { directory, readMedia } from './mediaStore';

export const OUTPUT_SCALE = 1.5;
export const VIDEO_BITRATE = 8_000_000;
export type ExportMeme = { id: string; kind: 'sticker' | 'clip'; durationMs: number; blob: Blob; soundBlob: Blob | null };
export type ExportRequest = {
  type: 'export'; project: VideoProject;
  // 자막 그림(1.5배)과 논리 상자. 메인 스레드가 layoutText로 그린다.
  captions: { id: string; image: ImageBitmap; left: number; top: number; width: number; height: number }[];
  memes: ExportMeme[]; music: { blob: Blob; durationMs: number } | null;
};
export type ExportProgress = { type: 'progress'; done: number; total: number };
export type ExportDone = { type: 'done'; file: string; container: 'mp4' | 'webm'; bytes: number; durationMs: number; frames: number };
export class ExportStop extends Error { constructor(readonly code: ErrorCode, message: string) { super(message); } }

type SyncHandle = { write(data: Uint8Array, options: { at: number }): number; truncate(size: number): void; flush(): void; close(): void };
const AUDIO_CHUNK = 4800; // 0.1초

// 형식은 쌍으로 정한다: H.264(High)와 AAC가 둘 다 되면 MP4, 아니면 VP9+Opus WebM, 둘 다 안 되면 ENCODER_UNAVAILABLE.
export async function choosePair(width: number, height: number, fps: number) {
  const video = async (codec: string) => (await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: VIDEO_BITRATE, framerate: fps, ...(codec.startsWith('avc') ? { avc: { format: 'avc' as const } } : {}) }).catch(() => ({ supported: false }))).supported;
  const audio = async (codec: string, bitrate: number) => (await AudioEncoder.isConfigSupported({ codec, sampleRate: MIX_RATE, numberOfChannels: 2, bitrate }).catch(() => ({ supported: false }))).supported;
  if (await video('avc1.640028') && await audio('mp4a.40.2', 192_000)) return 'mp4' as const;
  if (await video('vp09.00.40.08') && await audio('opus', 128_000)) return 'webm' as const;
  throw new ExportStop('ENCODER_UNAVAILABLE', '이 컴퓨터에서는 영상 파일을 만들 수 없어요. Chrome이나 Edge 최신 판을 써 주세요.');
}

// 스티커: ImageDecoder 프레임 시각(마이크로초 → ms)을 한 번 모아 두고, 타임스탬프 ≤ m인 프레임만 그때 푼다(계약 §3).
class StickerSource {
  private constructor(private decoder: ImageDecoder, readonly timestampsMs: number[]) {}
  static async open(blob: Blob) {
    const decoder = new ImageDecoder({ data: blob.stream(), type: 'image/webp' });
    await decoder.tracks.ready; await decoder.completed;
    const count = decoder.tracks.selectedTrack!.frameCount; const timestampsMs: number[] = [];
    for (let i = 0; i < count; i++) { const { image } = await decoder.decode({ frameIndex: i }); timestampsMs.push(image.timestamp / 1000); image.close(); }
    return new StickerSource(decoder, timestampsMs);
  }
  private current: { index: number; image: VideoFrame } | null = null;
  async frame(m: number) {
    const index = frameAtOrBefore(this.timestampsMs, m);
    if (this.current?.index !== index) { const { image } = await this.decoder.decode({ frameIndex: index }); this.current?.image.close(); this.current = { index, image }; }
    return this.current.image;
  }
  close() { this.current?.image.close(); this.decoder.close(); }
}

// 밈 영상: 보이는 출력 프레임마다 타임스탬프가 m + 1ms 이하인 프레임. 반복 경계에서는 해독기가 처음으로 돌아간다.
class ClipMemeSource {
  private latest: VideoSample | null = null;
  private constructor(private input: Input, private iterator: AsyncIterator<VideoSample | null>) {}
  static async open(blob: Blob, times: number[]) {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new ExportStop('ASSET_INVALID', '밈 영상을 읽지 못했어요.');
    return new ClipMemeSource(input, new VideoSampleSink(track).samplesAtTimestamps(times)[Symbol.asyncIterator]());
  }
  async next() {
    const step = await this.iterator.next();
    if (!step.done && step.value) { this.latest?.close(); this.latest = step.value; }
    return this.latest;
  }
  close() { this.latest?.close(); void this.iterator.return?.(); this.input.dispose(); }
}

export async function runExport(request: ExportRequest, isCancelled: () => boolean, onProgress: (message: ExportProgress) => void): Promise<ExportDone> {
  const project = request.project;
  const fps = project.fps, logical = CANVAS[project.orientation];
  const width = Math.round(logical.width * OUTPUT_SCALE), height = Math.round(logical.height * OUTPUT_SCALE);
  const total = totalMs(project.clips);
  if (!total) throw new ExportStop('INVALID_VALUE', '영상을 먼저 넣어 주세요.');
  const frames = Math.ceil((total * fps) / 1000);
  const pair = await choosePair(width, height, fps);
  const check = () => { if (isCancelled()) throw new ExportStop('CANCELLED', '내보내기를 멈췄어요.'); };

  // 임시 파일(OPFS, Worker 동기 핸들). 출력 바이트를 메모리에 쌓지 않는다.
  const temp = await directory('tmp'); const name = `export-${crypto.randomUUID()}.${pair}`;
  const handle = await (await temp.getFileHandle(name, { create: true }) as unknown as { createSyncAccessHandle(): Promise<SyncHandle> }).createSyncAccessHandle();
  let written = 0, closed = false;
  const stream = new WritableStream<StreamTargetChunk>({ write(chunk) { handle.write(chunk.data, { at: chunk.position }); written = Math.max(written, chunk.position + chunk.data.byteLength); } });
  const inputs = new Map<string, Input>();
  const stickers = new Map<string, StickerSource>();
  const clipMemes = new Map<string, ClipMemeSource>();
  const readers: { close(): void }[] = [];
  try {
    const output = new Output({ format: pair === 'mp4' ? new Mp4OutputFormat({ fastStart: 'reserve' }) : new WebMOutputFormat(), target: new StreamTarget(stream, { chunked: true }) });
    const canvas = new OffscreenCanvas(width, height); const ctx = canvas.getContext('2d')!;
    const video = new CanvasSource(canvas, { codec: pair === 'mp4' ? 'avc' : 'vp9', fullCodecString: pair === 'mp4' ? 'avc1.640028' : 'vp09.00.40.08', bitrate: VIDEO_BITRATE, keyFrameInterval: 2 });
    const audio = new AudioSampleSource({ codec: pair === 'mp4' ? 'aac' : 'opus', bitrate: pair === 'mp4' ? 192_000 : 128_000 });
    // MP4는 moov를 앞에 둔다(YouTube 권장, 편집 목록 없음). 트랙별 최대 패킷 수를 알려 줘야 흘려 쓰면서 자리를 비워 둘 수 있다.
    const seconds = total / 1000;
    output.addVideoTrack(video, { frameRate: fps, maximumPacketCount: frames + 2 });
    output.addAudioTrack(audio, { maximumPacketCount: Math.ceil(pair === 'mp4' ? (seconds * MIX_RATE) / 1024 : seconds * 50) + 64 });
    await output.start();

    // ---- 준비: 밈 ----
    const memeById = new Map(request.memes.map(meme => [meme.id, meme]));
    const captionById = new Map(request.captions.map(caption => [caption.id, caption]));
    const memeOverlays = project.overlays.filter((overlay): overlay is MemeOverlay => overlay.type === 'meme');
    for (const meme of memeOverlays) {
      const item = memeById.get(meme.memeId);
      if (!item) throw new ExportStop('ASSET_MISSING', '밈 자료를 찾을 수 없어요.');
      if (item.kind === 'sticker' && !stickers.has(item.id)) stickers.set(item.id, await StickerSource.open(item.blob));
      if (item.kind === 'clip') {
        const times: number[] = [];
        for (let k = 0; k < frames; k++) { const t = Math.floor(Math.floor((k * 1_000_000) / fps) / 1000); if (isVisible(meme, t)) times.push((memeTime(t - meme.startMs, item.durationMs) + 1) / 1000); }
        clipMemes.set(meme.id, await ClipMemeSource.open(item.blob, times));
      }
    }
    const prepared = new Map<string, CanvasImageSource>();
    const inputsFile = new Map<string, File>();

    // ---- 준비: 소리 ----
    const starts = clipStarts(project.clips);
    const clipReaders = new Map<string, AudioReader>();
    const memeReaders = new Map<string, LoopReader>();
    const music = request.music && project.audio.musicId && project.audio.musicVolume > 0 ? LoopReader.create(request.music.blob, request.music.durationMs) : null;
    if (music) readers.push(music);
    const sfx = new Map<string, { left: Float32Array; right: Float32Array }>();
    for (const meme of memeOverlays) {
      const item = memeById.get(meme.memeId)!;
      if (meme.soundOn && item.soundBlob && !sfx.has(item.id)) {
        // 효과음은 3초 이내라 한 번에 풀어 둔다.
        const reader = await AudioReader.open(item.soundBlob); const length = Math.ceil(3 * MIX_RATE);
        const left = new Float32Array(length), right = new Float32Array(length);
        await reader.addTo(left, right, 0, length, 1); reader.close();
        sfx.set(item.id, { left, right });
      }
    }
    let mixedFrames = 0;
    const totalFrames = Math.round(seconds * MIX_RATE);
    // 작품 시각 [a, b) 표본의 소리를 섞어 인코더에 넣는다.
    async function mixUntil(untilFrame: number) {
      while (mixedFrames < Math.min(untilFrame, totalFrames)) {
        check();
        const count = Math.min(AUDIO_CHUNK, totalFrames - mixedFrames);
        const left = new Float32Array(count), right = new Float32Array(count);
        const a = mixedFrames, b = a + count, aMs = (a / MIX_RATE) * 1000, bMs = (b / MIX_RATE) * 1000;
        // 조각 원래 소리 × originalVolume(끈 조각은 빼고).
        if (project.audio.originalVolume > 0) {
          for (let c = 0; c < project.clips.length; c++) {
            const clip = project.clips[c], start = starts[c], end = start + clipLength(clip), speed = clipSpeed(clip);
            if (clip.muted || end <= aMs || start >= bMs) continue;
            const media = project.mediaManifest.find(item => item.id === clip.mediaId);
            if (!media?.hasAudio) continue;
            let reader = clipReaders.get(clip.id);
            const from = Math.max(a, Math.ceil((start / 1000) * MIX_RATE)), to = Math.min(b, Math.floor((end / 1000) * MIX_RATE));
            if (to <= from) continue;
            if (!reader) {
              const file = inputsFile.get(clip.mediaId) ?? await readMedia(clip.mediaId);
              if (!file) throw new ExportStop('ASSET_MISSING', '영상 자료를 찾을 수 없어요.');
              // 빠르기를 바꾼 조각은 원본 소리를 speed배로 읽어 높이도 함께 바뀐다(미리보기 preservesPitch=false와 같다).
              reader = await AudioReader.open(file, (clip.inMs + ((from / MIX_RATE) * 1000 - start) * speed) / 1000, clip.outMs / 1000, speed);
              clipReaders.set(clip.id, reader); readers.push(reader);
            }
            await reader.addTo(left, right, from - a, to - from, project.audio.originalVolume);
          }
        }
        // 밈 영상 소리(소리 켠 밈, 반복 포함 × 1)와 효과음(soundOn인 밈의 startMs에 1회).
        for (const meme of memeOverlays) {
          if (!meme.soundOn) continue;
          const item = memeById.get(meme.memeId)!;
          const startFrame = Math.round((meme.startMs / 1000) * MIX_RATE), endFrame = Math.round(((meme.startMs + meme.durationMs) / 1000) * MIX_RATE);
          const from = Math.max(a, startFrame), to = Math.min(b, endFrame);
          if (item.kind === 'clip' && to > from) {
            let reader = memeReaders.get(meme.id);
            if (!reader) { reader = LoopReader.create(item.blob, item.durationMs); await reader.seek(from - startFrame); memeReaders.set(meme.id, reader); readers.push(reader); }
            await reader.addTo(left, right, from - a, to - from, 1);
          }
          const effect = sfx.get(item.id);
          if (effect) {
            const effectFrom = Math.max(a, startFrame), effectTo = Math.min(b, startFrame + effect.left.length);
            for (let i = effectFrom; i < effectTo; i++) { left[i - a] += effect.left[i - startFrame]; right[i - a] += effect.right[i - startFrame]; }
          }
        }
        // 배경음악: 0초부터 반복, 작품 끝에서 자른다(× musicVolume).
        if (music) await music.addTo(left, right, 0, count, project.audio.musicVolume);
        const planes = new Float32Array(count * 2);
        for (let i = 0; i < count; i++) { planes[i] = Math.max(-1, Math.min(1, left[i])); planes[count + i] = Math.max(-1, Math.min(1, right[i])); }
        const sample = new AudioSample({ data: planes, format: 'f32-planar', numberOfChannels: 2, sampleRate: MIX_RATE, timestamp: a / MIX_RATE });
        await audio.add(sample); sample.close();
        mixedFrames = b;
      }
    }

    // ---- 프레임 ----
    let clipIndex = -1; let clipFrames: AsyncIterator<VideoSample | null> | null = null; let shown: VideoSample | null = null;
    for (let k = 0; k < frames; k++) {
      check();
      const tUs = Math.floor((k * 1_000_000) / fps), tMs = Math.floor(tUs / 1000);
      const at = locate(project.clips, tUs / 1000)!;
      if (at.index !== clipIndex) {
        // 새 조각: 이 조각이 보여 줄 출력 프레임들의 원본 시각(s + 1ms 이하의 가장 늦은 프레임, 계약 §3)을 한꺼번에 넘긴다.
        clipIndex = at.index; void clipFrames?.return?.(); shown?.close(); shown = null;
        const clip = at.clip, start = starts[at.index], end = start + clipLength(clip), speed = clipSpeed(clip);
        let input = inputs.get(clip.mediaId);
        if (!input) {
          const file = await readMedia(clip.mediaId);
          if (!file) throw new ExportStop('ASSET_MISSING', '영상 자료를 찾을 수 없어요.');
          inputsFile.set(clip.mediaId, file);
          input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) }); inputs.set(clip.mediaId, input);
        }
        const track = await input.getPrimaryVideoTrack();
        if (!track) throw new ExportStop('ASSET_INVALID', '영상 자료를 읽지 못했어요.');
        const times: number[] = [];
        for (let j = k; j < frames; j++) { const t = Math.floor((j * 1_000_000) / fps) / 1000; if (t >= end) break; times.push((clip.inMs + (t - start) * speed + 1) / 1000); }
        clipFrames = new VideoSampleSink(track).samplesAtTimestamps(times)[Symbol.asyncIterator]();
      }
      const step = await clipFrames!.next();
      if (!step.done && step.value) { shown?.close(); shown = step.value; }
      // 조각 프레임을 비율을 지켜 가운데에 맞추고(contain) 남는 곳은 검은색이다(계약 §3). 회전은 VideoSample.draw가 적용한다.
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
      if (shown) { const fit = Math.min(width / shown.displayWidth, height / shown.displayHeight); const w = shown.displayWidth * fit, h = shown.displayHeight * fit; shown.draw(ctx, (width - w) / 2, (height - h) / 2, w, h); }
      // 보이는 밈의 그림을 먼저 준비한다(그리기 함수는 동기다).
      prepared.clear();
      for (const meme of memeOverlays) {
        if (!isVisible(meme, tMs)) continue;
        const item = memeById.get(meme.memeId)!;
        if (item.kind === 'sticker') prepared.set(meme.id, await stickers.get(item.id)!.frame(memeTime(tMs - meme.startMs, item.durationMs)));
        else { const sample = await clipMemes.get(meme.id)!.next(); if (sample) prepared.set(meme.id, sample.toCanvasImageSource()); }
      }
      drawOverlays(ctx, project.overlays, tMs, {
        caption: overlay => { const found = captionById.get(overlay.id); return found ? { image: found.image, left: found.left, top: found.top, width: found.width, height: found.height } satisfies CaptionImage : null; },
        meme: overlay => prepared.get(overlay.id) ?? null,
      }, OUTPUT_SCALE);
      await video.add(tUs / 1_000_000, (Math.floor(((k + 1) * 1_000_000) / fps) - tUs) / 1_000_000);
      // 소리는 영상보다 0.5초 앞서 조금씩 섞어 넣는다(소리 버퍼 전체를 메모리에 두지 않는다).
      await mixUntil(Math.round((tUs / 1_000_000 + 0.5) * MIX_RATE));
      if (k % 15 === 0) onProgress({ type: 'progress', done: k, total: frames });
    }
    shown?.close(); void clipFrames?.return?.();
    await mixUntil(Infinity);
    check();
    await output.finalize();
    handle.flush(); handle.close(); closed = true;
    onProgress({ type: 'progress', done: frames, total: frames });
    return { type: 'done', file: name, container: pair, bytes: written, durationMs: total, frames };
  } catch (error) {
    if (!closed) { try { handle.close(); } catch { /* 이미 닫혔다. */ } }
    await temp.removeEntry(name).catch(() => undefined);
    throw error;
  } finally {
    for (const reader of readers) reader.close();
    for (const sticker of stickers.values()) sticker.close();
    for (const clip of clipMemes.values()) clip.close();
    for (const input of inputs.values()) input.dispose();
    for (const caption of request.captions) caption.image.close();
  }
}
