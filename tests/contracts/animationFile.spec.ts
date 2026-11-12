import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { deserializeAnimation, serializeAnimation } from '../../src/animation/animationFile';
import { LIMITS } from '../../src/domain/limits';
import { deserializeProject, serializeProject } from '../../src/storage/projectFile';
import { animationContent, loadAnimationSample } from './animationHelpers';
import { ids, loadSample, nextId, sampleAssets } from './helpers';

// 애니메이션 계약 §6 원본 파일(.canvaanim): 왕복, 형식 구분, 손상 파일. 슬라이드 원본 파일과 같은 검사를 한다.
const blobs = () => new Map([...sampleAssets()].map(([id, bytes]) => [id, new Blob([bytes])]));
const resolver = () => { const map = blobs(); return async (id: string) => map.get(id); };

async function sampleZip(mutate?: (project: Record<string, unknown>) => void) {
  const project = loadAnimationSample() as unknown as Record<string, unknown>; mutate?.(project);
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format: 'canvaanimation', schemaVersion: 1 }));
  zip.file('project.json', JSON.stringify(project));
  for (const asset of loadAnimationSample().assetManifest) zip.file(`assets/${asset.id}.${asset.mime === 'image/png' ? 'png' : 'jpg'}`, sampleAssets().get(asset.id)!);
  return zip;
}
const bytesOf = (zip: JSZip) => zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

test('원본 왕복: 내용·빠르기·음악·길게 보이기·사진이 같고 새 작품 ID·revision 0으로 열린다', async () => {
  const project = { ...loadAnimationSample(), revision: 7, fps: 12 as const, musicId: 'music-walk', musicVolume: 1 as const };
  const saved = await serializeAnimation(project, resolver());
  expect(saved.ok).toBe(true); if (!saved.ok) return;
  const opened = await deserializeAnimation(saved.blob, nextId);
  expect(opened.ok).toBe(true); if (!opened.ok) return;
  expect(animationContent(opened.project)).toEqual(animationContent(project));
  expect(opened.project).toMatchObject({ kind: 'animation', fps: 12, musicId: 'music-walk', musicVolume: 1, holds: { [ids.slide2]: 2 }, revision: 0 });
  expect(opened.project.id).not.toBe(project.id);
  expect([...opened.assets.keys()].sort()).toEqual(project.assetManifest.map(asset => asset.id).sort());
  for (const asset of project.assetManifest) expect(new Uint8Array(await opened.assets.get(asset.id)!.arrayBuffer())).toEqual(sampleAssets().get(asset.id));
});

test('문서가 쓰지 않는 사진은 파일에 넣지 않는다', async () => {
  const project = loadAnimationSample();
  // 둘째 장(배경 사진)을 지우면 그 사진은 자료 목록에만 남는다.
  const trimmed = { ...project, slides: project.slides.filter(slide => slide.id !== ids.slide2), holds: {} };
  const saved = await serializeAnimation(trimmed, resolver());
  expect(saved.ok).toBe(true); if (!saved.ok) return;
  const zip = await JSZip.loadAsync(await saved.blob.arrayBuffer());
  expect(Object.keys(zip.files).filter(name => name.startsWith('assets/') && !zip.files[name].dir)).toHaveLength(1);
  const opened = await deserializeAnimation(saved.blob, nextId);
  expect(opened.ok && opened.project.assetManifest).toHaveLength(1);
});

test('사진을 찾을 수 없으면 원본 파일을 만들지 않는다', async () => {
  expect(await serializeAnimation(loadAnimationSample(), async () => undefined)).toMatchObject({ ok: false, code: 'ASSET_MISSING' });
});

test('형식 구분: 슬라이드 원본은 애니메이션에서, 애니메이션 원본은 슬라이드에서 열리지 않는다', async () => {
  const slideFile = await serializeProject(loadSample(), resolver());
  expect(slideFile.ok).toBe(true); if (!slideFile.ok) return;
  expect(await deserializeAnimation(slideFile.blob, nextId)).toMatchObject({ ok: false, code: 'INVALID_VALUE', message: '애니메이션 작품 파일이 아니에요.' });
  const animationFile = await serializeAnimation(loadAnimationSample(), resolver());
  expect(animationFile.ok).toBe(true); if (!animationFile.ok) return;
  expect(await deserializeProject(animationFile.blob, nextId)).toMatchObject({ ok: false, code: 'INVALID_VALUE', message: 'CanvaCraft 작품 파일이 아니에요.' });
});

const damaged: [string, () => Promise<Uint8Array>, string][] = [
  ['ZIP이 아님', async () => new TextEncoder().encode('not a zip'), 'INVALID_VALUE'],
  ['잘린 ZIP', async () => (await bytesOf(await sampleZip())).slice(0, 400), 'INVALID_VALUE'],
  ['format이 슬라이드', async () => { const zip = await sampleZip(); zip.file('manifest.json', JSON.stringify({ format: 'canvacraft', schemaVersion: 1 })); return bytesOf(zip); }, 'INVALID_VALUE'],
  ['manifest 버전이 더 새로움', async () => { const zip = await sampleZip(); zip.file('manifest.json', JSON.stringify({ format: 'canvaanimation', schemaVersion: 2 })); return bytesOf(zip); }, 'UNSUPPORTED_VERSION'],
  ['manifest 없음', async () => { const zip = await sampleZip(); zip.remove('manifest.json'); return bytesOf(zip); }, 'INVALID_VALUE'],
  ['project.json이 JSON이 아님', async () => { const zip = await sampleZip(); zip.file('project.json', '{oops'); return bytesOf(zip); }, 'INVALID_VALUE'],
  ['허용하지 않는 항목', async () => { const zip = await sampleZip(); zip.file('notes.txt', 'hi'); return bytesOf(zip); }, 'INVALID_VALUE'],
  ['상위 경로 항목', async () => { const zip = await sampleZip(); zip.file('../evil.png', 'x'); return bytesOf(zip); }, 'INVALID_VALUE'],
  ['사진 항목 빠짐', async () => { const zip = await sampleZip(); zip.remove(Object.keys(zip.files).find(name => name.endsWith('.jpg'))!); return bytesOf(zip); }, 'ASSET_MISSING'],
  ['사진 내용이 바뀜', async () => {
    const zip = await sampleZip(); const name = Object.keys(zip.files).find(entry => entry.endsWith('.jpg'))!;
    const bytes = await zip.files[name].async('uint8array'); bytes[bytes.length - 20] ^= 0xff; zip.file(name, bytes); return bytesOf(zip);
  }, 'ASSET_INVALID'],
  ['문서에 알 수 없는 필드', async () => bytesOf(await sampleZip(project => { project.extra = 1; })), 'INVALID_VALUE'],
  ['문서의 kind가 다름', async () => bytesOf(await sampleZip(project => { project.kind = 'slide'; })), 'INVALID_VALUE'],
  ['길게 보이기가 없는 장을 가리킴', async () => bytesOf(await sampleZip(project => { project.holds = { '00000000-0000-4000-8000-000000009999': 2 }; })), 'INVALID_VALUE'],
  ['허용하지 않는 빠르기', async () => bytesOf(await sampleZip(project => { project.fps = 30; })), 'INVALID_VALUE'],
];
for (const [name, make, code] of damaged) test(`손상 파일 거부: ${name}`, async () => {
  expect(await deserializeAnimation(await make(), nextId)).toMatchObject({ ok: false, code });
});

test('문서가 한도보다 크면 풀다가 멈춘다', async () => {
  const zip = await sampleZip();
  zip.file('project.json', JSON.stringify({ ...loadAnimationSample(), title: 'x'.repeat(LIMITS.zipJsonBytes + 10) }));
  expect(await deserializeAnimation(await bytesOf(zip), nextId)).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED' });
});
