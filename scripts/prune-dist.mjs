// 앱 실행에 필요 없는 라이브러리 원본과 검수 파일을 배포 결과에서 뺀다. public/ 원본은 그대로 둔다.
import { readdirSync, rmSync } from 'node:fs';

const REVIEW = ['preview.html', 'validation.json', 'browser-validation.json'];
const paths = [
  'dist/library/svg', 'dist/backgrounds/svg',
  // 템플릿은 .canvacraft 파일과 작은 미리보기만 있으면 열 수 있다.
  'dist/templates/assets', 'dist/templates/projects', 'dist/templates/previews',
  ...['library', 'backgrounds', 'templates'].flatMap(pack => REVIEW.map(name => `dist/${pack}/${name}`)),
];
for (const path of paths) rmSync(path, { recursive: true, force: true });
// 지원 브라우저는 모두 WOFF2를 읽으므로 WOFF 대체 파일은 배포하지 않는다.
for (const name of readdirSync('dist/assets')) if (name.endsWith('.woff')) rmSync(`dist/assets/${name}`);
