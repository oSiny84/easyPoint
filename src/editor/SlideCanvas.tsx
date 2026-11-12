// 문서를 읽어 화면에 그린다. 문서 사본을 영구 상태로 갖지 않는다.
// 조작 중인 요소만 별도 레이어에 그려 다른 요소를 매 프레임 다시 그리지 않는다(PHASE2_RESULTS §6).
// 앞뒤 레이어로 나누므로 끄는 동안에도 앞뒤 순서가 그대로 보인다.
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from 'react-konva';
import type { AssetStore } from '../assets/assetStore';
import { LIMITS } from '../domain/limits';
import type { Slide, SlideElement, TextElement } from '../domain/types';
import { coverCrop } from '../rendering/renderSlide';
import { fontCss, fontOf, prepareFonts, TEXT_LANG } from '../rendering/text/fonts';
import { displayLines, layoutText } from '../rendering/text/layoutText';

const WIDTH = LIMITS.slideWidth, HEIGHT = LIMITS.slideHeight;
const textKey = (element: TextElement) => `${fontCss(element)}|${element.text}`;
const assetIdsOf = (slide: Slide) => {
  const ids = new Set<string>();
  if (slide.background.kind === 'image') ids.add(slide.background.assetId);
  for (const element of slide.elements) if (element.type === 'image') ids.add(element.assetId);
  return ids;
};

const ElementView = memo(function ElementView({ element, image }: { element: SlideElement; image?: HTMLImageElement }) {
  if (element.type === 'image') return <KonvaImage image={image} x={element.x} y={element.y} width={element.width} height={element.height} />;
  if (element.type === 'stroke') return <Group x={element.x} y={element.y}>
    {element.points.length === 2
      ? <Circle x={element.points[0]} y={element.points[1]} radius={element.strokeWidth / 2} fill={element.color} />
      : <Line points={element.points} stroke={element.color} strokeWidth={element.strokeWidth} lineCap="round" lineJoin="round" />}
  </Group>;
  return <Text x={element.x} y={element.y} width={element.width} text={displayLines(layoutText(element), element.align).join('\n')} wrap="none" align={element.align}
    fontFamily={fontOf(element.fontId).family} fontSize={element.fontSize} fontStyle={element.bold ? 'bold' : 'normal'} lineHeight={element.lineHeight} fill={element.color} />;
});

// underlay: 배경 위·요소 아래에 까는 react-konva 요소(애니메이션의 양파 껍질). 주지 않으면 아무것도 깔지 않는다.
// companions: 조작 중인 요소와 함께 임시 자리에 그릴 요소(만화의 말풍선 짝 글씨). 원래 자리의 그 요소는 그리지 않는다.
export function SlideCanvas({ slide, preview, hiddenId, scale, assets, onError, underlay, companions }: { slide: Slide; preview: SlideElement | null; hiddenId?: string | null; scale: number; assets: AssetStore; onError: (message: string) => void; underlay?: ReactNode; companions?: readonly SlideElement[] }) {
  // 현재 장의 사진만 디코딩한 채로 둔다(계약 §7).
  const images = useRef(new Map<string, HTMLImageElement>());
  const fonts = useRef(new Set<string>());
  const shown = useRef<Slide | null>(null);
  // 글꼴이나 사진을 준비하지 못한 문서. 안내를 띄우고 되는 만큼 그려, 편집 결과가 화면에서 사라지지 않게 한다.
  const incomplete = useRef<Slide | null>(null);
  const [, redraw] = useState(0);

  const isPrepared = (target: Slide) => [...assetIdsOf(target)].every(id => images.current.has(id))
    && target.elements.every(element => element.type !== 'text' || fonts.current.has(textKey(element)));
  // 준비가 끝난 문서는 바로 그려 명령 직후 이전 모습이 한 프레임 보이지 않게 한다.
  if (isPrepared(slide) || incomplete.current === slide) shown.current = slide;

  useEffect(() => {
    if (isPrepared(slide)) return;
    let active = true;
    void (async () => {
      const problem = await prepareFonts([slide]);
      if (problem && active) onError(problem.message);
      const wanted = assetIdsOf(slide);
      const loaded = await Promise.all([...wanted].filter(id => !images.current.has(id)).map(id => new Promise<[string, HTMLImageElement | null]>(resolve => {
        const url = assets.url(id); const image = new Image();
        if (!url) { resolve([id, null]); return; }
        image.onload = () => resolve([id, image]); image.onerror = () => resolve([id, null]); image.src = url;
      })));
      if (!active) return;
      const unreadable = loaded.some(([, image]) => !image);
      if (unreadable) onError('사진을 읽지 못했어요.');
      for (const id of images.current.keys()) if (!wanted.has(id)) images.current.delete(id);
      for (const [id, image] of loaded) if (image) images.current.set(id, image);
      if (problem || unreadable) {
        if (incomplete.current === slide) return;
        incomplete.current = slide;
      } else for (const element of slide.elements) if (element.type === 'text') fonts.current.add(textKey(element));
      redraw(value => value + 1);
    })();
    return () => { active = false; };
  });

  const current = shown.current;
  const index = current && preview ? current.elements.findIndex(element => element.id === preview.id) : -1;
  // 입력 중인 글씨는 textarea가 보여 주므로 캔버스에서 뺀다.
  const moving = index >= 0 && companions?.length ? companions : [];
  const isMoving = (element: SlideElement) => moving.some(item => item.id === element.id);
  // 함께 움직이는 요소는 원래의 앞뒤 순서대로 조작 중인 요소의 뒤나 앞에 그린다.
  const orderOf = (element: SlideElement) => current ? current.elements.findIndex(item => item.id === element.id) : -1;
  const below = current ? (index >= 0 ? current.elements.slice(0, index) : current.elements).filter(element => element.id !== hiddenId && !isMoving(element)) : [];
  const above = current && index >= 0 ? current.elements.slice(index + 1).filter(element => !isMoving(element)) : [];
  const imageFor = (element: SlideElement) => element.type === 'image' ? images.current.get(element.assetId) : undefined;
  const background = current?.background;
  const backgroundImage = background?.kind === 'image' ? images.current.get(background.assetId) : undefined;

  return <div className="paper" lang={TEXT_LANG} data-testid="paper" style={{ width: WIDTH * scale, height: HEIGHT * scale }}>
    {current && <Stage width={WIDTH * scale} height={HEIGHT * scale} scaleX={scale} scaleY={scale} listening={false}>
      <Layer>
        {background?.kind === 'solid' && <Rect width={WIDTH} height={HEIGHT} fill={background.color} />}
        {backgroundImage && <KonvaImage image={backgroundImage} width={WIDTH} height={HEIGHT} crop={coverCrop(backgroundImage.naturalWidth, backgroundImage.naturalHeight)} />}
        {underlay}
        {below.map(element => <ElementView key={element.id} element={element} image={imageFor(element)} />)}
      </Layer>
      <Layer>
        {moving.filter(element => orderOf(element) < index).map(element => <ElementView key={element.id} element={element} image={imageFor(element)} />)}
        {index >= 0 && preview && <ElementView element={preview} image={imageFor(preview)} />}
        {moving.filter(element => orderOf(element) >= index).map(element => <ElementView key={element.id} element={element} image={imageFor(element)} />)}
      </Layer>
      <Layer>{above.map(element => <ElementView key={element.id} element={element} image={imageFor(element)} />)}</Layer>
    </Stage>}
  </div>;
}
