// 영상 편집기 내장 효과음 12개·배경음악 4곡을 코드로 합성한다(사용자 결정 2026-11-10: 소리는 Claude가 코드로 합성).
// 외부 소리·샘플을 쓰지 않으므로 외부 권리가 없다. 결과는 48kHz 16비트 모노 WAV(영상 계약 §2·§5).
// 같은 코드는 같은 바이트를 만든다(잡음은 고정 씨앗). 한 번 배포한 ID는 지우지 않는다.
//   node scripts/make-sounds.mjs
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const SOUNDS = 'public/sounds';
const RATE = 48000;
const LICENSE = 'CanvaCraft 자체 제작 합성음(scripts/make-sounds.mjs). 외부 권리 없음';
const sha256 = data => createHash('sha256').update(data).digest('hex');
const TAU = 2 * Math.PI;

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value * 32767))), i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8); head.write('fmt ', 12);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
// 고정 씨앗 잡음(mulberry32).
function noise(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1; };
}
const tone = (seconds, fn) => Array.from({ length: Math.round(seconds * RATE) }, (_, i) => fn(i / RATE));
const envelope = (t, length, attack = 0.01) => Math.min(1, t / attack) * Math.max(0, 1 - t / length);
const hz = semitone => 261.63 * 2 ** (semitone / 12); // 0 = 가운데 도(C4)

// 한 번 쓰는 소리 조각을 버퍼에 더한다. wrap이면 끝을 넘은 꼬리를 앞에 더한다(반복 음악의 이음매).
function add(buffer, startSec, seconds, fn, wrap = false) {
  const start = Math.round(startSec * RATE), length = Math.round(seconds * RATE);
  for (let i = 0; i < length; i++) {
    let at = start + i;
    if (at >= buffer.length) { if (!wrap) break; at %= buffer.length; }
    buffer[at] += fn(i / RATE);
  }
}
const normalize = (buffer, peak) => { const max = buffer.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1; return Array.from(buffer, v => (v / max) * peak); };

// ---- 효과음(3초 이내). 앞의 셋은 V6 자리 표시 때와 같은 식이라 바이트가 같다. ----
function whoosh() {
  const rnd = noise(11); let low = 0, low2 = 0;
  return tone(0.7, t => { const k = t / 0.7; const cut = 0.02 + 0.25 * Math.sin(Math.PI * k); low += cut * (rnd() - low); low2 += cut * (low - low2); return 1.6 * Math.sin(Math.PI * k) ** 2 * (low - low2); });
}
function clap() {
  const rnd = noise(23); const out = new Float32Array(Math.round(0.6 * RATE)); let low = 0;
  for (const at of [0, 0.22]) add(out, at, 0.18, t => { const v = rnd(); low += 0.3 * (v - low); return 0.7 * Math.exp(-t * 28) * (v - low); });
  return out;
}
function fanfare() {
  const out = new Float32Array(Math.round(1.3 * RATE));
  const brass = (f, len) => t => 0.2 * Math.min(1, t / 0.02) * Math.max(0, 1 - Math.max(0, t - len + 0.08) / 0.08) * [1, 0.6, 0.4, 0.25, 0.15].reduce((s, a, n) => s + a * Math.sin(TAU * f * (n + 1) * t), 0);
  [[12, 0, 0.14], [16, 0.15, 0.14], [19, 0.3, 0.14], [24, 0.45, 0.8]].forEach(([note, at, len]) => add(out, at, len, brass(hz(note), len)));
  return out;
}
function sparkle() {
  const rnd = noise(37); const out = new Float32Array(Math.round(1.0 * RATE));
  for (let i = 0; i < 14; i++) { const f = 2200 + 1800 * (rnd() * 0.5 + 0.5); add(out, i * 0.05 + 0.02 * rnd(), 0.35, t => 0.18 * Math.exp(-t * 14) * Math.sin(TAU * f * t)); }
  return out;
}
function magic() {
  const out = new Float32Array(Math.round(1.1 * RATE)); const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];
  steps.forEach((note, i) => add(out, i * 0.05, 0.5, t => 0.16 * Math.exp(-t * 7) * (Math.sin(TAU * hz(note + 12) * t) + 0.3 * Math.sin(TAU * hz(note + 24) * t))));
  return out;
}
function sadTrombone() {
  const out = new Float32Array(Math.round(2.4 * RATE));
  const horn = (f, len, bend) => t => { const g = Math.min(1, t / 0.04) * Math.max(0, 1 - Math.max(0, t - len + 0.1) / 0.1); const vib = bend ? 1 + 0.012 * Math.sin(TAU * 6 * t) * Math.min(1, t / 0.3) : 1; return 0.18 * g * [1, 0.5, 0.35, 0.2].reduce((s, a, n) => s + a * Math.sin(TAU * f * vib * (n + 1) * t), 0); };
  [[-2, 0, 0.42], [-3, 0.45, 0.42], [-4, 0.9, 0.42], [-5, 1.35, 1.0]].forEach(([note, at, len], i) => add(out, at, len, horn(hz(note), len, i === 3)));
  return out;
}
const SFX = {
  'sfx-boing': { label: '띠용', samples: () => tone(0.6, t => 0.5 * envelope(t, 0.6) * Math.sin(2 * Math.PI * (180 + 420 * Math.exp(-t * 6)) * t)) },
  'sfx-ding': { label: '딩동', samples: () => tone(1.2, t => 0.4 * envelope(t, 1.2) * (Math.sin(2 * Math.PI * 880 * t) + (t > 0.35 ? Math.sin(2 * Math.PI * 660 * t) : 0))) },
  'sfx-pop': { label: '뽁', samples: () => tone(0.25, t => 0.6 * envelope(t, 0.25, 0.002) * Math.sin(2 * Math.PI * (900 - 2400 * t) * t)) },
  'sfx-whoosh': { label: '휘익', samples: () => normalize(whoosh(), 0.6) },
  'sfx-clap': { label: '짝짝', samples: () => normalize(clap(), 0.7) },
  'sfx-zap': { label: '뿅', samples: () => { let phase = 0; return tone(0.35, t => { phase += TAU * (400 + 1400 * (t / 0.35) ** 1.5) / RATE; return 0.45 * envelope(t, 0.35, 0.003) * Math.sin(phase); }); } },
  'sfx-thud': { label: '쿵', samples: () => { const rnd = noise(5); let phase = 0; return tone(0.6, t => { phase += TAU * (40 + 70 * Math.exp(-t * 12)) / RATE; return 0.6 * Math.exp(-t * 7) * Math.sin(phase) + 0.2 * Math.exp(-t * 90) * rnd(); }); } },
  'sfx-fanfare': { label: '빰빠밤', samples: () => normalize(fanfare(), 0.6) },
  'sfx-buzzer': { label: '땡', samples: () => tone(0.6, t => 0.22 * envelope(t, 0.6, 0.005) * [1, 3, 5, 7].reduce((s, n) => s + Math.sin(TAU * 150 * n * t) / n + Math.sin(TAU * 156 * n * t) / n, 0)) },
  'sfx-sparkle': { label: '반짝', samples: () => normalize(sparkle(), 0.5) },
  'sfx-magic': { label: '뾰로롱', samples: () => normalize(magic(), 0.55) },
  'sfx-sad': { label: '아쉬워(뿌우)', samples: () => normalize(sadTrombone(), 0.6) },
};

// ---- 배경음악: 8마디 반복곡. 박자에 맞춘 악보를 합성하고 끝을 넘은 꼬리는 앞에 더해 반복 이음매를 없앤다. ----
const INSTRUMENTS = {
  // 각 악기는 (주파수, 음 길이) → 시각 t의 값. 길이 뒤 release만큼 더 울린다.
  flute: { release: 0.15, fn: (f, len) => t => { const g = Math.min(1, t / 0.06) * (t < len ? 1 : Math.max(0, 1 - (t - len) / 0.15)); const vib = 1 + 0.004 * Math.sin(TAU * 5 * t) * Math.min(1, t / 0.3); return g * (Math.sin(TAU * f * vib * t) + 0.15 * Math.sin(TAU * 2 * f * t)); } },
  bell: { release: 0.6, fn: f => t => Math.exp(-t * 3.5) * (Math.sin(TAU * f * t) + 0.4 * Math.exp(-t * 4) * Math.sin(TAU * 2 * f * t) + 0.15 * Math.sin(TAU * 3.01 * f * t)) },
  square: { release: 0.03, fn: (f, len) => t => { const g = Math.min(1, t / 0.005) * (t < len * 0.6 ? 1 : Math.max(0, 1 - (t - len * 0.6) / 0.03)); return g * [1, 3, 5, 7, 9].reduce((s, n) => s + Math.sin(TAU * f * n * t) / n, 0); } },
  brass: { release: 0.08, fn: (f, len) => t => { const g = Math.min(1, t / 0.03) * (t < len ? 1 - 0.2 * Math.min(1, t / 0.4) : Math.max(0, 0.8 - (t - len) / 0.1)); return g * [1, 0.7, 0.5, 0.35, 0.25, 0.15, 0.1].reduce((s, a, n) => s + a * Math.sin(TAU * f * (n + 1) * t), 0); } },
  pluck: { release: 0.4, fn: f => t => Math.exp(-t * 6) * (Math.sin(TAU * f * t) + 0.4 * Math.sin(TAU * 2 * f * t) + 0.2 * Math.sin(TAU * 3 * f * t)) },
  bass: { release: 0.05, fn: (f, len) => t => { const g = Math.min(1, t / 0.01) * (t < len ? Math.exp(-t * 1.5) : Math.max(0, 1 - (t - len) / 0.05) * Math.exp(-len * 1.5)); return g * (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * 2 * f * t) + 0.1 * Math.sin(TAU * 3 * f * t)); } },
};
function drum(kind, rnd) {
  if (kind === 'kick') { let phase = 0; return { seconds: 0.3, fn: t => { phase += TAU * (45 + 80 * Math.exp(-t * 25)) / RATE; return Math.exp(-t * 14) * Math.sin(phase); } }; }
  if (kind === 'snare') { return { seconds: 0.2, fn: t => Math.exp(-t * 22) * (0.8 * rnd() + 0.4 * Math.sin(TAU * 190 * t)) }; }
  if (kind === 'hat') { let low = 0; return { seconds: 0.06, fn: t => { const v = rnd(); low += 0.5 * (v - low); return Math.exp(-t * 70) * (v - low); } }; }
  if (kind === 'block') return { seconds: 0.08, fn: t => Math.exp(-t * 55) * Math.sin(TAU * 1250 * t) };
  if (kind === 'tom') { let phase = 0; return { seconds: 0.35, fn: t => { phase += TAU * (90 + 60 * Math.exp(-t * 15)) / RATE; return Math.exp(-t * 9) * Math.sin(phase); } }; }
  throw new Error(kind);
}
// 화음: 반주용 세 음(가운데 도 기준 반음), 베이스 근음.
const CHORDS = {
  C: { tones: [0, 4, 7], root: -24 }, G: { tones: [-1, 2, 7], root: -29 }, G7: { tones: [-1, 2, 5, 7], root: -29 }, Am: { tones: [0, 4, 9], root: -27 },
  F: { tones: [0, 5, 9], root: -31 }, Dm: { tones: [2, 5, 9], root: -22 }, E: { tones: [-1, 4, 8], root: -32 },
};

function song({ bpm, chords, melody, lead, arp, bass, drums, gains }) {
  const beat = 60 / bpm, bars = chords.length, seconds = bars * 4 * beat;
  const out = new Float32Array(Math.round(seconds * RATE));
  const rnd = noise(99);
  const play = (instrument, note, at, beats, gain) => { const item = INSTRUMENTS[instrument]; const len = beats * beat; const voice = item.fn(hz(note), len); add(out, at, len + item.release, t => gain * voice(t), true); };
  // 멜로디: [반음 또는 null(쉼), 박자 수]
  let at = 0;
  for (const bar of melody) for (const [note, beats] of bar) { if (note !== null) play(lead, note, at, beats, gains.lead); at += beats * beat; }
  chords.forEach((name, b) => {
    const chord = CHORDS[name], barAt = b * 4 * beat;
    // 반주: 8분음표로 화음을 오르내린다.
    if (arp) { const order = [...chord.tones, chord.tones[1] + 12, ...chord.tones.slice(1).reverse()]; for (let i = 0; i < 8; i++) play(arp, order[i % order.length], barAt + i * beat / 2, 0.5, gains.arp); }
    // 베이스 무늬: 박마다 [근음에서 반음 차이 또는 null]
    bass.pattern.forEach((step, i) => { if (step !== null) play('bass', chord.root + step, barAt + i * bass.step * beat, bass.step * 0.9, gains.bass); });
    for (const [kind, steps] of Object.entries(drums ?? {})) {
      const pattern = typeof steps === 'function' ? steps(b) : steps;
      pattern.forEach(position => { const hit = drum(kind, rnd); add(out, barAt + position * beat, hit.seconds, t => gains[kind] * hit.fn(t), true); });
    }
  });
  // 곡마다 크기가 비슷하게 RMS를 맞추고, 튀는 북소리만 부드럽게 눌러 0.9를 넘지 않게 한다.
  const rms = Math.sqrt(out.reduce((s, v) => s + v * v, 0) / out.length) || 1;
  return Array.from(out, v => 0.9 * Math.tanh((v * 0.16) / rms / 0.9));
}

const MUSIC = {
  'music-happy': { label: '신나는 노래', score: {
    bpm: 120, chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'], lead: 'bell', arp: 'pluck',
    melody: [
      [[4, 0.5], [7, 0.5], [12, 1], [11, 0.5], [12, 0.5], [7, 1]], [[7, 0.5], [5, 0.5], [4, 0.5], [2, 0.5], [7, 2]],
      [[9, 0.5], [12, 0.5], [16, 1], [14, 0.5], [12, 0.5], [9, 1]], [[9, 1], [7, 0.5], [5, 0.5], [9, 2]],
      [[4, 0.5], [7, 0.5], [12, 1], [14, 0.5], [16, 0.5], [12, 1]], [[14, 0.5], [12, 0.5], [11, 0.5], [7, 0.5], [11, 2]],
      [[9, 0.5], [12, 0.5], [17, 1], [16, 0.5], [14, 0.5], [12, 1]], [[14, 1], [11, 1], [7, 1], [null, 1]],
    ],
    bass: { step: 1, pattern: [0, 12, 7, 12] }, drums: { kick: [0, 2], snare: [1, 3], hat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] },
    gains: { lead: 0.32, arp: 0.07, bass: 0.3, kick: 0.6, snare: 0.18, hat: 0.08 } } },
  'music-calm': { label: '잔잔한 노래', score: {
    bpm: 80, chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G'], lead: 'flute', arp: 'pluck',
    melody: [
      [[16, 2], [14, 1], [12, 1]], [[12, 2], [9, 2]], [[9, 1], [12, 1], [17, 2]], [[14, 3], [null, 1]],
      [[16, 2], [19, 1], [16, 1]], [[12, 3], [null, 1]], [[14, 1], [17, 1], [21, 1], [17, 1]], [[19, 2], [14, 2]],
    ],
    bass: { step: 2, pattern: [0, 7] },
    gains: { lead: 0.28, arp: 0.08, bass: 0.22 } } },
  'music-funny': { label: '장난스러운 노래', score: {
    bpm: 112, chords: ['C', 'G7', 'C', 'G7', 'F', 'C', 'G7', 'C'], lead: 'square', arp: null,
    melody: [
      [[0, 0.5], [4, 0.5], [7, 0.5], [4, 0.5], [0, 0.5], [null, 0.5], [-5, 1]], [[-1, 0.5], [2, 0.5], [5, 0.5], [2, 0.5], [-1, 0.5], [null, 0.5], [-5, 1]],
      [[0, 0.5], [4, 0.5], [7, 0.5], [12, 0.5], [11, 0.5], [12, 0.5], [7, 1]], [[5, 0.5], [4, 0.5], [2, 0.5], [-1, 0.5], [2, 1], [null, 1]],
      [[5, 0.5], [9, 0.5], [12, 0.5], [9, 0.5], [5, 0.5], [null, 0.5], [0, 1]], [[4, 0.5], [7, 0.5], [12, 0.5], [7, 0.5], [4, 0.5], [null, 0.5], [0, 1]],
      [[2, 0.25], [3, 0.25], [4, 0.5], [5, 0.5], [7, 0.5], [11, 1], [null, 1]], [[12, 0.5], [null, 0.5], [0, 0.5], [null, 0.5], [12, 1], [null, 1]],
    ],
    bass: { step: 1, pattern: [0, null, 7, null] }, drums: { block: [1, 3], hat: [1.5, 3.5] },
    gains: { lead: 0.14, bass: 0.34, block: 0.18, hat: 0.06 } } },
  'music-adventure': { label: '모험 노래', score: {
    bpm: 100, chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'E'], lead: 'brass', arp: 'pluck',
    melody: [
      [[9, 1], [12, 0.5], [16, 0.5], [14, 1], [12, 1]], [[12, 1.5], [9, 0.5], [17, 2]], [[16, 0.5], [14, 0.5], [12, 1], [7, 1], [12, 1]], [[11, 1.5], [14, 0.5], [19, 2]],
      [[21, 1], [19, 0.5], [16, 0.5], [17, 1], [16, 1]], [[12, 1], [17, 1], [21, 2]], [[19, 1], [17, 0.5], [14, 0.5], [11, 1], [14, 1]], [[16, 2], [11, 1], [8, 1]],
    ],
    bass: { step: 0.5, pattern: [0, 0, 12, 0, 0, 0, 12, 0] },
    drums: { kick: [0, 1.5, 2], snare: [1, 3], hat: [0.5, 1.5, 2.5, 3.5], tom: bar => (bar === 7 ? [2.5, 3, 3.5] : []) },
    gains: { lead: 0.1, arp: 0.05, bass: 0.26, kick: 0.6, snare: 0.2, hat: 0.07, tom: 0.4 } } },
};

await fs.mkdir(SOUNDS, { recursive: true });
const manifest = { schemaVersion: 1, sfx: [], music: [] };
for (const [group, table, make] of [['sfx', SFX, item => item.samples()], ['music', MUSIC, item => song(item.score)]]) {
  for (const [id, item] of Object.entries(table)) {
    const samples = make(item);
    const data = wav(samples);
    const file = `${id}.wav`;
    await fs.writeFile(path.join(SOUNDS, file), data);
    manifest[group].push({ id, label: item.label, file, durationMs: Math.round((samples.length / RATE) * 1000), sha256: sha256(data), license: LICENSE });
  }
}
await fs.writeFile(path.join(SOUNDS, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`효과음 ${manifest.sfx.length}개, 음악 ${manifest.music.length}곡: ${manifest.music.map(item => `${item.label} ${(item.durationMs / 1000).toFixed(1)}초`).join(', ')}`);
