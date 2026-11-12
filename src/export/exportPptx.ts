// PPTX 출력. 변환 규칙의 근거는 docs/PHASE2_RESULTS.md §4·§5, 계약은 docs/contracts.md §8이다.
import JSZip from 'jszip';
import pptxgen from 'pptxgenjs';
import { sha256Hex } from '../assets/imageHeader';
import { DEFAULT_FONT_ID, LIMITS } from '../domain/limits';
import { fail, type Failure, type Project, type StrokeElement } from '../domain/types';
import { coverCrop, drawStroke, renderSlide, type BlobResolver } from '../rendering/renderSlide';
import { fontOf, prepareFonts } from '../rendering/text/fonts';
import { layoutText } from '../rendering/text/layoutText';
import { licenseNotice } from './notices';

const WIDTH = LIMITS.slideWidth, HEIGHT = LIMITS.slideHeight;
const inch = (px: number) => px / 96;
const JPEG_QUALITY = 0.88, BACKGROUND_QUALITY = 0.9;

export type ExportResult = { ok: true; blob: Blob; warnings: string[] } | Failure;
export type ExportOptions = { onProgress?: (done: number, total: number) => void };
const cancelled = () => fail('CANCELLED', '내보내기를 취소했어요.');
const failed = () => fail('EXPORT_FAILED', '파일을 만들지 못했어요. 다시 시도해 주세요.');

function toDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
}

// 연속한 획을 투명 PNG 하나로 만든다. 영역은 점 범위 + 선 굵기 절반 + 논리 2px이고 해상도는 2배다.
function strokePng(run: StrokeElement[]) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const element of run) for (let i = 0; i < element.points.length; i += 2) {
    const pad = element.strokeWidth / 2 + 2;
    left = Math.min(left, element.x + element.points[i] - pad); right = Math.max(right, element.x + element.points[i] + pad);
    top = Math.min(top, element.y + element.points[i + 1] - pad); bottom = Math.max(bottom, element.y + element.points[i + 1] + pad);
  }
  left = Math.floor(left); top = Math.floor(top); right = Math.ceil(right); bottom = Math.ceil(bottom);
  const canvas = document.createElement('canvas'); canvas.width = (right - left) * 2; canvas.height = (bottom - top) * 2;
  const context = canvas.getContext('2d')!; context.scale(2, 2); context.translate(-left, -top);
  for (const element of run) drawStroke(context, element);
  return { data: canvas.toDataURL('image/png'), x: left, y: top, width: right - left, height: bottom - top };
}

// 배경은 PowerPoint 쪽 자르기에 맡기지 않고 화면과 같은 계산으로 16:9 이미지를 만든다.
async function coverImage(blob: Blob) {
  const bitmap = await createImageBitmap(blob); const crop = coverCrop(bitmap.width, bitmap.height);
  // 이미 16:9인 배경은 다시 만들지 않는다. 내장 배경 PNG의 라이선스 정보가 그대로 유지된다.
  if (bitmap.width * HEIGHT === bitmap.height * WIDTH) { bitmap.close(); return toDataUrl(blob); }
  const canvas = document.createElement('canvas'); canvas.width = WIDTH * 2; canvas.height = HEIGHT * 2;
  canvas.getContext('2d')!.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', BACKGROUND_QUALITY);
}

// PptxGenJS는 같은 사진도 장마다 따로 저장하고 JPEG 배경에 .png 이름을 붙인다.
// 내용이 같은 사진을 한 파일로 합치고 실제 형식에 맞는 확장자를 붙인다.
export async function finishPptx(blob: Blob): Promise<Blob> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const renamed = new Map<string, string>(); const byHash = new Map<string, { target: string; bytes: Uint8Array }>();
  for (const [name, file] of Object.entries(zip.files)) {
    if (file.dir || !name.startsWith('ppt/media/')) continue;
    const bytes = await file.async('uint8array'); const hash = await sha256Hex(bytes);
    let found = byHash.get(hash);
    if (!found) {
      const extension = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'jpeg' : bytes[0] === 0x89 && bytes[1] === 0x50 ? 'png' : name.split('.').pop();
      found = { target: `ppt/media/image-${byHash.size + 1}.${extension}`, bytes };
      byHash.set(hash, found);
    }
    renamed.set(name, found.target); zip.remove(name);
  }
  for (const { target, bytes } of byHash.values()) zip.file(target, bytes);
  for (const name of Object.keys(zip.files)) {
    if (!name.endsWith('.rels')) continue;
    const xml = await zip.file(name)!.async('string');
    zip.file(name, xml.replace(/Target="\.\.\/media\/([^"]+)"/g, (match, file) => {
      const target = renamed.get(`ppt/media/${file}`);
      return target ? `Target="../media/${target.slice('ppt/media/'.length)}"` : match;
    }));
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

// mode='editable'은 글씨·사진을 개별 요소로, 'image'는 슬라이드 전체를 이미지로 넣는다. 자동으로 바꾸지 않는다.
export async function exportPptx(snapshot: Project, resolve: BlobResolver, mode: 'editable' | 'image', options: ExportOptions = {}, signal?: AbortSignal): Promise<ExportResult> {
  try {
    const pptx = new pptxgen(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'easyCraft'; pptx.title = snapshot.title;
    // 모양 그대로 PPT는 PNG의 라이선스 정보가 사라지므로 첫 장 노트에 고지를 넣는다. 편집용은 PNG 바이트를 그대로 넣어 유지된다.
    const notice = mode === 'image' ? await licenseNotice(snapshot, resolve) : null;
    let done = 0;
    for (const slide of snapshot.slides) {
      if (signal?.aborted) return cancelled();
      const page = pptx.addSlide();
      if (notice && done === 0) page.addNotes(notice);
      if (mode === 'image') {
        const rendered = await renderSlide(slide, resolve);
        if (!rendered.ok) return rendered;
        page.addImage({ data: rendered.canvas.toDataURL('image/jpeg', JPEG_QUALITY), x: 0, y: 0, w: inch(WIDTH), h: inch(HEIGHT) });
        rendered.canvas.width = rendered.canvas.height = 0;
      } else {
        const fonts = await prepareFonts([slide]);
        if (fonts) return fonts;
        if (slide.background.kind === 'solid') page.background = { color: slide.background.color.slice(1) };
        else {
          const blob = await resolve(slide.background.assetId);
          if (!blob) return fail('ASSET_MISSING', '사진 자료를 찾을 수 없어요.');
          page.background = { data: await coverImage(blob) };
        }
        for (let index = 0; index < slide.elements.length; index++) {
          const element = slide.elements[index];
          if (element.type === 'image') {
            const blob = await resolve(element.assetId);
            if (!blob) return fail('ASSET_MISSING', '사진 자료를 찾을 수 없어요.');
            page.addImage({ data: await toDataUrl(blob), x: inch(element.x), y: inch(element.y), w: inch(element.width), h: inch(element.height) });
          } else if (element.type === 'text') {
            const layout = layoutText(element); const font = fontOf(element.fontId).pptx;
            page.addText(element.text, {
              x: inch(element.x), y: inch(element.y + (font.shiftEm - font.lineHeightShiftEm * (element.lineHeight - font.baseLineHeight)) * element.fontSize), w: inch(element.width), h: inch(layout.height + 8),
              fontFace: font.face, fontSize: element.fontSize * 0.75 * font.scale, color: element.color.slice(1), bold: element.bold, align: element.align,
              lang: 'ko-KR', margin: 0, valign: 'top', wrap: true, paraSpaceAfter: 0, lineSpacing: layout.lineHeight * 0.75,
            });
          } else {
            // 다른 요소를 넘어 묶지 않아 앞뒤 순서를 지킨다.
            const run: StrokeElement[] = [element];
            while (slide.elements[index + 1]?.type === 'stroke') run.push(slide.elements[++index] as StrokeElement);
            const png = strokePng(run);
            page.addImage({ data: png.data, x: inch(png.x), y: inch(png.y), w: inch(png.width), h: inch(png.height) });
          }
        }
      }
      options.onProgress?.(++done, snapshot.slides.length);
      // 긴 출력 중에도 화면이 멈추지 않게 한다.
      await new Promise(next => setTimeout(next));
    }
    if (signal?.aborted) return cancelled();
    const blob = await finishPptx(await pptx.write({ outputType: 'blob' }) as Blob);
    if (signal?.aborted) return cancelled();
    // PPTX에는 글꼴 파일을 넣지 못한다. 기본 글꼴과 모양 차이가 큰 글꼴을 썼으면 알려 준다.
    const special = mode === 'editable' && snapshot.slides.some(slide => slide.elements.some(element => element.type === 'text' && element.fontId !== DEFAULT_FONT_ID));
    return { ok: true, blob, warnings: special ? ['고른 글꼴은 PowerPoint에서 맑은 고딕으로 보여요. 모양을 그대로 두려면 모양 그대로 PowerPoint를 고르세요.'] : [] };
  } catch (error) { if (import.meta.env.DEV) console.error(error); return failed(); }
}
