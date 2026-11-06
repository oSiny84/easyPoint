import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

test('Phase 2 browser input and real export generation', async ({ page }) => {
  const errors: string[] = []; const external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { const url=new URL(request.url()); if (['http:','https:'].includes(url.protocol) && url.origin !== 'http://127.0.0.1:5173') external.push(request.url()); });
  await page.goto('/probe.html');
  await expect(page.getByRole('status')).toContainText('준비됐어요', { timeout: 30000 });
  const stage = page.locator('.konvajs-content'); const bounds = (await stage.boundingBox())!;
  await page.mouse.dblclick(bounds.x + 130 * (bounds.width/1280), bounds.y + 100 * (bounds.width/1280));
  const input = page.getByRole('textbox', { name: '슬라이드 글씨' });
  await expect(input).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  await input.fill('');
  await cdp.send('Input.imeSetComposition', { text: '우리', selectionStart: 2, selectionEnd: 2 });
  await expect(page.getByRole('button', { name: '글씨 입력 완료' })).toBeDisabled();
  await input.dispatchEvent('keydown', { key:'Escape', isComposing:true, keyCode:229 });
  await expect(input).toBeVisible();
  await cdp.send('Input.insertText', { text: '우리 가족 소개' });
  await page.getByRole('button', { name: '글씨 입력 완료' }).click();
  await expect(input).toHaveCount(0);
  await page.getByRole('button', { name: '그림 그리기' }).click();
  const surface = page.getByTestId('draw-surface'); const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x+100, box.y+350); await page.mouse.down(); await page.mouse.move(box.x+300, box.y+380, { steps:20 }); await page.mouse.up();
  await page.getByRole('button', { name: '선택 · 이동' }).click();
  await fs.mkdir('artifacts', { recursive:true });
  // Actual file input, paste and drop all use the import path.
  const photo = await page.evaluate(() => {
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=100;
    const context=canvas.getContext('2d')!;context.fillStyle='#8AC6A3';context.fillRect(0,0,160,100);
    return canvas.toDataURL();
  });
  await page.locator('input[type=file]').setInputFiles({ name:'test.png', mimeType:'image/png', buffer:Buffer.from(photo.split(',')[1],'base64') });
  await expect(page.getByRole('status')).toContainText('사진을 넣었어요');
  await page.screenshot({ path:'artifacts/phase2-browser.png', fullPage:true });
  for (const [label, name] of [['PPT · 자동 줄바꿈','auto.pptx'],['PPT · 줄 고정','explicit.pptx'],['PPT · 모양 그대로','image.pptx'],['PDF · PNG','png.pdf'],['PDF · JPEG','jpeg.pdf']]) {
    const waiting = page.waitForEvent('download'); await page.getByRole('button', { name:label, exact:true }).click();
    const download = await waiting; await download.saveAs(path.resolve('artifacts',name));
    expect((await fs.stat(path.resolve('artifacts',name))).size).toBeGreaterThan(1000);
  }
  const measurements = await page.evaluate(async () => {
    const probe = (window as any).craftProbe;
    const results: Record<string, unknown> = {};
    // Include a generated photo to exercise image encoding and PPT image elements.
    const canvas=document.createElement('canvas'); canvas.width=800; canvas.height=600;
    const ctx=canvas.getContext('2d')!; const gradient=ctx.createLinearGradient(0,0,800,600); gradient.addColorStop(0,'#9CD6B0'); gradient.addColorStop(1,'#EDC69A'); ctx.fillStyle=gradient;ctx.fillRect(0,0,800,600);
    const slide=structuredClone(probe.sample); slide.elements.splice(2,0,{id:'photo',type:'image',source:canvas.toDataURL(),x:820,y:200,width:320,height:240});
    for (const format of ['png','jpeg']) {
      const start=performance.now(); const blob=await probe.makePdf(slide,format,20); results[format]={bytes:blob.size,ms:performance.now()-start};
    }
    const blob=await probe.makePptx(slide,'auto');
    results.photoPptx=Array.from(new Uint8Array(await blob.arrayBuffer()));
    results.fontReady=document.fonts.check('36px "Noto Sans KR"','우리 가족');
    results.webLocks=!!navigator.locks;
    return results;
  });
  await fs.writeFile('artifacts/photo.pptx',Buffer.from(measurements.photoPptx as number[])); delete measurements.photoPptx;
  await fs.writeFile('artifacts/measurements.json',JSON.stringify({ ...measurements, errors, external, browser:await page.evaluate(()=>navigator.userAgent) },null,2));
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

test('touch pointer cancellation and narrow text layout', async ({ browser }) => {
  const context=await browser.newContext({ hasTouch:true, viewport:{width:1024,height:900} });
  const page=await context.newPage();await page.goto('/probe.html');
  await expect(page.getByRole('status')).toContainText('준비됐어요');
  await page.getByRole('button',{name:'그림 그리기'}).click();
  const surface=page.getByTestId('draw-surface');
  // Synthetic pointer sequence only; this does not certify physical tablet behavior.
  const bounds=(await surface.boundingBox())!;
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x+80,y:bounds.y+100}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  const lines=await page.evaluate(async()=>{
    const p=(window as any).craftProbe;await p.prepareFonts(p.sample);
    return p.layoutText({...p.sample.elements[1],width:160,text:'띄어쓰기없는긴한글문장과가족👨‍👩‍👧‍👦123'}).lines;
  });
  expect(lines.length).toBeGreaterThan(2);expect(lines.join('')).toBe('띄어쓰기없는긴한글문장과가족👨‍👩‍👧‍👦123');
  expect(lines.some((line:string)=>line.includes('👨‍👩‍👧‍👦'))).toBeTruthy();
  await context.close();
});
