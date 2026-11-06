import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sentences, styles, textItem } from './cases';

const OUT = 'artifacts/phase2/ppt';
const HELPERS = path.resolve('tests/phase2/browser-helpers.js');

// PowerPoint 비교용 PPTX를 만든다. 슬라이드 하나에 글씨 상자 하나를 넣고, 앱의 줄과 잉크 위치를 함께 기록한다.
const NOTO = 'Noto Sans KR', MALGUN = '맑은 고딕', DECOY = 'CanvaCraft Missing Font';
const AS_IS = { verticalShift: 0.125, fontScale: 1 };
const variants: Record<string, { mode: 'auto' | 'explicit'; options: Record<string, unknown> }> = {
  'noto-auto': { mode: 'auto', options: { fontFace: NOTO, ...AS_IS } },
  'noto-explicit': { mode: 'explicit', options: { fontFace: NOTO, ...AS_IS } },
  'malgun-auto': { mode: 'auto', options: { fontFace: MALGUN, ...AS_IS } },
  'malgun-auto-92': { mode: 'auto', options: { fontFace: MALGUN, verticalShift: 0.07, fontScale: 0.92 } },
  'malgun-explicit': { mode: 'explicit', options: { fontFace: MALGUN, ...AS_IS } },
  'decoy-auto': { mode: 'auto', options: { fontFace: DECOY, ...AS_IS } },
  'decoy-explicit': { mode: 'explicit', options: { fontFace: DECOY, ...AS_IS } },
  'decoy-auto-en': { mode: 'auto', options: { fontFace: DECOY, lang: 'en-US', ...AS_IS } },
};

test('PowerPoint 비교용 파일 생성', async ({ page }) => {
  await fs.rm(OUT, { recursive: true, force: true }); await fs.mkdir(OUT, { recursive: true });
  await page.goto('/probe.html');
  await expect(page.getByRole('status')).toContainText('준비됐어요', { timeout: 30000 });
  await page.addScriptTag({ path: HELPERS });
  const items = Object.entries(sentences).flatMap(([name, text]) => styles.map(style => ({ name, style: style.name, item: textItem(text, style) })));
  const expected = await page.evaluate(async items => {
    const p = (window as any).craftProbe, h = (window as any).h; const out: any[] = [];
    for (const { name, style, item } of items) {
      const slide = { background: '#FFFFFF', elements: [item] };
      const canvas = await p.renderSlide(slide, 2);
      const layout = p.layoutText(item);
      out.push({ name, style, fontSize: item.fontSize, width: item.width, x: item.x, y: item.y, lines: layout.lines, bands: h.bandsFromCanvas(canvas, 2) });
    }
    return out;
  }, items);
  await fs.writeFile(path.join(OUT, 'expected.json'), JSON.stringify(expected));
  for (const [name, variant] of Object.entries(variants)) {
    const bytes = await page.evaluate(async ({ items, variant }) => {
      const p = (window as any).craftProbe;
      const blob = await p.makePptx(items.map((c: any) => ({ background: '#FFFFFF', elements: [c.item] })), variant.mode, variant.options);
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }, { items, variant });
    await fs.writeFile(path.join(OUT, `${name}.pptx`), Buffer.from(bytes));
  }
  // 편집 시험용: 사진·글씨·획이 섞인 문서.
  const bytes = await page.evaluate(async () => {
    const p = (window as any).craftProbe;
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
    const context = canvas.getContext('2d')!; context.fillStyle = '#7FB9D8'; context.fillRect(0, 0, 800, 600);
    const slide = structuredClone(p.sample); slide.elements.splice(2, 0, { id: 'photo', type: 'image', source: canvas.toDataURL(), x: 820, y: 200, width: 320, height: 240 });
    return Array.from(new Uint8Array(await (await p.makePptx(slide, 'auto')).arrayBuffer()));
  });
  await fs.writeFile(path.join(OUT, 'edit-sample.pptx'), Buffer.from(bytes));
});
