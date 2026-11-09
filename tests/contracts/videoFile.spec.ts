import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { createHash, randomBytes } from 'node:crypto';
import { mediaId, HASH_CHUNK_BYTES } from '../../src/storage/mediaHash';
import { readStoreZip, writeStoreZip } from '../../src/storage/storeZip';
import { deserializeVideoProject, serializeVideoProject } from '../../src/video/videoFile';
import type { Media, VideoProject } from '../../src/domain/videoTypes';
import { nextId } from './helpers';
import { caption, catalog, mediaA, mediaB, runVideo, startVideo, videoContent } from './videoHelpers';

// 영상 계약 §2 Media id(조각 해시)와 §6 원본 파일(.canvavideo, 자체 STORE ZIP)의 쓰기·읽기·검사.

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest();
// 계약의 정의를 node:crypto로 따로 계산한다.
function referenceId(data: Buffer) {
  const digests: Buffer[] = [];
  for (let offset = 0; offset < data.length; offset += HASH_CHUNK_BYTES) digests.push(sha256(data.subarray(offset, offset + HASH_CHUNK_BYTES)));
  return sha256(Buffer.concat(digests)).toString('hex');
}

test('Media id: 8MiB 조각 해시를 이어 붙여 다시 해시한다(조각 경계 포함)', async () => {
  for (const size of [1, 1000, HASH_CHUNK_BYTES - 1, HASH_CHUNK_BYTES, HASH_CHUNK_BYTES + 1, HASH_CHUNK_BYTES * 2 + 12345]) {
    const data = randomBytes(size);
    expect(await mediaId(new Blob([data]))).toBe(referenceId(data));
  }
  // 8MiB보다 작은 파일은 sha256(sha256(bytes))다. 전체 SHA-256과 다르다.
  const small = randomBytes(4096);
  expect(await mediaId(new Blob([small]))).toBe(sha256(sha256(small)).toString('hex'));
  expect(await mediaId(new Blob([small]))).not.toBe(sha256(small).toString('hex'));
});

// 실제 바이트가 든 작품: 가짜 영상 바이트 2개의 id를 조각 해시로 정한다.
async function projectWithBytes() {
  const bytes = new Map<string, Blob>();
  const make = async (template: Media, size: number) => { const data = randomBytes(size); const id = referenceId(data); bytes.set(id, new Blob([data])); return { ...template, id, byteLength: size }; };
  const a = await make(mediaA, 300_000), b = await make(mediaB, 120_000), unused = await make({ ...mediaA, durationMs: 4000 }, 50_000);
  const store = startVideo();
  runVideo(store, { type: 'addClip', media: a }); runVideo(store, { type: 'addClip', media: b });
  runVideo(store, { type: 'addClip', media: unused });
  runVideo(store, { type: 'deleteClip', clipId: store.getProject().clips[2].id });
  runVideo(store, caption(1000, 3000, '안녕 🐱'));
  runVideo(store, { type: 'renameProject', title: '우리 고양이' });
  return { project: store.getProject(), bytes, a, b, unused };
}

async function serialized(options: { forceZip64?: boolean } = {}) {
  const fixture = await projectWithBytes();
  const result = await serializeVideoProject(fixture.project, async id => fixture.bytes.get(id), options);
  if (!result.ok) throw new Error(result.message);
  return { ...fixture, file: result.blob };
}

for (const forceZip64 of [false, true]) test(`원본 왕복${forceZip64 ? '(ZIP64)' : ''}: 조각이 쓰는 영상만 넣고, 새 id·revision 0으로 같은 내용이 열린다`, async () => {
  const { project, file, a, b, unused, bytes } = await serialized({ forceZip64 });
  const opened = await deserializeVideoProject(file, nextId, catalog);
  if (!opened.ok) throw new Error(opened.message);
  expect(opened.project.id).not.toBe(project.id);
  expect(opened.project.revision).toBe(0);
  const expected = videoContent(project); expected.mediaManifest = expected.mediaManifest.filter((item: Media) => item.id !== unused.id);
  expect(videoContent(opened.project)).toEqual(expected);
  expect([...opened.media.keys()].sort()).toEqual([a.id, b.id].sort());
  for (const id of [a.id, b.id]) expect(Buffer.from(await opened.media.get(id)!.arrayBuffer()).equals(Buffer.from(await bytes.get(id)!.arrayBuffer()))).toBe(true);
  // 다른 ZIP 도구(JSZip)로도 같은 항목·CRC가 읽힌다.
  const zip = await JSZip.loadAsync(Buffer.from(await file.arrayBuffer()), { checkCRC32: true });
  expect(Object.keys(zip.files).sort()).toEqual(['manifest.json', `media/${a.id}.mp4`, `media/${b.id}.webm`, 'project.json'].sort());
  expect(JSON.parse(await zip.file('manifest.json')!.async('string'))).toEqual({ format: 'canvavideo', schemaVersion: 1 });
  expect((await zip.file(`media/${a.id}.mp4`)!.async('uint8array')).length).toBe(a.byteLength);
});

test('ZIP 끝 레코드: ZIP64가 필요 없으면 일반 ZIP으로 쓴다', async () => {
  const { file } = await serialized();
  const tail = Buffer.from(await file.slice(file.size - 22).arrayBuffer());
  expect(tail.readUInt32LE(0)).toBe(0x06054b50);
  expect(tail.readUInt16LE(10)).toBe(4);
  const zip64 = (await serialized({ forceZip64: true })).file;
  const tail64 = Buffer.from(await zip64.slice(zip64.size - 22 - 20).arrayBuffer());
  expect(tail64.readUInt32LE(0)).toBe(0x07064b50);
  expect(tail64.readUInt16LE(20 + 10)).toBe(0xffff);
});

async function rebuild(file: Blob, edit: (entries: { name: string; blob: Blob }[]) => { name: string; blob: Blob }[]) {
  const read = await readStoreZip(file, 100);
  if (!read.ok) throw new Error(read.reason);
  return writeStoreZip(edit(read.entries.map(entry => ({ name: entry.name, blob: entry.blob }))));
}
const json = (value: unknown) => new Blob([JSON.stringify(value)]);

test('원본 열기 실패: 문서·형식·항목이 맞지 않으면 열지 않는다', async () => {
  const { file, project, a } = await serialized();
  const open = (blob: Blob) => deserializeVideoProject(blob, nextId, catalog);
  const cases: [string, Promise<Blob>, string][] = [
    ['슬라이드 형식 표시', rebuild(file, entries => entries.map(e => e.name === 'manifest.json' ? { ...e, blob: json({ format: 'canvacraft', schemaVersion: 1 }) } : e)), 'INVALID_VALUE'],
    ['더 새로운 버전', rebuild(file, entries => entries.map(e => e.name === 'manifest.json' ? { ...e, blob: json({ format: 'canvavideo', schemaVersion: 2 }) } : e)), 'UNSUPPORTED_VERSION'],
    ['허용되지 않은 항목', rebuild(file, entries => [...entries, { name: 'notes.txt', blob: new Blob(['x']) }]), 'INVALID_VALUE'],
    ['상위 경로 항목', rebuild(file, entries => [...entries, { name: '../evil.mp4', blob: new Blob(['x']) }]), 'INVALID_VALUE'],
    ['문서가 쓰는 영상이 빠짐', rebuild(file, entries => entries.filter(e => !e.name.includes(a.id))), 'ASSET_MISSING'],
    ['영상 내용이 바뀜', rebuild(file, entries => entries.map(e => e.name.includes(a.id) ? { ...e, blob: new Blob([randomBytes(a.byteLength)]) } : e)), 'ASSET_INVALID'],
    ['영상 크기가 다름', rebuild(file, entries => entries.map(e => e.name.includes(a.id) ? { ...e, blob: e.blob.slice(1) } : e)), 'ASSET_INVALID'],
    ['문서 값 위반', rebuild(file, entries => entries.map(e => e.name === 'project.json' ? { ...e, blob: json({ ...project, fps: 60, mediaManifest: project.mediaManifest.filter(m => m.byteLength !== 50_000) }) } : e)), 'INVALID_VALUE'],
    ['JSON이 아님', rebuild(file, entries => entries.map(e => e.name === 'project.json' ? { ...e, blob: new Blob(['{']) } : e)), 'INVALID_VALUE'],
    ['같은 이름 항목 두 개', rebuild(file, entries => [...entries, entries[0]]), 'INVALID_VALUE'],
    ['항목 23개', rebuild(file, entries => [...entries, ...Array.from({ length: 19 }, (_, i) => ({ name: `x${i}`, blob: new Blob(['x']) }))]), 'LIMIT_EXCEEDED'],
    ['끝이 잘린 파일', Promise.resolve(file.slice(0, file.size - 10)), 'INVALID_VALUE'],
    ['ZIP이 아님', Promise.resolve(new Blob([randomBytes(5000)])), 'INVALID_VALUE'],
  ];
  for (const [name, blob, code] of cases) expect(await open(await blob), name).toMatchObject({ ok: false, code });
});

test('원본 열기 실패: 압축 항목·암호 표시·로컬 헤더 불일치는 ZIP 단계에서 거부한다', async () => {
  const { file } = await serialized();
  const read = await readStoreZip(file, 100); if (!read.ok) throw new Error(read.reason);
  // 같은 내용을 DEFLATE로 압축한 ZIP.
  const deflated = new JSZip();
  for (const entry of read.entries) deflated.file(entry.name, new Uint8Array(await entry.blob.arrayBuffer()), { compression: 'DEFLATE' });
  expect(await deserializeVideoProject(new Blob([await deflated.generateAsync({ type: 'uint8array' })]), nextId, catalog)).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  const bytes = Buffer.from(await file.arrayBuffer());
  const central = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  // 중앙 디렉터리에 암호 표시를 켠다.
  const encrypted = Buffer.from(bytes); encrypted.writeUInt16LE(encrypted.readUInt16LE(central + 8) | 1, central + 8);
  expect(await readStoreZip(new Blob([encrypted]), 100)).toEqual({ ok: false, reason: 'encrypted' });
  // 중앙 디렉터리의 크기만 바꾼다.
  const resized = Buffer.from(bytes); resized.writeUInt32LE(resized.readUInt32LE(central + 20) + 1, central + 20); resized.writeUInt32LE(resized.readUInt32LE(central + 24) + 1, central + 24);
  expect((await readStoreZip(new Blob([resized]), 100)).ok).toBe(false);
  // 첫 로컬 헤더의 이름을 바꾼다.
  const renamed = Buffer.from(bytes); renamed[30] = renamed[30] ^ 1;
  expect(await readStoreZip(new Blob([renamed]), 100)).toEqual({ ok: false, reason: 'local-name' });
});

test('원본 저장: 쓰는 영상의 바이트가 없으면 실패하고, 영상 합계 1GiB를 넘으면 임시 상한으로 거부한다', async () => {
  const { project, bytes } = await projectWithBytes();
  expect(await serializeVideoProject(project, async () => undefined)).toMatchObject({ ok: false, code: 'ASSET_MISSING' });
  expect(await serializeVideoProject(project, async id => bytes.get(id)?.slice(1))).toMatchObject({ ok: false, code: 'ASSET_MISSING' });
  const big = { ...project, mediaManifest: project.mediaManifest.map(media => ({ ...media, byteLength: 600 * 1024 * 1024 })) } as VideoProject;
  expect(await serializeVideoProject(big, async () => { throw new Error('읽으면 안 된다'); })).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED' });
});
