// 움직이는 스티커 후보 형식(애니메이션 WebP, APNG)을 캔버스 프레임으로 직접 조립한다. V2 시험 전용.
// 브라우저 캔버스는 정지 WebP·PNG만 만들 수 있으므로 각 프레임의 압축 데이터를 꺼내 애니메이션 컨테이너로 다시 묶는다.

type Chunk = { type: string; data: Uint8Array };

function u32le(value: number) { return [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >>> 24) & 255]; }
function u24le(value: number) { return [value & 255, (value >> 8) & 255, (value >> 16) & 255]; }
function u32be(value: number) { return [(value >>> 24) & 255, (value >> 16) & 255, (value >> 8) & 255, value & 255]; }
function ascii(text: string) { return Array.from(text, c => c.charCodeAt(0)); }
function concat(parts: (Uint8Array | number[])[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total); let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

// ---- WebP ----
function riffChunks(bytes: Uint8Array): Chunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' || String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP') throw new Error('WebP가 아니에요.');
  const chunks: Chunk[] = [];
  for (let at = 12; at + 8 <= bytes.length;) {
    const type = String.fromCharCode(...bytes.subarray(at, at + 4)); const size = view.getUint32(at + 4, true);
    chunks.push({ type, data: bytes.subarray(at + 8, at + 8 + size) });
    at += 8 + size + (size & 1);
  }
  return chunks;
}
function riffChunk(type: string, data: Uint8Array | number[]) {
  return concat([ascii(type), u32le(data.length), data, data.length & 1 ? [0] : []]);
}

export function buildAnimatedWebp(frames: Uint8Array[], width: number, height: number, frameMs: number) {
  const anmf = frames.map(frame => {
    // 프레임 비트스트림(ALPH + VP8 또는 VP8L)만 옮긴다.
    const payload = riffChunks(frame).filter(chunk => chunk.type === 'ALPH' || chunk.type === 'VP8 ' || chunk.type === 'VP8L');
    if (!payload.length) throw new Error('WebP 프레임 데이터가 없어요.');
    const header = [...u24le(0), ...u24le(0), ...u24le(width - 1), ...u24le(height - 1), ...u24le(frameMs), 0b11];
    return riffChunk('ANMF', concat([header, ...payload.map(chunk => riffChunk(chunk.type, chunk.data))]));
  });
  const vp8x = riffChunk('VP8X', [0x10 | 0x02, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)]);
  const anim = riffChunk('ANIM', [0, 0, 0, 0, 0, 0]);
  const body = concat([ascii('WEBP'), vp8x, anim, ...anmf]);
  return concat([ascii('RIFF'), u32le(body.length), body]);
}

// ---- APNG ----
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
})();
function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunks(bytes: Uint8Array): Chunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Chunk[] = [];
  for (let at = 8; at + 12 <= bytes.length;) {
    const size = view.getUint32(at); const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    chunks.push({ type, data: bytes.subarray(at + 8, at + 8 + size) });
    at += 12 + size;
  }
  return chunks;
}
function pngChunk(type: string, data: Uint8Array | number[]) {
  const typed = concat([ascii(type), data]);
  return concat([u32be(data.length), typed, u32be(crc32(typed))]);
}

export function buildApng(frames: Uint8Array[], width: number, height: number, fps: number) {
  const first = pngChunks(frames[0]);
  const ihdr = first.find(chunk => chunk.type === 'IHDR');
  if (!ihdr) throw new Error('PNG 헤더가 없어요.');
  let sequence = 0;
  const parts: Uint8Array[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr.data), pngChunk('acTL', [...u32be(frames.length), ...u32be(0)])];
  frames.forEach((frame, index) => {
    // 지연 1/fps초, 다음 프레임 전에 지우고(dispose=1) 덮어쓴다(blend=0).
    parts.push(pngChunk('fcTL', [...u32be(sequence++), ...u32be(width), ...u32be(height), ...u32be(0), ...u32be(0), 0, 1, 0, fps, 1, 0]));
    for (const chunk of pngChunks(frame).filter(item => item.type === 'IDAT')) {
      parts.push(index === 0 ? pngChunk('IDAT', chunk.data) : pngChunk('fdAT', concat([u32be(sequence++), chunk.data])));
    }
  });
  parts.push(pngChunk('IEND', []));
  return concat(parts);
}

// 투명 배경에서 고양이 얼굴 비슷한 원이 튀는 자리 표시 스티커 프레임.
export function drawStickerFrame(ctx: OffscreenCanvasRenderingContext2D, size: number, index: number, count: number) {
  ctx.clearRect(0, 0, size, size);
  const phase = (index / count) * Math.PI * 2;
  const cx = size / 2 + Math.cos(phase) * size * 0.2, cy = size / 2 + Math.sin(phase * 2) * size * 0.15, r = size * 0.22;
  ctx.fillStyle = '#f5a623';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - r, cy - r * 0.3); ctx.lineTo(cx - r * 0.7, cy - r * 1.4); ctx.lineTo(cx - r * 0.2, cy - r * 0.9); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + r, cy - r * 0.3); ctx.lineTo(cx + r * 0.7, cy - r * 1.4); ctx.lineTo(cx + r * 0.2, cy - r * 0.9); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.1, r * 0.1, 0, Math.PI * 2); ctx.arc(cx + r * 0.35, cy - r * 0.1, r * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.font = `bold ${Math.round(size * 0.1)}px sans-serif`; ctx.fillText(String(index), 8, size * 0.12);
}
