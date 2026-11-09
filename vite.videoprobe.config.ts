import { defineConfig } from 'vite';
// 영상 V2 시험 페이지만 배포 형식으로 빌드한다(CSP·Worker 확인용). 제품 빌드(npm run build)와 무관하다.
export default defineConfig({
  base: './',
  build: { outDir: 'artifacts/videoprobe-dist', emptyOutDir: true, assetsInlineLimit: 0, rollupOptions: { input: 'video-probe.html' } },
  worker: { format: 'es' },
});
