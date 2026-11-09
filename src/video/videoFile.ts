// 영상 원본 파일(.canvavideo, 영상 계약 §6). 자체 STORE ZIP: manifest.json, project.json, media/<id>.mp4|.mov|.webm(압축 없음).
// 밈·효과음·음악은 ID로만 참조하므로 넣지 않는다. 열기는 검사를 모두 통과한 뒤에만 새 작품 후보를 돌려준다.
import { fail, type Failure } from '../domain/types';
import { VIDEO_LIMITS, VIDEO_SCHEMA_VERSION } from '../domain/videoLimits';
import type { BuiltinCatalog, Media, MediaMime, VideoProject } from '../domain/videoTypes';
import { validateVideoProject } from '../domain/videoValidate';
import { mediaId } from '../storage/mediaHash';
import { readStoreZip, writeStoreZip } from '../storage/storeZip';
import { referencedMedia } from './videoDatabase';

export const VIDEO_FORMAT = 'canvavideo';
const EXTENSION: Record<MediaMime, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
const MEDIA_ENTRY = /^media\/([0-9a-f]{64})\.(mp4|mov|webm)$/;
const invalid = (message: string) => fail('INVALID_VALUE', message);
export const mediaEntryName = (media: Media) => `media/${media.id}.${EXTENSION[media.mime]}`;

export type MediaResolver = (id: string) => Promise<Blob | undefined>;

// 원본 파일 예상 크기(영상 바이트 합 + 1MiB). 저장 전에 보여 주고 확인을 받는다.
export const expectedFileBytes = (project: VideoProject) => referencedMedia(project).reduce((sum, media) => sum + media.byteLength, 0) + 1024 * 1024;

export async function serializeVideoProject(project: VideoProject, resolve: MediaResolver, options: { forceZip64?: boolean; signal?: AbortSignal } = {}): Promise<{ ok: true; blob: Blob } | Failure> {
  const media = referencedMedia(project);
  // ZIP64 대용량 시험 전까지의 임시 상한(계약 §6).
  if (media.reduce((sum, item) => sum + item.byteLength, 0) > VIDEO_LIMITS.originalFileMediaBytes) return fail('LIMIT_EXCEEDED', '영상이 커서 원본 파일로 저장할 수 없어요. 이 컴퓨터에는 자동 저장돼 있어요.');
  const entries = [
    { name: 'manifest.json', blob: new Blob([JSON.stringify({ format: VIDEO_FORMAT, schemaVersion: VIDEO_SCHEMA_VERSION })]) },
    { name: 'project.json', blob: new Blob([JSON.stringify({ ...project, mediaManifest: media })]) },
  ];
  for (const item of media) {
    const blob = await resolve(item.id);
    if (!blob || blob.size !== item.byteLength) return fail('ASSET_MISSING', '영상 자료를 찾을 수 없어 저장하지 못했어요.');
    entries.push({ name: mediaEntryName(item), blob });
  }
  try { return { ok: true, blob: await writeStoreZip(entries, options) }; }
  catch (error) { return error instanceof DOMException && error.name === 'AbortError' ? fail('CANCELLED', '원본 저장을 멈췄어요.') : fail('EXPORT_FAILED', '원본 파일을 만들지 못했어요.'); }
}

async function readJson(blob: Blob): Promise<{ value: unknown } | { tooBig: true } | { broken: true }> {
  if (blob.size > VIDEO_LIMITS.zipJsonBytes) return { tooBig: true };
  try { return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await blob.arrayBuffer())) as unknown }; }
  catch { return { broken: true }; }
}

export type VideoCandidate = { ok: true; project: VideoProject; media: Map<string, Blob> };

// 새 작품 후보를 돌려준다. 영상 항목은 해시를 다시 계산해 파일명·문서와 비교한다. 바이트를 저장소에 넣는 일은 부르는 쪽이 한다.
export async function deserializeVideoProject(file: Blob, newId: () => string, catalog: BuiltinCatalog, signal?: AbortSignal): Promise<VideoCandidate | Failure> {
  const read = await readStoreZip(file, VIDEO_LIMITS.zipEntries).catch(() => ({ ok: false as const, reason: 'read' }));
  if (!read.ok) return read.reason === 'too-many' ? fail('LIMIT_EXCEEDED', '작품 파일 안의 항목이 너무 많아요.')
    : read.reason === 'compressed' || read.reason === 'encrypted' ? invalid('영상 작품 파일을 읽지 못했어요. 압축되거나 암호가 걸린 파일이에요.')
    : invalid('영상 작품 파일을 읽지 못했어요. 파일이 손상됐어요.');
  const byName = new Map(read.entries.map(entry => [entry.name, entry]));
  for (const name of byName.keys()) if (name !== 'manifest.json' && name !== 'project.json' && !MEDIA_ENTRY.test(name)) return invalid('작품 파일에 허용되지 않은 항목이 있어요.');
  const manifestEntry = byName.get('manifest.json'), projectEntry = byName.get('project.json');
  if (!manifestEntry || !projectEntry) return invalid('영상 작품 파일이 아니에요.');

  const manifest = await readJson(manifestEntry.blob), parsed = await readJson(projectEntry.blob);
  if ('tooBig' in manifest || 'tooBig' in parsed) return fail('LIMIT_EXCEEDED', '작품 파일의 문서가 너무 커요.');
  const head = 'value' in manifest ? manifest.value as { format?: unknown; schemaVersion?: unknown } | null : null;
  if (!head || typeof head !== 'object' || head.format !== VIDEO_FORMAT || typeof head.schemaVersion !== 'number') return invalid('영상 작품 파일이 아니에요.');
  if (head.schemaVersion > VIDEO_SCHEMA_VERSION) return fail('UNSUPPORTED_VERSION', '더 새로운 버전에서 만든 작품이라 열 수 없어요.');
  if (!('value' in parsed)) return invalid('영상 작품 파일을 읽지 못했어요.');
  const checked = validateVideoProject(parsed.value, catalog);
  if (!checked.ok) return checked;
  const { project } = checked;

  // 파일 안의 영상 목록과 문서의 자료 목록이 정확히 같아야 한다.
  const expected = new Map(project.mediaManifest.map(media => [mediaEntryName(media), media]));
  const present = [...byName.keys()].filter(name => MEDIA_ENTRY.test(name));
  if (present.length !== expected.size || present.some(name => !expected.has(name))) return fail('ASSET_MISSING', '작품 파일의 영상 자료가 문서와 맞지 않아요.');
  const media = new Map<string, Blob>();
  for (const [name, item] of expected) {
    const entry = byName.get(name)!;
    if (entry.size !== item.byteLength) return fail('ASSET_INVALID', '영상 파일 크기가 문서와 달라요.');
    let id: string;
    try { id = await mediaId(entry.blob, signal); } catch { return signal?.aborted ? fail('CANCELLED', '원본 열기를 멈췄어요.') : fail('ASSET_INVALID', '작품 파일의 영상을 읽지 못했어요.'); }
    if (id !== item.id) return fail('ASSET_INVALID', '영상 파일 내용이 문서와 달라요.');
    media.set(item.id, entry.blob);
  }
  // 새 작품으로 가져온다. 파일의 revision은 출처 정보일 뿐이므로 0에서 시작한다.
  return { ok: true, project: { ...project, id: newId(), revision: 0 }, media };
}
