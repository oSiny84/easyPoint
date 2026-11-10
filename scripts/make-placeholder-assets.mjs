// 영상 편집기의 자리 표시 밈(스티커 4·밈 영상 2)을 만든다(영상 계약 §2 내장 목록). 도형으로 직접 그려 외부 권리가 없다.
// 실제 밈은 사용자 가족이 그린 그림을 scripts/make-drawing-memes.mjs로 바꿔 넣는다(2026-11-10 결정). 그때 이 항목은 hidden으로 숨긴다
// (한 번 배포한 ID는 지우지 않는다). 효과음·음악은 scripts/make-sounds.mjs가 만든다. 이 스크립트를 다시 돌리면 manifest를 통째로 다시 쓰므로
// 그림 밈을 넣은 뒤에는 make-drawing-memes.mjs도 다시 돌린다. 개발 서버(npm run dev, 5173)가 떠 있어야 한다.
//   node scripts/make-placeholder-assets.mjs
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const MEMES = 'public/memes';
const LICENSE = 'CanvaCraft 자체 제작 자리 표시 자산(scripts/make-placeholder-assets.mjs). 외부 권리 없음';
const sha256 = data => createHash('sha256').update(data).digest('hex');

// ---- 밈: 투명 애니메이션 WebP 스티커와 소리 든 짧은 WebM ----
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5173/');
const made = await page.evaluate(async () => {
  const { buildAnimatedWebp } = await import('/src/videoprobe/animated.ts');
  const mb = await import('/node_modules/mediabunny/dist/modules/src/index.js');
  const SIZE = 256, FPS = 25, SECONDS = 2, FRAMES = FPS * SECONDS;
  const ease = k => 0.5 - 0.5 * Math.cos(2 * Math.PI * k);
  const face = (ctx, color, cx, cy, r, ears) => {
    ctx.fillStyle = color;
    if (ears === 'cat') { ctx.beginPath(); ctx.moveTo(cx - r * 0.9, cy - r * 0.3); ctx.lineTo(cx - r * 0.6, cy - r * 1.2); ctx.lineTo(cx - r * 0.1, cy - r * 0.8); ctx.moveTo(cx + r * 0.9, cy - r * 0.3); ctx.lineTo(cx + r * 0.6, cy - r * 1.2); ctx.lineTo(cx + r * 0.1, cy - r * 0.8); ctx.fill(); }
    if (ears === 'dog') { ctx.beginPath(); ctx.ellipse(cx - r * 0.95, cy - r * 0.1, r * 0.35, r * 0.7, 0.3, 0, Math.PI * 2); ctx.ellipse(cx + r * 0.95, cy - r * 0.1, r * 0.35, r * 0.7, -0.3, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.15, r * 0.12, 0, Math.PI * 2); ctx.arc(cx + r * 0.35, cy - r * 0.15, r * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = r * 0.08; ctx.beginPath(); ctx.arc(cx, cy + r * 0.15, r * 0.3, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
  };
  const star = (ctx, cx, cy, r, turn) => { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = turn + (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); } ctx.closePath(); ctx.fill(); };
  const heart = (ctx, cx, cy, s) => { ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.8); ctx.bezierCurveTo(cx - s * 1.6, cy - s * 0.3, cx - s * 0.6, cy - s * 1.3, cx, cy - s * 0.4); ctx.bezierCurveTo(cx + s * 0.6, cy - s * 1.3, cx + s * 1.6, cy - s * 0.3, cx, cy + s * 0.8); ctx.fill(); };
  const STICKERS = {
    'cat-hop': { label: '깡충 고양이', category: 'cat', tags: ['고양이', '점프', '깡충'], soundId: 'sfx-pop', draw: (ctx, k) => face(ctx, '#F59F00', 128, 150 - 60 * Math.abs(Math.sin(Math.PI * 2 * k)), 70, 'cat') },
    'dog-wag': { label: '갸웃 강아지', category: 'dog', tags: ['강아지', '갸웃'], soundId: null, draw: (ctx, k) => { ctx.save(); ctx.translate(128, 140); ctx.rotate(0.35 * Math.sin(Math.PI * 2 * k)); face(ctx, '#A47148', 0, 0, 70, 'dog'); ctx.restore(); } },
    'heart-pop': { label: '두근 하트', category: 'reaction', tags: ['하트', '좋아', '사랑'], soundId: 'sfx-ding', draw: (ctx, k) => { ctx.fillStyle = '#E8590C'; heart(ctx, 128, 128, 60 + 25 * ease(k * 2)); } },
    'star-spin': { label: '반짝 별', category: 'effect', tags: ['별', '반짝', '효과'], soundId: null, draw: (ctx, k) => { ctx.fillStyle = '#FCC419'; star(ctx, 128, 128, 90, Math.PI * 2 * k / 5); } },
  };
  const stickers = {};
  const canvas = new OffscreenCanvas(SIZE, SIZE); const ctx = canvas.getContext('2d');
  for (const [id, item] of Object.entries(STICKERS)) {
    const frames = [];
    for (let i = 0; i < FRAMES; i++) {
      ctx.clearRect(0, 0, SIZE, SIZE); item.draw(ctx, i / FRAMES);
      frames.push(new Uint8Array(await (await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 })).arrayBuffer()));
    }
    const bytes = buildAnimatedWebp(frames, SIZE, SIZE, 1000 / FPS);
    stickers[id] = { ...item, draw: undefined, base64: btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')), width: SIZE, height: SIZE, fps: FPS, durationMs: SECONDS * 1000 };
  }

  // 밈 영상: 640×360, 30fps, VP9 + Opus(소리 포함).
  async function clip({ seconds, draw, sound }) {
    const width = 640, height = 360, fps = 30;
    const surface = new OffscreenCanvas(width, height); const c = surface.getContext('2d');
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format: new mb.WebMOutputFormat(), target });
    const video = new mb.CanvasSource(surface, { codec: 'vp9', bitrate: 400_000, keyFrameInterval: 1 });
    const audio = new mb.AudioSampleSource({ codec: 'opus', bitrate: 64_000 });
    output.addVideoTrack(video, { frameRate: fps }); output.addAudioTrack(audio);
    await output.start();
    for (let k = 0; k < seconds * fps; k++) { draw(c, k / (seconds * fps), width, height); await video.add(k / fps, 1 / fps); }
    const rate = 48000, total = seconds * rate, data = new Float32Array(total * 2);
    for (let i = 0; i < total; i++) { const v = sound(i / rate); data[i] = v; data[total + i] = v; }
    const sample = new mb.AudioSample({ data, format: 'f32-planar', numberOfChannels: 2, sampleRate: rate, timestamp: 0 }); await audio.add(sample); sample.close();
    await output.finalize();
    return btoa(Array.from(new Uint8Array(target.buffer), b => String.fromCharCode(b)).join(''));
  }
  const clips = {
    'clip-boing': { label: '통통 공', category: 'reaction', tags: ['공', '통통', '띠용'], seconds: 2,
      draw: (c, k, w, h) => { c.fillStyle = '#74C0FC'; c.fillRect(0, 0, w, h); c.fillStyle = '#E64980'; c.beginPath(); c.arc(w / 2, h - 60 - 220 * Math.abs(Math.sin(Math.PI * 2 * k)), 50, 0, Math.PI * 2); c.fill(); },
      sound: t => { const local = t % 1; return 0.4 * Math.max(0, 1 - local / 0.4) * Math.sin(2 * Math.PI * (200 + 500 * Math.exp(-local * 8)) * local); } },
    'clip-wow': { label: '와아', category: 'reaction', tags: ['와', '놀람', '박수'], seconds: 2,
      draw: (c, k, w, h) => { c.fillStyle = '#FFE066'; c.fillRect(0, 0, w, h); c.fillStyle = '#5F3DC4'; c.font = `bold ${Math.round(80 + 80 * k)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('WOW', w / 2, h / 2); },
      sound: t => 0.3 * Math.min(1, t / 0.05) * Math.max(0, 1 - t / 2) * Math.sin(2 * Math.PI * (300 + 300 * t) * t) },
  };
  const videos = {};
  for (const [id, item] of Object.entries(clips)) videos[id] = { label: item.label, category: item.category, tags: item.tags, seconds: item.seconds, base64: await clip(item) };
  return { stickers, videos };
});
await browser.close();

await fs.mkdir(MEMES, { recursive: true });
const memes = { schemaVersion: 1, packId: 'placeholder', version: 1, assets: [] };
for (const [id, item] of Object.entries(made.stickers)) {
  const data = Buffer.from(item.base64, 'base64'); const file = `${id}.webp`;
  await fs.writeFile(path.join(MEMES, file), data);
  memes.assets.push({ id, kind: 'sticker', label: item.label, category: item.category, tags: item.tags, file, durationMs: item.durationMs, width: item.width, height: item.height, fps: item.fps, hasSound: !!item.soundId, soundId: item.soundId, sha256: sha256(data), license: LICENSE });
}
for (const [id, item] of Object.entries(made.videos)) {
  const data = Buffer.from(item.base64, 'base64'); const file = `${id}.webm`;
  await fs.writeFile(path.join(MEMES, file), data);
  memes.assets.push({ id, kind: 'clip', label: item.label, category: item.category, tags: item.tags, file, durationMs: item.seconds * 1000, width: 640, height: 360, fps: 30, hasSound: true, soundId: null, sha256: sha256(data), license: LICENSE });
}
await fs.writeFile(path.join(MEMES, 'manifest.json'), JSON.stringify(memes, null, 2) + '\n');
console.log(`밈 ${memes.assets.length}개`);
