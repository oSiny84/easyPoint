import { defineConfig } from '@playwright/test';
// 영상 편집기 V8 측정 전용(10분 작품 제품 내보내기 시간·메모리). 오래 걸리므로 npm test와 분리한다.
// 원본 합성은 V2 측정 페이지(video-probe.html)를, 내보내기는 제품 화면(/)을 같은 개발 서버에서 쓴다.
// 하드웨어 인코더를 쓰도록 설치된 Chrome·Edge를 창을 띄워 실행한다. 실행: npx playwright test -c playwright.video-v8.config.ts --project=chrome
const PORT = 5179;
export default defineConfig({
  testDir: './tests/video-v8', timeout: 3_600_000, workers: 1,
  use: { baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 1280, height: 900 } },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'chrome', use: { browserName: 'chromium', channel: 'chrome', headless: false } },
    { name: 'msedge', use: { browserName: 'chromium', channel: 'msedge', headless: false } },
  ],
  webServer: { command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`, url: `http://127.0.0.1:${PORT}/video-probe.html`, reuseExistingServer: true },
});
