import { openProbe, save, startMemorySampler, expect, test } from './helpers';

// 500MB 영상 바이트의 IndexedDB Blob vs OPFS, 1GB .canvavideo(STORE ZIP)를 메모리에 올리지 않고 쓰고 읽기.
test('저장소와 큰 원본 파일', async ({ page }, testInfo) => {
  const errors = await openProbe(page);
  const call = (name: string, arg: number) => page.evaluate(([n, a]) => (window as unknown as { videoProbe: Record<string, (value: number) => Promise<unknown>> }).videoProbe[n as string](a as number), [name, arg] as const);
  let sampler = startMemorySampler();
  const storage = await call('storageTest', 500); const storageMemory = sampler.stop();
  sampler = startMemorySampler();
  const zip = await call('zipTest', 1024) as { crcOk: boolean; sizeOk: boolean }; const zipMemory = sampler.stop();
  await save(testInfo, 'storage', { storage, storageMemory, zip, zipMemory });
  expect(errors).toEqual([]);
  expect(zip.crcOk && zip.sizeOk).toBe(true);
});
