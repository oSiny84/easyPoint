# 배경 24종 연결 인계

연결 완료(2026-11-06): 배경 패널·디자인 패널에 분류·검색·카드를 연결했고, 해시·크기·라이선스를 확인해 원본 PNG 그대로 쓴다. 새 글씨의 첫 색은 recommendedTextColor를 쓴다. 작품 저장·PPT·PDF 왕복을 시험했다.

2026-11-06. Phase 5 병행 자산 작업. **앱 코드·package.json·잠금 파일·기존 library·PROGRESS.md는 수정하지 않았다.** public/backgrounds/, background-pipeline/, 이 문서만 추가했다. 배경 패널 연결·작품 저장·출력 통합은 아직 하지 않았다.

## 준비된 배경

| 분류 | 4종 |
|---|---|
| 기본 | 따뜻한 종이, 민트 바람, 보랏빛 아침, 복숭아빛 곡선 |
| 학교 | 파란 공책, 초록 칠판, 미술 시간, 책과 함께 |
| 자연 | 숲속 산책, 바다 친구들, 구름 위 하늘, 우주 탐험 |
| 축하 | 생일 파티, 알록달록 축제, 반짝이는 칭찬, 마음을 전해요 |
| 계절 | 봄꽃 소풍, 여름 바닷가, 가을 나뭇잎, 겨울 눈송이 |
| 동화 | 구름 나라, 별빛 캠핑, 무지개 마을, 공룡섬 탐험 |

원본 PNG 24개(2560×1440), 미리보기 24개(320×180), 자체 포함 SVG 24개. 전체 public/backgrounds/ 약 2.46MB. 모두 16:9·불투명이며 빈 제목·샘플 글씨가 이미지 안에 들어 있지 않다. 검수 페이지의 글씨·점선은 미리보기용 HTML 오버레이다.

기존 요소 자산의 평면 스타일을 이어서 네이티브 SVG로 구성하고 Resvg로 PNG를 만들었다. AI 이미지 생성·외부 사진 수집은 사용하지 않았다. 장식은 가장자리 중심이다. 논리 1280×720에서 safeRect={x:220,y:120,width:840,height:480}을 안내 영역으로 제공한다. 이 영역에만 텍스트를 놓도록 강제하는 기능은 아니다.

미리보기: 개발 서버 실행 중 http://127.0.0.1:5173/backgrounds/preview.html

## manifest와 연결

public/backgrounds/manifest.json의 assets 배열을 읽는다. 각 항목은 id, label, category, tags, image, thumbnail, svg, width/height, logicalWidth/logicalHeight, safeRect, recommendedTextColor, sampledMinTextContrast, licenses, sourceAssetIds, pngSha256, sourceSha256을 가진다. packId는 canvacraft-backgrounds-24, schemaVersion=1이다.

1. 배경 패널에 분류 칩·검색·thumbnail 카드를 연결한다. URL은 /backgrounds/로 시작하는 앱과 같은 origin 경로다.
2. 클릭하면 image PNG를 가져와 파일 헤더·크기·해시를 확인한다. 내장 자산이므로 PNG의 License 메타데이터를 보존한 채 기존 AssetStore에 넣는다. 사용자 업로드 사진의 EXIF 제거 경로와 구분한다.
3. PNG 바이트 SHA-256을 assetId로 사용해 문서의 assetManifest에 등록하고 기존 setBackground 명령으로 {kind:'image',assetId,fit:'center-cover'}를 설정한다. 카탈로그 id를 assetId로 쓰지 않는다.
4. 16:9 원본이라 16:9 슬라이드에서는 잘림이 없다. 기존 요소·글씨·사진과 앞뒤 순서를 바꾸지 않는다. 배경 선택 1회=취소 1회다.
5. 칠판·우주·밤 캠핑은 흰색 글씨를 권한다. recommendedTextColor는 안내/새 텍스트의 추천값이며, 이미 있는 글씨 색을 묻지 않고 일괄 변경하는 명령이 아니다.
6. 배경이 원본 파일 안에 실제 Blob으로 저장되어 인터넷 없이 재편집되는지, PPT/PDF에서도 비율·색·기존 요소가 유지되는지 통합 시험한다. 이 단계는 아직 미실시다.

## 라이선스

배경의 직접 작성한 배치·기하학 그림은 CC0-1.0이며 기존 Fluent Emoji 그림을 포함한 배경에는 Microsoft MIT 조건이 함께 적용된다. sourceAssetIds와 원래 library manifest에서 포함 그림의 출처를 추적한다. 상류 커밋은 배경 manifest의 sourceCommit에 고정했다.

public/backgrounds/licenses/에 고지를 넣었고, SVG metadata와 PNG License tEXt에도 해당 고지를 넣었다. Canva의 로고·템플릿·사진은 사용하지 않았다. 원본 PNG 바이트를 유지한 원본 ZIP/편집형 PPTX에는 고지가 따라간다. 합성 PDF·이미지형 PPTX처럼 메타데이터가 사라지는 출력에는 별도 전체 라이선스 고지 보존이 필요하다(ASSET_LIBRARY_READY.md의 출력 인계와 동일). 앱이 재인코딩한다면 고지를 다시 포함해야 한다.

## 실제 검증

- Resvg 2.6.2로 실제 24종 렌더. 모든 원본 2560×1440, 모든 픽셀 알파 255 확인.
- 추천 글씨 색과 safeRect의 12 논리px 간격 표본 대비 최소 7.19:1. 모든 픽셀·실제 사용자의 텍스트 색에 대한 가독성 보장은 아니다.
- Chromium 158.0.8127.18에서 원본·미리보기 48개 모두 디코딩. 24개 ID, PNG 해시·크기·License 청크 확인. 계절 분류 4개, 우주 검색 1개 확인. JS 오류·타 origin 요청 0건.
- 전체 24개와 글씨 예시·배치 영역을 켠 24개를 브라우저 캡처로 직접 관찰했다. 가을 잎이 안내 영역에 들어온 문제는 장식을 이동해 수정 후 재검사했다.
- 검수 뒤 Python 통계 출력에서 한글 콘솔 인코딩 오류가 났다. 이미지 생성·브라우저 검사는 성공한 상태였으며 UTF-8 출력 설정 후 통계를 다시 확인했다.
- 증거: public/backgrounds/validation.json, browser-validation.json, artifacts/background-library/all-backgrounds.png, text-placement.png, examples.png.
- 앱 전체 회귀는 Claude의 동시 작업과 겹치므로 실행하지 않았다. 연결 후 기존 flow 시험을 수행한다.

## 재생성

```powershell
# 기존 요소 팩과 분리된 도구 의존성을 사용한다.
npm install --prefix artifacts/asset-toolchain --no-audit --no-fund @resvg/resvg-js@2.6.2
node background-pipeline/build.cjs
node background-pipeline/check.cjs
```

build는 public/library의 기존 원본 SVG와 라이선스를 읽기만 한다. 완성된 배경 SVG는 필요한 그림을 base64로 포함하므로 출력물 사용 시 library의 SVG 경로를 추가로 요청하지 않는다. check는 임시 정적 서버 포트를 사용하므로 기존 Vite 서버·작업 중인 앱을 변경하지 않는다.
