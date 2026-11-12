import { defineConfig } from '@playwright/test';
// 애니메이션 A2 측정 전용. 오래 걸리므로 npm test와 분리한다.
// 번들 Chromium(소프트웨어 인코더)과 설치된 Chrome(하드웨어 인코더, 창을 띄움)에서 돈다.
// 실행: npx playwright test -c playwright.animation-phase2.config.ts --project=chromium
const PORT = 5183;
export default defineConfig({
  testDir: './tests/animation-phase2', timeout: 3_600_000, workers: 1,
  use: { baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 1280, height: 900 } },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'chrome', use: { browserName: 'chromium', channel: 'chrome', headless: false } },
    { name: 'msedge', use: { browserName: 'chromium', channel: 'msedge', headless: false } },
  ],
  webServer: { command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`, url: `http://127.0.0.1:${PORT}/anim-probe.html`, reuseExistingServer: false },
});
