import fs from 'node:fs/promises';
import type { TestInfo, Page } from '@playwright/test';
import { expect, playFile, startMemorySampler, test } from '../video-phase2/helpers';
import type { AnimProbe, ExportJob } from '../../src/animprobe/main';

// 애니메이션 A2 기술 검증(animation-contracts.md §9 A2 행). 제품 코드가 아닌 시험 페이지(/anim-probe.html)에서 잰다.
// 결과는 artifacts/animation-phase2/*.json과 출력 파일(.mp4·.webm)로 남기고, 요약은 docs/ANIMATION_PHASE2_RESULTS.md에 옮긴다.
const OUT = 'artifacts/animation-phase2';
const SLIDES = 100;

async function openProbe(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/anim-probe.html');
  await expect(page.getByRole('status')).toHaveText('준비됐어요', { timeout: 60_000 });
  return errors;
}
// 페이지의 window.animProbe 함수를 부른다.
function call<K extends keyof AnimProbe>(page: Page, name: K, ...args: Parameters<AnimProbe[K]>): Promise<Awaited<ReturnType<AnimProbe[K]>>> {
  return page.evaluate(([method, values]) => ((window as unknown as { animProbe: Record<string, (...input: unknown[]) => unknown> }).animProbe[method as string](...(values as unknown[]))), [name, args] as const) as Promise<Awaited<ReturnType<AnimProbe[K]>>>;
}
async function save(testInfo: TestInfo, name: string, data: unknown) {
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(`${OUT}/${name}-${testInfo.project.name}.json`, JSON.stringify(data, null, 2));
}
async function saveFile(page: Page, testInfo: TestInfo, name: string) {
  const [stem, extension] = name.split('.');
  const target = `${OUT}/${stem}-${testInfo.project.name}.${extension}`;
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(target, Buffer.from(await call(page, 'fileBase64', name), 'base64'));
  return target;
}

test('장 그리기 시간: 출력 1.5배·양파 껍질 1배·재생 0.5배', async ({ page }, testInfo) => {
  const errors = await openProbe(page);
  const results: Record<string, unknown> = { info: await call(page, 'info') };
  for (const kind of ['drawing', 'photo'] as const) {
    results[`${kind}-export-1.5`] = await call(page, 'renderTimes', kind, SLIDES, 1.5);
    results[`${kind}-onion-1`] = await call(page, 'renderTimes', kind, SLIDES, 1);
    const sampler = startMemorySampler();
    results[`${kind}-preview-0.5`] = await call(page, 'renderTimes', kind, SLIDES, 0.5, true);
    await page.waitForTimeout(4500);
    results[`${kind}-preview-0.5-memory-held`] = sampler.stop();
    await call(page, 'releaseKept');
    results[`${kind}-onion-draw`] = await call(page, 'onionDraw', kind, 200);
  }
  await save(testInfo, 'render', results);
  expect(errors).toEqual([]);
});

test('내보내기: 100장 작품을 그려 넘기고 인코딩한다', async ({ page }, testInfo) => {
  const errors = await openProbe(page);
  await call(page, 'removeFiles');
  const jobs: ExportJob[] = [
    { kind: 'drawing', count: SLIDES, fps: 6, hold: 1, container: 'mp4', mode: 'repeat', file: 'drawing-400.mp4' },
    { kind: 'photo', count: SLIDES, fps: 6, hold: 1, container: 'mp4', mode: 'repeat', file: 'photo-400.mp4' },
    { kind: 'drawing', count: SLIDES, fps: 6, hold: 1, container: 'mp4', mode: 'variable', file: 'drawing-400-variable.mp4' },
    { kind: 'drawing', count: SLIDES, fps: 6, hold: 1, container: 'webm', mode: 'repeat', file: 'drawing-400.webm' },
    { kind: 'photo', count: SLIDES, fps: 2, hold: 4, container: 'mp4', mode: 'repeat', file: 'photo-4800.mp4' },
    { kind: 'photo', count: SLIDES, fps: 2, hold: 4, container: 'webm', mode: 'repeat', file: 'photo-4800.webm' },
    { kind: 'drawing', count: SLIDES, fps: 2, hold: 4, container: 'mp4', mode: 'variable', file: 'drawing-4800-variable.mp4' },
  ];
  const results: Record<string, unknown> = {};
  for (const job of jobs) {
    const sampler = startMemorySampler();
    let exported: Awaited<ReturnType<AnimProbe['exportRun']>>;
    try { exported = await call(page, 'exportRun', job); }
    catch (error) { results[job.file] = { job, failed: String(error) }; sampler.stop(); continue; }
    const memory = sampler.stop();
    // 장 i의 첫 프레임과 그 직전 프레임(앞 장의 마지막 프레임)을 본다. 가변 방식은 장마다 1프레임이라 시각으로 같은 자리를 묻는다.
    const perSlide = (job.hold * 24) / job.fps;
    const checkSlides = [0, 1, 2, 50, 99];
    const frames = checkSlides.flatMap(index => index === 0 ? [0] : [index * perSlide - 1, index * perSlide]);
    const inspected = await call(page, 'inspect', job.file, frames);
    const saved = exported.bytes < 60 * 1024 * 1024 ? await saveFile(page, testInfo, job.file) : null;
    const played = saved ? await playFile(page, saved).catch(error => ({ failed: String(error) })) : null;
    results[job.file] = { exported, memory, inspected, checkedFrames: frames, played };
    // 그림 문서는 배경색으로 장을 구분한다(코덱 오차 허용). 앞 장의 마지막 프레임과 이 장의 첫 프레임이 각각 제 장의 색이어야 한다.
    if (job.kind === 'drawing') {
      const expectedSlide = (frame: number) => Math.floor(frame / perSlide);
      inspected.colors.forEach((color, at) => {
        const slide = expectedSlide(frames[at]);
        const found = Math.round((color.r - 20) / 30) + 8 * Math.round((color.g - 20) / 30) + 64 * Math.round((color.b - 60) / 100);
        expect(found, `${job.file} 프레임 ${frames[at]}의 장`).toBe(slide);
      });
    }
    expect(inspected.packets).toBe(job.mode === 'repeat' ? exported.frames : SLIDES);
    expect(Math.abs(inspected.duration - exported.seconds)).toBeLessThan(0.1);
  }
  await save(testInfo, 'export', results);
  await call(page, 'removeFiles');
  expect(errors).toEqual([]);
});
