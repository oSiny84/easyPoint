import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

// 글꼴별 PPT 대응값을 재는 시험. widths → make → scripts/phase2-powerpoint.ps1 -Dir artifacts/fontfit → compare 순서다.
const DIR = 'artifacts/fontfit';
const HELPERS = path.resolve('tests/phase2/browser-helpers.js');
const FONTS = ['sans-ko', 'round-jua', 'block-dohyeon', 'hand-gamja', 'hand-pen', 'hand-gaegu'];
const SIZES = [24, 36, 64];
const SENTENCE = '우리 가족은 주말마다 함께 공원에 가서 자전거를 타요';

async function ready(page: Page) { await page.goto('/'); await expect(page.getByTestId('paper')).toBeVisible(); await page.addScriptTag({ path: HELPERS }); }

test('한글 폭 비교', async ({ page }) => {
  await ready(page);
  const rows = await page.evaluate(async fonts => {
    const { fontOf } = await import('/src/rendering/text/fonts.ts' as string);
    const sample = '가나다라마바사아자차카타파하우리가족주말공원자전거';
    const measure = async (family: string) => { await document.fonts.load(`400 40px "${family}"`, sample); const c = document.createElement('canvas').getContext('2d')!; c.font = `400 40px "${family}"`; return c.measureText(sample).width / [...sample].length / 40; };
    const malgun = await measure('맑은 고딕'); const out: any[] = [];
    for (const id of fonts) { const em = await measure(fontOf(id).family); out.push({ id, family: fontOf(id).family, hangulEm: +em.toFixed(3), scale: +(em / malgun).toFixed(3), loaded: document.fonts.check(`400 40px "${fontOf(id).family}"`, '가') }); }
    return { malgun, out };
  }, FONTS);
  console.log(JSON.stringify(rows));
});

test('측정용 PPTX 생성', async ({ page }) => {
  await fs.rm(DIR, { recursive: true, force: true }); await fs.mkdir(DIR, { recursive: true });
  await ready(page);
  const cases = FONTS.flatMap(fontId => SIZES.map(fontSize => ({ fontId, fontSize })));
  const { pptx, bands } = await page.evaluate(async ({ cases, sentence }) => {
    const { exportPptx } = await import('/src/export/exportPptx.ts' as string);
    const { renderSlide } = await import('/src/rendering/renderSlide.ts' as string);
    const h = (window as any).h; const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const slides = cases.map((c: any, i: number) => ({ id: id(100 + i), background: { kind: 'solid', color: '#FFFFFF' }, elements: [{ id: id(500 + i), type: 'text', x: 60, y: 100, width: 1160, text: sentence, fontId: c.fontId, fontSize: c.fontSize, bold: false, color: '#000000', align: 'left', lineHeight: 1.3 }] }));
    const project = { schemaVersion: 1, id: id(1), title: 't', revision: 0, createdAt: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z', width: 1280, height: 720, assetManifest: [], slides };
    const bands: any[] = [];
    for (const slide of slides) { const rendered = await renderSlide(slide, async () => undefined, 2); bands.push(h.bandsFromCanvas(rendered.canvas, 2)); }
    const result = await exportPptx(project, async () => undefined, 'editable');
    const pptx = await new Promise<string>(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.readAsDataURL(result.blob); });
    return { pptx, bands };
  }, { cases, sentence: SENTENCE });
  await fs.writeFile(path.join(DIR, 'measure.pptx'), Buffer.from(pptx, 'base64'));
  await fs.writeFile(path.join(DIR, 'expected.json'), JSON.stringify({ cases, bands }));
});

test('글꼴별 위치 비교', async ({ page }) => {
  test.skip(!(await fs.stat(path.join(DIR, 'measure', '1.png')).catch(() => null)), 'PowerPoint 렌더 없음');
  const { cases, bands } = JSON.parse(await fs.readFile(path.join(DIR, 'expected.json'), 'utf8'));
  await ready(page);
  const rows: any[] = [];
  for (let i = 0; i < cases.length; i++) {
    const png = (await fs.readFile(path.join(DIR, 'measure', `${i + 1}.png`))).toString('base64');
    const ppt = await page.evaluate(p => (window as any).h.bandsFromPng(p, 2), png);
    const a = bands[i][0], b = ppt[0];
    rows.push({ ...cases[i], bands: [bands[i].length, ppt.length], appMid: (a.top + a.bottom) / 2, dyMid: +(((b.top + b.bottom) - (a.top + a.bottom)) / 2).toFixed(1), em: +((((b.top + b.bottom) - (a.top + a.bottom)) / 2) / cases[i].fontSize).toFixed(3), widthRatio: +((b.right - b.left) / (a.right - a.left)).toFixed(3) });
  }
  await fs.writeFile(path.join(DIR, 'result.json'), JSON.stringify(rows, null, 1));
  for (const row of rows) console.log(JSON.stringify(row));
});
