// 애니메이션 계약 §4의 편집 명령. 슬라이드 명령 18개는 슬라이드의 applyCommand에 그대로 맡기고 holds만 맞춘다.
// 새 명령은 빠르기·음악(setAnimation)과 길게 보이기(setFrameHold) 둘이다. DOM에 의존하지 않는다.
import type { AnimationContent, AnimationFps, FrameHold, Holds, MusicVolume } from '../domain/animationTypes';
import { isAnimationFps, isHold, isMusicId, isMusicVolume } from '../domain/animationValidate';
import { fail, type Failure } from '../domain/types';
import { applyCommand, type ApplyContext, type Command } from './apply';

export type AnimationCommand = Command
  | { type: 'setAnimation'; fps?: AnimationFps; musicId?: string | null; musicVolume?: MusicVolume }
  | { type: 'setFrameHold'; slideId: string; hold: 1 | FrameHold };

export type AnimationApplied = { ok: true; content: AnimationContent; slideId: string | null; changed: boolean };
const invalid = (message: string) => fail('INVALID_VALUE', message);

// 명령 뒤 holds: 복사한 장은 원래 장의 값을 이어받고, 없어진 장의 값은 뺀다. 바뀐 것이 없으면 같은 객체를 돌려준다.
function reconcileHolds(holds: Holds, command: Command, resultSlideId: string | null, slideIds: ReadonlySet<string>): Holds {
  let next = holds;
  if (command.type === 'duplicateSlide' && resultSlideId && holds[command.slideId]) next = { ...next, [resultSlideId]: holds[command.slideId] };
  if (Object.keys(next).some(id => !slideIds.has(id))) next = Object.fromEntries(Object.entries(next).filter(([id]) => slideIds.has(id)));
  return next;
}

export function applyAnimationCommand(content: AnimationContent, command: AnimationCommand, context: ApplyContext): AnimationApplied | Failure {
  if (command.type === 'setAnimation') {
    const patch: Partial<Pick<AnimationContent, 'fps' | 'musicId' | 'musicVolume'>> = {};
    if (command.fps !== undefined) { if (!isAnimationFps(command.fps)) return invalid('빠르기가 올바르지 않아요.'); patch.fps = command.fps; }
    if (command.musicId !== undefined) { if (!isMusicId(command.musicId)) return invalid('배경음악이 올바르지 않아요.'); patch.musicId = command.musicId; }
    if (command.musicVolume !== undefined) { if (!isMusicVolume(command.musicVolume)) return invalid('음악 크기가 올바르지 않아요.'); patch.musicVolume = command.musicVolume; }
    const keys = Object.keys(patch) as (keyof typeof patch)[];
    if (!keys.length) return invalid('바꿀 값이 없어요.');
    if (keys.every(key => content[key] === patch[key])) return { ok: true, content, slideId: null, changed: false };
    return { ok: true, content: { ...content, ...patch }, slideId: null, changed: true };
  }
  if (command.type === 'setFrameHold') {
    if (!content.slides.some(slide => slide.id === command.slideId)) return invalid('슬라이드를 찾을 수 없어요.');
    if (command.hold !== 1 && !isHold(command.hold)) return invalid('길게 보이기 값이 올바르지 않아요.');
    if ((content.holds[command.slideId] ?? 1) === command.hold) return { ok: true, content, slideId: command.slideId, changed: false };
    const { [command.slideId]: _removed, ...rest } = content.holds;
    const holds: Holds = command.hold === 1 ? rest : { ...rest, [command.slideId]: command.hold };
    return { ok: true, content: { ...content, holds }, slideId: command.slideId, changed: true };
  }
  // 슬라이드 명령: 슬라이드와 같은 세 필드만 넘기고 결과를 다시 합친다. apply.ts는 애니메이션 필드를 알지 못한다.
  const result = applyCommand({ title: content.title, slides: content.slides, assetManifest: content.assetManifest }, command, context);
  if (!result.ok) return result;
  if (!result.changed) return { ok: true, content, slideId: result.slideId, changed: false };
  const holds = reconcileHolds(content.holds, command, result.slideId, new Set(result.content.slides.map(slide => slide.id)));
  return { ok: true, content: { ...content, ...result.content, holds }, slideId: result.slideId, changed: true };
}
