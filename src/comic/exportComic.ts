// 만화 내려받기(만화 계약 §8): 만화책 PDF(모든 쪽)와 그림 PNG(쪽 하나). 쪽 그림은 composePage가 만든다.
// 넘어온 스냅숏만 읽으므로 만드는 동안의 편집은 파일에 섞이지 않는다.
import { PDFDocument } from 'pdf-lib';
import type { ComicProject } from '../domain/comicTypes';
import { fail, type Failure } from '../domain/types';
import { licenseNotice } from '../export/notices';
import type { BlobResolver } from '../rendering/renderSlide';
import { composePage } from './composePage';
import { pageCount, pageLayout, pageOfPanel, panelsPerPage } from './pageLayout';

// 포인트당 픽셀 수. A4 세로가 1785×2526픽셀(약 216dpi)이 된다.
export const EXPORT_PIXELS_PER_POINT = 3;
const JPEG_QUALITY = 0.88;
const cancelled = () => fail('CANCELLED', '내보내기를 취소했어요.');
const failed = () => fail('EXPORT_FAILED', '파일을 만들지 못했어요. 다시 시도해 주세요.');

export type ComicExportOptions = { onProgress?: (done: number, total: number) => void; signal?: AbortSignal };
export type ComicPdfResult = { ok: true; blob: Blob; pages: number } | Failure;

export async function exportComicPdf(snapshot: ComicProject, resolve: BlobResolver, options: ComicExportOptions = {}): Promise<ComicPdfResult> {
  try {
    const layout = pageLayout(snapshot.layout); const perPage = panelsPerPage(snapshot.layout);
    const pages = pageCount(snapshot.slides.length, snapshot.layout);
    const pdf = await PDFDocument.create(); pdf.setTitle(snapshot.title); pdf.setProducer('CanvaCraft'); pdf.setCreator('CanvaCraft');
    for (let page = 0; page < pages; page++) {
      if (options.signal?.aborted) return cancelled();
      const composed = await composePage(snapshot, page, resolve, EXPORT_PIXELS_PER_POINT);
      if (!composed.ok) return composed;
      const blob = await new Promise<Blob | null>(next => composed.canvas.toBlob(next, 'image/jpeg', JPEG_QUALITY));
      // 쪽 그림을 바로 해제해 메모리를 제한한다.
      composed.canvas.width = composed.canvas.height = 0;
      if (!blob) return failed();
      const image = await pdf.embedJpg(await blob.arrayBuffer());
      pdf.addPage([layout.width, layout.height]).drawImage(image, { x: 0, y: 0, width: layout.width, height: layout.height });
      // 진행률은 칸 수로 알린다(편집 화면의 진행 표시가 장 수를 센다).
      options.onProgress?.(Math.min((page + 1) * perPage, snapshot.slides.length), snapshot.slides.length);
    }
    if (options.signal?.aborted) return cancelled();
    // 쪽이 이미지라 PNG의 라이선스 정보가 사라지므로 고지를 첨부 파일로 넣는다(슬라이드 PDF와 같다).
    const notice = await licenseNotice(snapshot, resolve);
    if (notice) {
      await pdf.attach(new TextEncoder().encode(notice), 'licenses.txt', { mimeType: 'text/plain', description: '그림 라이선스 고지' });
      pdf.setSubject('포함된 그림의 라이선스 고지는 첨부 파일 licenses.txt에 있습니다.');
    }
    const bytes = await pdf.save();
    if (options.signal?.aborted) return cancelled();
    return { ok: true, blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), pages };
  } catch (error) { if (import.meta.env.DEV) console.error(error); return failed(); }
}

export type ComicPngResult = { ok: true; blob: Blob; page: number; pages: number } | Failure;

// slideId가 들어 있는 쪽 하나를 PNG로 만든다. 그 칸이 스냅숏에 없으면 첫 쪽이다.
export async function exportComicPng(snapshot: ComicProject, slideId: string | null, resolve: BlobResolver, options: ComicExportOptions = {}): Promise<ComicPngResult> {
  try {
    const index = Math.max(0, snapshot.slides.findIndex(slide => slide.id === slideId));
    const page = pageOfPanel(index, snapshot.layout);
    if (options.signal?.aborted) return cancelled();
    const composed = await composePage(snapshot, page, resolve, EXPORT_PIXELS_PER_POINT);
    if (!composed.ok) return composed;
    const blob = await new Promise<Blob | null>(next => composed.canvas.toBlob(next, 'image/png'));
    composed.canvas.width = composed.canvas.height = 0;
    if (!blob) return failed();
    if (options.signal?.aborted) return cancelled();
    options.onProgress?.(snapshot.slides.length, snapshot.slides.length);
    return { ok: true, blob, page: page + 1, pages: pageCount(snapshot.slides.length, snapshot.layout) };
  } catch (error) { if (import.meta.env.DEV) console.error(error); return failed(); }
}
