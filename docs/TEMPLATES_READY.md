# 시작 템플릿 12종 연결 인계

2026-11-06. Claude의 편집기 작업과 병행해 **데이터·미리보기·원본 파일만** 준비했다. 앱 코드·root package.json·잠금 파일·기존 요소/배경 팩·PROGRESS.md는 수정하지 않았다. 디자인 패널 연결이나 현재 장 교체 기능은 구현하지 않았다.

## 완성된 템플릿

| 종류 | 구성 |
|---|---|
| 나를 소개해요 | 소개 항목·사진 자리·캐릭터 |
| 우리 가족 이야기 | 큰 가족 사진 자리·소개 카드 |
| 친구와 함께 | 사진 자리 2개·친구 이야기 |
| 책 속으로 여행 | 책 표지 자리·감상 카드 |
| 꼼꼼 관찰 일기 | 관찰 사진 자리·특징과 질문 |
| 나도 꼬마 과학자 | 궁금한 점·실험 방법·결과 3열 |
| 신나는 여행 기록 | 큰 사진 자리·여행 메모 |
| 현장학습 다녀왔어요 | 사진 자리 3개·순서별 설명 |
| 우리 동네를 소개해요 | 사진/지도 자리·추천 장소 |
| 내가 좋아하는 동물 | 동물 사진 자리·특징 카드 |
| 나의 꿈을 향해서 | 꿈과 도전·사진 자리·우주 캐릭터 |
| 고마운 마음을 전해요 | 편지지 카드·감사 글·서명 |

각각 16:9 **한 장짜리** 시작 템플릿이다. 여러 장의 완성 발표 덱은 아니다. 총 73개 네이티브 TextElement와 개별 ImageElement가 들어 있다. 글씨를 배경 이미지에 합쳐 저장하지 않았다. 배경은 기존 배경 팩의 이미지이며 카드·장식·사진 안내 상자는 각각 선택 가능한 이미지 요소다.

현재 앱의 글씨 입력 UI 구현 단계와 별개로 편집 가능한 문서 데이터를 제공한다. 실제 UI에서 더블클릭 글씨 편집이 완성됐다는 뜻은 아니다.

## 위치와 파일

- public/templates/manifest.json: 카탈로그. schemaVersion=1, packId=canvacraft-templates-12, templates 배열.
- projects/: 현재 Project 스키마의 JSON 12개. strict 문서 필드에 추가 메타데이터를 넣지 않았다.
- assets/: 필요한 PNG를 SHA-256 이름으로 복사. 기존 library/backgrounds 경로가 없어도 템플릿 원본을 열 수 있다.
- files/: **바로 열 수 있는 .canvacraft 12개**. 현재 앱의 serializeProject로 만들고 deserializeProject로 다시 검증했다.
- previews/: 현재 앱의 renderSlide로 그린 2560×1440 PNG 12개.
- thumbnails/: 480×270 PNG 12개.
- licenses/: 원본 레이아웃 CC0와 Microsoft Fluent Emoji MIT 고지.
- validation.json, browser-validation.json: 실행 결과.
- template-pipeline/: 재생성 도구. src/를 읽기만 한다.

전체 팩은 약 6.49MB다. 자산 SHA-256·byteLength·픽셀 크기를 Project.assetManifest에 넣었다. 삽입 대상 UUID는 Project/Slide/Element에 있고, 카탈로그 id(tpl-...)와 다르다.

미리보기: http://127.0.0.1:5173/templates/preview.html

## 카탈로그 연결

각 카탈로그 항목은 id, label, category, tags, pageCount, width/height, project, preview, thumbnail, file, assets, photoSlots, roles, elementCount, editableTextCount, licenses를 가진다. assets 배열은 {assetId,url,sourceId}이며 실제 Project의 assetManifest와 연결된다.

가장 단순한 첫 연결은 **디자인 패널 → 템플릿 선택 → 새 작품으로 시작**이다. file의 Blob을 읽고 기존 deserializeProject를 호출해 새 세션으로 연다. 현재 작품의 미저장 변경이 있다면 보관/다운로드 기회와 확인을 제공한다. 기존 작품을 자동으로 덮어쓰지 않는다. 배경 카드는 기존 setBackground 경로를 계속 사용한다.

템플릿을 현재 장에 적용하거나 여러 번 추가하는 기능은 별도 통합 작업이다. 필요하면 모든 Slide/Element UUID를 다시 발급하고 이미지 자산을 해시로 병합해야 한다. 적용 전체가 취소 1회가 되도록 원자적 명령 계약을 먼저 정한다. 여러 기존 명령을 연달아 호출해 취소 기록이 여러 개 생기는 상태를 완성으로 간주하지 않는다. 이번 팩은 이 기능을 전제로 하지 않는다.

## 사진 자리는 자동 프레임이 아니다

photoSlots는 카탈로그 메타데이터일 뿐 새로운 문서 요소 타입이 아니다. 각 슬롯은 frameElementId, hintElementId, rect, fit=contain, instruction을 가진다. 문서에는 일반 안내 이미지와 안내 글씨가 있을 뿐이다.

현재 단계에서는 사용자가 사진을 넣고 안내 이미지·글씨를 삭제하는 방식이다. 사진을 올리면 자동으로 자리와 비율에 맞게 교체하는 기능은 구현하지 않았다. 이후 추가할 때는 새 사진을 슬롯 rect 안에 비율 유지로 맞추고 안내 요소 2개를 함께 제거하는 명령 단위와 취소 동작을 정한다. 안내 문자열을 문서 스키마의 특수 필드로 저장하지 않는다.

## 실행 검증

- 현재 src/domain/validate.ts의 validateProject로 12개 Project 모두 검사 통과.
- 실제 src/rendering/renderSlide.ts와 앱의 Noto Sans KR 400/700을 사용해 12장 렌더링. layoutText로 모든 텍스트의 계산 높이가 장 바깥으로 나가지 않는지 확인.
- 실제 serializeProject → deserializeProject 12개 모두 통과. 왕복 후 slides 내용 동일·이미지 해시와 자산 일치 확인.
- 실제 createStore를 사용해 각 템플릿 제목의 updateText와 undo를 확인. 전체 73개 글씨 각각을 수정한 시험은 아니다.
- 원본 ZIP 12개에서 모든 이미지 SHA-256, 네이티브 요소 종류, 사진 안내 참조를 별도로 확인.
- Chromium 158.0.8127.18에서 큰 미리보기/썸네일 24개 로드, 학교·탐구 분류 3개, '내가 좋아하는 동물' 검색 1개, .canvacraft 다운로드 확인. JS 오류·외부 HTTP 요청 0건.
- 처음 '동물' 검색을 1개로 예상한 시험은 관찰 일기도 동물 태그가 있어 2개가 나왔다. 검색은 정상이고 시험 키워드를 고유 제목으로 수정한 뒤 통과했다.
- 전체 12장 미리보기를 실제 관찰했다. 배경 장식과 제목/하단 안내가 겹치는 부분은 제목 시작 x=220·하단 안내 x=220으로 조정하고 다시 렌더·관찰했다.
- 증거: public/templates/validation.json, browser-validation.json, artifacts/template-library/all-templates.png.
- 앱 전체 빌드·기존 회귀 시험, 실제 편집기에서 템플릿 선택/사진 교체, 템플릿 12종의 PPT/PDF 출력 검증은 미실시다. Claude의 동시 앱 수정에 영향을 주지 않도록 별도 Vite 인스턴스와 검수 서버만 사용 후 종료했다.

## 라이선스와 재생성

직접 구성한 레이아웃·안내 패널은 CC0-1.0이다. 기존 배경·캐릭터·스티커에 포함된 Microsoft 그림은 MIT를 유지한다. 원본 파일은 기존 자산의 고지 메타데이터를 유지하고, 합성 미리보기 PNG에도 전체 고지를 추가했다. PPT/PDF 등 합성 출력의 고지 보존은 ASSET_LIBRARY_READY.md와 BACKGROUNDS_READY.md의 인계대로 처리한다.

```powershell
# 기존 독립 도구 의존성이 없을 때만 설치. root package.json은 변경하지 않는다.
npm install --prefix artifacts/asset-toolchain --no-audit --no-fund @resvg/resvg-js@2.6.2
node template-pipeline/build.cjs
node template-pipeline/render.cjs
node template-pipeline/check.cjs
```

build는 기존 public/library와 public/backgrounds를 읽어 문서와 PNG 자산을 구성한다. render는 Vite를 별도 포트로 띄워 현재 앱 모듈을 읽고 원본·미리보기를 생성한 후 종료한다. check는 public 파일만 제공하는 별도 서버로 검색·분류·다운로드를 검사한다. 이 작업으로 Phase 6이나 템플릿 UI 기능을 완료했다고 보고하지 않는다.
