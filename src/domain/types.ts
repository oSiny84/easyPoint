// 저장 문서의 형태. docs/contracts.md §2가 기준이다.
export type SolidBackground = { kind: 'solid'; color: string };
export type ImageBackground = { kind: 'image'; assetId: string; fit: 'center-cover' };
export type Background = SolidBackground | ImageBackground;

export type TextAlign = 'left' | 'center' | 'right';
export type TextElement = {
  id: string; type: 'text'; x: number; y: number; width: number;
  text: string; fontId: string; fontSize: number; bold: boolean; color: string; align: TextAlign; lineHeight: number;
};
export type ImageElement = { id: string; type: 'image'; x: number; y: number; width: number; height: number; assetId: string };
// points는 요소 내부 논리 좌표의 평탄 배열 [x0, y0, x1, y1, ...]이다.
export type StrokeElement = { id: string; type: 'stroke'; x: number; y: number; points: number[]; color: string; strokeWidth: number };
export type SlideElement = TextElement | ImageElement | StrokeElement;

// elements 배열 앞쪽이 뒤에 그려지고 뒤쪽이 앞에 그려진다.
export type Slide = { id: string; background: Background; elements: SlideElement[] };

// id는 정규화한 바이트의 SHA-256이다. 실제 Blob은 문서 밖에 둔다.
export type Asset = { id: string; mime: 'image/png' | 'image/jpeg'; pixelWidth: number; pixelHeight: number; byteLength: number };

// 되돌리기가 복원하는 내용. revision·updatedAt은 내용과 분리해 관리한다.
export type ProjectContent = { title: string; slides: Slide[]; assetManifest: Asset[] };
export type Project = ProjectContent & {
  schemaVersion: 1; id: string; revision: number; createdAt: string; updatedAt: string; width: 1280; height: 720;
};

// 작품 목록 화면이 읽는 요약. 첫 장의 미리보기는 삭제·재생성 가능한 파생 저장물이다.
export type ProjectSummary = { projectId: string; title: string; updatedAt: string; revision: number; thumbnailRevision: number | null; thumbnail: Blob | null };

export type ErrorCode =
  | 'INVALID_VALUE' | 'LIMIT_EXCEEDED' | 'ASSET_MISSING' | 'ASSET_INVALID' | 'FONT_UNAVAILABLE' | 'REVISION_CONFLICT'
  | 'READ_ONLY' | 'UNSUPPORTED_VERSION' | 'STORAGE_UNAVAILABLE' | 'STORAGE_FULL' | 'EXPORT_FAILED' | 'CANCELLED';
// 예상 실패는 예외가 아니라 구조화된 결과로 돌려준다. 메시지에 사진 내용이나 원본 파일명을 넣지 않는다.
export type Failure = { ok: false; code: ErrorCode; message: string };
export const fail = (code: ErrorCode, message: string): Failure => ({ ok: false, code, message });
