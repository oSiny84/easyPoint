// 앱 실행에 필요 없는 라이브러리 원본과 검수 파일을 배포 결과에서 뺀다. public/ 원본은 그대로 둔다.
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const REVIEW = ['preview.html', 'validation.json', 'browser-validation.json'];
const paths = [
  'dist/library/svg', 'dist/backgrounds/svg',
  // 그림 배경의 생성 프롬프트는 앱에 필요 없다.
  'dist/backgrounds-illustrated/prompts',
  // 템플릿은 .canvacraft 파일과 작은 미리보기만 있으면 열 수 있다.
  'dist/templates/assets', 'dist/templates/projects', 'dist/templates/previews',
  ...['library', 'backgrounds', 'templates'].flatMap(pack => REVIEW.map(name => `dist/${pack}/${name}`)),
];
for (const path of paths) rmSync(path, { recursive: true, force: true });
// 지원 브라우저는 모두 WOFF2를 읽으므로 WOFF 대체 파일은 배포하지 않는다.
for (const name of readdirSync('dist/assets')) if (name.endsWith('.woff')) rmSync(`dist/assets/${name}`);

// 사진과 작품이 외부로 나갈 경로를 막는다(계약 §8). 개발 서버는 인라인 스크립트를 쓰므로 배포 결과에만 넣는다.
// React style 속성과 글씨 입력 칸의 cssText 때문에 style-src에 unsafe-inline이 필요하다.
// 영상 편집기(영상 계약 §8): 미리보기는 저장소 영상을 blob: 주소의 <video>로 재생하고(media-src), 가져오기는 같은 origin의 Worker 파일에서 한다(worker-src).
const CSP = ["default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' blob: data:", "media-src 'self' blob:", "worker-src 'self'", "font-src 'self'", "connect-src 'self' blob: data:", "base-uri 'self'", "form-action 'none'"].join('; ');
const page = readFileSync('dist/index.html', 'utf8');
if (!page.includes('<head>')) throw new Error('dist/index.html에 head가 없어요.');
writeFileSync('dist/index.html', page.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${CSP}"/><meta name="referrer" content="no-referrer"/>`));
