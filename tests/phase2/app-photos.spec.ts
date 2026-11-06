import { test, expect, type Browser } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';

// 실제 앱 경로로 잰 사진 문서 측정(계약 §9 Phase 5: 20장×사진 3장). 합성 사진, 개발 PC 기준이다.
const OUT = 'artifacts/phase5';

async function totalMemory(browser: Browser) {
  const session = await browser.newBrowserCDPSession();
  const info: any = await session.send('SystemInfo.getProcessInfo'); await session.detach();
  const ids = info.processInfo.map((p: any) => p.id).join(',');
  return Math.round(Number(execSync(`powershell -NoProfile -Command "(Get-Process -Id ${ids} -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum"`).toString().trim()) / 1048576);
}

test('20장×사진 3장: 입력·장 전환·메모리·출력', async ({ page, browser }) => {
  await fs.mkdir(OUT, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await expect(page.getByTestId('paper')).toBeVisible();
  const memory: any[] = [{ at: '시작', MB: await totalMemory(browser) }];
  const made = await page.evaluate(async () => {
    const { store, assets } = (window as any).__canvacraft;
    const { importAsset } = await import('/src/assets/importAsset.ts' as string);
    const { placeInCenter } = await import('/src/assets/library.ts' as string);
    const seedRandom = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const times: number[] = []; let bytes = 0;
    const run = (command: any) => { const p = store.getProject(); const result = store.dispatch(p.id, p.revision, command); if (!result.ok) throw new Error(result.message); return result; };
    for (let s = 0; s < 20; s++) {
      const slideId = s === 0 ? store.getProject().slides[0].id : run({ type: 'addSlide', afterSlideId: store.getProject().slides.at(-1).id }).slideId;
      for (let k = 0; k < 3; k++) {
        const random = seedRandom(s * 3 + k + 100); const canvas = document.createElement('canvas'); canvas.width = 4000; canvas.height = 3000; const c = canvas.getContext('2d')!;
        const g = c.createLinearGradient(0, 0, 4000, 3000); g.addColorStop(0, `hsl(${s * 37} 60% 70%)`); g.addColorStop(1, `hsl(${k * 83} 50% 35%)`); c.fillStyle = g; c.fillRect(0, 0, 4000, 3000);
        for (let i = 0; i < 9000; i++) { c.fillStyle = `hsla(${random() * 360} 60% ${30 + random() * 50}% / .35)`; c.beginPath(); c.arc(random() * 4000, random() * 3000, 2 + random() * random() * 90, 0, 7); c.fill(); }
        const file: Blob = await new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.92)); canvas.width = canvas.height = 0;
        const start = performance.now(); const imported = await importAsset(file); times.push(performance.now() - start);
        if (!imported.ok) throw new Error(imported.message);
        assets.put(imported.asset.id, imported.blob); bytes += imported.asset.byteLength;
        const box = placeInCenter(imported.asset.pixelWidth, imported.asset.pixelHeight, 390, 293);
        run({ type: 'addImage', slideId, assetId: imported.asset.id, asset: imported.asset, x: 30 + k * 410, y: 200, width: box.width, height: box.height });
      }
      run({ type: 'addText', slideId, x: 60, y: 40, width: 1100, text: `${s + 1}번째 장: 우리 가족 사진`, fontId: 'sans-ko', fontSize: 48, bold: true, color: '#283B37', align: 'left', lineHeight: 1.3 });
    }
    const sorted = [...times].sort((a, b) => a - b);
    return { importMsP50: Math.round(sorted[30]), importMsMax: Math.round(sorted[59]), storedMB: +(bytes / 1048576).toFixed(1) };
  });
  await page.waitForTimeout(8000); // 미리보기가 만들어지기를 기다린다.
  memory.push({ at: '60장 입력 후', MB: await totalMemory(browser) });

  const switches: number[] = [];
  for (let s = 0; s < 20; s++) {
    const start = Date.now();
    await page.getByRole('button', { name: `${s + 1}번째 장`, exact: true }).click();
    await page.waitForFunction(i => { const { store, currentSlideId } = (window as any).__canvacraft; return currentSlideId() === store.getProject().slides[i].id; }, s);
    await page.waitForTimeout(120);
    switches.push(Date.now() - start - 120);
    if (s % 5 === 4) memory.push({ at: `${s + 1}장까지 넘김`, MB: await totalMemory(browser) });
  }
  const out = await page.evaluate(async () => {
    const { store, assets } = (window as any).__canvacraft;
    const { exportPptx } = await import('/src/export/exportPptx.ts' as string);
    const { exportPdf } = await import('/src/export/exportPdf.ts' as string);
    const { serializeProject } = await import('/src/storage/projectFile.ts' as string);
    const snapshot = store.getProject(); const rows: any = {};
    const timed = async (name: string, run: () => Promise<any>) => { const start = performance.now(); const result = await run(); rows[name] = { seconds: +((performance.now() - start) / 1000).toFixed(1), MB: +(result.blob.size / 1048576).toFixed(1) }; };
    await timed('editablePptx', () => exportPptx(snapshot, assets.resolve, 'editable'));
    await timed('imagePptx', () => exportPptx(snapshot, assets.resolve, 'image'));
    await timed('pdf', () => exportPdf(snapshot, assets.resolve));
    await timed('original', () => serializeProject(snapshot, assets.resolve));
    return rows;
  });
  memory.push({ at: '출력 후', MB: await totalMemory(browser) });
  const sorted = [...switches].sort((a, b) => a - b);
  const result = { made, switchMsP50: sorted[10], switchMsMax: sorted[19], memory, out };
  await fs.writeFile(`${OUT}/app-photos.json`, JSON.stringify(result, null, 1));
  console.log(JSON.stringify(result));
  await page.screenshot({ path: `${OUT}/app-photos.png` });
});
