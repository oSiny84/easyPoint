// 만화 그림 묶음(만화 계약 §7)을 만든다: 말풍선 9종, 효과 그림 12종.
// 그림은 모두 이 파일의 코드가 SVG로 그린다(다른 사람의 그림·글꼴을 쓰지 않는다). Chromium으로 PNG로 바꾸고,
// PNG에 License 글자 정보를 넣은 뒤 public/comic/manifest.json에 크기와 해시를 적는다.
//   node scripts/make-comic-assets.mjs [--out public/comic] [--preview artifacts/comic/assets.png]
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const arg = (name, fallback) => { const at = process.argv.indexOf(`--${name}`); return at > 0 ? process.argv[at + 1] : fallback; };
const outDir = arg('out', 'public/comic');
const previewPath = arg('preview', 'artifacts/comic/assets.png');
const LICENSE = 'CC0-1.0. CanvaCraft original artwork.';
const INK = '#111111';
const r1 = value => Math.round(value * 10) / 10;

// ---- 말풍선 ----
const BW = 512, BH = 400, STROKE = 8;
const onEllipse = (cx, cy, rx, ry, degrees) => [r1(cx + rx * Math.cos(degrees * Math.PI / 180)), r1(cy + ry * Math.sin(degrees * Math.PI / 180))];
// 타원과 꼬리를 한 줄로 그린다. 꼬리는 왼쪽 아래를 가리킨다(오른쪽 꼬리는 좌우를 뒤집는다).
function speechPath() {
  const cx = 256, cy = 172, rx = 244, ry = 160;
  const [ax, ay] = onEllipse(cx, cy, rx, ry, 104), [bx, by] = onEllipse(cx, cy, rx, ry, 128);
  return `M${ax} ${ay} L92 388 L${bx} ${by} A${rx} ${ry} 0 1 1 ${ax} ${ay} Z`;
}
function speech(dashed) {
  return `<path d="${speechPath()}" fill="#FFFFFF" stroke="${INK}" stroke-width="${STROKE}" stroke-linejoin="round"${dashed ? ' stroke-dasharray="20 14" stroke-linecap="round"' : ''}/>`;
}
// 구름: 원들을 테두리와 함께 그린 뒤 같은 원을 흰색으로 덮어 안쪽 선을 지운다.
function thought() {
  const puffs = [[130, 120, 84], [236, 92, 84], [346, 104, 86], [420, 172, 76], [352, 238, 84], [240, 252, 82], [132, 232, 80], [84, 174, 70], [256, 172, 120]];
  const outline = puffs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#FFFFFF" stroke="${INK}" stroke-width="${STROKE * 2}"/>`).join('');
  const fill = puffs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#FFFFFF"/>`).join('');
  const tail = [[118, 338, 22], [78, 376, 13]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#FFFFFF" stroke="${INK}" stroke-width="${STROKE}"/>`).join('');
  return outline + fill + tail;
}
// 외침: 뾰족한 가시가 둘러싼 모양. 왼쪽 아래 가시 하나를 길게 빼 꼬리로 쓴다.
function shout() {
  const cx = 256, cy = 176, spikes = 16; const points = [];
  for (let i = 0; i < spikes * 2; i++) {
    const degrees = i * 180 / spikes - 90; const outer = i % 2 === 0;
    const isTail = outer && Math.abs(degrees - 135) < 1;
    const rx = isTail ? 300 : outer ? 250 : 196, ry = isTail ? 300 : outer ? 170 : 126;
    points.push(onEllipse(cx, cy, rx, ry, degrees).join(','));
  }
  return `<polygon points="${points.join(' ')}" fill="#FFFFFF" stroke="${INK}" stroke-width="${STROKE}" stroke-linejoin="round"/>`;
}
const narration = `<rect x="6" y="6" width="500" height="228" rx="18" fill="#FFF8DC" stroke="${INK}" stroke-width="${STROKE}"/>`;
const mirrored = body => `<g transform="translate(${BW} 0) scale(-1 1)">${body}</g>`;

// ---- 효과 그림 ----
const random = seed => { let state = seed; return () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff; }; };
// 집중선: 바깥에서 가운데로 모이는 쐐기. 가운데는 비워 둔다. 칸 전체를 덮는 크기(16:9)다.
function focusLines() {
  const width = 1280, height = 720, cx = 640, cy = 360, next = random(7); const wedges = [];
  for (let i = 0; i < 90; i++) {
    const angle = (i + next() * 0.6) * (Math.PI * 2 / 90); const spread = 0.006 + next() * 0.012;
    const inner = 0.52 + next() * 0.22; const far = 900;
    const tip = [r1(cx + Math.cos(angle) * 640 * inner), r1(cy + Math.sin(angle) * 360 * inner)];
    const a = [r1(cx + Math.cos(angle - spread) * far), r1(cy + Math.sin(angle - spread) * far)];
    const b = [r1(cx + Math.cos(angle + spread) * far), r1(cy + Math.sin(angle + spread) * far)];
    wedges.push(`<polygon points="${tip.join(',')} ${a.join(',')} ${b.join(',')}" fill="${INK}"/>`);
  }
  return { width, height, body: wedges.join('') };
}
function speedLines() {
  const next = random(11); const lines = [];
  for (let i = 0; i < 12; i++) {
    const y = 16 + i * 23; const start = r1(next() * 150); const end = r1(330 + next() * 170); const thick = r1(4 + next() * 7);
    lines.push(`<line x1="${start}" y1="${y}" x2="${end}" y2="${y}" stroke="${INK}" stroke-width="${thick}" stroke-linecap="round"/>`);
  }
  return { width: 512, height: 300, body: lines.join('') };
}
const star4 = (cx, cy, r) => `M${cx} ${cy - r} Q${cx + r * 0.16} ${cy - r * 0.16} ${cx + r} ${cy} Q${cx + r * 0.16} ${cy + r * 0.16} ${cx} ${cy + r} Q${cx - r * 0.16} ${cy + r * 0.16} ${cx - r} ${cy} Q${cx - r * 0.16} ${cy - r * 0.16} ${cx} ${cy - r} Z`;
const sparkle = { width: 512, height: 512, body: [[200, 230, 180], [390, 120, 90], [380, 390, 110]].map(([x, y, r]) => `<path d="${star4(x, y, r)}" fill="#FFD43B" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`).join('') };
const drop = (cx, top, size) => `M${cx} ${top} C${cx + size * 0.9} ${top + size * 1.1} ${cx + size * 0.75} ${top + size * 1.9} ${cx} ${top + size * 1.9} C${cx - size * 0.75} ${top + size * 1.9} ${cx - size * 0.9} ${top + size * 1.1} ${cx} ${top} Z`;
const sweat = { width: 400, height: 512, body: [[130, 40, 150], [300, 190, 100]].map(([x, y, s]) => `<path d="${drop(x, y, s)}" fill="#74C0FC" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`).join('') };
// 화남 표시: 가운데에서 네 모서리로 휘는 굵은 선 네 개.
const anger = { width: 512, height: 512, body: [0, 90, 180, 270].map(turn => `<path d="M286 226 C286 150 330 106 420 100" transform="rotate(${turn} 256 256)" fill="none" stroke="${INK}" stroke-width="58" stroke-linecap="round"/>`).join('')
  + [0, 90, 180, 270].map(turn => `<path d="M286 226 C286 150 330 106 420 100" transform="rotate(${turn} 256 256)" fill="none" stroke="#FA5252" stroke-width="40" stroke-linecap="round"/>`).join('') };
const twoTone = (shapes, color) => shapes(INK, 76) + shapes(color, 56);
const question = { width: 360, height: 512, body: twoTone((stroke, width) => `<path d="M90 160 C90 60 270 60 270 160 C270 230 180 230 180 320" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/><line x1="180" y1="440" x2="180" y2="441" stroke="${stroke}" stroke-width="${width + 6}" stroke-linecap="round"/>`, '#4DABF7') };
const exclaim = { width: 200, height: 512, body: twoTone((stroke, width) => `<line x1="100" y1="64" x2="100" y2="310" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/><line x1="100" y1="440" x2="100" y2="441" stroke="${stroke}" stroke-width="${width + 6}" stroke-linecap="round"/>`, '#FA5252') };
const heart = { width: 512, height: 480, body: `<path d="M256 440 C60 300 20 190 60 110 C100 30 210 30 256 120 C302 30 412 30 452 110 C492 190 452 300 256 440 Z" fill="#FF6B9D" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>` };
function burst() {
  const next = random(23); const points = [];
  for (let i = 0; i < 24; i++) {
    const degrees = i * 15 - 90; const radius = i % 2 === 0 ? 215 + next() * 30 : 120 + next() * 30;
    points.push(onEllipse(256, 256, radius, radius, degrees).join(','));
  }
  return { width: 512, height: 512, body: `<polygon points="${points.join(' ')}" fill="#FFD43B" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/><polygon points="${points.map(point => { const [x, y] = point.split(',').map(Number); return `${r1(256 + (x - 256) * 0.55)},${r1(256 + (y - 256) * 0.55)}`; }).join(' ')}" fill="#FF922B"/>` };
}
function dizzy() {
  const points = [];
  for (let step = 0; step <= 200; step++) { const angle = step * 0.11; const radius = 14 + step * 1.1; points.push(`${r1(256 + Math.cos(angle) * radius)},${r1(256 + Math.sin(angle) * radius)}`); }
  return { width: 512, height: 512, body: `<polyline points="${points.join(' ')}" fill="none" stroke="${INK}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>` };
}
const zed = (x, y, size) => `<polyline points="${x},${y} ${x + size},${y} ${x},${y + size} ${x + size},${y + size}" fill="none" stroke="#5F3DC4" stroke-width="${r1(size * 0.22)}" stroke-linecap="round" stroke-linejoin="round"/>`;
const zzz = { width: 512, height: 512, body: zed(60, 290, 150) + zed(250, 150, 110) + zed(390, 50, 76) };
const note = { width: 400, height: 512, body: `<path d="M150 390 L150 90 L340 50 L340 350" fill="none" stroke="${INK}" stroke-width="22" stroke-linejoin="round" stroke-linecap="round"/><path d="M150 90 L340 50 L340 130 L150 170 Z" fill="${INK}"/><ellipse cx="104" cy="400" rx="62" ry="46" fill="${INK}" transform="rotate(-18 104 400)"/><ellipse cx="294" cy="360" rx="62" ry="46" fill="${INK}" transform="rotate(-18 294 360)"/>` };

const bubble = (id, label, body, inner, height = BH) => ({ id, kind: 'bubble', label, width: BW, height, body, inner, defaultWidth: 440, defaultHeight: Math.round(440 * height / BW) });
const effect = (id, label, art, defaultWidth) => ({ id, kind: 'effect', label, width: art.width, height: art.height, body: art.body, defaultWidth, defaultHeight: Math.round(defaultWidth * art.height / art.width) });
// inner: 글씨가 들어갈 네모(그림 크기에 대한 비율). 꼬리와 테두리를 피한다.
const OVAL = { x: 0.16, y: 0.16, width: 0.68, height: 0.52 };
const ITEMS = [
  bubble('bubble-speech-left', '말풍선 (왼쪽 꼬리)', speech(false), OVAL),
  bubble('bubble-speech-right', '말풍선 (오른쪽 꼬리)', mirrored(speech(false)), OVAL),
  bubble('bubble-thought-left', '생각 풍선 (왼쪽 꼬리)', thought(), { x: 0.2, y: 0.18, width: 0.6, height: 0.46 }),
  bubble('bubble-thought-right', '생각 풍선 (오른쪽 꼬리)', mirrored(thought()), { x: 0.2, y: 0.18, width: 0.6, height: 0.46 }),
  bubble('bubble-shout-left', '외침 풍선 (왼쪽 꼬리)', shout(), { x: 0.22, y: 0.22, width: 0.56, height: 0.42 }),
  bubble('bubble-shout-right', '외침 풍선 (오른쪽 꼬리)', mirrored(shout()), { x: 0.22, y: 0.22, width: 0.56, height: 0.42 }),
  bubble('bubble-whisper-left', '속삭임 풍선 (왼쪽 꼬리)', speech(true), OVAL),
  bubble('bubble-whisper-right', '속삭임 풍선 (오른쪽 꼬리)', mirrored(speech(true)), OVAL),
  bubble('bubble-narration', '해설 상자', narration, { x: 0.06, y: 0.12, width: 0.88, height: 0.76 }, 240),
  effect('effect-focus-lines', '집중선', focusLines(), 1280),
  effect('effect-speed-lines', '속도선', speedLines(), 420),
  effect('effect-sparkle', '반짝', sparkle, 220),
  effect('effect-sweat', '땀방울', sweat, 130),
  effect('effect-anger', '화남 표시', anger, 160),
  effect('effect-question', '물음표', question, 120),
  effect('effect-exclaim', '느낌표', exclaim, 70),
  effect('effect-heart', '하트', heart, 180),
  effect('effect-burst', '쾅 모양', burst(), 320),
  effect('effect-dizzy', '빙글빙글', dizzy(), 180),
  effect('effect-zzz', '쿨쿨', zzz, 200),
  effect('effect-note', '음표', note, 140),
];

// PNG의 IHDR 뒤에 tEXt 청크를 넣는다.
function withPngText(png, keyword, text) {
  const data = Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(text, 'latin1')]);
  const type = Buffer.from('tEXt', 'latin1');
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([type, data])) >>> 0);
  const afterHeader = 8 + 12 + png.readUInt32BE(8);
  return Buffer.concat([png.subarray(0, afterHeader), length, type, data, crc, png.subarray(afterHeader)]);
}

await fs.mkdir(path.join(outDir, 'svg'), { recursive: true });
await fs.mkdir(path.join(outDir, 'png'), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
const assets = [];
for (const item of ITEMS) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${item.width}" height="${item.height}" viewBox="0 0 ${item.width} ${item.height}">${item.body}</svg>`;
  await fs.writeFile(path.join(outDir, 'svg', `${item.id}.svg`), svg);
  await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
  const shot = await page.locator('svg').screenshot({ omitBackground: true });
  const png = withPngText(shot, 'License', LICENSE);
  await fs.writeFile(path.join(outDir, 'png', `${item.id}.png`), png);
  assets.push({ id: item.id, kind: item.kind, label: item.label, image: `/comic/png/${item.id}.png`, thumbnail: `/comic/png/${item.id}.png`, width: item.width, height: item.height,
    defaultWidth: item.defaultWidth, defaultHeight: item.defaultHeight, ...(item.inner ? { inner: item.inner } : {}), license: 'CC0-1.0', pngSha256: createHash('sha256').update(png).digest('hex'), byteLength: png.length });
}
await fs.writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, packId: 'canvacraft-comic', version: 1, license: LICENSE, assets }, null, 2)}\n`);

// 확인용: 회색 바탕에 모두 늘어놓은 그림.
await fs.mkdir(path.dirname(previewPath), { recursive: true });
const cells = await Promise.all(assets.map(async asset => `<figure style="margin:8px;width:200px;text-align:center;font:12px sans-serif"><img style="max-width:200px;max-height:150px" src="data:image/png;base64,${(await fs.readFile(path.join(outDir, 'png', `${asset.id}.png`))).toString('base64')}"><figcaption>${asset.id}</figcaption></figure>`));
await page.setContent(`<body style="margin:0;background:#B8C4CC;display:flex;flex-wrap:wrap;width:1300px">${cells.join('')}</body>`);
await page.screenshot({ path: previewPath, fullPage: true });
await browser.close();
console.log(`${assets.length}개 그림을 ${outDir}에 만들었다. 합계 ${assets.reduce((sum, asset) => sum + asset.byteLength, 0)}바이트. 확인용: ${previewPath}`);
