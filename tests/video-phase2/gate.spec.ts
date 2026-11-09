import { openProbe, runJob, save, expect, test } from './helpers';

// 관문: Worker에서 합성 1080p30 10초를 쓰고 다시 읽어 프레임 수·길이·번호를 확인한다.
test('10초 영상을 쓰고 다시 읽는다', async ({ page }, testInfo) => {
  const errors = await openProbe(page);
  const pair = testInfo.project.name === 'chromium' ? 'webm' : 'mp4';
  const name = `gate.${pair}`;
  const made = await runJob(page, { kind: 'makeSource', name, pair, width: 1920, height: 1080, fps: 30, seconds: 10, hardware: 'no-preference' });
  const verified = await runJob<{ video: { packets: number }; duration: number; frameMismatches: number }>(page, { kind: 'verify', name, fps: 30, samples: 12 });
  await save(testInfo, 'gate', { made, verified });
  await runJob(page, { kind: 'remove', names: [name] });
  expect(errors).toEqual([]);
  expect(verified.video.packets).toBe(300);
  expect(verified.duration).toBeGreaterThan(9.9);
  expect(verified.frameMismatches).toBe(0);
});
