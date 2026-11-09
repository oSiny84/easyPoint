// 내장 밈·효과음·음악 목록(영상 계약 §2). 문서는 ID로만 참조한다. 목록은 앱 파일이며 슬라이드 library.ts와 같은 방식으로 읽는다:
// manifest를 받고, 항목별로 형식·상한을 확인해 틀린 항목만 쓸 수 없게 하며, 실제 파일은 쓸 때 통째로 받아 SHA-256을 확인한다.
// 실행 파일 서버는 Range 요청을 지원하지 않으므로 파일은 fetch()로 통째로 받아 Blob URL로 쓴다(계약 §8).
import type { BuiltinCatalog, MemeInfo, MemeKind } from '../domain/videoTypes';

export type MemeCategory = 'cat' | 'dog' | 'reaction' | 'effect';
export type MemeItem = MemeInfo & { label: string; category: MemeCategory; tags: string[]; file: string; fps: number; hasSound: boolean; soundId: string | null; sha256: string; license: string; hidden?: boolean };
export type SoundItem = { id: string; label: string; file: string; durationMs: number; sha256: string; license: string; hidden?: boolean };
export type Builtins = { memes: MemeItem[]; sfx: SoundItem[]; music: SoundItem[]; catalog: BuiltinCatalog };

const ID = /^[a-z0-9-]{1,64}$/, HASH = /^[0-9a-f]{64}$/, FILE = /^[a-z0-9-]+\.(webp|webm|wav)$/;
const CATEGORIES: readonly string[] = ['cat', 'dog', 'reaction', 'effect'];
const url = (path: string) => `${import.meta.env?.BASE_URL ?? '/'}${path.replace(/^\//, '')}`;
const int = (value: unknown, min: number, max: number) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

// 계약 §5 내장 파일 상한. 어기는 항목은 목록에서 뺀다(문서가 그 ID를 쓰면 ASSET_MISSING으로 열리지 않는다).
export function checkMemeItem(item: MemeItem, sfx: ReadonlySet<string>): boolean {
  if (!item || !ID.test(item.id) || !HASH.test(item.sha256) || typeof item.file !== 'string' || !FILE.test(item.file) || typeof item.label !== 'string') return false;
  if (!CATEGORIES.includes(item.category) || !Array.isArray(item.tags) || typeof item.hasSound !== 'boolean') return false;
  if (item.soundId !== null && !sfx.has(item.soundId)) return false;
  const kind: MemeKind = item.kind;
  if (kind === 'sticker') return item.file.endsWith('.webp') && int(item.durationMs, 1000, 5000) && int(item.width, 1, 512) && int(item.height, 1, 512) && Number.isFinite(item.fps) && item.fps > 0;
  if (kind === 'clip') return item.file.endsWith('.webm') && int(item.durationMs, 1000, 10_000) && int(item.width, 1, 1280) && int(item.height, 1, 720);
  return false;
}
export function checkSoundItem(item: SoundItem, maxMs: number): boolean {
  return !!item && ID.test(item.id) && HASH.test(item.sha256) && typeof item.file === 'string' && item.file.endsWith('.wav') && FILE.test(item.file) && typeof item.label === 'string' && int(item.durationMs, 1, maxMs);
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(url(path));
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<T>;
}

let loading: Promise<Builtins> | undefined;
export function loadBuiltins(): Promise<Builtins> {
  loading ??= (async () => {
    const [memeFile, soundFile] = await Promise.all([fetchJson<{ assets: MemeItem[] }>('/memes/manifest.json'), fetchJson<{ sfx: SoundItem[]; music: SoundItem[] }>('/sounds/manifest.json')]);
    const sfx = (soundFile.sfx ?? []).filter(item => checkSoundItem(item, 3000));
    const music = (soundFile.music ?? []).filter(item => checkSoundItem(item, 300_000));
    const sfxIds = new Set(sfx.map(item => item.id));
    const memes = (memeFile.assets ?? []).filter(item => checkMemeItem(item, sfxIds));
    const byId = new Map(memes.map(item => [item.id, item]));
    const musicIds = new Set(music.map(item => item.id));
    // 숨긴 항목도 문서 검사에는 쓴다(저장된 작품이 그 ID를 참조할 수 있다). 패널에서만 뺀다.
    const catalog: BuiltinCatalog = { meme: id => { const item = byId.get(id); return item && { id: item.id, kind: item.kind, width: item.width, height: item.height, durationMs: item.durationMs }; }, hasMusic: id => musicIds.has(id) };
    return { memes, sfx, music, catalog };
  })().catch(error => { loading = undefined; throw error; });
  return loading;
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
const MIME: Record<string, string> = { webp: 'image/webp', webm: 'video/webm', wav: 'audio/wav' };
const blobs = new Map<string, Promise<Blob | null>>();

// 파일을 통째로 받아 해시를 확인한 Blob. 틀리면 null이고 그 항목은 쓸 수 없다.
export function builtinBlob(folder: 'memes' | 'sounds', item: { file: string; sha256: string }): Promise<Blob | null> {
  const key = `${folder}/${item.file}`;
  let pending = blobs.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const response = await fetch(url(`/${key}`));
        if (!response.ok) return null;
        const bytes = await response.arrayBuffer();
        if (hex(await crypto.subtle.digest('SHA-256', bytes)) !== item.sha256) return null;
        return new Blob([bytes], { type: MIME[item.file.split('.').pop()!] });
      } catch { return null; }
    })();
    pending.then(value => { if (!value) blobs.delete(key); }, () => blobs.delete(key));
    blobs.set(key, pending);
  }
  return pending;
}
export const builtinUrl = (folder: 'memes' | 'sounds', file: string) => url(`/${folder}/${file}`);
