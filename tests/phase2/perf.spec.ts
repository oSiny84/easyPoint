import { test, expect, type Page, type Browser } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

// 이 PC(Ryzen 7 8700G, 32GB)에서 잰 값이다. CPU 4배 제한은 느린 PC의 대용일 뿐 RAM 8GB 기기 측정이 아니다.
const OUT = 'artifacts/phase2'; const FILE = path.join(OUT, 'perf.json');
async function save(key: string, value: unknown) {
  const all = JSON.parse(await fs.readFile(FILE, 'utf8').catch(() => '{}')); all[key] = value;
  await fs.writeFile(FILE, JSON.stringify(all, null, 1)); console.log(key, JSON.stringify(value));
}
async function open(page: Page) {
  await page.goto('/probe.html'); await expect(page.getByRole('status')).toContainText('준비됐어요', { timeout: 30000 });
  await page.addScriptTag({ content: `
    window.seedRandom = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    // 손으로 그린 듯한 곡선: 방향이 천천히 바뀌고 약간 떨린다. 평균 간격 4논리px.
    window.handStroke = (random, count) => {
      let x = 100 + random() * 1080, y = 80 + random() * 560, angle = random() * Math.PI * 2; const points = [];
      for (let i = 0; i < count; i++) {
        angle += (random() - 0.5) * 0.5; x += Math.cos(angle) * 4 + (random() - 0.5) * 0.8; y += Math.sin(angle) * 4 + (random() - 0.5) * 0.8;
        x = Math.min(1275, Math.max(5, x)); y = Math.min(715, Math.max(5, y)); points.push(+x.toFixed(1), +y.toFixed(1));
      }
      return points;
    };
    window.drawingSlide = (strokes, count) => { const random = seedRandom(7); const elements = [];
      for (let i = 0; i < strokes; i++) elements.push({ id: 's' + i, type: 'stroke', points: handStroke(random, count), color: ['#ED8F65', '#2A9D8F', '#577590', '#E9C46A'][i % 4], strokeWidth: 6 + i % 4 * 4 });
      elements.push({ id: 'title', type: 'text', x: 80, y: 40, width: 900, text: '우리 가족 그림', fontSize: 64, color: '#283B37', bold: true });
      return { background: '#FFF8E8', elements }; };
    window.stat = values => { const s = [...values].sort((a, b) => a - b); const at = q => +(s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0).toFixed(1); return { n: s.length, p50: at(.5), p95: at(.95), max: +(s[s.length - 1] ?? 0).toFixed(1) }; };
    window.recorder = { start() { this.frames = []; this.input = []; this.run = true; const loop = t => { this.frames.push(t); if (this.run) requestAnimationFrame(loop); }; requestAnimationFrame(loop);
        this.handler = e => { const s = performance.now(); requestAnimationFrame(() => setTimeout(() => this.input.push(performance.now() - s))); };
        addEventListener('pointerdown', this.handler, true); addEventListener('pointermove', this.handler, true); },
      stop() { this.run = false; removeEventListener('pointerdown', this.handler, true); removeEventListener('pointermove', this.handler, true);
        return { frameGap: stat(this.frames.slice(1).map((t, i) => t - this.frames[i])), inputToPaint: stat(this.input) }; } };
  ` });
}

test('획 단순화 허용 오차별 점 수와 그림 차이', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(() => {
    const w = window as any;
    const simplify = (points: number[], tolerance: number) => {
      const n = points.length / 2; const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1; const stack = [[0, n - 1]];
      while (stack.length) {
        const [a, b] = stack.pop()!; let best = -1, index = -1;
        const ax = points[a * 2], ay = points[a * 2 + 1], bx = points[b * 2], by = points[b * 2 + 1]; const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
        for (let i = a + 1; i < b; i++) { const d = Math.abs((points[i * 2] - ax) * dy - (points[i * 2 + 1] - ay) * dx) / len; if (d > best) { best = d; index = i; } }
        if (best > tolerance) { keep[index] = 1; stack.push([a, index], [index, b]); }
      }
      const out: number[] = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i * 2], points[i * 2 + 1]);
      return out;
    };
    const draw = (strokes: any[]) => { const canvas = document.createElement('canvas'); canvas.width = 2560; canvas.height = 1440; const c = canvas.getContext('2d', { willReadFrequently: true })!; c.scale(2, 2); c.lineCap = c.lineJoin = 'round'; c.fillStyle = '#fff'; c.fillRect(0, 0, 1280, 720);
      for (const s of strokes) { c.strokeStyle = s.color; c.lineWidth = s.strokeWidth; c.beginPath(); c.moveTo(s.points[0], s.points[1]); for (let i = 2; i < s.points.length; i += 2) c.lineTo(s.points[i], s.points[i + 1]); c.stroke(); } return c.getImageData(0, 0, 2560, 1440).data; };
    const strokes = w.drawingSlide(300, 200).elements.filter((e: any) => e.type === 'stroke'); const base = draw(strokes); const rows: any[] = [];
    for (const tolerance of [0.25, 0.5, 1, 2]) {
      const start = performance.now(); const next = strokes.map((s: any) => ({ ...s, points: simplify(s.points, tolerance) })); const ms = performance.now() - start;
      const data = draw(next); let big = 0, ink = 0; for (let i = 0; i < data.length; i += 4) { const d = Math.max(Math.abs(data[i] - base[i]), Math.abs(data[i + 1] - base[i + 1]), Math.abs(data[i + 2] - base[i + 2])); if (d > 60) big++; if (base[i] < 250 || base[i + 1] < 250 || base[i + 2] < 250) ink++; }
      rows.push({ tolerance, pointsAfter: next.reduce((n: number, s: any) => n + s.points.length / 2, 0), pointsBefore: 300 * 200, jsonKB: Math.round(JSON.stringify(next.map((s: any) => s.points)).length / 1024), ms: +ms.toFixed(1), changedPercentOfInk: +(big * 100 / ink).toFixed(3) });
    }
    return { jsonKBBefore: Math.round(JSON.stringify(strokes.map((s: any) => s.points)).length / 1024), rows };
  });
  await save('simplify', result);
});

test('글씨 줄 계산 시간', async ({ page }) => {
  await open(page);
  await save('layoutText', await page.evaluate(async () => {
    const p = (window as any).craftProbe; const body = '우리 가족은 주말마다 함께 공원에 가서 자전거를 타요. ';
    const out: any = {};
    for (const length of [50, 500, 5000]) {
      const text = body.repeat(Math.ceil(length / body.length)).slice(0, length);
      const item = { id: 'x', type: 'text', x: 0, y: 0, width: 900, text, fontSize: 36, color: '#000000', bold: false };
      await p.prepareFonts({ background: '#FFFFFF', elements: [item] });
      const times: number[] = []; for (let i = 0; i < 20; i++) { const s = performance.now(); p.layoutText(item); times.push(performance.now() - s); }
      out[length] = (window as any).stat(times);
    }
    return out;
  }));
});

for (const throttle of [1, 4]) test(`조작 반응 300획 문서 CPU 제한 ${throttle}배`, async ({ page, context }) => {
  await open(page);
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.evaluate(() => (window as any).craftProbe.setSlide((window as any).drawingSlide(300, 200)));
  await page.waitForTimeout(1500);
  const box = (await page.locator('.paper').boundingBox())!; const scale = await page.evaluate(() => (window as any).craftProbe.getScale());
  const measure = async (run: () => Promise<void>) => { await page.evaluate(() => (window as any).recorder.start()); await run(); return page.evaluate(() => (window as any).recorder.stop()); };
  // 글씨를 300획 위로 끈다.
  const drag = await measure(async () => {
    await page.mouse.move(box.x + 120 * scale, box.y + 80 * scale); await page.mouse.down();
    for (let i = 1; i <= 90; i++) await page.mouse.move(box.x + (120 + i * 5) * scale, box.y + (80 + i * 4) * scale);
    await page.mouse.up();
  });
  const movedX: number = await page.evaluate(() => new Promise(resolve => (window as any).craftProbe.setSlide((slide: any) => { resolve(slide.elements.at(-1).x); return slide; })));
  expect(movedX).toBeGreaterThan(300);
  await page.getByRole('button', { name: '그림 그리기' }).click(); await page.waitForTimeout(500);
  // 300획이 있는 장에 새 획을 그린다.
  const draw = await measure(async () => {
    await page.mouse.move(box.x + 200 * scale, box.y + 200 * scale); await page.mouse.down();
    for (let i = 1; i <= 120; i++) { await page.mouse.move(box.x + (200 + i * 6) * scale, box.y + (200 + Math.sin(i / 5) * 80) * scale); if (throttle === 1 && i === 90) await page.screenshot({ path: path.join(OUT, 'perf-draw-during.png') }); }
    await page.mouse.up();
  });
  if (throttle === 1) { await page.waitForTimeout(200); await page.screenshot({ path: path.join(OUT, 'perf-draw-after.png') }); }
  const exports = await page.evaluate(async () => {
    const w = window as any, p = w.craftProbe; const slide = w.drawingSlide(300, 200); const run = async (f: () => Promise<Blob>) => { const s = performance.now(); const blob = await f(); return { ms: Math.round(performance.now() - s), bytes: blob.size }; };
    return { pdfJpeg: await run(() => p.makePdf(slide, 'jpeg')), pptxAuto: await run(() => p.makePptx(slide, 'auto')) };
  });
  await save(`interaction-x${throttle}`, { scale, movedX, drag, draw, exports });
});

async function totalMemory(browser: Browser) {
  const session = await browser.newBrowserCDPSession();
  const info: any = await session.send('SystemInfo.getProcessInfo'); await session.detach();
  const ids = info.processInfo.map((p: any) => p.id).join(',');
  const bytes = execSync(`powershell -NoProfile -Command "(Get-Process -Id ${ids} -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum"`).toString().trim();
  return Math.round(Number(bytes) / 1048576);
}

test('사진 문서 20장×3장: 메모리·출력·PDF 코덱', async ({ page, browser, context }) => {
  await open(page);
  const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
  const heap = async () => { const { metrics } = await cdp.send('Performance.getMetrics'); return Math.round(metrics.find(m => m.name === 'JSHeapUsedSize')!.value / 1048576); };
  const memory: any[] = [{ at: 'open', totalMB: await totalMemory(browser), heapMB: await heap() }];
  // 서로 다른 사진 60장(긴 변 2560px JPEG)을 합성한다. 실제 사진이 아니라 세부가 많은 합성 그림이다.
  const made = await page.evaluate(async () => {
    const w = window as any; const urls: string[] = []; let bytes = 0; const start = performance.now();
    for (let n = 0; n < 60; n++) {
      const random = w.seedRandom(n + 100); const canvas = document.createElement('canvas'); canvas.width = n % 3 ? 2560 : 1707; canvas.height = n % 3 ? 1707 : 2560; const c = canvas.getContext('2d')!;
      const g = c.createLinearGradient(0, 0, canvas.width, canvas.height); g.addColorStop(0, `hsl(${n * 37} 60% 70%)`); g.addColorStop(1, `hsl(${n * 83} 50% 35%)`); c.fillStyle = g; c.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < 9000; i++) { c.fillStyle = `hsla(${random() * 360} 60% ${30 + random() * 50}% / .35)`; c.beginPath(); c.arc(random() * canvas.width, random() * canvas.height, 2 + random() * random() * 60, 0, 7); c.fill(); }
      const blob: Blob = await new Promise(r => canvas.toBlob(b => r(b!), 'image/jpeg', 0.88)); bytes += blob.size; urls.push(URL.createObjectURL(blob)); canvas.width = canvas.height = 0;
    }
    const slides = Array.from({ length: 20 }, (_, s) => ({ background: '#FFF8E8', elements: [
      { id: 't' + s, type: 'text', x: 60, y: 30, width: 1100, text: `${s + 1}번째 장: 우리 가족 소개 English 123`, fontSize: 48, color: '#283B37', bold: true },
      ...[0, 1, 2].map(k => ({ id: `p${s}-${k}`, type: 'image', source: urls[s * 3 + k], x: 40 + k * 410, y: 140, width: 390, height: (s * 3 + k) % 3 ? 260 : 585 > 500 ? 500 : 585 })),
      { id: 'b' + s, type: 'text', x: 60, y: 600, width: 1150, text: '함께 웃고, 함께 자라는 우리 가족! 사진을 보며 이야기해요.', fontSize: 36, color: '#36524A', bold: false },
    ] }));
    w.photoDoc = slides;
    return { averageJpegKB: Math.round(bytes / 60 / 1024), totalMB: +(bytes / 1048576).toFixed(1), ms: Math.round(performance.now() - start) };
  });
  memory.push({ at: 'photos generated', totalMB: await totalMemory(browser), heapMB: await heap() });
  // 실제 화면에서 20장을 차례로 표시한다.
  const switches: number[] = [];
  for (let s = 0; s < 20; s++) {
    switches.push(await page.evaluate(async s => {
      const w = window as any; const start = performance.now(); w.craftProbe.setSlide(w.photoDoc[s]);
      await new Promise(r => setTimeout(r, 0)); await Promise.all(w.photoDoc[s].elements.filter((e: any) => e.type === 'image').map((e: any) => { const i = new Image(); i.src = e.source; return i.decode(); }));
      await new Promise(r => requestAnimationFrame(() => setTimeout(r))); return performance.now() - start;
    }, s));
    if (s % 5 === 4) memory.push({ at: `after slide ${s + 1}`, totalMB: await totalMemory(browser), heapMB: await heap() });
  }
  await page.screenshot({ path: path.join(OUT, 'perf-photo-screen.png') });
  await save('photoScreen', { made, slideSwitchMs: await page.evaluate(v => (window as any).stat(v), switches), memory });

  const outputs: any[] = []; const keep: Record<string, string> = {};
  for (const [label, kind, format, quality] of [['pdf-png', 'pdf', 'png', 1], ['pdf-jpeg-85', 'pdf', 'jpeg', .85], ['pdf-jpeg-88', 'pdf', 'jpeg', .88], ['pdf-jpeg-90', 'pdf', 'jpeg', .9], ['pptx-auto', 'pptx', 'auto', 0], ['pptx-image', 'pptx', 'image', 0]] as const) {
    const before = await totalMemory(browser);
    const row = await page.evaluate(async ([kind, format, quality]) => {
      const w = window as any, p = w.craftProbe; const start = performance.now();
      const blob: Blob = kind === 'pdf' ? await p.makePdf(w.photoDoc, format, 1, quality) : await p.makePptx(w.photoDoc, format);
      const ms = performance.now() - start; w.lastBlob = blob; return { ms: Math.round(ms), MB: +(blob.size / 1048576).toFixed(1) };
    }, [kind, format, quality] as const);
    outputs.push({ label, ...row, memoryBeforeMB: before, memoryAfterMB: await totalMemory(browser) });
    console.log(JSON.stringify(outputs[outputs.length - 1]));
    if (['pdf-jpeg-88', 'pptx-auto'].includes(label)) keep[label] = await page.evaluate(() => new Promise<string>(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.readAsDataURL((window as any).lastBlob); }));
  }
  await fs.writeFile(path.join(OUT, 'perf-photos.pdf'), Buffer.from(keep['pdf-jpeg-88'], 'base64'));
  await fs.mkdir(path.join(OUT, 'perf'), { recursive: true }); await fs.writeFile(path.join(OUT, 'perf', 'photos.pptx'), Buffer.from(keep['pptx-auto'], 'base64'));
  // 글씨 품질: 같은 장의 PNG 렌더를 기준으로 글씨 영역 PSNR을 잰다.
  const quality = await page.evaluate(async () => {
    const w = window as any, p = w.craftProbe; const canvas: HTMLCanvasElement = await p.renderSlide(w.photoDoc[1], 2);
    const region = (c: CanvasRenderingContext2D) => c.getImageData(100, 40, 2200, 140).data; const base = region(canvas.getContext('2d', { willReadFrequently: true })!); const rows: any[] = [];
    for (const q of [.85, .88, .9]) {
      const blob: Blob = await new Promise(r => canvas.toBlob(b => r(b!), 'image/jpeg', q)); const bitmap = await createImageBitmap(blob);
      const other = document.createElement('canvas'); other.width = canvas.width; other.height = canvas.height; const x = other.getContext('2d', { willReadFrequently: true })!; x.drawImage(bitmap, 0, 0); const d = region(x);
      let sum = 0; for (let i = 0; i < d.length; i += 4) sum += (d[i] - base[i]) ** 2 + (d[i + 1] - base[i + 1]) ** 2 + (d[i + 2] - base[i + 2]) ** 2;
      rows.push({ q, psnr: +(10 * Math.log10(255 * 255 / (sum / (d.length * .75)))).toFixed(1), pageKB: Math.round(blob.size / 1024) });
    }
    return rows;
  });
  await save('outputs', { outputs, quality, memoryAfter: await totalMemory(browser) });
});
