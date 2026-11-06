// 공통 샘플 문서를 만든다. Phase 3 이후 모든 Phase가 같은 파일로 전체 흐름을 다시 확인한다.
// 사용: node scripts/make-fixture.mjs
// 사진은 브라우저 캔버스로 직접 그리므로 위치 정보 등 메타데이터가 없다.
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const OUT = 'tests/fixtures/sample';
rmSync(OUT, { recursive: true, force: true }); mkdirSync(`${OUT}/assets`, { recursive: true });

const browser = await chromium.launch(); const page = await browser.newPage();
const draw = (width, height, mime, hueA, hueB) => page.evaluate(async ({ width, height, mime, hueA, hueB }) => {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const c = canvas.getContext('2d');
  const g = c.createLinearGradient(0, 0, width, height); g.addColorStop(0, `hsl(${hueA} 65% 75%)`); g.addColorStop(1, `hsl(${hueB} 55% 45%)`); c.fillStyle = g; c.fillRect(0, 0, width, height);
  c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(2, width / 300); const step = width / 8;
  for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo(i * step, 0); c.lineTo(i * step, height); c.stroke(); }
  c.strokeStyle = '#000000'; c.beginPath(); c.arc(width / 2, height / 2, Math.min(width, height) / 3, 0, 7); c.stroke();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, 0.88));
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}, { width, height, mime, hueA, hueB });

async function asset(width, height, mime, hueA, hueB) {
  const bytes = Buffer.from(await draw(width, height, mime, hueA, hueB));
  const id = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(`${OUT}/assets/${id}.${mime === 'image/png' ? 'png' : 'jpg'}`, bytes);
  return { id, mime, pixelWidth: width, pixelHeight: height, byteLength: bytes.length };
}
const photo = await asset(800, 600, 'image/jpeg', 150, 30);
const wide = await asset(800, 300, 'image/png', 210, 280);
await browser.close();

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const text = (n, fields) => ({ id: id(n), type: 'text', x: 80, y: 60, width: 900, text: '', fontId: 'sans-ko', fontSize: 36, bold: false, color: '#283B37', align: 'left', lineHeight: 1.3, ...fields });
const stroke = (n, x, y, points, color, strokeWidth) => ({ id: id(n), type: 'stroke', x, y, points, color, strokeWidth });

const project = {
  schemaVersion: 1, id: id(1), title: '우리 가족 소개', revision: 0, createdAt: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z', width: 1280, height: 720,
  assetManifest: [photo, wide],
  slides: [
    { id: id(10), background: { kind: 'solid', color: '#FFF8E8' }, elements: [
      // 사진 → 획 → 글씨 → 획 순서를 출력에서도 지켜야 한다.
      { id: id(11), type: 'image', x: 760, y: 200, width: 400, height: 300, assetId: photo.id },
      stroke(12, 700, 240, [0, 60, 100, 0, 200, 80, 320, 20, 440, 70], '#ED8F65', 14),
      text(13, { text: '우리 가족 소개', fontSize: 64, bold: true }),
      text(14, { y: 200, width: 620, text: '함께 웃고, 함께 자라는 우리 가족!\n한글과 English 123, 줄바꿈을 확인해요.\n오늘의 기분은 🌈 좋아요 👨‍👩‍👧‍👦' }),
      stroke(15, 900, 330, [0, 0, 120, 30, 240, 0], '#2A9D8F', 10),
      stroke(16, 120, 560, [0, 0], '#E76F51', 40),
    ] },
    { id: id(20), background: { kind: 'image', assetId: wide.id, fit: 'center-cover' }, elements: [
      text(21, { x: 140, y: 80, width: 1000, align: 'center', text: '배경 사진 위 가운데 글씨', fontSize: 56, bold: true, color: '#FFFFFF' }),
      // 첫 장과 같은 사진을 함께 쓴다.
      { id: id(22), type: 'image', x: 440, y: 280, width: 400, height: 300, assetId: photo.id },
    ] },
    { id: id(30), background: { kind: 'solid', color: '#E9F5EC' }, elements: [
      text(31, { x: 300, y: 120, width: 860, align: 'right', lineHeight: 1.5, text: '오른쪽 정렬과 넓은 줄 간격을 확인하는 긴 문장이에요. 줄이 몇 번 나뉘어도 위치가 맞아야 해요.' }),
      stroke(32, 100, 420, [0, 40, 180, 0, 360, 60, 540, 10, 720, 50, 900, 0, 1040, 40], '#577590', 18),
    ] },
    { id: id(40), background: { kind: 'solid', color: '#FFFFFF' }, elements: [] },
  ],
};
writeFileSync(`${OUT}/project.json`, JSON.stringify(project, null, 1) + '\n');
console.log('fixture written', photo.byteLength, wide.byteLength);
