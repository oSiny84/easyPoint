// 압축 없는(STORE) ZIP 쓰기·읽기(영상 계약 §6 `.canvavideo`). 큰 영상을 메모리에 올리지 않는다.
// 쓰기는 헤더 바이트와 원본 Blob을 new Blob([...])으로 이어 붙이고, 읽기는 끝 레코드와 중앙 디렉터리만 읽은 뒤 항목을 Blob.slice로 꺼낸다.
// 4GiB를 넘는 크기·위치는 ZIP64로 쓴다. 이 모듈은 문서 내용을 모른다.
const SIG = { local: 0x04034b50, central: 0x02014b50, end: 0x06054b50, end64: 0x06064b50, locator64: 0x07064b50 } as const;
const MAX32 = 0xffffffff, MAX16 = 0xffff;
const UTF8_FLAG = 0x0800;
// 1980-01-01 00:00. 시각 정보는 넣지 않는다(앱 외 메타데이터 금지).
const DOS_TIME = 0, DOS_DATE = (0 << 9) | (1 << 5) | 1;

const CRC_TABLE = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } return table; })();

// CRC-32를 스트림으로 계산한다. 파일 전체를 메모리에 두지 않는다.
export async function crc32(blob: Blob, signal?: AbortSignal): Promise<number> {
  let crc = 0xffffffff;
  const reader = blob.stream().getReader();
  for (;;) {
    signal?.throwIfAborted();
    const { done, value } = await reader.read();
    if (done) break;
    for (let i = 0; i < value.length; i++) crc = CRC_TABLE[(crc ^ value[i]) & 255] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

class Bytes {
  private parts: number[] = [];
  u16(value: number) { this.parts.push(value & 255, (value >>> 8) & 255); return this; }
  u32(value: number) { for (let i = 0; i < 4; i++) this.parts.push(Math.floor(value / 2 ** (8 * i)) & 255); return this; }
  u64(value: number) { this.u32(value % 2 ** 32); return this.u32(Math.floor(value / 2 ** 32)); }
  raw(bytes: Uint8Array) { this.parts.push(...bytes); return this; }
  get length() { return this.parts.length; }
  build() { return new Uint8Array(this.parts); }
}

export type ZipInput = { name: string; blob: Blob };

// forceZip64는 작은 파일로 ZIP64 경로를 시험하기 위한 선택이다.
export async function writeStoreZip(entries: readonly ZipInput[], options: { forceZip64?: boolean; signal?: AbortSignal } = {}): Promise<Blob> {
  const parts: BlobPart[] = []; const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const size = entry.blob.size; const crc = await crc32(entry.blob, options.signal);
    const zip64 = !!options.forceZip64 || size >= MAX32 || offset >= MAX32;
    const version = zip64 ? 45 : 20;
    const localExtra = zip64 ? new Bytes().u16(0x0001).u16(16).u64(size).u64(size).build() : new Uint8Array();
    const local = new Bytes().u32(SIG.local).u16(version).u16(UTF8_FLAG).u16(0).u16(DOS_TIME).u16(DOS_DATE).u32(crc)
      .u32(zip64 ? MAX32 : size).u32(zip64 ? MAX32 : size).u16(name.length).u16(localExtra.length).raw(name).raw(localExtra).build();
    const centralExtra = zip64 ? new Bytes().u16(0x0001).u16(24).u64(size).u64(size).u64(offset).build() : new Uint8Array();
    central.push(new Bytes().u32(SIG.central).u16(version).u16(version).u16(UTF8_FLAG).u16(0).u16(DOS_TIME).u16(DOS_DATE).u32(crc)
      .u32(zip64 ? MAX32 : size).u32(zip64 ? MAX32 : size).u16(name.length).u16(centralExtra.length).u16(0).u16(0).u16(0).u32(0)
      .u32(zip64 ? MAX32 : offset).raw(name).raw(centralExtra).build());
    parts.push(local as BlobPart, entry.blob);
    offset += local.length + size;
  }
  const directorySize = central.reduce((sum, item) => sum + item.length, 0);
  const directoryOffset = offset;
  const zip64End = !!options.forceZip64 || directoryOffset >= MAX32 || directorySize >= MAX32 || entries.length >= MAX16;
  const tail = new Bytes();
  if (zip64End) {
    const end64Offset = directoryOffset + directorySize;
    tail.u32(SIG.end64).u64(44).u16(45).u16(45).u32(0).u32(0).u64(entries.length).u64(entries.length).u64(directorySize).u64(directoryOffset);
    tail.u32(SIG.locator64).u32(0).u64(end64Offset).u32(1);
  }
  tail.u32(SIG.end).u16(0).u16(0).u16(zip64End ? MAX16 : entries.length).u16(zip64End ? MAX16 : entries.length)
    .u32(zip64End ? MAX32 : directorySize).u32(zip64End ? MAX32 : directoryOffset).u16(0);
  return new Blob([...parts, ...central.map(item => item as BlobPart), tail.build() as BlobPart], { type: 'application/zip' });
}

export type ZipEntry = { name: string; crc: number; size: number; dataStart: number; blob: Blob };
export type ZipReadResult = { ok: true; entries: ZipEntry[] } | { ok: false; reason: string };

const view = async (blob: Blob, start: number, end: number) => new DataView(await blob.slice(start, end).arrayBuffer());
const u64 = (data: DataView, at: number) => data.getUint32(at, true) + data.getUint32(at + 4, true) * 2 ** 32;

// 확장 필드에서 ZIP64(0x0001) 값을 꺼낸다. 값은 기본 필드가 0xFFFFFFFF인 것만 순서대로 들어 있다.
function zip64Values(data: DataView, start: number, length: number, wanted: number) {
  for (let at = start; at + 4 <= start + length;) {
    const id = data.getUint16(at, true), size = data.getUint16(at + 2, true);
    if (at + 4 + size > start + length) return null;
    if (id === 0x0001) {
      if (size < wanted * 8) return null;
      return Array.from({ length: wanted }, (_, index) => u64(data, at + 4 + index * 8));
    }
    at += 4 + size;
  }
  return null;
}

// 항목 수·경로는 호출하는 쪽이 검사한다. 여기서는 STORE만 허용하고 중앙 디렉터리와 로컬 헤더의 크기·위치가 서로 맞는지 본다.
export async function readStoreZip(file: Blob, maxEntries: number): Promise<ZipReadResult> {
  const bad = (reason: string): ZipReadResult => ({ ok: false, reason });
  if (file.size < 22) return bad('too-small');
  const tailStart = Math.max(0, file.size - (22 + MAX16));
  const tail = await view(file, tailStart, file.size);
  let endAt = -1;
  for (let at = tail.byteLength - 22; at >= 0; at--) {
    if (tail.getUint32(at, true) === SIG.end && at + 22 + tail.getUint16(at + 20, true) === tail.byteLength) { endAt = at; break; }
  }
  if (endAt < 0) return bad('no-end');
  let count = tail.getUint16(endAt + 10, true), directorySize = tail.getUint32(endAt + 12, true), directoryOffset = tail.getUint32(endAt + 16, true);
  if (tail.getUint16(endAt + 4, true) !== 0 || tail.getUint16(endAt + 6, true) !== 0 || tail.getUint16(endAt + 8, true) !== count) return bad('multi-disk');
  let directoryEnd = tailStart + endAt;
  if (count === MAX16 || directorySize === MAX32 || directoryOffset === MAX32) {
    if (endAt < 20 || tail.getUint32(endAt - 20, true) !== SIG.locator64) return bad('no-zip64-locator');
    // 위치 표시: 서명(4) · 디스크(4) · ZIP64 끝 레코드 위치(8) · 디스크 수(4).
    const end64Offset = u64(tail, endAt - 12);
    if (end64Offset + 56 > tailStart + endAt - 20) return bad('zip64-range');
    const end64 = await view(file, end64Offset, end64Offset + 56);
    if (end64.getUint32(0, true) !== SIG.end64) return bad('no-zip64-end');
    if (u64(end64, 24) !== u64(end64, 32)) return bad('multi-disk');
    count = u64(end64, 32); directorySize = u64(end64, 40); directoryOffset = u64(end64, 48);
    directoryEnd = end64Offset;
  }
  if (count > maxEntries) return bad('too-many');
  if (directoryOffset + directorySize > directoryEnd) return bad('directory-range');
  const directory = await view(file, directoryOffset, directoryOffset + directorySize);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const entries: ZipEntry[] = []; const names = new Set<string>();
  let at = 0;
  for (let index = 0; index < count; index++) {
    if (at + 46 > directory.byteLength || directory.getUint32(at, true) !== SIG.central) return bad('central-header');
    const flags = directory.getUint16(at + 8, true), method = directory.getUint16(at + 10, true), crc = directory.getUint32(at + 16, true);
    let compressed = directory.getUint32(at + 20, true), size = directory.getUint32(at + 24, true);
    const nameLength = directory.getUint16(at + 28, true), extraLength = directory.getUint16(at + 30, true), commentLength = directory.getUint16(at + 32, true);
    let localOffset = directory.getUint32(at + 42, true);
    if (flags & 0x0041) return bad('encrypted');
    if (method !== 0) return bad('compressed');
    if (at + 46 + nameLength + extraLength + commentLength > directory.byteLength) return bad('central-range');
    let name: string;
    try { name = decoder.decode(new Uint8Array(directory.buffer, directory.byteOffset + at + 46, nameLength)); } catch { return bad('name'); }
    const wanted = [size, compressed, localOffset].filter(value => value === MAX32).length;
    if (wanted) {
      const values = zip64Values(directory, at + 46 + nameLength, extraLength, wanted);
      if (!values) return bad('zip64-extra');
      let next = 0;
      if (size === MAX32) size = values[next++];
      if (compressed === MAX32) compressed = values[next++];
      if (localOffset === MAX32) localOffset = values[next++];
    }
    if (compressed !== size) return bad('size-mismatch');
    if (names.has(name)) return bad('duplicate');
    names.add(name);
    // 로컬 헤더가 중앙 디렉터리와 같은 항목을 가리키는지 확인한다.
    if (localOffset + 30 > directoryOffset) return bad('local-range');
    const local = await view(file, localOffset, Math.min(directoryOffset, localOffset + 30 + nameLength + 0xffff));
    if (local.getUint32(0, true) !== SIG.local) return bad('local-header');
    if (local.getUint16(6, true) & 0x0041 || local.getUint16(8, true) !== 0) return bad('local-flags');
    if (local.getUint32(14, true) !== crc) return bad('local-crc');
    const localNameLength = local.getUint16(26, true), localExtraLength = local.getUint16(28, true);
    if (localNameLength !== nameLength || 30 + nameLength + localExtraLength > local.byteLength) return bad('local-range');
    for (let i = 0; i < nameLength; i++) if (local.getUint8(30 + i) !== directory.getUint8(at + 46 + i)) return bad('local-name');
    let localCompressed = local.getUint32(18, true), localSize = local.getUint32(22, true);
    if (localCompressed === MAX32 || localSize === MAX32) {
      const values = zip64Values(local, 30 + nameLength, localExtraLength, 2);
      if (!values) return bad('zip64-extra');
      [localSize, localCompressed] = values;
    }
    if (localSize !== size || localCompressed !== size) return bad('local-size');
    const dataStart = localOffset + 30 + nameLength + localExtraLength;
    if (dataStart + size > directoryOffset) return bad('data-range');
    entries.push({ name, crc, size, dataStart, blob: file.slice(dataStart, dataStart + size) });
    at += 46 + nameLength + extraLength + commentLength;
  }
  // 항목의 데이터 구간이 서로 겹치지 않아야 한다.
  const sorted = [...entries].sort((a, b) => a.dataStart - b.dataStart);
  for (let i = 1; i < sorted.length; i++) if (sorted[i - 1].dataStart + sorted[i - 1].size > sorted[i].dataStart) return bad('overlap');
  return { ok: true, entries };
}
