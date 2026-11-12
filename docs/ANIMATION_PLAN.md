# CanvaCraft 어린이 스톱모션 애니메이션 기획과 단계별 개발 계획

작성일: 2026-11-10. 같은 날 다시 씀(구조를 "저장은 분리, 편집 부품은 재사용"으로 바꿈).

상태: **A6까지 구현, A7 진행(2026-11-10).** 이 문서는 기획 당시의 내용이다. 구현하면서 달라진 점(재생 그림 크기, 선택 인자의 실제 이름, 공통 샘플 문서 등)과 단계별 구현 기록은 [animation-contracts.md](animation-contracts.md) §9·§10에, A2 측정 결과는 [ANIMATION_PHASE2_RESULTS.md](ANIMATION_PHASE2_RESULTS.md)에 있다. 기획안을 쓸 때는 코드 수정, 브라우저 실행, 출력 시험은 하지 않았다. 아래의 코드 사실은 2026-11-10의 브랜치 `claude/kids-video-editor-planning-29695d`(v0.0.4) 소스를 읽어 확인한 것이고(문서 끝 "코드 확인 근거"), 성능 수치는 모두 추정이다. 사용자가 셋째 타일 후보 중 스톱모션 애니메이션을 골랐고, 구조는 처음 안(슬라이드 문서에 필드를 더하는 방식)을 버리고 **중간안**으로 정했다(2026-11-10 사용자 결정, §10 결정 2). DEVELOPMENT_PLAN.md §2와 VIDEO_EDITOR_PLAN.md §1은 "애니메이션"과 "손그림 애니메이션"을 후속 범위로 두었는데, 이 문서가 애니메이션 모드에 대해 그 결정을 대체한다. 슬라이드·영상 편집기의 기존 문서는 고치지 않는다.

## 3분 요약

**무엇을 만드는가.** 어린이가 한 장을 그리고 **다음 장 만들기**를 누르면 앞 장이 복사되어 조금씩 고쳐 그리고, 앞 장이 반투명하게 겹쳐 보이는 상태에서(양파 껍질) 장을 쌓아 가다가 **재생**으로 움직임을 확인하고, 배경음악을 골라 **MP4 한 개**로 내보내는 편집기다. 플립북(종이를 넘겨 보는 그림책)을 컴퓨터에서 만드는 것과 같다. 로그인·서버·업로드 없이 브라우저 안에서 끝낸다.

**어디에 붙이는가.** 시작 화면에 셋째 타일 **애니메이션 만들기**를 추가한다. 슬라이드·영상과 나란히 놓이는 별도 프로그램이다.

**구조(중간안).** 두 가지를 나눈다.

- **분리하는 것.** 애니메이션 작품은 자기 문서 종류(`AnimationProject`), 자기 저장소(IndexedDB `canvacraft-animation`), 자기 원본 파일(`.canvaanim`), 자기 작품 목록을 가진다. 영상 편집기가 `canvacraft-video`를 따로 쓰는 것과 같다. 슬라이드의 문서 형태·검사·명령·저장소·원본 파일 형식은 **바뀌지 않는다.**
- **재사용하는 것.** 장 하나의 형태(`Slide`), 편집 명령 18개, 장을 그리는 코드(`renderSlide`), 그리기·글씨·사진·선택 같은 편집 부품, 편집 화면(`Editor`), PPT·PDF 출력은 슬라이드 것을 그대로 가져다 쓴다. 애니메이션 문서는 "슬라이드 문서의 필드 전부 + 빠르기·음악·길게 보이기"로 만들어 이 코드들에 그대로 넘길 수 있게 한다. MP4 인코딩과 배경음악은 영상 편집기 것을 쓴다.

**슬라이드 쪽에서 실제로 바뀌는 파일.** 편집 화면 묶음뿐이다. `App.tsx` 안의 `Editor`를 자기 파일로 옮기고(내용 변경 없이 이동), 저장 함수·도구 목록·+ 타일 동작·재생 단추·내려받기 형식을 **선택 인자**로 받게 한다. 인자를 주지 않으면 지금의 슬라이드 동작 그대로다. `SlideList`·`SlideCanvas`·`TopBar`에도 선택 인자가 몇 개 붙는다. 슬라이드 시험 전체가 **고치지 않고** 통과하는 것이 매 단계의 조건이다.

**처음 안보다 좋아진 점.** 옛 버전과의 충돌이 없어진다. 처음 안은 애니메이션 작품이 v0.0.2 이하에서 "알 수 없는 값이 있어요"로 거부됐다. 중간안에서는 옛 버전이 애니메이션 저장소를 아예 보지 않고, `.canvaanim`을 억지로 열어도 "CanvaCraft 작품 파일이 아니에요"로 깔끔하게 거절한다(`projectFile.ts` 101행의 기존 검사). 슬라이드 작품 목록에 애니메이션 작품이 섞일 일도 없다.

**대가.** 저장소·원본 파일·작품 목록·명령 묶음을 새로 쓴다(영상 때와 같은 방식). 저장 코드 약 140줄이 슬라이드 것과 같은 모양으로 한 벌 더 생긴다(§10 결정 3, §11). 일정은 처음 안 8~13일에서 **12~18일**(§8 단계 합계, 추정)로 늘어난다. 늘어난 4~5일은 저장소·원본 파일·작품 목록·명령 묶음을 새로 쓰는 일과 `Editor`를 옮겨 인자로 여는 일이다.

**가장 큰 위험.** 처음 안과 같다. 100장을 1920×1080으로 그리는 일을 메인 스레드가 해야 한다(`renderSlide`가 DOM 캔버스와 `document.fonts`를 쓴다). A2에서 먼저 재고, 넘으면 범위를 줄인다. 둘째 위험은 `Editor` 이동과 인자화가 슬라이드 화면을 깨뜨리는 것이며, 슬라이드 e2e 시험 무수정 통과로 막는다.

**사용자가 정한 것.** §10의 14개는 2026-11-10에 모두 확정됐다(구조는 중간안, 나머지는 기본값). 웹캠으로 찍기(점토·장난감 스톱모션)는 후속이다. 계약은 [animation-contracts.md](animation-contracts.md)다.

## 1. 목표와 범위

### 어린이가 하는 일 (대표 흐름)

1. 시작 화면에서 **애니메이션 만들기**를 누른다. 애니메이션 작품 목록에서 **새 작품**을 누른다.
2. 첫 장에 배경을 고르고 그리기·요소·글씨·사진으로 그림을 만든다(슬라이드와 같은 도구).
3. 하단 장 목록의 **+** 타일("다음 장 만들기")을 누른다. 같은 그림의 둘째 장이 생기고, 앞 장이 반투명하게 깔려 보인다.
4. 요소를 조금 옮기거나 선을 더 그린다. 3~4를 반복한다.
5. 상단 **재생**을 누르면 작업 공간 위에서 장이 초당 6장(기본) 속도로 반복 재생된다. Esc나 빈 곳 누르기로 멈춘다.
6. 애니메이션 패널에서 **빠르기**(초당 장수)와 **배경음악**을 고른다. 멈춰 있어야 할 장은 장 메뉴에서 **길게 보이기**를 고른다.
7. 공유 → 내려받기에서 **영상 (MP4)**을 고르면 MP4를 내려받는다.

### 첫 버전에 넣는 것

| 기능 | 어린이에게 보이는 모습 | 제한 |
|---|---|---|
| 셋째 타일·작품 목록 | 시작 화면 셋째 타일(초록). 애니메이션 작품만 모인 목록(장 수·길이 표시). 최근 작품 카드에 '애니메이션' 배지 | 템플릿 카드 대신 '처음이면 이렇게' 안내 카드 3개 |
| 그리기 도구 | 배경·요소·텍스트·업로드·그리기 5개는 슬라이드와 같다 | 템플릿 도구 자리에 **애니메이션** 패널이 들어간다. 시작 템플릿 12종은 쓰지 않는다 |
| 다음 장 만들기 | + 타일을 누르면 지금 장이 복사되어 바로 뒤에 들어가고 그 장으로 간다 | 슬라이드의 `duplicateSlide` 명령을 그대로 쓴다. 빈 장 추가는 장 메뉴 |
| 양파 껍질 | 앞 장이 투명도 35%로 현재 장 아래에 깔려 보인다. 패널과 확대/축소 옆 단추로 켜고 끈다 | 화면 전용. 저장·출력·미리보기에 들어가지 않는다. 첫 장에서는 없다 |
| 빠르기 | 애니메이션 패널에서 초당 2·4·6·8·12장 중 선택. 기본 6 | 작품 전체 값 하나 |
| 길게 보이기 | 장 메뉴에서 보통·길게(2배)·아주 길게(4배). 장 목록 카드에 ×2·×4 배지 | 장마다 하나. 더 길게는 장을 복사한다 |
| 재생 미리보기 | 상단 **재생**(슬라이드의 발표 자리). 작업 공간 위 겹침 창에서 반복 재생, 장 번호 n / N 표시, 배경음악도 함께 | 640×360 캐시로 재생한다. 출력과 1장 어긋남과 끊김을 허용한다. 전체 화면 발표는 없다 |
| 배경음악 | 영상 편집기의 내장 음악 4곡과 크기(작게·크게) | 제공 곡만. 효과음·녹음·음악 파일 가져오기 없음 |
| MP4 내보내기 | 내려받기 창 맨 위에 **영상 (MP4)** 항목. 진행률·취소·완료 안내(형식·길이·크기, 보호자 계정 안내) | 1920×1080, 24fps. H.264+AAC가 안 되는 PC는 WebM(영상 편집기와 같은 규칙) |
| PPT·PDF | 그대로 된다(플립북 인쇄, 장마다 한 페이지) | 양파 껍질은 들어가지 않는다 |
| 저장·되돌리기·원본 파일 | 자동 저장, 작품 목록에서 다시 열기, Ctrl+Z, `.canvaanim` 원본 저장·열기 | 저장소와 파일 형식은 슬라이드와 따로다(§6) |

### 넣지 않는 것 (후속 범위)

웹캠으로 찍기(점토·장난감 스톱모션. §10 결정 11), 슬라이드 작품을 애니메이션으로 가져오기(§10 결정 14), 장별 효과음, 녹음·내레이션, GIF·애니메이션 WebP 출력, 슬라이드 작품의 MP4 내보내기, 장 수 상한 변경(100 유지), 전체 화면 재생, 장면 전환 효과, 요소를 자동으로 움직이는 중간 장 생성(트위닝). 만든 MP4를 영상 편집기에 넣는 것은 지금도 된다(내려받은 파일을 영상 가져오기로 넣는다).

### 세 편집기의 관계

| 구분 | 슬라이드 | 애니메이션(이 문서) | 영상 |
|---|---|---|---|
| 문서 | `Project` | **`AnimationProject`(별도 종류).** 장은 슬라이드와 같은 `Slide` | `VideoProject` |
| 저장소 | IndexedDB `canvacraft` | **IndexedDB `canvacraft-animation`** | `canvacraft-video` + OPFS |
| 원본 파일 | `.canvacraft` | **`.canvaanim`** | `.canvavideo` |
| 문서를 바꾸는 곳 | `state/store.ts` | **`state/animationStore.ts`**(공통 틀 `history.ts`) | `state/videoStore.ts` |
| 편집 화면 | `Editor` | **같은 `Editor`에 애니메이션 인자** | `VideoEditor.tsx` |
| 출력 | PPT·PDF | PPT·PDF + MP4(영상 Worker 사용) | MP4/WebM |
| 자산 | 그림 120·배경 40·템플릿 12 | 그림·배경 같음, 템플릿 없음, 음악 4곡은 영상 자산 사용 | 밈·효과음·음악 |

## 2. 구조: 무엇을 나누고 무엇을 함께 쓰는가

### 슬라이드 파일별 영향

| 구분 | 파일 | 내용 |
|---|---|---|
| **전혀 바뀌지 않음** | `domain/types.ts`의 `Project`·`Slide`, `domain/validate.ts`, `domain/limits.ts`, `domain/project.ts`, `commands/apply.ts`, `state/history.ts`, `storage/database.ts`, `rendering/*`, `export/*`, `app/Home.tsx`, `app/Presenter.tsx`, `editor/SelectionLayer`·`DrawLayer`·`TextEditor`·`geometry.ts`, `tests/fixtures/sample`, `tests/e2e/start.ts` | 슬라이드 작품의 형태·검사·명령·저장·출력·작품 목록 |
| **`export` 낱말만 추가** (동작 변화 없음) | `state/store.ts`의 `nearestSlide`, `storage/projectFile.ts`의 `unpack`·`declaredEntryCount`·`ENTRY`·`extensionOf`, `video/exportJob.ts`의 `choosePair` | 애니메이션 쪽이 같은 함수를 불러 쓰기 위해. 복사해 두 벌을 만들지 않으려는 것이다 |
| **한 줄 추가** | `storage/locks.ts`(`ANIMATION_LOCKS`), `app/currentProject.ts`(기억 값 종류에 `'animation'`) | 영상 때 `VIDEO_LOCKS`를 더한 것과 같다. 오류 코드(`ErrorCode`)는 늘리지 않는다 |
| **선택 인자 추가** (주지 않으면 지금 동작) | `app/App.tsx` → `app/Editor.tsx`로 옮긴 `Editor`, `components/SlideList.tsx`, `editor/SlideCanvas.tsx`, `app/TopBar.tsx` | §3의 변형 지점 |
| **항목 추가** | `app/StartScreen.tsx`(타일·배지), `app/App.tsx`(화면 종류·최근 작품), `components/Icon.tsx`, `styles/app.css`, `video/mediaWorker.ts`(작업 종류 하나) | 셋째 타일과 내보내기 연결 |

### 애니메이션 문서가 슬라이드 코드에 그대로 들어가는 이유

`AnimationProject`는 슬라이드 `Project`의 필드를 **모두 같은 이름·같은 형태로** 가지고(`schemaVersion`, `id`, `title`, `revision`, `createdAt`, `updatedAt`, `width`, `height`, `slides`, `assetManifest`) 거기에 `kind`, `fps`, `musicId`, `musicVolume`, `holds`를 더한 것이다. TypeScript는 필드가 더 많은 값을 필드가 적은 타입 자리에 넘길 수 있으므로 `renderSlide`, `exportPdf`·`exportPptx`(인자 `snapshot: Project`), `referencedAssets`, `SlideList`, `SlideCanvas`, `Editor`가 읽는 `project.slides`·`project.title`이 수정 없이 동작한다. 애니메이션 저장소(`animationStore`)도 슬라이드 저장소(`ProjectStore`)와 메서드 모양이 같아 `Editor`에 그대로 넘긴다. 이것은 설계 가정이며 A3·A4에서 `tsc`와 시험으로 확인한다.

검사도 같은 방법으로 재사용한다. `validateAnimationProject`는 값에서 슬라이드와 같은 10개 필드만 뽑아 슬라이드의 `validateProject`에 넘기고(장·요소·사진·개수 검사 전부), 나머지 필드만 직접 검사한다. `validate.ts`는 고치지 않는다.

### 코드 배치

| 경로 | 내용 |
|---|---|
| `src/domain/animationTypes.ts`, `animationValidate.ts`, `animationProject.ts`, `animationLimits.ts` | 문서 형태, 검사, 새 작품, 허용값. DOM을 쓰지 않는다 |
| `src/commands/animationApply.ts` | 슬라이드 명령 18개를 `applyCommand`에 넘기고 `holds`를 맞추는 일 + 새 명령 2개 |
| `src/state/animationStore.ts` | 애니메이션 작품을 바꾸는 유일한 곳. `history.ts` 사용 |
| `src/animation/` | `AnimationApp.tsx`(목록 ↔ 편집기, 지연 로딩), `AnimationHome.tsx`, `AnimationEditor.tsx`(`Editor`에 인자를 채워 넣는 얇은 층), `AnimationPanel.tsx`, `AnimationPlayer.tsx`, `onion.ts`, `animationDatabase.ts`, `animationFile.ts`, `exportAnimation.ts`(메인 쪽), `frameTimes.ts`(§4 시간 식) |
| `src/video/animationJob.ts` | Worker 쪽 내보내기. Mediabunny를 쓰는 코드는 영상 Worker 묶음 안에 둔다(같은 라이브러리가 두 번 묶이지 않게) |

AGENTS.md의 "문서를 바꾸는 곳은 src/state/store.ts의 dispatch·undo·redo뿐이다"는 A3에서 "`store.ts`(슬라이드)·`videoStore.ts`(영상)·`animationStore.ts`(애니메이션)"로 고친다.

## 3. 시작 화면·작품 목록·편집 화면

### 시작 화면과 화면 이동

| 화면 | 내용 |
|---|---|
| 시작 화면 | 타일 3개: 슬라이드 만들기(보라), 영상 만들기(주황), **애니메이션 만들기(초록)**. 최근 작품 6개는 세 저장소의 요약을 각각 읽어 섞는다(`App.tsx` `loadRecentWorks`에 셋째 줄 추가, 한 곳을 못 읽어도 나머지는 보여 주는 지금 규칙 유지). `EditorKind`에 `'animation'` 추가 |
| 애니메이션 작품 목록 | `AnimationHome.tsx`를 새로 둔다(영상의 `VideoHome.tsx`와 같은 방식). 카드에 미리보기·이름·날짜·"24장 · 4초". 원본 열기(`.canvaanim`)·새 작품·원본 내려받기·이 컴퓨터에서 지우기. 슬라이드 `Home.tsx`는 고치지 않는다 |
| 화면 이동 | `App.tsx`의 `Screen`에 `{ kind: 'animation', resumeId }`를 더하고 `AnimationApp`을 `lazy`로 불러온다(영상과 같다). 슬라이드만 쓰는 아이의 첫 로딩 크기는 늘지 않는다 |
| 새로고침 복원 | `currentProject.ts`의 기억 값 종류에 `'animation'`을 더한다. v0.0.4 이하가 이 값을 읽으면 알 수 없는 종류라 `null`을 돌려주고 시작 화면으로 간다(코드 확인: 종류가 `'slide'`·`'video'`가 아니면 `null`) |

### 편집 화면: `Editor`의 변형 지점

지금 `Editor`는 `App.tsx` 70행의 내보내지 않는 함수이고, 저장·원본 파일·출력·도구 목록이 슬라이드 것으로 박혀 있다. A4에서 **먼저 `src/app/Editor.tsx`로 그대로 옮기고**(슬라이드 시험 무수정 통과 확인) **그다음 아래 지점만 선택 인자로 연다.** 문서 타입은 `P extends Project`로 받는다.

| 변형 지점 | 지금(슬라이드, 기본값) | 애니메이션이 넘기는 값 | `App.tsx` 위치 |
|---|---|---|---|
| 저장 | `saveProject` | `saveAnimationProject` | 354행 |
| 원본 저장·열기 | `serializeProject`·`deserializeProject`, 확장자 `canvacraft`, `accept=".canvacraft"` | `serializeAnimation`·`deserializeAnimation`, `canvaanim` | 382~395·462행 |
| 여섯째 도구 | 템플릿 + `TemplatePanel` | 애니메이션 + `AnimationPanel` | 451·465행 |
| + 타일 | `addSlide`(맨 뒤 빈 장) | 지금 장 `duplicateSlide` | 441행 |
| 장 목록 | 번호 없음, 메뉴 5개 | 장 번호·×2/×4 배지, 메뉴에 빈 장 추가·길게 보이기, + 타일 이름 "다음 장 만들기" | 484행 `SlideList` |
| 캔버스 밑그림 | 없음 | 양파 껍질 그림 | 473행 `SlideCanvas` |
| 발표 단추 | 발표 → `Presenter` | 재생 → `AnimationPlayer` | 400·461·503행 |
| 내려받기 형식 | pptx·pdf·image | 맨 위에 video(MP4) 추가 | 402~418행, `TopBar` |

`AnimationEditor.tsx`가 애니메이션 저장소를 직접 구독해 빠르기·음악·`holds`를 읽고, 위 값들을 만들어 `Editor`에 넘긴다. `Editor` 본문은 애니메이션 필드를 알지 못한다. 그 밖의 조작(선택·끌기·글씨 입력·그리기·단축키·붙여넣기·확대/축소)은 한 줄도 다르지 않다.

### 화면 배치 (UI_REFERENCE.md의 틀을 유지)

| 영역 | 애니메이션에서의 내용 |
|---|---|
| 상단 바 | 같다. 발표 자리에 **재생**. 공유 → 내려받기 창 맨 위에 **영상 (MP4)** — "움직이는 영상으로 만들어요. YouTube에 올릴 수 있어요" |
| 왼쪽 도구 모음 | 배경 / 요소 / 텍스트 / 업로드 / 그리기 / **애니메이션** |
| 애니메이션 패널 | 빠르기 단추 5개(초당 2·4·6·8·12장), 지금 길이("24장 · 4초"), 배경음악 카드 4개 + 없음, 음악 크기(작게·크게), 앞 장 겹쳐 보기 켜기/끄기, 처음이면 안내 |
| 중앙 작업 공간 | 양파 껍질이 켜져 있고 앞 장이 있으면 그 장의 그림이 투명도 35%로 배경 위·요소 아래에 깔린다. 확대/축소 옆에 겹쳐 보기 단추 |
| 하단 장 목록 | 카드마다 장 번호와 길게 보이기 배지. + 타일은 "다음 장 만들기". 끌어 옮기기·복제·삭제·비우기는 그대로 |
| 재생 겹침 창 | 작업 공간을 덮는 어두운 층 위에 16:9 재생 화면, 아래에 장 번호 n / N과 멈추기 단추. 반복 재생. 멈춘 장으로 간다 |

어린이용 단순화 규칙: 숫자 입력 칸을 두지 않는다. 빠르기 단추 5개, 길게 보이기 3단계, 음악 크기 2단계, 양파 껍질 투명도 고정.

## 4. 데이터 구조와 명령

원칙은 두 편집기와 같다. 문서는 변경 불가능한 값이고, 바꾸는 곳은 `animationStore.ts`의 dispatch·undo·redo 하나다. 양파 껍질·재생 위치·미리보기 캐시는 문서가 아니다.

### 저장 객체 (초안, A1에서 계약으로 확정)

| 객체 | 필드와 의미 |
|---|---|
| AnimationProject | schemaVersion=1, **kind='animation'**, id, title, revision, createdAt, updatedAt, width=1280, height=720, **fps**, **musicId**, **musicVolume**, **holds**, slides, assetManifest. 굵은 것 외에는 슬라이드 `Project`와 이름·형태·검사가 같다 |
| fps | 초당 장수. 2·4·6·8·12 중 하나. 새 작품은 6 |
| musicId, musicVolume | 내장 음악 ID 또는 null(새 작품 null), 0.5 또는 1(새 작품 0.5). 음악을 끄는 것은 `musicId: null`이다 |
| holds | 길게 보이는 장의 목록. `{ "<장 id>": 2 또는 4 }` 꼴의 객체다. **1배는 넣지 않는다**(없으면 1배, 값 1은 검사에서 거부. 영상 `Clip.speed`와 같은 규칙). 키는 모두 `slides`에 있는 장 id여야 한다. `Slide` 타입에 필드를 더하지 않으려고 문서 쪽에 둔다 |
| slides, assetManifest | 슬라이드와 같은 `Slide[]`·`Asset[]`. 사진 id도 같은 방식(정규화한 바이트의 SHA-256)이다 |
| AnimationSummary | projectId, kind='animation', title, updatedAt, revision, frameCount(장 수), durationMs(§4 식), thumbnailRevision, thumbnail(첫 장 320×180 JPEG) |
| 되돌리기가 복원하는 내용 | title, slides, assetManifest, fps, musicId, musicVolume, holds |

내장 음악은 영상 편집기의 `public/sounds/manifest.json` music 항목을 그대로 쓴다(`src/video/builtins.ts` `loadBuiltins`·`builtinBlob`). `validateAnimationProject`는 `musicId`의 **형식**(`^[a-z0-9-]{1,64}$`)만 검사하고, 목록에 있는지는 패널(없으면 '없음'으로 표시)·미리보기(소리 없이 재생)·내보내기(ASSET_MISSING "배경음악을 불러오지 못했어요")에서 확인한다. 영상 계약 §5는 목록에 없는 ID의 문서를 열지 않는데, 애니메이션에서는 음악 목록을 못 읽었다고 그림 작품 전체가 안 열리면 안 되므로 다르게 한다. A1에 이 차이를 적는다.

### 명령

| 명령 | 입력 | 실패 조건 | 취소 단위 |
|---|---|---|---|
| 슬라이드 명령 18개 | contracts.md §4와 같다 | 같다 | 같다 |
| setAnimation | fps / musicId / musicVolume 중 바꿀 것 | 허용값 아님(INVALID_VALUE) | 설정 1회 |
| setFrameHold | slideId, hold(1·2·4) | 장 없음, 단계 밖 값. 1이면 `holds`에서 뺀다 | 고르기 1회 |

`animationApply.ts`는 슬라이드 명령을 받으면 문서에서 `title`·`slides`·`assetManifest`만 꺼내 슬라이드의 `applyCommand`에 넘기고, 결과를 문서에 다시 합친 뒤 `holds`를 맞춘다.

- `deleteSlide`: 지운 장의 `holds` 항목을 뺀다.
- `duplicateSlide`: 원래 장에 `holds` 값이 있으면 복사한 장(`applyCommand`가 돌려주는 `slideId`)에도 같은 값을 넣는다.
- 그 밖의 명령: `holds`는 그대로다. 명령 뒤 `holds`의 키가 모두 남은 장인지 확인한다.

이 처리는 한 명령의 결과 안에서 끝나므로 되돌리기 한 번에 장과 `holds`가 함께 돌아온다. `apply.ts`는 고치지 않는다. 저장소의 "되돌린 뒤 보여 줄 장" 규칙은 슬라이드와 같고(`nearestSlide`), 결과 형태도 슬라이드 `DispatchResult`(`slideId`)와 같게 해 `Editor`가 그대로 쓴다.

### 출력 시간 식

출력 프레임률은 **24fps 고정**이다. 초당 장수 f ∈ {2, 4, 6, 8, 12}는 모두 24의 약수라 장마다 정수 프레임이 된다.

- 장 i의 프레임 수 n_i = hold_i × 24 / f (`holds`에 없으면 hold = 1). 예: f = 6이면 4프레임(166.7ms). f = 2에 hold 4면 48프레임(2초).
- 전체 프레임 N = Σ n_i. 출력 길이 = N / 24초. 프레임 k의 시각은 영상 계약 §3과 같은 식 t_k = ⌊k × 1,000,000 / 24⌋µs다.
- 장 i가 보이는 프레임 구간은 [Σ_{j<i} n_j, Σ_{j≤i} n_j)이다. 재생 미리보기와 작품 목록의 길이 표시도 같은 식(`frameTimes.ts`)을 쓴다.
- 소리 트랙은 음악이 없어도 무음으로 넣는다(영상 계약 §8과 같다). 음악은 0초부터 반복하고 작품 끝에서 자른다.
- 대표 길이: 100장·f 6·hold 없음 → 16.7초(400프레임). 100장·f 2·모두 hold 4 → 200초(4,800프레임). 1장만 있어도 내보낼 수 있다.

24fps 반복을 택한 이유: 장마다 가변 길이 프레임을 그대로 쓰면 파일은 작아지지만 초당 2프레임짜리 MP4를 모든 플레이어가 고르게 재생하는지 확인하지 않았다. 반복 프레임은 H.264가 아주 작게 압축한다. A2에서 두 방식의 파일 크기와 Windows 미디어 플레이어·Chrome 재생을 비교해 확정한다.

## 5. 초기 상한 (A1 계약에서 확정)

| 대상 | 상한 |
|---|---|
| 장·요소·획·사진·제목 | 슬라이드 `LIMITS`와 같다(장 100, 사진 합계 200MiB 등). `validateProject`를 그대로 거치므로 따로 정하지 않는다 |
| 빠르기 | 2·4·6·8·12 |
| 길게 보이기 | 2·4(1은 저장 안 함). `holds` 항목 수 ≤ 장 수 |
| 음악 | `musicId` 형식, `musicVolume` 0.5·1 |
| 출력 | 1920×1080 24fps 8Mbps, 소리 AAC 192kbps 또는 Opus 128kbps(영상 계약 §8). 최대 4,800프레임(200초) |
| 원본 ZIP | 슬라이드와 같은 한도(210MiB, 항목 1,002개, JSON 10MiB) |
| 되돌리기 | 500개·32MiB(슬라이드와 같은 추정식 `estimateBytes` + `holds` 항목당 32바이트) |
| 재생 미리보기 캐시 | 장당 640×360 비트맵(약 0.9MB), 100장이면 약 92MB. 작품을 떠나면 모두 해제 |
| 양파 껍질 | 앞 장 1280×720 캔버스 1개(약 3.7MB). 장을 옮기면 다시 만들고 전 것은 해제 |

상한은 성능 보장량이 아니다. 성능 목표는 §9에 있다.

## 6. 저장

| 항목 | 결정 |
|---|---|
| 데이터베이스 | 새 IndexedDB **`canvacraft-animation` 버전 1**: projects, summaries, assets(사진 Blob). 슬라이드 `canvacraft`와 영상 `canvacraft-video`의 구조·버전은 바꾸지 않는다. 그래서 RELEASE.md의 "데이터베이스 버전을 올리면 앞 버전으로 되돌릴 수 없다"에 걸리지 않고, 옛 버전으로 되돌려도 슬라이드·영상 작품은 그대로 열린다(애니메이션 작품은 보이지 않을 뿐 남아 있다) |
| 저장 코드 | `src/animation/animationDatabase.ts`. 슬라이드 `database.ts`와 같은 순서(사진 먼저 확정 → 문서·요약 한 트랜잭션, 더 새 revision이 있으면 REVISION_CONFLICT, 자료 목록의 사진을 모두 보관)를 쓰되 **파일은 따로 둔다**(§10 결정 3). 영상이 `videoDatabase.ts`를 따로 둔 것과 같다 |
| 사진 | 애니메이션 저장소의 assets에 따로 둔다. 같은 사진을 슬라이드 작품과 애니메이션 작품에 모두 쓰면 디스크에 두 번 저장된다. 두 저장소의 정리·잠금을 한 트랜잭션으로 묶지 않기 위해 받아들인다(영상과 같은 결정) |
| 자동 저장 | 변경 1초 뒤, 연속 편집 중 최대 5초. `autosave.ts`와 `Editor`의 저장 연결을 그대로 쓴다 |
| 잠금 | Web Locks 이름 `canvacraft-animation-catalog`(공유)와 `canvacraft-animation-project-<id>`(배타). 순서는 catalog → project. 둘째 탭은 읽기 전용(`locks.ts`의 `acquireSession`에 이름만 넘긴다) |
| 고아 사진 정리·작품 삭제 | 애니메이션 작품 목록에 들어올 때 배타 catalog 잠금을 얻으면 정리한다. '이 컴퓨터에서 지우기'도 같은 잠금 안에서 한다(슬라이드와 같은 규칙, 저장소만 다르다) |
| 원본 파일 `.canvaanim` | ZIP. manifest.json `{ format: 'canvaanimation', schemaVersion: 1 }`, project.json(쓰는 사진만 든 assetManifest), assets/<sha256>.png·jpg. 열면 새 projectId·revision 0. 검사는 슬라이드 계약 §5와 같다(허용 경로만, 중복·암호화 거부, 실제 해제 바이트 한도, 사진 크기·해시·형식 일치). ZIP을 조각 단위로 풀며 한도를 세는 함수는 `projectFile.ts`의 것을 불러 쓴다(`export`만 추가) |
| 형식이 다른 파일 | 애니메이션 편집기에 `.canvacraft`를 넣으면 "애니메이션 작품 파일이 아니에요". 슬라이드 편집기에 `.canvaanim`을 넣으면 지금 코드가 "CanvaCraft 작품 파일이 아니에요"로 거절한다(코드 확인). 파일 고르기 창은 확장자로 먼저 거른다 |
| 내보낸 MP4 | 저장하지 않고 내려받기만 한다. 임시 파일은 OPFS `canvacraft-animation/tmp`에 쓰고, 다음 내보내기를 시작할 때와 애니메이션 작품 목록에 들어올 때(배타 catalog 잠금) 지운다. 영상 편집기의 임시 폴더(`canvacraft-video/tmp`)를 쓰면 영상 작품 목록에 들어가야만 지워지므로 따로 둔다(코드 확인: `mediaStore.ts` `removeMediaExcept`) |
| 영구 보관 | `navigator.storage.persist()`를 요청하되 보장으로 설명하지 않는다(슬라이드와 같다) |

## 7. 양파 껍질·미리보기·내보내기 기술

### 양파 껍질

`SlideCanvas`(react-konva)의 배경 레이어 바로 위에 앞 장 그림을 `KonvaImage` 하나로 투명도 0.35로 둔다(선택 인자 `underlay`). 그림은 `renderSlide(앞 장, resolve, 1)`로 만든 1280×720 캔버스이고, 장 객체가 같으면 다시 만들지 않는다(`SlideList`의 WeakMap 캐시와 같은 방식, `onion.ts`). `renderSlide`는 사진 비트맵을 그린 뒤 바로 닫으므로 남는 것은 합성 캔버스 하나다. 슬라이드 계약 §7의 "현재 장의 사진만 디코딩한 채로 둔다"에 대해 **앞 장을 그리는 동안 그 장의 사진을 잠시 디코딩한다**는 예외를 A1에 적는다. 300획 장을 끌 때 프레임 간격 p95가 16.8ms였는데(PROGRESS.md), 정적 이미지 한 장이 더해져도 유지되는지 A2에서 잰다.

### 재생 미리보기

| 항목 | 결정 |
|---|---|
| 그림 | 장마다 `renderSlide(slide, resolve, 0.5)` → `createImageBitmap` → 640×360. 재생을 시작하면 지금 장부터 한 번에 하나씩 만들며 캐시한다. 장 객체가 같으면 다시 만들지 않는다 |
| 시계 | `requestAnimationFrame`과 `performance.now()`. 지난 시간으로 §4의 장 구간 식을 계산해 그 장의 비트맵을 그린다. 비트맵이 아직 없으면 전 장을 유지한다(끊김 허용) |
| 음악 | `<audio>`(내장 음악 Blob URL, loop) × musicVolume. 재생 시작과 함께 0초부터. 미리보기와 출력의 소리 위치 차는 허용한다 |
| 종료 | Esc·빈 곳·멈추기 단추. 멈춘 시각의 장을 선택한 장으로 한다. 캐시는 작품을 떠날 때 해제한다 |
| 문서 | 재생은 시작할 때의 스냅숏으로 하고 문서를 바꾸지 않는다. 재생 중 편집 단축키는 닿지 않게 한다(`Presenter`와 같은 규칙) |

### 내보내기

| 항목 | 결정 |
|---|---|
| 처리 위치 | **그리기는 메인 스레드, 인코딩은 Worker.** `renderSlide`는 DOM 캔버스와 `document.fonts`를 쓰므로 메인 스레드에서 1.5배(1920×1080)로 그려 `createImageBitmap`으로 바꾼 뒤 영상 Worker(`mediaWorker.ts`)에 **넘겨준다(transfer)**. Worker는 새 작업 종류 `exportAnimation`을 받아 `animationJob.ts`를 돌린다 |
| 영상 쪽에서 쓰는 것 | 형식 선택 `choosePair`(H.264+AAC → VP9+Opus → ENCODER_UNAVAILABLE), `VIDEO_BITRATE`, `ExportStop`, 음악 반복 `LoopReader`(`audioMix.ts`), 소리를 0.5초 앞서 조금씩 섞는 방식, MP4 `fastStart: 'reserve'`. 조각 해독·밈·자막 코드는 쓰지 않는다. `runExport`는 고치지 않는다 |
| 흐름 | 스냅숏 → 글꼴 준비(실패하면 FONT_UNAVAILABLE로 중단. PDF 출력과 같다) → Worker에 `{ type: 'exportAnimation', frameCounts: n_i[], music }` → Worker가 형식을 고르고 임시 파일을 연 뒤 "장 i를 보내라"를 보냄 → 메인이 장 i를 그려 비트맵을 넘김 → Worker가 그리고 같은 그림을 n_i프레임 넣으며 소리를 섞음 → 다음 장 요청 → 마지막 장 뒤 마무리 → 메인이 임시 파일을 File로 받아 내려줌 |
| 메모리 | **한 번에 비트맵 하나만** 오간다(Worker가 받은 그림을 닫은 뒤에 다음 장을 요청한다). 100장을 모아 두면 약 830MB가 되기 때문이다. 메인은 장을 그린 캔버스를 비트맵으로 바꾼 뒤 바로 비운다(`exportPdf.ts`와 같다) |
| UI 멈춤 | 메인이 장을 그리는 동안 화면이 멈춘다. Worker의 요청을 기다리는 사이가 자연스러운 양보 지점이라 진행률은 장마다 갱신된다. 사진이 많은 장의 렌더 시간은 A2에서 잰다 |
| 출력 | 1920×1080, 24fps, 8Mbps, 키 프레임 2초, MP4(moov 앞) 또는 WebM. 출력 중 편집은 스냅숏에 섞이지 않고, 취소·실패하면 임시 파일을 지우며 부분 파일을 내주지 않는다 |
| 완료 안내 | 내려받기 창 안에 형식·길이·크기와 "보호자 계정으로 YouTube에 올릴 수 있어요" 한 문단(외부 링크 없음). WebM이면 형식을 적는다. 따로 결과 창을 만들지 않고 지금의 내려받기 안내 자리(`exportNote`)를 쓴다 |
| 묶음 크기 | 영상 Worker(587KB)는 이미 필요할 때만 받는다. 애니메이션 화면 코드는 타일을 누를 때, 내보내기 코드는 내려받기를 누를 때 받아 첫 화면 761KB를 늘리지 않는다 |

### 실행 파일·정적 서버·CSP

영상 V4·V6에서 `media-src 'self' blob:`, `worker-src 'self'`, `.webm`·`.mp4`·`.wav` MIME이 이미 들어갔다(코드 확인: `scripts/prune-dist.mjs` 20행). 애니메이션은 같은 Worker·같은 음악 파일을 쓰므로 **새로 바꿀 것이 없다.** 배포본·실행 파일 시험에서 애니메이션 MP4 1회의 CSP 위반 0건을 확인한다. contracts.md §8의 "worker는 쓰지 않는다. 영상 모드는 video-contracts.md §8을 따른다" 뒤에 "애니메이션 내보내기도 같은 Worker를 쓴다(animation-contracts.md)"를 A1에서 한 문장 더한다.

## 8. 단계별 계획

한 AI가 순서대로 진행하고 PROGRESS.md에 인계한다. **모든 단계의 공통 조건: `npm test` 전체가 통과하고, 슬라이드 시험 파일(`tests/contracts`의 슬라이드 항목, `tests/e2e`의 flow·home·select·text·draw·library·drag·present)과 영상 시험 파일을 고치지 않는다.** 작업은 영상 브랜치(v0.0.4) 위의 `claude/kids-program-features-205ebd`에서 한다. main에 넣는 것은 영상이 main에 들어간 뒤다.

### A1. 계약 확정 (1일)

- 작업: 새 문서 `docs/animation-contracts.md`를 쓴다(영상의 video-contracts.md와 같은 자리). 문서 필드·명령 20개(슬라이드 18 + 2)와 `holds` 맞추기 규칙·검사·상한·저장소·잠금·`.canvaanim`·시간 식·미리보기·출력·`Editor` 변형 지점. 슬라이드 계약과 같은 규칙은 "슬라이드 계약 §n과 같다"로만 적는다. contracts.md에는 §7 양파 껍질 예외와 §8 Worker 한 문장만, video-contracts.md에는 §2 내장 목록 행에 "음악 목록을 애니메이션이 함께 쓰며 삭제 금지 규칙이 그대로 적용된다" 한 줄만 더한다.
- 완료 기준: §1 포함 기능이 모두 필드·명령·화면 조작·출력 규칙에 연결된 대조표가 있고, §10 결정이 확정값으로 적혀 있다.

### A2. 위험한 기술부터 검증 (1~2일) — 이 결과로 범위를 다시 정한다

- 작업: 제품 코드가 아닌 시험 페이지(`src/animprobe`, `tests/animation-phase2`)에서 잰다.
  - 렌더: 공통 샘플 문서와 "20장 × 사진 3장" 문서(INTEGRATION_REPORT의 측정 문서)를 100장으로 늘려 `renderSlide` 1.5배의 장별 시간·합계·p95.
  - 넘기기·인코딩: 비트맵 1장을 Worker에 넘기는 시간, 400프레임(16.7초)·4,800프레임(200초) 인코딩 시간과 파일 크기(MP4·WebM), 브라우저 메모리 최대값.
  - 재생 확인: 만든 MP4를 Windows 미디어 플레이어·Chrome에서 열어 길이와 장 전환 확인(사용자). 24fps 반복과 가변 길이(장당 1프레임)를 함께 만들어 비교.
  - 양파 껍질: `SlideCanvas`에 1280×720 그림 한 장을 투명도 0.35로 깔고 300획 장을 끌 때 프레임 간격 p95.
  - 미리보기 캐시: 640×360 비트맵 100장의 실제 메모리와 장당 생성 시간.
- 산출물: `docs/ANIMATION_PHASE2_RESULTS.md`(브라우저 버전, 수치, 스크린샷, 미검증 목록).
- 완료 기준: 100장·사진 포함 작품을 MP4로 내보낸 파일이 실제 플레이어에서 재생되고 장 전환이 §4 식과 맞는다. 시간·메모리가 §9 목표 안이다.
- 중단 조건: 개발 PC에서 100장 렌더 합계가 30초를 넘으면 ① 출력을 1280×720으로 낮추거나 ② Worker 안에서 그리는 방안(`OffscreenCanvas`와 Worker 글꼴 로딩)을 A3 전에 사용자에게 묻는다. 양파 껍질 p95가 33ms를 넘으면 밑그림을 640×360으로 줄인다.

### A3. 문서·명령·저장·원본 파일 (2~3일) — 화면 없이 코어만

- 작업: `animationTypes.ts`·`animationValidate.ts`·`animationProject.ts`·`animationLimits.ts`, `animationApply.ts`, `animationStore.ts`, `animationDatabase.ts`, `animationFile.ts`, `frameTimes.ts`, `locks.ts`의 `ANIMATION_LOCKS`, `export` 추가 3곳(§2), AGENTS.md 한 줄.
- 산출물: `tests/contracts/animationCommands.spec.ts`(새 명령 2개의 실행→취소→다시 실행과 실패, 슬라이드 명령 18개가 애니메이션 문서에서 슬라이드와 같은 결과를 내는지, 장 삭제·복제·되돌리기 뒤 `holds`), `animationValidate.spec.ts`(잘못된 `fps`·`holds`·`kind`·알 수 없는 필드, `hold: 1` 거부, 슬라이드 검사 실패가 그대로 전달되는지), `animationFile.spec.ts`(왕복, 손상 파일, `.canvacraft`를 넣으면 거부, 반대 방향 거부), `tests/e2e/animationStorage.spec.ts`(저장·다시 열기·오래된 revision 거부·쓰기 오류 주입·고아 사진 정리·둘째 탭 읽기 전용), 공통 애니메이션 fixture(`scripts/make-animation-fixture.mjs`).
- 완료 기준: 위 시험과 기존 시험 전체 통과. `git diff`에서 §2의 "전혀 바뀌지 않음" 파일에 변경이 없다.

### A4. 편집 화면 틀·시작 화면·작품 목록 (3~4일)

- 작업 순서를 지킨다.
  1. `Editor`를 `src/app/Editor.tsx`로 **옮기기만** 한다. 함께 옮겨야 하는 것(`Session`, `openSession`, `isUntouched`, `download`, `isTyping`, 상수)이 빠지지 않았는지 옛 본문 전체와 대조하고, 슬라이드 시험 전체를 돌린다.
  2. §3 표의 변형 지점을 선택 인자로 연다. `SlideList`·`SlideCanvas`·`TopBar`의 선택 인자도 여기서 더한다. 다시 슬라이드 시험 전체.
  3. `StartScreen` 타일·배지·아이콘, `App.tsx`의 화면 종류와 최근 작품, `currentProject.ts`, `AnimationApp`·`AnimationHome`·`AnimationEditor`(패널은 빈 자리, + 타일 복사 동작과 장 번호까지).
- 완료 기준: 시작 화면 타일 3개에서 각 편집기로 들어가고, 애니메이션 작품이 자동 저장·새로고침 복원·원본 왕복된다. 애니메이션 편집기에서 슬라이드의 선택·글씨(한글 조합)·그리기 시험을 한 번씩 돌려 통과한다(같은 시험 본문을 애니메이션 진입 함수로 부르는 `tests/e2e/animationEditor.spec.ts`). 슬라이드 작품 목록과 애니메이션 작품 목록이 서로의 작품을 보여 주지 않는다. 배포본 시험·실행 파일 시험 통과.

### A5. 애니메이션 화면 (2~3일)

- 작업: 애니메이션 패널(빠르기·길이 표시·음악·크기·겹쳐 보기·안내), 장 메뉴(빈 장 추가·길게 보이기)와 배지, 양파 껍질과 캐시, 재생 겹침 창(캐시·시계·음악·종료), 상단 재생 단추.
- 완료 기준: 장 10개를 복사·수정해 재생하면 §4 식의 장 순서·길이로 돈다(재생 중 표시되는 장 번호를 시각별로 확인). 양파 껍질이 저장·PPT·PDF·미리보기 캐시에 들어가지 않는다(출력 그림의 픽셀 비교). 되돌리기 한 번에 빠르기·길게 변경 한 번이 돌아간다. 음악 목록을 못 읽어도 작품이 열리고 그리기가 된다.

### A6. MP4 내보내기 (2~3일)

- 작업: `exportAnimation.ts`(스냅숏·글꼴·장별 렌더·넘기기·진행률·취소), `animationJob.ts`(형식 선택·임시 파일·프레임 반복·음악 섞기), `mediaWorker.ts`의 작업 종류, 내려받기 창 항목과 완료 안내, 임시 파일 정리.
- 완료 기준: 출력 파일을 다시 해독해 프레임 수 = Σ n_i, 길이 = N/24, 각 장의 첫 프레임과 직전 프레임이 서로 다른 장의 색임을 확인한다(`tests/e2e/animationExport.spec.ts`, `videoExport.spec.ts`와 같은 방법). 음악 있는 작품은 소리 RMS > 0, 없는 작품은 무음 트랙이 있다. 출력 중 편집·이름 변경이 파일에 섞이지 않는다. 취소 뒤 임시 파일이 없고 다시 내보낼 수 있다. 글꼴을 못 받으면 FONT_UNAVAILABLE로 멈춘다. 영상 편집기 내보내기 시험(`videoExport.spec.ts`)이 그대로 통과한다.

### A7. 통합·배포 준비·어린이 관찰 (1~2일)

- 작업: `tests/release`·`scripts/test-exe.mjs`에 애니메이션 1건(타일 → 새 작품 → 장 2개 → 재생 → MP4, CSP 위반 0건), USER_GUIDE '애니메이션 만들기' 절, RELEASE.md(새 저장소·되돌릴 때의 동작), PROGRESS.md, 어린이 관찰(보호자 입회. 못 하면 미실시로 기록), 프리릴리스.
- 완료 기준: §9의 대표 시나리오를 배포본과 실행 파일에서 통과한다.

단순 합계 12~18 작업일이며 확정 일정이 아니다. A2 결과로 다시 산정한다. 웹캠 찍기를 넣기로 하면 A8(2~3일)이 붙는다(§10 결정 11).

## 9. 검증 기준과 성능 목표

| 항목 | 초기 목표와 확인 방법 |
|---|---|
| 기준 기기 | RAM 8GB 보급형 Windows PC, Chrome 또는 Edge 최신. 개발 PC 수치만으로 통과 처리하지 않는다 |
| 슬라이드 회귀 | 슬라이드 시험 파일 무수정 통과. `git diff`로 §2 "전혀 바뀌지 않음" 파일 확인 |
| 내보내기 시간 | 100장·사진 포함 작품(16.7초) 60초 이내(개발 PC), 8GB PC 180초 이내. 렌더와 인코딩을 따로 기록 |
| 내보내기 메모리 | 브라우저 탭 1GB 이내. 비트맵은 한 번에 하나 |
| 재생 미리보기 | 초당 12장에서 장 번호가 §4 식과 1장 이내(개발 PC). 8GB PC는 측정 후 결정 |
| 양파 껍질 | 300획 장 끌기 프레임 간격 p95 33ms 이내 |
| 조작 반응 | 슬라이드와 같음(선택·끌기 100ms 이내) |
| 시각 정확도 | 출력 파일의 장 전환 프레임이 §4 식과 정확히 일치(반복 프레임이라 오차 0). 출력을 다시 해독하는 자동 시험 |

대표 사용자 시나리오:

1. 시작 화면에서 애니메이션 만들기 → 새 작품 → 공 그림을 그리고 + 타일 10번, 장마다 공을 조금씩 옮김 → 재생.
2. 빠르기를 2·12로 바꿔 길이가 달라지는지, 마지막 장을 아주 길게로 두면 멈춰 보이는지.
3. 배경음악 선택 → MP4 내려받기 → Windows 미디어 플레이어·Chrome 재생(사용자).
4. 새로고침·브라우저 재시작 복원, 원본 `.canvaanim` 저장 후 다른 프로필에서 열기.
5. PPT·PDF로 100장 내려받기(플립북 인쇄).
6. 슬라이드 작품 목록에 애니메이션 작품이 없고, 시작 화면 최근 작품에 초록 배지가 붙는지.
7. 슬라이드 편집기에 `.canvaanim`, 애니메이션 편집기에 `.canvacraft`를 넣었을 때의 안내.
8. 100장 상한 안내, 내보내기 취소 후 다시 받기, 둘째 탭 읽기 전용, 글꼴 로딩 실패, 음악 목록 로딩 실패.
9. v0.0.4 실행 파일로 되돌린 뒤 슬라이드·영상 작품이 그대로 열리는지(사람 확인).

## 10. 사용자 결정 항목

**2026-11-10 사용자 결정: 14개 모두 확정됐다.** 결정 2는 중간안, 나머지 13개는 아래 표의 기본값이다("기본값으로 진행"). 확정값은 [animation-contracts.md](animation-contracts.md) §10에 계약으로 옮겼다. 웹캠으로 찍기(결정 11)는 후속으로 남는다.

| 번호 | 결정 | 필요한 입력 | 확정값 또는 기본값 |
|---|---|---|---|
| 1 | 타일 이름·색 | '애니메이션 만들기'가 아이에게 통하는 말인지('움직이는 그림 만들기' 등) | '애니메이션 만들기', 초록, 아이콘은 필름 띠 |
| 2 | **구조** | 슬라이드 문서에 필드를 더할지, 저장을 분리할지 | **확정(2026-11-10 사용자): 중간안.** 문서·저장소·원본 파일·작품 목록은 분리하고 편집 부품·장 그리기·편집 명령·편집 화면은 재사용한다 |
| 3 | 저장 코드를 두 벌 둘지 | `animationDatabase.ts`를 슬라이드 `database.ts`와 같은 모양으로 따로 쓸지(슬라이드 저장 코드 무변경, 같은 로직 약 140줄이 두 벌), `database.ts`에 저장소 이름을 선택 인자로 열어 한 벌로 쓸지(슬라이드 저장 코드가 조금 바뀜) | **따로 쓴다.** 아이 작품을 지키는 슬라이드 저장 코드를 건드리지 않는 쪽을 택한다. 한쪽 결함을 고칠 때 다른 쪽도 확인한다는 규칙을 계약에 적는다 |
| 4 | 원본 파일 확장자 | `.canvaanim`이 적당한지 | `.canvaanim`, format 값 `canvaanimation` |
| 5 | 빠르기 선택지 | 초당 2·4·6·8·12장이 적당한지, 기본 6이 맞는지 | 2·4·6·8·12, 기본 6, 출력 24fps 반복 |
| 6 | 길게 보이기 단계 | 보통·길게(2배)·아주 길게(4배)로 충분한지 | 1·2·4 |
| 7 | 장 수 상한 | 100장(초당 6장이면 16.7초)으로 충분한지 | 100 유지. 더 긴 작품은 MP4 둘을 영상 편집기에서 이어 붙인다 |
| 8 | + 타일의 뜻 | 애니메이션에서 +가 '지금 장 복사'인 것이 맞는지 | 지금 장 복사. 빈 장은 장 메뉴 |
| 9 | 발표 단추 | 전체 화면 발표를 없애고 재생으로 바꿀지 | 재생으로 바꾼다. 전체 화면 재생은 후속 |
| 10 | 소리 | 배경음악(기존 합성 4곡)만으로 시작할지, 장별 효과음을 넣을지 | 배경음악만 |
| 11 | **웹캠으로 찍기** | 점토·장난감을 웹캠으로 한 장씩 찍는 스톱모션을 첫 버전에 넣을지. 넣으면 카메라 미리보기·찍기 단추·카메라 권한 안내가 필요하고 A8(2~3일)이 붙는다. 집 PC에 웹캠이 있는지도 영향 | **후속(A8 후보).** 첫 버전은 그리기와 사진 업로드(휴대폰으로 찍어 넣기)로 한다 |
| 12 | GIF 출력 | 메신저 공유용 GIF가 필요한지 | 넣지 않는다. MP4만 |
| 13 | 양파 껍질 기본 | 기본으로 켜 둘지, 투명도 35%가 적당한지 | 켬, 35% 고정 |
| 14 | 슬라이드 작품 가져오기 | 이미 만든 슬라이드 작품을 애니메이션으로 바꿔 여는 기능이 필요한지 | 후속. 장 형태가 같아 나중에 넣기 쉽다 |

## 11. 위험 요소

| 위험 | 영향 | 대응 |
|---|---|---|
| `Editor` 이동·인자화의 회귀 | 슬라이드 편집 화면이 깨진다. 초기화 누락은 눈에 잘 안 띈다 | A4를 "옮기기만 → 시험 → 인자 열기 → 시험" 두 걸음으로 나눈다. 옛 본문 전체가 새 위치에 있는지 대조한다. 슬라이드 e2e 무수정 통과가 조건 |
| 저장 코드 두 벌 | 2026-11-06에 고친 사진 유실 결함 같은 수정이 한쪽에만 들어갈 수 있다 | 슬라이드 저장 시험과 같은 항목을 애니메이션 저장소에도 돌린다(A3). 계약에 "한쪽을 고치면 다른 쪽 확인"을 적는다. 결정 3으로 한 벌 방식을 고를 수 있다 |
| 타입이 맞는다는 가정 | `AnimationProject`·`animationStore`가 슬라이드 타입 자리에 그대로 들어간다는 것은 코드를 읽고 내린 판단이며 컴파일해 보지 않았다 | A3에서 `renderSlide`·`exportPdf`에 넘기는 시험, A4에서 `tsc`로 확인. 안 맞는 곳은 어댑터 한 겹으로 푼다 |
| 메인 스레드 렌더 시간 | 사진이 많은 100장 작품의 내보내기가 길어지고 장을 그리는 순간 화면이 멈춘다 | A2 측정과 중단 조건 |
| 저사양 PC 미측정 | 영상 V2에서 그래픽 가속 없는 가상 PC의 인코딩 메모리 초과 원인이 미해결(보류)이다. 같은 인코더를 쓴다 | 조각 해독이 없어 부담은 덜할 것으로 보지만 추정이다. 8GB PC 측정 항목으로 남긴다 |
| 영상 Worker를 함께 쓰는 것 | `mediaWorker.ts`에 작업 종류를 더하다 영상 가져오기·내보내기를 깨뜨릴 수 있다 | 영상 시험 무수정 통과가 조건. `runExport`는 고치지 않고 `animationJob.ts`를 따로 둔다 |
| 음악 목록 공유 | 영상 편집기가 음악 ID를 바꾸면 애니메이션 작품의 음악이 사라진다 | video-contracts.md §2의 삭제 금지 규칙이 애니메이션에도 적용됨을 A1에 적는다. 없어진 ID는 소리 없이 열리게 한다 |
| 사진 이중 저장 | 같은 사진을 슬라이드와 애니메이션에 쓰면 디스크를 두 번 쓴다 | 받아들인다. 작품을 지우면 회수된다 |
| 미리보기 캐시·양파 껍질 성능 | 100장 약 92MB, 끌기 프레임 간격 증가 | A2 실측, 넘으면 축소 해상도 |
| 어린이 기대와의 차이 | "스톱모션"을 사진 찍는 것으로 아는 아이에게 그리기만 있는 첫 버전은 다르게 느껴질 수 있다 | 결정 11. 휴대폰 사진을 장마다 넣는 방법을 안내 카드에 적는다 |
| 브라우저 저장소 소실 | 사이트 데이터를 지우면 작품이 사라진다(세 편집기 공통) | 작품 목록에서 원본 내려받기 안내 |

옛 버전과의 충돌은 위험 목록에서 빠졌다. 슬라이드 문서·저장소·파일 형식이 바뀌지 않기 때문이다.

## 12. 다음 AI에게: 파일과 시점

| 파일 | 변경 | 단계 |
|---|---|---|
| 새 `docs/animation-contracts.md` | 애니메이션 계약 전체 | A1 |
| `docs/contracts.md` §7·§8, `docs/video-contracts.md` §2 | 각각 한두 문장 | A1 |
| 새 `src/domain/animation*.ts`, `src/commands/animationApply.ts`, `src/state/animationStore.ts` | 문서·검사·명령·저장소 | A3 |
| 새 `src/animation/animationDatabase.ts`, `animationFile.ts`, `frameTimes.ts` | 저장·원본 파일·시간 식 | A3 |
| `src/storage/locks.ts` | `ANIMATION_LOCKS` 한 줄 | A3 |
| `src/state/store.ts`, `src/storage/projectFile.ts`, `src/video/exportJob.ts` | `export` 낱말만(§2) | A3·A6 |
| `AGENTS.md` | 문서를 바꾸는 곳 문장에 두 저장소 추가 | A3 |
| `src/app/App.tsx` → 새 `src/app/Editor.tsx` | `Editor` 이동, 그 뒤 선택 인자 | A4 |
| `src/components/SlideList.tsx`, `src/editor/SlideCanvas.tsx`, `src/app/TopBar.tsx` | 선택 인자(배지·메뉴·+ 타일 이름 / 밑그림 / 재생 단추·형식 추가) | A4 |
| `src/app/StartScreen.tsx`, `src/app/App.tsx`, `src/app/currentProject.ts`, `src/components/Icon.tsx`, `src/styles/app.css` | 셋째 타일·배지·화면 종류·기억 값 | A4 |
| 새 `src/animation/AnimationApp.tsx`, `AnimationHome.tsx`, `AnimationEditor.tsx` | 목록·편집기 연결 | A4 |
| 새 `src/animation/AnimationPanel.tsx`, `AnimationPlayer.tsx`, `onion.ts` | 패널·재생·양파 껍질 | A5 |
| 새 `src/animation/exportAnimation.ts`, `src/video/animationJob.ts`, `src/video/mediaWorker.ts` | 내보내기 | A6 |
| `tests/contracts/animation*.spec.ts`, `tests/e2e/animation*.spec.ts`, `tests/release`, `scripts/test-exe.mjs`, `scripts/make-animation-fixture.mjs` | 시험 | A3~A7 |
| `docs/USER_GUIDE.md`, `RELEASE.md`, `PROGRESS.md` | 사용 설명·배포 메모·인계 | A7 |

고치지 않는 것은 §2 표의 "전혀 바뀌지 않음" 줄이다. 그 파일에 손을 대야 할 일이 생기면 멈추고 PROGRESS.md에 이유를 적은 뒤 사용자에게 묻는다.

## 13. 이 문서 다음에 할 일

1. 사용자가 §10을 보고 바꿀 것이 있으면 알려 준다. "기본값으로 진행"이면 그대로 간다.
2. ~~A1 계약 → A2 측정 → A3~A6 구현~~ 2026-11-10에 마쳤다. A2에서 중단 조건에 걸린 항목은 없었고 출력 방식은 24fps 반복으로 확정했다. 2026-11-12 사용자가 직접 써 본 뒤 커밋·푸시하고 `v0.0.6` 프리릴리스로 올렸다. 남은 것은 사람 확인(Windows 미디어 플레이어·YouTube, RAM 8GB PC, 어린이 관찰)과 정식 릴리스 결정이다. main에는 2026-11-12에 합쳤다.
3. 진행 상황은 PROGRESS.md에 슬라이드·영상과 같은 방식으로 남긴다.

## 코드 확인 근거 (2026-11-10, 브랜치 v0.0.4)

- `src/app/App.tsx`: `Editor`는 70행의 내보내지 않는 함수다. 슬라이드에 묶인 곳은 `openSession` 55~57행(`acquireSession`·`createStore`), 저장 354행(`saveProject`), 원본 저장 382~383행, 원본 열기 389행, 템플릿 395·451행, 발표 400·503행, 출력 402~418행, + 타일 441행(`addSlide`), 복제 442행, `TopBar` 458~461행, 파일 고르기 462행(`accept=".canvacraft"`), `ToolRail` 465행, `SlideCanvas` 473행, `SlideList` 484행이다. 화면 종류 `Screen`은 508행, 최근 작품 `loadRecentWorks`는 515~525행, 새로고침 복원은 553~561행.
- `src/domain/validate.ts` 138행 `validateProject`: 최상위 필드 10개만 허용하고(`onlyKeys`) 장·요소·사진·개수를 검사한다. `checkCounts`·`checkElement` 등은 이미 내보내져 있다.
- `src/commands/apply.ts` 113~121행: `duplicateSlide`가 복사한 장을 바로 뒤에 넣고 그 장의 id를 `slideId`로 돌려준다.
- `src/state/history.ts`: `createHistoryStore`가 문서·내용·명령·focus 타입을 인자로 받는 공통 틀이다. `store.ts`의 `estimateBytes`는 내보내져 있고 `nearestSlide`(34행)는 아니다.
- `src/storage/database.ts` 7행: 데이터베이스 이름 `'canvacraft'`가 상수로 박혀 있고 함수들이 `validateProject`를 직접 부른다.
- `src/storage/projectFile.ts`: `FORMAT = 'canvacraft'` 9행, 형식이 다르면 "CanvaCraft 작품 파일이 아니에요" 101행. `unpack`·`declaredEntryCount`는 내보내지 않는 함수다.
- `src/storage/locks.ts`: `LockNames`와 `VIDEO_LOCKS`가 있고 `acquireSession(projectId, names)`·`withExclusiveCatalog(work, names)`가 이름을 인자로 받는다.
- `src/app/Home.tsx`: `storage/database`의 함수와 `serializeProject`, 템플릿 목록을 직접 부른다. `src/video/VideoHome.tsx`는 같은 배치의 별도 파일이다.
- `src/app/currentProject.ts`: 기억 값 종류가 `'slide'`·`'video'`가 아니면 `null`을 돌려준다.
- `src/app/StartScreen.tsx`: `EditorKind = 'slide' | 'video'`, 타일 2개.
- `src/app/TopBar.tsx`: 내려받기 형식 `'pptx' | 'pdf' | 'image'`, 발표·공유 단추, 안내 문구 `exportNote`.
- `src/components/SlideList.tsx`: `SlideActions`(add·duplicate·remove·clear·move), + 타일 이름 "페이지 추가" 100행, 장 미리보기를 `renderSlide` 0.1배로 만들어 장 객체별로 캐시한다.
- `src/rendering/renderSlide.ts`: `document.createElement('canvas')`, `prepareFonts`, 사진 비트맵은 그린 뒤 닫는다.
- `src/video/exportJob.ts`: `choosePair` 33행(내보내지 않음), `ExportStop`·`VIDEO_BITRATE`는 내보냄, 임시 파일은 `directory('tmp')`에 만들고(89행) 실패·취소 때만 지운다(252행).
- `src/video/mediaStore.ts`: 폴더 뿌리 `'canvacraft-video'`가 상수이고, 임시 폴더는 `removeMediaExcept`가 영상 catalog 배타 잠금 안에서 비운다.
- `src/video/mediaWorker.ts`: `onmessage`가 `cancel`·`export`·가져오기 세 갈래다.
- `src/video/audioMix.ts`: `LoopReader.create(blob, lengthMs)`·`addTo(...)`, `MIX_RATE 48000`.
- `src/video/builtins.ts`: `loadBuiltins()`가 음악 목록을, `builtinBlob('sounds', item)`이 해시를 확인한 음악 파일을 준다.
- `scripts/prune-dist.mjs` 20행: CSP에 `media-src 'self' blob:`·`worker-src 'self'`가 있다.
- `tests/e2e/start.ts`: 슬라이드 시험이 "슬라이드 만들기" 타일 이름으로 들어간다.
