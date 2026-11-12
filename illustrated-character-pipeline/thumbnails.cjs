// 캐릭터 그림의 160×160 미리보기를 만들고 manifest의 thumbnail만 바꾼다. 원본 PNG는 건드리지 않는다.
// 기존 요소 미리보기(public/library/thumbnails)와 같은 크기다. 비율을 지키고 남는 곳은 투명으로 둔다.
// save.cjs로 새 그림을 저장한 뒤 실행한다. 이미 있는 미리보기는 다시 만들지 않는다.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const SIZE = 160;
const pack = path.resolve(__dirname, '../public/characters-illustrated');
const manifestPath = path.join(pack, 'manifest.json');

(async () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  fs.mkdirSync(path.join(pack, 'thumbnails'), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let made = 0;
  for (const asset of manifest.assets) {
    const name = path.basename(asset.image);
    const output = path.join(pack, 'thumbnails', name);
    if (!fs.existsSync(output)) {
      const source = 'data:image/png;base64,' + fs.readFileSync(path.join(pack, 'png', name)).toString('base64');
      const data = await page.evaluate(async ({ source, SIZE }) => {
        const image = new Image(); image.src = source; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = SIZE; canvas.height = SIZE;
        const context = canvas.getContext('2d'); context.imageSmoothingQuality = 'high';
        const scale = Math.min(SIZE / image.naturalWidth, SIZE / image.naturalHeight);
        const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
        context.drawImage(image, (SIZE - width) / 2, (SIZE - height) / 2, width, height);
        return canvas.toDataURL('image/png');
      }, { source, SIZE });
      fs.writeFileSync(output, Buffer.from(data.split(',')[1], 'base64'), { flag: 'wx' });
      made++;
    }
    asset.thumbnail = '/characters-illustrated/thumbnails/' + name;
  }
  await browser.close();
  const temp = manifestPath + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(manifest, null, 2) + '\n');
  fs.renameSync(temp, manifestPath);
  console.log(JSON.stringify({ made, total: manifest.assets.length }));
})();
