// 영상 작품의 저장 형태. docs/video-contracts.md §2가 기준이다.
import type { TextAlign } from './types';

export type Orientation = 'landscape' | 'portrait';
export type VideoFps = 24 | 25 | 30;
export type Volume = 0 | 0.5 | 1;

// 원본 영상 안의 구간. 작품 안 시작 시각은 앞 조각 길이의 합으로 계산하고 저장하지 않는다.
export type Clip = { id: string; mediaId: string; inMs: number; outMs: number; muted: boolean };

type OverlayBase = { id: string; startMs: number; durationMs: number; x: number; y: number; width: number };
export type Backdrop = 'none' | 'band';
export type CaptionOverlay = OverlayBase & {
  type: 'caption'; text: string; fontId: string; fontSize: number; bold: boolean; color: string; align: TextAlign; lineHeight: number; backdrop: Backdrop;
};
export type MemeKind = 'sticker' | 'clip';
export type MemeOverlay = OverlayBase & { type: 'meme'; height: number; memeId: string; memeKind: MemeKind; soundOn: boolean };
// overlays 배열 앞쪽이 뒤에 그려지고 뒤쪽이 앞에 그려진다(자막과 밈을 한 배열에 둔다).
export type Overlay = CaptionOverlay | MemeOverlay;

export type AudioSettings = { originalVolume: Volume; musicId: string | null; musicVolume: Volume };

export type MediaMime = 'video/mp4' | 'video/quicktime' | 'video/webm';
// id는 원본 바이트의 조각 해시(storage/mediaHash.ts)다. 실제 바이트는 문서 밖(OPFS)에 둔다.
export type Media = {
  id: string; mime: MediaMime; byteLength: number; durationMs: number; width: number; height: number; rotation: 0 | 90 | 180 | 270;
  fps: number; hasAudio: boolean; videoCodec: string; audioCodec: string | null;
};

// 되돌리기가 복원하는 내용. revision·updatedAt은 내용과 분리한다.
export type VideoProjectContent = { title: string; orientation: Orientation; fps: VideoFps; clips: Clip[]; overlays: Overlay[]; audio: AudioSettings; mediaManifest: Media[] };
export type VideoProject = VideoProjectContent & { schemaVersion: 1; kind: 'video'; id: string; revision: number; createdAt: string; updatedAt: string };

export type VideoProjectSummary = {
  projectId: string; kind: 'video'; title: string; updatedAt: string; revision: number; durationMs: number; thumbnailRevision: number | null; thumbnail: Blob | null;
};

// 내장 밈 목록의 항목 중 문서 검사에 필요한 값. 목록 자체는 앱 파일이다(계약 §2, V6에서 public/memes/manifest.json).
export type MemeInfo = { id: string; kind: MemeKind; width: number; height: number; durationMs: number };
export type BuiltinCatalog = { meme: (id: string) => MemeInfo | undefined; hasMusic: (id: string) => boolean };

// 명령 결과가 가리키는 요소. 되돌리기 뒤 UI가 이 요소를 선택하고 재생 막대를 그 시작으로 옮긴다(계약 §4).
export type VideoFocus = { kind: 'clip' | 'overlay'; id: string } | null;
