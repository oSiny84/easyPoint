// PDF 출력. 각 장을 2560×1440 JPEG(품질 0.88)로 960×540pt 페이지에 넣는다. 근거는 docs/PHASE2_RESULTS.md §6이다.
import { PDFDocument } from 'pdf-lib';
import { fail, type Project } from '../domain/types';
import { renderSlide, type BlobResolver } from '../rendering/renderSlide';
import type { ExportOptions, ExportResult } from './exportPptx';
import { licenseNotice } from './notices';

const QUALITY = 0.88;

export async function exportPdf(snapshot: Project, resolve: BlobResolver, options: ExportOptions = {}, signal?: AbortSignal): Promise<ExportResult> {
  try {
    const pdf = await PDFDocument.create(); pdf.setTitle(snapshot.title); pdf.setProducer('easyCraft'); pdf.setCreator('easyCraft');
    let done = 0;
    for (const slide of snapshot.slides) {
      if (signal?.aborted) return fail('CANCELLED', '내보내기를 취소했어요.');
      const rendered = await renderSlide(slide, resolve);
      if (!rendered.ok) return rendered;
      const blob = await new Promise<Blob | null>(next => rendered.canvas.toBlob(next, 'image/jpeg', QUALITY));
      // 장별 이미지를 바로 해제해 메모리를 제한한다.
      rendered.canvas.width = rendered.canvas.height = 0;
      if (!blob) return fail('EXPORT_FAILED', '파일을 만들지 못했어요. 다시 시도해 주세요.');
      const image = await pdf.embedJpg(await blob.arrayBuffer());
      pdf.addPage([960, 540]).drawImage(image, { x: 0, y: 0, width: 960, height: 540 });
      options.onProgress?.(++done, snapshot.slides.length);
    }
    if (signal?.aborted) return fail('CANCELLED', '내보내기를 취소했어요.');
    // 페이지가 이미지라 PNG의 라이선스 정보가 사라지므로 고지를 첨부 파일로 넣는다.
    const notice = await licenseNotice(snapshot, resolve);
    if (notice) {
      await pdf.attach(new TextEncoder().encode(notice), 'licenses.txt', { mimeType: 'text/plain', description: '그림 라이선스 고지' });
      pdf.setSubject('포함된 그림의 라이선스 고지는 첨부 파일 licenses.txt에 있습니다.');
    }
    const bytes = await pdf.save();
    if (signal?.aborted) return fail('CANCELLED', '내보내기를 취소했어요.');
    return { ok: true, blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), warnings: [] };
  } catch (error) { if (import.meta.env.DEV) console.error(error); return fail('EXPORT_FAILED', '파일을 만들지 못했어요. 다시 시도해 주세요.'); }
}
