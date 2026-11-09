import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';

// 배포 결과로 하는 통합 시험(Phase 10). DEV 전용 시험 고리가 없으므로 화면 조작과 저장소 내용만으로 확인한다.
const OUT = 'artifacts/release';

// 기억한 작품이 없는 탭은 시작 화면에서 시작한다(영상 기획안 §2). 슬라이드 만들기 → 새 작품으로 편집기에 들어간다.
async function newSlideProject(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: '슬라이드 만들기' }).click();
  await page.getByRole('button', { name: '새 작품' }).click();
  await expect(page.getByTestId('paper')).toBeVisible();
}
const GPS = 'GPS-SECRET-37.5665N', FILE_NAME = 'secret-family-photo.jpg';

type Watch = { errors: string[]; external: string[]; failed: string[]; csp: string[] };
function watch(page: Page): Watch {
  const seen: Watch = { errors: [], external: [], failed: [], csp: [] };
  page.on('pageerror', error => seen.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') { (message.text().includes('Content Security Policy') ? seen.csp : seen.errors).push(message.text()); } });
  page.on('request', request => { const url = request.url(); if (!/^(http:\/\/127\.0\.0\.1:\d+\/|blob:|data:)/.test(url)) seen.external.push(url); });
  page.on('response', response => { if (response.status() >= 400) seen.failed.push(`${response.status()} ${response.url()}`); });
  return seen;
}
const saveState = (page: Page) => page.getByTestId('save-state');
const saved = async (page: Page) => { await expect(saveState(page)).toHaveText('저장됨', { timeout: 8000 }); };
const status = (page: Page) => page.locator('p.status');
const rail = (page: Page, name: string) => page.getByRole('navigation', { name: '도구' }).getByRole('button', { name });
const panel = (page: Page, name: string) => page.getByRole('region', { name: `${name} 패널` });
const works = (page: Page) => page.getByRole('list', { name: '내 작품' }).getByRole('listitem');

// 저장소를 직접 읽는다. 저장됐다고 표시한 내용이 실제로 있는지 보는 시험이기도 하다.
const storage = (page: Page) => page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const open = indexedDB.open('canvacraft'); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
  const all = (name: string) => new Promise<any[]>(resolve => { const req = db.transaction(name).objectStore(name).getAll(); req.onsuccess = () => resolve(req.result); });
  const keys = (name: string) => new Promise<string[]>(resolve => { const req = db.transaction(name).objectStore(name).getAllKeys(); req.onsuccess = () => resolve(req.result as string[]); });
  const result = { projects: await all('projects'), summaries: (await all('summaries')).map(row => ({ ...row, thumbnail: !!row.thumbnail })), assetKeys: await keys('assets') };
  db.close();
  return JSON.parse(JSON.stringify(result));
});
const project = async (page: Page) => (await storage(page)).projects[0];
const assetBytes = (page: Page) => page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const open = indexedDB.open('canvacraft'); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
  const rows = await new Promise<{ id: string; blob: Blob }[]>(resolve => { const req = db.transaction('assets').objectStore('assets').getAll(); req.onsuccess = () => resolve(req.result); });
  db.close();
  const text: string[] = [];
  for (const row of rows) text.push(String.fromCharCode(...new Uint8Array(await row.blob.arrayBuffer())));
  return text.join('');
});

async function jpeg(page: Page, width: number, height: number, color: string) {
  const data = await page.evaluate(async ([width, height, color]) => { const canvas = document.createElement('canvas'); canvas.width = +width; canvas.height = +height; const context = canvas.getContext('2d')!; context.fillStyle = String(color); context.fillRect(0, 0, +width, +height); context.fillStyle = '#ffffff'; context.fillRect(+width / 4, +height / 4, +width / 2, +height / 2); const blob = await new Promise<Blob>(next => canvas.toBlob(item => next(item!), 'image/jpeg', 0.9)); const bytes = new Uint8Array(await blob.arrayBuffer()); let out = ''; for (const byte of bytes) out += String.fromCharCode(byte); return btoa(out); }, [width, height, color]);
  return Buffer.from(data, 'base64');
}
// 촬영 위치 표식이 든 EXIF를 끼워 넣는다.
function withGps(photo: Buffer) {
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from('MM\0\x2a\0\0\0\x08\0\0\0\0\0\0', 'latin1'), Buffer.from(GPS, 'latin1')]);
  const length = Buffer.alloc(2); length.writeUInt16BE(body.length + 2);
  return Buffer.concat([photo.subarray(0, 2), Buffer.from([0xff, 0xe1]), length, body, photo.subarray(2)]);
}
async function pastePhoto(page: Page, photo: Buffer) {
  await page.evaluate(async data => {
    const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
    const clipboard = new DataTransfer(); clipboard.items.add(new File([bytes], 'clip.jpg', { type: 'image/jpeg' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));
  }, photo.toString('base64'));
}
async function uploadPhoto(page: Page, photo: Buffer, name: string, mimeType = 'image/jpeg') {
  if (await rail(page, '업로드').getAttribute('aria-pressed') !== 'true') await rail(page, '업로드').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '파일 업로드' }).click();
  await (await chooser).setFiles({ name, mimeType, buffer: photo });
}
async function on(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('paper').boundingBox())!; const scale = box.width / 1280;
  return { x: box.x + x * scale, y: box.y + y * scale };
}
async function dragOn(page: Page, from: [number, number], to: [number, number]) {
  const start = await on(page, ...from), end = await on(page, ...to);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 6 }); await page.mouse.up();
}
async function downloadAs(page: Page, label: string, file: string) {
  await page.getByRole('button', { name: '공유' }).click();
  await page.getByRole('menuitem', { name: '다운로드' }).click();
  await page.getByRole('radio', { name: label }).check();
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '내려받기', exact: true }).click();
  const target = path.join(OUT, file);
  await (await waiting).saveAs(target);
  await expect(page.getByTestId('export-note')).toContainText('내려받았어요');
  await page.keyboard.press('Escape');
  return target;
}
async function saveOriginal(page: Page, file: string) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '파일', exact: true }).click();
  await page.getByRole('menuitem', { name: '원본 저장' }).click();
  const target = path.join(OUT, file);
  await (await waiting).saveAs(target);
  return target;
}
const clean = (seen: Watch) => { expect(seen.errors.slice(0, 3)).toEqual([]); expect(seen.external).toEqual([]); expect(seen.failed).toEqual([]); expect(seen.csp).toEqual([]); };

test.beforeAll(async () => { await fs.mkdir(OUT, { recursive: true }); });

test('대표 시나리오 1~6: 만들기, 꾸미기, 복원, 다른 프로필, 출력', async ({ page, browser }) => {
  const seen = watch(page);
  await newSlideProject(page);

  // 1. 새 작품과 한글 제목.
  await page.getByRole('textbox', { name: '작품 이름' }).fill('우리 반 소풍');
  await page.getByRole('textbox', { name: '작품 이름' }).press('Enter');
  await saved(page);

  // 2. 배경, 사진 붙여넣기, 위치와 크기.
  if (await rail(page, '배경').getAttribute('aria-pressed') !== 'true') await rail(page, '배경').click();
  await panel(page, '배경').getByRole('button', { name: '배경 색 #D8F3DC' }).click();
  await pastePhoto(page, await jpeg(page, 800, 600, '#3366AA'));
  await expect.poll(async () => (await page.getByTestId('handle-se').count())).toBe(1);
  await saved(page);
  const placed = (await project(page)).slides[0].elements[0];
  expect(placed.type).toBe('image');
  const middle: [number, number] = [placed.x + placed.width / 2, placed.y + placed.height / 2];
  await dragOn(page, middle, [420, 330]);
  const handle = (await page.getByTestId('handle-se').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down(); await page.mouse.move(handle.x - 60, handle.y - 45, { steps: 5 }); await page.mouse.up();
  await saved(page);
  const moved = (await project(page)).slides[0].elements[0];
  expect(moved.x).not.toBe(placed.x); expect(moved.width).toBeLessThan(placed.width);
  expect(moved.width / moved.height).toBeCloseTo(800 / 600, 2);

  // 3. 두 줄 글씨, 손그림, 한 획 지웠다 되돌리기.
  await rail(page, '텍스트').click();
  await panel(page, '텍스트').getByRole('button', { name: '본문 추가' }).click();
  await page.keyboard.type('우리 반 친구들과');
  await page.keyboard.press('Enter');
  await page.keyboard.type('소풍을 다녀왔어요');
  await page.keyboard.press('Escape');
  await rail(page, '그리기').click();
  await dragOn(page, [800, 500], [1100, 520]);
  await dragOn(page, [800, 600], [1100, 620]);
  await panel(page, '그리기').getByRole('button', { name: '획 지우개' }).click();
  await dragOn(page, [950, 490], [950, 530]);
  await saved(page);
  const strokes = async () => (await project(page)).slides[0].elements.filter((item: any) => item.type === 'stroke').length;
  expect(await strokes()).toBe(1);
  await page.keyboard.press('Control+z');
  await saved(page);
  expect(await strokes()).toBe(2);
  await panel(page, '그리기').getByRole('button', { name: '선택으로 돌아가기' }).click();
  const text = (await project(page)).slides[0].elements.find((item: any) => item.type === 'text');
  expect(text.text).toBe('우리 반 친구들과\n소풍을 다녀왔어요');

  // 4. 장 복사, 둘째 장 글씨만 바꾸기, 순서 바꾸기.
  await page.getByRole('button', { name: '1번째 장 메뉴' }).click({ force: true });
  await page.getByRole('menuitem', { name: '복제' }).click();
  await page.getByRole('button', { name: '2번째 장', exact: true }).click();
  const textAt = await on(page, text.x + 40, text.y + 20);
  await page.mouse.dblclick(textAt.x, textAt.y);
  const area = page.getByRole('textbox', { name: '슬라이드 글씨' });
  await expect(area).toBeVisible();
  await area.fill('둘째 장의 글씨');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '2번째 장 메뉴' }).click({ force: true });
  await page.getByRole('menuitem', { name: '왼쪽으로' }).click();
  await saved(page);
  const texts = (await project(page)).slides.map((slide: any) => slide.elements.find((item: any) => item.type === 'text').text);
  expect(texts).toEqual(['둘째 장의 글씨', '우리 반 친구들과\n소풍을 다녀왔어요']);

  // 5. 다시 열어 복원, 원본 파일을 다른 프로필에서 열기.
  const before = await project(page);
  await page.reload();
  await expect(status(page)).toContainText('저장된 작품을 열었어요');
  await saved(page);
  expect(await project(page)).toEqual(before);
  await page.getByTestId('paper').screenshot({ path: path.join(OUT, 'scenario-slide1.png') });
  const original = await saveOriginal(page, 'scenario.canvacraft');
  const other: BrowserContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const otherPage = await other.newPage(); const otherSeen = watch(otherPage);
  await newSlideProject(otherPage);
  await otherPage.getByTestId('open-file').setInputFiles(original);
  await saved(otherPage);
  const copy = await project(otherPage);
  expect(copy.id).not.toBe(before.id); expect(copy.revision).toBe(0);
  expect(copy.title).toBe(before.title);
  const shape = (value: any) => value.slides.map((slide: any) => slide.elements.map((item: any) => ({ type: item.type, x: item.x, y: item.y, width: item.width, text: item.text, assetId: item.assetId })));
  expect(shape(copy)).toEqual(shape(before));
  clean(otherSeen);
  await other.close();

  // 6. 출력. PowerPoint 확인은 npm run test:release 뒤 scripts/phase2-powerpoint.ps1로 한다.
  const pptx = await downloadAs(page, 'PowerPoint (.pptx)', 'scenario-editable.pptx');
  await downloadAs(page, '모양 그대로 PowerPoint', 'scenario-image.pptx');
  const pdfPath = await downloadAs(page, 'PDF', 'scenario.pdf');
  const zip = await JSZip.loadAsync(await fs.readFile(pptx));
  const slide1 = await zip.file('ppt/slides/slide1.xml')!.async('string'), slide2 = await zip.file('ppt/slides/slide2.xml')!.async('string');
  expect(slide1).toContain('둘째 장의 글씨'); expect(slide2).toContain('소풍을 다녀왔어요');
  expect((await PDFDocument.load(await fs.readFile(pdfPath))).getPageCount()).toBe(2);

  // 발표까지 배포본에서 돈다.
  await page.getByRole('button', { name: '발표' }).click();
  await expect(page.getByTestId('presenter-count')).toHaveText('1 / 2');
  await expect(page.getByTestId('presenter-slide').locator('canvas')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('presenter-count')).toHaveText('2 / 2');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '발표' })).toHaveCount(0);
  clean(seen);
});

test('대표 시나리오 7: 손상 사진, 저장 용량 부족, 누락 자산, 긴 한글, 출력 취소', async ({ page }) => {
  const seen = watch(page);
  await newSlideProject(page);

  // 사진이 아닌 파일과, 앞부분만 JPEG이고 나머지가 깨진 파일.
  await uploadPhoto(page, Buffer.from('이것은 사진이 아니에요'), 'broken.jpg');
  await expect(status(page)).toContainText('사진만 넣을 수 있어요');
  await uploadPhoto(page, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]), 'torn.jpg');
  await expect(status(page)).toContainText(/읽지 못했어요|사진만 넣을 수 있어요/);

  // 긴 한글 한 문단. 상자 밖으로 나가지 않게 줄이 나뉜다.
  await rail(page, '텍스트').click();
  await panel(page, '텍스트').getByRole('button', { name: '본문 추가' }).click();
  await page.keyboard.insertText('긴 문장을 넣어 봅니다. '.repeat(60));
  await page.keyboard.press('Escape');
  await saved(page);
  await page.getByTestId('paper').screenshot({ path: path.join(OUT, 'long-text.png') });
  await downloadAs(page, 'PDF', 'long-text.pdf');

  // 출력 취소 뒤 다시 받기.
  await page.getByRole('button', { name: '공유' }).click();
  await page.getByRole('menuitem', { name: '다운로드' }).click();
  await page.getByRole('radio', { name: 'PDF' }).check();
  await page.evaluate(() => { const original = HTMLCanvasElement.prototype.toBlob; (window as any).restoreBlob = () => { HTMLCanvasElement.prototype.toBlob = original; }; HTMLCanvasElement.prototype.toBlob = function (...args: any[]) { setTimeout(() => original.apply(this, args as any), 400); }; });
  await page.getByRole('button', { name: '내려받기', exact: true }).click();
  await page.getByRole('button', { name: '취소' }).click();
  await expect(page.getByTestId('export-note')).toContainText('취소');
  await page.evaluate(() => (window as any).restoreBlob());
  const again = page.waitForEvent('download');
  await page.getByRole('button', { name: '내려받기', exact: true }).click();
  await again;
  await page.keyboard.press('Escape');

  // 저장 용량 부족: 알리고, 편집은 남고, 원본을 받을 수 있고, 풀리면 다시 저장한다.
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; (window as any).restorePut = () => { IDBObjectStore.prototype.put = original; }; IDBObjectStore.prototype.put = function () { throw new DOMException('가득 참', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: '페이지 추가' }).click();
  await expect(saveState(page)).toHaveText('저장 실패', { timeout: 8000 });
  await expect(status(page)).toContainText('저장 공간이 부족');
  const rescued = await saveOriginal(page, 'rescued.canvacraft');
  const rescuedZip = await JSZip.loadAsync(await fs.readFile(rescued));
  expect(JSON.parse(await rescuedZip.file('project.json')!.async('string')).slides).toHaveLength(2);
  await page.evaluate(() => (window as any).restorePut());
  await page.getByRole('button', { name: '페이지 추가' }).click();
  await saved(page);
  expect((await project(page)).slides).toHaveLength(3);

  // 누락 자산: 사진 파일이 빠진 원본은 열지 않고 지금 작품은 그대로다.
  const photoProject = await jpeg(page, 400, 300, '#AA3333');
  await uploadPhoto(page, photoProject, 'p.jpg');
  await saved(page);
  const whole = await JSZip.loadAsync(await fs.readFile(await saveOriginal(page, 'whole.canvacraft')));
  const name = Object.keys(whole.files).find(item => item.startsWith('assets/') && !whole.files[item].dir)!;
  whole.remove(name);
  const damaged = await whole.generateAsync({ type: 'nodebuffer' });
  const title = (await project(page)).id;
  await page.getByRole('button', { name: '파일', exact: true }).click();
  await page.getByRole('menuitem', { name: '원본 열기' }).click({ noWaitAfter: true }).catch(() => undefined);
  await page.getByTestId('open-file').setInputFiles({ name: 'damaged.canvacraft', mimeType: 'application/zip', buffer: damaged });
  await expect(status(page)).toContainText('사진 자료');
  expect((await project(page)).id).toBe(title);
  expect(seen.errors).toEqual([]); expect(seen.external).toEqual([]); expect(seen.csp).toEqual([]);
});

test('개인정보: 위치 정보와 파일 이름이 저장소와 내보낸 파일에 남지 않고, 외부로 나가는 요청이 없다', async ({ page }) => {
  const seen = watch(page);
  const bodies: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') bodies.push(`${request.method()} ${request.url()}`); });
  await newSlideProject(page);
  const photo = withGps(await jpeg(page, 640, 480, '#228844'));
  expect(photo.includes(GPS)).toBe(true);
  await uploadPhoto(page, photo, FILE_NAME);
  await expect.poll(async () => page.getByTestId('handle-se').count()).toBe(1);
  await saved(page);

  const stored = JSON.stringify(await storage(page));
  expect(stored).not.toContain(GPS); expect(stored).not.toContain(FILE_NAME);
  const raw = await assetBytes(page);
  expect(raw).not.toContain(GPS);

  for (const [label, file] of [['PowerPoint (.pptx)', 'private-editable.pptx'], ['모양 그대로 PowerPoint', 'private-image.pptx'], ['PDF', 'private.pdf']]) {
    const bytes = await fs.readFile(await downloadAs(page, label, file));
    expect(bytes.includes(GPS)).toBe(false); expect(bytes.includes(FILE_NAME)).toBe(false);
    if (file.endsWith('.pptx')) {
      const zip = await JSZip.loadAsync(bytes);
      for (const name of Object.keys(zip.files)) {
        if (zip.files[name].dir) continue;
        const inner = await zip.file(name)!.async('nodebuffer');
        expect(inner.includes(GPS), name).toBe(false); expect(inner.includes(FILE_NAME), name).toBe(false);
      }
    }
  }
  const original = await fs.readFile(await saveOriginal(page, 'private.canvacraft'));
  const zip = await JSZip.loadAsync(original);
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir) continue;
    const inner = await zip.file(name)!.async('nodebuffer');
    expect(inner.includes(GPS), name).toBe(false); expect(inner.includes(FILE_NAME), name).toBe(false);
  }
  expect(bodies).toEqual([]);
  clean(seen);
});

test('공용 PC: 작품을 지우면 브라우저 저장소에 작품과 사진이 남지 않는다', async ({ page }) => {
  const seen = watch(page);
  await newSlideProject(page);
  await uploadPhoto(page, await jpeg(page, 640, 480, '#884422'), 'p.jpg');
  await expect.poll(async () => page.getByTestId('handle-se').count()).toBe(1);
  await saved(page);
  await page.keyboard.press('Delete');
  await saved(page);
  await page.getByRole('button', { name: '작품 목록' }).click();
  await expect(works(page)).toHaveCount(1);
  await expect(page.getByText('이 브라우저에만 저장돼요')).toBeVisible();
  await page.screenshot({ path: path.join(OUT, 'home-1366.png') });
  await page.getByRole('button', { name: '지우기' }).click();
  const dialog = page.getByRole('alertdialog', { name: '작품 지우기' });
  await dialog.getByRole('button', { name: '지우기' }).click();
  await expect(works(page)).toHaveCount(0);
  const left = await storage(page);
  expect(left).toEqual({ projects: [], summaries: [], assetKeys: [] });
  const web = await page.evaluate(() => ({ session: sessionStorage.getItem('canvacraft.current-project'), local: Object.keys(localStorage).map(key => `${key}=${localStorage.getItem(key)}`) }));
  expect(web.session).toBeNull();
  // 최근 사용 목록에는 내장 그림 ID만 남을 수 있다. 사진·작품 내용은 아니다.
  expect(web.local.join()).not.toContain('p.jpg');
  clean(seen);
});

test('저장소를 쓸 수 없는 브라우저에서도 시작하고 원본으로 받을 수 있다', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { configurable: true, get: () => ({ open: () => { throw new DOMException('막힘', 'SecurityError'); } }) }); });
  const seen = watch(page);
  await newSlideProject(page);
  await page.getByRole('button', { name: '페이지 추가' }).click();
  await expect(saveState(page)).toHaveText('저장 실패', { timeout: 8000 });
  const bytes = await saveOriginal(page, 'no-storage.canvacraft');
  const zip = await JSZip.loadAsync(await fs.readFile(bytes));
  expect(JSON.parse(await zip.file('project.json')!.async('string')).slides).toHaveLength(2);
  expect(seen.errors).toEqual([]);
});

test('저장된 작품이 망가졌으면 열지 않고 알리며, 다른 작품은 쓸 수 있다', async ({ page }) => {
  await newSlideProject(page);
  await page.getByRole('button', { name: '페이지 추가' }).click();
  await saved(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const open = indexedDB.open('canvacraft'); open.onsuccess = () => resolve(open.result); });
    const store = db.transaction('projects', 'readwrite').objectStore('projects');
    const rows = await new Promise<any[]>(resolve => { const req = store.getAll(); req.onsuccess = () => resolve(req.result); });
    await new Promise<void>(resolve => { const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put({ ...rows[0], slides: 'broken' }); tx.oncomplete = () => resolve(); });
    db.close();
    sessionStorage.removeItem('canvacraft.current-project');
  });
  await page.reload();
  // 기억한 작품이 없으면 시작 화면이다.
  await page.getByRole('button', { name: '슬라이드 만들기' }).click();
  await expect(works(page)).toHaveCount(1);
  await works(page).getByRole('button', { name: /열기$/ }).click();
  await expect(page.getByRole('status')).toContainText('형식');
  await expect(page.getByRole('button', { name: '새 작품' })).toBeEnabled();
  await page.getByRole('button', { name: '새 작품' }).click();
  await expect(page.getByTestId('paper')).toBeVisible();
});

// 영상 V3: 배포본(CSP, 하위 경로, 나눠 받는 영상 편집기 파일)에서 시작 화면 → 영상 작품 → 저장 → 새로고침 복원 → 시작 화면 최근 작품.
test('영상 만들기: 배포본에서 영상 편집기를 불러와 저장하고 새로고침해도 돌아온다', async ({ page }) => {
  const seen = watch(page);
  await page.goto('./');
  await page.getByRole('button', { name: '영상 만들기' }).click();
  await expect(page.getByRole('list', { name: '내 영상' })).toBeAttached();
  await page.getByRole('button', { name: '새 작품' }).click();
  await expect(page.getByTestId('video-stage')).toBeVisible();
  await page.getByRole('textbox', { name: '작품 이름' }).fill('배포본 영상');
  await page.getByRole('textbox', { name: '작품 이름' }).press('Enter');
  await saved(page);
  await page.reload();
  await expect(page.getByRole('textbox', { name: '작품 이름' })).toHaveValue('배포본 영상');
  await saved(page);
  await page.getByRole('button', { name: '작품 목록' }).click();
  await page.getByRole('button', { name: '시작 화면' }).click();
  await expect(page.getByRole('list', { name: '최근 작품' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('list', { name: '최근 작품' })).toContainText('배포본 영상');
  expect(seen.errors).toEqual([]); expect(seen.csp).toEqual([]); expect(seen.external).toEqual([]); expect(seen.failed).toEqual([]);
});

// 영상 V4: 배포본에서 가져오기 Worker(나눠 받는 파일)와 blob: 영상 미리보기가 CSP 위반 없이 동작한다.
test('영상 가져오기와 미리보기: 배포본에서 영상 2개를 넣고 끝까지 재생한다', async ({ page }) => {
  const seen = watch(page);
  await page.goto('./');
  await page.getByRole('button', { name: '영상 만들기' }).click();
  await page.getByRole('button', { name: '새 작품' }).click();
  const fixture = (name: string) => fs.readFile(path.join('tests/fixtures/video', name)).then(buffer => ({ name, mimeType: 'video/webm', buffer }));
  await page.getByTestId('import-video').setInputFiles([await fixture('a.webm'), await fixture('b.webm')]);
  await expect(status(page)).toContainText('영상 2개를 넣었어요', { timeout: 20000 });
  await saved(page);
  const ruler = (await page.getByTestId('timeline-ruler').boundingBox())!;
  await page.mouse.click(ruler.x + 12, ruler.y + ruler.height / 2);
  await page.getByRole('button', { name: '재생' }).click();
  await expect(page.getByRole('button', { name: '일시정지' })).toBeVisible();
  const total = await page.getByTestId('timeline-total').textContent();
  await expect(page.getByTestId('player-time')).toHaveText(`${total} / ${total}`, { timeout: 10000 });
  // 미리보기에 실제 영상 프레임이 그려졌다(검은 화면이 아니다).
  const pixel = await page.evaluate(() => { const canvas = document.querySelector('[data-testid=preview]') as HTMLCanvasElement; return [...canvas.getContext('2d')!.getImageData(canvas.width / 2, canvas.height / 4, 1, 1).data].slice(0, 3).reduce((a, b) => a + b, 0); });
  expect(pixel).toBeGreaterThan(60);
  await page.screenshot({ path: path.join(OUT, 'video-preview.png') });
  expect(seen.errors).toEqual([]); expect(seen.csp).toEqual([]); expect(seen.external).toEqual([]); expect(seen.failed).toEqual([]);
});

test('화면 오류가 나면 빈 화면 대신 안내하고 새로고침으로 돌아온다', async ({ page }) => {
  await newSlideProject(page);
  await page.getByRole('button', { name: '페이지 추가' }).click();
  await saved(page);
  // 저장된 문서에는 없는 값으로 화면을 망가뜨린다. Konva 없이 재현하도록 React 렌더 오류를 일으킨다.
  await page.evaluate(() => { Object.defineProperty(Array.prototype, 'findIndex', { configurable: true, value() { throw new Error('시험용 렌더 오류'); } }); });
  await page.getByRole('button', { name: '2번째 장', exact: true }).click().catch(() => undefined);
  await page.getByRole('button', { name: '1번째 장', exact: true }).click({ timeout: 2000 }).catch(() => undefined);
  await expect(page.getByRole('alert')).toContainText('문제가 생겼어요');
  await page.getByRole('button', { name: '새로고침' }).click();
  await expect(page.locator('p.status')).toContainText('저장된 작품을 열었어요');
  expect((await project(page)).slides).toHaveLength(2);
});

test('화면 크기: 시작 화면과 편집 화면이 넘치지 않고 도구가 모두 보인다', async ({ page }) => {
  const seen = watch(page);
  await newSlideProject(page);
  await page.getByRole('button', { name: '페이지 추가' }).click();
  await saved(page);
  for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 720], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => ({ x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight }));
    expect(overflow, `${width}x${height}`).toEqual({ x: 0, y: 0 });
    for (const name of ['배경', '요소', '텍스트', '업로드', '그리기', '템플릿']) await expect(rail(page, name)).toBeInViewport({ ratio: 1 });
    for (const name of ['발표', '공유', '작품 목록']) await expect(page.getByRole('button', { name }).first()).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: '페이지 추가' })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: path.join(OUT, `editor-${width}.png`) });
  }
  await page.getByRole('button', { name: '작품 목록' }).click();
  await expect(works(page)).toHaveCount(1);
  for (const [width, height] of [[1366, 768], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width}`).toBe(0);
    await page.screenshot({ path: path.join(OUT, `home-${width}.png`) });
  }
  clean(seen);
});

test('키보드만으로 작품 목록에서 작품을 열고 발표를 시작한다. 포커스가 눈에 보인다', async ({ page }) => {
  await newSlideProject(page);
  await page.getByRole('button', { name: '페이지 추가' }).click();
  await saved(page);
  await page.getByRole('button', { name: '작품 목록' }).click();
  await expect(works(page)).toHaveCount(1);
  const focusable = async () => page.evaluate(() => { const element = document.activeElement as HTMLElement; const style = getComputedStyle(element); return { label: element.getAttribute('aria-label') ?? element.textContent, outline: style.outlineStyle, width: parseFloat(style.outlineWidth) }; });
  let opened = false;
  for (let i = 0; i < 12 && !opened; i++) {
    await page.keyboard.press('Tab');
    const seen = await focusable();
    if (/열기$/.test(seen.label ?? '') && seen.label !== '원본 열기') {
      expect(seen.outline).not.toBe('none'); expect(seen.width).toBeGreaterThan(0);
      await page.keyboard.press('Enter');
      opened = true;
    }
  }
  expect(opened).toBe(true);
  await expect(status(page)).toContainText('저장된 작품을 열었어요');
  await page.getByRole('button', { name: '발표' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('presenter-count')).toHaveText('1 / 2');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '발표' })).toHaveCount(0);
});

test('터치: 그림을 눌러 넣고 끌어 옮기며, 발표를 눌러서 넘긴다', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: process.env.RELEASE_URL ?? 'http://127.0.0.1:4180/canvacraft/', viewport: { width: 1280, height: 800 }, hasTouch: true });
  const page = await context.newPage();
  const seen = watch(page);
  await newSlideProject(page);
  await rail(page, '요소').tap();
  const card = page.getByRole('region', { name: '요소 목록' }).getByRole('button').first();
  await expect(card).toBeVisible();
  await card.tap();
  await expect.poll(async () => page.getByTestId('handle-se').count()).toBe(1);
  await saved(page);
  const first = (await project(page)).slides[0].elements[0];
  const session = await context.newCDPSession(page);
  const from = await on(page, first.x + first.width / 2, first.y + first.height / 2);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  // 사람이 끌듯이 천천히 움직이고 멈춘 뒤 뗀다. 시간 간격 없이 튕긴 합성 입력 직후에는 브라우저가 다음 누름의 click을 내지 않았다(보고서 미확인 항목).
  for (let i = 1; i <= 6; i++) { await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x - i * 20, y: from.y - i * 10 }] }); await page.waitForTimeout(50); }
  await page.waitForTimeout(400);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => { await saved(page); return (await project(page)).slides[0].elements[0].x; }).toBeLessThan(first.x);
  await page.getByRole('button', { name: '페이지 추가' }).tap();
  await page.getByRole('button', { name: '1번째 장', exact: true }).tap();
  await page.getByRole('button', { name: '발표' }).tap();
  await expect(page.getByTestId('presenter-count')).toHaveText('1 / 2');
  await page.getByTestId('presenter-slide').tap({ position: { x: 800, y: 300 } });
  await expect(page.getByTestId('presenter-count')).toHaveText('2 / 2');
  await page.getByRole('button', { name: '끝내기' }).tap();
  await expect(page.getByRole('dialog', { name: '발표' })).toHaveCount(0);
  expect(seen.errors).toEqual([]);
  await context.close();
});

// 20장, 장당 요소 50개, 사진 3장을 섞은 문서로 잰다. 개발 PC 값이며 RAM 8GB 기준 기기의 값이 아니다.
test('큰 문서: 20장·장당 50요소를 저장·전환·선택·출력한다', async ({ page }) => {
  test.setTimeout(600000);
  const seen = watch(page);
  await newSlideProject(page);
  const photos = [await jpeg(page, 2400, 1600, '#335577'), await jpeg(page, 1600, 1600, '#775533'), await jpeg(page, 1600, 2400, '#337755')];
  const hash = async (bytes: Buffer) => (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
  const assets = await Promise.all(photos.map(async (bytes, i) => ({ id: await hash(bytes), mime: 'image/jpeg', pixelWidth: [2400, 1600, 1600][i], pixelHeight: [1600, 1600, 2400][i], byteLength: bytes.length })));
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  let next = 100;
  const slides = Array.from({ length: 20 }, () => {
    const elements: any[] = [];
    assets.forEach((asset, i) => { const width = 300; elements.push({ id: uuid(next++), type: 'image', x: 40 + i * 320, y: 40, width, height: width * asset.pixelHeight / asset.pixelWidth, assetId: asset.id }); });
    for (let i = 0; i < 25; i++) elements.push({ id: uuid(next++), type: 'text', x: 40 + (i % 5) * 240, y: 420 + Math.floor(i / 5) * 56, width: 220, text: `글씨 ${i + 1} 우리 가족`, fontId: 'sans-ko', fontSize: 24, bold: false, color: '#283B37', align: 'left', lineHeight: 1.3 });
    for (let i = 0; i < 22; i++) { const points: number[] = []; for (let p = 0; p < 40; p++) points.push(p * 6, Math.round(Math.sin(p / 3) * 20 + 20)); elements.push({ id: uuid(next++), type: 'stroke', x: 40 + (i % 11) * 110, y: 300 + (i % 2) * 40, points, color: '#E8590C', strokeWidth: 4 }); }
    return { id: uuid(next++), background: { kind: 'solid', color: '#FFF8E8' }, elements };
  });
  const big = { schemaVersion: 1, id: uuid(1), title: '큰 문서', revision: 0, createdAt: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z', width: 1280, height: 720, assetManifest: assets, slides };
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format: 'canvacraft', schemaVersion: 1 }));
  zip.file('project.json', JSON.stringify(big));
  assets.forEach((asset, i) => zip.file(`assets/${asset.id}.jpg`, photos[i]));
  const file = await zip.generateAsync({ type: 'nodebuffer' });
  const results: Record<string, number> = {};
  const timed = async (name: string, work: () => Promise<unknown>) => { const start = Date.now(); await work(); results[name] = Date.now() - start; };

  await timed('열기와 첫 저장 ms', async () => {
    await page.getByTestId('open-file').setInputFiles({ name: 'big.canvacraft', mimeType: 'application/zip', buffer: file });
    await expect(page.getByRole('button', { name: '20번째 장', exact: true })).toBeAttached({ timeout: 60000 });
    await expect(saveState(page)).toHaveText('저장됨', { timeout: 60000 });
  });
  await timed('장 전환 10회 평균 ms', async () => {
    for (let i = 1; i <= 10; i++) { await page.getByRole('button', { name: `${i + 1}번째 장`, exact: true }).click(); await page.waitForFunction(n => document.querySelector(`[aria-label="${n}번째 장"]`)?.getAttribute('aria-current') === 'true', i + 1); }
  });
  results['장 전환 10회 평균 ms'] = Math.round(results['장 전환 10회 평균 ms'] / 10);
  const at = await on(page, 100, 440);
  await timed('요소 선택 ms', async () => { await page.mouse.click(at.x, at.y); await expect(page.getByRole('toolbar', { name: '선택한 요소 설정' })).toBeVisible(); });
  await timed('끌기 뒤 저장 ms', async () => { await dragOn(page, [100, 440], [160, 460]); await saved(page); });
  for (const [label, name, key] of [['PDF', 'big.pdf', 'PDF ms'], ['모양 그대로 PowerPoint', 'big-image.pptx', '모양 그대로 PPT ms'], ['PowerPoint (.pptx)', 'big-editable.pptx', '편집용 PPT ms']]) {
    await timed(key, () => downloadAs(page, label, name));
    results[`${key.replace(' ms', '')} MB`] = +((await fs.stat(path.join(OUT, name))).size / 1048576).toFixed(1);
  }
  await page.getByRole('button', { name: '발표' }).click();
  await timed('발표 시작 ms', () => expect(page.getByTestId('presenter-slide').locator('canvas')).toBeVisible());
  await timed('발표 다음 장 ms', async () => { await page.keyboard.press('ArrowRight'); await expect(page.getByTestId('presenter-slide').locator('canvas')).toBeVisible(); await page.waitForFunction(() => document.querySelector('[data-testid=presenter-slide]')!.getAttribute('data-slide') !== ''); });
  await page.keyboard.press('Escape');
  await fs.writeFile(path.join(OUT, 'measurements.json'), JSON.stringify(results, null, 1));
  console.log(JSON.stringify(results));
  expect(results['PDF ms']).toBeLessThan(30000);
  expect(seen.errors).toEqual([]); expect(seen.external).toEqual([]); expect(seen.failed).toEqual([]); expect(seen.csp).toEqual([]);
});

test('하위 경로에서 템플릿, 내장 그림, 제공 배경, 사용 조건 파일을 읽는다', async ({ page }) => {
  const seen = watch(page);
  await newSlideProject(page);
  await rail(page, '템플릿').click();
  await panel(page, '템플릿').getByRole('button', { name: '템플릿 내가 좋아하는 동물' }).click();
  await expect(status(page)).toContainText('내가 좋아하는 동물');
  await saved(page);
  expect((await project(page)).title).toBeTruthy();
  if (await rail(page, '배경').getAttribute('aria-pressed') !== 'true') await rail(page, '배경').click();
  const provided = panel(page, '배경').locator('button').filter({ has: page.locator('img') }).nth(3);
  await expect(provided).toBeVisible();
  const before = (await project(page)).slides[0].background;
  await provided.click();
  await expect.poll(async () => JSON.stringify((await project(page)).slides[0].background), { timeout: 8000 }).not.toBe(JSON.stringify(before));
  await rail(page, '요소').click();
  const card = page.getByRole('region', { name: '요소 목록' }).getByRole('button').first();
  await expect(card.locator('img')).toBeVisible();
  const count = (await project(page)).slides[0].elements.length;
  await card.click();
  await expect.poll(async () => (await project(page)).slides[0].elements.length, { timeout: 8000 }).toBe(count + 1);
  const license = await page.getByRole('link', { name: '그림 출처와 사용 조건' }).getAttribute('href');
  expect((await page.request.get(new URL(license!, page.url()).href)).status()).toBe(200);
  clean(seen);
});
