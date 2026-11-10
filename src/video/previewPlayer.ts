// 미리보기 재생(영상 계약 §8). 재생 시계는 AudioContext.currentTime이다. 조각마다 숨긴 <video>를 시계에 맞춰 재생하고 캔버스에 그린다.
// <video>는 두 개를 번갈아 쓴다: 지금 조각을 재생하는 동안 다른 하나에 다음 조각을 그 시작 위치로 미리 맞춰 두어 경계에서 덜 끊기게 한다.
// 조각 전환은 <video>의 ended가 아니라 시계로 정한다(그렇지 않으면 outMs를 지나 재생된다). 미리보기는 출력과 1프레임 차이와 끊김을 허용한다.
// 자막·밈은 영상 프레임을 그린 뒤 painter(compose.ts drawOverlays를 쓰는 화면 쪽 함수)가 같은 캔버스에 겹친다.
import { clipSpeed, clipStarts, locate, totalMs } from '../domain/timeline';
import { CANVAS } from '../domain/videoLimits';
import type { Clip, VideoProject } from '../domain/videoTypes';
import { drawContain } from './compose';
import { readMedia } from './mediaStore';

export type Painter = (ctx: CanvasRenderingContext2D, timeMs: number, playing: boolean) => void;
// 재생할 때 Web Audio로 같은 시계에 맞춰 낼 소리(계약 §8): 배경음악(0초부터 반복, 작품 끝에서 자름)과 효과음(밈이 보이기 시작할 때 1회).
export type SoundPlan = { music: { buffer: AudioBuffer; volume: number } | null; effects: { atMs: number; buffer: AudioBuffer }[] };

type Slot = { video: HTMLVideoElement; clipId: string | null; mediaId: string | null; ready: Promise<void> };
export type FrameEvent = { at: number; clipIndex: number; mediaTime: number };
export type PlayerState = { playing: boolean; timeMs: number };

// 이보다 많이 어긋나면 <video> 위치를 다시 맞춘다.
const DRIFT_MS = 150;

export class PreviewPlayer {
  private project: VideoProject;
  private slots: Slot[];
  private active = 0;
  private urls = new Map<string, string>();
  private pendingUrls = new Map<string, Promise<string | null>>();
  private audio: AudioContext | null = null;
  private clockStart = 0;
  private workStart = 0;
  private time = 0;
  private playing = false;
  private frame = 0;
  private destroyed = false;
  private painter: Painter | null = null;
  private soundPlan: (() => SoundPlan) | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private lastVideo: HTMLVideoElement | null = null;
  // 화면에 붙어 있어야 프레임 표시 알림(requestVideoFrameCallback)이 온다. 보이지 않게 둔다.
  private holder = document.createElement('div');
  // 시험·조사용: 실제로 화면에 나온 영상 프레임 기록(requestVideoFrameCallback).
  readonly frames: FrameEvent[] = [];
  // 시험·조사용: 슬롯 준비 완료·조각 전환·위치 보정 시각.
  readonly events: { at: number; type: 'ready' | 'swap' | 'drift' | 'load'; slot: number; clipIndex: number; detail?: number }[] = [];
  private note(type: 'ready' | 'swap' | 'drift' | 'load', slot: Slot, detail?: number) {
    this.events.push({ at: performance.now(), type, slot: this.slots.indexOf(slot), clipIndex: this.project.clips.findIndex(clip => clip.id === slot.clipId), detail });
    if (this.events.length > 500) this.events.splice(0, 100);
  }

  constructor(private canvas: HTMLCanvasElement, project: VideoProject, private onState: (state: PlayerState) => void) {
    this.project = project;
    this.holder.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none';
    this.holder.setAttribute('aria-hidden', 'true');
    document.body.append(this.holder);
    this.slots = [0, 1].map(() => {
      const video = document.createElement('video');
      video.preload = 'auto'; video.playsInline = true; video.width = 2; video.height = 2;
      // 빠르기를 바꾼 조각은 소리 높이도 함께 바뀐다(출력의 다시 표본화와 같게, 계약 §8).
      video.preservesPitch = false;
      this.holder.append(video);
      return { video, clipId: null, mediaId: null, ready: Promise.resolve() };
    });
    for (const [index, slot] of this.slots.entries()) this.watchFrames(slot, index);
    this.resize();
    void this.seek(0);
  }

  private watchFrames(slot: Slot, index: number) {
    const video = slot.video as HTMLVideoElement & { requestVideoFrameCallback?: (callback: (now: number, meta: { mediaTime: number }) => void) => number };
    if (!video.requestVideoFrameCallback) return;
    const onFrame = (_now: number, meta: { mediaTime: number }) => {
      if (this.destroyed) return;
      if (this.playing && index === this.active) {
        const clipIndex = this.project.clips.findIndex(clip => clip.id === slot.clipId);
        this.frames.push({ at: performance.now(), clipIndex, mediaTime: meta.mediaTime });
        if (this.frames.length > 5000) this.frames.splice(0, 1000);
      }
      video.requestVideoFrameCallback!(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
  }

  private resize() {
    const size = CANVAS[this.project.orientation];
    if (this.canvas.width !== size.width || this.canvas.height !== size.height) { this.canvas.width = size.width; this.canvas.height = size.height; }
  }

  // 문서가 바뀌면 부른다. 재생 중이면 멈춘다(편집과 재생이 섞이지 않게).
  setProject(project: VideoProject) {
    if (project === this.project) return;
    const changedClips = project.clips !== this.project.clips || project.audio !== this.project.audio;
    this.project = project;
    this.resize();
    if (!changedClips) { if (!this.playing) this.redraw(); return; }
    if (this.playing) this.pause();
    for (const slot of this.slots) { slot.clipId = null; }
    void this.seek(Math.min(this.time, totalMs(project.clips)));
  }

  private url(mediaId: string): Promise<string | null> {
    const known = this.urls.get(mediaId);
    if (known) return Promise.resolve(known);
    let pending = this.pendingUrls.get(mediaId);
    if (!pending) {
      pending = readMedia(mediaId).then(file => {
        if (!file || this.destroyed) return null;
        const url = URL.createObjectURL(file); this.urls.set(mediaId, url); return url;
      });
      this.pendingUrls.set(mediaId, pending);
    }
    return pending;
  }

  // 슬롯에 조각을 싣고 원본 시각 sourceMs로 맞춘다. 맞춘 뒤 ready가 풀린다.
  private load(slot: Slot, clip: Clip, sourceMs: number, warm = false) {
    const video = slot.video;
    const sameMedia = slot.mediaId === clip.mediaId;
    slot.clipId = clip.id; slot.mediaId = clip.mediaId;
    this.note('load', slot, sourceMs);
    slot.ready = (async () => {
      const url = await this.url(clip.mediaId);
      if (!url || slot.clipId !== clip.id) return;
      if (!sameMedia || video.src !== url) {
        video.src = url;
        await new Promise<void>(resolve => { video.addEventListener('loadedmetadata', () => resolve(), { once: true }); video.addEventListener('error', () => resolve(), { once: true }); });
      }
      await this.seekVideo(video, sourceMs);
      // 다음 조각 준비(재생 중이 아닌 슬롯)는 소리를 끈 채 잠깐 재생했다 멈춰 재생 장치를 데워 둔다. 위치만 맞춰 두면 처음 재생할 때 0.3초쯤 늦게 시작했다.
      if (warm && slot.clipId === clip.id && !this.destroyed) {
        video.muted = true;
        await video.play().catch(() => undefined);
        await new Promise(resolve => setTimeout(resolve, 60));
        video.pause();
        if (slot.clipId === clip.id) await this.seekVideo(video, sourceMs);
      }
      this.note('ready', slot, video.currentTime * 1000);
    })();
    return slot.ready;
  }

  private seekVideo(video: HTMLVideoElement, sourceMs: number) {
    return new Promise<void>(resolve => {
      const target = sourceMs / 1000;
      if (Math.abs(video.currentTime - target) < 0.001 && video.readyState >= 2) { resolve(); return; }
      const done = () => { video.removeEventListener('seeked', done); resolve(); };
      video.addEventListener('seeked', done);
      video.currentTime = target;
      // seeked가 오지 않는 경우(같은 위치 등)를 대비한다.
      setTimeout(done, 1500);
    });
  }

  // 조각의 소리 크기와 빠르기를 <video>에 맞춘다. 원본을 새로 실으면 playbackRate가 defaultPlaybackRate로 돌아가므로 둘 다 정한다.
  private applyVolume(video: HTMLVideoElement, clip: Clip) {
    const volume = this.project.audio.originalVolume;
    video.muted = clip.muted || volume === 0;
    video.volume = volume;
    const speed = clipSpeed(clip);
    if (video.defaultPlaybackRate !== speed) video.defaultPlaybackRate = speed;
    if (video.playbackRate !== speed) video.playbackRate = speed;
  }

  private draw(video: HTMLVideoElement | null) {
    this.lastVideo = video;
    const ctx = this.canvas.getContext('2d')!;
    const { width, height } = this.canvas;
    // 비율을 유지한 채 캔버스 안에 들어가도록 맞춘다(contain, 계약 §3).
    const ready = video && video.readyState >= 2 && video.videoWidth;
    drawContain(ctx, ready ? video : null, ready ? video.videoWidth : 0, ready ? video.videoHeight : 0, width, height);
    if (totalMs(this.project.clips) > 0) this.painter?.(ctx, Math.floor(Math.min(this.time, totalMs(this.project.clips) - 1)), this.playing);
  }

  // 자막·밈을 그리는 함수를 정한다. 멈춘 상태에서 겹침 요소가 바뀌면 redraw로 다시 그린다.
  setPainter(painter: Painter | null) { this.painter = painter; if (!this.playing) this.redraw(); }
  redraw() { if (!this.destroyed) this.draw(this.lastVideo); }

  setSoundPlan(plan: (() => SoundPlan) | null) { this.soundPlan = plan; }
  // 내장 소리를 이 재생기의 AudioContext로 푼다. 처음 부르면 정지 상태의 AudioContext를 만든다(재생을 누를 때 깨운다).
  decodeAudio(bytes: ArrayBuffer) { this.audio ??= new AudioContext(); return this.audio.decodeAudioData(bytes.slice(0)); }

  private startSounds() {
    const plan = this.soundPlan?.(); const audio = this.audio;
    if (!plan || !audio) return;
    const now = audio.currentTime, t = this.time, end = now + (totalMs(this.project.clips) - t) / 1000;
    const play = (buffer: AudioBuffer, when: number, offset: number, volume: number, loop: boolean) => {
      const source = audio.createBufferSource(); source.buffer = buffer; source.loop = loop;
      const gain = audio.createGain(); gain.gain.value = volume;
      source.connect(gain).connect(audio.destination);
      source.start(when, offset); source.stop(end);
      this.sources.push(source);
    };
    if (plan.music && plan.music.volume > 0) play(plan.music.buffer, now, (t / 1000) % plan.music.buffer.duration, plan.music.volume, true);
    for (const effect of plan.effects) {
      if (effect.atMs >= t) play(effect.buffer, now + (effect.atMs - t) / 1000, 0, 1, false);
      else if (t - effect.atMs < effect.buffer.duration * 1000) play(effect.buffer, now, (t - effect.atMs) / 1000, 1, false);
    }
  }
  private stopSounds() {
    for (const source of this.sources) { try { source.stop(); } catch { /* 이미 끝났다. */ } }
    this.sources = [];
  }

  get state(): PlayerState { return { playing: this.playing, timeMs: this.time }; }

  // 멈춘 상태에서 시각 t의 프레임을 보여 준다(재생 막대 끌기).
  async seek(timeMs: number) {
    const total = totalMs(this.project.clips);
    this.time = Math.max(0, Math.min(timeMs, total));
    if (this.playing) { this.workStart = this.time; this.clockStart = this.audio?.currentTime ?? 0; this.stopSounds(); this.startSounds(); }
    this.onState(this.state);
    const at = locate(this.project.clips, Math.min(this.time, total - 1));
    if (!at) { this.slots.forEach(slot => slot.video.pause()); this.draw(null); return; }
    const slot = this.slots[this.active];
    const wanted = this.time;
    await this.load(slot, at.clip, at.sourceMs);
    if (this.destroyed || wanted !== this.time || this.playing) return;
    this.applyVolume(slot.video, at.clip);
    this.draw(slot.video);
  }

  async play() {
    const total = totalMs(this.project.clips);
    if (!total || this.playing) return;
    if (this.time >= total) this.time = 0;
    // AudioContext는 사용자의 누르기 안에서 만들어야 소리가 난다.
    this.audio ??= new AudioContext();
    await this.audio.resume().catch(() => undefined);
    const at = locate(this.project.clips, this.time)!;
    const slot = this.slots[this.active];
    if (slot.clipId !== at.clip.id) await this.load(slot, at.clip, at.sourceMs);
    else await this.seekVideo(slot.video, at.sourceMs);
    this.applyVolume(slot.video, at.clip);
    await slot.video.play().catch(() => undefined);
    this.playing = true;
    this.clockStart = this.audio.currentTime; this.workStart = this.time;
    this.startSounds();
    this.prepareNext(at.index);
    this.onState(this.state);
    this.loop();
  }

  pause() {
    this.playing = false;
    this.stopSounds();
    cancelAnimationFrame(this.frame);
    for (const slot of this.slots) slot.video.pause();
    this.onState(this.state);
  }

  private prepareNext(index: number) {
    const next = this.project.clips[index + 1];
    const other = this.slots[1 - this.active];
    if (next && other.clipId !== next.id) void this.load(other, next, next.inMs, true);
  }

  private loop = () => {
    if (!this.playing || this.destroyed) return;
    const clips = this.project.clips, total = totalMs(clips);
    this.time = this.workStart + (this.audio!.currentTime - this.clockStart) * 1000;
    if (this.time >= total) {
      this.time = total; this.pause();
      return;
    }
    const at = locate(clips, this.time)!;
    let slot = this.slots[this.active];
    if (slot.clipId !== at.clip.id) {
      // 경계: 미리 맞춰 둔 다른 슬롯으로 바꾼다. 준비가 안 됐으면 지금 싣는다.
      slot.video.pause();
      const other = this.slots[1 - this.active];
      if (other.clipId !== at.clip.id) void this.load(other, at.clip, at.sourceMs);
      this.active = 1 - this.active; slot = other;
      this.note('swap', slot, at.sourceMs);
      this.applyVolume(slot.video, at.clip);
      void slot.ready.then(() => { if (this.playing && this.slots[this.active] === slot) void slot.video.play().catch(() => undefined); });
      this.prepareNext(at.index);
    } else if (!slot.video.seeking && slot.video.readyState >= 2) {
      // 시계와 많이 어긋나면 <video>를 다시 맞춘다.
      const drift = slot.video.currentTime * 1000 - at.sourceMs;
      if (Math.abs(drift) > DRIFT_MS) { this.note('drift', slot, drift); slot.video.currentTime = at.sourceMs / 1000; }
      if (slot.video.paused) void slot.video.play().catch(() => undefined);
    }
    this.draw(slot.video);
    this.onState(this.state);
    this.frame = requestAnimationFrame(this.loop);
  };

  // 조각 c가 작품의 어디서 시작하는지(타임라인 표시용).
  clipStart(clipId: string) { const index = this.project.clips.findIndex(clip => clip.id === clipId); return index < 0 ? null : clipStarts(this.project.clips)[index]; }

  destroy() {
    this.destroyed = true; this.pause();
    for (const slot of this.slots) { slot.video.removeAttribute('src'); slot.video.load(); }
    this.holder.remove();
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    void this.audio?.close();
  }
}
