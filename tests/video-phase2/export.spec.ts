import type { Page } from '@playwright/test';
import fs from 'node:fs/promises';
import type { Pair } from '../../src/videoprobe/protocol';
import { OUT, openProbe, runJob, save, startMemorySampler, expect, test } from './helpers';

// 출력 측정: 합성 1080p30 원본 → 해독·합성(자막·스티커·밈 영상 2개)·인코딩 → 다시 해독해 프레임 번호 검사.
// MINUTES(기본 1), PAIRS(기본 브라우저별), KEEP=1이면 출력 파일을 artifacts에 내려받는다.
const minutes = Number(process.env.MINUTES ?? 1);

async function download(page: Page, name: string) {
  const waiting = page.waitForEvent('download');
  await page.evaluate(n => (window as unknown as { videoProbe: { downloadFile(name: string): Promise<number> } }).videoProbe.downloadFile(n), name);
  const file = await waiting; await fs.mkdir(`${OUT}/files`, { recursive: true });
  await file.saveAs(`${OUT}/files/${name}`);
}

test(`출력 ${minutes}분`, async ({ page }, testInfo) => {
  const errors = await openProbe(page);
  const seconds = minutes * 60; const project = testInfo.project.name;
  const pairs = (process.env.PAIRS?.split(',') ?? ['mp4', 'webm']) as Pair[];
  const results: Record<string, unknown> = { minutes, project };
  for (const pair of pairs) {
    const source = `src-${pair}.${pair}`, meme = `meme-${pair}.${pair}`;
    results[`make-${pair}`] = await runJob(page, { kind: 'makeSource', name: source, pair, width: 1920, height: 1080, fps: 30, seconds, hardware: 'no-preference' });
    results[`decode-${pair}`] = await runJob(page, { kind: 'decodeSpeed', name: source });
    await runJob(page, { kind: 'makeSource', name: meme, pair, width: 1280, height: 720, fps: 30, seconds: 4, hardware: 'no-preference' });
    const variants = [
      { key: 'plain', caption: true, sticker: false, memeClips: [] as string[], hardware: 'no-preference' as const },
      { key: 'memes', caption: true, sticker: true, memeClips: [meme, meme], hardware: 'no-preference' as const },
      ...(pair === 'mp4' && project !== 'chromium' ? [{ key: 'software', caption: true, sticker: false, memeClips: [] as string[], hardware: 'prefer-software' as const }] : []),
      // YouTube 권장(moov 앞쪽)을 흘려 쓰기로 맞출 수 있는지. 비트레이트는 YouTube 권장 8Mbps.
      ...(pair === 'mp4' ? [{ key: 'faststart', caption: true, sticker: true, memeClips: [meme, meme], hardware: 'no-preference' as const, fastStart: 'reserve' as const, bitrate: 8_000_000 }] : []),
    ];
    for (const variant of variants) {
      const out = `out-${pair}-${variant.key}-${minutes}m-${project}.${pair}`;
      const sampler = startMemorySampler();
      const exported = await runJob(page, { kind: 'export', input: source, name: out, pair, seconds, caption: variant.caption, sticker: variant.sticker, memeClips: variant.memeClips, hardware: variant.hardware, bitrate: ('bitrate' in variant ? variant.bitrate : undefined) ?? 10_000_000, fastStart: 'fastStart' in variant ? variant.fastStart : 'end' });
      const memory = sampler.stop();
      const verified = await runJob<{ frameMismatches: number; video: { packets: number }; topBoxes: string[] }>(page, { kind: 'verify', name: out, fps: 30, samples: 24 });
      results[`export-${pair}-${variant.key}`] = { exported, memory, verified };
      expect.soft(verified.frameMismatches, `${out} 프레임 번호`).toBe(0);
      expect.soft(verified.video.packets, `${out} 프레임 수`).toBe(seconds * 30);
      if (variant.key === 'faststart') expect.soft(verified.topBoxes.indexOf('moov'), `${out} moov 위치`).toBeLessThan(verified.topBoxes.indexOf('mdat'));
      if (process.env.KEEP === '1') await download(page, out);
      await runJob(page, { kind: 'remove', names: [out] });
    }
    if (minutes === 1) {
      // 자막 1.5배 확인용 프레임(밈 포함 출력은 지웠으므로 다시 짧게 만든다).
      const still = `still-${pair}.${pair}`;
      await runJob(page, { kind: 'export', input: source, name: still, pair, seconds: 6, caption: true, sticker: true, memeClips: [meme, meme], hardware: 'no-preference', bitrate: 10_000_000 });
      const { png } = await runJob<{ png: Record<string, number> }>(page, { kind: 'snapshot', name: still, atSeconds: 5.5 });
      await fs.mkdir(OUT, { recursive: true });
      await fs.writeFile(`${OUT}/frame-${pair}-${project}.png`, Uint8Array.from(Object.values(png)));
      await runJob(page, { kind: 'remove', names: [still] });
    }
    await runJob(page, { kind: 'remove', names: [source, meme] });
  }
  await save(testInfo, `export-${minutes}m`, results);
  expect(errors).toEqual([]);
});
