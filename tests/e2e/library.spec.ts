import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { PDFDocument, PDFName } from 'pdf-lib';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sha256Hex } from '../../src/assets/imageHeader';
import { contentOf, ids, loadSample, sampleAssets } from '../contracts/helpers';

// 사진·배경·요소 라이브러리의 입력부터 저장·출력까지.
const OUT = 'artifacts/phase5';
const doc = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__canvacraft.store.getProject())));
const current = async (page: Page) => { const project = await doc(page); const id = await page.evaluate(() => (window as any).__canvacraft.currentSlideId()); return project.slides.find((slide: any) => slide.id === id); };
const rail = (page: Page, name: string) => page.getByRole('navigation', { name: '도구' }).getByRole('button', { name });
const status = (page: Page) => page.getByRole('status');

async function sampleFile() {
  const project = loadSample(); const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format: 'canvacraft', schemaVersion: 1 }));
  zip.file('project.json', JSON.stringify(project));
  for (const asset of project.assetManifest) zip.file(`assets/${asset.id}.${asset.mime === 'image/png' ? 'png' : 'jpg'}`, sampleAssets().get(asset.id)!);
  return { name: 's.canvacraft', mimeType: 'application/zip', buffer: Buffer.from(await zip.generateAsync({ type: 'uint8array' })) };
}
async function start(page: Page) { await page.goto('/'); await expect(page.getByTestId('paper')).toBeVisible(); }
async function openSample(page: Page) { await start(page); await page.getByTestId('open-file').setInputFiles(await sampleFile()); await expect(status(page)).toContainText('새 작품'); }

// 브라우저에서 시험 사진을 만든다.
async function photo(page: Page, options: { width?: number; height?: number; mime?: string; transparent?: boolean } = {}) {
  const { width = 800, height = 600, mime = 'image/jpeg', transparent = false } = options;
  const data = await page.evaluate(async ({ width, height, mime, transparent }) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const c = canvas.getContext('2d')!;
    if (!transparent) { c.fillStyle = '#2A9D8F'; c.fillRect(0, 0, width, height); }
    c.fillStyle = '#E76F51'; c.fillRect(0, 0, width / 2, height / 2);
    const blob: Blob = await new Promise(resolve => canvas.toBlob(b => resolve(b!), mime, 0.9));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, { width, height, mime, transparent });
  return Buffer.from(data);
}
const upload = (page: Page, buffer: Buffer, name = '김철수_우리집.jpg', mimeType = 'image/jpeg') => page.getByTestId('upload-file').setInputFiles({ name, mimeType, buffer });

// JPEG에 방향(Orientation=6)과 촬영 위치 표식이 든 EXIF를 끼워 넣는다.
function withExif(jpeg: Buffer) {
  const gpsMark = Buffer.from('GPSLatitude37.5665N-secret');
  const tiff = Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from('MM\0\x2a\0\0\0\x08\0\x01\x01\x12\0\x03\0\0\0\x01\0\x06\0\0\0\0\0\0', 'latin1'), gpsMark]);
  const length = Buffer.alloc(2); length.writeUInt16BE(tiff.length + 2);
  return { bytes: Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1]), length, tiff, jpeg.subarray(2)]), gpsMark };
}

test('파일 선택·끌어놓기·붙여넣기로 같은 사진을 넣는다', async ({ page, context }) => {
  await start(page);
  const jpeg = await photo(page, { width: 640, height: 480 });
  await upload(page, jpeg);
  await expect(status(page)).toContainText('사진을 넣었어요');
  let slide = await current(page);
  expect(slide.elements).toHaveLength(1);
  const first = slide.elements[0];
  expect(first.type).toBe('image');
  expect(first.width / first.height).toBeCloseTo(4 / 3, 2);
  // 가운데에 놓이고 바로 선택된다.
  expect(first.x + first.width / 2).toBeCloseTo(640, 0); expect(first.y + first.height / 2).toBeCloseTo(360, 0);
  await expect(page.getByTestId('selection-box')).toBeVisible();

  // 끌어놓기.
  const dataTransfer = await page.evaluateHandle(bytes => { const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(bytes)], 'x.jpg', { type: 'image/jpeg' })); return dt; }, Array.from(jpeg));
  await page.getByTestId('work').dispatchEvent('drop', { dataTransfer });
  await expect.poll(async () => (await current(page)).elements.length).toBe(2);

  // 실제 클립보드에 그림을 넣고 Ctrl+V로 붙여 넣는다.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(async bytes => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240; canvas.getContext('2d')!.fillRect(0, 0, 320, 240);
    const blob: Blob = await new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/png')); void bytes;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }, []);
  await page.keyboard.press('Control+v');
  await expect.poll(async () => (await current(page)).elements.length).toBe(3);

  // 입력창에서의 붙여넣기는 그림을 넣지 않는다.
  await page.getByRole('textbox', { name: '작품 이름' }).click();
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(200);
  expect((await current(page)).elements.length).toBe(3);

  // 사진 추가 1회 = 취소 1회.
  const work = (await page.getByTestId('work').boundingBox())!;
  await page.mouse.click(work.x + 5, work.y + 5);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press('Control+z');
  expect((await current(page)).elements.length).toBe(2);
});

test('사진은 다시 만들어 저장된다: EXIF 방향 적용, 위치 정보·파일명 제거, 긴 변 2560px', async ({ page }) => {
  await start(page);
  const { bytes, gpsMark } = withExif(await photo(page, { width: 400, height: 200 }));
  expect(bytes.includes(gpsMark)).toBe(true);
  await upload(page, bytes);
  await expect(status(page)).toContainText('사진을 넣었어요');
  let project = await doc(page);
  // Orientation=6은 90도 회전이므로 가로세로가 바뀐다.
  expect(project.assetManifest[0]).toMatchObject({ mime: 'image/jpeg', pixelWidth: 200, pixelHeight: 400 });
  const stored = await page.evaluate(async id => Array.from(new Uint8Array(await (await (window as any).__canvacraft.assets.resolve(id)).arrayBuffer())), project.assetManifest[0].id);
  const storedBytes = Buffer.from(stored);
  expect(storedBytes.includes(gpsMark)).toBe(false);
  expect(await sha256Hex(new Uint8Array(storedBytes))).toBe(project.assetManifest[0].id);
  expect(JSON.stringify(project)).not.toContain('김철수');

  await upload(page, await photo(page, { width: 4000, height: 1000 }));
  await expect.poll(async () => (await doc(page)).assetManifest.length).toBe(2);
  project = await doc(page);
  expect(project.assetManifest[1]).toMatchObject({ pixelWidth: 2560, pixelHeight: 640 });

  // 투명한 그림만 PNG로, 불투명 PNG는 JPEG로 저장한다.
  await upload(page, await photo(page, { mime: 'image/png', transparent: true, width: 100, height: 100 }), 'a.png', 'image/png');
  await upload(page, await photo(page, { mime: 'image/png', width: 120, height: 100 }), 'b.png', 'image/png');
  await upload(page, await photo(page, { mime: 'image/webp', width: 140, height: 100 }), 'c.webp', 'image/webp');
  await expect.poll(async () => (await doc(page)).assetManifest.length).toBe(5);
  project = await doc(page);
  expect(project.assetManifest.slice(2).map((asset: any) => [asset.pixelWidth, asset.mime])).toEqual([[100, 'image/png'], [120, 'image/jpeg'], [140, 'image/jpeg']]);
});

test('받지 못하는 파일은 안내만 하고 문서를 건드리지 않는다', async ({ page }) => {
  await openSample(page);
  const before = await doc(page);
  const heic = Buffer.alloc(32); heic.write('ftypheic', 4, 'latin1');
  const hugePng = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2;
    const blob: Blob = await new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }));
  hugePng.writeUInt32BE(20000, 16); hugePng.writeUInt32BE(20000, 20); // 헤더만 초대형으로 속인다.
  // 헤더는 맞지만 이미지 데이터가 깨진 PNG.
  const broken = Buffer.from(await photo(page, { mime: 'image/png', width: 64, height: 64 }));
  broken.fill(0x55, 41, broken.length - 12);
  const animated = Buffer.alloc(30); animated.write('RIFF', 0, 'latin1'); animated.write('WEBPVP8X', 8, 'latin1'); animated[20] = 2; animated[24] = 9; animated[27] = 9;
  const cases: [Buffer, string, string, string][] = [
    [Buffer.from('이건 그림이 아니에요'), 'a.png', 'image/png', 'PNG·JPEG·WebP'],
    [Buffer.from('GIF89a..............'), 'a.gif', 'image/gif', 'PNG·JPEG·WebP'],
    [heic, 'a.heic', 'image/heic', 'HEIC'],
    [hugePng, 'huge.png', 'image/png', '너무 커요'],
    [broken, 'broken.png', 'image/png', '읽지 못했어요'],
    [animated, 'a.webp', 'image/webp', '움직이는'],
    [Buffer.alloc(21 * 1024 * 1024), 'big.jpg', 'image/jpeg', '20MB'],
  ];
  for (const [buffer, name, mime, message] of cases) {
    await upload(page, buffer, name, mime);
    await expect(status(page)).toContainText(message);
    await page.evaluate(() => undefined);
    expect(await doc(page)).toEqual(before);
  }
});

test('요소 패널: 탭·검색·색 선택·최근 사용, 클릭으로 가운데에 넣고 선택', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: '4번째 장', exact: true }).click();
  await rail(page, '요소').click();
  const panel = page.getByRole('region', { name: '요소 패널' });
  const list = panel.getByRole('region', { name: '요소 목록' });
  await expect(list.getByRole('heading')).toHaveText('120개');
  for (const [tab, count] of [['도형', 24], ['캐릭터', 60], ['스티커', 36], ['전체', 120]] as const) {
    await panel.getByRole('tab', { name: tab }).click();
    await expect(list.getByRole('heading')).toHaveText(`${count}개`);
  }
  await panel.getByRole('searchbox', { name: '요소 검색' }).fill('고양이');
  await expect(list.getByRole('button', { name: '고양이' }).first()).toBeVisible();
  await list.getByRole('button', { name: '고양이' }).first().click();
  let slide = await current(page);
  await expect.poll(async () => (await current(page)).elements.length).toBe(1);
  slide = await current(page);
  expect(slide.elements[0].width).toBeCloseTo(200, 0);
  expect(slide.elements[0].x + slide.elements[0].width / 2).toBeCloseTo(640, 0);
  await expect(page.getByTestId('selection-box')).toBeVisible();

  // 같은 그림을 또 넣으면 겹치지 않게 옮기고 자료는 하나다.
  await list.getByRole('button', { name: '고양이' }).first().click();
  await expect.poll(async () => (await current(page)).elements.length).toBe(2);
  slide = await current(page);
  expect(slide.elements[1].x).toBeCloseTo(slide.elements[0].x + 20, 0);
  expect(slide.elements[1].assetId).toBe(slide.elements[0].assetId);

  // 없는 말은 안내한다.
  await panel.getByRole('searchbox', { name: '요소 검색' }).fill('없는그림xyz');
  await expect(panel).toContainText('찾는 그림이 없어요');
  await panel.getByRole('searchbox', { name: '요소 검색' }).fill('');

  // 도형 색: 고른 색의 파일이 들어간다.
  await panel.getByRole('tab', { name: '도형' }).click();
  await panel.getByRole('button', { name: '도형 색 purple' }).click();
  await list.getByRole('button', { name: '하트' }).click();
  await expect.poll(async () => (await current(page)).elements.length).toBe(3);
  const purple = (await current(page)).elements[2].assetId;
  await panel.getByRole('button', { name: '도형 색 white' }).click();
  await list.getByRole('button', { name: '하트' }).click();
  await expect.poll(async () => (await current(page)).elements.length).toBe(4);
  expect((await current(page)).elements[3].assetId).not.toBe(purple);

  // 최근 사용은 전체 탭 위쪽에 나온다.
  await panel.getByRole('tab', { name: '전체' }).click();
  await expect(panel.getByRole('region', { name: '최근 사용' }).getByRole('button', { name: '하트' })).toBeVisible();

  // 넣은 그림도 사진과 같은 조작을 쓴다.
  await page.keyboard.press('Control+z');
  expect((await current(page)).elements.length).toBe(3);
});

test('요소 파일이 바뀌었으면 넣지 않는다', async ({ page }) => {
  await openSample(page);
  await page.route('**/library/png/shape-circle.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('tampered') }));
  await rail(page, '요소').click();
  await page.getByRole('region', { name: '요소 패널' }).getByRole('searchbox').fill('원');
  const before = await doc(page);
  await page.getByRole('region', { name: '요소 목록' }).getByRole('button', { name: '원', exact: true }).click();
  await expect(status(page)).toContainText('그림을 불러오지 못했어요');
  expect(await doc(page)).toEqual(before);
});

test('배경: 단색·제공 배경·사진 배경은 현재 장만 바꾸고 내용을 보존하며 취소 한 번으로 돌아온다', async ({ page }) => {
  await openSample(page);
  if (await rail(page, '배경').getAttribute('aria-pressed') !== 'true') await rail(page, '배경').click();
  const panel = page.getByRole('region', { name: '배경 패널' });
  const elements = (await current(page)).elements;
  const others = JSON.stringify((await doc(page)).slides.slice(1));

  await panel.getByRole('button', { name: '배경 색 #D8F3DC' }).click();
  expect((await current(page)).background).toEqual({ kind: 'solid', color: '#D8F3DC' });

  await panel.getByRole('button', { name: '배경 구름 위 하늘' }).click();
  await expect.poll(async () => (await current(page)).background.kind).toBe('image');
  const provided = (await current(page)).background;
  expect(provided.fit).toBe('center-cover');
  expect((await current(page)).elements).toEqual(elements);
  expect(JSON.stringify((await doc(page)).slides.slice(1))).toBe(others);

  await page.keyboard.press('Control+z');
  expect((await current(page)).background).toEqual({ kind: 'solid', color: '#D8F3DC' });
  await page.keyboard.press('Control+z');
  expect((await current(page)).background).toEqual({ kind: 'solid', color: '#FFF8E8' });

  // 다른 색 고르기: 변경 확정 때 명령 한 번만 보낸다.
  const undoBefore = await page.evaluate(() => (window as any).__canvacraft.store.historySize().undo);
  await panel.getByRole('textbox', { name: '다른 배경 색' }).or(panel.locator('input[type=color]')).first().evaluate((input: HTMLInputElement) => {
    input.value = '#112233'; input.dispatchEvent(new Event('input', { bubbles: true })); input.value = '#445566'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect((await current(page)).background).toEqual({ kind: 'solid', color: '#445566' });
  expect(await page.evaluate(() => (window as any).__canvacraft.store.historySize().undo)).toBe(undoBefore + 1);
  await page.keyboard.press('Control+z');

  // 사진 배경: 넣은 사진 목록에 샘플 사진이 있다.
  await panel.getByRole('button', { name: '배경으로 쓸 사진 1' }).click();
  await expect.poll(async () => (await current(page)).background.kind).toBe('image');
  expect((await current(page)).background.assetId).toBe(loadSample().assetManifest[0].id);
  expect((await current(page)).elements).toEqual(elements);
});

test('넓은 화면은 배경 패널을 연 채 시작하고, 도구 순서는 배경이 맨 위 템플릿이 맨 아래다', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openSample(page);
  const panel = page.getByRole('region', { name: '배경 패널' });
  await expect(panel).toBeVisible();
  await expect(page.getByRole('navigation', { name: '도구' }).getByRole('button')).toHaveText(['배경', '요소', '텍스트', '업로드', '그리기', '템플릿']);
  await panel.getByRole('button', { name: '배경 우주 탐험' }).click();
  await expect.poll(async () => (await current(page)).background.kind).toBe('image');
  await page.waitForTimeout(300);
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'background-start-1366.png') });
  await rail(page, '요소').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'elements-1366.png') });
  await rail(page, '템플릿').click();
  await page.waitForTimeout(300);
  // 템플릿 패널에는 템플릿만 있다. 배경은 배경 패널에서 고른다.
  await expect(page.getByRole('region', { name: '템플릿 패널' }).locator('.template-card')).toHaveCount(12);
  await expect(page.getByRole('region', { name: '템플릿 패널' }).getByRole('button', { name: /^배경 / })).toHaveCount(0);
  await page.screenshot({ path: path.join(OUT, 'template-panel-1366.png') });
  await rail(page, '업로드').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'upload-1366.png') });
});

test('배경 패널: 분류와 검색으로 찾는다', async ({ page }) => {
  await start(page);
  if (await rail(page, '배경').getAttribute('aria-pressed') !== 'true') await rail(page, '배경').click();
  const panel = page.getByRole('region', { name: '배경 패널' });
  const cards = panel.locator('.background-card');
  await expect(cards).toHaveCount(24);
  await panel.getByRole('button', { name: '계절' }).click();
  await expect(cards).toHaveCount(4);
  await panel.getByRole('button', { name: '계절' }).click();
  await panel.getByRole('searchbox', { name: '배경 검색' }).fill('우주');
  await expect(panel.getByRole('button', { name: '배경 우주 탐험' })).toBeVisible();
  await panel.getByRole('searchbox', { name: '배경 검색' }).fill('없는배경xyz');
  await expect(panel).toContainText('찾는 배경이 없어요');
});

test('템플릿: 새 작품으로 열고, 저장 안 한 내용이 있으면 먼저 묻는다', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await start(page);
  await rail(page, '템플릿').click();
  const panel = page.getByRole('region', { name: '템플릿 패널' });
  await expect(panel.locator('.template-card')).toHaveCount(12);
  // 손대지 않은 새 작품은 바로 연다.
  await panel.getByRole('button', { name: '템플릿 나를 소개해요' }).click();
  await expect(status(page)).toContainText('새 작품으로 열었어요');
  const first = await doc(page);
  expect(first.revision).toBe(0);
  expect(first.slides[0].elements.length).toBeGreaterThan(3);
  await page.waitForTimeout(400);
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'template-1366.png') });
  // 템플릿의 틀 그림은 넣은 사진 목록에 나오지 않는다.
  await rail(page, '업로드').click();
  await expect(page.getByRole('region', { name: '업로드 패널' })).toContainText('아직 넣은 사진이 없어요');
  await page.waitForTimeout(300);
  await expect(page.getByRole('region', { name: '업로드 패널' })).toContainText('아직 넣은 사진이 없어요');
  await rail(page, '템플릿').click();
  // 다른 템플릿을 열면 지금 작품을 저장한 뒤 넘어간다. 묻지 않는다.
  await page.getByRole('region', { name: '템플릿 패널' }).getByRole('button', { name: '템플릿 내가 좋아하는 동물' }).click();
  await expect(status(page)).toContainText('내가 좋아하는 동물');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect((await doc(page)).title).not.toBe(first.title);
  const stored = await page.evaluate(async () => (await (await import('/src/storage/database.ts' as string)).listSummaries()).map((row: any) => row.projectId));
  expect(stored).toContain(first.id);
});

test('원본 파일 열기: 손상 파일이면 그대로이고, 정상 파일이면 지금 작품을 저장한 뒤 연다', async ({ page }) => {
  await openSample(page);
  const before = await doc(page);
  await page.getByTestId('open-file').setInputFiles({ name: 'x.canvacraft', mimeType: 'application/zip', buffer: Buffer.from('no') });
  await expect(status(page)).toContainText('읽지 못했어요');
  expect(await doc(page)).toEqual(before);
  await page.getByTestId('open-file').setInputFiles(await sampleFile());
  await expect.poll(async () => (await doc(page)).id).not.toBe(before.id);
  const stored = await page.evaluate(async () => (await (await import('/src/storage/database.ts' as string)).listSummaries()).map((row: any) => row.projectId));
  expect(stored).toContain(before.id);
});

test('템플릿 12종 모두 PPT·모양 그대로 PPT·PDF로 나온다', async ({ page }) => {
  const dir = path.join(OUT, 'templates'); await fs.rm(dir, { recursive: true, force: true }); await fs.mkdir(dir, { recursive: true });
  await start(page);
  const rows = await page.evaluate(async () => {
    const { exportPptx } = await import('/src/export/exportPptx.ts' as string);
    const { exportPdf } = await import('/src/export/exportPdf.ts' as string);
    const { deserializeProject } = await import('/src/storage/projectFile.ts' as string);
    const toBase64 = (blob: Blob) => new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(blob); });
    const { templates } = await (await fetch('/templates/manifest.json')).json();
    const out: any[] = [];
    for (const template of templates) {
      const opened = await deserializeProject(await (await fetch(template.file)).blob(), () => crypto.randomUUID());
      const resolve = async (id: string) => opened.assets.get(id);
      const pptx = await exportPptx(opened.project, resolve, 'editable');
      const image = await exportPptx(opened.project, resolve, 'image');
      const pdf = await exportPdf(opened.project, resolve);
      out.push({ id: template.id, ok: [pptx.ok, image.ok, pdf.ok], pptx: pptx.ok ? await toBase64(pptx.blob) : '' });
    }
    return out;
  });
  expect(rows.length).toBe(12);
  for (const row of rows) { expect(row.ok).toEqual([true, true, true]); await fs.writeFile(path.join(dir, `${row.id}.pptx`), Buffer.from(row.pptx, 'base64')); }
});

test('태블릿 폭에서는 패널을 닫고 시작한다', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await start(page);
  await expect(page.locator('.tool-panel')).toHaveCount(0);
});

test('라이브러리 그림·사진·배경 작품의 저장·열기·PPT·PDF 왕복', async ({ page, browser }) => {
  await fs.mkdir(OUT, { recursive: true });
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { const url = new URL(request.url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== 'http://127.0.0.1:5173') external.push(url.origin); });
  await start(page);
  await rail(page, '요소').click();
  const panel = page.getByRole('region', { name: '요소 패널' });
  const add = async (query: string, name: string, count: number) => {
    await panel.getByRole('searchbox').fill(query);
    await panel.getByRole('region', { name: '요소 목록' }).getByRole('button', { name, exact: true }).first().click();
    await expect.poll(async () => (await current(page)).elements.length).toBe(count);
  };
  await add('고양이', '고양이', 1);
  await add('선생님', '선생님', 2);
  await add('화살표', '위쪽 화살표', 3);
  await panel.getByRole('searchbox').fill('');
  await panel.getByRole('tab', { name: '도형' }).click();
  await panel.getByRole('button', { name: '도형 색 white' }).click();
  await panel.getByRole('region', { name: '요소 목록' }).getByRole('button', { name: '오각별' }).click();
  await expect.poll(async () => (await current(page)).elements.length).toBe(4);
  await upload(page, await photo(page));
  await expect.poll(async () => (await current(page)).elements.length).toBe(5);
  if (await rail(page, '배경').getAttribute('aria-pressed') !== 'true') await rail(page, '배경').click();
  await page.getByRole('region', { name: '배경 패널' }).getByRole('button', { name: '배경 숲속 산책' }).click();
  await expect.poll(async () => (await current(page)).background.kind).toBe('image');
  // 겹치지 않게 벌려 놓아 출력 모양을 눈으로 볼 수 있게 한다.
  await page.evaluate(() => {
    const { store } = (window as any).__canvacraft; const positions = [[60, 60], [420, 60], [1000, 40], [60, 400], [640, 380]];
    const p0 = store.getProject(); const slide = p0.slides[0];
    slide.elements.forEach((element: any, index: number) => { const p = store.getProject(); store.dispatch(p.id, p.revision, { type: 'moveElement', slideId: slide.id, elementId: element.id, x: positions[index][0], y: positions[index][1] }); });
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.getByTestId('paper').screenshot({ path: path.join(OUT, 'screen.png') });
  const project = await doc(page);

  // 원본 저장 → 새 프로필에서 열기. 라이브러리 없이 파일만으로 다시 편집할 수 있어야 한다.
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '파일' }).click();
  await page.getByRole('menuitem', { name: '원본 저장' }).click();
  const original = path.join(OUT, 'library.canvacraft');
  await (await waiting).saveAs(original);
  const other = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const otherPage = await other.newPage();
  await otherPage.route('**/library/png/**', route => route.abort());
  await otherPage.goto('/'); await expect(otherPage.getByTestId('paper')).toBeVisible();
  await otherPage.getByTestId('open-file').setInputFiles(original);
  await expect(otherPage.getByRole('status')).toContainText('새 작품');
  expect(contentOf(await doc(otherPage))).toEqual(contentOf(project));
  await otherPage.waitForTimeout(300);
  const reopened = (await otherPage.getByTestId('paper').boundingBox())!;
  expect(reopened.width).toBeGreaterThan(100);
  await other.close();

  const zipOriginal = await JSZip.loadAsync(await fs.readFile(original));
  const pngIds = project.assetManifest.filter((asset: any) => asset.mime === 'image/png').map((asset: any) => asset.id);
  // 내장 배경도 PNG 그대로 유지된다.
  expect(pngIds.length).toBeGreaterThanOrEqual(5);
  for (const id of pngIds) {
    const bytes = await zipOriginal.file(`assets/${id}.png`)!.async('uint8array');
    expect(await sha256Hex(bytes)).toBe(id);
  }

  // 출력.
  for (const [label, name] of [['PowerPoint (.pptx)', 'editable.pptx'], ['모양 그대로 PowerPoint', 'image.pptx'], ['PDF', 'sample.pdf']]) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '공유' }).click();
    await page.getByRole('menuitem', { name: '다운로드' }).click();
    await page.getByRole('radio', { name: label }).check();
    await page.getByRole('button', { name: '내려받기', exact: true }).click();
    await (await download).saveAs(path.join(OUT, name));
    await expect(status(page)).toContainText('내려받았어요');
    await page.keyboard.press('Escape');
  }
  // 편집용 PPT: 내장 PNG 바이트가 그대로 들어가 라이선스 정보가 유지되고, 그림 개수만큼 이미지가 순서대로 있다.
  const pptx = await JSZip.loadAsync(await fs.readFile(path.join(OUT, 'editable.pptx')));
  const hashes = new Set<string>();
  for (const name of Object.keys(pptx.files).filter(item => item.startsWith('ppt/media/') && !pptx.files[item].dir)) hashes.add(await sha256Hex(await pptx.file(name)!.async('uint8array')));
  for (const id of pngIds) expect(hashes.has(id)).toBe(true);
  const slide = await pptx.file('ppt/slides/slide1.xml')!.async('string');
  expect([...slide.matchAll(/<p:pic>/g)].length).toBe(5);
  expect(hashes.has((await current(page)).background.assetId)).toBe(true);
  // 이미지로 합성하는 출력: 고지가 글로 들어 있다.
  const image = await JSZip.loadAsync(await fs.readFile(path.join(OUT, 'image.pptx')));
  const notes = await image.file('ppt/notesSlides/notesSlide1.xml')!.async('string');
  expect(notes).toContain('MIT License'); expect(notes).toContain('Microsoft Corporation');
  const pdfBytes = await fs.readFile(path.join(OUT, 'sample.pdf'));
  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  expect(pdf.getSubject()).toContain('licenses.txt');
  expect(pdf.catalog.has(PDFName.of('Names'))).toBe(true);
  expect(errors).toEqual([]); expect(external).toEqual([]);
  void ids;
});

test('MIT 그림이 없는 작품에는 고지를 넣지 않는다', async ({ page }) => {
  await openSample(page);
  const result = await page.evaluate(async () => {
    const { store, assets } = (window as any).__canvacraft;
    const { licenseNotice } = await import('/src/export/notices.ts' as string);
    return licenseNotice(store.getProject(), assets.resolve);
  });
  expect(result).toBeNull();
});
