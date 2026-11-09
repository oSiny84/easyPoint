import { openProbe, runJob, save, expect, test } from './helpers';

// 코덱 지원표, Worker 안 Web Audio, 투명 WebM, 애니메이션 WebP·APNG.
test('지원표와 밈 형식', async ({ page }, testInfo) => {
  const errors = await openProbe(page);
  const probe = (name: string) => page.evaluate(n => (window as unknown as { videoProbe: Record<string, () => Promise<unknown>> }).videoProbe[n](), name);
  const main = await probe('mainThreadInfo');
  const workerOfflineAudio = await probe('workerOfflineAudio');
  const support = await runJob(page, { kind: 'support' });
  const alpha = await runJob(page, { kind: 'alpha' }).catch(error => ({ error: String(error) }));
  const webp = await runJob(page, { kind: 'animatedImage', format: 'webp', size: 512, fps: 24, seconds: 5 }).catch(error => ({ error: String(error) }));
  const apng = await runJob(page, { kind: 'animatedImage', format: 'png', size: 512, fps: 24, seconds: 5 }).catch(error => ({ error: String(error) }));
  await save(testInfo, 'support', { main, workerOfflineAudio, support, alpha, webp, apng });
  expect(errors).toEqual([]);
});
