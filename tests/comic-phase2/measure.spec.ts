// 만화 K2 확인(docs/COMIC_PHASE2_RESULTS.md의 근거). 제품의 쪽 조립과 PDF 내보내기를 시험 페이지에서 부른다.
// 결과는 artifacts/comic-phase2에 남긴다: 배치별 쪽 그림, 8칸 PDF, 수치(results.json).
import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';

const OUT = 'artifacts/comic-phase2';
const LAYOUTS = ['rows3', 'grid4', 'grid8'] as const;

test('쪽 조립과 만화책 PDF', async ({ page, browser }) => {
  await fs.mkdir(OUT, { recursive: true });
  await page.goto('/comic-probe.html');
  await expect(page.locator('#status')).toHaveText('준비됨');
  const results: Record<string, unknown> = { browser: browser.version() };

  for (const layout of LAYOUTS) {
    // 내려받기 배율(포인트당 3픽셀)의 첫 쪽과 만화 보기 배율(2)의 시간.
    const big = await page.evaluate(([name]) => window.comicProbe.page(name, 9, 0, 3), [layout] as const);
    expect(big.ok).toBe(true);
    if (!big.ok) continue;
    await fs.writeFile(`${OUT}/page-${layout}.png`, Buffer.from(big.png, 'base64'));
    const small = await page.evaluate(([name]) => window.comicProbe.page(name, 9, 0, 2), [layout] as const);
    results[`page-${layout}`] = { width: big.width, height: big.height, exportMs: Math.round(big.ms), viewMs: small.ok ? Math.round(small.ms) : null, pngBytes: big.bytes };
  }

  // 8칸 PDF는 사람이 열어 보고 인쇄할 수 있게 남긴다.
  for (const layout of LAYOUTS) {
    const made = await page.evaluate(([name]) => window.comicProbe.pdf(name, 8, false, true), [layout] as const);
    expect(made.ok).toBe(true);
    if (made.ok) { expect(made.pages).toBe(made.expectedPages); await fs.writeFile(`${OUT}/comic-${layout}.pdf`, Buffer.from(made.pdf!, 'base64')); }
  }
  // 100칸(상한): 그림만 있는 작품과 사진이 섞인 작품.
  for (const layout of LAYOUTS) for (const photos of [false, true]) {
    const made = await page.evaluate(([name, withPhotos]) => window.comicProbe.pdf(name, 100, withPhotos, false), [layout, photos] as const);
    expect(made.ok).toBe(true);
    if (made.ok) { expect(made.pages).toBe(made.expectedPages); results[`pdf100-${layout}-${photos ? 'photo' : 'drawing'}`] = { ms: Math.round(made.ms), pages: made.pages, bytes: made.bytes }; }
  }
  await fs.writeFile(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
});
