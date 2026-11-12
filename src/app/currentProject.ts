// 새로고침하면 쓰던 작품으로 돌아오기 위한 기억 값(영상 계약 §6). 탭마다 따로인 sessionStorage에 둔다.
// 값은 JSON {"kind":"slide"|"video"|"animation","id":"<uuid>"}다. JSON이 아닌 옛 값은 슬라이드 작품 id로 읽는다.
// 모르는 종류는 null로 읽어 시작 화면으로 간다(옛 판이 새 종류의 값을 만났을 때도 같다).
const CURRENT_KEY = 'canvacraft.current-project';

export type Remembered = { kind: 'slide' | 'video' | 'animation'; id: string };

export function remember(value: Remembered | null) {
  try {
    if (value) sessionStorage.setItem(CURRENT_KEY, JSON.stringify(value)); else sessionStorage.removeItem(CURRENT_KEY);
  } catch { /* 새로고침 복원만 못 할 뿐이다. */ }
}

export function remembered(): Remembered | null {
  let raw: string | null;
  try { raw = sessionStorage.getItem(CURRENT_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Remembered> | null;
    if (value && typeof value === 'object' && (value.kind === 'slide' || value.kind === 'video' || value.kind === 'animation') && typeof value.id === 'string') return { kind: value.kind, id: value.id };
    return null;
  } catch {
    return { kind: 'slide', id: raw };
  }
}
