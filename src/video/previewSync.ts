// 미리보기 <video>가 재생 시계에서 벗어났는지 판단한다(영상 계약 §8 미리보기). 화면 없이 계산만 한다.
// <video>는 재생을 시작하거나 위치를 옮긴 직후 잠깐 멈춰 있다가 움직인다(재생 장치 준비 시간. 블루투스 이어폰처럼 소리가 늦게 나가는 장치에서는 0.3초를 넘는다).
// 이 시작 지연은 위치를 다시 맞춰도 똑같이 생긴다. 그래서 어긋남으로 세지 않고 기준으로 삼고, 기준에서 DRIFT_MS 넘게 더 벗어날 때만 다시 맞춘다.
// 모든 값은 작품 시간(빠르기로 나눈 값)으로 잰다. 원본 시간으로 재면 2배 조각은 같은 지연이 2배로 보인다.

// 기준에서 이보다 많이 벗어나면 <video> 위치를 다시 맞춘다.
export const DRIFT_MS = 150;
// 시작한 자리에서 이만큼 나아가면 재생이 시작된 것으로 보고 그때의 지연을 기준으로 삼는다.
export const STARTED_MS = 100;
// 이 시간이 지나도록 시작하지 못하면 위치를 다시 맞춰 본다.
export const START_TIMEOUT_MS = 2000;

// since: 재생을 시작했거나 위치를 다시 맞춘 시각. fromMs: 그 뒤 처음 본 원본 시각. lagMs: 기준 지연(정해지기 전 null).
export type SyncState = { since: number; fromMs: number | null; lagMs: number | null };
export const newSync = (now: number): SyncState => ({ since: now, fromMs: null, lagMs: null });

// videoMs는 <video>의 원본 시각, wantedMs는 시계가 가리키는 원본 시각이다. 'reseek'을 받으면 부른 쪽이 위치를 옮기고 newSync로 다시 시작한다.
export function trackSync(sync: SyncState, now: number, videoMs: number, wantedMs: number, speed: number): 'starting' | 'ok' | 'reseek' {
  sync.fromMs ??= videoMs;
  const behind = (wantedMs - videoMs) / speed;
  if (sync.lagMs === null) {
    if ((videoMs - sync.fromMs) / speed >= STARTED_MS) { sync.lagMs = behind; return 'ok'; }
    return now - sync.since > START_TIMEOUT_MS ? 'reseek' : 'starting';
  }
  return Math.abs(behind - sync.lagMs) > DRIFT_MS ? 'reseek' : 'ok';
}
