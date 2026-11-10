# 영상 편집기 내장 밈·효과음·음악 출처

갱신: 2026-11-10. 영상 계약 §2(내장 목록)·§10에 따른 기록이다.

**2026-11-10 사용자 결정**: 밈 스티커·밈 영상은 **우리 가족이 그린 그림**으로 만든다(`scripts/make-drawing-memes.mjs`, 사용법은 `assets-src/drawings/README.md`). 효과음·배경음악은 **Claude가 코드로 합성**한다(`scripts/make-sounds.mjs`). 둘 다 외부 그림·소리·샘플을 쓰지 않아 외부 권리가 없다.

## 효과음·배경음악: 합성음(실제 자산)

`scripts/make-sounds.mjs`가 사인파·잡음(고정 씨앗)·직접 쓴 악보로 만든다. 48kHz 16비트 모노 WAV. 같은 코드는 같은 바이트를 만든다.

| 종류 | ID | 이름 | 길이 |
|---|---|---|---|
| 효과음 | sfx-boing·sfx-ding·sfx-pop | 띠용·딩동·뽁(V6 자리 표시 때와 같은 바이트) | 0.6·1.2·0.25초 |
| 효과음 | sfx-whoosh·sfx-clap·sfx-zap·sfx-thud | 휘익·짝짝·뿅·쿵 | 0.7·0.6·0.35·0.6초 |
| 효과음 | sfx-fanfare·sfx-buzzer·sfx-sparkle·sfx-magic·sfx-sad | 빰빠밤·땡·반짝·뾰로롱·아쉬워(뿌우) | 1.3·0.6·1.0·1.1·2.4초 |
| 배경음악 | music-happy | 신나는 노래(120bpm, 종소리 멜로디·베이스·드럼, 8마디 반복) | 16.0초 |
| 배경음악 | music-calm | 잔잔한 노래(80bpm, 플루트·뜯는 반주, 드럼 없음) | 24.0초 |
| 배경음악 | music-funny | 장난스러운 노래(112bpm, 짧게 끊는 사각파·우드블록) | 17.1초 |
| 배경음악 | music-adventure | 모험 노래(100bpm, 가단조, 금관 느낌·드럼·탐 채움) | 19.2초 |

곡은 끝을 넘은 울림을 앞에 더해 반복 이음매가 튀지 않고, 곡마다 RMS 0.155 안팎으로 크기를 맞췄다(봉우리 0.49~0.67). 음색은 사람이 들어 보고 고르지 않았다(합성 결과의 수치만 확인).

## 밈: 아직 자리 표시 자산

가족 그림이 오기 전까지는 아래 자리 표시 밈이 그대로 있다. `scripts/make-placeholder-assets.mjs`가 캔버스 도형으로 만들며 외부 권리가 없다.

| 종류 | ID | 내용 | 파일 |
|---|---|---|---|
| 스티커 | cat-hop | 깡충 고양이(주황 고양이 얼굴이 튀어 오름) | `public/memes/cat-hop.webp`, 256×256, 25fps 2초, 효과음 sfx-pop |
| 스티커 | dog-wag | 갸웃 강아지(갈색 강아지 얼굴이 좌우로 기울어짐) | `public/memes/dog-wag.webp` |
| 스티커 | heart-pop | 두근 하트(하트가 커졌다 작아짐) | `public/memes/heart-pop.webp`, 효과음 sfx-ding |
| 스티커 | star-spin | 반짝 별(별이 돈다) | `public/memes/star-spin.webp` |
| 밈 영상 | clip-boing | 통통 공(파란 배경에 공이 튐, 띠용 소리) | `public/memes/clip-boing.webm`, 640×360 30fps 2초, VP9+Opus |
| 밈 영상 | clip-wow | 와아(노란 배경에 WOW 글자가 커짐, 올라가는 소리) | `public/memes/clip-wow.webm` |

기획안 최소 수량 중 효과음 12·음악 4는 채웠고, 밈은 스티커 4/16·밈 영상 2/8로 **못 미친다**. 패널에는 "지금은 연습용으로 만든 밈이에요"라고 안내한다(그림 밈을 넣으면 이 문구를 지운다).

## 그림 밈으로 바꿀 때

1. 그림 사진(또는 투명 PNG)을 `assets-src/drawings/originals/`에 넣는다. 이 폴더는 Git에서 빠진다(저장소가 공개). 변환 결과는 `public/memes`에 들어가 저장소·배포본에 포함되므로 그림에 이름 등 개인 정보가 없는지 본다.
2. `assets-src/drawings/drawings.json`에 항목(종류·이름·분류·움직임·효과음, 밈 영상은 배경·글자·소리)을 적고 `hide`에 자리 표시 ID를 넣은 뒤 `node scripts/make-drawing-memes.mjs`를 돌린다. 배경 빼기 → 흰 테두리 → 스티커는 384×384 25fps 2초 애니메이션 WebP, 밈 영상은 640×360 30fps VP9+Opus WebM. 계약 §5 상한 안이다. `tests/contracts/videoBuiltins.spec.ts`가 검사한다.
3. **한 번 배포한 ID는 지우지 않는다.** 자리 표시 항목은 `hidden: true`로 패널에서만 뺀다. 저장된 작품이 ID로 참조하기 때문이다.
4. 이 문서의 표와 밈 패널의 연습용 안내 문구를 갱신한다.

변환 도구 확인(2026-11-10, 합성한 시험 그림): 책상이 함께 찍히고 오른쪽 아래가 어두운 2400×1800 크레용 고양이 JPEG에서 책상이 빠지고 종이가 하얗게 펴졌으며, 테두리 안 흰 눈·귀 안쪽은 남았다. 떨어진 해 그림은 따로 남았다(빼려면 `cutout.crop`). 투명 PNG 하트는 투명도를 그대로 썼다. 결과 스티커 591KB·392KB, 밈 영상 3초 221KB. 개발 서버에 잠시 넣어 밈 패널 표시·미리보기 그리기·MP4 내보내기(2초, 약 2MB)까지 확인하고 되돌렸다. **실제 종이 그림 사진으로는 아직 시험하지 않았다.**
