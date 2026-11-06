// 파일 앞부분에서 실제 형식과 픽셀 크기를 읽는다. 디코딩하지 않으므로 초대형 이미지로 메모리를 쓰지 않는다.
export type ImageHeader = { mime: 'image/png' | 'image/jpeg' | 'image/webp'; width: number; height: number; animated: boolean };

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));

function readPng(bytes: Uint8Array, view: DataView): ImageHeader | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || ascii(bytes, 1, 3) !== 'PNG' || ascii(bytes, 12, 4) !== 'IHDR') return null;
  // 움직이는 PNG는 첫 이미지 데이터 앞에 acTL 청크가 있다.
  let animated = false; let offset = 8;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset + 4, 4);
    if (type === 'acTL') { animated = true; break; }
    if (type === 'IDAT' || type === 'IEND') break;
    offset += 12 + view.getUint32(offset);
  }
  return { mime: 'image/png', width: view.getUint32(16), height: view.getUint32(20), animated };
}

function readJpeg(bytes: Uint8Array, view: DataView): ImageHeader | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  // 표식을 따라가 프레임 시작(SOF) 표식에서 크기를 읽는다.
  let offset = 2;
  while (offset + 9 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) { offset += 1; continue; }
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return { mime: 'image/jpeg', height: view.getUint16(offset + 5), width: view.getUint16(offset + 7), animated: false };
    if (marker === 0xd9 || marker === 0xda) return null;
    offset += 2 + view.getUint16(offset + 2);
  }
  return null;
}

function readWebp(bytes: Uint8Array, view: DataView): ImageHeader | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
  const kind = ascii(bytes, 12, 4);
  const u24 = (at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
  if (kind === 'VP8X') return { mime: 'image/webp', width: u24(24) + 1, height: u24(27) + 1, animated: (bytes[20] & 0x02) !== 0 };
  if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { mime: 'image/webp', width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff, animated: false };
  if (kind === 'VP8L' && bytes[20] === 0x2f) { const bits = view.getUint32(21, true); return { mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, animated: false }; }
  return null;
}

export function readImageHeader(bytes: Uint8Array): ImageHeader | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try { return readPng(bytes, view) ?? readJpeg(bytes, view) ?? readWebp(bytes, view); }
  catch { return null; }
}

// iPhone 사진 등 HEIC 형식인지 본다. 지원하지 않는다는 안내를 정확히 하기 위해 쓴다.
export function isHeic(bytes: Uint8Array) {
  return bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp' && ['heic', 'heix', 'hevc', 'mif1', 'msf1', 'heif'].includes(ascii(bytes, 8, 4));
}

// PNG의 tEXt 청크 값을 읽는다. 내장 그림의 라이선스 고지를 출력물에 옮길 때 쓴다.
export function readPngText(bytes: Uint8Array, keyword: string): string | null {
  if (bytes.length < 8 || bytes[0] !== 0x89 || ascii(bytes, 1, 3) !== 'PNG') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset); const type = ascii(bytes, offset + 4, 4);
    if (type === 'tEXt') {
      const data = bytes.subarray(offset + 8, offset + 8 + length); const split = data.indexOf(0);
      if (split > 0 && ascii(data, 0, split) === keyword) return new TextDecoder('latin1').decode(data.subarray(split + 1));
    }
    if (type === 'IEND') return null;
    offset += 12 + length;
  }
  return null;
}

export async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
