import { defineConfig } from 'vite';

// 제품 빌드 설정. base·assetsInlineLimit은 package.json의 build 명령 인자로 준다.
// 영상 가져오기 Worker(src/video/importWorker.ts)는 ES 모듈 Worker로 묶는다(Mediabunny는 이 Worker에만 들어간다).
export default defineConfig({
  worker: { format: 'es' },
});
