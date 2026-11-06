import { test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const DIR = 'artifacts/phase2/ppt';
const HELPERS = path.resolve('tests/phase2/browser-helpers.js');
const clean = (text: string) => text.replace(/[\r\n\v\u000b]+$/g, '').replace(/\s+$/g, '');

// PowerPoint가 실제로 나눈 줄과 렌더 이미지의 잉크 위치를 앱 결과와 비교한다.
test('PowerPoint 결과와 앱 비교', async ({ page }) => {
  test.skip(!(await fs.stat(path.join(DIR, 'powerpoint.json')).catch(() => null)), 'PowerPoint 결과 없음. scripts/phase2-powerpoint.ps1을 먼저 실행한다');
  const expected = JSON.parse(await fs.readFile(path.join(DIR, 'expected.json'), 'utf8'));
  const raw = (await fs.readFile(path.join(DIR, 'powerpoint.json'), 'utf8')).replace(/^﻿/, '');
  const power = JSON.parse(raw);
  await page.goto('/probe.html');
  await page.addScriptTag({ path: HELPERS });
  const summary: any[] = []; const details: any[] = [];
  for (const file of power.files) {
    let sameLines = 0, sameCount = 0; const dy: number[] = [], firstDy: any[] = [], dxRight: number[] = [], extra: any[] = []; let overRight = 0, bandMismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      const want = expected[i]; const slide = file.slides[i];
      const box = slide.boxes[0]; const lines = [box.lines].flat();
      const got = lines.map((l: any) => clean(l.text)); const app = want.lines.map(clean);
      const same = JSON.stringify(got) === JSON.stringify(app);
      if (same) sameLines++; if (got.length === app.length) sameCount++;
      const png = (await fs.readFile(path.join(DIR, file.file, `${slide.index}.png`))).toString('base64');
      const bands = await page.evaluate(([p]) => (window as any).h.bandsFromPng(p, 2), [png] as const);
      const right = Math.max(...bands.map((b: any) => b.right));
      if (right > want.x + want.width + 1) overRight++;
      if (bands.length === want.bands.length) {
        bands.forEach((b: any, k: number) => { dy.push(b.top - want.bands[k].top); dxRight.push(b.right - want.bands[k].right); });
        firstDy.push({ size: want.fontSize, dy: bands[0].top - want.bands[0].top });
      } else bandMismatch++;
      if (!same) extra.push({ name: want.name, style: want.style, app, got });
    }
    const bySize: Record<string, number[]> = {};
    for (const f of firstDy) (bySize[f.size] ??= []).push(f.dy);
    const stat = (a: number[]) => a.length ? { min: +Math.min(...a).toFixed(1), max: +Math.max(...a).toFixed(1), mean: +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2) } : null;
    summary.push({ file: file.file, slides: expected.length, sameLines, sameCount, bandMismatch, overRight, dy: stat(dy), dxRight: stat(dxRight), firstDyBySize: Object.fromEntries(Object.entries(bySize).map(([k, v]) => [k, stat(v)])) });
    details.push({ file: file.file, different: extra });
  }
  await fs.writeFile('artifacts/phase2/pptx-compare.json', JSON.stringify({ edit: power.edit, version: power.version, summary, details }, null, 1));
  for (const s of summary) console.log(JSON.stringify(s));
  console.log('edit', JSON.stringify(power.edit));
});
