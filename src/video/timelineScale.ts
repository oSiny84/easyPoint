// 타임라인 배율과 눈금 간격. 길이 한도를 설정할 수 있게 되면서(계약 §5) 몇 시간짜리 작품도 한 화면에 맞추고,
// 눈금은 길이에 맞는 간격으로 화면에 보이는 만큼만 그린다. 배율 단위는 초당 픽셀이다.

// 짧은 작품에서 배율 막대가 내려가는 가장 작은 값과, 가장 크게 키운 값.
export const ZOOM_NEAR_MIN = 5, ZOOM_MAX = 200;
// 띠 전체 너비의 상한. 브라우저가 다룰 수 있는 요소 너비(약 3천만 px)보다 넉넉히 작게 잡는다.
// 22시간쯤부터 가장 크게 키운 배율이 200보다 낮아진다(99시간이면 초당 약 45px).
export const TRACK_MAX_PX = 16_000_000;
const HOUR_MS = 3_600_000;
// 맞춤에서 비워 두는 너비: 띠 양옆 여백(12px씩)과 끝 눈금의 글자 자리. 1시간 이상은 끝 눈금 글자(1:00:00)가 길어 더 비운다.
const fitMargin = (totalMs: number) => totalMs >= HOUR_MS ? 72 : 48;
// 배율 막대의 칸 수. 칸마다 같은 비율로 커진다(로그 눈금).
export const ZOOM_STEPS = 100;

export type ZoomRange = { min: number; max: number; fit: number };

// fit: 작품 전체가 띠에 들어가는 배율. min: 배율 막대의 가장 작은 값(긴 작품은 fit까지 내려간다).
export function zoomRange(timelineWidthPx: number, totalMs: number): ZoomRange {
  const seconds = Math.max(1, totalMs / 1000);
  const max = Math.min(ZOOM_MAX, TRACK_MAX_PX / seconds);
  const fit = Math.min(max, Math.max(1, timelineWidthPx - fitMargin(totalMs)) / seconds);
  return { min: Math.min(ZOOM_NEAR_MIN, fit), max, fit };
}

export const clampZoom = (zoom: number, range: ZoomRange) => Math.max(range.min, Math.min(range.max, zoom));

// 배율 막대의 칸(0 ~ ZOOM_STEPS) ↔ 배율. 범위가 0.2 ~ 200처럼 넓어도 어느 구간에서나 고르게 움직인다.
const ratio = (range: ZoomRange) => Math.max(range.max / range.min, 1.0001);
export const zoomAtStep = (step: number, range: ZoomRange) => clampZoom(range.min * ratio(range) ** (step / ZOOM_STEPS), range);
export const stepOfZoom = (zoom: number, range: ZoomRange) => Math.round((Math.log(clampZoom(zoom, range) / range.min) / Math.log(ratio(range))) * ZOOM_STEPS);

const TICK_STEPS = [1, 5, 10, 30, 60, 300, 600, 1800, 3600, 7200, 21_600, 43_200, 86_400];
// 눈금 사이에 필요한 너비(px). 1시간 미만 작품의 1초·5초·10초 눈금은 처음 정한 경계(초당 40px·15px)를 그대로 쓰고,
// 1시간 이상은 글자가 길어(1:00:00) 더 넓게 둔다.
const tickGap = (step: number, hours: boolean) => hours ? 64 : step === 1 ? 40 : step === 5 ? 75 : 50;

// 눈금 간격(초).
export function tickStep(pxPerSecond: number, totalMs: number) {
  const hours = totalMs >= HOUR_MS;
  return TICK_STEPS.find(step => step * pxPerSecond >= tickGap(step, hours)) ?? TICK_STEPS[TICK_STEPS.length - 1];
}

// 화면에 보이는 구간(스크롤 위치·너비, px)에 걸치는 눈금의 시각(초). 긴 작품을 크게 키워도 그리는 수는 화면 너비에 비례한다.
export function visibleTicks(pxPerSecond: number, totalMs: number, viewLeftPx: number, viewWidthPx: number, offsetPx: number) {
  const step = tickStep(pxPerSecond, totalMs), stepPx = step * pxPerSecond, pad = 120;
  const last = Math.floor(totalMs / 1000 / step);
  const from = Math.max(0, Math.floor((viewLeftPx - offsetPx - pad) / stepPx));
  const to = Math.min(last, Math.ceil((viewLeftPx + viewWidthPx - offsetPx + pad) / stepPx));
  const ticks: number[] = [];
  for (let index = from; index <= to; index++) ticks.push(index * step);
  return ticks;
}
