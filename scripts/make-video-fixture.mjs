// 영상 공통 fixture(tests/fixtures/video)를 다시 만든다. 개발 서버(npm run dev, 5173)가 떠 있어야 한다.
// 브라우저 WebCodecs + Mediabunny로 짧은 합성 WebM 2개(가로 VP9+Opus 2초, 세로 VP9 1.5초)를 만들고,
// 같은 파일을 다시 읽어 Media 메타데이터와 조각 해시 id를 계산해 문서(project.json)를 쓴다. 영상 내용은 합성 그림이라 권리 문제가 없다.
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = 'tests/fixtures/video';
const CHUNK = 8 * 1024 * 1024;
const sha256 = data => createHash('sha256').update(data).digest();
const mediaId = data => { const parts = []; for (let i = 0; i < data.length; i += CHUNK) parts.push(sha256(data.subarray(i, i + CHUNK))); return sha256(Buffer.concat(parts)).toString('hex'); };

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5173/');
const made = await page.evaluate(async () => {
  const mb = await import('/node_modules/mediabunny/dist/modules/src/index.js');
  async function make({ width, height, fps, seconds, audio, hue }) {
    const canvas = new OffscreenCanvas(width, height); const ctx = canvas.getContext('2d');
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format: new mb.WebMOutputFormat(), target });
    const video = new mb.CanvasSource(canvas, { codec: 'vp9', bitrate: 300_000, keyFrameInterval: 1 });
    output.addVideoTrack(video, { frameRate: fps });
    const sound = audio ? new mb.AudioSampleSource({ codec: 'opus', bitrate: 64_000 }) : null;
    if (sound) output.addAudioTrack(sound);
    await output.start();
    const frames = Math.round(seconds * fps);
    for (let k = 0; k < frames; k++) {
      ctx.fillStyle = `hsl(${hue + k * 3}, 70%, 45%)`; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(height / 6)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(k), width / 2, height / 2);
      ctx.beginPath(); ctx.arc((k / frames) * width, height * 0.8, height / 12, 0, Math.PI * 2); ctx.fill();
      await video.add(k / fps, 1 / fps);
    }
    if (sound) {
      const rate = 48000, total = Math.round(seconds * rate), data = new Float32Array(total * 2);
      for (let i = 0; i < total; i++) { const v = 0.2 * Math.sin(2 * Math.PI * 440 * i / rate); data[i] = v; data[total + i] = v; }
      const sample = new mb.AudioSample({ data, format: 'f32-planar', numberOfChannels: 2, sampleRate: rate, timestamp: 0 });
      await sound.add(sample); sample.close();
    }
    await output.finalize();
    const bytes = new Uint8Array(target.buffer);
    // 만든 파일을 다시 읽어 문서에 넣을 값을 얻는다(V4 가져오기가 할 일과 같은 값).
    const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BufferSource(bytes) });
    const track = await input.getPrimaryVideoTrack(); const audioTrack = await input.getPrimaryAudioTrack();
    const stats = await track.computePacketStats();
    const meta = { durationMs: Math.round((await input.computeDuration()) * 1000), width: track.displayWidth, height: track.displayHeight, rotation: track.rotation, fps: Math.round(stats.averagePacketRate * 1000) / 1000,
      hasAudio: !!audioTrack, videoCodec: await track.getCodecParameterString(), audioCodec: audioTrack ? await audioTrack.getCodecParameterString() : null };
    input.dispose();
    return { base64: btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')), meta };
  }
  return { a: await make({ width: 640, height: 360, fps: 30, seconds: 2, audio: true, hue: 20 }), b: await make({ width: 360, height: 640, fps: 24, seconds: 1.5, audio: false, hue: 200 }) };
});
await browser.close();

await fs.mkdir(OUT, { recursive: true });
const media = [];
for (const [name, { base64, meta }] of Object.entries(made)) {
  const data = Buffer.from(base64, 'base64');
  await fs.writeFile(path.join(OUT, `${name}.webm`), data);
  media.push({ id: mediaId(data), mime: 'video/webm', byteLength: data.length, ...meta });
}
const at = '2026-11-09T00:00:00.000Z';
const ids = { project: '00000000-0000-4000-8000-000000000100', clipA: '00000000-0000-4000-8000-000000000101', clipB: '00000000-0000-4000-8000-000000000102', caption: '00000000-0000-4000-8000-000000000103' };
const project = {
  schemaVersion: 1, kind: 'video', id: ids.project, title: '고양이 두 장면', revision: 3, createdAt: at, updatedAt: at, orientation: 'landscape', fps: 30,
  clips: [
    { id: ids.clipA, mediaId: media[0].id, inMs: 0, outMs: media[0].durationMs, muted: false },
    { id: ids.clipB, mediaId: media[1].id, inMs: 0, outMs: media[1].durationMs, muted: true },
  ],
  overlays: [{ id: ids.caption, type: 'caption', startMs: 500, durationMs: 1000, x: 160, y: 540, width: 960, text: '안녕 고양이 🐱', fontId: 'sans-ko', fontSize: 48, bold: true, color: '#FFFFFF', align: 'center', lineHeight: 1.3, backdrop: 'band' }],
  audio: { originalVolume: 1, musicId: null, musicVolume: 0.5 },
  mediaManifest: media,
};
await fs.writeFile(path.join(OUT, 'project.json'), JSON.stringify(project, null, 2) + '\n');
console.log(JSON.stringify(media, null, 2));
