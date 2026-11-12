// 애니메이션 내보내기(애니메이션 계약 §8 출력). mediaWorker 안에서 돈다.
// 메인 화면이 장을 한 장씩 그려 넘기면 같은 그림을 그 장의 프레임 수만큼 넣고(24fps 반복), 배경음악을 섞어 인코딩한 뒤
// OPFS 임시 파일로 흘려 쓴다. 한 번에 받은 그림은 하나뿐이며 닫은 뒤에 다음 장을 요청한다.
// 실패·취소하면 임시 파일을 지우고 부분 파일을 내주지 않는다. 형식 선택·비트레이트·MP4 배치는 영상 내보내기(exportJob.ts)와 같다.
import { AudioSample, AudioSampleSource, CanvasSource, Mp4OutputFormat, Output, StreamTarget, WebMOutputFormat, type StreamTargetChunk } from 'mediabunny';
import { exportDirectory } from '../animation/exportFiles';
import { OUTPUT_FPS } from '../domain/animationLimits';
import { LoopReader, MIX_RATE } from './audioMix';
import { choosePair, ExportStop, VIDEO_BITRATE, type ExportDone, type ExportProgress } from './exportJob';

export const ANIMATION_WIDTH = 1920, ANIMATION_HEIGHT = 1080;
export type AnimationExportRequest = { type: 'exportAnimation'; frameCounts: number[]; music: { blob: Blob; durationMs: number } | null; musicVolume: number };
export type AnimationFrameMessage = { type: 'animationFrame'; index: number; bitmap: ImageBitmap };
export type AnimationNeedFrame = { type: 'needFrame'; index: number };

type SyncHandle = { write(data: Uint8Array, options: { at: number }): number; truncate(size: number): void; flush(): void; close(): void };
const AUDIO_CHUNK = 4800; // 0.1초
// 프레임 k의 시각(마이크로초 정수, 영상 계약 §3과 같은 식).
const frameUs = (k: number) => Math.floor((k * 1_000_000) / OUTPUT_FPS);

export async function runAnimationExport(request: AnimationExportRequest, takeFrame: (index: number) => Promise<ImageBitmap>, isCancelled: () => boolean, onProgress: (message: ExportProgress) => void): Promise<ExportDone> {
  const counts = request.frameCounts;
  const frames = counts.reduce((sum, count) => sum + count, 0);
  if (!counts.length || !frames || counts.some(count => !Number.isInteger(count) || count < 1)) throw new ExportStop('INVALID_VALUE', '그림이 없어요. 먼저 장을 만들어 주세요.');
  const pair = await choosePair(ANIMATION_WIDTH, ANIMATION_HEIGHT, OUTPUT_FPS);
  const check = () => { if (isCancelled()) throw new ExportStop('CANCELLED', '내보내기를 멈췄어요.'); };

  // 임시 파일(OPFS, Worker 동기 핸들). 출력 바이트를 메모리에 쌓지 않는다.
  const temp = await exportDirectory(); const name = `export-${crypto.randomUUID()}.${pair}`;
  const handle = await (await temp.getFileHandle(name, { create: true }) as unknown as { createSyncAccessHandle(): Promise<SyncHandle> }).createSyncAccessHandle();
  let written = 0, closed = false;
  const stream = new WritableStream<StreamTargetChunk>({ write(chunk) { handle.write(chunk.data, { at: chunk.position }); written = Math.max(written, chunk.position + chunk.data.byteLength); } });
  const music = request.music && request.musicVolume > 0 ? LoopReader.create(request.music.blob, request.music.durationMs) : null;
  try {
    const output = new Output({ format: pair === 'mp4' ? new Mp4OutputFormat({ fastStart: 'reserve' }) : new WebMOutputFormat(), target: new StreamTarget(stream, { chunked: true }) });
    const canvas = new OffscreenCanvas(ANIMATION_WIDTH, ANIMATION_HEIGHT); const ctx = canvas.getContext('2d')!;
    const video = new CanvasSource(canvas, { codec: pair === 'mp4' ? 'avc' : 'vp9', fullCodecString: pair === 'mp4' ? 'avc1.640028' : 'vp09.00.40.08', bitrate: VIDEO_BITRATE, keyFrameInterval: 2 });
    const audio = new AudioSampleSource({ codec: pair === 'mp4' ? 'aac' : 'opus', bitrate: pair === 'mp4' ? 192_000 : 128_000 });
    // MP4는 moov를 앞에 둔다. 트랙별 최대 패킷 수를 알려 줘야 흘려 쓰면서 자리를 비워 둘 수 있다.
    const seconds = frames / OUTPUT_FPS;
    output.addVideoTrack(video, { frameRate: OUTPUT_FPS, maximumPacketCount: frames + 2 });
    output.addAudioTrack(audio, { maximumPacketCount: Math.ceil(pair === 'mp4' ? (seconds * MIX_RATE) / 1024 : seconds * 50) + 64 });
    await output.start();

    // 소리: 음악이 있으면 0초부터 반복해 × musicVolume, 없으면 무음. 영상 프레임보다 0.5초 앞서 조금씩 넣는다.
    const totalSamples = Math.round(seconds * MIX_RATE); let mixed = 0;
    async function mixUntil(until: number) {
      while (mixed < Math.min(until, totalSamples)) {
        check();
        const count = Math.min(AUDIO_CHUNK, totalSamples - mixed);
        const left = new Float32Array(count), right = new Float32Array(count);
        if (music) await music.addTo(left, right, 0, count, request.musicVolume);
        const planes = new Float32Array(count * 2);
        for (let i = 0; i < count; i++) { planes[i] = Math.max(-1, Math.min(1, left[i])); planes[count + i] = Math.max(-1, Math.min(1, right[i])); }
        const sample = new AudioSample({ data: planes, format: 'f32-planar', numberOfChannels: 2, sampleRate: MIX_RATE, timestamp: mixed / MIX_RATE });
        await audio.add(sample); sample.close();
        mixed += count;
      }
    }

    let frame = 0;
    for (let index = 0; index < counts.length; index++) {
      check();
      const bitmap = await takeFrame(index);
      try { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, ANIMATION_WIDTH, ANIMATION_HEIGHT); ctx.drawImage(bitmap, 0, 0, ANIMATION_WIDTH, ANIMATION_HEIGHT); }
      finally { bitmap.close(); }
      // 장 i는 프레임 [S_i, S_i + n_i)에 보인다(계약 §3).
      for (let k = frame; k < frame + counts[index]; k++) {
        check();
        await video.add(frameUs(k) / 1_000_000, (frameUs(k + 1) - frameUs(k)) / 1_000_000);
        await mixUntil(Math.round((frameUs(k) / 1_000_000 + 0.5) * MIX_RATE));
      }
      frame += counts[index];
      onProgress({ type: 'progress', done: index + 1, total: counts.length });
    }
    await mixUntil(Infinity);
    check();
    await output.finalize();
    handle.flush(); handle.close(); closed = true;
    return { type: 'done', file: name, container: pair, bytes: written, durationMs: Math.round((frames * 1000) / OUTPUT_FPS), frames };
  } catch (error) {
    if (!closed) { try { handle.close(); } catch { /* 이미 닫혔다. */ } }
    await temp.removeEntry(name).catch(() => undefined);
    throw error;
  } finally { music?.close(); }
}
