import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { playFile, runJob, save, expect, test } from './helpers';

// 배포 형식 빌드 + CSP에서 Worker·Mediabunny·ImageDecoder·OPFS·video 재생이 도는지 본다.
// CSP_VARIANT=proposed(기본), blobworker, current(지금 제품 CSP 그대로). 원본은 출력과 같은 1920×1080이어야 번호 사각형 위치가 맞는다.
const variant = process.env.CSP_VARIANT ?? 'proposed';
const PORT = 4191;
let server: ChildProcess | undefined;

test.beforeAll(async () => {
  execSync(`node scripts/videoprobe-dist.mjs ${variant}`, { stdio: 'inherit' });
  server = spawn('node', ['scripts/serve-dist.mjs'], { env: { ...process.env, ROOT: 'artifacts/videoprobe-dist', BASE: '/', PORT: String(PORT) }, stdio: 'ignore' });
  await new Promise(resolve => setTimeout(resolve, 800));
});
test.afterAll(() => { server?.kill(); });

test(`배포본 CSP(${variant})`, async ({ page }, testInfo) => {
  const errors: string[] = []; const violations: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', event => { (window as unknown as { __csp: string[] }).__csp ??= []; (window as unknown as { __csp: string[] }).__csp.push(`${event.violatedDirective} ${event.blockedURI}`); }); });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await expect(page.getByRole('status')).toHaveText('준비됐어요', { timeout: 60_000 });
  const pair = testInfo.project.name === 'chromium' ? 'webm' : 'mp4';
  const results: Record<string, unknown> = { variant };
  const attempt = async (key: string, work: () => Promise<unknown>) => { try { results[key] = await work(); } catch (error) { results[key] = { error: String(error).slice(0, 400) }; } };
  await attempt('support', () => runJob(page, { kind: 'support' }));
  await attempt('make', () => runJob(page, { kind: 'makeSource', name: `csp-src.${pair}`, pair, width: 1920, height: 1080, fps: 30, seconds: 3, hardware: 'no-preference' }));
  await attempt('meme', () => runJob(page, { kind: 'makeSource', name: `csp-meme.${pair}`, pair, width: 640, height: 360, fps: 30, seconds: 2, hardware: 'no-preference' }));
  await attempt('export', () => runJob(page, { kind: 'export', input: `csp-src.${pair}`, name: `csp-out.${pair}`, pair, seconds: 3, caption: true, sticker: true, memeClips: [`csp-meme.${pair}`], hardware: 'no-preference', bitrate: 4_000_000 }));
  await attempt('verify', () => runJob(page, { kind: 'verify', name: `csp-out.${pair}`, fps: 30, samples: 6 }));
  await attempt('alpha', () => runJob(page, { kind: 'alpha' }));
  await attempt('snapshot', async () => { const { png } = await runJob<{ png: unknown }>(page, { kind: 'snapshot', name: `csp-out.${pair}`, atSeconds: 1 }); return { ok: Boolean(png) }; });
  // video 요소 재생(media-src blob:).
  const file = `artifacts/video-phase2/csp-${testInfo.project.name}.${pair}`;
  await attempt('download', async () => {
    const waiting = page.waitForEvent('download');
    await page.evaluate(n => (window as unknown as { videoProbe: { downloadFile(name: string): Promise<number> } }).videoProbe.downloadFile(n), `csp-out.${pair}`);
    await (await waiting).saveAs(file); return { ok: true };
  });
  await attempt('playback', () => playFile(page, file));
  await runJob(page, { kind: 'remove', names: [`csp-src.${pair}`, `csp-meme.${pair}`, `csp-out.${pair}`] });
  violations.push(...await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []));
  results.violations = violations; results.consoleErrors = errors;
  await save(testInfo, `csp-${variant}`, results);
  expect((results.verify as { frameMismatches?: number }).frameMismatches).toBe(0);
  if (variant === 'current') expect(JSON.stringify(results.playback)).toContain('error');
});
