import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { isHeic, readImageHeader, readPngText, sha256Hex } from '../../src/assets/imageHeader';
import { categoriesOf, placeInCenter, searchLibrary, type Library, type ProvidedBackground, type TemplateItem } from '../../src/assets/library';
import { deserializeProject } from '../../src/storage/projectFile';
import { nextId } from './helpers';
import { LIMITS } from '../../src/domain/limits';

const library: Library = JSON.parse(fs.readFileSync('public/library/manifest.json', 'utf8'));
const backgrounds: ProvidedBackground[] = JSON.parse(fs.readFileSync('public/backgrounds/manifest.json', 'utf8')).assets;
const templates: TemplateItem[] = JSON.parse(fs.readFileSync('public/templates/manifest.json', 'utf8')).templates;
const names = (query: string, kind: 'all' | 'shape' = 'all') => searchLibrary(library.assets, { query, kind }).map(item => item.id);

test('라이브러리 수량: 도형 24, 캐릭터 60, 스티커 36', () => {
  const count = (kind: string) => library.assets.filter(item => item.kind === kind).length;
  expect([count('shape'), count('character'), count('sticker')]).toEqual([24, 60, 36]);
  expect(new Set(library.assets.map(item => item.id)).size).toBe(120);
});

test('라이브러리 PNG는 문서 자료 규칙을 통과하고 라이선스 정보가 있다', async () => {
  for (const item of library.assets) {
    const bytes = new Uint8Array(fs.readFileSync(`public${item.image}`));
    expect(await sha256Hex(bytes)).toBe(item.pngSha256);
    expect(readImageHeader(bytes)).toEqual({ mime: 'image/png', width: item.width, height: item.height, animated: false });
    expect(bytes.length).toBeLessThan(LIMITS.assetBytesMax);
    expect(readPngText(bytes, 'License')).toContain(item.license === 'MIT' ? 'MIT License' : 'CC0');
  }
});

test('제공 배경 24종: 해시·크기·16:9·라이선스 정보', async () => {
  expect(backgrounds.length).toBe(24);
  for (const item of backgrounds) {
    const bytes = new Uint8Array(fs.readFileSync(`public${item.image}`));
    expect(await sha256Hex(bytes)).toBe(item.pngSha256);
    expect(readImageHeader(bytes)).toEqual({ mime: 'image/png', width: item.width, height: item.height, animated: false });
    expect(item.width * 720).toBe(item.height * 1280);
    expect(readPngText(bytes, 'License')).toBeTruthy();
    expect(fs.existsSync(`public${item.thumbnail}`)).toBe(true);
  }
});

test('시작 템플릿 12종: 앱의 원본 파일 검사를 통과한다', async () => {
  expect(templates.length).toBe(12);
  for (const item of templates) {
    const opened = await deserializeProject(new Uint8Array(fs.readFileSync(`public${item.file}`)), nextId);
    expect(opened).toMatchObject({ ok: true });
    expect(fs.existsSync(`public${item.thumbnail}`)).toBe(true);
  }
});

test('검색: 이름·태그, 종류 제한, 없는 말', () => {
  expect(names('고양이').length).toBeGreaterThanOrEqual(1);
  expect(names('하트').length).toBeGreaterThanOrEqual(1);
  expect(names('화살표', 'shape').length).toBeGreaterThanOrEqual(4);
  expect(names('없는그림xyz')).toEqual([]);
  expect(names('').length).toBe(120);
  expect(searchLibrary(library.assets, { kind: 'shape' }).every(item => item.kind === 'shape')).toBe(true);
  // 조합형으로 입력된 한글도 찾는다.
  expect(names('고양이'.normalize('NFD')).length).toBeGreaterThanOrEqual(1);
});

test('분류: 고르면 그 분류만 남는다', () => {
  const [first] = categoriesOf(library.assets, 'character');
  const found = searchLibrary(library.assets, { kind: 'character', category: first });
  expect(found.length).toBeGreaterThan(0);
  expect(found.every(item => item.category === first)).toBe(true);
});

test('넣을 위치: 슬라이드 가운데, 비율 유지, 슬라이드 안', () => {
  const wide = placeInCenter(2560, 1000, 768, 432);
  expect(wide.width / wide.height).toBeCloseTo(2.56, 6);
  expect(wide.x + wide.width / 2).toBeCloseTo(640); expect(wide.y + wide.height / 2).toBeCloseTo(360);
  const tall = placeInCenter(200, 2000, 240, 2400);
  expect(tall.height).toBeLessThanOrEqual(720 * 0.9); expect(tall.width / tall.height).toBeCloseTo(0.1, 6);
  for (const item of library.assets) {
    const box = placeInCenter(item.width, item.height, item.defaultWidth, item.defaultHeight);
    expect(box.y).toBeGreaterThanOrEqual(0); expect(box.x).toBeGreaterThanOrEqual(0);
    expect(Math.abs(box.width / box.height - item.width / item.height) / (item.width / item.height)).toBeLessThan(LIMITS.imageAspectTolerance);
  }
});

test('헤더: WebP·움직이는 그림·HEIC 구분', () => {
  // VP8X 헤더: 애니메이션 플래그와 크기(가로 100, 세로 50).
  const webp = new Uint8Array(30); webp.set(new TextEncoder().encode('RIFF'), 0); webp.set(new TextEncoder().encode('WEBPVP8X'), 8);
  webp[24] = 99; webp[27] = 49;
  expect(readImageHeader(webp)).toEqual({ mime: 'image/webp', width: 100, height: 50, animated: false });
  webp[20] = 0x02;
  expect(readImageHeader(webp)?.animated).toBe(true);
  // PNG acTL 청크가 첫 IDAT 앞에 있으면 움직이는 그림이다.
  const base = fs.readFileSync(`public${library.assets[0].image}`);
  const acTL = Buffer.from([0, 0, 0, 8, 0x61, 0x63, 0x54, 0x4c, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
  expect(readImageHeader(new Uint8Array(Buffer.concat([base.subarray(0, 33), acTL, base.subarray(33)])))?.animated).toBe(true);
  const heic = new Uint8Array(16); heic.set(new TextEncoder().encode('ftypheic'), 4);
  expect(isHeic(heic)).toBe(true); expect(readImageHeader(heic)).toBeNull();
});
