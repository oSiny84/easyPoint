// 영상 V2 시험 페이지를 빌드하고 제품 배포본과 같은 방식으로 CSP를 넣는다. CSP 안은 인자로 고른다.
//   node scripts/videoprobe-dist.mjs proposed   → 제품 CSP + media-src 'self' blob: + worker-src 'self'
//   node scripts/videoprobe-dist.mjs blobworker → 위 + worker-src에 blob: 추가
//   node scripts/videoprobe-dist.mjs current    → 지금 제품 CSP 그대로(media-src 없음)
import { execSync } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

const variant = process.argv[2] ?? 'proposed';
execSync('npx vite build --config vite.videoprobe.config.ts', { stdio: 'inherit' });
// 제품 CSP(scripts/prune-dist.mjs)와 같은 바탕.
const base = ["default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' blob: data:", "font-src 'self'", "connect-src 'self' blob: data:", "base-uri 'self'", "form-action 'none'"];
const extra = variant === 'current' ? [] : variant === 'blobworker' ? ["media-src 'self' blob:", "worker-src 'self' blob:"] : ["media-src 'self' blob:", "worker-src 'self'"];
const CSP = [...base, ...extra].join('; ');
const file = 'artifacts/videoprobe-dist/video-probe.html';
const page = readFileSync(file, 'utf8');
writeFileSync(file, page.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${CSP}"/>`));
renameSync(file, 'artifacts/videoprobe-dist/index.html');
console.log(`CSP(${variant}): ${CSP}`);
