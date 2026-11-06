// 글씨 입력 칸. 실제 입력은 DOM textarea가 맡아 한글 조합과 커서·입력 중 되돌리기를 브라우저에 맡긴다.
// 값을 React로 되써넣지 않아(비제어) 조합이 끊기거나 입력 중 되돌리기 기록이 사라지지 않는다.
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { TextElement } from '../domain/types';
import { TEXT_LANG } from '../rendering/text/fonts';
import { layoutText, textCss } from '../rendering/text/layoutText';

export type TextEditorHandle = { value: () => string; isComposing: () => boolean; blur: () => void };
type Props = {
  draft: TextElement; scale: number; initialText: string; caret: number | null; placeholder: string;
  onInput: (text: string) => void; onCommitRequest: () => void; onCompositionFinished: () => void;
};

export const TextEditor = forwardRef<TextEditorHandle, Props>(function TextEditor({ draft, scale, initialText, caret, placeholder, onInput, onCommitRequest, onCompositionFinished }, handle) {
  const area = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);

  useImperativeHandle(handle, () => ({ value: () => area.current?.value ?? '', isComposing: () => composing.current, blur: () => area.current?.blur() }), []);

  // 측정 요소와 같은 CSS를 줘서 편집 전후 줄이 같게 한다. 배율은 글자 크기가 아니라 transform으로 맞춘다.
  useLayoutEffect(() => {
    const element = area.current!;
    const { height } = layoutText(draft);
    element.style.cssText = `position:absolute;left:${draft.x * scale}px;top:${draft.y * scale}px;height:${height}px;${textCss(draft)};color:${draft.color};caret-color:${draft.color};text-align:${draft.align};transform:scale(${scale});transform-origin:top left;background:transparent;outline:none;resize:none;overflow:hidden;box-shadow:none;`;
    element.scrollTop = 0;
  }, [draft, scale]);

  useEffect(() => {
    const element = area.current!;
    element.focus({ preventScroll: true });
    const at = caret ?? element.value.length;
    element.setSelectionRange(at, at);
    // 커서 위치 지정은 편집을 시작할 때 한 번만 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <textarea ref={area} className="text-editor" aria-label="슬라이드 글씨" lang={TEXT_LANG} spellCheck={false} maxLength={5000} defaultValue={initialText} placeholder={placeholder}
    onInput={event => onInput(event.currentTarget.value)}
    onCompositionStart={() => { composing.current = true; }}
    onCompositionEnd={() => { composing.current = false; onCompositionFinished(); }}
    onKeyDown={event => {
      // 조합 중인 키는 입력기가 처리한다. Enter·Esc가 문서 동작으로 해석되면 글자가 사라지거나 겹친다.
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCommitRequest(); }
    }}
    onBlur={event => {
      // 설정 줄을 쓰거나 다른 창으로 갈 때는 입력을 끝내지 않는다.
      const next = event.relatedTarget as HTMLElement | null;
      if (next?.closest('.selection-row') || !document.hasFocus()) return;
      onCommitRequest();
    }} />;
});
