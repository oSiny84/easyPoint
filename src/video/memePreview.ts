// 미리보기의 밈 그림(영상 계약 §8). 스티커(애니메이션 WebP)는 ImageDecoder로 §3의 프레임만 그때그때 풀고 지금 프레임 하나만 쥔다.
// 밈 영상은 보이는 것마다 숨긴 <video> 하나를 §3의 m 시각에 맞춘다(재생 중이면 시계와 150ms 넘게 어긋날 때만 다시 맞춘다).
// 그리기 함수는 동기라서, 아직 풀지 못한 프레임은 직전 프레임을 돌려주고 다 풀리면 onReady로 다시 그리게 한다.
import { frameAtOrBefore, memeTime } from '../domain/timeline';
import type { MemeOverlay } from '../domain/videoTypes';
import { builtinBlob, type MemeItem } from './builtins';

type Sticker = { decoder: ImageDecoder; timestampsMs: number[]; current: { index: number; image: VideoFrame } | null; pending: number | null };
const DRIFT_MS = 150;

export class MemePreview {
  private stickers = new Map<string, Promise<Sticker | null>>();
  private ready = new Map<string, Sticker>();
  private clips = new Map<string, { video: HTMLVideoElement; url: string }>();
  private holder = document.createElement('div');
  private items = new Map<string, MemeItem>();
  private destroyed = false;

  constructor(private onReady: () => void) {
    this.holder.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none';
    this.holder.setAttribute('aria-hidden', 'true');
    document.body.append(this.holder);
  }

  setItems(items: readonly MemeItem[]) { this.items = new Map(items.map(item => [item.id, item])); }

  private sticker(item: MemeItem) {
    let pending = this.stickers.get(item.id);
    if (!pending) {
      pending = (async () => {
        const blob = await builtinBlob('memes', item);
        if (!blob || this.destroyed) return null;
        const decoder = new ImageDecoder({ data: blob.stream(), type: 'image/webp' });
        await decoder.tracks.ready; await decoder.completed;
        const count = decoder.tracks.selectedTrack!.frameCount;
        // 프레임 시각은 ImageDecoder가 주는 값(마이크로초)을 쓴다. fps로 계산하지 않는다(계약 §3).
        const timestampsMs: number[] = [];
        for (let i = 0; i < count; i++) { const { image } = await decoder.decode({ frameIndex: i }); timestampsMs.push(image.timestamp / 1000); image.close(); }
        const sticker: Sticker = { decoder, timestampsMs, current: null, pending: null };
        this.ready.set(item.id, sticker);
        this.onReady();
        return sticker;
      })().catch(() => null);
      this.stickers.set(item.id, pending);
    }
    return this.ready.get(item.id) ?? null;
  }

  private clip(overlay: MemeOverlay, item: MemeItem) {
    let entry = this.clips.get(overlay.id);
    if (!entry) {
      const video = document.createElement('video');
      video.preload = 'auto'; video.playsInline = true; video.loop = true; video.width = 2; video.height = 2;
      this.holder.append(video);
      entry = { video, url: '' };
      this.clips.set(overlay.id, entry);
      const created = entry;
      void builtinBlob('memes', item).then(blob => {
        if (!blob || this.destroyed) return;
        created.url = URL.createObjectURL(blob); created.video.src = created.url;
        created.video.addEventListener('loadeddata', () => this.onReady(), { once: true });
      });
    }
    return entry.video;
  }

  // 보이기 시작한 뒤 elapsed(ms)가 지난 밈의 그림. playing이면 밈 영상을 재생 상태로 맞춘다.
  frame(overlay: MemeOverlay, elapsed: number, playing: boolean): CanvasImageSource | null {
    const item = this.items.get(overlay.memeId);
    if (!item) return null;
    const m = memeTime(elapsed, item.durationMs);
    if (overlay.memeKind === 'sticker') {
      const sticker = this.sticker(item);
      if (!sticker) return null;
      const index = frameAtOrBefore(sticker.timestampsMs, m);
      if (sticker.current?.index !== index && sticker.pending !== index) {
        sticker.pending = index;
        void sticker.decoder.decode({ frameIndex: index }).then(({ image }) => {
          if (this.destroyed) { image.close(); return; }
          sticker.current?.image.close();
          sticker.current = { index, image }; sticker.pending = null;
          if (!playing) this.onReady();
        }).catch(() => { sticker.pending = null; });
      }
      return sticker.current?.image ?? null;
    }
    const video = this.clip(overlay, item);
    // 밈 영상: 타임스탬프가 m + 1ms 이하인 프레임(계약 §3). <video>는 위치만 맞추고 소리는 soundOn을 따른다.
    video.muted = !overlay.soundOn;
    const target = (m + 1) / 1000;
    if (playing) {
      if (video.paused) void video.play().catch(() => undefined);
      if (Math.abs(video.currentTime - target) * 1000 > DRIFT_MS && !video.seeking) video.currentTime = target;
    } else {
      if (!video.paused) video.pause();
      if (Math.abs(video.currentTime - target) > 0.02 && !video.seeking) { video.currentTime = target; video.addEventListener('seeked', () => this.onReady(), { once: true }); }
    }
    return video.readyState >= 2 ? video : null;
  }

  // 지금 보이지 않는 밈 영상은 멈춘다(소리가 남지 않게).
  settle(visible: ReadonlySet<string>) {
    for (const [id, entry] of this.clips) if (!visible.has(id) && !entry.video.paused) entry.video.pause();
  }
  pauseAll() { for (const entry of this.clips.values()) entry.video.pause(); }

  destroy() {
    this.destroyed = true;
    for (const entry of this.clips.values()) { entry.video.removeAttribute('src'); entry.video.load(); if (entry.url) URL.revokeObjectURL(entry.url); }
    for (const sticker of this.ready.values()) { sticker.current?.image.close(); sticker.decoder.close(); }
    this.holder.remove();
  }
}
