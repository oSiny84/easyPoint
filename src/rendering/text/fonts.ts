// 글꼴 등록표. 근거와 측정값은 docs/PHASE2_RESULTS.md §4에 있다.
import { fail, type Failure, type Slide, type TextElement } from '../../domain/types';

export const FONT_REGISTRY = {
  'sans-ko': {
    label: '기본 글씨', family: 'Noto Sans KR', source: '@fontsource/noto-sans-kr 5.3.1', license: 'OFL-1.1', weights: [400, 700],
    // PPTX는 글꼴 파일을 넣지 못하므로 Windows 기본 글꼴을 쓴다. 한글 폭이 약 9% 넓어 크기를 줄이고 세로 위치를 맞춘다.
    // shiftEm은 줄 간격 1.3 기준이고, 줄 간격이 1 늘 때마다 lineHeightShiftEm만큼 덜 내린다(Phase 6 측정).
    pptx: { face: '맑은 고딕', scale: 0.92, shiftEm: 0.07, lineHeightShiftEm: 0.25, baseLineHeight: 1.3 },
  },
  // 아래 글꼴은 받는 PC에 없으므로 편집용 PPT에서는 맑은 고딕으로 바뀐다. 글자 폭이 맞도록 크기를 재서 정했다.
  'round-jua': { label: '주아체', family: 'Jua', source: '@fontsource/jua 5.3.0', license: 'OFL-1.1', weights: [400], pptx: { face: '맑은 고딕', scale: 0.82, shiftEm: -0.09, lineHeightShiftEm: 0.25, baseLineHeight: 1.3 } },
  'block-dohyeon': { label: '도현체', family: 'Do Hyeon', source: '@fontsource/do-hyeon 5.3.0', license: 'OFL-1.1', weights: [400], pptx: { face: '맑은 고딕', scale: 0.77, shiftEm: -0.1, lineHeightShiftEm: 0.25, baseLineHeight: 1.3 } },
  'hand-gamja': { label: '감자꽃체', family: 'Gamja Flower', source: '@fontsource/gamja-flower 5.3.0', license: 'OFL-1.1', weights: [400], pptx: { face: '맑은 고딕', scale: 0.8, shiftEm: -0.01, lineHeightShiftEm: 0.25, baseLineHeight: 1.3 } },
  'hand-pen': { label: '나눔손글씨 펜', family: 'Nanum Pen Script', source: '@fontsource/nanum-pen-script 5.3.0', license: 'OFL-1.1', weights: [400], pptx: { face: '맑은 고딕', scale: 0.63, shiftEm: -0.08, lineHeightShiftEm: 0.25, baseLineHeight: 1.3 } },
  'hand-gaegu': { label: '개구쟁이체', family: 'Gaegu', source: '@fontsource/gaegu 5.3.0', license: 'OFL-1.1', weights: [400, 700], pptx: { face: '맑은 고딕', scale: 0.85, shiftEm: -0.01, lineHeightShiftEm: 0.25, baseLineHeight: 1.3 } },
} as const;
export type FontId = keyof typeof FONT_REGISTRY;
// Noto Sans KR은 lang=ko에서 공백 폭이 달라지고 캔버스는 이를 따르지 않는다. 편집 영역·측정·캔버스를 모두 언어 미지정으로 둔다.
export const TEXT_LANG = 'und';

export const fontOf = (fontId: string) => FONT_REGISTRY[fontId as FontId];
export const hasBold = (fontId: string) => (fontOf(fontId).weights as readonly number[]).includes(700);
export const fontCss = (style: { fontId: string; bold: boolean; fontSize: number }) => `${style.bold ? 700 : 400} ${style.fontSize}px "${fontOf(style.fontId).family}"`;

// 글자 범위별로 나뉜 글꼴 파일을 실제 글 내용에 맞춰 불러온다. 실패한 대체 글꼴 결과를 정상으로 확정하지 않는다.
export async function prepareFonts(slides: readonly Slide[]): Promise<Failure | null> {
  try {
    const texts = slides.flatMap(slide => slide.elements.filter((element): element is TextElement => element.type === 'text'));
    for (const element of texts) await document.fonts.load(fontCss(element), element.text);
    if (texts.length && !texts.every(element => document.fonts.check(fontCss(element), element.text))) return fail('FONT_UNAVAILABLE', '글꼴을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
    return null;
  } catch { return fail('FONT_UNAVAILABLE', '글꼴을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.'); }
}
