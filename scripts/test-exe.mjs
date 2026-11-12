// 실행 파일을 직접 띄워 시험한다. npm run test:exe로 부른다. 브라우저를 열지 않도록 --no-open으로 실행한다.
import { execSync, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const EXE = 'artifacts/release/easyCraft.exe', PORT = 47831, URL = `http://127.0.0.1:${PORT}/`;
const wait = ms => new Promise(next => setTimeout(next, ms));
const failures = [];
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${detail}`); if (!ok) failures.push(name); };

// fetch는 Host를 바꿀 수 없어 직접 보낸다.
const raw = text => new Promise((resolve, reject) => {
  const socket = connect(PORT, '127.0.0.1', () => socket.write(text));
  let out = ''; socket.on('data', part => { out += part.toString('latin1'); }); socket.on('end', () => resolve(out)); socket.on('error', reject);
});
// 본문까지 읽어 연결을 정리한다. 서버가 응답마다 연결을 닫으므로 읽지 않으면 Node의 fetch가 멈춘다.
const get = async url => { const response = await fetch(url); const body = Buffer.from(await response.arrayBuffer()); return { status: response.status, ok: response.ok, headers: response.headers, body }; };
const statusOf = async text => Number((await raw(text)).split(' ')[1]);
async function ready() {
  for (let i = 0; i < 100; i++) { try { if ((await get(URL)).ok) return i * 100; } catch { /* 아직 안 켜졌다. */ } await wait(100); }
  throw new Error('실행 파일이 응답하지 않아요.');
}

// 사용자가 켜 둔 실행 파일이 있으면 시험이 그것을 보게 되므로 멈춘다. 대신 끄지 않는다.
if (await fetch(URL).then(response => response.arrayBuffer().then(() => true), () => false)) {
  console.error('easyCraft.exe가 이미 켜져 있어요. 알림 영역에서 끝내기를 누른 뒤 다시 시험해 주세요.');
  process.exit(1);
}

// 포트를 다른 프로그램이 쓰고 있을 때: 조용히 실패 코드로 끝나야 한다.
// 응답하지 않는 프로그램도 흉내 낸다. spawnSync 동안 이 프로세스는 멈추므로 응답이 없는 상태가 된다.
const blocker = createServer(socket => socket.end('HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nno'));
await new Promise(next => blocker.listen(PORT, '127.0.0.1', next));
const started0 = Date.now();
const blocked = spawnSync(EXE, ['--no-open'], { timeout: 15000 });
check('다른 프로그램이 포트를 쓰면 오래 기다리지 않고 코드 2로 끝난다', blocked.status === 2 && Date.now() - started0 < 8000, `status=${blocked.status} ${Date.now() - started0}ms`);
await new Promise(next => blocker.close(next));

let child = spawn(EXE, ['--no-open'], { stdio: 'ignore' });
let code = 1;
try {
  const started = Date.now(); await ready();
  check('실행 후 응답', true, `${Date.now() - started}ms`);
  const page = await get(URL);
  check('첫 화면은 HTML이고 캐시하지 않는다', page.headers.get('content-type').startsWith('text/html') && page.headers.get('cache-control') === 'no-cache');
  const html = page.body.toString('utf8');
  check('보안 정책이 들어 있다', html.includes('Content-Security-Policy'));
  const script = html.match(/assets\/index-[^"]+\.js/)[0];
  const asset = await get(URL + script);
  check('스크립트 형식과 오래 캐시', asset.headers.get('content-type').startsWith('text/javascript') && asset.headers.get('cache-control').includes('immutable'));
  const templates = JSON.parse((await get(`${URL}templates/manifest.json`)).body.toString('utf8'));
  const templateFile = (templates.templates ?? templates.assets ?? templates.items)[0].file;
  const template = await get(URL + String(templateFile).replace(/^\//, ''));
  check('템플릿 파일(.canvacraft)을 받는다', template.ok && template.body.subarray(0, 2).toString() === 'PK', String(templateFile));
  check('없는 파일은 404', (await get(`${URL}nothing.txt`)).status === 404);
  check('상위 경로로 나갈 수 없다', await statusOf(`GET /../../Windows/win.ini HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\n\r\n`) === 404);
  check('인코딩한 상위 경로도 막는다', await statusOf(`GET /..%2f..%2fWindows%2fwin.ini HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\n\r\n`) === 404);
  check('다른 Host는 거부한다', await statusOf(`GET / HTTP/1.1\r\nHost: evil.example\r\n\r\n`) === 403);
  check('GET 외 요청은 거부한다', await statusOf(`POST / HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nContent-Length: 0\r\n\r\n`) === 405);
  const listening = execSync(`netstat -ano -p TCP`, { encoding: 'utf8' }).split('\n').filter(line => line.includes(`:${PORT} `) && line.includes('LISTENING')).map(line => line.trim().split(/\s+/)[1]);
  check('이 컴퓨터 안에서만 연결을 받는다', listening.length === 1 && listening[0] === `127.0.0.1:${PORT}`, listening.join());
  const second = spawnSync(EXE, ['--no-open'], { timeout: 15000 });
  check('두 번 실행하면 둘째는 바로 끝난다', second.status === 0, `status=${second.status}`);
  check('둘째 실행 뒤에도 첫째가 응답한다', (await get(URL)).ok);

  // 집에서 쓰는 흐름: 실행 파일을 끄고 다시 켜도 같은 브라우저 프로필에 작품이 남는다.
  const profile = mkdtempSync(join(tmpdir(), 'canvacraft-profile-'));
  const saveState = page => page.getByTestId('save-state');
  let context = await chromium.launchPersistentContext(profile);
  let tab = await context.newPage();
  await tab.goto(URL);
  // 기억한 작품이 없으면 시작 화면에서 시작한다.
  await tab.getByRole('button', { name: '슬라이드 만들기' }).click();
  await tab.getByRole('button', { name: '새 작품' }).click();
  await tab.getByRole('button', { name: '페이지 추가' }).click();
  await tab.getByTestId('save-state').filter({ hasText: '저장됨' }).waitFor({ timeout: 8000 });
  await context.close();
  child.kill();
  for (let i = 0; i < 50; i++) { try { await get(URL); await wait(100); } catch { break; } }
  child = spawn(EXE, ['--no-open'], { stdio: 'ignore' });
  await ready();
  context = await chromium.launchPersistentContext(profile);
  tab = await context.newPage();
  await tab.goto(URL);
  await tab.getByRole('button', { name: '슬라이드 만들기' }).click();
  await tab.getByRole('list', { name: '내 작품' }).getByRole('button', { name: /열기$/ }).first().click();
  await tab.getByRole('button', { name: '2번째 장', exact: true }).waitFor({ timeout: 8000 });
  check('실행 파일을 다시 켜도 작품이 남는다', (await saveState(tab).textContent()) === '저장됨');
  await context.close();
  rmSync(profile, { recursive: true, force: true });

  // 배포본 시험 전체를 실행 파일의 주소로 돌린다.
  const suite = spawnSync('npx', ['playwright', 'test', '--config', 'playwright.release.config.ts', ...process.argv.slice(2)], { stdio: 'inherit', shell: true, env: { ...process.env, RELEASE_URL: URL } });
  check('배포본 시험 전체', suite.status === 0, `status=${suite.status}`);
  code = failures.length ? 1 : 0;
} finally { child.kill(); }
console.log(failures.length ? `실패: ${failures.join(', ')}` : '모두 통과');
process.exit(code);
