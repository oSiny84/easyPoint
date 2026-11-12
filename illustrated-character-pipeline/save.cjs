// 생성한 캐릭터 그림 한 장을 요소 묶음(public/characters-illustrated)에 넣는다.
// 그림 배경의 save.cjs와 같은 방식이다. PNG 픽셀은 바이트 그대로 두고 출처 설명 tEXt 청크만 더한다.
// 투명 배경(RGBA)이 아니거나 앱의 크기 한도를 넘으면 넣지 않는다. 이미 있는 파일은 덮어쓰지 않는다.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const pack = path.join(root, 'public/characters-illustrated');
const [source, metadataFile] = process.argv.slice(2);
if (!source || !metadataFile) throw new Error('Usage: node save.cjs source.png metadata.json');
const meta = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
if (!/^art-(character|creature)-[a-z0-9-]+$/.test(meta.id)) throw new Error('Invalid asset id');
if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date || '')) throw new Error('Invalid date');
const original = fs.readFileSync(source);
if (!original.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Expected PNG');
const width = original.readUInt32BE(16), height = original.readUInt32BE(20);
// 색 형식 6(RGBA)만 받는다. 투명 배경이 없으면 슬라이드 위에 흰 네모가 생긴다.
if (original[25] !== 6) throw new Error('Expected RGBA PNG with transparency');
if (Math.max(width, height) > 2560) throw new Error('Image exceeds app dimension limit; original remains safe at source');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
  return (c ^ 0xffffffff) >>> 0;
}
const notice = 'AI-generated illustration created for CanvaCraft with OpenAI image generation, ' + meta.date + '. No third-party reference artwork was supplied. This is a provenance notice, not a claim of exclusive copyright or a third-party software license.';
const data = Buffer.from('License\0' + notice, 'latin1');
const typeData = Buffer.concat([Buffer.from('tEXt'), data]);
const chunk = Buffer.alloc(data.length + 12);
chunk.writeUInt32BE(data.length, 0); typeData.copy(chunk, 4); chunk.writeUInt32BE(crc32(typeData), chunk.length - 4);
let end = 8;
while (end < original.length && original.toString('ascii', end + 4, end + 8) !== 'IEND') end += original.readUInt32BE(end) + 12;
if (end >= original.length) throw new Error('Missing IEND');
const bytes = Buffer.concat([original.subarray(0, end), chunk, original.subarray(end)]);
for (const folder of ['png', 'prompts']) fs.mkdirSync(path.join(pack, folder), { recursive: true });
const output = path.join(pack, 'png', meta.id + '.png');
if (fs.existsSync(output)) throw new Error('Refusing to overwrite completed asset: ' + output);
fs.writeFileSync(output, bytes, { flag: 'wx' });
fs.writeFileSync(path.join(pack, 'prompts', meta.id + '.txt'), meta.prompt + '\n', { flag: 'wx' });
const manifestPath = path.join(pack, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {
  schemaVersion: 1, packId: 'canvacraft-illustrated-characters', version: '1.0.0',
  generator: 'OpenAI built-in image_gen', assets: []
};
if (manifest.assets.some(a => a.id === meta.id)) throw new Error('Duplicate catalog id');
// 요소 패널의 LibraryItem 형식(src/assets/library.ts)에 출처 기록을 더한다. license는 MIT·CC0가 아니라 출처 설명이다.
manifest.assets.push({
  id: meta.id, kind: 'character', label: meta.label, category: meta.category, tags: meta.tags,
  image: '/characters-illustrated/png/' + meta.id + '.png',
  thumbnail: '/characters-illustrated/png/' + meta.id + '.png',
  width, height, defaultWidth: 320, defaultHeight: 320, license: 'AI-generated',
  provenance: notice, pngSha256: sha(bytes), sourceSha256: sha(original), sourceFile: meta.sourceFile,
  prompt: '/characters-illustrated/prompts/' + meta.id + '.txt',
  createdAt: new Date().toISOString(), byteLength: bytes.length,
  inspection: meta.inspection
});
const temp = manifestPath + '.tmp';
fs.writeFileSync(temp, JSON.stringify(manifest, null, 2) + '\n');
fs.renameSync(temp, manifestPath);
console.log(JSON.stringify({ saved: output, width, height, bytes: bytes.length, completed: manifest.assets.length }));
