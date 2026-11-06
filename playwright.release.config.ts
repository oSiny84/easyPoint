import { defineConfig } from '@playwright/test';
// 배포 결과(dist)를 하위 경로에서 시험한다. 먼저 npm run build가 필요하다(npm run test:release).
// RELEASE_URL을 주면 이미 켜진 서버를 시험한다. 실행 파일 시험(npm run test:exe)이 이 경로를 쓴다.
const given = process.env.RELEASE_URL;
const baseURL = given ?? 'http://127.0.0.1:4180/canvacraft/';
export default defineConfig({
  testDir: './tests/release', timeout: 180000, workers: 1,
  use: { baseURL, viewport: { width: 1366, height: 768 } },
  ...(given ? {} : { webServer: { command: 'node scripts/serve-dist.mjs', url: baseURL, reuseExistingServer: false } }),
});
