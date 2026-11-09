import type { Pair } from '../../src/videoprobe/protocol';
import { expect, openProbe, runJob, save, startMemorySampler, test } from './helpers';

// 출력 메모리 조사(VIDEO_PHASE2_RESULTS.md §4.1). 단계별로 운영체제 메모리와 Worker 기록(넣은 프레임·나온 패킷·쓴 바이트)을 시간순으로 남긴다.
// PAIR(기본 webm), SECONDS(기본 180), LABEL(파일 이름 꼬리표), PROBE_ARGS(브라우저 인자, helpers.ts).
const pair = (process.env.PAIR ?? 'webm') as Pair;
const seconds = Number(process.env.SECONDS ?? 180);
const label = process.env.LABEL ?? 'default';

test(`출력 메모리 조사 ${pair} ${seconds}초 ${label}`, async ({ page }, testInfo) => {
  const errors = await openProbe(page);
  const info = await page.evaluate(() => (window as unknown as { videoProbe: { mainThreadInfo(): Promise<unknown> } }).videoProbe.mainThreadInfo());
  const source = `src-${pair}.${pair}`, out = `out-${pair}-memory.${pair}`;
  const results: Record<string, unknown> = { pair, seconds, label, args: process.env.PROBE_ARGS ?? '', info };

  async function phase(name: string, job: Parameters<typeof runJob>[1]) {
    const sampler = startMemorySampler();
    const started = Date.now();
    const result = await runJob(page, job);
    const peak = sampler.stop();
    results[name] = { started, ended: Date.now(), result, peak, memory: sampler.series() };
  }

  await phase('make', { kind: 'makeSource', name: source, pair, width: 1920, height: 1080, fps: 30, seconds, hardware: 'no-preference', trace: true });
  await phase('decode', { kind: 'decodeSpeed', name: source });
  await phase('export', { kind: 'export', input: source, name: out, pair, seconds, caption: true, sticker: false, memeClips: [], hardware: 'no-preference', bitrate: 10_000_000, trace: true });
  await runJob(page, { kind: 'remove', names: [source, out] });
  await save(testInfo, `memory-${pair}-${seconds}s-${label}`, results);
  expect(errors).toEqual([]);
});
