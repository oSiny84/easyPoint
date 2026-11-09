import { test as base, chromium, expect, type Page, type TestInfo } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Job } from '../../src/videoprobe/protocol';

export const OUT = 'artifacts/video-phase2';
const PROFILE_TAG = 'canvacraft-videoprobe-profile';

// 기본 컨텍스트는 시크릿 창과 같아 OPFS·IndexedDB가 메모리에 잡히고 용량이 작다(10분 출력이 QuotaExceededError로 멈춤).
// 실제 사용자처럼 디스크 프로필로 띄운다. 매 시험마다 빈 프로필에서 시작한다.
export const test = base.extend({
  context: async ({ browserName, channel, headless, viewport }, use, testInfo) => {
    void browserName;
    const dir = path.join(os.tmpdir(), `${PROFILE_TAG}-${testInfo.project.name}`);
    await fs.rm(dir, { recursive: true, force: true });
    const context = await chromium.launchPersistentContext(dir, { channel, headless, viewport, baseURL: testInfo.project.use.baseURL, acceptDownloads: true });
    await use(context);
    await context.close();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  },
  page: async ({ context }, use) => { await use(context.pages()[0] ?? await context.newPage()); },
});
export { expect };

export async function openProbe(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/video-probe.html');
  await expect(page.getByRole('status')).toHaveText('준비됐어요', { timeout: 60_000 });
  return errors;
}

export function runJob<T = Record<string, unknown>>(page: Page, job: Job): Promise<T> {
  return page.evaluate(value => (window as unknown as { videoProbe: { runJob(job: unknown): Promise<unknown> } }).videoProbe.runJob(value), job) as Promise<T>;
}

export async function save(testInfo: TestInfo, name: string, data: unknown) {
  await fs.mkdir(OUT, { recursive: true });
  const file = `${OUT}/${name}-${testInfo.project.name}.json`;
  await fs.writeFile(file, JSON.stringify(data, null, 2));
  return file;
}

// 브라우저 전체 프로세스(브라우저·GPU·렌더러·유틸리티)의 작업 집합을 운영체제에서 2초마다 잰다.
// performance.memory는 VideoFrame이 쓰는 네이티브·GPU 메모리를 보지 못하기 때문이다. 공유 페이지가 중복 합산될 수 있다.
export function startMemorySampler() {
  const script = `while ($true) { $p = Get-CimInstance Win32_Process -Filter "Name='chrome.exe' or Name='msedge.exe' or Name='chrome-headless-shell.exe'" | Where-Object { $_.CommandLine -like '*canvacraft-videoprobe-profile*' };
    $sum = ($p | Measure-Object WorkingSetSize -Sum).Sum; $r = ($p | Where-Object { $_.CommandLine -like '*--type=renderer*' } | Measure-Object WorkingSetSize -Maximum).Maximum; $g = ($p | Where-Object { $_.CommandLine -like '*--type=gpu-process*' } | Measure-Object WorkingSetSize -Maximum).Maximum;
    Write-Output "$sum $r $g"; Start-Sleep -Seconds 2 }`;
  const child = spawn('powershell', ['-NoProfile', '-Command', script], { stdio: ['ignore', 'pipe', 'ignore'] });
  const peak = { total: 0, renderer: 0, gpu: 0, samples: 0 };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (text: string) => {
    for (const line of text.split(/\r?\n/)) {
      const [total, renderer, gpu] = line.trim().split(' ').map(Number);
      if (!Number.isFinite(total)) continue;
      peak.samples++; peak.total = Math.max(peak.total, total); peak.renderer = Math.max(peak.renderer, renderer || 0); peak.gpu = Math.max(peak.gpu, gpu || 0);
    }
  });
  return {
    stop() {
      child.kill();
      const mb = (value: number) => Math.round(value / 1024 / 1024);
      return { peakTotalMB: mb(peak.total), peakRendererMB: mb(peak.renderer), peakGpuMB: mb(peak.gpu), samples: peak.samples };
    },
  };
}

// 내려받은 출력 파일을 사용자가 파일을 고르는 것과 같은 경로(파일 선택 → blob URL → <video>)로 재생한다.
export async function playFile(page: Page, path: string) {
  await page.evaluate(() => { const input = document.createElement('input'); input.type = 'file'; input.id = 'pick'; document.body.append(input); });
  await page.setInputFiles('#pick', path);
  return page.evaluate(async () => {
    const file = (document.getElementById('pick') as HTMLInputElement).files![0];
    const video = document.createElement('video'); video.muted = true; document.body.append(video);
    video.src = URL.createObjectURL(file);
    const event = (name: string) => new Promise<void>((resolve, reject) => { video.addEventListener(name, () => resolve(), { once: true }); video.addEventListener('error', () => reject(new Error(`video error ${video.error?.code} ${video.error?.message}`)), { once: true }); });
    await event('loadedmetadata');
    const result: Record<string, unknown> = { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
    await video.play(); await new Promise(resolve => setTimeout(resolve, 1500)); video.pause();
    result.playedTo = video.currentTime;
    const quality = video.getVideoPlaybackQuality(); result.decodedFrames = quality.totalVideoFrames; result.droppedFrames = quality.droppedVideoFrames;
    result.audioBytes = (video as unknown as { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount ?? null;
    const seeked = event('seeked'); video.currentTime = video.duration / 2; await seeked; result.seekedTo = video.currentTime;
    video.remove(); document.getElementById('pick')!.remove();
    return result;
  });
}

