import { defineConfig } from '@playwright/test';
// 만화 K2 확인 전용. npm test와 분리한다.
// 실행: npx playwright test -c playwright.comic-phase2.config.ts
const PORT = 5184;
export default defineConfig({
  testDir: './tests/comic-phase2', timeout: 600_000, workers: 1,
  use: { baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 1280, height: 900 } },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: { command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`, url: `http://127.0.0.1:${PORT}/comic-probe.html`, reuseExistingServer: false },
});
