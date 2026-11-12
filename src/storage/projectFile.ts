// 원본 파일(.canvacraft). 내부는 manifest.json, project.json, assets/<hash>.png|jpg만 허용한다(계약 §5).
import JSZip from 'jszip';
import { readImageHeader, sha256Hex } from '../assets/imageHeader';
import { LIMITS, SCHEMA_VERSION } from '../domain/limits';
import { fail, type Asset, type Failure, type Project } from '../domain/types';
import { validateProject } from '../domain/validate';

export type AssetResolver = (assetId: string) => Promise<Blob | undefined>;
const FORMAT = 'canvacraft';
export const extensionOf = (mime: Asset['mime']) => mime === 'image/png' ? 'png' : 'jpg';
export const ENTRY = /^assets\/([0-9a-f]{64})\.(png|jpg)$/;
const invalid = (message: string) => fail('INVALID_VALUE', message);

// 문서가 실제로 참조하는 사진만 파일에 넣는다.
export function referencedAssets(project: Project) {
  const used = new Set<string>();
  for (const slide of project.slides) {
    if (slide.background.kind === 'image') used.add(slide.background.assetId);
    for (const element of slide.elements) if (element.type === 'image') used.add(element.assetId);
  }
  return project.assetManifest.filter(asset => used.has(asset.id));
}

export async function serializeProject(project: Project, resolve: AssetResolver): Promise<{ ok: true; blob: Blob } | Failure> {
  const assets = referencedAssets(project);
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format: FORMAT, schemaVersion: SCHEMA_VERSION }));
  zip.file('project.json', JSON.stringify({ ...project, assetManifest: assets }));
  for (const asset of assets) {
    const blob = await resolve(asset.id);
    if (!blob) return fail('ASSET_MISSING', '사진 자료를 찾을 수 없어 저장하지 못했어요.');
    // 사진은 이미 압축되어 있으므로 다시 압축하지 않는다.
    zip.file(`assets/${asset.id}.${extensionOf(asset.mime)}`, new Uint8Array(await blob.arrayBuffer()), { compression: 'STORE' });
  }
  return { ok: true, blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/zip' }) };
}

// ZIP 끝 레코드의 항목 수. JSZip은 같은 이름을 하나로 합치므로 중복 항목을 이 값과 비교해 찾는다.
export function declaredEntryCount(bytes: Uint8Array) {
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b && bytes[offset + 2] === 0x05 && bytes[offset + 3] === 0x06) return bytes[offset + 10] | (bytes[offset + 11] << 8);
  }
  return null;
}

// 헤더의 크기 표시를 믿지 않고 실제로 풀린 바이트를 세다가 한도를 넘으면 멈춘다.
export function unpack(file: JSZip.JSZipObject, budget: { left: number }): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []; let total = 0; let stopped = false;
    // internalStream은 JSZip 타입 정의에 없지만 조각 단위로 풀어 주는 공개 동작이다(3.10.2 고정).
    const stream = (file as unknown as { internalStream(type: 'uint8array'): { on(event: string, listener: (value: never) => void): unknown; pause(): void; resume(): void } }).internalStream('uint8array');
    stream.on('data', (chunk: Uint8Array) => {
      if (stopped) return;
      total += chunk.length; budget.left -= chunk.length;
      if (budget.left < 0) { stopped = true; stream.pause(); resolve(null); return; }
      chunks.push(chunk);
    });
    stream.on('error', reject as (value: never) => void);
    stream.on('end', () => {
      if (stopped) return;
      const out = new Uint8Array(total); let at = 0;
      for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
      resolve(out);
    });
    stream.resume();
  });
}

export type ProjectCandidate = { ok: true; project: Project; assets: Map<string, Blob> };

// 새 작품 후보를 돌려준다. 검사를 모두 통과하기 전에는 현재 작품에 아무 영향도 주지 않는다.
export async function deserializeProject(source: Blob | Uint8Array, newId: () => string): Promise<ProjectCandidate | Failure> {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(await source.arrayBuffer());
  if (bytes.length > LIMITS.zipBytes) return fail('LIMIT_EXCEEDED', '작품 파일이 너무 커요.');
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); }
  catch { return invalid('작품 파일을 읽지 못했어요. 파일이 손상됐거나 암호가 걸려 있어요.'); }

  const names = Object.keys(zip.files);
  if (names.length > LIMITS.zipEntries) return fail('LIMIT_EXCEEDED', '작품 파일 안의 항목이 너무 많아요.');
  if (declaredEntryCount(bytes) !== names.length) return invalid('작품 파일에 중복된 항목이 있어요.');
  for (const name of names) {
    if (zip.files[name].dir ? name !== 'assets/' : name !== 'manifest.json' && name !== 'project.json' && !ENTRY.test(name)) return invalid('작품 파일에 허용되지 않은 항목이 있어요.');
  }
  if (!zip.files['manifest.json'] || !zip.files['project.json']) return invalid('작품 파일에 필요한 항목이 없어요.');

  const budget = { left: LIMITS.zipUnpackedBytes };
  const jsonBudget = { left: LIMITS.zipJsonBytes };
  const readJson = async (name: string) => {
    const raw = await unpack(zip.files[name], jsonBudget);
    if (!raw) return { tooBig: true as const };
    budget.left -= raw.length;
    try { return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)) as unknown }; }
    catch { return { value: undefined }; }
  };
  let manifest, parsed;
  try { manifest = await readJson('manifest.json'); parsed = await readJson('project.json'); }
  catch { return invalid('작품 파일을 읽지 못했어요.'); }
  if ('tooBig' in manifest || 'tooBig' in parsed) return fail('LIMIT_EXCEEDED', '작품 파일의 문서가 너무 커요.');
  const head = manifest.value as { format?: unknown; schemaVersion?: unknown } | undefined;
  if (!head || head.format !== FORMAT || typeof head.schemaVersion !== 'number') return invalid('CanvaCraft 작품 파일이 아니에요.');
  if (head.schemaVersion > SCHEMA_VERSION) return fail('UNSUPPORTED_VERSION', '더 새로운 버전에서 만든 작품이라 열 수 없어요.');

  const checked = validateProject(parsed.value);
  if (!checked.ok) return checked;
  const { project } = checked;

  // 파일 목록과 문서의 자료 목록이 정확히 같아야 한다.
  const expected = new Map(project.assetManifest.map(asset => [`assets/${asset.id}.${extensionOf(asset.mime)}`, asset]));
  const present = names.filter(name => ENTRY.test(name));
  if (present.length !== expected.size || present.some(name => !expected.has(name))) return fail('ASSET_MISSING', '작품 파일의 사진 자료가 문서와 맞지 않아요.');

  const assets = new Map<string, Blob>();
  for (const [name, asset] of expected) {
    let data: Uint8Array | null;
    try { data = await unpack(zip.files[name], budget); }
    catch { return fail('ASSET_INVALID', '작품 파일의 사진을 읽지 못했어요.'); }
    if (!data) return fail('LIMIT_EXCEEDED', '작품 파일의 압축을 풀면 너무 커요.');
    if (data.length !== asset.byteLength) return fail('ASSET_INVALID', '사진 파일 크기가 문서와 달라요.');
    if (await sha256Hex(data) !== asset.id) return fail('ASSET_INVALID', '사진 파일 내용이 문서와 달라요.');
    const header = readImageHeader(data);
    if (!header || header.mime !== asset.mime || header.width !== asset.pixelWidth || header.height !== asset.pixelHeight) return fail('ASSET_INVALID', '사진 형식이나 크기가 문서와 달라요.');
    assets.set(asset.id, new Blob([new Uint8Array(data)], { type: asset.mime }));
  }
  // 새 작품으로 가져온다. 파일의 revision은 출처 정보일 뿐이므로 0에서 시작한다.
  return { ok: true, project: { ...project, id: newId(), revision: 0 }, assets };
}
