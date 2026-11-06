# 그림 배경 16종

2026-11-06. 내장 image_gen으로 한 장씩 생성하고 매번 프로젝트에 저장했다. 기존 24종과 별도로 public/backgrounds-illustrated/png/에 PNG 16장을 보관한다. 기존 배경 manifest는 변경하지 않았다. **2026-11-06에 앱 배경 패널에 연결했다.** 패널에서 이 16종이 기존 24종보다 먼저 나온다.

구름 고래, 산호 정원, 달토끼 우주, 숲속 도서관, 공룡 계곡, 미술 공방, 벚꽃 소풍, 여름 해변, 가을 캠핑, 겨울 마을, 열기구 축제, 보물섬, 로봇 공방, 펠트 꽃밭, 색종이 동네, 별빛 음악 여행.

각 이미지의 생성 화면을 직접 관찰했다. 가운데는 글씨와 사진용 여백을 두고 그림을 가장자리에 배치했다. 달토끼·가을 캠핑·음악 여행은 흰 글씨를 권한다. safeRect는 시각적으로 정한 권장 영역으로 픽셀 대비 측정값이 아니다. 공룡과 색종이 동네는 하단 풍경이 높아 권장 영역을 줄였다. 음악 그림은 장식용이며 악기 구조·악보 교육용 자료가 아니다.

모두 1672×941 PNG로 생성됐다. 정확한 16:9에서 약 0.05% 차이가 나며 기존 center-cover로 표시하면 높이 약 0.5px 정도가 잘린다. 이미지 리사이즈·재압축은 하지 않았다. 원본 이미지 데이터는 그대로 두고 저장 스크립트가 출처 설명 tEXt 청크만 추가했다. 원본은 Codex generated_images에도 남아 있다.

manifest.json에는 기존 ProvidedBackground에 필요한 image, thumbnail, width, height, pngSha256, recommendedTextColor와 생성 프롬프트 경로를 기록했다. thumbnail은 320×180 PNG(thumbnails/, 전체 약 2MB)를 가리킨다. 생성 프롬프트 원문은 prompts/*.txt에 있고 배포 결과에는 넣지 않는다.

연결 방식: `loadBackgrounds`(src/assets/library.ts)가 이 manifest와 기존 배경 manifest를 함께 읽어 합친다. 기존 manifest는 background-pipeline이 다시 만들고 template-pipeline이 읽으므로 합치지 않았다. 배경 선택은 기존 loadBackgroundImage → setBackground 경로를 사용한다. 원본 PNG는 바이트 그대로 내려받아 문서에 넣으므로 해시와 출처 설명이 유지된다. PNG License 청크는 AI 생성 출처 설명이다. 기존 Fluent Emoji MIT/CC0 자산과 다른 출처이며 MIT 또는 CC0라고 표기하지 않았다. 현 notices.ts는 MIT 문구만 출력에 옮기므로 이 출처 설명은 PDF·모양 그대로 PPT에 들어가지 않는다. 편집용 PPT에서도 비율이 정확한 16:9가 아니라 `coverImage`가 JPEG로 다시 만들므로 이 설명이 빠진다. 원본 파일(.canvacraft)에는 PNG 그대로 남는다.

앱에 연결한 뒤 16장 모두 선택·원본 저장·새 프로필에서 다시 열기·PPT 2종·PDF 출력을 시험했다(tests/e2e/library.spec.ts). 16장을 모두 쓴 작품의 크기는 원본 파일 38.7MB, 편집용 PPT 9.5MB, 모양 그대로 PPT 8.6MB, PDF 8.5MB다. 생성 당시에는 개별 파일 저장 결과와 생성 화면을 관찰했다. 중간 메타데이터 교체용 apply_patch 한 번이 중복 경로로 거절됐으나, 장별 JSON 파일로 바꿔 저장을 재실행해 해결했다. 초기 PROGRESS.md 루트 조회는 실패했고 실제 docs/PROGRESS.md를 읽었다.

이어 만들 때는 17번부터 새 파일명을 사용한다. illustrated-background-pipeline/save.cjs가 기존 PNG 덮어쓰기를 거절하며 장별 프롬프트와 manifest를 함께 기록한다. 저장한 뒤 `node illustrated-background-pipeline/thumbnails.cjs`로 미리보기를 만들고, tests/contracts/library.spec.ts와 tests/e2e/library.spec.ts의 수량을 고친다. 장당 2~3MB이므로 실행 파일과 배포 결과가 그만큼 커진다.
