import { defineConfig } from '@playwright/test';
// 배포 결과(dist)를 하위 경로에서 시험한다. 먼저 npm run build가 필요하다(npm run test:release).
export default defineConfig({
  testDir: './tests/release', timeout: 180000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4180/canvacraft/', viewport: { width: 1366, height: 768 } },
  webServer: { command: 'node scripts/serve-dist.mjs', url: 'http://127.0.0.1:4180/canvacraft/', reuseExistingServer: false },
});
