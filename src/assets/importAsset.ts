// 사용자 사진 입력(계약 §6). 헤더 검사 → 제한된 디코딩 → 방향 보정 → 긴 변 2560px 축소 → 재인코딩 → 해시.
// 크기와 관계없이 항상 다시 만들어 촬영 위치 등 메타데이터와 원본 파일명을 남기지 않는다.
import { LIMITS } from '../domain/limits';
import { fail, type Asset, type Failure } from '../domain/types';
import { isHeic, readImageHeader, sha256Hex } from './imageHeader';

const MAX_INPUT_PIXELS = 40_000_000, MAX_INPUT_SIDE = 16384;
const JPEG_QUALITY = 0.9;
export type ImportedAsset = { ok: true; asset: Asset; blob: Blob };

function hasTransparency(context: CanvasRenderingContext2D, width: number, height: number) {
  const { data } = context.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}
const toBlob = (canvas: HTMLCanvasElement, mime: string, quality?: number) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, quality));

export async function importAsset(file: Blob): Promise<ImportedAsset | Failure> {
  if (file.size > LIMITS.assetBytesMax) return fail('LIMIT_EXCEEDED', '사진 파일이 너무 커요. 20MB 이하 사진을 골라 주세요.');
  const head = new Uint8Array(await file.arrayBuffer());
  if (isHeic(head)) return fail('ASSET_INVALID', 'HEIC 사진은 아직 넣을 수 없어요. JPEG나 PNG로 바꿔서 넣어 주세요.');
  const header = readImageHeader(head);
  if (!header) return fail('ASSET_INVALID', 'PNG·JPEG·WebP 사진만 넣을 수 있어요.');
  if (header.animated) return fail('ASSET_INVALID', '움직이는 그림은 아직 넣을 수 없어요.');
  if (header.width < 1 || header.height < 1 || header.width > MAX_INPUT_SIDE || header.height > MAX_INPUT_SIDE || header.width * header.height > MAX_INPUT_PIXELS) return fail('LIMIT_EXCEEDED', '사진 크기가 너무 커요.');

  let bitmap: ImageBitmap;
  // 브라우저가 EXIF 방향을 적용해 디코딩한다.
  try { bitmap = await createImageBitmap(new Blob([head], { type: header.mime }), { imageOrientation: 'from-image' }); }
  catch { return fail('ASSET_INVALID', '사진을 읽지 못했어요. 파일이 손상됐을 수 있어요.'); }
  try {
    const ratio = Math.min(1, LIMITS.assetSideMax / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    // 투명한 부분이 있을 때만 PNG를 쓴다. JPEG 입력은 투명할 수 없어 검사하지 않는다.
    const transparent = header.mime !== 'image/jpeg' && hasTransparency(context, canvas.width, canvas.height);
    const mime = transparent ? 'image/png' : 'image/jpeg';
    const blob = await toBlob(canvas, mime, transparent ? undefined : JPEG_QUALITY);
    const { width, height } = canvas;
    canvas.width = canvas.height = 0;
    if (!blob) return fail('ASSET_INVALID', '사진을 처리하지 못했어요.');
    if (blob.size > LIMITS.assetBytesMax) return fail('LIMIT_EXCEEDED', '사진 파일이 너무 커요. 더 작은 사진을 골라 주세요.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { ok: true, blob, asset: { id: await sha256Hex(bytes), mime, pixelWidth: width, pixelHeight: height, byteLength: bytes.length } };
  } finally { bitmap.close(); }
}
