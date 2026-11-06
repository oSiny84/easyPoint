import pptxgen from 'pptxgenjs';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import { WIDTH, HEIGHT, FONT, TEXT_LANG, layoutText, prepareFonts, type Slide, type StrokeItem, type TextItem } from './model';

export function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('사진을 읽지 못했어요.')); image.src = source;
  });
}

function stroke(context: CanvasRenderingContext2D, item: StrokeItem) {
  context.strokeStyle = item.color; context.fillStyle = item.color;
  context.lineWidth = item.strokeWidth; context.lineCap = 'round'; context.lineJoin = 'round';
  if (item.points.length === 2) {
    context.beginPath(); context.arc(item.points[0], item.points[1], item.strokeWidth / 2, 0, Math.PI * 2); context.fill(); return;
  }
  context.beginPath(); context.moveTo(item.points[0], item.points[1]);
  for (let i = 2; i < item.points.length; i += 2) context.lineTo(item.points[i], item.points[i + 1]);
  context.stroke();
}

// 슬라이드 비율을 채우도록 사진 가운데를 잘라낸 원본 영역을 계산한다.
export function coverCrop(sourceWidth: number, sourceHeight: number) {
  const target = WIDTH / HEIGHT;
  const width = sourceWidth / sourceHeight > target ? sourceHeight * target : sourceWidth;
  const height = sourceWidth / sourceHeight > target ? sourceHeight : sourceWidth / target;
  return { x: (sourceWidth - width) / 2, y: (sourceHeight - height) / 2, width, height };
}
function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement) {
  const crop = coverCrop(image.naturalWidth, image.naturalHeight);
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, WIDTH, HEIGHT);
}
// 출력 배경은 PowerPoint 쪽 자르기에 맡기지 않고 16:9 이미지를 미리 만든다.
async function coverImageData(source: string) {
  const canvas = document.createElement('canvas'); canvas.width = WIDTH * 2; canvas.height = HEIGHT * 2;
  const context = canvas.getContext('2d')!; context.scale(2, 2); drawCover(context, await loadImage(source));
  return canvas.toDataURL('image/jpeg', 0.9);
}

export async function renderSlide(slide: Slide, scale = 2) {
  await prepareFonts(slide);
  const canvas = document.createElement('canvas'); canvas.lang = TEXT_LANG; canvas.width = WIDTH * scale; canvas.height = HEIGHT * scale;
  const context = canvas.getContext('2d')!; context.scale(scale, scale);
  context.fillStyle = slide.background; context.fillRect(0, 0, WIDTH, HEIGHT);
  if (slide.backgroundImage) drawCover(context, await loadImage(slide.backgroundImage));
  for (const item of slide.elements) {
    if (item.type === 'image') context.drawImage(await loadImage(item.source), item.x, item.y, item.width, item.height);
    else if (item.type === 'stroke') stroke(context, item);
    else {
      context.fillStyle = item.color; context.font = `${item.bold ? 700 : 400} ${item.fontSize}px ${FONT}`;
      // 글자를 CSS 줄 상자 안에 놓는 규칙(위아래 여백 균등)을 따라 편집 화면과 세로 위치를 맞춘다.
      context.textBaseline = 'alphabetic';
      const layout = layoutText(item);
      const metrics = context.measureText('가');
      const ascent = metrics.fontBoundingBoxAscent, descent = metrics.fontBoundingBoxDescent;
      const baseline = (layout.lineHeight - (ascent + descent)) / 2 + ascent;
      layout.lines.forEach((line, i) => context.fillText(line, item.x, item.y + i * layout.lineHeight + baseline));
    }
  }
  return canvas;
}

// 연속한 획을 합쳐 투명 PNG 하나로 만든다. 영역은 점 범위 + 선 굵기 절반 + 논리 2px이고 해상도는 2배다.
export function strokePng(items: StrokeItem[]) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const item of items) for (let i = 0; i < item.points.length; i += 2) {
    const pad = item.strokeWidth / 2 + 2;
    left = Math.min(left, item.points[i] - pad); right = Math.max(right, item.points[i] + pad);
    top = Math.min(top, item.points[i + 1] - pad); bottom = Math.max(bottom, item.points[i + 1] + pad);
  }
  left = Math.floor(left); top = Math.floor(top); right = Math.ceil(right); bottom = Math.ceil(bottom);
  const canvas = document.createElement('canvas'); canvas.width = (right - left) * 2; canvas.height = (bottom - top) * 2;
  const context = canvas.getContext('2d')!; context.scale(2, 2); context.translate(-left, -top);
  for (const item of items) stroke(context, item);
  return { data: canvas.toDataURL(), x: left, y: top, width: right - left, height: bottom - top };
}

async function toDataUrl(source: string) {
  if (source.startsWith('data:')) return source;
  const blob = await (await fetch(source)).blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
  });
}

// 기본값은 Phase 2 PowerPoint 비교로 정했다. 근거는 docs/PHASE2_RESULTS.md에 있다.
export type PptxOptions = {
  fontFace?: string; lang?: string; spacing?: 'exact' | 'multiple'; background?: 'slide' | 'element' | 'sizing';
  // 앱의 첫 줄 위치와 PowerPoint의 위치 차이를 보정할 때 쓴다. 단위는 fontSize 배수다.
  verticalShift?: number;
  // PPT 글꼴이 앱 글꼴보다 넓을 때 줄 폭을 맞추는 글자 크기 배율.
  fontScale?: number;
};

// PptxGenJS의 softBreakBefore는 줄 간격과 함께 쓰면 <a:br/> 뒤에 <a:pPr>를 넣어 스키마를 어긴다. 줄 고정은 문단으로 만든다.
function textBody(item: TextItem, mode: 'auto' | 'explicit') {
  return mode === 'auto' ? item.text : layoutText(item).lines.join('\n');
}

export async function makePptx(input: Slide | Slide[], mode: 'auto' | 'explicit' | 'image', options: PptxOptions = {}): Promise<Blob> {
  const { fontFace = '맑은 고딕', lang = 'ko-KR', spacing = 'exact', background = 'slide', verticalShift = 0.07, fontScale = 0.92 } = options;
  const pptx = new pptxgen(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'CanvaCraft'; pptx.subject = 'Phase 2 기술 시험';
  for (const slide of Array.isArray(input) ? input : [input]) {
    await prepareFonts(slide);
    const page = pptx.addSlide(); page.background = { color: slide.background.slice(1) };
    if (mode === 'image') { page.addImage({ data: (await renderSlide(slide)).toDataURL('image/jpeg', 0.88), x: 0, y: 0, w: WIDTH / 96, h: HEIGHT / 96 }); continue; }
    if (slide.backgroundImage) {
      // 'sizing'은 원본을 PptxGenJS 자르기에 맡기는 비교 후보다.
      if (background === 'sizing') page.addImage({ data: await toDataUrl(slide.backgroundImage), x: 0, y: 0, w: WIDTH / 96, h: HEIGHT / 96, sizing: { type: 'cover', w: WIDTH / 96, h: HEIGHT / 96 } });
      else {
        const data = await coverImageData(slide.backgroundImage);
        if (background === 'slide') page.background = { data };
        else page.addImage({ data, x: 0, y: 0, w: WIDTH / 96, h: HEIGHT / 96 });
      }
    }
    for (let index = 0; index < slide.elements.length; index++) {
      const item = slide.elements[index];
      if (item.type === 'image') page.addImage({ data: await toDataUrl(item.source), x: item.x / 96, y: item.y / 96, w: item.width / 96, h: item.height / 96 });
      else if (item.type === 'text') {
        const layout = layoutText(item);
        page.addText(textBody(item, mode), {
          x: item.x / 96, y: (item.y + verticalShift * item.fontSize) / 96, w: item.width / 96, h: (layout.height + 8) / 96,
          fontFace, fontSize: item.fontSize * 0.75 * fontScale, color: item.color.slice(1), bold: item.bold, lang,
          margin: 0, valign: 'top', wrap: mode === 'auto', paraSpaceAfter: 0,
          ...(spacing === 'exact' ? { lineSpacing: layout.lineHeight * 0.75 } : { lineSpacingMultiple: 1.3 }),
        });
      } else {
        const run: StrokeItem[] = [item];
        while (slide.elements[index + 1]?.type === 'stroke') run.push(slide.elements[++index] as StrokeItem);
        const png = strokePng(run);
        page.addImage({ data: png.data, x: png.x / 96, y: png.y / 96, w: png.width / 96, h: png.height / 96 });
      }
    }
  }
  return finishPptx(await pptx.write({ outputType: 'blob' }) as Blob);
}

// PptxGenJS는 같은 사진도 장마다 따로 저장하고, JPEG 배경을 .png 이름으로 저장한다.
// 내용이 같은 사진을 한 파일로 합치고 실제 형식에 맞는 확장자를 붙인다.
export async function finishPptx(blob: Blob): Promise<Blob> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const renamed = new Map<string, string>(); const byHash = new Map<string, string>();
  for (const [name, file] of Object.entries(zip.files)) {
    if (file.dir || !name.startsWith('ppt/media/')) continue;
    const bytes = await file.async('uint8array');
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))].map(value => value.toString(16).padStart(2, '0')).join('');
    let target = byHash.get(hash);
    if (!target) {
      const extension = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'jpeg' : bytes[0] === 0x89 && bytes[1] === 0x50 ? 'png' : name.split('.').pop();
      target = `ppt/media/image-${byHash.size + 1}.${extension}`;
      byHash.set(hash, target); zip.file(target + '.tmp', bytes);
    }
    renamed.set(name, target); zip.remove(name);
  }
  for (const target of byHash.values()) { const file = zip.file(target + '.tmp')!; zip.file(target, await file.async('uint8array')); zip.remove(target + '.tmp'); }
  for (const name of Object.keys(zip.files)) {
    if (!name.endsWith('.rels')) continue;
    const xml = await zip.file(name)!.async('string');
    zip.file(name, xml.replace(/Target="\.\.\/media\/([^"]+)"/g, (match, file) => { const target = renamed.get(`ppt/media/${file}`); return target ? `Target="../media/${target.slice('ppt/media/'.length)}"` : match; }));
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

function canvasBytes(canvas: HTMLCanvasElement, format: 'png' | 'jpeg', quality: number) {
  return new Promise<ArrayBuffer>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob.arrayBuffer()) : reject(new Error('이미지를 만들지 못했어요.')), `image/${format}`, quality));
}

export async function makePdf(input: Slide | Slide[], format: 'png' | 'jpeg', count = 1, quality = 0.88): Promise<Blob> {
  const slides = Array.isArray(input) ? input : Array.from({ length: count }, () => input);
  const pdf = await PDFDocument.create();
  for (const slide of slides) {
    const canvas = await renderSlide(slide);
    const data = await canvasBytes(canvas, format, quality);
    const image = format === 'png' ? await pdf.embedPng(data) : await pdf.embedJpg(data);
    pdf.addPage([960, 540]).drawImage(image, { x: 0, y: 0, width: 960, height: 540 });
    canvas.width = 0; canvas.height = 0;
  }
  const bytes = await pdf.save(); return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
