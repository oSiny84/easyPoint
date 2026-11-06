// dist를 정적 호스트에 올릴 압축 파일로 묶는다. 올리기는 하지 않는다. 절차는 docs/RELEASE.md에 있다.
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import JSZip from 'jszip';

const walk = dir => readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]; });
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
let commit = 'nogit', dirty = false;
try {
  commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0;
} catch { /* git이 없어도 묶을 수 있다. */ }

const zip = new JSZip();
const files = walk('dist');
for (const path of files) zip.file(relative('dist', path).replaceAll('\\', '/'), readFileSync(path));
const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const name = `canvacraft-web-${version}-${commit}${dirty ? '-dirty' : ''}.zip`;
mkdirSync('artifacts/release', { recursive: true });
writeFileSync(join('artifacts/release', name), bytes);
const sha256 = createHash('sha256').update(bytes).digest('hex');
writeFileSync(join('artifacts/release', `${name}.sha256`), `${sha256}  ${name}\n`);
console.log(JSON.stringify({ file: `artifacts/release/${name}`, files: files.length, megabytes: +(bytes.length / 1048576).toFixed(1), sha256, dirty }));
