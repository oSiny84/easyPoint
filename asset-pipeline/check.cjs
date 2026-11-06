const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const root=path.resolve(__dirname,'../public');
const mime={'.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.txt':'text/plain'};
(async()=>{
  const server=http.createServer(async(req,res)=>{
    try{const requested=decodeURIComponent(new URL(req.url,'http://local').pathname);const target=path.resolve(root,'.'+requested);if(!target.startsWith(root+path.sep))throw Error('Outside root');const bytes=await fs.readFile(target);res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'});res.end(bytes)}catch{res.writeHead(404);res.end('Not found')}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).origin!==origin)external.push(r.url())});
    await page.goto(origin+'/library/preview.html');await page.locator('.card').last().waitFor();
    assert.equal(await page.locator('.card').count(),120);
    const decoded=await page.evaluate(async()=>{
      const manifest=await fetch('manifest.json').then(r=>r.json());const urls=new Set();
      for(const a of manifest.assets){urls.add(a.image);urls.add(a.thumbnail);for(const v of a.colorVariants??[])urls.add(v.image)}
      let completed=0;for(const url of urls){const image=new Image();image.src=url;await image.decode();if(!image.naturalWidth||Math.max(image.naturalWidth,image.naturalHeight)>512)throw Error(url);completed++}return completed;
    });
    assert.equal(decoded,408);
    await page.getByRole('button',{name:'캐릭터',exact:true}).click();assert.equal(await page.locator('.card').count(),60);
    await page.screenshot({path:'artifacts/asset-library/catalog-characters.png',fullPage:true});
    await page.getByLabel('요소 검색').fill('고양이');assert.equal(await page.locator('.card').count(),1);
    await page.getByLabel('요소 검색').fill('');await page.getByRole('button',{name:'도형',exact:true}).click();assert.equal(await page.locator('.card').count(),24);
    await page.getByRole('button',{name:'보라',exact:true}).click();
    assert.match(await page.locator('.card img').first().getAttribute('src'),/purple/);
    await page.screenshot({path:'artifacts/asset-library/catalog-shapes.png',fullPage:true});
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    const result={uniqueAssets:120,decodedPngs:decoded,characters:60,stickers:36,shapes:24,search:'고양이 -> 1',colorVariant:'purple',browser:await browser.version(),errors,external};
    await fs.writeFile('public/library/browser-validation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
