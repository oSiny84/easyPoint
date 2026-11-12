// 말풍선 짝(만화 계약 §4): 말풍선 그림(사진 요소)이 움직이거나 크기가 바뀔 때 짝 글씨가 놓일 자리를 정한다.
// 명령 적용(commands/comicApply.ts)과 끄는 동안의 미리 보기(comic/ComicEditor.tsx)가 같은 함수를 쓴다. DOM에 의존하지 않는다.
import { LIMITS } from './limits';
import type { ImageElement, TextElement } from './types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 100) / 100;

// before: 바뀌기 전 사진, after: 바뀐 뒤 사진. 글씨의 자리는 사진의 왼쪽 위에서 잰 거리에 배율을 곱해 다시 놓고,
// 너비도 같은 배율로 바꾼다. 글씨 크기는 그대로 둔다. 좌표·너비는 허용 범위 끝에서 멈춘다. 바뀐 것이 없으면 같은 객체를 돌려준다.
export function followBubble(before: ImageElement, after: ImageElement, text: TextElement): TextElement {
  const scale = after.width / before.width;
  const x = clamp(round(after.x + (text.x - before.x) * scale), LIMITS.xMin, LIMITS.xMax);
  const y = clamp(round(after.y + (text.y - before.y) * scale), LIMITS.yMin, LIMITS.yMax);
  const width = scale === 1 ? text.width : clamp(round(text.width * scale), LIMITS.textWidthMin, LIMITS.textWidthMax);
  if (x === text.x && y === text.y && width === text.width) return text;
  return { ...text, x, y, width };
}

// 짝 글씨를 before에서 after로 옮길 때 말풍선 그림이 놓일 자리: 같은 거리만큼 옮긴다. 아이가 말풍선 가운데(글씨)를 잡고 끌어도 말풍선이 통째로 움직이게 한다.
export function carryBubble(before: TextElement, after: TextElement, image: ImageElement): ImageElement {
  const x = clamp(round(image.x + after.x - before.x), LIMITS.xMin, LIMITS.xMax);
  const y = clamp(round(image.y + after.y - before.y), LIMITS.yMin, LIMITS.yMax);
  if (x === image.x && y === image.y) return image;
  return { ...image, x, y };
}
