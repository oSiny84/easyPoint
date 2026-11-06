import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

// PowerPoint 고정 줄 간격에서 글씨 세로 위치를 재는 시험. make → scripts/phase2-powerpoint.ps1 -Dir artifacts/phase6/lineheight → compare 순서다.
const DIR = 'artifacts/phase6/lineheight';
const HELPERS = path.resolve('tests/phase2/browser-helpers.js');
const heights = [1, 1.15, 1.3, 1.5, 1.75, 2];
const sizes = [24, 36, 64];
const cases = heights.flatMap(lineHeight => sizes.map(fontSize => ({ lineHeight, fontSize })));
const projectCode = (shift: boolean) => ({ cases, shift });

async function ready(page: Page) { await page.goto('/'); await expect(page.getByTestId('paper')).toBeVisible(); await page.addScriptTag({ path: HELPERS }); }

test('줄 간격 측정용 PPTX 생성', async ({ page }) => {
  await fs.rm(DIR, { recursive: true, force: true }); await fs.mkdir(DIR, { recursive: true });
  await ready(page);
  const { pptx, bands } = await page.evaluate(async ({ cases }) => {
    const { exportPptx } = await import('/src/export/exportPptx.ts' as string);
    const { renderSlide } = await import('/src/rendering/renderSlide.ts' as string);
    const h = (window as any).h; const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const slides = cases.map((c: any, i: number) => ({ id: id(100 + i), background: { kind: 'solid', color: '#FFFFFF' }, elements: [{ id: id(500 + i), type: 'text', x: 100, y: 100, width: 1000, text: '가나다라 우리 가족\n둘째 줄 English', fontId: 'sans-ko', fontSize: c.fontSize, bold: false, color: '#000000', align: 'left', lineHeight: c.lineHeight }] }));
    const project = { schemaVersion: 1, id: id(1), title: 't', revision: 0, createdAt: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z', width: 1280, height: 720, assetManifest: [], slides };
    const bands: any[] = [];
    for (const slide of slides) { const rendered = await renderSlide(slide, async () => undefined, 2); bands.push(h.bandsFromCanvas(rendered.canvas, 2)); }
    const result = await exportPptx(project, async () => undefined, 'editable');
    const pptx = await new Promise<string>(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.readAsDataURL(result.blob); });
    return { pptx, bands };
  }, projectCode(true));
  await fs.writeFile(path.join(DIR, 'measure.pptx'), Buffer.from(pptx, 'base64'));
  await fs.writeFile(path.join(DIR, 'expected.json'), JSON.stringify({ cases, bands }));
});

test('줄 간격별 위치 비교', async ({ page }) => {
  test.skip(!(await fs.stat(path.join(DIR, 'measure', '1.png')).catch(() => null)), 'PowerPoint 렌더 없음');
  const { cases: list, bands } = JSON.parse(await fs.readFile(path.join(DIR, 'expected.json'), 'utf8'));
  await ready(page);
  const rows: any[] = [];
  for (let i = 0; i < list.length; i++) {
    const png = (await fs.readFile(path.join(DIR, 'measure', `${i + 1}.png`))).toString('base64');
    const ppt = await page.evaluate(p => (window as any).h.bandsFromPng(p, 2), png);
    const dy = ppt.map((b: any, k: number) => +(b.top - bands[i][k].top).toFixed(1));
    rows.push({ ...list[i], bands: [bands[i].length, ppt.length], dyLines: dy, em: +(dy[0] / list[i].fontSize).toFixed(3) });
  }
  await fs.writeFile('artifacts/phase6/lineheight.json', JSON.stringify(rows, null, 1));
  for (const row of rows) console.log(JSON.stringify(row));
});
