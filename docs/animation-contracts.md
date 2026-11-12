# CanvaCraft 애니메이션 편집기 데이터·명령·저장·출력 계약

작성일: 2026-11-10

상태: **A7의 자동 시험·문서까지 마침(2026-11-10). 사람 확인은 남아 있다.** 구현 범위와 미룬 것은 §9 구현 기록에 적었다. 원래는 구현 전 계약(A1)으로, [ANIMATION_PLAN.md](ANIMATION_PLAN.md)(이하 기획안)의 §2~§7을 필드·명령·검사·상한·저장·출력 규칙으로 확정한 문서다. 코드와 측정 없이 썼다. A2 측정으로 출력 방식(24fps 반복)을 확정했고 나머지 결정은 바뀌지 않았다(§10). 기획안과 이 문서가 다르면 이 문서가 우선하며 달라진 점은 §10에 모은다. 이 문서 작성만으로 A1 이후의 어떤 단계도 완료로 선언하지 않는다.

슬라이드 편집기 계약은 [contracts.md](contracts.md), 영상 편집기 계약은 [video-contracts.md](video-contracts.md)다. 같은 규칙을 쓰는 곳은 "슬라이드 계약 §n과 같다", "영상 계약 §n과 같다"로만 적고 다시 쓰지 않는다.

## 1. 적용 범위와 문서 관계

| 구분 | 내용 |
|---|---|
| 사용자 결정(2026-11-10) | 구조는 중간안: 문서·저장소·원본 파일·작품 목록은 분리하고 장 형태·편집 명령·장 그리기·편집 부품·편집 화면은 슬라이드 것을 다시 쓴다. 나머지 13개는 기획안 §10의 기본값으로 확정("기본값으로 진행"). 전체 목록은 §10 |
| 이 문서 | 애니메이션 작품의 데이터 필드, 편집 명령과 취소 단위, 검사와 상한, 저장·삭제·원본 파일, 시간 식, 양파 껍질·재생·출력 규칙, 편집 화면(`Editor`)이 애니메이션에서 달라지는 지점 |
| 슬라이드 계약에서 그대로 쓰는 것 | 상태 소유자 원칙(§2), 장·요소·배경·사진의 형태(§2), 좌표·글씨·획 규칙(§3), 편집 명령 18개와 취소 규칙(§4), 장·요소·사진 검사와 상한(§5), 사진 입력과 저장 순서·잠금 순서·자동 저장 시점(§6), PPT·PDF 출력과 파일명·네트워크 금지(§8) |
| 영상 계약에서 그대로 쓰는 것 | 출력 프레임 시각 식(§3), 출력 형식 선택·MP4 배치·비트레이트·무음 소리 트랙(§8), 내장 소리 목록과 삭제 금지(§2) |

슬라이드의 문서 형태·검사·명령·저장 코드·원본 파일 형식은 이 계약으로 바뀌지 않는다. 슬라이드 쪽에서 바뀌는 곳은 §9에 모았고, 매 단계에서 슬라이드·영상 시험 파일을 고치지 않고 전체가 통과하는 것을 조건으로 한다.

### 기능 ↔ 계약 대조표 (A1 완료 기준)

| 기능 | 저장 필드 | 명령 | 어린이의 조작 | 출력·표시 규칙 |
|---|---|---|---|---|
| 셋째 타일·작품 목록 | AnimationSummary, 기억 값 종류 `'animation'` | — | 타일, 작품 카드, 새 작품 | §6 시작 화면 |
| 그리기·요소·글씨·사진·배경 | Slide(슬라이드 계약 §2) | 슬라이드 명령 18개 | 슬라이드와 같다 | 슬라이드 계약 §3·§8 |
| 다음 장 만들기 | slides, holds | duplicateSlide | + 타일 | §4 holds 맞추기 |
| 빈 장 추가 | slides | addSlide(지금 장 뒤) | 장 메뉴 | — |
| 양파 껍질 | (문서 아님) | — | 겹쳐 보기 켜기/끄기 | §8 양파 껍질 |
| 빠르기 | fps | setAnimation | 패널 단추 5개 | §3 시간 식 |
| 길게 보이기 | holds | setFrameHold | 장 메뉴 3단계, 카드 배지 | §3 시간 식 |
| 배경음악 | musicId, musicVolume | setAnimation | 패널 카드·크기 | §8 소리 |
| 재생 미리보기 | (문서 아님) | — | 재생 단추, Esc·빈 곳·멈추기 | §8 재생 |
| MP4 내보내기 | (문서 아님) | — | 내려받기 창의 영상 (MP4) | §8 출력 |
| PPT·PDF | (문서 아님) | — | 내려받기 창 | 슬라이드 계약 §8 |
| 저장·다시 열기 | AnimationProject 전체, AnimationSummary | — | 자동 저장, 작품 목록 | §6 |
| 원본 파일 | `.canvaanim` | — | 파일 메뉴, 작품 목록 | §6 |
| 되돌리기 | 기록 | undo, redo | Ctrl+Z, 단추 | §4 |

## 2. 상태의 소유자와 저장 객체

문서 변경은 `src/state/animationStore.ts`의 dispatch·undo·redo만 수행한다(공통 틀 `history.ts`, 슬라이드 계약 §2와 같다). 양파 껍질 켜짐 여부, 재생 위치, 미리보기 캐시, 선택, 활성 도구, 확대율, 되돌리기 기록은 문서 원본이 아니다. 사진의 실제 Blob은 문서 밖에 해시로 참조한다.

| 객체 | 저장 필드와 의미 |
|---|---|
| AnimationProject | schemaVersion=1, **kind='animation'**, id, title, revision, createdAt, updatedAt, width=1280, height=720, **fps**, **musicId**, **musicVolume**, **holds**, slides, assetManifest. 굵은 것 외의 10개 필드는 슬라이드 `Project`와 이름·형태·검사가 같다 |
| fps | 초당 장수. 2·4·6·8·12 중 하나. 새 작품은 6 |
| musicId | 내장 음악 ID(`^[a-z0-9-]{1,64}$`) 또는 null. 새 작품은 null. 음악을 끄는 것은 null이다 |
| musicVolume | 0.5 또는 1. 새 작품은 0.5 |
| holds | 길게 보이는 장. 키가 장 id, 값이 2 또는 4인 객체(`{ "<장 id>": 2 }`). **1배는 넣지 않는다**(키가 없으면 1배). 키는 모두 slides에 있는 장 id여야 한다. 새 작품은 빈 객체 |
| slides, assetManifest | 슬라이드 계약 §2의 Slide·Asset과 같다 |
| AnimationSummary | projectId, kind='animation', title, updatedAt, revision, frameCount(장 수), durationMs(§3 식으로 계산한 출력 길이를 ms로 반올림), thumbnailRevision, thumbnail(첫 장 320×180 JPEG). 미리보기는 삭제·재생성 가능한 파생 저장물이다 |

`AnimationProject`가 슬라이드 `Project`의 필드를 모두 같은 형태로 갖게 한 것은 `renderSlide`·`exportPdf`·`exportPptx`·`SlideList`·`SlideCanvas`·`Editor`에 수정 없이 넘기기 위해서다(기획안 §2). 그래서 이 10개 필드의 이름·형태를 애니메이션 쪽에서 따로 바꾸지 않는다.

되돌리기가 복원하는 내용(AnimationContent)은 title, slides, assetManifest, fps, musicId, musicVolume, holds다. revision·updatedAt은 내용과 분리한다(슬라이드 계약 §4).

내장 음악 목록은 문서가 아니라 앱 파일이다(영상 계약 §2의 `public/sounds/manifest.json` music 항목). 한 번 배포한 음악 ID는 지우지 않고 숨기기만 한다는 영상 계약의 규칙이 애니메이션 작품에도 적용된다.

## 3. 시간·좌표 규칙

### 좌표·글씨·획

슬라이드 계약 §3과 같다. 논리 좌표계는 1280×720 하나뿐이다(세로 작품 없음).

### 장 → 출력 프레임

출력 프레임률 F는 **24 고정**이다. fps ∈ {2, 4, 6, 8, 12}는 모두 24의 약수다.

- 장 i의 프레임 수 n_i = hold_i × 24 / fps. hold_i는 holds에 장 id가 있으면 그 값, 없으면 1이다. n_i는 항상 정수다(2~48).
- 전체 프레임 수 N = Σ n_i. 출력 길이는 N / 24초, AnimationSummary.durationMs = round(N × 1000 / 24).
- 장 i가 보이는 프레임 구간은 [S_i, S_i + n_i), S_i = Σ_{j<i} n_j.
- 프레임 k의 시각은 영상 계약 §3과 같은 식 t_k = ⌊k × 1,000,000 / 24⌋µs다.
- 재생 미리보기는 지난 시간 e(ms)에서 프레임 번호 k = ⌊e × 24 / 1000⌋ mod N을 구해 위 구간으로 장을 정한다(반복 재생).
- 이 식은 `src/animation/frameTimes.ts` 한 곳에 두고 작품 목록의 길이 표시, 패널의 길이 표시, 재생, 출력이 함께 쓴다.

대표 값: 100장·fps 6·holds 없음 → 400프레임 16.67초. 100장·fps 2·모두 4배 → 4,800프레임 200초. 1장·fps 12 → 2프레임.

출력은 **24fps 반복 방식**(같은 그림을 n_i번 넣기)이다(A2 확정, [ANIMATION_PHASE2_RESULTS.md](ANIMATION_PHASE2_RESULTS.md) §4). 장마다 1프레임을 길이만 다르게 넣는 가변 방식은 파일이 작지만 실제 플레이어 재생을 확인하지 않아 쓰지 않는다.

## 4. 명령 계약과 취소

dispatch(projectId, expectedRevision, command)의 성공·실패 형태, revision 불일치·읽기 전용·부분 적용 금지, 변화 없는 명령의 처리는 슬라이드 계약 §4와 같다. 성공 결과는 슬라이드와 같은 `{ ok, revision, slideId, changed }`다. 되돌린 뒤 보여 줄 장의 규칙(기록의 장이 없어졌으면 이전 순서에서 가장 가까운 남은 장)도 같다.

| 명령 | 입력 | 추가 실패 조건 | 취소 단위 | 결과 slideId |
|---|---|---|---|---|
| 슬라이드 명령 18개 | 슬라이드 계약 §4 | 같다 | 같다 | 같다 |
| setAnimation | fps, musicId, musicVolume 중 바꿀 것(하나 이상) | 허용값 아님, 바꿀 것이 하나도 없음(INVALID_VALUE) | 설정 1회 | null(지금 장 유지) |
| setFrameHold | slideId, hold(1·2·4) | 장 없음, 단계 밖 값(INVALID_VALUE). 1이면 holds에서 뺀다 | 고르기 1회 | 그 장 |

값이 지금과 같으면 변화 없는 명령이다(revision·기록을 늘리지 않는다).

### 슬라이드 명령을 적용하는 방법

`src/commands/animationApply.ts`의 `applyAnimationCommand`는 슬라이드 명령을 받으면 내용에서 title·slides·assetManifest만 꺼내 슬라이드의 `applyCommand`에 넘기고, 돌아온 세 필드를 내용에 다시 합친 뒤 holds를 다음 순서로 맞춘다. `apply.ts`는 고치지 않는다.

1. `duplicateSlide`가 성공했고 원래 장(command.slideId)이 holds에 있으면, 복사한 장(결과 slideId)에도 같은 값을 넣는다.
2. holds의 키 중 결과 slides에 없는 장 id를 뺀다(`deleteSlide`).
3. 1·2에서 바뀐 것이 없으면 holds 객체를 그대로 둔다(구조 공유).

`clearSlide`는 장 id가 유지되므로 holds도 그대로다. 이 처리는 한 명령의 결과 안에서 끝나므로 되돌리기 한 번에 장과 holds가 함께 돌아온다. 슬라이드 명령이 실패하면 holds도 바뀌지 않는다.

### 취소

undo/redo의 revision 발급, redo 비우기, 기록 상한(500개·추정 32MiB), 구조 공유를 중복 세지 않는 추정은 슬라이드 계약 §4와 같다. 추정식은 슬라이드의 `estimateBytes`에 holds 객체마다 16바이트 + 키 수 × 32바이트를 더한다. 저장·출력·재생·선택·양파 껍질 켜기는 기록을 만들지 않는다.

## 5. 파일 검사와 초기 상한

원본 파일과 저장소 읽기는 같은 `validateAnimationProject`를 통과하고 런타임 명령도 같은 값 검사를 쓴다. 알 수 없는 필드와 지원하지 않는 schemaVersion의 처리는 슬라이드 계약 §5와 같다. 한도를 넘는 값을 몰래 고쳐 열지 않는다.

`validateAnimationProject(value)`의 순서:

1. 객체인지, schemaVersion이 1인지(더 크면 UNSUPPORTED_VERSION), kind가 'animation'인지 본다. kind가 다르면 INVALID_VALUE "애니메이션 작품 파일 형식이 올바르지 않아요".
2. 최상위 필드가 §2의 15개뿐인지 본다.
3. 슬라이드와 같은 10개 필드만 뽑은 객체를 슬라이드의 `validateProject`에 넘긴다. 장·요소·배경·사진·개수·ID 검사가 모두 여기서 끝나며 실패는 그대로 돌려준다. `validate.ts`는 고치지 않는다.
4. fps, musicId, musicVolume, holds를 아래 표로 검사한다.

| 대상 | 상한·허용 규칙 |
|---|---|
| 제목·장·요소·획·좌표·색·사진 | 슬라이드 계약 §5와 같다(1~100장, 장당 1,000요소, 사진 합계 200MiB 등) |
| fps | 2·4·6·8·12 |
| musicId | null 또는 `^[a-z0-9-]{1,64}$` 문자열 |
| musicVolume | 0.5·1 |
| holds | 배열이 아닌 객체. 키는 slides에 있는 장 id, 값은 2 또는 4 |
| 원본 ZIP | 슬라이드 계약 §5와 같다(압축 210MiB, 해제 누적 210MiB, JSON 10MiB, 항목 1,002개) |
| 출력 | 최대 4,800프레임(100장 × 48) |

**musicId는 형식만 검사하고 내장 목록에 있는지는 검사하지 않는다.** 영상 계약 §5는 목록에 없는 ID의 문서를 열지 않지만, 애니메이션은 음악 목록을 못 읽었다고 그림 작품이 열리지 않으면 안 된다. 목록에 없는 ID는 패널에서 '없음'으로 보이고, 재생은 소리 없이 하며, 출력은 ASSET_MISSING("배경음악을 불러오지 못했어요. 음악을 다시 골라 주세요")으로 멈춘다. `setAnimation`도 형식만 검사한다(패널은 목록에 있는 곡만 보낸다).

상한 값은 `src/domain/animationLimits.ts`에 `ANIMATION_FPS`, `OUTPUT_FPS`, `HOLD_STEPS`, `MUSIC_VOLUMES`, `MUSIC_ID`로 둔다. 장·요소·사진 상한은 슬라이드 `LIMITS`를 그대로 참조한다.

## 6. 저장·삭제·원본 파일

### 저장소

| 항목 | 결정 |
|---|---|
| 데이터베이스 | 새 IndexedDB `canvacraft-animation` 버전 1: projects(keyPath id), summaries(keyPath projectId), assets(keyPath id, `{ id, blob }`). 슬라이드 `canvacraft`와 영상 `canvacraft-video`의 구조·버전은 바꾸지 않는다 |
| 코드 | `src/animation/animationDatabase.ts`. 슬라이드 `storage/database.ts`와 **같은 순서와 규칙**을 쓰되 파일을 따로 둔다(사용자 결정 3). `database.ts`의 저장·열기·정리 규칙에 결함 수정이 들어가면 이 파일도 같은 날 확인한다. 반대도 같다 |
| 저장 순서 | 슬라이드 계약 §6과 같다: Blob·미리보기는 트랜잭션 밖에서 준비 → 자료 목록의 사진을 먼저 확정(문서가 쓰는 사진이 없으면 ASSET_MISSING) → projects와 summaries를 한 트랜잭션으로 갱신. 더 새로운 revision이 저장돼 있으면 REVISION_CONFLICT |
| 사진 | 애니메이션 저장소의 assets에 따로 둔다. 슬라이드 저장소와 사진을 나누어 쓰지 않는다(같은 사진을 양쪽에 쓰면 두 번 저장된다). 자료 목록의 사진은 작품을 지울 때까지 모두 보관한다 |
| 자동 저장 | 변경 1초 뒤, 연속 편집 중 최대 5초(`autosave.ts`). 손대지 않은 새 작품은 저장하지 않는다(슬라이드의 판단식과 같다: revision 0, 한 장, 요소 없음, 흰 배경) |
| 잠금 | Web Locks 이름 `canvacraft-animation-catalog`(공유)와 `canvacraft-animation-project-<id>`(배타). 순서는 catalog → project. 잠금이 없으면 읽기 전용, 둘째 탭은 읽기 전용(슬라이드 계약 §6과 같다) |
| 고아 사진 정리 | 어느 애니메이션 작품의 자료 목록에도 없는 사진을 지운다. 배타 catalog 잠금을 얻었을 때만 한다(작품 목록에 들어올 때) |
| 작품 삭제 | 배타 catalog 잠금 안에서 문서·요약을 지우고 고아 정리를 실행한다. 잠금을 못 얻으면 "다른 탭에서 작품을 열고 있어요"로 미룬다. undo 대상이 아니다 |
| 영구 보관 | `navigator.storage.persist()`를 요청하되 보장으로 설명하지 않는다 |

### 시작 화면과 세 저장소

- 시작 화면의 최근 작품은 슬라이드·영상·애니메이션 저장소의 summaries를 각각 읽어 종류를 붙인 뒤 updatedAt 순으로 6개를 보여 준다. 한 저장소를 읽지 못해도 나머지는 보여 주고, 셋 다 실패할 때만 실패다.
- `sessionStorage`의 `canvacraft.current-project` 값의 종류에 `'animation'`을 더한다(`{"kind":"animation","id":"<uuid>"}`). 이 값을 모르는 옛 판은 `null`로 읽고 시작 화면으로 간다.
- 기억한 애니메이션 작품이 있으면 애니메이션 편집기로 바로 돌아간다. 작품을 못 열면 애니메이션 작품 목록에서 안내한다.

### 원본 파일 `.canvaanim`

| 항목 | 규칙 |
|---|---|
| 구조 | ZIP. manifest.json `{ format: 'canvaanimation', schemaVersion: 1 }`, project.json(문서가 쓰는 사진만 든 assetManifest), assets/<sha256>.png 또는 .jpg(압축 안 함) |
| 형식 구분 | format이 'canvaanimation'이 아니면 INVALID_VALUE("애니메이션 작품 파일이 아니에요"). 슬라이드 편집기는 format 'canvacraft'가 아닌 파일을 "CanvaCraft 작품 파일이 아니에요"로 거부한다(코드 확인: `projectFile.ts` 101행). 두 편집기의 파일 고르기 창은 자기 확장자만 받는다 |
| 열기 | 검증 후 새 projectId, revision 0. 기존 작품을 덮어쓰지 않는다 |
| 검사 | 슬라이드 계약 §5와 같다: 허용 경로만, 중복·암호화 항목 거부, 실제 해제 바이트 한도, 파일 목록과 자료 목록의 정확한 일치, 사진의 크기·해시·형식·픽셀 크기 일치. ZIP 끝 레코드의 항목 수를 읽는 함수와 한도를 세며 푸는 함수는 `projectFile.ts`의 것을 불러 쓴다(`export`만 추가) |
| 코드 | `src/animation/animationFile.ts`의 `serializeAnimation`·`deserializeAnimation` |

## 7. 모듈 API와 오류

| API | 결과와 책임 |
|---|---|
| createAnimationProject(newId, now) | 새 작품(fps 6, 음악 없음, holds 빈 객체, 흰 빈 장 1개) |
| validateAnimationProject(value) | 값·참조·개수 검사. 자동 복구 없음 |
| applyAnimationCommand(content, command, context) | 새 내용·slideId·changed 또는 오류 |
| createAnimationStore(initial, options) | getProject·subscribe·dispatch·undo·redo·canUndo·canRedo. 슬라이드 `ProjectStore`와 같은 모양 |
| frameCounts(project) / totalFrames / durationMs / slideAtFrame | §3의 식 |
| saveAnimationProject / openAnimationProject / listAnimationSummaries / deleteAnimationProject / removeOrphanAnimationAssets | revision 확인·저장·검사·정리 |
| serializeAnimation / deserializeAnimation | `.canvaanim` 생성 / 새 작품 후보 |
| exportAnimation(snapshot, resolve, music, options, signal) | `{ ok: true, blob: File, container: 'mp4' \| 'webm', frames, durationMs, bytes }` 또는 오류. 진행률 콜백(끝낸 장 수, 전체 장 수) |

오류 code는 슬라이드·영상의 `ErrorCode`를 그대로 쓰고 새로 늘리지 않는다. 출력 코덱 조합이 없으면 ENCODER_UNAVAILABLE, 글꼴 실패는 FONT_UNAVAILABLE, 사진·음악을 못 읽으면 ASSET_MISSING, 임시 파일 공간 부족은 STORAGE_FULL, 취소는 CANCELLED다. 예상 실패를 빈 문서·성공 파일로 위장하지 않고, 메시지·로그에 사진 내용·원본 파일명을 넣지 않는다.

메모리: 양파 껍질은 앞 장 그림 1개, 재생 캐시는 장당 960×540(장이 40개 이하) 또는 640×360(그보다 많을 때) 비트맵(작품을 떠나면 해제), 출력은 한 번에 1920×1080 비트맵 1개만 쥔다(§8).

## 8. 양파 껍질·재생·출력·네트워크

### 양파 껍질

지금 장의 바로 앞 장(배열에서 한 칸 앞)을 `renderSlide(앞 장, resolve, 1)`로 그린 1280×720 그림을 캔버스의 배경 위·요소 아래에 투명도 0.35로 깐다. 켜짐 여부는 편집 화면의 상태이고 기본은 켬이다(작품을 여는 동안만 유지). 첫 장에서는 없다. 저장·미리보기 그림·재생·PPT·PDF·MP4에는 들어가지 않는다. 그림은 장 객체가 같으면 다시 만들지 않으며, 장을 옮기면 전 것을 해제한다. 슬라이드 계약 §7의 "현재 장의 사진만 디코딩한 채로 둔다"에 대해, 양파 껍질 그림을 만드는 동안 앞 장의 사진을 잠시 디코딩하는 것을 예외로 둔다. 그림을 만들지 못하면(글꼴·사진 실패) 양파 껍질 없이 편집을 계속한다.

### 재생 미리보기

| 항목 | 규칙 |
|---|---|
| 문서 | 재생을 시작한 시점의 스냅숏으로 하고 문서를 바꾸지 않는다. 시작 전에 입력 중인 글씨를 확정한다 |
| 그림 | 장마다 `renderSlide`로 작은 비트맵을 만들어 캐시한다. 크기는 장이 40개 이하면 재생 화면과 같은 960×540(0.75배), 그보다 많으면 640×360(0.5배)이다. 100장일 때 쥐는 그림이 약 92MB를 넘지 않게 하면서 짧은 작품은 흐리지 않게 보이게 한 것이다. 크기가 바뀌면 캐시를 비운다. 지금 장부터 순서대로 한 번에 하나씩 만든다. 장 객체가 같으면 다시 만들지 않는다(`src/animation/previewCache.ts`) |
| 시계 | `performance.now()`와 `requestAnimationFrame`. §3의 식으로 장을 정한다. 지금 장에서 시작해 끝까지 간 뒤 첫 장부터 반복한다. 그림이 아직 없으면 전 그림을 유지한다 |
| 음악 | 내장 음악을 0초부터 반복 재생(× musicVolume). 목록에 없거나 못 받으면 소리 없이 재생한다 |
| 종료 | Esc, 재생 화면 밖 누르기, 멈추기 단추. 멈춘 순간의 장으로 간다. 재생 중 편집 단축키·붙여넣기는 닿지 않는다 |
| 허용 오차 | 출력과 1장 어긋남, 끊김 허용 |

### 출력 (MP4)

| 항목 | 결정 |
|---|---|
| 처리 위치 | 그리기는 메인 스레드(`renderSlide`가 DOM 캔버스와 `document.fonts`를 쓴다), 인코딩은 영상 Worker(`src/video/mediaWorker.ts`, 작업 종류 `exportAnimation`, 본문은 `src/video/animationJob.ts`). 슬라이드 계약 §8의 "worker는 쓰지 않는다"에 대한 영상 모드 예외와 같은 Worker다 |
| 순서 | 입력 확정 → 스냅숏 → 글꼴 준비 → 음악 파일 받기(해시 확인) → Worker 시작 → 장 i마다: Worker가 요청 → 메인이 1.5배(1920×1080)로 그려 ImageBitmap으로 넘김 → Worker가 캔버스에 그리고 n_i프레임을 넣은 뒤 그림을 닫음 → 마지막 장 뒤 마무리 → 내려받기. 출력 중 편집은 스냅숏에 섞지 않는다 |
| 메시지 | 메인 → Worker: `{ type: 'exportAnimation', frameCounts, music: { blob, durationMs } \| null, musicVolume }`, `{ type: 'animationFrame', index, bitmap }`(bitmap은 넘겨주기), `{ type: 'cancel' }`. Worker → 메인: `{ type: 'needFrame', index }`, `{ type: 'progress', done, total }`, 영상과 같은 완료·실패 메시지 |
| 해상도·프레임률 | 1920×1080, 24fps(§3) |
| 형식 선택·MP4 배치·비트레이트 | 영상 계약 §8과 같다: H.264('avc1.640028')+AAC가 둘 다 되면 MP4(`fastStart: 'reserve'`, 영상 최대 패킷 수 N + 2), 아니면 VP9+Opus WebM, 둘 다 안 되면 ENCODER_UNAVAILABLE. 영상 8Mbps, 키 프레임 2초, AAC 192kbps 또는 Opus 128kbps. 형식 선택 함수는 `exportJob.ts`의 `choosePair`를 불러 쓴다(`export`만 추가) |
| 소리 | 48kHz 스테레오. 음악이 있으면 0초부터 반복해 × musicVolume으로 넣고 작품 끝에서 자른다(`audioMix.ts`의 `LoopReader`). 없으면 무음 트랙. −1~1로 자른다. 영상 프레임보다 0.5초 앞서 조금씩 섞는다 |
| 메모리 | 한 번에 넘어가 있는 1920×1080 비트맵은 1개다. Worker가 그림을 닫은 뒤에 다음 장을 요청한다. 메인은 그린 캔버스를 비트맵으로 바꾼 뒤 바로 비운다 |
| 임시 파일 | OPFS `canvacraft-animation/tmp/export-<uuid>.mp4|webm`에 흘려 쓴다. 실패·취소 때 지운다. 성공한 파일은 내려준 뒤 남으므로 다음 내보내기를 시작할 때와 애니메이션 작품 목록에 들어올 때(배타 catalog 잠금) 폴더를 비운다 |
| 진행·취소 | 진행률 = 끝낸 장 수 / 전체 장 수. 취소는 CANCELLED이며 부분 파일을 내려주지 않는다. 취소 뒤 다시 내보낼 수 있다 |
| 완료 안내 | 내려받기 창 안의 안내 자리에 "영상을 내려받았어요. MP4 · 0:16 · 3.2MB. 보호자 계정으로 YouTube에 올릴 수 있어요."(WebM이면 형식을 WebM으로). 외부 링크 없음 |
| 파일명·메타데이터 | 제목 처리는 슬라이드 계약 §8과 같고 확장자 .mp4 / .webm은 앱이 붙인다. 앱 외 메타데이터를 넣지 않는다 |

PPT·PDF 출력은 슬라이드 계약 §8과 같다. 장마다 한 페이지이고 fps·holds·음악은 반영되지 않는다.

### 네트워크·CSP·실행 파일

사진·음악은 모두 같은 origin 파일 또는 저장소 Blob이고 외부 요청은 0건이다. 배포 CSP(`media-src 'self' blob:`, `worker-src 'self'`)와 실행 파일·배포 서버의 MIME(`.mp4`·`.webm`·`.wav`)은 영상 V4·V6에서 이미 들어가 있어 바꾸지 않는다. 배포본·실행 파일 시험에 애니메이션 MP4 1회를 넣어 CSP 위반 0건을 확인한다(A7).

## 9. 편집 화면의 변형 지점과 슬라이드 쪽 변경

### `Editor`의 선택 인자 (A4)

`Editor`를 `src/app/App.tsx`에서 `src/app/Editor.tsx`로 옮긴 뒤 아래를 선택 인자 하나(`variant`)로 받는다. 인자를 주지 않으면 지금의 슬라이드 동작이다. 문서 타입은 `P extends Project`로 받는다.

| 인자 | 주지 않으면(슬라이드) | 애니메이션 |
|---|---|---|
| `save(snapshot, resolve, extras)` | `saveProject` | `saveAnimationProject` |
| `serialize` / `deserialize` / `extension` | `serializeProject` / `deserializeProject` / 'canvacraft' | `serializeAnimation` / `deserializeAnimation` / 'canvaanim' |
| `tool { label, icon, panel(api) }` | 템플릿 + `TemplatePanel` | 애니메이션 + `AnimationPanel` |
| `addSlide` | 없음(맨 뒤에 빈 장) | 'copy-current'(지금 장 복사) |
| `slideList { addLabel, badge(slide), extraItems(slide, api) }` | 없음, "페이지 추가" | "다음 장 만들기", ×2·×4 배지, 빈 장 추가·길게 보이기 3단계 |
| `Underlay`(react-konva 요소를 그리는 컴포넌트) | 없음 | 양파 껍질(`OnionSkin`). 끄면 주지 않는다 |
| `zoomExtra` | 없음 | 앞 장 겹쳐 보기 단추 |
| `present { label, render({ project, slideId, onClose }) }` | 발표 + `Presenter` | 재생 + `AnimationPlayer` |
| `exports [{ id, label, note, run(snapshot, resolve, options, signal) }]` | 없음 | 영상 (MP4), 목록 맨 위. 결과가 확장자와 완료 안내를 함께 돌려준다 |

패널·장 메뉴가 문서를 바꿀 때는 `Editor`가 주는 `api.perform(동작)`을 거친다. 입력 중인 글씨를 먼저 확정하고 결과(지금 장·안내)를 화면에 반영하기 위해서다. 장 번호는 슬라이드 장 목록에 이미 있어 따로 두지 않았다.

`SlideList`·`SlideCanvas`·`TopBar`도 위에 대응하는 선택 인자를 받는다. `Editor`는 애니메이션 필드(fps·holds·음악)를 알지 못하고, `src/animation/AnimationEditor.tsx`가 애니메이션 저장소를 구독해 위 값을 만들어 넘긴다.

### 슬라이드·영상 쪽에서 바뀌는 곳 전체

| 파일 | 변경 | 단계 |
|---|---|---|
| `src/state/store.ts` | `nearestSlide`에 `export` | A3 |
| `src/storage/projectFile.ts` | `unpack`·`declaredEntryCount`·`ENTRY`·`extensionOf`에 `export` | A3 |
| `src/storage/locks.ts` | `ANIMATION_LOCKS` 한 줄 | A3 |
| `src/app/App.tsx`, 새 `src/app/Editor.tsx` | `Editor` 이동, 선택 인자, 화면 종류·최근 작품 | A4 |
| `src/components/SlideList.tsx`, `src/editor/SlideCanvas.tsx`, `src/app/TopBar.tsx` | 선택 인자 | A4·A5 |
| `src/app/StartScreen.tsx`, `src/app/currentProject.ts`, `src/components/Icon.tsx`, `src/styles/app.css` | 셋째 타일·배지·기억 값 종류·아이콘·스타일 | A4 |
| `src/video/exportJob.ts` | `choosePair`에 `export` | A6 |
| `src/video/mediaWorker.ts` | 작업 종류 `exportAnimation`·`animationFrame` | A6 |
| `docs/contracts.md` §7·§8, `docs/video-contracts.md` §2, `AGENTS.md` | 각각 한두 문장 | A1·A3 |

위 표에 없는 슬라이드·영상 소스 파일은 고치지 않는다. 고쳐야 할 일이 생기면 멈추고 PROGRESS.md에 이유를 적는다.

### 단계별 완료 조건

| 단계 | 이 계약에서 쓰는 절 | 인계 근거 |
|---|---|---|
| A1 계약 | 전체 | 기능 대조표(§1)에 빈 칸 없음, §10 결정 표 |
| A2 기술 검증 | §3 반복·가변 방식, §8 출력·양파 껍질·재생 캐시 | `docs/ANIMATION_PHASE2_RESULTS.md`: 100장 렌더 시간, 넘기기·인코딩 시간과 파일 크기, 메모리, 양파 껍질 프레임 간격, 미검증 목록 |
| A3 문서·명령·저장·원본 파일 | §2, §4, §5, §6 | 새 명령 실행→취소→다시 실행, 슬라이드 명령이 애니메이션 문서에서 같은 결과, holds 맞추기, 검사 실패 입력, `.canvaanim` 왕복·손상·형식 구분, 저장소 시험, 슬라이드 무변경 파일의 `git diff` 없음. 공통 애니메이션 샘플은 따로 만들지 않고 슬라이드 공통 샘플(`tests/fixtures/sample`)에 애니메이션 필드를 더해 쓴다(`tests/contracts/animationHelpers.ts`) |
| A4 편집 화면 틀·시작 화면 | §6 시작 화면, §9 | `Editor` 이동 뒤와 인자 추가 뒤 각각 슬라이드 시험 무수정 통과, 타일 3개·목록 분리·새로고침 복원 시험, 애니메이션 편집기에서 선택·글씨·그리기 |
| A5 애니메이션 화면 | §3, §8 양파 껍질·재생 | 재생 중 장 번호가 §3 식과 일치, 양파 껍질이 출력 그림에 없음, 되돌리기 단위 |
| A6 MP4 | §8 출력 | 출력 파일을 다시 해독해 프레임 수·길이·장 전환 프레임·소리 확인, 취소·임시 파일, 영상 내보내기 시험 무수정 통과 |
| A7 통합 | §8 네트워크 | 배포본·실행 파일 시험, 사용 설명, 인계 문서 |

### 구현 기록 (2026-11-10)

| 단계 | 구현한 것과 확인 | 미룬 것·미확인 |
|---|---|---|
| A3 문서·명령·저장·원본 파일 | `src/domain/animation*.ts`, `src/commands/animationApply.ts`, `src/state/animationStore.ts`, `src/animation/animationDatabase.ts`·`animationFile.ts`·`frameTimes.ts`. 계약 시험 101개(`tests/contracts/animationCommands·animationValidate·animationFile.spec.ts`: 슬라이드 명령 18개가 슬라이드 저장소와 같은 결과, 새 명령 2개, holds 맞추기, 거부 입력 28종, 원본 왕복·형식 구분·손상 파일 14종)와 저장소 시험 6개(`tests/e2e/animationStorage.spec.ts`). 슬라이드 쪽 변경은 `export` 낱말 5곳과 `ANIMATION_LOCKS` 한 줄뿐임을 `git status`로 확인 | 쓰기 오류 주입 시험은 슬라이드 저장소 것만 있다(애니메이션은 검사 실패·사진 누락·오래된 revision만 시험) |
| A4 편집 화면 틀·시작 화면 | `Editor`를 `src/app/Editor.tsx`로 옮긴 직후 슬라이드 e2e 8개 파일과 `video.spec.ts`·`probe.spec.ts`(121개)가 고치지 않고 통과했고, 선택 인자를 연 뒤 전체 시험이 통과했다. 셋째 타일, `AnimationApp`·`AnimationHome`·`AnimationEditor`, 기억 값 종류 `'animation'`. `AnimationStore`는 형 변환 없이 `Editor`의 저장소 자리에 들어간다(`tsc` 통과) | — |
| A5 애니메이션 화면 | `AnimationPanel`, 장 메뉴·배지, `OnionSkin`, `AnimationPlayer`·`previewCache`. 시험(`tests/e2e/animation.spec.ts` 12개): + 타일 복사와 되돌리기, 저장·새로고침 복원, 목록 분리, 원본 왕복과 형식 구분, 그리기·끌기, 패널, 없는 음악, 길게 보이기·빈 장, 양파 껍질(깔린 자리의 색이 흰 바탕 위 검정 35%이고 `renderSlide` 결과에는 없음), 재생(초당 2장에서 장이 바뀐 시각이 0.5·1.5·2.0·2.5초에서 −0.25~+0.15초 안, 반복, 멈춘 장으로 복귀, 재생 중 단축키 차단), 둘째 탭 읽기 전용. 300획 장을 복사한 장에서 양파 껍질을 켠 채 끌 때 프레임 간격 p95 16.8ms(개발 PC, 끈 슬라이드 측정값과 같다) | 재생 중 음악이 실제로 들리는지는 자동으로 확인하지 않았다. 실제 터치 기기 미확인 |
| A6 MP4 | `src/animation/exportAnimation.ts`(메인), `src/video/animationJob.ts`(Worker), `mediaWorker.ts`의 작업 종류, `exportFiles.ts`. 시험(`tests/e2e/animationExport.spec.ts` 5개, 번들 Chromium): 20프레임 작품의 패킷 20개·길이 0.833초·1920×1080·AAC, 각 장의 첫·마지막 프레임 색이 그 장의 `renderSlide` 색과 일치, moov가 mdat 앞, 음악이 없으면 소리 크기 0·있으면 0.01 초과, 초당 2장으로 바꾸면 60프레임 2.5초, 취소 뒤 내려받기 없음·임시 파일 없음·다시 받기, 출력 중 이름 변경·장 삭제가 파일에 섞이지 않음, 없는 음악은 ASSET_MISSING. 영상 내보내기 시험은 고치지 않고 통과 | Windows 미디어 플레이어·YouTube, 하드웨어 인코더(Chrome·Edge)에서의 제품 경로 출력, 긴 작품(4,800프레임)의 제품 경로 시간은 재지 않았다(A2 시험 페이지 수치만 있다). 다른 탭이 내보내기를 시작하면 이 탭이 방금 내려준 임시 파일을 지울 수 있다(내려받기는 그 전에 끝나는 것이 보통이라 받아들였다) |
| A7 통합 | `npm run build` 뒤 배포본 시험 16개 통과(애니메이션 1개 추가: 타일 3개가 화면 안, 그리기, 다음 장, 음악, 재생, MP4 내려받기, 새로고침 복원, 최근 작품 배지, 슬라이드 목록에 안 나옴. CSP 위반·외부 요청·실패 응답 0건). 실행 파일 시험(`node scripts/test-exe.mjs`, 66,604,032바이트) 모두 통과. npm test 550 통과(기존 426 + 애니메이션 124). 묶음 크기: 첫 화면 764KB(전 761KB), 애니메이션 편집기 23KB·저장소 6KB·내보내기 2KB(필요할 때 받음), 영상 작업 Worker 591KB(전 587KB). USER_GUIDE·RELEASE·PROGRESS 갱신 | 사람이 직접 써 보는 확인, 어린이 관찰, 푸시·프리릴리스는 하지 않았다(커밋은 2026-11-12) |

성능 목표와 기준 기기(RAM 8GB PC)는 기획안 §9에 있다. 개발 PC 수치만으로 통과 처리하지 않는다.

## 10. 결정 기록

### 사용자 결정 (2026-11-10)

| 번호 | 결정 | 확정값 | 계약 위치 |
|---|---|---|---|
| 1 | 타일 이름·색 | '애니메이션 만들기', 초록, 필름 띠 아이콘 | §6 시작 화면 |
| 2 | 구조 | 중간안(저장 분리, 편집 부품 재사용) | §1, §2, §9 |
| 3 | 저장 코드 | `animationDatabase.ts`를 따로 둔다(슬라이드 저장 코드 무변경) | §6 |
| 4 | 원본 파일 | `.canvaanim`, format 'canvaanimation' | §6 |
| 5 | 빠르기 | 2·4·6·8·12, 기본 6, 출력 24fps | §2, §3 |
| 6 | 길게 보이기 | 1·2·4 | §2, §4 |
| 7 | 장 수 상한 | 100 유지 | §5 |
| 8 | + 타일 | 지금 장 복사. 빈 장은 장 메뉴 | §9 |
| 9 | 발표 단추 | 재생으로 바꾼다. 전체 화면 재생은 후속 | §8, §9 |
| 10 | 소리 | 배경음악(내장 4곡)만 | §2, §8 |
| 11 | 웹캠으로 찍기 | 후속 | — |
| 12 | GIF 출력 | 넣지 않는다 | — |
| 13 | 양파 껍질 | 기본 켬, 투명도 35% 고정 | §8 |
| 14 | 슬라이드 작품 가져오기 | 후속 | — |

### A2 측정 후 결정 (2026-11-10, 근거는 ANIMATION_PHASE2_RESULTS.md)

| 항목 | 결정 | 근거(개발 PC) | 상태 |
|---|---|---|---|
| 그리기 위치 | 메인 스레드 `renderSlide` 1.5배, 인코딩은 Worker | 100장 그리기 합계 0.2~10.6초(중단 조건 30초) | 확정 |
| 출력 방식 | 24fps 반복 | 프레임 수·길이·장 전환이 식과 일치(브라우저 3종). 가변 방식은 플레이어 재생 미확인 | 확정 |
| 비트레이트 | 8Mbps 유지 | 100장 16.7초 작품 14~19MB. 200초 작품은 하드웨어 인코더에서 200MB | 확정(낮추기는 후속 후보) |
| 한 번에 넘기는 그림 | 1장 | 렌더러 프로세스 최대 657MB | 확정 |
| 8GB PC | — | 측정하지 않음 | 미검증 |

### 기획안과 달라진 점

| 기획안 | 이 계약 | 이유 |
|---|---|---|
| §3 "빈 장 추가"의 위치를 정하지 않음 | 지금 장 바로 뒤에 넣는다(`addSlide`의 afterSlideId = 지금 장) | 애니메이션에서는 장 순서가 곧 시간이라 맨 뒤보다 지금 자리가 자연스럽다 |
| §4 `setAnimation` 실패 조건 "허용값 아님"만 | 바꿀 것이 하나도 없는 명령도 INVALID_VALUE | 빈 명령이 조용히 통과하지 않게 |
| §7 재생은 "반복 재생"만 | 지금 장에서 시작해 끝까지 간 뒤 첫 장부터 반복 | 아이가 고치던 자리부터 확인할 수 있게 |
| §7 음악 목록에 없는 ID의 출력 처리 없음 | ASSET_MISSING으로 멈추고 다시 고르게 안내 | 소리 없는 파일을 정상 결과로 내지 않기 위해 |
| §8 A3 공통 애니메이션 fixture를 `scripts/make-animation-fixture.mjs`로 따로 만든다 | 슬라이드 공통 샘플에 애니메이션 필드를 더해 쓴다(`tests/contracts/animationHelpers.ts`) | 사진 파일을 두 벌 두지 않고, 같은 장으로 두 편집기의 명령 결과를 직접 견줄 수 있다 |
| §7 재생 캐시는 640×360 고정 | 장이 40개 이하면 960×540, 넘으면 640×360(§8) | 640×360을 재생 화면(960×540)에 늘려 그리니 글씨가 흐렸다. 짧은 작품은 선명하게, 긴 작품은 메모리 상한을 지킨다 |
| §7 결과 창을 따로 두지 않는다고만 함 | 더한 형식이 확장자와 완료 안내를 돌려주고 `Editor`가 내려받기 창의 안내 자리에 보여 준다(§9) | 슬라이드 내려받기 흐름을 그대로 쓰기 위해 |
| §3 양파 껍질 켜짐 여부의 유지 범위를 정하지 않음 | 작품을 여는 동안만 유지하고 다시 열면 켜진 상태다 | 문서에도 브라우저 설정에도 저장하지 않는 가장 단순한 규칙 |

## 11. 다음 할 일

1. ~~A2 기술 검증~~ 2026-11-10 개발 PC에서 측정했다([ANIMATION_PHASE2_RESULTS.md](ANIMATION_PHASE2_RESULTS.md)). 남은 확인: RAM 8GB PC, Windows 미디어 플레이어·YouTube.
2. ~~A3~A6~~ 2026-11-10 구현(§9 구현 기록). 남은 것은 A7 통합(배포본·실행 파일 시험, 사용 설명, 인계)과 사람 확인(직접 써 보기, Windows 미디어 플레이어·YouTube, 8GB PC, 어린이 관찰)이다.
3. 진행 상황은 PROGRESS.md에 남긴다.
