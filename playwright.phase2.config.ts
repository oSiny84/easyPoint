import { defineConfig } from '@playwright/test';
// Phase 2 측정 전용. 시간이 오래 걸리고 PowerPoint 비교 데이터를 만들므로 npm test와 분리한다.
export default defineConfig({
  testDir: './tests/phase2', timeout: 900000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1440, height: 1000 } },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
});
