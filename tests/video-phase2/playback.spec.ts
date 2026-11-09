import fs from 'node:fs';
import { OUT, openProbe, playFile, save, expect, test } from './helpers';

test('출력 파일을 video 요소로 재생한다', async ({ page }, testInfo) => {
  const errors = await openProbe(page);
  const dir = `${OUT}/files`; const results: Record<string, unknown> = {};
  const files = fs.readdirSync(dir).filter(name => name.endsWith('.mp4') || name.endsWith('.webm'));
  test.skip(files.length === 0, '먼저 KEEP=1로 출력 측정을 돌린다');
  for (const name of files) {
    // 번들 Chromium은 MP4 재생도 시험한다(지원 여부 자체가 측정 대상).
    try { results[name] = await playFile(page, `${dir}/${name}`); }
    catch (error) { results[name] = { error: String(error) }; }
  }
  await save(testInfo, 'playback', results);
  expect(errors).toEqual([]);
});
