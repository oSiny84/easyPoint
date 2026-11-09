# 영상 편집기 내장 밈·효과음·음악 출처

갱신: 2026-11-09. 영상 계약 §2(내장 목록)·§10(밈·효과음·음악 출처는 V6 전까지 다시 묻는다)에 따른 기록이다.

## 지금 들어 있는 것: 자리 표시 자산

**실제 자산이 아니다.** 사용자 결정(밈·효과음·배경음악을 어디서 구할지)이 아직 없어서, 계약의 기본값대로 개발용 자리 표시 자산을 직접 만들었다. 모두 `scripts/make-placeholder-assets.mjs`가 캔버스 도형과 합성음으로 만들며, 외부 그림·소리·글꼴·이모지를 쓰지 않는다. 그래서 외부 권리가 없다.

| 종류 | ID | 내용 | 파일 |
|---|---|---|---|
| 스티커 | cat-hop | 깡충 고양이(주황 고양이 얼굴이 튀어 오름) | `public/memes/cat-hop.webp`, 256×256, 25fps 2초, 효과음 sfx-pop |
| 스티커 | dog-wag | 갸웃 강아지(갈색 강아지 얼굴이 좌우로 기울어짐) | `public/memes/dog-wag.webp` |
| 스티커 | heart-pop | 두근 하트(하트가 커졌다 작아짐) | `public/memes/heart-pop.webp`, 효과음 sfx-ding |
| 스티커 | star-spin | 반짝 별(별이 돈다) | `public/memes/star-spin.webp` |
| 밈 영상 | clip-boing | 통통 공(파란 배경에 공이 튐, 띠용 소리) | `public/memes/clip-boing.webm`, 640×360 30fps 2초, VP9+Opus |
| 밈 영상 | clip-wow | 와아(노란 배경에 WOW 글자가 커짐, 올라가는 소리) | `public/memes/clip-wow.webm` |
| 효과음 | sfx-boing·sfx-ding·sfx-pop | 띠용·딩동·뽁 | `public/sounds/*.wav`, 48kHz 16비트 모노 |
| 배경음악 | music-happy·music-calm | 신나는 노래·잔잔한 노래(8초 반복 멜로디) | `public/sounds/*.wav` |

기획안의 최소 수량(스티커 16·밈 영상 8·효과음 12·음악 4)에 **못 미친다**(지금은 스티커 4·밈 영상 2·효과음 3·음악 2). 패널에는 "지금은 연습용으로 만든 밈이에요"라고 안내한다.

## 실제 자산으로 바꿀 때

1. 출처를 사용자가 정한다. 후보: 기존 캐릭터 PNG를 움직이게 만든 애니메이션 WebP, AI 생성 도구 결과물(사용 조건 확인), 직접 촬영한 반려동물 영상. 인터넷에 돌아다니는 밈 영상·유행 소리는 저작권 때문에 쓰지 않는다.
2. 새 파일을 `public/memes`·`public/sounds`에 넣고 manifest에 항목과 `sha256`, `license`를 적는다. 계약 §5 상한(스티커 1~5초·512² 이하·투명, 밈 영상 1~10초·1280×720 이하, 효과음 3초, 음악 5분, 48kHz)을 지킨다. `tests/contracts/videoBuiltins.spec.ts`가 검사한다.
3. **한 번 배포한 ID는 지우지 않는다.** 자리 표시 항목은 `hidden: true`로 패널에서만 뺀다. 저장된 작품이 ID로 참조하기 때문이다.
4. 이 문서의 표를 갱신한다.
