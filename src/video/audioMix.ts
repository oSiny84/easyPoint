// 내보내기 소리 섞기(영상 계약 §8). Worker 안에서 돈다(Worker에는 OfflineAudioContext가 없어 직접 더한다, V2 결정).
// 소리마다 앞으로만 읽는 판독기를 두고 48kHz 스테레오 Float32로 바꿔(다른 표본률은 선형 보간으로 다시 표본화) 조금씩 더한다.
// 소리 버퍼 전체를 메모리에 두지 않는다. 합은 −1~1로 자르고 압축기는 쓰지 않는다.
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';

export const MIX_RATE = 48000;

// 원본 시각 startS부터 소리를 48kHz 스테레오로 앞으로만 내준다. 소리가 끝나면 0(무음)을 내준다.
export class AudioReader {
  private iterator: AsyncIterator<import('mediabunny').AudioSample> | null = null;
  private input: Input | null = null;
  private left = new Float32Array(0); private right = new Float32Array(0);
  // 버퍼 안의 다음 출력 위치(입력 표본 단위, 소수).
  private position = 0;
  private rate = MIX_RATE;
  private skip = 0;
  private ended = false;
  private constructor(private source: Blob, private startS: number, private endS: number) {}

  static async open(source: Blob, startS = 0, endS = Infinity) {
    const reader = new AudioReader(source, startS, endS);
    reader.input = new Input({ formats: ALL_FORMATS, source: new BlobSource(source) });
    const track = await reader.input.getPrimaryAudioTrack();
    if (!track) { reader.ended = true; return reader; }
    reader.iterator = new AudioSampleSink(track).samples(startS, Number.isFinite(endS) ? endS : undefined)[Symbol.asyncIterator]();
    return reader;
  }

  // 다음 표본 묶음을 버퍼 뒤에 붙인다. 처음 묶음은 startS보다 앞선 부분을 버린다.
  private async pull() {
    if (this.ended || !this.iterator) { this.ended = true; return; }
    const step = await this.iterator.next();
    if (step.done) { this.ended = true; return; }
    const sample = step.value;
    try {
      const frames = sample.numberOfFrames, channels = sample.numberOfChannels;
      if (this.left.length === 0 && this.position === 0 && this.skip === 0) {
        this.rate = sample.sampleRate;
        this.skip = Math.max(0, Math.round((this.startS - sample.timestamp) * sample.sampleRate));
      }
      const l = new Float32Array(frames), r = new Float32Array(frames);
      sample.copyTo(l, { planeIndex: 0, format: 'f32-planar' });
      if (channels > 1) sample.copyTo(r, { planeIndex: 1, format: 'f32-planar' }); else r.set(l);
      let from = 0;
      if (this.skip > 0) { from = Math.min(frames, this.skip); this.skip -= from; }
      // 이미 쓴 앞부분은 버리고 남은 표본 뒤에 붙인다.
      const keep = Math.floor(this.position);
      const nextLeft = new Float32Array(this.left.length - keep + frames - from), nextRight = new Float32Array(nextLeft.length);
      nextLeft.set(this.left.subarray(keep)); nextRight.set(this.right.subarray(keep));
      nextLeft.set(l.subarray(from), this.left.length - keep); nextRight.set(r.subarray(from), this.left.length - keep);
      this.left = nextLeft; this.right = nextRight; this.position -= keep;
    } finally { sample.close(); }
  }

  // 48kHz 표본 count개를 out(왼쪽·오른쪽)의 offset부터 gain을 곱해 더한다.
  async addTo(outLeft: Float32Array, outRight: Float32Array, offset: number, count: number, gain: number) {
    const ratio = this.rate / MIX_RATE;
    for (let i = 0; i < count; i++) {
      const at = this.position;
      while (!this.ended && Math.floor(at) + 1 >= this.left.length) await this.pull();
      const index = Math.floor(at), fraction = at - index;
      if (index < this.left.length) {
        const nextIndex = Math.min(index + 1, this.left.length - 1);
        outLeft[offset + i] += gain * (this.left[index] + (this.left[nextIndex] - this.left[index]) * fraction);
        outRight[offset + i] += gain * (this.right[index] + (this.right[nextIndex] - this.right[index]) * fraction);
      }
      this.position += ratio;
    }
  }

  close() { void this.iterator?.return?.(); this.input?.dispose(); this.iterator = null; this.input = null; }
}

// 시작부터 끝까지 반복하며 읽는다(밈 영상 소리, 배경음악). 끝나면 처음부터 새 판독기를 연다.
export class LoopReader {
  private reader: AudioReader | null = null;
  private played = 0;
  private constructor(private source: Blob, private lengthFrames: number) {}
  static create(source: Blob, lengthMs: number) { return new LoopReader(source, Math.max(1, Math.round((lengthMs / 1000) * MIX_RATE))); }

  // 반복 안의 위치(48kHz 표본)를 정해 둔다. 처음 쓸 때만 부른다.
  async seek(frame: number) {
    this.reader?.close();
    this.played = ((frame % this.lengthFrames) + this.lengthFrames) % this.lengthFrames;
    this.reader = await AudioReader.open(this.source, this.played / MIX_RATE);
  }
  async addTo(outLeft: Float32Array, outRight: Float32Array, offset: number, count: number, gain: number) {
    let done = 0;
    while (done < count) {
      if (!this.reader) await this.seek(0);
      const room = Math.min(count - done, this.lengthFrames - this.played);
      await this.reader!.addTo(outLeft, outRight, offset + done, room, gain);
      done += room; this.played += room;
      if (this.played >= this.lengthFrames) { this.reader!.close(); this.reader = null; this.played = 0; }
    }
  }
  close() { this.reader?.close(); this.reader = null; }
}
