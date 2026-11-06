const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('@playwright/test');
const root=path.resolve(__dirname,'../public');
const mime={'.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.txt':'text/plain'};
(async()=>{
 const server=http.createServer(async(req,res)=>{try{const target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!target.startsWith(root+path.sep))throw Error('Outside root');const bytes=await fs.readFile(target);res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'});res.end(bytes)}catch{res.writeHead(404);res.end('Not found')}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch();
 try{
  const manifest=JSON.parse(await fs.readFile(path.join(root,'backgrounds/manifest.json'),'utf8'));
  assert.equal(manifest.assets.length,24);assert.equal(new Set(manifest.assets.map(a=>a.id)).size,24);
  for(const a of manifest.assets){const png=await fs.readFile(path.join(root,a.image));assert.equal(crypto.createHash('sha256').update(png).digest('hex'),a.pngSha256);assert(png.includes(Buffer.from('License\0')));assert.equal(png.readUInt32BE(16),2560);assert.equal(png.readUInt32BE(20),1440)}
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).origin!==origin)external.push(r.url())});
  await page.goto(origin+'/backgrounds/preview.html');await page.locator('.card').last().waitFor();assert.equal(await page.locator('.card').count(),24);
  const decoded=await page.evaluate(async()=>{const m=await fetch('manifest.json').then(r=>r.json());let total=0;for(const a of m.assets)for(const url of [a.image,a.thumbnail]){const image=new Image();image.src=url;await image.decode();if(image.naturalWidth/image.naturalHeight!==16/9)throw Error(url);total++}return total});assert.equal(decoded,48);
  await fs.mkdir('artifacts/background-library',{recursive:true});await page.screenshot({path:'artifacts/background-library/all-backgrounds.png',fullPage:true});
  await page.getByLabel('글씨 예시',{exact:true}).check();await page.getByLabel('배치 영역',{exact:true}).check();await page.screenshot({path:'artifacts/background-library/text-placement.png',fullPage:true});
  await page.getByRole('button',{name:'계절',exact:true}).click();assert.equal(await page.locator('.card').count(),4);
  await page.getByRole('button',{name:'전체',exact:true}).click();await page.getByLabel('배경 검색').fill('우주');assert.equal(await page.locator('.card').count(),1);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const report={count:24,decodedPngs:decoded,category:'계절 -> 4',search:'우주 -> 1',sha256:'24 PNGs pass',pngDimensions:'2560x1440',licenseMetadata:true,browser:await browser.version(),errors,external};await fs.writeFile(path.join(root,'backgrounds/browser-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
