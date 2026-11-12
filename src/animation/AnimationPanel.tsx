// 애니메이션 패널(애니메이션 기획안 §3): 빠르기 단추 5개, 지금 길이, 배경음악과 크기, 앞 장 겹쳐 보기. 숫자 입력은 없다.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { ANIMATION_FPS, MUSIC_VOLUMES } from '../domain/animationLimits';
import type { AnimationFps, MusicVolume } from '../domain/animationTypes';
import { builtinUrl, type SoundItem } from '../video/builtins';
import { formatLength } from './frameTimes';

const VOLUME_LABEL: Record<MusicVolume, string> = { 0.5: '작게', 1: '크게' };
export type AnimationPatch = { fps?: AnimationFps; musicId?: string | null; musicVolume?: MusicVolume };

type Props = {
  fps: AnimationFps; musicId: string | null; musicVolume: MusicVolume; slideCount: number; lengthMs: number;
  // undefined: 읽는 중, null: 읽지 못함.
  music: readonly SoundItem[] | null | undefined; disabled: boolean;
  onion: boolean; onOnion: (on: boolean) => void; onChange: (patch: AnimationPatch) => void;
};

export function AnimationPanel({ fps, musicId, musicVolume, slideCount, lengthMs, music, disabled, onion, onOnion, onChange }: Props) {
  const [listening, setListening] = useState<string | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => player.current?.pause(), []);
  function listen(item: SoundItem) {
    player.current?.pause();
    if (listening === item.id) { setListening(null); return; }
    const element = new Audio(builtinUrl('sounds', item.file)); player.current = element;
    element.addEventListener('ended', () => setListening(null));
    void element.play().catch(() => setListening(null));
    setListening(item.id);
  }
  const shown = music?.filter(item => !item.hidden) ?? [];
  // 목록에 없는 음악(지워졌거나 못 읽은 음악)은 '음악 없음'으로 보여 준다(계약 §5).
  const lost = !!musicId && !!music && !music.some(item => item.id === musicId);

  return <div className="panel-body animation-panel">
    <h3>빠르기</h3>
    <div className="level-group" role="group" aria-label="빠르기">
      {ANIMATION_FPS.map(value => <button key={value} className="chip speed-chip" disabled={disabled} aria-pressed={fps === value} aria-label={`1초에 ${value}장`} onClick={() => onChange({ fps: value })}>{value}장</button>)}
    </div>
    <p className="panel-note">1초에 넘기는 장 수예요. 숫자가 클수록 빨리 움직여요.</p>
    <p className="animation-length" data-testid="animation-length">{slideCount}장 · {formatLength(lengthMs)}</p>

    <h3>배경음악</h3>
    {music === undefined ? <p className="panel-note">음악 목록을 불러오고 있어요…</p>
      : music === null ? <p className="panel-note">음악 목록을 불러오지 못했어요. 그림은 그대로 만들 수 있어요.</p>
      : <ul className="music-list" aria-label="배경음악">
        <li><button className="music-card" disabled={disabled} aria-pressed={musicId === null || lost} onClick={() => onChange({ musicId: null })}>음악 없음</button></li>
        {shown.map(item => <li key={item.id}>
          <button className="music-card" disabled={disabled} aria-pressed={musicId === item.id} onClick={() => onChange({ musicId: item.id })}>{item.label}</button>
          <button className="icon-only" aria-label={`${item.label} 들어 보기`} title="들어 보기" onClick={() => listen(item)}><Icon name={listening === item.id ? 'pause' : 'play'} size={16} /></button>
        </li>)}
      </ul>}
    {lost && <p className="panel-note">고른 음악을 찾을 수 없어요. 다시 골라 주세요.</p>}
    <h3>음악 크기</h3>
    <div className="level-group" role="group" aria-label="배경음악 크기">
      {MUSIC_VOLUMES.map(value => <button key={value} className="chip" disabled={disabled} aria-pressed={musicVolume === value} onClick={() => onChange({ musicVolume: value })}>{VOLUME_LABEL[value]}</button>)}
    </div>
    <p className="panel-note">음악은 처음부터 나오고, 그림이 끝나면 함께 끝나요.</p>

    <h3>앞 장 겹쳐 보기</h3>
    <div className="level-group" role="group" aria-label="앞 장 겹쳐 보기">
      <button className="chip" aria-pressed={onion} onClick={() => onOnion(true)}>켜기</button>
      <button className="chip" aria-pressed={!onion} onClick={() => onOnion(false)}>끄기</button>
    </div>
    <p className="panel-note">앞 장이 흐리게 깔려 보여요. 얼마나 움직였는지 보면서 그릴 수 있어요. 영상에는 나오지 않아요.</p>

    <h3>이렇게 만들어요</h3>
    <p className="panel-note">아래 +를 누르면 지금 장이 복사돼요. 그림을 조금씩 옮기거나 고쳐 그린 뒤 위의 재생을 눌러 보세요. 오래 멈춰 있을 장은 장 메뉴(⋯)에서 길게 보이기를 골라요.</p>
  </div>;
}
