import { defineConfig } from '@playwright/test';
// 영상 편집기 V2 측정 전용. 오래 걸리므로 npm test와 분리한다.
// 번들 Chromium에는 H.264·AAC가 없으므로 설치된 Chrome·Edge 채널로도 돈다. 하드웨어 인코더를 쓰도록 창을 띄워 실행한다.
const PORT = 5179;
export default defineConfig({
  testDir: './tests/video-phase2', timeout: 3_600_000, workers: 1,
  use: { baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 1280, height: 900 } },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'chrome', use: { browserName: 'chromium', channel: 'chrome', headless: false } },
    { name: 'msedge', use: { browserName: 'chromium', channel: 'msedge', headless: false } },
  ],
  webServer: { command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`, url: `http://127.0.0.1:${PORT}/video-probe.html`, reuseExistingServer: true },
});
