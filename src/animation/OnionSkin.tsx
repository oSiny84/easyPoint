// 양파 껍질(애니메이션 계약 §8): 지금 장의 바로 앞 장을 흐리게 깔아 얼마나 움직였는지 보면서 그리게 한다.
// SlideCanvas의 배경 레이어 안(배경 위·요소 아래)에 그린다. 화면 전용이며 저장·미리보기·출력에는 들어가지 않는다.
// 앞 장 그림은 출력과 같은 renderSlide로 한 번 만들고, 앞 장 객체가 바뀔 때만 다시 만든다. 못 만들면 없이 편집을 계속한다.
import { useEffect, useState } from 'react';
import { Image as KonvaImage } from 'react-konva';
import { LIMITS } from '../domain/limits';
import type { Slide } from '../domain/types';
import { renderSlide, type BlobResolver } from '../rendering/renderSlide';

export const ONION_OPACITY = 0.35;
type Picture = { slide: Slide; canvas: HTMLCanvasElement };
const release = (canvas: HTMLCanvasElement) => { canvas.width = canvas.height = 0; };

export function OnionSkin({ slide, slides, resolve }: { slide: Slide; slides: readonly Slide[]; resolve: BlobResolver }) {
  const index = slides.findIndex(item => item.id === slide.id);
  const previous = index > 0 ? slides[index - 1] : null;
  const [picture, setPicture] = useState<Picture | null>(null);

  useEffect(() => {
    if (!previous) { setPicture(null); return; }
    let active = true;
    void renderSlide(previous, resolve, 1).then(result => {
      if (!result.ok) return;
      if (active) setPicture({ slide: previous, canvas: result.canvas }); else release(result.canvas);
    }, () => undefined);
    return () => { active = false; };
  }, [previous, resolve]);
  // 새 그림이 화면에 올라간 뒤(또는 화면을 떠날 때) 옛 그림을 비운다.
  useEffect(() => () => { if (picture) release(picture.canvas); }, [picture]);

  // 장을 옮긴 직후에는 새 앞 장의 그림이 준비될 때까지 아무것도 깔지 않는다. 다른 장의 그림이 잠깐 보이지 않게 한다.
  if (!previous || picture?.slide !== previous) return null;
  return <KonvaImage image={picture.canvas} width={LIMITS.slideWidth} height={LIMITS.slideHeight} opacity={ONION_OPACITY} listening={false} />;
}
