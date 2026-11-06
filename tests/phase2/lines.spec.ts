import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sentences, styles, textItem } from './cases';

const OUT = 'artifacts/phase2';
const HELPERS = path.resolve('tests/phase2/browser-helpers.js');
// 잉크 측정에 방해되는 커서·테두리·배경만 지운다. 글자 배치에는 영향이 없다.
const CLEAN = '.paper textarea{outline:none!important;caret-color:transparent!important;background:transparent!important}';

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/probe.html');
  await expect(page.getByRole('status')).toContainText('준비됐어요', { timeout: 30000 });
  await page.addScriptTag({ path: HELPERS }); await page.addStyleTag({ content: CLEAN });
}
async function bands(page: Page, scale: number, label?: string) {
  const buffer = await page.locator('.paper').screenshot(label ? { path: path.join(OUT, label) } : {});
  return page.evaluate(([png, s]) => (window as any).h.bandsFromPng(png, s), [buffer.toString('base64'), scale] as const);
}

test('줄 나누기 후보와 실제 textarea 비교', async ({ page }) => {
  await fs.mkdir(OUT, { recursive: true });
  await open(page, 1440);
  const rows: any[] = [];
  for (const [name, text] of Object.entries(sentences)) for (const style of styles) {
    const item = textItem(text, style);
    rows.push({ name, style: style.name, ...(await page.evaluate(async item => {
      const p = (window as any).craftProbe, h = (window as any).h;
      await p.prepareFonts({ background: '#FFFFFF', elements: [item] });
      const app = p.layoutText(item).lines; const dom = h.domLines(item); const normal = h.domLines(item, 'normal');
      return { app, dom, normal, textareaBad: h.textareaAgrees(item, dom), same: JSON.stringify(app) === JSON.stringify(dom) };
    }, item)) });
  }
  await fs.writeFile(path.join(OUT, 'lines-layout.json'), JSON.stringify(rows, null, 1));
  console.log('layout same as textarea:', rows.filter(r => r.same).length, '/', rows.length, ' textarea disagreements with DOM:', rows.filter(r => r.textareaBad.length).length);
});

for (const viewport of [1440, 1000]) test(`실제 앱 화면 편집 전후 위치 ${viewport}`, async ({ page }) => {
  await fs.mkdir(OUT, { recursive: true });
  await open(page, viewport);
  const scale: number = await page.evaluate(() => (window as any).craftProbe.getScale());
  const rows: any[] = [];
  for (const [name, text] of Object.entries(sentences)) for (const style of styles) {
    const item = textItem(text, style);
    await page.evaluate(async item => {
      const p = (window as any).craftProbe; const slide = { background: '#FFFFFF', elements: [item] };
      await p.prepareFonts(slide); p.setSlide(slide);
    }, item);
    await page.waitForTimeout(60);
    const tag = `${name}-${style.name}-${viewport}`; const keep = name === 'mixed' && style.name === 'w420-36';
    const before = await bands(page, scale, keep ? `edit-before-${viewport}.png` : undefined);
    const box = (await page.locator('.paper').boundingBox())!;
    await page.mouse.dblclick(box.x + (item.x + 8) * scale, box.y + (item.y + item.fontSize / 2) * scale);
    const area = page.getByRole('textbox', { name: '슬라이드 글씨' }); await expect(area).toBeVisible();
    await page.mouse.move(0, 0); await page.waitForTimeout(60);
    const during = await bands(page, scale, keep ? `edit-during-${viewport}.png` : undefined);
    const metrics = await area.evaluate((e: HTMLTextAreaElement) => [e.clientWidth, e.offsetWidth, e.scrollHeight, e.clientHeight]);
    await page.getByRole('button', { name: '글씨 입력 완료' }).click(); await expect(area).toHaveCount(0); await page.waitForTimeout(60);
    const after = await bands(page, scale);
    const output = await page.evaluate(async item => {
      const p = (window as any).craftProbe, h = (window as any).h;
      return h.bandsFromCanvas(await p.renderSlide({ background: '#FFFFFF', elements: [item] }, 2), 2);
    }, item);
    const dy = (a: any[], b: any[]) => a.length === b.length ? Math.max(...a.map((band, i) => Math.abs(band.top - b[i].top))) : null;
    const dx = (a: any[], b: any[]) => a.length === b.length ? Math.max(...a.map((band, i) => Math.abs(band.right - b[i].right))) : null;
    rows.push({ tag, counts: [before.length, during.length, after.length, output.length], metrics,
      editDy: dy(before, during), editDxRight: dx(before, during), afterDy: dy(before, after), outDy: dy(before, output), outDxRight: dx(before, output),
      firstTop: [before[0]?.top, during[0]?.top, output[0]?.top] });
  }
  await fs.writeFile(path.join(OUT, `lines-screen-${viewport}.json`), JSON.stringify({ scale, rows }, null, 1));
  const mismatch = rows.filter(r => new Set(r.counts).size > 1);
  console.log(`scale ${scale}: band count mismatch ${mismatch.length}/${rows.length}`);
});
