// Save each completed generation immediately. PNG pixels are kept byte-for-byte:
// only a provenance text chunk is added, without decoding or recompressing IDAT.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const pack = path.join(root, 'public/backgrounds-illustrated');
const [source, metadataFile] = process.argv.slice(2);
if (!source || !metadataFile) throw new Error('Usage: node save.cjs source.png metadata.json');
const meta = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
if (!/^[0-9]{2}-[a-z0-9-]+$/.test(meta.id)) throw new Error('Invalid asset id');
const original = fs.readFileSync(source);
if (!original.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Expected PNG');
const width = original.readUInt32BE(16), height = original.readUInt32BE(20);
if (Math.max(width, height) > 2560) throw new Error('Image exceeds app dimension limit; original remains safe at source');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
  return (c ^ 0xffffffff) >>> 0;
}
// 생성한 날짜를 메타데이터의 date로 받는다. 처음 16장은 2026-11-06에 만들었다.
const date = meta.date || '2026-11-06';
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date');
const notice = 'AI-generated illustration created for CanvaCraft with OpenAI image generation, ' + date + '. No third-party reference artwork was supplied. This is a provenance notice, not a claim of exclusive copyright or a third-party software license.';
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
  schemaVersion: 1, packId: 'canvacraft-illustrated-backgrounds', version: '1.0.0',
  generator: 'OpenAI built-in image_gen', assets: []
};
if (manifest.assets.some(a => a.id === 'bg-art-' + meta.id)) throw new Error('Duplicate catalog id');
manifest.assets.push({
  id: 'bg-art-' + meta.id, label: meta.label, category: meta.category,
  tags: meta.tags || [meta.label, meta.category, '일러스트', '그림 배경'],
  image: '/backgrounds-illustrated/png/' + meta.id + '.png',
  thumbnail: '/backgrounds-illustrated/png/' + meta.id + '.png',
  width, height, logicalWidth: 1280, logicalHeight: 720,
  safeRect: meta.safeRect || { x: 282, y: 144, width: 716, height: 374 },
  recommendedTextColor: meta.recommendedTextColor || '#24364B',
  provenance: notice, sourceAssetIds: [], pngSha256: sha(bytes), sourceSha256: sha(original),
  prompt: '/backgrounds-illustrated/prompts/' + meta.id + '.txt',
  createdAt: new Date().toISOString(), byteLength: bytes.length,
  inspection: meta.inspection || 'Observed generated image: subject, quiet center, no text or watermark.',
  contentAreaNote: 'Suggested layout area only; not a measured contrast guarantee.'
});
const temp = manifestPath + '.tmp';
fs.writeFileSync(temp, JSON.stringify(manifest, null, 2) + '\n');
fs.renameSync(temp, manifestPath);
console.log(JSON.stringify({ saved: output, width, height, bytes: bytes.length, completed: manifest.assets.length }));
