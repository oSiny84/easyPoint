// 그림 → 움직이는 밈 변환의 브라우저 쪽 코드. scripts/make-drawing-memes.mjs가 Vite 개발 서버로 띄운 Chromium 안에서 부른다.
// 제품 코드가 아니다(결과 파일만 public/memes에 들어간다).
//  - cutout: 종이에 그린 그림 사진이면 조명을 고르게 펴서 종이를 하얗게 만들고, 바깥 종이를 투명하게 뺀 뒤 흰 테두리를 두른다.
//    이미 투명 배경인 PNG(CanvaCraft 그리기 등)는 투명도를 그대로 쓴다.
//  - renderSticker: 움직임 하나를 붙여 2초 반복 애니메이션 WebP를 만든다(계약 §5: 512² 이하, 1~5초, 투명).
//  - renderClip: 색 배경 + 그림 + 글자 + 효과음으로 짧은 밈 영상(640×360 30fps VP9+Opus)을 만든다.
import { buildAnimatedWebp } from '../../src/videoprobe/animated.ts';

const TAU = Math.PI * 2;
const ease = x => 0.5 - 0.5 * Math.cos(TAU * x);

// ---- 배경 빼기 ----
// 종이 밝기: 칸마다 밝은 쪽 10% 픽셀의 평균 색. 그림이 칸을 거의 채워 어두운 칸은 이웃 칸 값으로 메운다.
function paperLight(d, w, h) {
  const B = Math.max(8, Math.round(Math.max(w, h) / 24));
  const gx = Math.ceil(w / B), gy = Math.ceil(h / B);
  const grid = new Float32Array(gx * gy * 3), lum = new Float32Array(gx * gy);
  for (let by = 0; by < gy; by++) for (let bx = 0; bx < gx; bx++) {
    const counts = new Uint32Array(256), sums = new Float64Array(256 * 3); let total = 0;
    for (let y = by * B; y < Math.min(h, (by + 1) * B); y++) for (let x = bx * B; x < Math.min(w, (bx + 1) * B); x++) {
      const i = (y * w + x) * 4, L = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      counts[L]++; sums[L * 3] += d[i]; sums[L * 3 + 1] += d[i + 1]; sums[L * 3 + 2] += d[i + 2]; total++;
    }
    let taken = 0, r = 0, g = 0, b = 0;
    for (let L = 255; L >= 0 && taken < total * 0.1; L--) { taken += counts[L]; r += sums[L * 3]; g += sums[L * 3 + 1]; b += sums[L * 3 + 2]; }
    const k = by * gx + bx; grid[k * 3] = r / taken; grid[k * 3 + 1] = g / taken; grid[k * 3 + 2] = b / taken;
    lum[k] = 0.299 * grid[k * 3] + 0.587 * grid[k * 3 + 1] + 0.114 * grid[k * 3 + 2];
  }
  const sorted = [...lum].sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
  let valid = Array.from(lum, value => value >= median * 0.6);
  for (let guard = 0; valid.some(v => !v) && guard < gx + gy; guard++) {
    const next = valid.slice();
    for (let by = 0; by < gy; by++) for (let bx = 0; bx < gx; bx++) {
      const k = by * gx + bx; if (valid[k]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = bx + dx, y = by + dy; if (x < 0 || y < 0 || x >= gx || y >= gy) continue;
        const j = y * gx + x; if (!valid[j]) continue; r += grid[j * 3]; g += grid[j * 3 + 1]; b += grid[j * 3 + 2]; n++;
      }
      if (n) { grid[k * 3] = r / n; grid[k * 3 + 1] = g / n; grid[k * 3 + 2] = b / n; next[k] = true; }
    }
    valid = next;
  }
  // 칸 중심 사이를 선형 보간한다.
  const out = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(gy - 1, Math.max(0, (y + 0.5) / B - 0.5)), y0 = Math.floor(fy), y1 = Math.min(gy - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(gx - 1, Math.max(0, (x + 0.5) / B - 0.5)), x0 = Math.floor(fx), x1 = Math.min(gx - 1, x0 + 1), tx = fx - x0;
      for (let c = 0; c < 3; c++) {
        const a = grid[(y0 * gx + x0) * 3 + c] * (1 - tx) + grid[(y0 * gx + x1) * 3 + c] * tx;
        const b = grid[(y1 * gx + x0) * 3 + c] * (1 - tx) + grid[(y1 * gx + x1) * 3 + c] * tx;
        out[(y * w + x) * 3 + c] = Math.max(1, a * (1 - ty) + b * ty);
      }
    }
  }
  return out;
}

function morph(mask, w, h, radius, dilate) {
  const pass = (src, horizontal) => {
    const dst = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let value = dilate ? 0 : 1;
      for (let o = -radius; o <= radius; o++) {
        const xx = horizontal ? x + o : x, yy = horizontal ? y : y + o;
        const v = xx < 0 || yy < 0 || xx >= w || yy >= h ? (dilate ? 0 : 1) : src[yy * w + xx];
        if (dilate ? v : !v) { value = dilate ? 1 : 0; break; }
      }
      dst[y * w + x] = value;
    }
    return dst;
  };
  return pass(pass(mask, true), false);
}

// 가장자리에서 이어진 빈 곳만 바깥(투명)으로 본다. 그림 안쪽의 흰 곳(눈 등)은 남는다.
function fillHoles(mask, w, h) {
  const outside = new Uint8Array(w * h), stack = [];
  const push = i => { if (!mask[i] && !outside[i]) { outside[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i - x) / w;
    if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w);
  }
  return Uint8Array.from(outside, v => 1 - v);
}

// 먼지·종이 결 같은 작은 덩어리를 지운다. edgeLimit가 있으면 사진 가장자리에 길게 닿은 덩어리(함께 찍힌 책상·그림자)도 지운다.
function removeSpecks(mask, w, h, minSize, edgeLimit = Infinity) {
  const label = new Int32Array(w * h).fill(-1), stack = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || label[start] >= 0) continue;
    const members = []; label[start] = start; stack.push(start);
    while (stack.length) {
      const i = stack.pop(); members.push(i); const x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx; if (mask[j] && label[j] < 0) { label[j] = start; stack.push(j); }
      }
    }
    const onEdge = members.reduce((count, i) => { const x = i % w, y = (i - x) / w; return count + (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 1 : 0); }, 0);
    if (members.length < minSize || onEdge > edgeLimit) for (const i of members) mask[i] = 0;
  }
}

// 3-4 chamfer 거리(픽셀 단위 근사).
function distance(mask, w, h) {
  const INF = 1e9, d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? 0 : INF;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? INF : d[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4); }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4); }
  for (let i = 0; i < w * h; i++) d[i] /= 3;
  return d;
}

export function cutout(bitmap, options = {}) {
  const o = { maxSide: 1024, ink: 0.8, chroma: 60, fill: true, border: 0.03, speck: 0.002, crop: null, ...options };
  const [cx, cy, cw, ch] = o.crop ? [o.crop[0] * bitmap.width, o.crop[1] * bitmap.height, o.crop[2] * bitmap.width, o.crop[3] * bitmap.height] : [0, 0, bitmap.width, bitmap.height];
  const scale = Math.min(1, o.maxSide / Math.max(cw, ch));
  const w = Math.max(1, Math.round(cw * scale)), h = Math.max(1, Math.round(ch * scale)), n = w * h;
  const work = new OffscreenCanvas(w, h), wctx = work.getContext('2d', { willReadFrequently: true });
  wctx.drawImage(bitmap, cx, cy, cw, ch, 0, 0, w, h);
  const image = wctx.getImageData(0, 0, w, h), d = image.data;
  let see = 0; for (let i = 0; i < n; i++) if (d[i * 4 + 3] < 128) see++;
  const digital = see > n * 0.02;
  let mask = new Uint8Array(n);
  if (digital) {
    for (let i = 0; i < n; i++) mask[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
  } else {
    const paper = paperLight(d, w, h);
    for (let i = 0; i < n; i++) {
      const r = d[i * 4] / paper[i * 3], g = d[i * 4 + 1] / paper[i * 3 + 1], b = d[i * 4 + 2] / paper[i * 3 + 2];
      d[i * 4] = Math.min(255, r * 255); d[i * 4 + 1] = Math.min(255, g * 255); d[i * 4 + 2] = Math.min(255, b * 255);
      const L = 0.299 * r + 0.587 * g + 0.114 * b, C = (Math.max(r, g, b) - Math.min(r, g, b)) * 255;
      mask[i] = L < o.ink || C > o.chroma ? 1 : 0;
    }
    const close = Math.max(1, Math.round(Math.max(w, h) / 400));
    mask = morph(morph(mask, w, h, close, true), w, h, close, false);
    // 함께 찍힌 책상·그림자를 먼저 빼야 종이 바깥에서 안쪽 빈 곳을 구분할 수 있다.
    removeSpecks(mask, w, h, 0, 0.1 * 2 * (w + h));
    if (o.fill) mask = fillHoles(mask, w, h);
  }
  removeSpecks(mask, w, h, o.speck * n);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) throw new Error('그림을 찾지 못했어요. 종이 밖이 함께 찍혔거나 너무 흐린지 확인하세요.');
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, r = Math.round(o.border * Math.max(bw, bh)), pad = r + 2;
  const ow = bw + 2 * pad, oh = bh + 2 * pad;
  const local = new Uint8Array(ow * oh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) local[(y + pad) * ow + x + pad] = mask[(y + y0) * w + x + x0];
  const dist = r > 0 ? distance(local, ow, oh) : null;
  const out = new ImageData(ow, oh);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const j = y * ow + x, k = j * 4;
    if (local[j]) {
      const sx = x - pad + x0, sy = y - pad + y0, i = (sy * w + sx) * 4, a = digital ? d[i + 3] / 255 : 1;
      // 투명 PNG는 반투명 가장자리를 흰 테두리 위에 겹친다.
      const under = r > 0 ? 255 : 0, ua = r > 0 ? 1 : 0;
      const alpha = a + ua * (1 - a);
      for (let c = 0; c < 3; c++) out.data[k + c] = alpha ? (d[i + c] * a + under * ua * (1 - a)) / alpha : 0;
      out.data[k + 3] = Math.round(alpha * 255);
    } else if (dist) {
      const alpha = Math.max(0, Math.min(1, r + 0.5 - dist[j]));
      out.data[k] = out.data[k + 1] = out.data[k + 2] = 255; out.data[k + 3] = Math.round(alpha * 255);
    }
  }
  const canvas = new OffscreenCanvas(ow, oh); canvas.getContext('2d').putImageData(out, 0, 0);
  return { canvas, digital, size: [w, h], box: [x0, y0, bw, bh] };
}

// ---- 움직임: k는 0~1(2초 한 바퀴). x·y는 그림 상자 대비, rot는 라디안, anchor는 회전·크기 기준점 ----
export const MOTIONS = {
  hop: { label: '깡충', fit: 0.7, cy: 0.56, at: k => { const up = Math.abs(Math.sin(TAU * k)); const squash = 0.1 * Math.max(0, 1 - up * 5); return { y: -0.2 * up, sx: 1 + squash, sy: 1 - squash, anchor: 'bottom' }; } },
  wag: { label: '갸웃', fit: 0.66, cy: 0.5, at: k => ({ rot: 0.22 * Math.sin(TAU * k), anchor: 'bottom' }) },
  pop: { label: '두근', fit: 0.7, cy: 0.5, at: k => { const s = 1 + 0.13 * ease(2 * k); return { sx: s, sy: s }; } },
  spin: { label: '빙글', fit: 0.66, cy: 0.5, at: k => ({ rot: TAU * k }) },
  wiggle: { label: '꼼지락', fit: 0.72, cy: 0.5, at: k => ({ rot: 0.12 * Math.sin(TAU * 4 * k) }) },
  float: { label: '둥실', fit: 0.72, cy: 0.5, at: k => ({ y: 0.07 * Math.sin(TAU * k), rot: 0.05 * Math.cos(TAU * k) }) },
  shake: { label: '부들', fit: 0.74, cy: 0.5, at: k => ({ x: 0.03 * Math.sin(TAU * 8 * k) }) },
  dance: { label: '들썩', fit: 0.68, cy: 0.54, at: k => ({ rot: 0.15 * Math.sin(TAU * 2 * k), y: -0.08 * Math.abs(Math.sin(TAU * 2 * k)), anchor: 'bottom' }) },
  zoom: { label: '쑥쑥', fit: 0.7, cy: 0.5, at: k => { const s = 0.8 + 0.28 * ease(k); return { sx: s, sy: s }; } },
};

// 상자(boxW×boxH, 가운데 (cx, cy))에 그림을 맞추고 움직임을 적용해 그린다.
function drawMoving(ctx, art, motion, k, cx, cy, boxW, boxH) {
  const m = MOTIONS[motion], f = m.at(k);
  const scale = Math.min((boxW * m.fit) / art.width, (boxH * m.fit) / art.height);
  const dw = art.width * scale, dh = art.height * scale;
  const ox = cx + (f.x ?? 0) * boxW, oy = cy + (m.cy - 0.5) * boxH + (f.y ?? 0) * boxH;
  ctx.save();
  if (f.anchor === 'bottom') { ctx.translate(ox, oy + dh / 2); ctx.rotate(f.rot ?? 0); ctx.scale(f.sx ?? 1, f.sy ?? 1); ctx.drawImage(art, -dw / 2, -dh, dw, dh); }
  else { ctx.translate(ox, oy); ctx.rotate(f.rot ?? 0); ctx.scale(f.sx ?? 1, f.sy ?? 1); ctx.drawImage(art, -dw / 2, -dh / 2, dw, dh); }
  ctx.restore();
}

export async function renderSticker(art, motion, { size = 384, fps = 25, seconds = 2 } = {}) {
  const canvas = new OffscreenCanvas(size, size), ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const total = fps * seconds, frames = [], strip = [];
  for (let i = 0; i < total; i++) {
    ctx.clearRect(0, 0, size, size);
    drawMoving(ctx, art, motion, i / total, size / 2, size / 2, size, size);
    frames.push(new Uint8Array(await (await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 })).arrayBuffer()));
    if (i % Math.round(total / 6) === 0 && strip.length < 6) strip.push(await createImageBitmap(canvas));
  }
  return { bytes: buildAnimatedWebp(frames, size, size, 1000 / fps), strip };
}

// 확인용 띠 그림: 프레임 6장을 체크무늬 위에 나란히 놓는다.
export async function contactSheet(strip, checker = true) {
  const cell = 160, pad = 8, w = strip.length * (cell + pad) + pad, h = cell + pad * 2;
  const canvas = new OffscreenCanvas(w, h), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e9ecef'; ctx.fillRect(0, 0, w, h);
  strip.forEach((frame, i) => {
    const x = pad + i * (cell + pad), ch = Math.round((cell * frame.height) / frame.width), y = pad + (cell - ch) / 2;
    if (checker) for (let yy = 0; yy < ch; yy += 10) for (let xx = 0; xx < cell; xx += 10) { ctx.fillStyle = (xx + yy) % 20 ? '#ced4da' : '#ffffff'; ctx.fillRect(x + xx, y + yy, 10, 10); }
    ctx.drawImage(frame, x, y, cell, ch);
  });
  return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
}

// ---- 밈 영상 ----
function tint(hex, amount) {
  const v = parseInt(hex.slice(1), 16), mix = c => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(v >> 16)}, ${mix((v >> 8) & 255)}, ${mix(v & 255)})`;
}
function drawBackground(c, w, h, color, pattern, t) {
  c.fillStyle = color; c.fillRect(0, 0, w, h);
  c.fillStyle = tint(color, 0.35);
  if (pattern === 'rays') {
    c.save(); c.translate(w / 2, h / 2); c.rotate(t * 0.6);
    for (let i = 0; i < 12; i++) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, w, (i * TAU) / 12, ((i + 0.5) * TAU) / 12); c.closePath(); c.fill(); }
    c.restore();
  } else if (pattern === 'dots') {
    const step = 48, shift = (t * 24) % step;
    for (let y = -step; y < h + step; y += step) for (let x = -step; x < w + step; x += step) { c.beginPath(); c.arc(x + shift + ((y / step) % 2 ? step / 2 : 0), y + shift, 9, 0, TAU); c.fill(); }
  }
}
function drawText(c, text, x, y, size, t) {
  const pop = t < 0.3 ? 0.4 + 2 * t : 1 + 0.04 * Math.sin(TAU * 2 * (t - 0.3));
  c.save(); c.translate(x, y); c.scale(pop, pop);
  c.font = `bold ${size}px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.lineWidth = size * 0.16; c.strokeStyle = '#212529'; c.strokeText(text, 0, 0);
  c.fillStyle = '#ffffff'; c.fillText(text, 0, 0);
  c.restore();
}

export async function renderClip(art, item, sounds) {
  const mb = await import('/node_modules/mediabunny/dist/modules/src/index.js');
  const width = 640, height = 360, fps = 30, seconds = item.seconds ?? 2, total = seconds * fps;
  const loops = Math.max(1, Math.round(seconds / 2));
  const surface = new OffscreenCanvas(width, height), c = surface.getContext('2d');
  c.imageSmoothingQuality = 'high';
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.WebMOutputFormat(), target });
  const video = new mb.CanvasSource(surface, { codec: 'vp9', bitrate: 600_000, keyFrameInterval: 1 });
  const audio = new mb.AudioSampleSource({ codec: 'opus', bitrate: 64_000 });
  output.addVideoTrack(video, { frameRate: fps }); output.addAudioTrack(audio);
  await output.start();
  const strip = [];
  const textAt = item.text ? (item.textAt ?? 'bottom') : null;
  const artBox = textAt === 'top' ? [width / 2, height * 0.6, width * 0.8, height * 0.72] : textAt === 'bottom' ? [width / 2, height * 0.4, width * 0.8, height * 0.72] : [width / 2, height / 2, width * 0.9, height * 0.95];
  for (let i = 0; i < total; i++) {
    const t = i / fps;
    drawBackground(c, width, height, item.background ?? '#FFE066', item.pattern ?? 'rays', t);
    drawMoving(c, art, item.motion, ((i / total) * loops) % 1, ...artBox);
    if (item.text) drawText(c, item.text, width / 2, textAt === 'top' ? height * 0.14 : height * 0.86, 56, t);
    await video.add(t, 1 / fps);
    if (i % Math.round(total / 6) === 0 && strip.length < 6) strip.push(await createImageBitmap(surface));
  }
  const rate = 48000, length = seconds * rate, data = new Float32Array(length * 2);
  for (const { at, samples } of sounds) {
    const start = Math.round(at * rate);
    for (let i = 0; i < samples.length && start + i < length; i++) { data[start + i] += samples[i]; data[length + start + i] += samples[i]; }
  }
  for (let i = 0; i < data.length; i++) data[i] = Math.max(-1, Math.min(1, data[i]));
  const sample = new mb.AudioSample({ data, format: 'f32-planar', numberOfChannels: 2, sampleRate: rate, timestamp: 0 });
  await audio.add(sample); sample.close();
  await output.finalize();
  return { bytes: new Uint8Array(target.buffer), strip };
}
