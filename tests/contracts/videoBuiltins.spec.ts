import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { checkMemeItem, checkSoundItem } from '../../src/video/builtins';

// 영상 계약 §2·§5 내장 목록: manifest 형식, 파일 해시, 상한(스티커 1~5초·512² 이하·투명, 밈 영상 1~10초·1280×720 이하, 효과음 3초, 음악 5분), ID 중복 금지.
const memes = JSON.parse(fs.readFileSync('public/memes/manifest.json', 'utf8'));
const sounds = JSON.parse(fs.readFileSync('public/sounds/manifest.json', 'utf8'));
const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('밈·소리 목록의 모든 항목이 상한을 지키고 파일 해시가 맞다', () => {
  const sfx = new Set<string>(sounds.sfx.map((item: any) => item.id));
  for (const item of sounds.sfx) { expect(checkSoundItem(item, 3000), item.id).toBe(true); expect(sha(path.join('public/sounds', item.file)), item.id).toBe(item.sha256); }
  for (const item of sounds.music) { expect(checkSoundItem(item, 300_000), item.id).toBe(true); expect(sha(path.join('public/sounds', item.file)), item.id).toBe(item.sha256); }
  for (const item of memes.assets) { expect(checkMemeItem(item, sfx), item.id).toBe(true); expect(sha(path.join('public/memes', item.file)), item.id).toBe(item.sha256); }
  const ids = [...memes.assets, ...sounds.sfx, ...sounds.music].map((item: any) => item.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(memes.assets.some((item: any) => item.kind === 'sticker')).toBe(true);
  expect(memes.assets.some((item: any) => item.kind === 'clip')).toBe(true);
});

test('스티커는 투명 채널이 있는 애니메이션 WebP다', () => {
  for (const item of memes.assets.filter((asset: any) => asset.kind === 'sticker')) {
    const bytes = fs.readFileSync(path.join('public/memes', item.file));
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(bytes.subarray(8, 16).toString('latin1')).toBe('WEBPVP8X');
    // VP8X 표시: 알파(0x10)와 애니메이션(0x02).
    expect(bytes[20] & 0x12).toBe(0x12);
  }
});

test('소리 파일은 48kHz WAV다', () => {
  for (const item of [...sounds.sfx, ...sounds.music]) {
    const bytes = fs.readFileSync(path.join('public/sounds', item.file));
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(bytes.readUInt32LE(24)).toBe(48000);
  }
});

test('틀린 항목은 쓸 수 없다', () => {
  const good = memes.assets[0]; const sfx = new Set<string>(['sfx-pop']);
  expect(checkMemeItem({ ...good, durationMs: 6000 }, sfx)).toBe(false);
  expect(checkMemeItem({ ...good, width: 600 }, sfx)).toBe(false);
  expect(checkMemeItem({ ...good, soundId: 'no-such' }, sfx)).toBe(false);
  expect(checkMemeItem({ ...good, id: 'Bad Id' }, sfx)).toBe(false);
  expect(checkMemeItem({ ...good, file: '../x.webp' }, sfx)).toBe(false);
  expect(checkSoundItem({ ...sounds.sfx[0], durationMs: 3001 }, 3000)).toBe(false);
});
