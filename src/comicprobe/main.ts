// 만화 K2 확인 페이지. 제품 코드가 아니다. 자동 시험(tests/comic-phase2)이 window.comicProbe를 부른다.
// 보는 것: 제품의 쪽 조립(composePage)과 만화책 PDF(exportComicPdf)가 실제 브라우저에서 내는 모습·시간·파일 크기.
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/700.css';
import '@fontsource/jua/400.css';
import '@fontsource/do-hyeon/400.css';
import { composePage } from '../comic/composePage';
import { exportComicPdf } from '../comic/exportComic';
import { pageCount } from '../comic/pageLayout';
import type { ComicLayout, ComicProject } from '../domain/comicTypes';
import type { Asset, Slide, SlideElement } from '../domain/types';

type PackItem = { id: string; image: string; width: number; height: number; pngSha256: string; byteLength: number; inner?: { x: number; y: number; width: number; height: number } };
const blobs = new Map<string, Blob>();
const resolve = async (id: string) => blobs.get(id);
const COLORS = ['#FFE3E3', '#D0EBFF', '#D3F9D8', '#FFF3BF', '#E5DBFF', '#FFE8CC'];
function random(seed: number) { let state = seed; return () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff; }; }
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

// 카메라 사진처럼 압축이 쉽지 않은 그림.
async function makePhoto(seed: number): Promise<Asset> {
  const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1200;
  const context = canvas.getContext('2d')!; const next = random(seed);
  context.fillStyle = `hsl(${Math.round(next() * 360)} 60% 60%)`; context.fillRect(0, 0, 1600, 1200);
  for (let i = 0; i < 400; i++) { context.fillStyle = `hsla(${Math.round(next() * 360)} 80% 50% / 0.5)`; context.beginPath(); context.arc(next() * 1600, next() * 1200, 10 + next() * 120, 0, Math.PI * 2); context.fill(); }
  const blob = await new Promise<Blob>(done => canvas.toBlob(value => done(value!), 'image/jpeg', 0.9));
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const id = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  blobs.set(id, blob);
  return { id, mime: 'image/jpeg', pixelWidth: 1600, pixelHeight: 1200, byteLength: blob.size };
}

// 칸마다 색 배경, 손그림 선 20개, 말풍선 하나와 대사. photos가 참이면 세 칸에 하나꼴로 사진을 넣는다.
async function makeComic(panels: number, layout: ComicLayout, photos: boolean): Promise<ComicProject> {
  const pack = await (await fetch('/comic/manifest.json')).json() as { assets: PackItem[] };
  const bubbleItems = pack.assets.filter(item => item.inner);
  const manifest: Asset[] = [];
  for (const item of bubbleItems) {
    if (!blobs.has(item.pngSha256)) blobs.set(item.pngSha256, await (await fetch(item.image)).blob());
    manifest.push({ id: item.pngSha256, mime: 'image/png', pixelWidth: item.width, pixelHeight: item.height, byteLength: item.byteLength });
  }
  const photoAssets = photos ? await Promise.all([1, 2, 3].map(seed => makePhoto(seed))) : [];
  manifest.push(...photoAssets);
  const next = random(5); let serial = 1;
  const slides: Slide[] = [];
  for (let panel = 0; panel < panels; panel++) {
    const elements: SlideElement[] = [];
    if (photos && panel % 3 === 0) elements.push({ id: uuid(serial++), type: 'image', x: 60, y: 120, width: 560, height: 420, assetId: photoAssets[panel % 3].id });
    for (let stroke = 0; stroke < 20; stroke++) {
      const points: number[] = []; let x = next() * 300, y = next() * 200;
      for (let i = 0; i < 40; i++) { points.push(Math.round(x), Math.round(y)); x += next() * 30 - 8; y += next() * 30 - 14; }
      elements.push({ id: uuid(serial++), type: 'stroke', x: Math.round(next() * 700), y: Math.round(300 + next() * 200), points, color: '#283B37', strokeWidth: 8 });
    }
    const item = bubbleItems[panel % bubbleItems.length]; const width = 480, height = width * item.height / item.width; const bx = 700, by = 60;
    elements.push({ id: uuid(serial++), type: 'image', x: bx, y: by, width, height, assetId: item.pngSha256 });
    const inner = item.inner!;
    elements.push({ id: uuid(serial++), type: 'text', x: bx + inner.x * width, y: by + inner.y * height + 20, width: inner.width * width, text: `${panel + 1}번째 칸이에요!\n안녕?`, fontId: 'round-jua', fontSize: 36, bold: false, color: '#1F2933', align: 'center', lineHeight: 1.3 });
    elements.push({ id: uuid(serial++), type: 'text', x: 60, y: 40, width: 500, text: '쾅!', fontId: 'block-dohyeon', fontSize: 96, bold: false, color: '#E8590C', align: 'left', lineHeight: 1.3 });
    slides.push({ id: uuid(serial++), background: { kind: 'solid', color: COLORS[panel % COLORS.length] }, elements });
  }
  return { schemaVersion: 1, kind: 'comic', id: uuid(0), title: '우리 반 만화 대회에 낼 아주 재미있는 고양이 탐정 이야기', revision: 1, createdAt: '2026-11-12T00:00:00.000Z', updatedAt: '2026-11-12T00:00:00.000Z', width: 1280, height: 720, layout, bubbles: {}, slides, assetManifest: manifest };
}

const toBase64 = async (blob: Blob) => { const bytes = new Uint8Array(await blob.arrayBuffer()); let text = ''; for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(text); };

const probe = {
  // 쪽 그림 한 장: 조립 시간과 PNG(base64).
  async page(layout: ComicLayout, panels: number, pageIndex: number, pixelsPerPoint: number) {
    const comic = await makeComic(panels, layout, false);
    const started = performance.now();
    const composed = await composePage(comic, pageIndex, resolve, pixelsPerPoint);
    const ms = performance.now() - started;
    if (!composed.ok) return { ok: false as const, message: composed.message };
    const { width, height } = composed.canvas;
    const blob = await new Promise<Blob>(done => composed.canvas.toBlob(value => done(value!), 'image/png'));
    return { ok: true as const, ms, width, height, png: await toBase64(blob), bytes: blob.size };
  },
  // 만화책 PDF: 만드는 시간, 쪽 수, 파일 크기.
  async pdf(layout: ComicLayout, panels: number, photos: boolean, keep: boolean) {
    const comic = await makeComic(panels, layout, photos);
    const started = performance.now();
    const result = await exportComicPdf(comic, resolve);
    const ms = performance.now() - started;
    if (!result.ok) return { ok: false as const, message: result.message };
    return { ok: true as const, ms, pages: result.pages, expectedPages: pageCount(panels, layout), bytes: result.blob.size, pdf: keep ? await toBase64(result.blob) : null };
  },
};
declare global { interface Window { comicProbe: typeof probe } }
window.comicProbe = probe;
document.getElementById('status')!.textContent = '준비됨';
