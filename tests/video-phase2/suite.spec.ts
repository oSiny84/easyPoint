import fs from 'node:fs/promises';
import { OUT, expect, openProbe, save, test } from './helpers';

// workerOfflineAudio의 error는 측정값(Worker에 OfflineAudioContext 없음)이라 실패로 보지 않는다.
// 다른 PC에서 사용자가 누르는 "1분 시험" 단추 경로를 그대로 돌린다(단추 → suite → JSON 내려받기).
test('시험 페이지 단추로 1분 묶음 시험', async ({ page }, testInfo) => {
  const errors = await openProbe(page);
  const waiting = page.waitForEvent('download', { timeout: 1_800_000 });
  await page.getByRole('button', { name: /1분 시험/ }).click();
  const download = await waiting;
  await fs.mkdir(OUT, { recursive: true });
  const file = `${OUT}/suite-1m-${testInfo.project.name}.json`;
  await download.saveAs(file);
  const results = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
  const failed = Object.entries(results).filter(([key, value]) => key !== 'workerOfflineAudio' && value && typeof value === 'object' && 'error' in (value as object)).map(([key, value]) => `${key}: ${(value as { error: string }).error.slice(0, 200)}`);
  await save(testInfo, 'suite-summary', { keys: Object.keys(results), failed, chosenPair: results.chosenPair });
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});
