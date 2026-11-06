import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = 'artifacts/phase2/bg';

// 격자와 네 구역 색, 가운데 십자가 있는 시험 그림. 잘림·늘어남이 눈과 수치로 드러난다.
async function pattern(page: Page, width: number, height: number): Promise<string> {
  return page.evaluate(([w, h]) => {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d')!;
    for (const [x, y, color] of [[0, 0, '#E76F51'], [w / 2, 0, '#2A9D8F'], [0, h / 2, '#E9C46A'], [w / 2, h / 2, '#577590']] as const) { c.fillStyle = color; c.fillRect(x, y, w / 2, h / 2); }
    c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(1, w / 400);
    const step = Math.max(w, h) / 16;
    for (let i = 0; i <= 16; i++) { c.beginPath(); c.moveTo(i * step, 0); c.lineTo(i * step, h); c.moveTo(0, i * step); c.lineTo(w, i * step); c.stroke(); }
    c.strokeStyle = '#000000'; c.lineWidth = Math.max(2, w / 200);
    c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
    c.beginPath(); c.arc(w / 2, h / 2, Math.min(w, h) / 4, 0, Math.PI * 2); c.stroke();
    return canvas.toDataURL('image/png');
  }, [width, height] as const);
}

const sizes = [[2400, 800], [800, 1600], [320, 180], [1000, 700]] as const;
const modes = ['slide', 'element', 'sizing'] as const;

test('배경 넣는 방식 비교용 파일과 같은 사진 중복 파일 생성', async ({ page }) => {
  await fs.rm(OUT, { recursive: true, force: true }); await fs.mkdir(OUT, { recursive: true });
  await page.goto('/probe.html');
  await expect(page.getByRole('status')).toContainText('준비됐어요', { timeout: 30000 });
  const images = [];
  for (const [w, h] of sizes) images.push(await pattern(page, w, h));
  const overlay = [
    { id: 't', type: 'text', x: 90, y: 60, width: 500, text: '배경 위 글씨', fontSize: 48, color: '#000000', bold: true },
    { id: 's1', type: 'stroke', points: [200, 400, 400, 500, 600, 420], color: '#FF00FF', strokeWidth: 16 },
    { id: 's2', type: 'stroke', points: [900, 300], color: '#00FFFF', strokeWidth: 40 },
  ];
  const appPngs = await page.evaluate(async ({ images, overlay }) => {
    const p = (window as any).craftProbe; const out: string[] = [];
    for (const backgroundImage of images) out.push((await p.renderSlide({ background: '#FFFFFF', backgroundImage, elements: overlay }, 2)).toDataURL());
    return out;
  }, { images, overlay });
  for (let i = 0; i < appPngs.length; i++) await fs.writeFile(path.join(OUT, `app-${i + 1}.png`), Buffer.from(appPngs[i].split(',')[1], 'base64'));
  for (const mode of modes) {
    const bytes = await page.evaluate(async ({ images, overlay, mode }) => {
      const p = (window as any).craftProbe;
      const blob = await p.makePptx(images.map(backgroundImage => ({ background: '#FFFFFF', backgroundImage, elements: overlay })), 'auto', { background: mode });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }, { images, overlay, mode });
    await fs.writeFile(path.join(OUT, `bg-${mode}.pptx`), Buffer.from(bytes));
  }
  // 같은 사진·같은 배경을 20장에 쓴 파일. 사진이 몇 번 저장되는지 압축을 풀어 센다.
  const dup = await page.evaluate(async () => {
    const p = (window as any).craftProbe;
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1200;
    const c = canvas.getContext('2d')!; const g = c.createLinearGradient(0, 0, 1600, 1200); g.addColorStop(0, '#9CD6B0'); g.addColorStop(1, '#EDC69A'); c.fillStyle = g; c.fillRect(0, 0, 1600, 1200);
    for (let i = 0; i < 4000; i++) { c.fillStyle = `hsl(${i % 360} 70% 60%)`; c.fillRect((i * 37) % 1600, (i * 91) % 1200, 9, 9); }
    const source = canvas.toDataURL('image/jpeg', 0.9);
    const photo = { background: '#FFFFFF', elements: [{ id: 'p', type: 'image', source, x: 100, y: 100, width: 400, height: 300 }] };
    const both = { background: '#FFFFFF', backgroundImage: source, elements: [] };
    const toBytes = (blob: Blob) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
    return { jpegBytes: atob(source.split(',')[1]).length,
      photo: await toBytes(await p.makePptx(Array.from({ length: 20 }, () => photo), 'auto')),
      bg: await toBytes(await p.makePptx(Array.from({ length: 20 }, () => both), 'auto', { background: 'slide' })) };
  });
  await fs.writeFile(path.join(OUT, 'dup-photo.pptx'), Buffer.from(dup.photo, 'base64')); await fs.writeFile(path.join(OUT, 'dup-bg.pptx'), Buffer.from(dup.bg, 'base64'));
  await fs.writeFile(path.join(OUT, 'dup-source.json'), JSON.stringify({ jpegBytes: dup.jpegBytes }));
});

test('배경 방식별 PowerPoint 렌더와 앱 렌더 차이', async ({ page }) => {
  test.skip(!(await fs.stat(path.join(OUT, 'bg-slide', '1.png')).catch(() => null)), 'PowerPoint 렌더 없음');
  await page.goto('/probe.html');
  const results: any[] = [];
  for (const mode of modes) for (let i = 1; i <= sizes.length; i++) {
    const [app, ppt] = await Promise.all([fs.readFile(path.join(OUT, `app-${i}.png`)), fs.readFile(path.join(OUT, `bg-${mode}`, `${i}.png`))]);
    const diff = await page.evaluate(async ([a, b]) => {
      const load = async (s: string) => { const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob()); const c = document.createElement('canvas'); c.width = 2560; c.height = 1440; const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(bitmap, 0, 0, 2560, 1440); return x.getImageData(0, 0, 2560, 1440).data; };
      const [p, q] = await Promise.all([load(a), load(b)]); let sum = 0, big = 0;
      for (let k = 0; k < p.length; k += 4) { const d = (Math.abs(p[k] - q[k]) + Math.abs(p[k + 1] - q[k + 1]) + Math.abs(p[k + 2] - q[k + 2])) / 3; sum += d; if (d > 40) big++; }
      return { mean: +(sum / (p.length / 4)).toFixed(2), bigPercent: +(big * 100 / (p.length / 4)).toFixed(3) };
    }, [app.toString('base64'), ppt.toString('base64')] as const);
    results.push({ mode, size: sizes[i - 1].join('x'), ...diff });
  }
  await fs.writeFile('artifacts/phase2/background-compare.json', JSON.stringify(results, null, 1));
  for (const r of results) console.log(JSON.stringify(r));
});
