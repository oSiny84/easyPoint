# Phase 5 요소 자산 준비 완료 — 앱 연결 인계

연결 완료(2026-11-06): 아래 절차는 src/assets/library.ts와 요소 패널에 구현했다. 이 문서는 자산 형식과 재생성 방법의 기준으로 남긴다.

2026-11-06. Claude의 Phase 4 작업과 병행해 **자산만** 준비했다. src/, package.json, 잠금 파일, PROGRESS.md는 수정하지 않았다. 이 문서를 다음 인계 시 PROGRESS.md에서 참조하면 된다. Phase 5 전체 구현 완료를 뜻하지 않는다.

## 결과

| 종류 | 고유 종류 수 | 내용 |
|---|---|---|
| 도형 | 24 | 원·타원·사각형·삼각형·다각형·별·하트·방향 화살표·말풍선·구름 |
| 캐릭터 | 60 | 친구·직업/동작 20, 동물 30, 공룡·상상 친구 10 |
| 스티커 | 36 | 학교·문구, 자연·날씨, 음식, 탈것·여행, 축하·감정, 놀이·운동 각 6 |

도형은 민트·보라·파랑·노랑·분홍·주황·흰색·진회색의 8색 PNG를 제공한다. 색 변경은 고유 종류 수에 포함하지 않는다. 고유 PNG 120개 + 도형 추가 색 168개 + 미리보기 120개 = PNG 408개다. PNG는 긴 변 최대 512px, 미리보기는 최대 160px, 알파 투명 배경과 안전 여백을 제공한다. 원본 SVG 120개도 보관했다. 전체 public/library는 약 3.9MB다.

미리보기: 개발 서버 실행 중 http://127.0.0.1:5173/library/preview.html

이 페이지는 자산 검수용이며 편집기 화면을 대체하지 않는다. 요소 클릭 시 실제 슬라이드 삽입은 아직 연결하지 않았다.

## 파일과 manifest

- public/library/manifest.json: 전체 목록. schemaVersion=1, packId=canvacraft-starter-120.
- public/library/png/: 삽입할 PNG. colors/에 도형 색별 PNG.
- public/library/thumbnails/: 요소 패널 카드 이미지.
- public/library/svg/: 원본. 제품 문서는 기존 계약대로 PNG를 저장·출력한다.
- public/library/licenses/: Fluent Emoji MIT 원문과 원본 도형 CC0 안내.
- public/library/validation.json, browser-validation.json: 실행한 검사 결과.
- asset-pipeline/: 재생성·검수 도구. root 패키지 의존성 변경 없이 artifacts/asset-toolchain에 resvg를 설치했다.

각 항목: id, kind(shape/character/sticker), label(한국어), category(세부 분류), tags(한국어 배열), image, thumbnail, svg, width, height, defaultWidth/defaultHeight(논리 px), license, attribution, sourceUrl/sourcePath, sourceCommit(상류 자산), sourceSha256, pngSha256. 도형에는 recolorable=true와 colorVariants 배열(id, color, image)이 있다. URL은 /library/로 시작한다.

defaultWidth는 도형 240px, 캐릭터·스티커 200px이며 defaultHeight는 PNG 종횡비로 계산한다. tall 화살표는 defaultHeight가 더 클 수 있으므로 삽입 시 슬라이드 내부로 맞춘다. 검색은 label·tags에 NFKC 정규화 후 수행한다. '고양이' 검색 결과는 1개로 브라우저에서 확인했다.

## Phase 5 연결 절차

1. 요소 패널에서 manifest를 한 번 읽고 전체/도형/캐릭터/스티커 탭과 category 칩을 연결한다. 라이브러리 종류 id와 작품의 요소 id는 구분한다.
2. 카드는 thumbnail을 지연 로딩한다. 도형 색을 고르면 선택한 colorVariants.image를 사용한다.
3. 카드 클릭 시 같은 origin의 PNG Blob을 읽는다. PNG 헤더·크기·라이선스·예상 해시를 확인한 뒤 현재 AssetStore에 등록한다. 자산 id는 **PNG 바이트의 SHA-256**이다. manifest.id를 문서 assetId로 쓰지 않는다.
4. 검증된 바이트로 Asset 메타데이터·manifest 참조를 준비한 뒤 기존 addImage 명령으로 현재 장 중앙에 넣는다. 추가 1회=취소 1회다. 새 요소 id는 명령 처리기에서 발급한다. 기존 사진·글씨를 덮어쓰지 않는다.
5. 선택·이동·비율 유지 크기 조절·복제·저장·출력은 기존 이미지 경로를 사용한다. 문서에 원격 URL만 저장하지 않는다. 라이브러리가 나중에 없어져도 원본 파일의 Blob으로 재편집돼야 한다.
6. 도형의 삽입 전 색 선택은 PNG 선택으로 구현한다. 삽입 후 채우기색 수정이나 자유 종횡비 변형은 이번 자산 연결에 포함하지 않는다.
7. 고양이·위 화살표·흰색 도형·선생님을 포함한 작품의 원본 저장→열기→PPT/PDF 출력 경로에서 투명도·순서·라이선스 보존을 확인한다. 이 앱 통합 검증은 아직 미실시다.

## 출처·사용 조건과 출력 시 보존

캐릭터·스티커 96종은 Microsoft 공식 Fluent Emoji의 Flat SVG다. 고정한 상류 커밋은 **1ffb34c752ecf5d402f04cfb4b392c77f57c54bc**이며 항목마다 정확한 원본 URL을 기록했다. 원본 SVG는 변경하지 않고 PNG 렌더에만 투명 안전 여백을 추가했다. 출처: https://github.com/microsoft/fluentui-emoji

상류 라이선스는 MIT이며 Copyright (c) Microsoft Corporation. 원문은 licenses/fluent-emoji-MIT.txt에 있다. 도형은 asset-pipeline/prepare.py에서 직접 정의한 기하학 원본이며 이 도형에 한해 CC0로 제공한다. Canva의 템플릿·이미지를 가져오지 않았다. AI 이미지 생성 도구는 사용하지 않았다.

**PNG License tEXt에 MIT 전체 고지 또는 CC0 정보를 넣었다.** 앱 패키지에는 sidecar 라이선스도 포함한다. 사용자 사진 재인코딩은 개인정보 제거를 위해 계속 수행하되, 이미 검증한 내장 PNG는 원본 바이트를 보관해 라이선스 메타데이터를 유지한다. 사진 입력과 내장 자산 입력을 구분한다.

개별 PNG가 들어가는 PPTX·원본 ZIP은 이 바이트를 유지한다. 슬라이드 합성 이미지 기반 PDF/이미지 PPTX는 원본 PNG의 메타데이터가 사라지므로, 연결 시 전체 MIT 고지를 PDF의 첨부/메타데이터 또는 PPTX의 읽을 수 있는 고지/노트 등 출력물 안에 포함하는 처리가 필요하다. 웹 미리보기의 라이선스 링크만으로 출력물의 고지 보존이 완료됐다고 처리하지 않는다. 이 출력 연결은 이번 병행 작업 범위 밖이며 Phase 5/9에서 구현·검사한다.

## 실제 검증과 한계

- Resvg 2.6.2로 120종과 색 변형을 실제 래스터링했다. 모든 기본 PNG에서 비어 있지 않음·투명 픽셀 있음·가장자리 접촉 없음, 크기 제한을 확인했다.
- Playwright Chromium 158.0.8127.18로 408개 PNG 디코딩, 탭별 개수, 고양이 검색, 도형 보라색 전환을 확인했다. JS 오류와 타 origin 요청은 0건이다.
- 고유 id 120개, 기본 PNG 120개의 SHA-256·PNG 청크 CRC·License 텍스트와 크기를 별도 검사했다.
- 4개 contact sheet로 120개 그림을 모두 보고, 브라우저 캐릭터·도형 목록 화면도 확인했다. 세로 화살표의 검수용 contact sheet 넘침을 수정하고 PNG 긴 변 제한을 맞췄다.
- 처음에 상류 명칭 차이로 수집이 멈춘 것은 실제 asset 이름으로 수정했다. SVG 내부의 로컬 clip/filter 참조를 외부 참조로 오인한 검사도 수정했다. 선생님 그림은 원본 칠판이 가장자리에 닿아 모든 PNG에 4% 투명 여백을 추가했다. 최종 검사 오류는 0건이다.
- 별도 미리보기·자산 검사만 수행했다. Claude가 수정 중인 앱의 빌드나 전체 회귀 시험은 실행하지 않았고 앱 UI·출력 통합도 아직 하지 않았다.

증거: artifacts/asset-library/sheet-1.png~sheet-4.png, catalog-characters.png, catalog-shapes.png. 검수 이미지는 재생성 가능하며 Git 제외 폴더에 있다.

## 재생성

프로젝트 루트에서 실행한다. 준비 단계만 GitHub 네트워크가 필요하다. 제품 사용 중에는 필요 없다.

```powershell
python asset-pipeline/prepare.py
npm install --prefix artifacts/asset-toolchain --no-audit --no-fund @resvg/resvg-js@2.6.2
node asset-pipeline/render.cjs
node asset-pipeline/check.cjs
```

prepare는 manifest를 원재료 상태로 다시 생성하므로 render를 이어서 실행해야 한다. check는 자기만 사용하는 임시 HTTP 포트로 검수하며 기존 Vite 서버·앱 코드에 영향을 주지 않는다. 앱 전체 시험은 담당 AI가 Phase 4/5 통합 시 기존 절차로 실행한다.
