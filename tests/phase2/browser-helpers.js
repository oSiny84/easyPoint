// 브라우저 안에서 실행되는 Phase 2 측정 도구. 앱 코드에 포함되지 않는다.
window.h = {
  graphemes(text) { return [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(text)].map(s => s.segment); },

  cssFor(item, wordBreak) {
    return `width:${item.width}px;font-family:'Noto Sans KR';font-size:${item.fontSize}px;font-weight:${item.bold ? 700 : 400};line-height:${item.lineHeight ?? 1.3};white-space:pre-wrap;overflow-wrap:anywhere;word-break:${wordBreak};letter-spacing:0;padding:0;border:0;font-synthesis:none`;
  },

  // 편집용 textarea와 같은 CSS를 준 숨은 요소에서 브라우저가 실제로 나눈 줄을 읽는다.
  domLines(item, wordBreak = 'keep-all') {
    const box = document.createElement('div'); box.lang = 'und';
    box.style.cssText = `position:absolute;left:-99999px;top:0;${this.cssFor(item, wordBreak)}`;
    box.textContent = item.text;
    document.body.append(box);
    const node = box.firstChild; const range = document.createRange();
    const lines = []; let current = ''; let lastTop = null; let offset = 0;
    for (const g of this.graphemes(item.text)) {
      if (g === '\n') { lines.push(current); current = ''; lastTop = null; offset += 1; continue; }
      range.setStart(node, offset); range.setEnd(node, offset + g.length);
      const rects = [...range.getClientRects()].filter(r => r.height > 0);
      const top = rects.length ? rects[rects.length - 1].top : lastTop;
      if (lastTop !== null && top !== null && Math.abs(top - lastTop) > 2) { lines.push(current); current = ''; }
      current += g; if (top !== null) lastTop = top; offset += g.length;
    }
    lines.push(current); box.remove();
    return lines;
  },

  // 실제 textarea에서 scrollHeight로 줄 수를 읽어 domLines 결과가 맞는지 대조한다.
  textareaAgrees(item, lines) {
    const area = document.createElement('textarea'); area.lang = 'und';
    area.style.cssText = `position:absolute;left:-99999px;top:0;height:10px;overflow:hidden;${this.cssFor(item, 'keep-all')}`;
    document.body.append(area);
    const lh = item.fontSize * (item.lineHeight ?? 1.3); const bad = []; let text = '';
    lines.forEach((line, index) => {
      if (index && item.text[text.length] === '\n') text += '\n';
      text += line;
      area.value = text; const count = Math.round(area.scrollHeight / lh);
      if (count !== index + 1) bad.push({ index, count });
    });
    area.remove();
    return bad;
  },

  // 이미지에서 글자 잉크가 있는 줄 띠를 찾는다. 좌표는 입력 이미지 픽셀 단위다.
  bandsOf(imageData, threshold = 150) {
    const { data, width, height } = imageData; const rows = [];
    let minX = width, maxX = -1, start = -1;
    for (let y = 0; y < height; y++) {
      let any = false;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (luma < threshold && data[i + 3] > 40) { any = true; if (x < minX) minX = x; if (x > maxX) maxX = x; }
      }
      if (any && start < 0) start = y;
      if (!any && start >= 0) { rows.push({ top: start, bottom: y, left: minX, right: maxX }); start = -1; minX = width; maxX = -1; }
    }
    if (start >= 0) rows.push({ top: start, bottom: height, left: minX, right: maxX });
    return rows;
  },
  scaled(rows, scale) { return rows.map(b => ({ top: b.top / scale, bottom: b.bottom / scale, left: b.left / scale, right: b.right / scale })); },
  async dataOfPng(base64) {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, image.width, image.height);
  },
  async bandsFromPng(base64, scale) { return this.scaled(this.bandsOf(await this.dataOfPng(base64)), scale); },
  bandsFromCanvas(canvas, scale) { return this.scaled(this.bandsOf(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)), scale); },
};
