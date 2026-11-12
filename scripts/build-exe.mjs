// dist를 품은 단일 실행 파일을 만든다. npm run exe로 부른다. Windows에 기본으로 있는 C# 컴파일러만 쓴다.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import JSZip from 'jszip';

const compiler = join(process.env.WINDIR ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
if (!existsSync(compiler)) throw new Error(`C# 컴파일러가 없어요: ${compiler}`);
if (!existsSync('dist/index.html')) throw new Error('dist가 없어요. npm run build를 먼저 해 주세요.');

// 실행 중인 파일은 덮어쓸 수 없다. 컴파일러의 알 수 없는 오류 대신 할 일을 알려 준다.
const target = 'artifacts/release/easyCraft.exe';
if (existsSync(target)) {
  try { closeSync(openSync(target, 'r+')); }
  catch { console.error('easyCraft.exe가 실행 중이에요. 오른쪽 아래 알림 영역의 easyCraft 아이콘에서 끝내기를 누른 뒤 다시 실행해 주세요.'); process.exit(1); }
}

const walk = dir => readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]; });
const zip = new JSZip();
for (const path of walk('dist')) zip.file(relative('dist', path).replaceAll('\\', '/'), readFileSync(path));
const app = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

// 앱의 파비콘과 같은 모양: 보라색 바탕에 흰 슬라이드.
function iconImage(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const radius = size * 0.22, inset = Math.round(size * 0.22), top = Math.round(size * 0.28), bottom = Math.round(size * 0.72);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nearX = Math.min(x + 0.5, size - x - 0.5), nearY = Math.min(y + 0.5, size - y - 0.5);
    const inCorner = nearX < radius && nearY < radius;
    const outside = inCorner && Math.hypot(radius - nearX, radius - nearY) > radius;
    const paper = x >= inset && x < size - inset && y >= top && y < bottom;
    const [r, g, b] = paper ? [255, 255, 255] : [124, 58, 237];
    pixels.set([b, g, r, outside ? 0 : 255], ((size - 1 - y) * size + x) * 4); // BMP는 아래 줄부터 저장한다.
  }
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); header.writeInt32LE(size, 4); header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12); header.writeUInt16LE(32, 14); header.writeUInt32LE(pixels.length, 20);
  return Buffer.concat([header, pixels, Buffer.alloc(Math.ceil(size / 32) * 4 * size)]);
}
function iconFile(sizes) {
  const images = sizes.map(iconImage);
  const head = Buffer.alloc(6 + sizes.length * 16);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((size, i) => {
    const at = 6 + i * 16;
    head.writeUInt8(size, at); head.writeUInt8(size, at + 1); head.writeUInt16LE(1, at + 4); head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(images[i].length, at + 8); head.writeUInt32LE(offset, at + 12);
    offset += images[i].length;
  });
  return Buffer.concat([head, ...images]);
}

const work = mkdtempSync(join(tmpdir(), 'canvacraft-exe-'));
try {
  writeFileSync(join(work, 'app.zip'), app);
  writeFileSync(join(work, 'build.txt'), createHash('sha256').update(app).digest('hex').slice(0, 16));
  writeFileSync(join(work, 'icon.ico'), iconFile([16, 32, 48]));
  mkdirSync('artifacts/release', { recursive: true });
  const output = resolve('artifacts/release/easyCraft.exe');
  execFileSync(compiler, ['/nologo', '/target:winexe', '/optimize+', '/codepage:65001', `/out:${output}`, `/win32icon:${join(work, 'icon.ico')}`,
    `/resource:${join(work, 'app.zip')},app.zip`, `/resource:${join(work, 'build.txt')},build.txt`,
    '/r:System.IO.Compression.dll', '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', '/r:System.Core.dll',
    resolve('launcher/CanvaCraftLauncher.cs')], { stdio: 'inherit' });
  const bytes = readFileSync(output);
  console.log(JSON.stringify({ file: 'artifacts/release/easyCraft.exe', megabytes: +(bytes.length / 1048576).toFixed(1), sha256: createHash('sha256').update(bytes).digest('hex') }));
} finally { rmSync(work, { recursive: true, force: true }); }
