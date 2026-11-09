// 소리 패널(영상 기획안 §3): 원본 소리 크기 3단계, 배경음악 고르기(없음 + 목록, 들어 보기), 음악 크기 3단계. 숫자 입력은 없다.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import type { AudioSettings, Volume } from '../domain/videoTypes';
import { builtinUrl, type SoundItem } from './builtins';

const LEVELS: { value: Volume; label: string }[] = [{ value: 0, label: '끄기' }, { value: 0.5, label: '작게' }, { value: 1, label: '크게' }];

type Props = { audio: AudioSettings; music: readonly SoundItem[] | null; disabled: boolean; onChange: (patch: Partial<AudioSettings>) => void };

export function SoundPanel({ audio, music, disabled, onChange }: Props) {
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
  const levels = (label: string, value: Volume, key: 'originalVolume' | 'musicVolume') => <div className="level-group" role="group" aria-label={label}>
    {LEVELS.map(level => <button key={level.value} className="chip" disabled={disabled} aria-pressed={value === level.value} onClick={() => onChange({ [key]: level.value })}>{level.label}</button>)}
  </div>;
  return <div className="panel-body">
    <h3>영상 원래 소리</h3>
    {levels('영상 원래 소리 크기', audio.originalVolume, 'originalVolume')}
    <p className="panel-note">조각마다 소리를 끄려면 타임라인에서 조각을 골라 '소리 끄기'를 누르세요.</p>
    <h3>배경음악</h3>
    {music === null ? <p className="panel-note">음악 목록을 불러오지 못했어요.</p> : <ul className="music-list" aria-label="배경음악">
      <li><button className="music-card" disabled={disabled} aria-pressed={audio.musicId === null} onClick={() => onChange({ musicId: null })}>음악 없음</button></li>
      {music.filter(item => !item.hidden).map(item => <li key={item.id}>
        <button className="music-card" disabled={disabled} aria-pressed={audio.musicId === item.id} onClick={() => onChange({ musicId: item.id })}>{item.label}</button>
        <button className="icon-only" aria-label={`${item.label} 들어 보기`} title="들어 보기" onClick={() => listen(item)}><Icon name={listening === item.id ? 'pause' : 'play'} size={16} /></button>
      </li>)}
    </ul>}
    <h3>음악 크기</h3>
    {levels('배경음악 크기', audio.musicVolume, 'musicVolume')}
    <p className="panel-note">음악이 영상보다 짧으면 반복하고, 영상이 끝나면 함께 끝나요.</p>
  </div>;
}
