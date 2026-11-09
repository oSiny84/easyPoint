import type { VideoCommand } from '../../src/commands/videoApply';
import { createVideoProject } from '../../src/domain/videoProject';
import type { BuiltinCatalog, Media, MemeInfo, VideoProject } from '../../src/domain/videoTypes';
import { createVideoStore, type VideoStore } from '../../src/state/videoStore';
import { clock, nextId } from './helpers';

// 영상 계약 시험용 가짜 내장 목록. 실제 목록은 V6에서 생긴다.
const MEMES: Record<string, MemeInfo> = {
  'cat-hop': { id: 'cat-hop', kind: 'sticker', width: 512, height: 512, durationMs: 2000 },
  'dog-bark': { id: 'dog-bark', kind: 'clip', width: 640, height: 360, durationMs: 4000 },
};
export const catalog: BuiltinCatalog = { meme: id => MEMES[id], hasMusic: id => id === 'happy' };

// 바이트가 없는 가짜 영상 자료. 문서 검사만 한다.
export const mediaA: Media = { id: 'a'.repeat(64), mime: 'video/mp4', byteLength: 5_000_000, durationMs: 10_000, width: 1280, height: 720, rotation: 0, fps: 29.97, hasAudio: true, videoCodec: 'avc1.64001f', audioCodec: 'mp4a.40.2' };
export const mediaB: Media = { id: 'b'.repeat(64), mime: 'video/webm', byteLength: 2_000_000, durationMs: 6_000, width: 720, height: 1280, rotation: 0, fps: 60, hasAudio: false, videoCodec: 'vp09.00.10.08', audioCodec: null };

export const caption = (startMs: number, durationMs = 2000, text = '자막') => ({ type: 'addCaption' as const, text, x: 160, y: 540, width: 960, startMs, durationMs, fontId: 'sans-ko', fontSize: 48, bold: true, color: '#ffffff', align: 'center' as const, lineHeight: 1.3, backdrop: 'band' as const });
export const meme = (memeId: 'cat-hop' | 'dog-bark', startMs: number, durationMs = 3000) => memeId === 'cat-hop'
  ? { type: 'addMeme' as const, memeId, memeKind: 'sticker' as const, x: 480, y: 200, width: 320, height: 320, startMs, durationMs, soundOn: true }
  : { type: 'addMeme' as const, memeId, memeKind: 'clip' as const, x: 400, y: 200, width: 480, height: 270, startMs, durationMs, soundOn: true };

export const startVideo = (project: VideoProject = createVideoProject(nextId, clock()), options = {}) => createVideoStore(project, { newId: nextId, now: clock(), catalog, ...options });
export const runVideo = (store: VideoStore, command: VideoCommand) => { const p = store.getProject(); return store.dispatch(p.id, p.revision, command); };
export const videoContent = (project: VideoProject) => JSON.parse(JSON.stringify({ title: project.title, orientation: project.orientation, fps: project.fps, clips: project.clips, overlays: project.overlays, audio: project.audio, mediaManifest: project.mediaManifest }));

// 가로 영상 A(10초) 다음 세로 영상 B(6초). 작품 길이 16초.
export function twoClips(options = {}) {
  const store = startVideo(undefined, options);
  runVideo(store, { type: 'addClip', media: mediaA });
  runVideo(store, { type: 'addClip', media: mediaB });
  const [a, b] = store.getProject().clips;
  return { store, a, b };
}

// 문서에 들어간 마지막 겹침 요소의 id.
export const lastOverlay = (store: VideoStore) => store.getProject().overlays.at(-1)!.id;
