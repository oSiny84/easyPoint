# CanvaCraft Phase 1 데이터·명령·저장·출력 계약

2026-11-06 UI 확정: UI_REFERENCE.md가 화면·패널·조작의 기준이다. 차트는 첫 버전에서 제외하고 요소 패널에 도형·캐릭터·스티커를 추가한다. 기존 이미지 요소·명령·저장·출력 경로를 사용하며 출시 자산 목표는 120개다. Phase 4는 배치·선택 조작, Phase 5는 요소 라이브러리 연결, Phase 10은 전체 자산 확보를 진행한다. UI 기준 대기는 해제됐다.

## 사용자 확정 요구: Canva 편집기 UI 일치

2026-11-06 사용자 지시: 아이들이 Canva에 익숙하므로 별도의 어린이용 UI로 재설계하지 않는다. 사진·배경·그리기·글씨와 슬라이드 관리에서 Canva와 같은 화면 배치, 메뉴 접근 경로, 선택·이동·크기 조절·글씨 편집 흐름을 필수 기준으로 삼는다. 첫 버전 기능 범위에 도형·캐릭터·스티커 라이브러리를 추가하고 차트는 제외한다. Phase 2 시험 화면의 배치는 최종 UI 기준이 아니다.

사용자가 지정한 한국어 소개 페이지의 25초 동영상에서 편집 화면을 직접 관찰했다. 관찰 기준과 미확인 부분은 docs/UI_REFERENCE.md를 따른다. 실제 계정의 편집기 조작은 아직 수행하지 않았다. 기존 계획의 도구·슬라이드 목록 위치와 이전 대화의 배치 제안은 영상에서 확인한 배치로 대체한다. 영상에 없는 세부 메뉴는 UI_REFERENCE.md의 제품 결정으로 확정했다. 실제 Canva 관찰 사실과 구분한다.


작성일: 2026-11-06

상태: 공통 기술 설계. AI별 담당 없이 현재 작업하는 AI가 전체 범위를 이어서 개발한다. Phase 2 측정 결과와 Phase 3 구현 중 정한 내용을 2026-11-06에 반영했다. 측정 근거는 PHASE2_RESULTS.md에 있다. 코어(문서·명령·취소·최소 저장·출력)는 src/에 구현되어 있고 편집 조작은 Phase 4부터 붙인다. 사용자 결정은 DESIGN_REVIEW_2026-11-06.md §7에 기록된 내용을 따른다. 수치 한도는 아래에 명시한 초기 계약안이다.

## 1. 적용 범위와 문서 관계

| 구분 | 계약 |
|---|---|
| 사용자 결정 | 작품 여러 개 보관, 작품별 로컬 삭제, 요소 복제 버튼, Windows PowerPoint 데스크톱 공식 지원, RAM 8GB 일반 PC 기준 |
| 이 문서 | 데이터 필드, 모든 편집 명령, 저장 일관성, 원본 검사, 렌더링·출력 경계 |
| 입력 설계 | 화면·입력·포커스·도구 전환·사용자 안내는 현재 작업 AI가 필요한 단계에서 구체화한다. 별도 담당 문서는 필수가 아니다 |
| Phase 2 결정 | 줄 측정(§3), PPTX 줄바꿈·글꼴·세로 위치·배경(§8), PDF 코덱(§8), 획 오차(§3), 이모지(§3)는 결정 완료. 패키지 버전은 package.json과 잠금 파일에 고정. iPad·HEIC 지원과 8GB 기기 성능은 기기 시험 전까지 미결정 |

DEVELOPMENT_PLAN.md의 초기 필드·한도·단일 작품 관련 설명과 충돌하면 이 계약의 구체적인 규칙을 적용한다. 검토서의 권고가 모두 실행 검증된 사실은 아니다. Phase 2 미결정을 임의의 라이브러리 기본값으로 확정하지 않는다.

## 2. 상태의 소유자와 저장 형태

문서 변경은 dispatch만 수행한다. 문서는 변경 불가능한 값으로 취급하며 바뀌지 않은 부분은 참조를 공유한다. UI는 임시 드래그·조합 입력만 보관하고 확정 시 명령을 보낸다. 저장과 출력은 특정 revision의 읽기 전용 스냅샷을 받는다.

| 객체 | 저장 필드와 의미 |
|---|---|
| Project | schemaVersion=1, id, title, revision, createdAt, updatedAt, width=1280, height=720, slides, assetManifest |
| Slide | id, background, elements. elements 배열 순서가 뒤→앞 그리기 순서 |
| Background | kind=solid와 color 또는 kind=image와 assetId, fit=center-cover |
| TextElement | id, type=text, x, y, width, text, fontId, fontSize, bold, color, align, lineHeight |
| ImageElement | id, type=image, x, y, width, height, assetId. 비율 유지, 회전·자르기 없음 |
| StrokeElement | id, type=stroke, x, y, points, color, strokeWidth. points는 요소 내부 논리 좌표의 평탄 배열 [x0,y0,x1,y1,...]. 점이 많아 쌍 배열보다 메모리가 적고 Konva 입력과 같다 |
| Asset | id=정규화 바이트의 SHA-256, mime=image/png 또는 image/jpeg, pixelWidth, pixelHeight, byteLength |
| ProjectSummary | projectId, title, updatedAt, revision, thumbnailRevision, 첫 장의 작은 미리보기 참조 |

Asset의 실제 Blob은 문서 밖에서 해시로 참조한다. 원본 파일명·원본 바이트·EXIF·object URL은 저장하지 않는다. 사진은 사용자에게 '사진 1' 같은 이름으로 표시할 수 있지만 원래 파일명은 내보내기에 포함하지 않는다.

텍스트 height와 획 width·height는 저장하지 않는다. 텍스트 높이는 layoutText, 획 영역은 points와 strokeWidth에서 계산한다. 문서 검사는 DOM을 쓰지 않으므로 글씨가 슬라이드와 겹치는지는 개행 수로 구한 최소 높이로 판단한다. 사진의 width·height는 저장된 표시 크기다. 모든 요소에 같은 width·height 필드를 강제하지 않는다.

선택·활성 도구·현재 장·확대율·폰트 로딩 상태·되돌리기 기록·미리보기는 문서 원본이 아니다. 미리보기는 삭제·재생성 가능한 파생 저장물이다. 순서 정보를 배열과 zIndex 양쪽에 저장하지 않는다.

## 3. 좌표·텍스트·손그림

### 좌표

화면 좌표에서 캔버스 오프셋과 표시 배율을 제거해 논리 좌표로 변환한다. 기기 픽셀 비율은 렌더링 해상도에만 적용한다. PPTX 변환은 px/96 inch, px×9525 EMU, PDF는 px×0.75 point다. 소수 논리 좌표의 EMU는 마지막에 정수로 반올림하며 구조 비교 허용 오차는 1 EMU다.

구현은 Konva scale을 쓰지 않고 손잡이 위치에서 논리 width·height 또는 글씨 크기를 직접 계산한다(src/editor/geometry.ts). 저장된 좌표와 렌더러 scale을 동시에 누적하지 않는다. UI에서 요소를 완전히 화면 밖으로 밀어낼 수 없게 하며, 전체가 들어가는 크기라면 슬라이드 내부로 제한한다. 슬라이드보다 긴 텍스트는 상단을 유지하고 넘침을 안내한다.

### 텍스트

layoutText(text, style, width, fontRegistryVersion)는 줄별 문자열·원문 범위·위치·전체 높이를 반환한다. 화면·미리보기·PDF·이미지 PPTX가 이 결과를 사용한다. 명시적 개행과 자동 줄바꿈을 구분하고 원본 text에 자동 개행을 삽입하지 않는다. 글자 묶음(grapheme)을 쪼개지 않는다.

줄 측정 함수는 src/rendering/text/에 둔다. 출력도 동일 함수를 사용하며 별도 줄 계산기를 만들지 않는다. 줄 측정은 숨긴 DOM 요소에서 Range로 읽는다. 측정 요소와 textarea에는 동일 폭·폰트·줄 간격과 `white-space:pre-wrap; overflow-wrap:anywhere; word-break:keep-all`을 적용한다(Phase 2 결정: 캔버스 글자 단위 계산은 textarea와 40개 중 16개에서 줄이 달랐고, keep-all은 PowerPoint 자동 줄바꿈과 40개 모두 일치했다). 편집 영역·측정 요소·캔버스는 `lang="und"`로 둔다. Noto Sans KR의 공백 폭이 lang=ko에서만 달라져 글자가 옆으로 움직이기 때문이다. 캔버스 글자는 CSS 줄 상자와 같은 기준선((줄 높이 − 글꼴 상하 높이)/2 + 위 높이)에 그린다. 같은 입력의 결과는 캐시한다. 가운데·오른쪽 정렬은 줄 끝 공백 처리를 Phase 6에서 측정한다.

좌우 손잡이는 width만, 모서리 손잡이는 width와 fontSize를 같은 비율로 바꾼다. 세로 손잡이는 없다. fontSize는 논리 px, lineHeight는 배수다. 크기 선택 버튼은 4px 간격을 기본으로 하되 모서리 조절 결과는 소수값을 허용한다. PPTX 글씨 크기가 항상 정수 pt라는 보장은 하지 않는다.

fontId는 앱 내 고정 등록표(`src/rendering/text/fonts.ts`)의 ID다. 기본 ID는 sans-ko(Noto Sans KR 400/700, @fontsource 5.3.1)이고 round-jua(Jua), block-dohyeon(Do Hyeon), hand-gamja(Gamja Flower), hand-pen(Nanum Pen Script), hand-gaegu(Gaegu 400/700)를 함께 제공한다(@fontsource 5.3.0). 편집용 PPTX는 모두 맑은 고딕으로 대응한다(§8). 등록표에는 파일 URL, 버전/해시, 지원 굵기, 라이선스를 기록한다. 이름만 지정해 PC의 임의 글꼴을 쓰지 않는다. 외부 폰트 서비스는 사용하지 않는다. 실제 굵은 파일이 있는 폰트에만 bold를 허용한다.

내용과 굵기를 포함한 폰트 로딩이 성공한 후 layoutText를 실행한다. 새 글자 입력·작품 열기·출력에 같은 준비 절차를 사용한다. 실패 시 대체 글꼴 결과를 정상 출력으로 확정하지 않고 재시도·오류 안내를 제공한다. 폰트 사용 조건은 docs/asset-licenses.md에 기록한다. 이모지는 입력을 허용하고 글자 묶음을 쪼개지 않으며, 그림 모양은 기기마다 다를 수 있다고 안내한다.

새 빈 글씨 상자는 UI 초안으로 유지하고 내용 확정 때 addText한다. Esc와 다른 곳 누르기는 입력 확정이고, 입력 취소는 입력 칸의 되돌리기가 맡는다. 빈 상태로 끝나면 명령·기록을 만들지 않는다. 기존 글씨를 모두 지우고 확정하면 deleteElement로 처리해 취소할 수 있게 한다. 공백·개행만 있는 경우도 빈 글씨다.

### 획

첫 버전은 획 이동만 허용하고 크기 변경은 허용하지 않는다. 확정 시 선에서 논리 0.5px 이하를 허용 오차로 점을 줄이고 좌표를 소수 한 자리로 정규화한다(Phase 2 결정: 점 74% 감소). 그래도 획당 상한을 넘으면 오차를 늘려 맞추고 그림을 버리지 않는다. 입력 좌표는 슬라이드 안으로 고정하며, 입력 취소·Esc·포인터 캡처 상실은 획을 버린다. 먼저 닿은 포인터만 따라간다. 획 지우개는 문지른 경로 사이도 검사하고 지운 획마다 취소 기록 하나를 남긴다. 그리는 중인 획은 별도 레이어에 직접 그리고, 끌리는 요소는 끄는 동안 별도 레이어로 옮긴다. 300획 문서에서 입력 처리 p95가 그리기 109ms→1.6ms, 끌기 56.7ms→1.5ms로 줄었다. 클릭 한 번도 한 점짜리 획으로 저장하고 둥근 점으로 그린다.

영역은 점 범위에 선 굵기 절반을 더해 계산한다. 출력 PNG는 여기에 논리 2px 여백을 추가하고 2배 해상도로 그린다. 연속한 획은 한 PNG로 합치되 다른 요소 사이를 넘어 묶지 않는다. 한 획 지우기는 요소 삭제 한 번이다.

## 4. 명령 계약과 취소

dispatch(projectId, expectedRevision, command)는 성공 시 revision·영향받은 slideId·문서 변경 여부를, 실패 시 code·사용자 메시지를 반환한다. 잘못된 요청은 부분 적용하지 않는다. projectId 또는 revision 불일치, 읽기 전용 세션, 유효하지 않은 값은 실패다. 변화가 없는 명령은 revision과 취소 기록을 늘리지 않는다.

| 명령 | 입력 | 추가 실패 조건 | 취소 단위 |
|---|---|---|---|
| renameProject | title | 제목 한도 초과 | 이름 확정 1회 |
| addSlide | afterSlideId 또는 첫 위치 | 장 수 한도, 존재하지 않는 기준 장 | 1장 추가 |
| duplicateSlide | slideId | 한도 초과 | 1장 복제 |
| deleteSlide | slideId | 마지막 한 장, 대상 없음 | 1장 삭제 |
| clearSlide | slideId | 대상 없음 | 내용·배경 초기화 1회 |
| reorderSlide | slideId, toIndex | 범위 밖 인덱스 | 이동 1회 |
| setBackground | slideId, background, 새 사진이면 asset | 자산 누락, 잘못된 종류 | 배경 선택 1회 |
| addImage | slideId, assetId, x,y,width,height, 새 사진이면 asset | 자산 누락, 크기·비율 위반 | 사진 추가 1회 |
| addText | slideId, 텍스트 필드 | 빈 글씨, 폰트 미등록 | 첫 입력 확정 1회 |
| updateText | slideId, elementId, text/style/width | 텍스트 아님, 값 위반 | 편집 묶음 1회 |
| addStroke | slideId, 확정된 획 필드 | 점 수·좌표 한도 위반 | 획 1개 |
| updateStrokeStyle | slideId, elementId, color/strokeWidth | 획 아님, 값 위반 | 서식 변경 1회 |
| moveElement | slideId, elementId, x,y | 대상 없음, 좌표 위반 | 드래그 1회 |
| resizeImage | slideId, elementId, x,y,width,height | 사진 아님, 비율 위반 | 드래그 1회 |
| resizeText | slideId, elementId, x,y,width,fontSize | 텍스트 아님, 값 위반 | 드래그 1회 |
| reorderElement | slideId, elementId, toIndex | 대상·인덱스 없음 | 앞뒤 변경 1회 |
| duplicateElement | slideId, elementId | 요소·점 수 한도 초과 | 복제 1회 |
| deleteElement | slideId, elementId | 대상 없음 | 삭제 1회 |

새 사진의 자료 등록은 별도 명령을 두지 않고 addImage·setBackground의 asset으로 같은 작업에서 처리한다. 되돌리면 등록도 함께 되돌아가고, 사진 Blob은 문서 밖에 남는다. 슬라이드·요소의 새 ID는 명령 처리기가 생성하고 작품 안에서 중복되지 않아야 한다. 요소 복제는 원본 바로 앞에 배치하고 x,y에 각각 20px을 더한 뒤 화면 안으로 보정한다. 사진 자산은 공유한다. 슬라이드 복제는 모든 요소 ID를 새로 만들고 원본 장 다음에 놓는다. clearSlide는 흰 배경과 빈 elements로 되돌린다.

updateText에 빈 내용이 들어오면 같은 원자적 작업에서 삭제로 처리한다. UI가 별도 삭제를 보내도 되지만 동일 편집에 두 기록을 만들지 않는다. 텍스트 편집 묶음은 입력 시작부터 포커스 이탈·슬라이드 이동·내보내기·명시 확정 중 먼저 발생한 시점까지다. 조합 중 강제 확정은 하지 않고 compositionend를 기다린다. 입력 세션 중 텍스트 내부 취소는 textarea가 담당하고 확정 후 문서 취소가 담당한다.

undo/redo는 문서 저장소 API이며 작품 전체 기록을 사용한다. 각 항목은 이전·다음 문서 내용 참조와 관련 slideId를 가진다. revision·updatedAt은 내용과 분리해 관리한다. undo/redo도 현재 revision+1을 발급하며 예전 revision 번호를 복원하지 않는다. 명령·취소·다시 실행마다 updatedAt을 갱신한다.

기록의 장이 복원되면 그 장으로 이동한다. 기록 적용 후 해당 장이 없어지면 기존 순서에서 가장 가까운 남은 장을 선택한다. 사라진 요소의 선택은 해제한다. 작품 이름 변경은 현재 장을 유지한다. 취소 후 새 명령은 redo 기록을 비운다. 저장·출력·선택 변경은 취소 기록을 만들지 않는다.

초기 취소 한도는 500개와 추정 고유 문서 노드·점 데이터 32MiB 중 먼저 도달하는 값이다. 넘으면 오래된 기록부터 비운다. 사진 Blob은 계산과 복제에서 제외한다. 추정은 객체 단위로 한 번만 세어 구조 공유를 중복 합산하지 않는다(Phase 3 시험: 300획×200점 문서 0.95MiB에서 사진 이동 500회 기록이 1.08MiB). 현재 문서도 합계에 포함한다. 대표 획 100개 전의 사진 이동까지 취소되는지를 별도로 확인한다. 무제한 취소나 재시작 후 기록 복원은 보장하지 않는다.

## 5. 파일 검사와 초기 상한

원본 파일과 IndexedDB 읽기는 동일 validateProject를 통과한다. 런타임 명령도 같은 필드 검증을 사용한다. JSON의 알 수 없는 필드는 schemaVersion=1에서 거부하고 원본을 변경하지 않는다. 지원하지 않는 새 버전은 읽기 실패로 안내한다.

| 대상 | 초기 상한·허용 규칙 |
|---|---|
| 제목·텍스트 | 제목 100 Unicode code point, 상자당 텍스트 5,000 code point |
| 문서 | 1~100장, 장당 1,000요소, 작품 전체 10,000요소 |
| 획 | 획당 5,000점, 장당 200,000점, 작품당 1,000,000점 |
| 좌표·크기 | 모든 값 유한. x: -1280~2560, y: -720~1440. 사진 width: 1~1280, height: 1~720. 글씨 width: 16~1280 |
| 텍스트 스타일 | fontSize 12~240px, lineHeight 1~2, align=left/center/right, 등록 fontId, boolean bold |
| 획 스타일 | strokeWidth 1~64px, 점 좌표 x: 0~1280, y: 0~720 |
| 색 | 불투명 #RRGGBB. 대소문자는 입력 시 대문자로 정규화 |
| 사진 입력 | 파일당 20MiB, 최대 40MP, 각 변 최대 16384px. 헤더로 먼저 검사 |
| 저장 자산 | PNG/JPEG만, 각 변 최대 2560px, 파일당 20MiB, 작품당 합계 200MiB·1,000자산 |
| 원본 ZIP | 압축 파일 210MiB, 실제 해제 누적 210MiB, JSON 합계 10MiB, 항목 1,002개 이하 |

각 항목 상한과 전체 상한을 모두 적용한다. 상한은 지원 성능 보장량이 아니다. 성능은 별도의 20장 혼합 문서·300획 그림 문서로 측정한다. 한도 변경은 계약과 fixture를 함께 변경하며 공개된 schemaVersion=1 파일을 새 한도가 거부하는 경우 호환성 결정을 기록한다.

ID는 앱이 발급하는 UUID 형식, 자산 ID는 64자리 hex다. slide/element ID는 작품 내 중복을 거부한다. x,y 범위뿐 아니라 계산한 요소 영역이 슬라이드와 교차하는지 검사한다. 사진은 자산 종횡비와 0.1% 이내로 일치해야 한다. 한도를 초과하는 요소를 몰래 잘라 열지 않는다.

자산의 선언 MIME·크기·해시·파일 내용이 일치해야 한다. 헤더를 먼저 읽고 제한을 통과한 사진만 디코딩한다. 입력 PNG/JPEG/WebP도 실제 형식으로 검사하고 애니메이션은 첫 버전에서 거부한다. HEIC는 iPad 시험 전까지 미지원 안내다. ZIP 경로는 manifest.json, project.json, assets/<hash>.png 또는 .jpg만 허용하고 중복·절대 경로·상위 경로·암호화 항목을 거부한다. ZIP 헤더의 해제 크기만 믿지 않고 해제 중 실제 누적 바이트에도 제한을 적용한다.

## 6. 자산 입력·저장·삭제

importAsset(file)는 헤더 검사 → 제한된 디코딩 → 방향 보정 → 최대 긴 변 2560px 축소 → 새 PNG/JPEG 재인코딩 → 해시 계산을 수행한다. 작은 사진도 예외 없이 재인코딩한다. 불투명한 입력은 JPEG 품질 0.9, 투명한 입력은 PNG다. 앱에 포함된 내장 그림·제공 배경은 사용자 입력이 아니므로 재인코딩하지 않는다. 형식·크기·해시(색 변형은 라이선스 정보)를 확인한 원본 바이트를 그대로 문서 자산으로 쓴다. PNG에 든 라이선스 정보를 유지하기 위해서다. 원본 바이트는 저장하지 않으며 메타데이터 제거는 실제 EXIF 시험으로 확인한다. 투명 이미지에는 PNG를 사용한다. 색·방향이 바뀌는 사례도 Phase 2에서 비교한다.

IndexedDB 저장소는 projects, summaries, assets로 나눈다. 편집 잠금은 projectId별이고 저장 요청은 작품마다 직렬화한다. 저장 식별자는 projectId+revision이며(같은 작품을 쓰는 세션은 잠금으로 하나뿐이므로 sessionId는 쓰지 않는다), 저장됨은 현재 세션의 최신 revision 저장이 완료됐을 때만 표시한다.

저장 전에 Blob·해시·미리보기를 트랜잭션 밖에서 준비한다. 자산을 먼저 확정한 후 projects와 summaries를 한 트랜잭션으로 갱신한다. 이 트랜잭션의 성공이 문서 저장 확정이다. 미리보기가 준비되지 않으면 예전 이미지의 thumbnailRevision을 유지하고 새 revision의 미리보기라고 표시하지 않는다. 중간에 중단되면 고아 자산이 남을 수 있지만 이전 문서가 가리키는 자산은 유지한다.

작품 목록은 summaries만 읽는다. 원본 열기는 검증 후 새 projectId로 가져오고 revision=0으로 시작한다. 기존 로컬 작품을 덮어쓰지 않는다. IndexedDB에서 기존 작품 재개 시에는 저장 revision을 이어간다. 원본 파일의 revision은 출처 정보일 뿐 새 로컬 작품의 동시성 식별자로 쓰지 않는다.

Web Locks를 사용할 수 있으면 작품별 배타 잠금을 세션 동안 유지한다. 같은 작품의 두 번째 탭은 읽기 전용이다. 서로 다른 작품은 동시에 편집할 수 있다. Chromium에서 사용 가능함을 Phase 2에서 확인했다. 잠금이 없는 브라우저에서 무조건 쓰기를 허용하는 대체 구현은 하지 않는다. Phase 8 결정: 잠금이 없으면 읽기 전용으로 열고 원본 내려받기만 허용한다.

자산 정리는 작품 잠금 하나로 수행하지 않는다. 모든 편집 세션은 공유 catalog-session 잠금을 유지하고, 물리 삭제·고아 정리는 이 잠금을 배타적으로 얻은 뒤 수행한다. 저장·신규 작품 등록도 공유 잠금 안에서 이뤄진다. 다른 작품이나 탭이 열려 있으면 정리를 연기한다. 잠금 순서는 catalog-session → project다. 같은 작업에서 공유 잠금을 유지한 채 배타 잠금을 기다리지 않는다.

정리는 모든 저장 작품의 자료 목록(assetManifest)을 합산해 진행한다. 슬라이드에서 지운 사진도 넣은 사진 목록에 남아 다시 쓸 수 있어야 하므로 작품을 지울 때까지 보관한다. 원본 파일에는 지금 쓰는 사진만 넣는다. 자료 목록에 있지만 자료를 잃은 사진은 문서가 쓰지 않으면 오류로 보지 않고 넣은 사진 목록에서 뺀다. 편집 세션이 없어 취소·redo·가져오기·출력의 임시 참조도 없을 때만 고아 Blob을 삭제한다. 이 방식은 검토서의 '작품 잠금 직후 정리'를 여러 작품·여러 탭에 맞춰 보완한 것이다.

'이 컴퓨터에서 지우기'는 다운로드 권고와 확인 후 수행한다. 배타 catalog-session 잠금을 얻지 못하면 다른 탭을 닫도록 안내하고 삭제 완료를 표시하지 않는다. 잠금 획득 후 문서·요약·미리보기와 다른 작품이 참조하지 않는 자산을 제거한다. 다운로드 폴더의 파일이나 사용자가 외부로 보낸 파일까지 삭제하지는 않는다. 이 동작은 문서 undo 대상이 아니다.

자동 저장은 변경 후 1초 예약, 연속 편집 중 최대 5초 간격으로 시도한다. 탭이 숨겨질 때도 대기 저장을 시도하되 성공을 보장하지 않는다. 저장소 사용 가능 여부·persist 요청 결과를 확인하고 실패해도 메모리 편집과 원본 다운로드 경로를 유지한다. persist 허용을 영구 보관 보장으로 설명하지 않는다.

## 7. 모듈 API와 오류

| API | 결과와 책임 |
|---|---|
| dispatch / undo / redo | 변경된 문서·revision·영향 장 또는 오류 |
| validateProject | 값·참조·개수 검사 결과. 임의 자동 복구 없음 |
| importAsset | 정규화 Asset+Blob 또는 오류 |
| prepareRender | 필요한 자산·폰트 준비, 실패 시 중단 |
| layoutText / renderSlide(slide, assetResolver, scale) | 공통 줄 배치·미리보기·출력 렌더링. 화면은 같은 layoutText를 쓰는 Konva 표시(SlideCanvas)다 |
| saveProject / openProject | revision 확인·잠금·저장·검사 |
| serializeProject / deserializeProject | 정규화 원본 파일 생성 / 새 작품 후보 반환 |
| exportPptx(snapshot, assetResolver, mode, options, signal) / exportPdf(snapshot, assetResolver, options, signal) | Blob+warnings 또는 오류 |

예상 오류 code는 INVALID_VALUE, LIMIT_EXCEEDED, ASSET_MISSING, ASSET_INVALID, FONT_UNAVAILABLE, REVISION_CONFLICT, READ_ONLY, UNSUPPORTED_VERSION, STORAGE_UNAVAILABLE, STORAGE_FULL, EXPORT_FAILED, CANCELLED다. 예상 실패는 UI가 처리할 구조화된 결과로 반환하며 실패를 빈 문서나 성공 Blob으로 위장하지 않는다. 오류 메시지·로그에 사진 내용이나 원본 파일명을 기록하지 않는다.

현재 장과 출력 중인 한 장의 고해상도 이미지만 유지한다. 미리보기는 작은 비트맵을 캐시하고 비활성 장마다 살아 있는 캔버스를 두지 않는다. Bitmap·object URL은 사용 종료 시 해제한다. 화면용 1280px 캐시는 Phase 5 측정 후 결정한다. 애니메이션 편집기의 양파 껍질(앞 장 그림 1개)과 재생 캐시는 [animation-contracts.md](animation-contracts.md) §8의 예외를 따른다.

## 8. 출력과 네트워크 계약

입력 확정 → snapshot → 폰트·자산 준비 → 장별 출력 → 다운로드 순서를 지킨다. 중간 편집 내용은 snapshot에 섞지 않는다. 자산 누락·폰트 실패는 명시적으로 실패 처리한다. 취소 시 임시 이미지를 해제하고 부분 파일을 성공 결과로 내려주지 않는다.

편집용 PPTX의 사진·글씨는 개별 요소, 연속한 획은 투명 PNG다. 텍스트는 여백 0·상단 정렬·고정 줄 간격(fontSize×lineHeight×0.75pt)이고 lang=ko-KR이다. 글꼴은 맑은 고딕이다. 기본 글씨(sans-ko)의 글씨 크기는 논리 px×0.75×0.92, 상자 y는 fontSize×(0.07−0.25×(lineHeight−1.3))만큼 옮긴다(Phase 6에서 줄 간격 1~2로 측정). 줄 간격 배수와 PptxGenJS softBreakBefore는 쓰지 않는다. 배경은 동일한 center-cover 계산으로 16:9 JPEG(품질 0.9)를 만들어 슬라이드 배경으로 넣는다. 어린이가 PowerPoint에서 실수로 끌 수 없기 때문이다. PptxGenJS sizing은 쓰지 않는다. 출력 후 내용이 같은 사진을 한 파일로 합치고 실제 형식의 확장자를 붙인다.

기본 외 글꼴도 편집용 PPTX에서는 맑은 고딕이며 글꼴별로 크기 배율과 세로 이동을 등록표의 값으로 맞춘다. 값(배율, 세로 이동 em): sans-ko .92, .07 / round-jua .82, −.09 / block-dohyeon .77, −.1 / hand-gamja .8, −.01 / hand-pen .63, −.08 / hand-gaegu .85, −.01. 줄 간격 보정 계수 0.25는 공통이다. 글꼴 파일을 넣지 않으므로 모양은 달라지며, 내려받기 설명과 완료 안내에서 알리고 모양 그대로 PPT를 권한다. 2026-11-06 PowerPoint 재측정 결과는 PROGRESS.md §3에 있다.

PPTX 줄바꿈은 자동 줄바꿈이다. PowerPoint에서 고치기 쉽고 글씨가 상자를 넘지 않기 때문이다. 맑은 고딕과 앱 글꼴이 달라 시험 문장 40개 중 13개는 줄 나뉨이 달랐고 5개는 줄 수가 달랐으므로 편집기와 완전히 동일하다고 보장하지 않는다. 다운로드 화면에서 이 점과 모양 그대로 PPT를 안내한다. 모양 그대로 PPT는 항상 별도 선택이며 자동 대체하지 않는다. 이미 16:9인 배경은 편집용 PPT에도 다시 만들지 않고 원본 바이트를 넣는다. 슬라이드를 이미지로 합성하는 출력은 내장 그림 PNG의 라이선스 정보가 사라지므로, MIT 그림을 쓴 작품이면 모양 그대로 PPT는 첫 장 노트에, PDF는 첨부 파일 licenses.txt에 고지 전문을 넣는다. 모양 그대로 PPT와 PDF는 2560×1440 JPEG 품질 0.88 이미지/장이고 PDF 페이지는 960×540pt다. 20장×사진 3장에서 PDF 9.1MB·2.3초로 목표 30MiB·30초 안이다(합성 사진, 개발 PC).

파일명은 작품 제목의 금지 문자·제어 문자·끝 공백/마침표·Windows 예약 이름을 처리하고, 빈 이름은 '내 작품'을 쓴다. 확장자는 앱이 붙인다. 제목 자체를 저장 데이터에서 바꾸지는 않는다.

앱 스크립트·폰트·배경은 같은 origin에서 제공한다. 외부 이미지 URL, 분석 도구, 원격 에러 수집은 첫 버전에 넣지 않는다. 배포 CSP는 `scripts/prune-dist.mjs`가 `dist/index.html`의 meta로 넣는다(스크립트·글꼴은 같은 origin, 그림·연결은 같은 origin과 blob·data, 양식 전송 금지). React style 속성 때문에 style-src에 unsafe-inline을 둔다. worker는 쓰지 않는다. 영상 모드는 [video-contracts.md](video-contracts.md) §8을 따른다(같은 origin Worker, `media-src 'self' blob:`·`worker-src 'self'`). 애니메이션의 MP4 내보내기도 같은 Worker를 쓴다([animation-contracts.md](animation-contracts.md) §8). 대표 흐름의 타 origin 요청 0건을 Phase 10에서 확인했다(INTEGRATION_REPORT_2026-11-06.md). HTTPS origin으로 앱 파일을 받는 것과 사진을 서버로 올리는 것은 구분하며, 사진 업로드 API는 만들지 않는다.

## 9. Phase 반영과 완료 조건

| Phase | 반영 내용 | 인계 근거 |
|---|---|---|
| 1 | 본 계약의 입력·데이터 규칙 정리, git 기준점 준비 | 계약 변경 목록·미결정 목록. git 초기화는 개발 착수 때 수행 |
| 2 | 줄/폰트/PPTX/PDF/이모지/iPad/버전/잠금/성능 시험 | 버전·기기·실제 파일·스크린샷·측정 기록 |
| 3 | 표의 모든 명령, 불변 기록, 최소 저장·출력 전체 연결 (구현됨: tests/contracts, tests/e2e/flow.spec.ts) | 전체 명령별 실행→취소→다시 실행, 공통 fixture 왕복(tests/fixtures/sample) |
| 4 | 요소 복제, 논리 크기 계산, undo 장 이동 (구현됨: tests/e2e/select.spec.ts) | 복제 공유 자산·반복 resize·삭제된 장 복원 |
| 5 | 헤더 검사·재인코딩·메타데이터 제거·메모리 해제, 요소 라이브러리·배경 패널 (구현됨: tests/e2e/library.spec.ts) | 손상/초대형/EXIF 사진 및 20장×사진3개 시험 |
| 6 | 공통 layoutText, IME·textarea 배율, 빈 글씨 규칙 (구현됨: tests/e2e/text.spec.ts. 실제 입력기는 미확인) | 실제 한글 입력 및 기존 글씨 삭제 취소 |
| 7 | 점 단순화·단일 포인터·점 상한 (구현됨: tests/e2e/draw.spec.ts, tests/contracts/strokes.spec.ts) | 장당 300획×평균200점, pointercancel 시험 |
| 8 | 다중 작품·탭·저장 순서·가져오기·삭제 (구현됨: tests/contracts/autosave.spec.ts, tests/e2e/home.spec.ts) | 지연 저장, 탭 종료, 다른 작품 공유 사진 보존 |
| 9 | 출력 XML 구조·모양·취소·파일명, 발표 (구현됨: tests/e2e/flow.spec.ts, tests/e2e/present.spec.ts) | Windows PowerPoint 실제 편집 및 PDF 확인 (COM으로 확인. 더블클릭 열기는 미확인) |
| 10 | 네트워크·사진 정보·공용PC 삭제·사용성 (구현됨: tests/release. 사용성 관찰은 미실시) | 요청 로그, 자산 검사, 사용성 기록 |

Phase 3의 최소 저장·출력은 공통 fixture로 전체 데이터 경로를 연결하는 수준이다. Phase 8의 복구·다중 탭 처리와 Phase 9의 완성된 UI·품질 검증을 조기 완료로 간주하지 않는다. Phase 4~8은 매번 같은 fixture 전체 흐름을 재확인한다.

성능 기준 기기는 RAM 8GB 보급형 PC다. 선택 반응 100ms, 끌기·그리기 갱신 33ms를 목표로 유지한다. 개발 PC에서 끌기·그리기는 충족했고(CPU 4배 제한 포함), 끌기 시작 1회는 300획 문서에서 105ms(4배 제한 460ms)로 넘었다. 기준 기기 측정 전이므로 확정 수치가 아니다. 그림 문서는 장당 300획·평균200점, 사진 문서는 20장×3사진을 추가한다. 단순 라이브러리 문서 확인을 실행 검증으로 기록하지 않는다.

## 10. 검토서 반영 대조와 다음 작업

| 보강 번호 | 반영 위치 |
|---|---|
| 01·02 | §3 텍스트·폰트, §8 출력 미결정 |
| 03·04 | §4 revision·전체 명령, §9 Phase 3 |
| 05·06 | §5 읽기 검사·한도, §6 사진, §8 네트워크 |
| 07·09 | §3 획, §4 취소, §9 그림 시험 |
| 08·10 | §6 원자적 확정·잠금·정리, §7 메모리 |
| 11·12 | §3 좌표, §8 출력 |
| 13 | §3 빈 글씨·scale, §4 입력 묶음, §8 파일명. 세부 포인터·IME 동작은 해당 구현 단계에서 보완 |
| 14·15 | §9 조기 연결, §1·§9 버전 미결정 |
| 16·19 | §2·§6 여러 작품, §4 복제, §1 이모지·iPad |
| 17·18 | §1 공식 지원, §9 기준 기기 |

검토 권고에서 조정한 부분은 네 가지다. 기존 글씨를 비우면 undo 가능한 삭제로 처리한다. 자산 정리는 작품 하나의 잠금 대신 모든 세션과 조율한다. 소수 좌표의 EMU는 반올림 오차를 허용한다. 모서리 글씨 크기 조절은 연속 값을 유지하고 정수 pt를 강제하지 않는다.

현재 작업하는 AI는 해당 Phase에 필요한 계약을 사용하고, 수정이 필요하면 이유와 함께 이 문서를 갱신한다. 고정 담당이나 별도 입력 설계 문서 작성을 전제하지 않는다. AI 교대 시 docs/PROGRESS.md에 진행 상황과 다음 작업을 남긴다. 기준 기기 성능, 실제 한글 입력기, iPad는 미검증 상태다(PHASE2_RESULTS.md §7). 이 문서 작성만으로 Phase 1 전체 완료나 구현 완료를 선언하지 않는다.
