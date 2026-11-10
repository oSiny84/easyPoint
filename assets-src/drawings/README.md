# 직접 그린 그림 → 영상 편집기 밈

2026-11-10 사용자 결정: 밈 스티커·밈 영상은 우리 가족이 그린 그림으로 만든다. 효과음·음악은 `scripts/make-sounds.mjs`가 합성한다.

## 그림 준비

- 종이 그림은 밝은 곳에서 위에서 똑바로 찍는다. 종이가 화면을 거의 채우게 찍고, 그림 하나에 사진 하나를 쓴다. 가장자리에 책상이 조금 보이는 것은 저절로 빠진다.
- 굵은 테두리로 그린 그림이 가장 잘 빠진다. 테두리 안의 흰 곳(눈 등)은 남고, 테두리 밖 종이는 투명해진다.
- CanvaCraft나 다른 그림 앱에서 투명 배경 PNG로 내보낸 그림도 된다. 이때는 투명도를 그대로 쓴다.
- 파일 형식은 JPG·PNG·WebP. 아이폰 HEIC는 JPG로 바꿔서 넣는다.
- 원본은 `originals/`에 넣는다. 이 폴더는 Git에서 빠진다(공개 저장소). **변환 결과는 `public/memes`에 들어가 저장소와 배포본에 포함된다.** 이름·학교 등 개인 정보가 그림에 없는지 확인한다.

## 설정(`drawings.json`)

```json
{
  "license": "CanvaCraft 사용자 가족이 직접 그린 그림. 외부 권리 없음",
  "hide": ["cat-hop", "dog-wag", "heart-pop", "star-spin", "clip-boing", "clip-wow"],
  "items": [
    { "id": "draw-cat-hop", "kind": "sticker", "file": "originals/cat.jpg", "label": "우리 고양이", "category": "cat",
      "tags": ["고양이", "깡충"], "motion": "hop", "soundId": "sfx-pop" },
    { "id": "draw-cat-yay", "kind": "clip", "file": "originals/cat.jpg", "label": "야옹 축하", "category": "reaction",
      "tags": ["고양이", "축하"], "motion": "dance", "background": "#74C0FC", "pattern": "rays", "text": "야옹!", "textAt": "bottom",
      "seconds": 2, "sounds": [{ "id": "sfx-fanfare", "at": 0 }] }
  ]
}
```

| 값 | 뜻 |
|---|---|
| id | 영문 소문자·숫자·`-`. **한 번 배포한 ID는 지우거나 바꾸지 않는다**(저장된 작품이 ID로 참조). 빼려면 `hide`에 넣는다 |
| kind | `sticker`(투명 움직이는 그림, 2초 반복) 또는 `clip`(색 배경 짧은 영상, 소리 포함) |
| category | `cat`·`dog`·`reaction`·`effect`(밈 패널 분류: 고양이·강아지·리액션·효과) |
| motion | `hop` 깡충, `wag` 갸웃, `pop` 두근, `spin` 빙글, `wiggle` 꼼지락, `float` 둥실, `shake` 부들, `dance` 들썩, `zoom` 쑥쑥 |
| soundId | 스티커를 넣을 때 한 번 나는 효과음(없으면 `null`). `public/sounds/manifest.json`의 sfx ID |
| background·pattern·text·textAt·seconds·sounds | 밈 영상만. pattern은 `rays`·`dots`·`none`, seconds 1~10, sounds의 at은 초 |
| cutout | 선택. 배경이 잘 안 빠질 때 `{ "ink": 0.8, "chroma": 60, "fill": true, "border": 0.03, "crop": [x, y, w, h] }`. ink를 낮추면 연한 선이 빠지고, crop은 0~1 비율로 사진 일부만 쓴다 |
| hide | 패널에서 숨길 ID(자리 표시 밈 등). 문서 검사에는 계속 쓴다 |

## 만들기

```
node scripts/make-drawing-memes.mjs
```

Vite 개발 서버와 Chromium을 스스로 띄워 `public/memes/<id>.webp|webm`과 manifest를 갱신한다. 확인용 띠 그림은 `artifacts/drawings/<id>.png`(프레임 6장), 배경을 뺀 그림은 `<id>-cut.png`다. 하나만 다시 만들 때는 `--only id1,id2`. 만든 뒤 `npm test`의 `tests/contracts/videoBuiltins.spec.ts`가 상한·해시를 검사한다. `docs/asset-licenses.md` 표도 갱신한다.
