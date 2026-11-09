// 영상의 한 프레임을 작은 그림으로 만든다(타임라인 조각 그림, 작품 목록 미리보기). <video>로 그 시각에 맞춘 뒤 캔버스에 그린다.
// 같은 (영상, 시각, 크기)는 한 번만 만든다. 실패하면 null이며 화면은 빈 칸으로 둔다.
import { readMedia } from './mediaStore';

const cache = new Map<string, Promise<Blob | null>>();

export function frameAt(mediaId: string, ms: number, width: number, height: number): Promise<Blob | null> {
  const key = `${mediaId}:${ms}:${width}x${height}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = capture(mediaId, ms, width, height);
    cache.set(key, pending);
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
  }
  return pending;
}

async function capture(mediaId: string, ms: number, width: number, height: number): Promise<Blob | null> {
  const file = await readMedia(mediaId);
  if (!file) return null;
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true; video.preload = 'auto';
  try {
    video.src = url;
    const ok = await new Promise<boolean>(resolve => {
      const timer = setTimeout(() => resolve(false), 8000);
      video.addEventListener('error', () => { clearTimeout(timer); resolve(false); }, { once: true });
      video.addEventListener('loadedmetadata', () => { video.currentTime = Math.min(ms / 1000, Math.max(0, video.duration - 0.05)); }, { once: true });
      video.addEventListener('seeked', () => { clearTimeout(timer); resolve(true); }, { once: true });
    });
    if (!ok || !video.videoWidth) return null;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
    const fit = Math.min(width / video.videoWidth, height / video.videoHeight);
    const w = video.videoWidth * fit, h = video.videoHeight * fit;
    ctx.drawImage(video, (width - w) / 2, (height - h) / 2, w, h);
    return await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  } catch { return null; }
  finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}
