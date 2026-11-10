// 직접 그린 그림을 영상 편집기 내장 밈으로 바꾼다(사용자 결정 2026-11-10: 밈은 우리가 그린 그림).
// 설정 파일(assets-src/drawings/drawings.json)의 항목마다 그림 파일을 읽어 배경을 빼고 흰 테두리를 두른 뒤
//   - kind 'sticker': 움직임 하나를 붙인 2초 반복 애니메이션 WebP(384×384, 25fps)
//   - kind 'clip': 색 배경·글자·효과음을 넣은 밈 영상(640×360, 30fps, VP9+Opus)
// 을 만들고 public/memes/manifest.json에 넣는다(같은 ID는 바꾸고, hide 목록의 ID는 hidden으로 숨긴다).
// 확인용 띠 그림은 artifacts/drawings/<id>.png에 남긴다. Vite 개발 서버를 스스로 띄운다(따로 npm run dev를 하지 않아도 된다).
//   node scripts/make-drawing-memes.mjs [--config assets-src/drawings/drawings.json] [--out public/memes] [--preview artifacts/drawings] [--only id1,id2]
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const arg = (name, fallback) => { const at = process.argv.indexOf(`--${name}`); return at > 0 ? process.argv[at + 1] : fallback; };
const configPath = arg('config', 'assets-src/drawings/drawings.json');
const outDir = arg('out', 'public/memes');
const previewDir = arg('preview', 'artifacts/drawings');
const only = arg('only', null)?.split(',');
const sha256 = data => createHash('sha256').update(data).digest('hex');

const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const base = path.dirname(configPath);
const sounds = JSON.parse(await fs.readFile('public/sounds/manifest.json', 'utf8'));
const sfx = new Map(sounds.sfx.map(item => [item.id, item]));
const MOTIONS = ['hop', 'wag', 'pop', 'spin', 'wiggle', 'float', 'shake', 'dance', 'zoom'];
const CATEGORIES = ['cat', 'dog', 'reaction', 'effect'];

// 설정 검사: 틀린 곳을 모두 모아 한 번에 알려 준다.
const problems = [];
const items = config.items ?? [];
const seen = new Set();
for (const [index, item] of items.entries()) {
  const where = `items[${index}] ${item.id ?? ''}`;
  if (!/^[a-z0-9-]{1,64}$/.test(item.id ?? '')) problems.push(`${where}: id는 영문 소문자·숫자·-만 쓴다`);
  if (seen.has(item.id)) problems.push(`${where}: id가 겹친다`); seen.add(item.id);
  if (!['sticker', 'clip'].includes(item.kind)) problems.push(`${where}: kind는 sticker 또는 clip`);
  if (!item.label) problems.push(`${where}: label(패널에 보일 이름)이 없다`);
  if (!CATEGORIES.includes(item.category)) problems.push(`${where}: category는 ${CATEGORIES.join('·')} 중 하나`);
  if (!MOTIONS.includes(item.motion)) problems.push(`${where}: motion은 ${MOTIONS.join('·')} 중 하나`);
  if (item.kind === 'sticker' && item.soundId != null && !sfx.has(item.soundId)) problems.push(`${where}: soundId ${item.soundId}가 효과음 목록에 없다`);
  if (item.kind === 'clip') {
    if (!Number.isInteger(item.seconds ?? 2) || (item.seconds ?? 2) < 1 || (item.seconds ?? 2) > 10) problems.push(`${where}: seconds는 1~10 정수`);
    for (const sound of item.sounds ?? []) if (!sfx.has(sound.id)) problems.push(`${where}: sounds의 ${sound.id}가 효과음 목록에 없다`);
  }
  try { await fs.access(path.join(base, item.file ?? '')); } catch { problems.push(`${where}: 그림 파일 ${item.file}이 없다(${base} 기준)`); }
}
for (const id of config.hide ?? []) if (typeof id !== 'string') problems.push(`hide: 문자열 ID만 쓴다`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

// 효과음 WAV(48kHz 16비트 모노) → 숫자 배열.
async function pcm(id) {
  const bytes = await fs.readFile(path.join('public/sounds', sfx.get(id).file));
  const out = new Array((bytes.length - 44) / 2);
  for (let i = 0; i < out.length; i++) out[i] = bytes.readInt16LE(44 + i * 2) / 32768;
  return out;
}

const server = await createServer({ logLevel: 'warn', server: { host: '127.0.0.1', port: 5199, strictPort: false } });
await server.listen();
const browser = await chromium.launch();
const made = [];
try {
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  await fs.mkdir(outDir, { recursive: true }); await fs.mkdir(previewDir, { recursive: true });
  for (const item of items) {
    if (only && !only.includes(item.id)) continue;
    const image = (await fs.readFile(path.join(base, item.file))).toString('base64');
    const clipSounds = item.kind === 'clip' ? await Promise.all((item.sounds ?? []).map(async sound => ({ at: sound.at ?? 0, samples: await pcm(sound.id) }))) : [];
    const result = await page.evaluate(async ({ item, image, clipSounds }) => {
      const { cutout, renderSticker, renderClip, contactSheet } = await import('/scripts/drawing/cutout.js');
      const toBase64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(image), c => c.charCodeAt(0))]));
      const cut = cutout(bitmap, item.cutout ?? {});
      const made = item.kind === 'sticker' ? await renderSticker(cut.canvas, item.motion) : await renderClip(cut.canvas, item, clipSounds);
      const cutPng = new Uint8Array(await (await cut.canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
      return { bytes: toBase64(made.bytes), sheet: toBase64(await contactSheet(made.strip, item.kind === 'sticker')), cut: toBase64(cutPng), digital: cut.digital, source: [bitmap.width, bitmap.height] };
    }, { item, image, clipSounds });
    const data = Buffer.from(result.bytes, 'base64');
    const file = `${item.id}.${item.kind === 'sticker' ? 'webp' : 'webm'}`;
    await fs.writeFile(path.join(outDir, file), data);
    await fs.writeFile(path.join(previewDir, `${item.id}.png`), Buffer.from(result.sheet, 'base64'));
    await fs.writeFile(path.join(previewDir, `${item.id}-cut.png`), Buffer.from(result.cut, 'base64'));
    const license = item.license ?? config.license ?? 'CanvaCraft 사용자 가족이 직접 그린 그림. 외부 권리 없음';
    const common = { id: item.id, kind: item.kind, label: item.label, category: item.category, tags: item.tags ?? [], file };
    made.push(item.kind === 'sticker'
      ? { ...common, durationMs: 2000, width: 384, height: 384, fps: 25, hasSound: item.soundId != null, soundId: item.soundId ?? null, sha256: sha256(data), license }
      : { ...common, durationMs: (item.seconds ?? 2) * 1000, width: 640, height: 360, fps: 30, hasSound: (item.sounds ?? []).length > 0, soundId: null, sha256: sha256(data), license });
    console.log(`${item.id}: ${result.digital ? '투명 PNG' : '종이 사진'} ${result.source.join('×')} → ${file} ${(data.length / 1024).toFixed(0)}KB`);
  }
} finally {
  await browser.close();
  await server.close();
}

// manifest 합치기: 같은 ID는 바꾸고 새 ID는 뒤에 붙인다. hidden은 hide 목록으로만 정한다.
const manifestPath = path.join(outDir, 'manifest.json');
let manifest;
try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); } catch { manifest = { schemaVersion: 1, packId: 'canvacraft-video-memes', version: 1, assets: [] }; }
for (const entry of made) {
  const at = manifest.assets.findIndex(asset => asset.id === entry.id);
  if (at >= 0) manifest.assets[at] = entry; else manifest.assets.push(entry);
}
const hide = new Set(config.hide ?? []);
manifest.assets = manifest.assets.map(({ hidden, ...asset }) => (hide.has(asset.id) ? { ...asset, hidden: true } : asset));
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`밈 ${made.length}개를 만들었다. 목록 전체 ${manifest.assets.length}개(숨김 ${manifest.assets.filter(asset => asset.hidden).length}개). 확인용 그림: ${previewDir}`);
