// 장 묶음 문서(애니메이션·만화)의 원본 파일 공통 틀(애니메이션 계약 §6, 만화 계약 §6).
// 내부는 manifest.json, project.json, assets/<hash>.png|jpg만 허용한다. 슬라이드 원본 파일(storage/projectFile.ts)과 같은 검사를 하고,
// ZIP을 한도를 세며 푸는 함수는 그쪽 것을 불러 쓴다. format 값이 달라 편집기들은 서로의 파일을 열지 않는다.
import JSZip from 'jszip';
import { readImageHeader, sha256Hex } from '../assets/imageHeader';
import { LIMITS } from '../domain/limits';
import { fail, type Failure, type Project } from '../domain/types';
import { declaredEntryCount, ENTRY, extensionOf, referencedAssets, unpack, type AssetResolver } from '../storage/projectFile';

export type DeckFileConfig<P extends Project> = {
  // manifest.json의 format 값과 지금 판이 쓰는 schemaVersion.
  format: string; schemaVersion: number;
  validate: (value: unknown) => { ok: true; project: P } | Failure;
  // format이 다른 파일을 넣었을 때의 안내.
  wrongFormat: string;
};
export type DeckCandidate<P> = { ok: true; project: P; assets: Map<string, Blob> };
const invalid = (message: string) => fail('INVALID_VALUE', message);

export function createDeckFile<P extends Project>(config: DeckFileConfig<P>) {
  async function serialize(project: P, resolve: AssetResolver): Promise<{ ok: true; blob: Blob } | Failure> {
    // 문서가 실제로 참조하는 사진만 파일에 넣는다.
    const assets = referencedAssets(project);
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ format: config.format, schemaVersion: config.schemaVersion }));
    zip.file('project.json', JSON.stringify({ ...project, assetManifest: assets }));
    for (const asset of assets) {
      const blob = await resolve(asset.id);
      if (!blob) return fail('ASSET_MISSING', '사진 자료를 찾을 수 없어 저장하지 못했어요.');
      // 사진은 이미 압축되어 있으므로 다시 압축하지 않는다.
      zip.file(`assets/${asset.id}.${extensionOf(asset.mime)}`, new Uint8Array(await blob.arrayBuffer()), { compression: 'STORE' });
    }
    return { ok: true, blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/zip' }) };
  }

  // 새 작품 후보를 돌려준다. 검사를 모두 통과하기 전에는 현재 작품에 아무 영향도 주지 않는다.
  async function deserialize(source: Blob | Uint8Array, newId: () => string): Promise<DeckCandidate<P> | Failure> {
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
    if (!head || head.format !== config.format || typeof head.schemaVersion !== 'number') return invalid(config.wrongFormat);
    if (head.schemaVersion > config.schemaVersion) return fail('UNSUPPORTED_VERSION', '더 새로운 버전에서 만든 작품이라 열 수 없어요.');

    const checked = config.validate(parsed.value);
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

  return { serialize, deserialize };
}
