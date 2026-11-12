// 배포 결과를 하위 경로에서 내주는 시험용 정적 서버. 일반 정적 호스트처럼 파일만 내주고, 제품 코드가 아니다.
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(process.env.ROOT ?? 'dist'), PORT = Number(process.env.PORT ?? 4180), BASE = process.env.BASE ?? '/canvacraft/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.webm': 'video/webm', '.mp4': 'video/mp4', '.wav': 'audio/wav' };

// Linux 호스트(Vercel 등)처럼 파일 이름의 대소문자를 가린다. Windows는 가리지 않아 이름이 틀려도 시험이 통과할 수 있다.
const exactCase = relative => relative.split(sep).every((name, index, parts) => readdirSync(join(ROOT, ...parts.slice(0, index))).includes(name));

createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  if (!path.startsWith(BASE)) { response.writeHead(404).end(); return; }
  const relative = normalize(path.slice(BASE.length) || 'index.html');
  const file = join(ROOT, relative);
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile() || !exactCase(relative)) { response.writeHead(404).end(); return; }
  // 알 수 없는 확장자(.canvacraft)는 일반 호스트처럼 이진 파일로 내준다.
  response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
}).listen(PORT, '127.0.0.1', () => console.log(`http://127.0.0.1:${PORT}${BASE}`));
