// 배포 결과를 하위 경로에서 내주는 시험용 정적 서버. 일반 정적 호스트처럼 파일만 내주고, 제품 코드가 아니다.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve('dist'), PORT = Number(process.env.PORT ?? 4180), BASE = process.env.BASE ?? '/canvacraft/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  if (!path.startsWith(BASE)) { response.writeHead(404).end(); return; }
  const relative = normalize(path.slice(BASE.length) || 'index.html');
  const file = join(ROOT, relative);
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
  // 알 수 없는 확장자(.canvacraft)는 일반 호스트처럼 이진 파일로 내준다.
  response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
}).listen(PORT, '127.0.0.1', () => console.log(`http://127.0.0.1:${PORT}${BASE}`));
