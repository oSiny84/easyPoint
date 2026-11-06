// Standalone build tool: install resvg only in the ignored toolchain directory.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Resvg } = require('../artifacts/asset-toolchain/node_modules/@resvg/resvg-js');
const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'public/library');
const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
const report = { count: 0, kinds: {}, outputBytes: 0, errors: [], rasterizer: require('../artifacts/asset-toolchain/node_modules/@resvg/resvg-js/package.json').version };
fs.mkdirSync(path.join(folder, 'png/colors'), { recursive: true });
const mitNotice=fs.readFileSync(path.join(folder,'licenses/fluent-emoji-MIT.txt'),'utf8');
const crcTable=Array.from({length:256},(_,value)=>{for(let i=0;i<8;i++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0});
function textChunk(key,value){
  const data=Buffer.from(key+'\0'+value,'latin1'),type=Buffer.from('tEXt');
  const length=Buffer.alloc(4);length.writeUInt32BE(data.length);
  const payload=Buffer.concat([type,data]);let crc=0xffffffff;
  for(const byte of payload)crc=crcTable[(crc^byte)&255]^(crc>>>8);
  const checksum=Buffer.alloc(4);checksum.writeUInt32BE((crc^0xffffffff)>>>0);
  return Buffer.concat([length,payload,checksum]);
}

function render(svg, width) {
  const dimensions = new Resvg(svg, {font:{loadSystemFonts:false}});
  return new Resvg(svg, { fitTo: { mode: dimensions.width >= dimensions.height ? 'width' : 'height', value: width }, font: { loadSystemFonts: false } }).render();
}
function save(result, location, notice) {
  const raw = result.asPng();
  const bytes=Buffer.concat([raw.subarray(0,33),textChunk('License',notice),raw.subarray(33)]);
  fs.writeFileSync(location, bytes); report.outputBytes += bytes.length;
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
for (const asset of manifest.assets) {
  const original = fs.readFileSync(path.join(root, 'public', asset.svg), 'utf8');
  if (/<(?:script|foreignObject|text)\b|(?:href\s*=\s*["'](?!#)|url\(\s*(?!#))/i.test(original)) throw new Error('Unexpected embedded content: ' + asset.id);
  // Keep upstream SVG unchanged. Add a transparent 4% safety margin to PNG exports.
  const intrinsic = new Resvg(original, {font:{loadSystemFonts:false}});
  const padding = Math.max(intrinsic.width,intrinsic.height)*0.04;
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${intrinsic.width+2*padding}" height="${intrinsic.height+2*padding}" viewBox="${-padding} ${-padding} ${intrinsic.width+2*padding} ${intrinsic.height+2*padding}">${original.replace(/<\?xml[^>]*\?>/g,'')}</svg>`;
  const raster = render(source, 512);
  const notice=asset.license==='MIT'?mitNotice:'CC0-1.0: CanvaCraft original geometric artwork. https://creativecommons.org/publicdomain/zero/1.0/';
  asset.width = raster.width; asset.height = raster.height;
  asset.defaultWidth = asset.kind === 'shape' ? 240 : 200;
  asset.defaultHeight = Math.round(asset.defaultWidth * asset.height / asset.width);
  asset.pngSha256 = save(raster, path.join(root, 'public', asset.image),notice);
  save(render(source, 160), path.join(root, 'public', asset.thumbnail),notice);
  const pixels = raster.pixels;
  let visible = 0, transparent = 0, edge = 0;
  for (let y=0;y<raster.height;y++) for(let x=0;x<raster.width;x++) {
    const alpha=pixels[(y*raster.width+x)*4+3];
    if(alpha) { visible++; if(x===0||y===0||x===raster.width-1||y===raster.height-1)edge++; }
    if(alpha===0)transparent++;
  }
  if (!visible || !transparent || edge) report.errors.push({ id:asset.id, visible, transparent, edge });
  if (asset.kind === 'shape') {
    asset.colorVariants = [];
    for (const [id, color] of Object.entries(manifest.palette)) {
      const url = id === 'mint' ? asset.image : `/library/png/colors/${asset.id}-${id}.png`;
      if(id!=='mint')save(render(source.replaceAll(manifest.palette.mint,color),512),path.join(root,'public',url),notice);
      asset.colorVariants.push({ id, color, image: url });
    }
  }
  report.count++;report.kinds[asset.kind]=(report.kinds[asset.kind]||0)+1;
}
if (report.errors.length) throw new Error(JSON.stringify(report.errors));
fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(folder,'validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));

// Four contact sheets, each with 30 labelled-by-ID-index thumbnails.
const previewFolder=path.join(root,'artifacts/asset-library');fs.mkdirSync(previewFolder,{recursive:true});
for(let sheet=0;sheet<4;sheet++) {
  const batch=manifest.assets.slice(sheet*30,(sheet+1)*30);
  let body='<rect width="1200" height="1040" fill="#f2f3f5"/>';
  batch.forEach((asset,index)=>{
    const x=(index%6)*200,y=Math.floor(index/6)*208;
    body+=`<rect x="${x+8}" y="${y+8}" width="184" height="192" rx="12" fill="white"/>`;
    const data=fs.readFileSync(path.join(root,'public',asset.thumbnail)).toString('base64');
    const ratio=160/Math.max(asset.width,asset.height),w=asset.width*ratio,h=asset.height*ratio;
    body+=`<image x="${x+20+(160-w)/2}" y="${y+16+(160-h)/2}" width="${w}" height="${h}" href="data:image/png;base64,${data}"/>`;
    // SVG text is avoided; numbered mapping is saved separately for traceability.
  });
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1040">${body}</svg>`;
  fs.writeFileSync(path.join(previewFolder,`sheet-${sheet+1}.png`),render(svg,1200).asPng());
  fs.writeFileSync(path.join(previewFolder,`sheet-${sheet+1}.json`),JSON.stringify(batch.map(a=>({id:a.id,label:a.label})),null,2));
}
