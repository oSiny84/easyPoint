# CanvaCraft 만화 만들기 계약

작성일: 2026-11-12.

상태: **K7의 자동 시험·문서까지 마침(2026-11-12). 사람 확인은 남아 있다.** 기획은 [COMIC_PLAN.md](COMIC_PLAN.md)이고, 기획안과 이 문서가 다르면 이 문서가 우선한다. 사용자 결정 14개는 모두 기본값으로 확정됐다(2026-11-12 "기본값으로 진행", §10). 구현하면서 달라진 점과 단계별 기록은 §9·§10에 적는다.

## 1. 범위와 다른 계약과의 관계

만화 만들기는 시작 화면의 넷째 편집기다. 칸 하나를 슬라이드의 장 하나(`Slide`)로 삼고, 칸들을 종이 한 쪽에 모으는 일은 보기·내려받기 때 한다.

- 장·요소·사진·좌표·글꼴·상한·오류 코드는 슬라이드 계약([contracts.md](contracts.md)) §2·§3·§5와 같다. 이 문서는 다른 점만 적는다.
- 구조는 애니메이션 계약([animation-contracts.md](animation-contracts.md))과 같은 방식이다. 문서 종류·저장소·원본 파일·작품 목록은 따로 두고, 장 형태·편집 명령 18개·`renderSlide`·편집 화면(`Editor`)은 슬라이드 것을 쓴다.
- 슬라이드·영상의 문서 형태·검사·명령·저장 코드·원본 파일 형식은 바꾸지 않는다.

## 2. 문서

| 객체 | 필드와 규칙 |
|---|---|
| `ComicProject` | 슬라이드 `Project`의 10개 필드(`schemaVersion`=1, `id`, `title`, `revision`, `createdAt`, `updatedAt`, `width`=1280, `height`=720, `slides`, `assetManifest`) + `kind`='comic' + `layout` + `bubbles`. 그 밖의 필드는 거부한다 |
| `layout` | 칸 배치. `'rows3'`·`'grid4'`·`'grid8'` 중 하나(§3) |
| `bubbles` | 말풍선 짝. `{ "<사진 요소 id>": "<글씨 요소 id>" }`. 키는 사진 요소, 값은 글씨 요소이고 둘은 같은 칸에 있다. 글씨 하나는 짝 하나에만 들어간다. 사진 요소가 만화 그림 묶음의 말풍선인지는 검사하지 않는다 |
| 새 작품 | 제목 '내 만화', 흰 빈 칸 하나, `layout`='grid4', `bubbles`={} |
| 되돌리기가 복원하는 내용 | `title`, `slides`, `assetManifest`, `layout`, `bubbles` |
| `ComicSummary` | `projectId`, `kind`='comic', `title`, `updatedAt`, `revision`, `panelCount`(칸 수), `pageCount`(§3 식), `thumbnailRevision`, `thumbnail`(첫 칸 320×180 JPEG) |

## 3. 쪽 구성

쪽 수는 `⌈칸 수 ÷ 한 쪽의 칸 수⌉`다. 칸은 `slides` 순서대로 왼쪽에서 오른쪽, 위에서 아래로 놓는다. 마지막 쪽의 남는 자리는 비운다.

종이는 A4이고 단위는 포인트(1/72인치)다. 여백 M=28, 제목 줄 높이 T=40, 칸 사이 G=12다.

| `layout` | 종이(가로×세로) | 열×행 | 한 쪽의 칸 수 |
|---|---|---|---|
| `rows3` | 595 × 842 | 1 × 3 | 3 |
| `grid4` | 842 × 595 | 2 × 2 | 4 |
| `grid8` | 595 × 842 | 2 × 4 | 8 |

칸 크기와 자리는 다음 식으로 정한다(`src/comic/pageLayout.ts`).

- 칸을 놓는 영역: 왼쪽 M, 위 M+T, 너비 `W − 2M`, 높이 `H − 2M − T`.
- 칸 너비 = min(`(영역 너비 − (열−1)G) ÷ 열`, `((영역 높이 − (행−1)G) ÷ 행) × 16 ÷ 9`). 칸 높이 = 칸 너비 × 9 ÷ 16.
- 칸 묶음 전체를 영역의 가로·세로 가운데에 놓는다.

| 그리는 것 | 규칙 |
|---|---|
| 종이 | 흰색(#FFFFFF) |
| 칸 그림 | 그 칸을 `renderSlide`로 그린 그림을 칸 자리에 맞춰 넣는다 |
| 칸 테두리 | 검정(#111111), 굵기 1.5포인트, 칸 자리의 바깥선 |
| 제목 | 첫 쪽에만. 작품 제목을 제목 줄 가운데에 굵은 `sans-ko` 22포인트로 쓴다. 영역 너비를 넘으면 뒤를 줄이고 `…`를 붙인다. 제목이 비었으면 쓰지 않는다 |
| 쪽 번호 | 모든 쪽. 아래 여백 가운데에 `sans-ko` 10포인트, 회색(#555555) |

쪽 조립 함수 하나(`src/comic/composePage.ts`의 `composePage`)가 만화 보기·그림 PNG·만화책 PDF에 모두 쓰인다. 포인트당 픽셀 수만 다르다. 내려받기는 3(A4 세로가 1785×2526픽셀, 약 216dpi), 만화 보기는 2다.

## 4. 명령

슬라이드 명령 18개 + 새 명령 2개다. 바꾸는 곳은 `src/state/comicStore.ts`의 dispatch·undo·redo뿐이다.

| 명령 | 입력 | 실패 조건 | 취소 단위 |
|---|---|---|---|
| 슬라이드 명령 18개 | 슬라이드 계약 §4와 같다 | 같다. 짝 맞추기 결과가 요소 검사나 개수 상한에 걸리면(예: 따라간 글씨가 칸 밖으로 완전히 나감) 명령 전체가 실패한다 | 같다(짝이 함께 바뀐 것 포함) |
| `setComicLayout` | `layout` | 허용값 아님(INVALID_VALUE). 같은 값이면 바뀌지 않음 | 1회 |
| `addBubble` | `slideId`, 말풍선 그림(`assetId`, `asset`, `x`, `y`, `width`, `height`), `text`(글씨 요소의 `x`, `y`, `width`, `text`, `fontId`, `fontSize`, `bold`, `color`, `align`, `lineHeight`) | 슬라이드 `addImage`·`addText`의 실패 조건. 글씨가 비었으면 INVALID_VALUE | 말풍선 1개 |

`addBubble`은 사진 요소를 칸의 맨 앞에 넣고 글씨 요소를 그 바로 앞에 넣은 뒤 둘을 짝으로 적는다.

### 짝 맞추기

`src/commands/comicApply.ts`가 슬라이드 명령을 슬라이드의 `applyCommand`에 넘긴 뒤 아래 규칙을 적용한다. 따라가는 글씨의 자리 계산은 `src/domain/comicBubbles.ts`의 `followBubble` 하나가 맡고, 끄는 동안의 미리 보기도 같은 함수를 쓴다.

| 명령과 대상 | 규칙 |
|---|---|
| `moveElement`, 짝이 있는 사진 | 짝 글씨를 같은 거리만큼 옮긴다. 좌표 범위(슬라이드 계약 §5)를 벗어나면 범위 끝으로 당긴다 |
| `moveElement`, 짝 글씨 | 말풍선 그림도 같은 거리만큼 옮긴다(`carryBubble`). 아이가 말풍선 가운데의 글씨를 잡고 끌어도 말풍선이 통째로 움직인다. 글씨만 따로 옮기려면 글씨 상자의 손잡이로 크기를 바꾼다(`resizeText`는 말풍선을 옮기지 않는다) |
| `resizeImage`, 짝이 있는 사진 | 배율 s = 새 너비 ÷ 옛 너비. 글씨의 자리는 사진의 왼쪽 위에서 잰 거리에 s를 곱해 다시 놓고, 너비는 s를 곱해 16~1280 안으로 맞춘다. 글씨 크기는 그대로다 |
| `deleteElement`, 짝이 있는 사진 | 짝 글씨도 지운다 |
| `deleteElement`·내용을 비운 `updateText`, 짝 글씨 | 글씨만 사라지고 짝을 뺀다. 사진은 남는다 |
| `duplicateElement`, 짝이 있는 사진 | 글씨도 복제해 복제된 사진 바로 앞에 넣고 복제본끼리 짝을 짓는다. 글씨 복제본은 사진 복제본이 옮겨진 만큼 옮긴다 |
| `duplicateElement`, 짝 글씨 | 글씨만 복제한다. 복제본은 짝이 없다 |
| `reorderElement`, 짝이 있는 사진 | 사진과 글씨를 한 묶음으로 옮긴다. 다른 요소들 사이에서 사진이 놓일 자리를 정하고 글씨를 그 바로 앞에 붙인다. 사진이 자기 글씨만 건너뛴 요청이면 다른 요소 하나를 더 건너뛴다 |
| `reorderElement`, 짝 글씨 | 글씨가 사진보다 뒤로 가면 사진 바로 앞으로 되돌린다 |
| `duplicateSlide` | 복제된 칸의 요소를 원래 칸의 요소와 순서로 맞춰 새 짝을 만든다 |
| `deleteSlide`, `clearSlide` | 사라진 요소의 짝을 뺀다 |

여기서 "앞"은 화면에서 위에 그려지는 쪽, 곧 `elements` 배열의 뒤쪽이다.

## 5. 검사

`validateComicProject`(`src/domain/comicValidate.ts`)의 순서는 다음과 같다. 원본 파일·저장소 읽기가 같은 함수를 쓴다.

1. 객체가 아니면 INVALID_VALUE.
2. `schemaVersion`이 1보다 크면 UNSUPPORTED_VERSION.
3. `kind`가 'comic'이 아니면 INVALID_VALUE("만화 작품 파일 형식이 올바르지 않아요").
4. 13개 필드 밖의 필드가 있으면 INVALID_VALUE.
5. 슬라이드와 같은 10개 필드를 슬라이드의 `validateProject`에 넘긴다.
6. `layout`이 허용값이 아니면 INVALID_VALUE.
7. `bubbles`가 객체가 아니거나, 키가 사진 요소가 아니거나, 값이 같은 칸의 글씨 요소가 아니거나, 같은 글씨가 두 번 나오면 INVALID_VALUE.

상한은 슬라이드 `LIMITS`를 그대로 쓴다(칸 100개).

## 6. 저장·원본 파일·잠금

| 항목 | 내용 |
|---|---|
| 데이터베이스 | IndexedDB `canvacraft-comic` 버전 1. `projects`(키 `id`), `summaries`(키 `projectId`), `assets`(키 `id`). 저장 순서와 규칙은 애니메이션 계약 §6과 같다(사진 먼저, 문서와 요약은 한 트랜잭션, 더 새로운 저장본은 덮어쓰지 않음, 고아 사진 정리) |
| 잠금 | `canvacraft-comic-catalog`, `canvacraft-comic-project-<id>` |
| 원본 파일 | `.canvacomic`(ZIP). `manifest.json`의 `format`은 `canvacomic`. 내부 항목·한도·사진 검사는 슬라이드 원본 파일과 같다. `format`이 다르면 "만화 작품 파일이 아니에요"로 거절한다 |
| 기억 값 | `currentProject`의 종류 `'comic'` |
| 공통 코드 | 저장·원본 파일·작품 목록·세션 코드는 `src/deck/`의 공통 틀을 애니메이션과 함께 쓴다(결정 4). 슬라이드의 `storage/database.ts`·`projectFile.ts`는 쓰지도 고치지도 않는다(예외: `projectFile.ts`가 이미 내보내는 ZIP 풀기 함수를 불러 쓴다) |

## 7. 만화 그림 묶음

`public/comic/manifest.json`에 말풍선 9종과 효과 그림 12종을 둔다. 모두 이 프로젝트에서 직접 그린 그림이다(`scripts/make-comic-assets.mjs`가 SVG를 만들고 PNG로 바꾼다).

| 필드 | 뜻 |
|---|---|
| `id`, `label`, `kind`(`'bubble'`·`'effect'`) | 이름과 종류 |
| `image`, `thumbnail`, `width`, `height`, `pngSha256` | PNG 경로, 픽셀 크기, 해시. 받은 파일의 형식·크기·해시가 다르면 넣지 않는다 |
| `defaultWidth`, `defaultHeight` | 처음 넣는 크기(1280×720 좌표) |
| `inner` (말풍선만) | 글씨가 들어갈 네모. 그림 크기에 대한 비율 `{ x, y, width, height }` |

PNG에는 `License` 글자 정보를 넣는다. 편집 화면이 이 정보가 있는 그림을 '넣은 사진' 목록에서 빼기 때문이다. 묶음을 읽지 못해도 작품은 열리고 그리기는 된다(패널에 안내만 보인다).

말풍선을 넣을 때 글씨의 처음 값은 다음과 같다: 내용 "말을 써요", 글꼴 `round-jua`, 크기 36, 색 #1F2933, 가운데 정렬, 줄 높이 1.3, 너비는 `inner` 너비, 세로 자리는 `inner`의 가운데에 한 줄이 오게 한다.

효과 글씨 6종(쾅!·두근두근·반짝!·휘익~·하하하·으악!)은 그림이 아니라 글씨 요소다. 글꼴 `block-dohyeon`, 크기 96, 종류마다 정한 색으로 칸 가운데에 넣는다.

## 8. 화면과 내보내기

| 항목 | 규칙 |
|---|---|
| 만화 패널 | 말풍선 카드 9개, 효과 그림 카드 12개, 효과 글씨 단추 6개, 칸 배치 단추 3개, 지금 크기("8칸 · 2쪽") |
| 말풍선 넣기 | 그림을 받아 작품의 사진 자료에 넣고 `addBubble`을 보낸다. 이어서 새 글씨를 입력 상태로 열고 내용 전체를 고른 상태로 둔다(바로 치면 "말을 써요"가 바뀐다) |
| 끄는 동안 | 짝이 있는 사진을 끌거나 크기를 바꾸는 동안 짝 글씨도 `followBubble`의 결과 자리에 그리고, 짝 글씨를 끄는 동안 사진도 `carryBubble`의 결과 자리에 그린다 |
| 칸 목록 | 쪽이 시작되는 칸에 "n쪽" 배지. + 타일 이름은 "다음 칸 만들기"이고 맨 뒤에 빈 칸을 만든다 |
| 만화 보기 | 상단 단추 "만화 보기". 지금 칸이 들어 있는 쪽부터 연다. 좌우 화살표·방향키로 쪽을 넘기고 Esc나 닫기로 나온다. 칸을 누르면 닫히면서 그 칸으로 간다. 보는 동안 편집 단축키는 막는다 |
| 만화책 (PDF) | 쪽마다 `composePage`(포인트당 3픽셀) 결과를 JPEG(품질 0.88)로 A4 쪽에 넣는다. 파일 이름은 작품 제목, 확장자 `pdf`. 내장 그림의 MIT 고지는 슬라이드 PDF와 같이 첨부한다 |
| 그림 (PNG) | 내려받기를 누른 때의 칸이 들어 있는 쪽 하나를 PNG로 만든다. 확장자 `png` |
| 스냅숏 | 내려받기는 시작할 때의 문서 값으로 만든다. 만드는 동안의 편집은 파일에 섞이지 않는다 |
| 취소 | 쪽과 쪽 사이에서 취소를 확인한다. 취소하면 파일을 내려주지 않는다(CANCELLED) |
| 기본 형식 | PowerPoint 2종과 칸마다 한 쪽인 PDF는 내려받기 창에 보이지 않는다 |

## 9. `Editor`에 넘기는 값

애니메이션 계약 §9의 선택 인자를 쓰고, 아래 넷을 새로 연다. 주지 않거나 쓰지 않으면 지금의 슬라이드·애니메이션 동작이다.

| 새 선택 인자 | 위치 | 뜻 |
|---|---|---|
| `EditorVariant.ownExportsOnly` | `Editor.tsx`, `TopBar.tsx`(`hideBuiltinFormats`) | 참이면 내려받기 창에 `exports`의 형식만 보인다 |
| `EditorApi.editText(elementId, selectAll?)` | `Editor.tsx` | 지금 칸의 글씨 요소를 골라 입력 상태로 연다. `selectAll`이면 내용 전체를 고른다 |
| `EditorVariant.companions(preview, slide)` | `Editor.tsx`, `SlideCanvas.tsx`(`companions`) | 끄는 요소와 함께 임시 자리에 그릴 요소들을 돌려준다 |
| `exports[].run`의 다섯째 인자 `context.slideId` | `Editor.tsx` | 내려받기를 누른 때의 장. 그림 PNG가 어느 쪽을 만들지 정하는 데 쓴다 |

만화가 넘기는 값: `save`·`serialize`·`deserialize`·`extension`('canvacomic'), `tool`(만화 + `ComicPanel`), `slideList`(`addLabel`, `badge`), `present`(만화 보기 + `ComicReader`), `exports`(만화책 PDF·그림 PNG), `ownExportsOnly`, `companions`.

### 구현 기록

| 단계 | 구현한 것과 확인 | 미룬 것·미확인 |
|---|---|---|
| K2 먼저 확인 | 시험 페이지에서 제품의 쪽 조립과 PDF 내보내기를 돌렸다. 세 배치의 쪽 그림을 열어 확인했고 100칸 PDF는 0.7~1.7초·5.4~12.1MB였다([COMIC_PHASE2_RESULTS.md](COMIC_PHASE2_RESULTS.md)) | 인쇄 |
| K3 문서·명령·저장·원본 파일 | `src/domain/comic*.ts`, `src/commands/comicApply.ts`, `src/state/comicStore.ts`, `src/comic/comicDatabase.ts`·`comicFile.ts`·`pageLayout.ts`. 저장·원본 파일의 본문은 애니메이션 코드에서 `src/deck/`로 옮긴 공통 틀이다(옮긴 직후 애니메이션 시험을 고치지 않고 통과). 계약 시험 132개(`tests/contracts/comicCommands·comicValidate·comicFile.spec.ts`: 슬라이드 명령 18개가 짝이 없는 작품에서 슬라이드 저장소와 같은 결과, 짝이 있는 작품에서 결과가 검사를 통과하고 한 번에 되돌아감, 새 명령 2개와 실패 입력, §4 짝 맞추기 표의 줄마다 한 개 이상, 거부 입력 28종, 원본 왕복·세 편집기 형식 구분·손상 파일 14종, 쪽 수와 칸 자리의 식)와 저장소 시험 6개(`tests/e2e/comicStorage.spec.ts`) | 쓰기 오류 주입 시험 |
| K4 넷째 타일·작품 목록·편집 화면 연결 | `StartScreen`·`App.tsx`·`currentProject.ts`·`Icon`·CSS, `ComicApp`·`ComicHome`·`ComicEditor`, 공통 틀 `DeckApp`·`DeckHome`(애니메이션의 목록·진입 화면도 이 틀을 쓴다), §9의 선택 인자 넷. 타일 4개가 1280·1024·700 너비에서 화면 안에 있다 | — |
| K5 만화 화면 | 그림 묶음 21개(`scripts/make-comic-assets.mjs`, 한 장에 늘어놓아 확인), `ComicPanel`, 말풍선 넣기와 내용 전체를 고른 입력 상태, 끄는 동안 짝 함께 그리기, 칸 목록 쪽 배지, `ComicReader`. 시험(`tests/e2e/comic.spec.ts` 13개): 지연 로딩, 말풍선 넣기·되돌리기(대사 한 번, 말풍선 한 번), 말풍선을 끌 때와 글씨를 끌 때 둘이 함께 움직임(끄는 동안 조작 레이어에 글씨가 그려짐), 지우기·복제, 효과 그림·효과 글씨·칸 배치, 쪽 배지, 만화 보기(쪽 넘기기·칸 누르기·단축키 차단), 저장·새로고침 복원·최근 작품 배지, 원본 왕복과 형식 구분, 내려받기 창의 형식 둘, 그림 묶음 로딩 실패, 둘째 탭 읽기 전용 | 사람이 써 보는 확인, 실제 터치 기기 |
| K6 내보내기 | `composePage.ts`, `exportComic.ts`. 시험(`tests/e2e/comicExport.spec.ts` 5개): PDF의 쪽 수·A4 크기·방향·제목이 칸 배치와 일치(4칸 1쪽, 3칸 2쪽, 8칸에 9칸 2쪽), PNG가 2526×1785이고 칸 자리의 색이 그 칸의 배경색·테두리는 검정·바깥은 흰색, 지금 칸의 쪽이 나옴, 말풍선이 그림에 들어감, 내려받기를 누른 뒤의 이름 변경이 파일에 섞이지 않음, 취소와 사진 누락 | 인쇄, RAM 8GB PC |
| K7 통합 | `npm run build` 뒤 배포본 시험 17개 통과(만화 1개 추가: 타일 4개가 화면 안, 말풍선, 효과 글씨, 5칸, 만화 보기, PDF 2쪽·A4, PNG 2526×1785, 새로고침 복원, 최근 작품 배지, 슬라이드 목록에 안 나옴. CSP 위반·외부 요청·실패 응답 0건). 실행 파일 시험(`node scripts/test-exe.mjs`, 67,174,400바이트) 모두 통과. npm test 706 통과(기존 550 + 만화 156). USER_GUIDE·RELEASE·PROGRESS·AGENTS 갱신 | 사람이 직접 써 보는 확인, 인쇄, 어린이 관찰, 커밋·프리릴리스는 하지 않았다 |

## 10. 결정 기록

2026-11-12 사용자 결정: 14개 모두 기획안 §10의 기본값.

| 번호 | 결정 | 확정값 |
|---|---|---|
| 1 | 타일 | '만화 만들기', 파랑, 말풍선 아이콘 |
| 2 | 칸과 쪽 | 칸 하나 = 장 하나. 쪽은 프로그램이 모은다. 칸 비율은 16:9 고정 |
| 3 | 말풍선 | 그림과 글씨의 짝. 꼬리는 왼쪽·오른쪽 그림 중 고른다 |
| 4 | 저장·목록 코드 | 애니메이션 코드에서 공통 틀(`src/deck/`)을 꺼내 함께 쓴다 |
| 5 | 칸 배치 | 3칸·4칸·8칸, 기본 4칸 |
| 6 | 읽는 순서 | 왼쪽에서 오른쪽, 위에서 아래 |
| 7 | 제목·지은이 | 첫 쪽 위에 제목만 |
| 8 | 내려받기 형식 | 만화책 PDF, 그림 PNG |
| 9 | 그림 묶음 | 말풍선 9종·효과 그림 12종·효과 글씨 6종을 직접 만든다 |
| 10 | + 타일 | 맨 뒤에 빈 칸 |
| 11 | 칸 수 상한 | 100 |
| 12 | 확장자 | `.canvacomic`, format `canvacomic` |
| 13 | 발표 단추 | 만화 보기 |
| 14 | 다른 편집기 | 만화 그림 묶음은 만화에서만 보인다 |

### 기획안과 달라진 점

| 기획안 | 계약 | 까닭 |
|---|---|---|
| §4 짝 글씨를 옮기면 글씨만 움직인다 | 말풍선 그림도 같은 거리만큼 옮긴다(§4) | 아이는 말풍선 가운데를 잡고 끄는데 거기에는 글씨가 있다. 글씨만 빠져나오면 말풍선이 한 덩어리로 느껴지지 않는다. 글씨만 따로 옮기는 길은 글씨 상자의 크기 손잡이로 남겼다 |
| §3 내려받기 형식은 이미 있는 인자로 더한다 | `exports[].run`에 다섯째 인자 `context.slideId`를 더 연다(§9) | 그림 PNG가 "지금 칸이 들어 있는 쪽"을 만들려면 내려받기를 누른 때의 칸을 알아야 한다 |
| §8 K2에서 말풍선 2~3개와 인쇄용 PDF를 사용자에게 먼저 보인다 | 보이지 않고 끝까지 진행했다 | 사용자가 자리에 없는 상태로 진행했다. 그림 묶음과 쪽 그림은 직접 열어 확인했고, 인쇄는 미확인으로 남겼다([COMIC_PHASE2_RESULTS.md](COMIC_PHASE2_RESULTS.md)) |
| §8 K3 `tests/e2e/comicStorage.spec.ts`에 쓰기 오류 주입 | 넣지 않았다 | 애니메이션과 같다. 저장 코드가 공통 틀이라 검사 실패·사진 누락·오래된 revision·고아 정리·잠금만 시험했다 |
| §3 `EditorApi`에 그림 등록 함수를 연다 | 열지 않는다. 대신 `editText`를 연다 | 만화 편집기가 세션의 사진 저장소를 이미 쥐고 있어 그림 등록은 직접 한다. 말풍선을 넣은 뒤 바로 글씨를 쓰게 하려면 입력 상태를 여는 함수가 필요하다 |
| §3 끄는 동안 함께 보일 요소는 K2에서 정한다 | 연다(`companions`) | `SlideCanvas`에 임시 요소를 몇 개 더 그리는 변경이라 작다. 손을 뗄 때 글씨가 튀어 따라오는 모습을 없앤다 |
| §4 `reorderElement`는 짝 글씨를 말풍선 바로 위로 옮긴다 | 사진과 글씨를 한 묶음으로 옮긴다 | 글씨만 다시 붙이면 "앞으로" 단추가 자기 글씨와 자리만 바꾸고 제자리로 돌아와 말풍선을 앞으로 보낼 수 없다 |
