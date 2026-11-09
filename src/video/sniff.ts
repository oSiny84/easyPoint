// 파일 앞부분으로 컨테이너 종류를 본다(영상 계약 §6 가져오기 2단계). MP4·MOV는 4바이트 뒤 'ftyp', WebM·Matroska는 EBML 머리 1A 45 DF A3.
// 확장자·파일 형식 표시는 믿지 않는다. DOM에 의존하지 않는다.
import type { MediaMime } from '../domain/videoTypes';

export type Container = 'isobmff' | 'ebml' | null;

export function sniffContainer(head: Uint8Array): Container {
  if (head.length >= 8 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) return 'isobmff';
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'ebml';
  return null;
}

// 컨테이너 읽기 라이브러리가 알려 준 MIME을 문서에 저장하는 3종으로 줄인다. Matroska(.mkv) 등은 받지 않는다.
export function documentMime(formatMime: string): MediaMime | null {
  const base = formatMime.split(';')[0].trim().toLowerCase();
  return base === 'video/mp4' || base === 'video/quicktime' || base === 'video/webm' ? base : null;
}
