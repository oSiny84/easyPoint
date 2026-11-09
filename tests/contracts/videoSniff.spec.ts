import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { documentMime, sniffContainer } from '../../src/video/sniff';

// 영상 계약 §6 가져오기 2단계: 앞부분으로 컨테이너를 보고, 읽기 라이브러리의 MIME을 문서의 3종으로 줄인다.
test('앞부분 형식 확인: MP4·MOV는 ftyp, WebM은 EBML, 나머지는 영상 파일이 아니다', () => {
  const mp4 = new Uint8Array([0, 0, 0, 0x18, ...Buffer.from('ftypisom')]);
  const mov = new Uint8Array([0, 0, 0, 0x14, ...Buffer.from('ftypqt  ')]);
  expect(sniffContainer(mp4)).toBe('isobmff');
  expect(sniffContainer(mov)).toBe('isobmff');
  expect(sniffContainer(new Uint8Array(fs.readFileSync('tests/fixtures/video/a.webm').subarray(0, 16)))).toBe('ebml');
  expect(sniffContainer(new Uint8Array(Buffer.from('GIF89a........')))).toBeNull();
  expect(sniffContainer(new Uint8Array([0x1a, 0x45]))).toBeNull();
  expect(sniffContainer(new Uint8Array())).toBeNull();
});

test('문서 MIME: mp4·quicktime·webm만 받고 Matroska 등은 받지 않는다', () => {
  expect(documentMime('video/mp4')).toBe('video/mp4');
  expect(documentMime('video/quicktime')).toBe('video/quicktime');
  expect(documentMime('video/webm; codecs="vp9"')).toBe('video/webm');
  expect(documentMime('video/x-matroska')).toBeNull();
  expect(documentMime('audio/mp4')).toBeNull();
});
