// 새 영상 작품. 방향·프레임률은 첫 영상이 들어올 때 정한다(영상 계약 §2).
import { DEFAULT_AUDIO, VIDEO_SCHEMA_VERSION } from './videoLimits';
import type { BuiltinCatalog, VideoProject } from './videoTypes';

export function createVideoProject(newId: () => string, now: () => string, title = '내 영상'): VideoProject {
  const at = now();
  return { schemaVersion: VIDEO_SCHEMA_VERSION, kind: 'video', id: newId(), title, revision: 0, createdAt: at, updatedAt: at, orientation: 'landscape', fps: 30, clips: [], overlays: [], audio: { ...DEFAULT_AUDIO }, mediaManifest: [] };
}

// 내장 밈·음악 목록. V6에서 public/memes/manifest.json·public/sounds/manifest.json을 읽어 채운다.
// 그 전에는 비어 있으므로 밈·음악을 참조하는 문서는 ASSET_MISSING으로 열리지 않는다(계약 §5: 목록에 없는 ID 거부).
export const EMPTY_CATALOG: BuiltinCatalog = { meme: () => undefined, hasMusic: () => false };
