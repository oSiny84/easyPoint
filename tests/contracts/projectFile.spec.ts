import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import zlib from 'node:zlib';
import { readImageHeader, sha256Hex } from '../../src/assets/imageHeader';
import { LIMITS } from '../../src/domain/limits';
import { deserializeProject, referencedAssets, serializeProject } from '../../src/storage/projectFile';
import { downloadName } from '../../src/storage/fileName';
import { contentOf, loadSample, nextId, sampleAssets } from './helpers';

const blobs = () => new Map([...sampleAssets()].map(([id, bytes]) => [id, new Blob([bytes])]));
const resolver = () => { const map = blobs(); return async (id: string) => map.get(id); };

async function sampleZip() {
  const project = loadSample(); const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format: 'canvacraft', schemaVersion: 1 }));
  zip.file('project.json', JSON.stringify(project));
  for (const asset of project.assetManifest) zip.file(`assets/${asset.id}.${asset.mime === 'image/png' ? 'png' : 'jpg'}`, sampleAssets().get(asset.id)!);
  return { zip, project };
}
const bytesOf = (zip: JSZip) => zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

test('샘플 사진의 해시·형식·크기가 자료 목록과 같다', async () => {
  const project = loadSample(); const files = sampleAssets();
  expect(files.size).toBe(project.assetManifest.length);
  for (const asset of project.assetManifest) {
    const bytes = files.get(asset.id)!;
    expect(await sha256Hex(bytes)).toBe(asset.id);
    expect(bytes.length).toBe(asset.byteLength);
    expect(readImageHeader(bytes)).toEqual({ mime: asset.mime, width: asset.pixelWidth, height: asset.pixelHeight, animated: false });
  }
});

test('원본 왕복: 내용과 사진이 같고 새 작품 ID·revision 0으로 열린다', async () => {
  const project = { ...loadSample(), revision: 7 };
  const saved = await serializeProject(project, resolver());
  expect(saved.ok).toBe(true); if (!saved.ok) return;
  const opened = await deserializeProject(saved.blob, nextId);
  expect(opened.ok).toBe(true); if (!opened.ok) return;
  expect(contentOf(opened.project)).toEqual(contentOf(project));
  expect(opened.project.id).not.toBe(project.id); expect(opened.project.revision).toBe(0);
  for (const [id, blob] of opened.assets) expect(await sha256Hex(new Uint8Array(await blob.arrayBuffer()))).toBe(id);
  expect(opened.assets.size).toBe(project.assetManifest.length);
});

test('참조하지 않는 자료는 파일에 넣지 않는다', async () => {
  const project = loadSample(); project.slides[1].background = { kind: 'solid', color: '#FFFFFF' };
  expect(referencedAssets(project).length).toBe(1);
  const saved = await serializeProject(project, resolver()); if (!saved.ok) throw new Error(saved.message);
  const zip = await JSZip.loadAsync(await saved.blob.arrayBuffer());
  expect(Object.keys(zip.files).filter(name => name.startsWith('assets/') && !zip.files[name].dir).length).toBe(1);
  expect(await deserializeProject(saved.blob, nextId)).toMatchObject({ ok: true });
});

test('사진이 없으면 저장을 성공으로 위장하지 않는다', async () => {
  expect(await serializeProject(loadSample(), async () => undefined)).toMatchObject({ ok: false, code: 'ASSET_MISSING' });
});

const corrupt: [string, (zip: JSZip, project: any) => void | Promise<void>, string][] = [
  ['허용되지 않은 항목', zip => { zip.file('evil.exe', 'x'); }, 'INVALID_VALUE'],
  ['상위 경로', zip => { zip.file('../evil.png', 'x'); }, 'INVALID_VALUE'],
  ['절대 경로', zip => { zip.file('/assets/evil.png', 'x'); }, 'INVALID_VALUE'],
  ['manifest 없음', zip => { zip.remove('manifest.json'); }, 'INVALID_VALUE'],
  ['project 없음', zip => { zip.remove('project.json'); }, 'INVALID_VALUE'],
  ['manifest 형식', zip => { zip.file('manifest.json', '{"format":"other","schemaVersion":1}'); }, 'INVALID_VALUE'],
  ['새로운 파일 버전', zip => { zip.file('manifest.json', '{"format":"canvacraft","schemaVersion":9}'); }, 'UNSUPPORTED_VERSION'],
  ['깨진 JSON', zip => { zip.file('project.json', '{oops'); }, 'INVALID_VALUE'],
  ['잘못된 좌표', (zip, project) => { project.slides[0].elements[0].x = 'x'; zip.file('project.json', JSON.stringify(project)); }, 'INVALID_VALUE'],
  ['사진 누락', (zip, project) => { zip.remove(`assets/${project.assetManifest[0].id}.jpg`); }, 'ASSET_MISSING'],
  ['목록에 없는 사진', zip => { zip.file(`assets/${'0'.repeat(64)}.png`, 'x'); }, 'ASSET_MISSING'],
  ['사진 내용 바꿔치기', (zip, project) => { const [asset] = project.assetManifest; const fake = new Uint8Array(asset.byteLength); zip.file(`assets/${asset.id}.jpg`, fake); }, 'ASSET_INVALID'],
  ['사진 크기 표시 불일치', (zip, project) => { const [asset] = project.assetManifest; zip.file(`assets/${asset.id}.jpg`, new Uint8Array(10)); }, 'ASSET_INVALID'],
];
for (const [name, change, code] of corrupt) test(`손상 파일 거부: ${name} → ${code}`, async () => {
  const { zip, project } = await sampleZip(); await change(zip, project);
  expect(await deserializeProject(await bytesOf(zip), nextId)).toMatchObject({ ok: false, code });
});

test('자료의 선언 형식과 크기가 파일 헤더와 다르면 거부한다', async () => {
  // 해시는 맞게 두고 픽셀 크기만 속인다.
  const { zip, project } = await sampleZip(); project.assetManifest[0].pixelWidth = 400; project.assetManifest[0].pixelHeight = 300;
  zip.file('project.json', JSON.stringify(project));
  expect(await deserializeProject(await bytesOf(zip), nextId)).toMatchObject({ ok: false, code: 'ASSET_INVALID' });
});

// JSZip은 같은 이름을 만들 수 없으므로 압축 없는 ZIP을 직접 쓴다.
function rawZip(entries: [string, Uint8Array][]) {
  const encoder = new TextEncoder(); const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = encoder.encode(name); const crc = zlib.crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    const entry = Buffer.concat([local, nameBytes, data]); locals.push(entry); offset += entry.length;
    centrals.push(Buffer.concat([central, nameBytes]));
  }
  const directory = Buffer.concat(centrals); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

test('이름이 같은 항목이 있는 ZIP은 거부한다', async () => {
  const project = loadSample(); const files = sampleAssets(); const encoder = new TextEncoder();
  const entries: [string, Uint8Array][] = [['manifest.json', encoder.encode(JSON.stringify({ format: 'canvacraft', schemaVersion: 1 }))], ['project.json', encoder.encode(JSON.stringify(project))]];
  for (const asset of project.assetManifest) entries.push([`assets/${asset.id}.${asset.mime === 'image/png' ? 'png' : 'jpg'}`, files.get(asset.id)!]);
  // 직접 쓴 ZIP이 정상적으로 열리는지 먼저 확인해 중복 검사만 시험되게 한다.
  expect(await deserializeProject(rawZip(entries), nextId)).toMatchObject({ ok: true });
  entries.push(['project.json', encoder.encode(JSON.stringify({ ...project, title: '바꿔치기' }))]);
  expect(await deserializeProject(rawZip(entries), nextId)).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
});

test('ZIP이 아니거나 비어 있으면 거부한다', async () => {
  expect(await deserializeProject(new Uint8Array([1, 2, 3, 4]), nextId)).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
  expect(await deserializeProject(await bytesOf(new JSZip()), nextId)).toMatchObject({ ok: false, code: 'INVALID_VALUE' });
});

test('헤더 크기 표시와 달리 실제로 큰 JSON은 푸는 중에 멈춘다', async () => {
  const { zip } = await sampleZip();
  zip.file('project.json', '{"x":"' + 'a'.repeat(LIMITS.zipJsonBytes + 10) + '"}');
  expect(await deserializeProject(await bytesOf(zip), nextId)).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED' });
});

test('이미지 헤더: 손상·잘린 파일은 null', () => {
  expect(readImageHeader(new Uint8Array(0))).toBeNull();
  expect(readImageHeader(new Uint8Array([0xff, 0xd8]))).toBeNull();
  expect(readImageHeader(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  expect(readImageHeader(new TextEncoder().encode('GIF89a this is not supported'))).toBeNull();
});

const names: [string, string][] = [
  ['우리 가족: 소개?', '우리 가족 소개.pptx'], ['', '내 작품.pptx'], ['   ', '내 작품.pptx'], ['...', '내 작품.pptx'], ['끝 공백. ', '끝 공백.pptx'],
  ['CON', 'CON 작품.pptx'], ['a/b\\c*d"e<f>g|h', 'a b c d e f g h.pptx'], ['줄\n바꿈\t탭', '줄 바꿈 탭.pptx'],
];
for (const [title, expected] of names) test(`파일 이름: ${JSON.stringify(title)}`, () => expect(downloadName(title, 'pptx')).toBe(expected));
