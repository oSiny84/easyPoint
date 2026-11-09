# CanvaCraft 영상 편집기 V1 데이터·명령·저장·출력 계약

작성일: 2026-11-07

상태: **구현 전 계약.** [VIDEO_EDITOR_PLAN.md](VIDEO_EDITOR_PLAN.md)(이하 기획안) §4~§7의 초안을 필드·명령·실패 조건·상한·저장·출력 규칙으로 확정한 문서다. 코드 수정, 라이브러리 설치, 브라우저 실행, 코덱·저장소 측정은 하지 않았다. 아래에서 "V2에서 결정"이라고 적은 값은 측정 전이라 비워 둔 것이고, 그 외의 값은 이 계약으로 확정한 것이다. 기획안 §4~§7과 이 문서가 다르면 이 문서가 우선하며, 달라진 점은 §10에 모았다.

슬라이드 편집기 계약은 [contracts.md](contracts.md)다. 두 편집기가 같은 규칙을 쓰는 곳은 "슬라이드 계약 §n과 같다"로만 적고 다시 쓰지 않는다. 이 문서에서 "슬라이드 계약"은 contracts.md를 뜻한다.

## 1. 적용 범위와 문서 관계

| 구분 | 내용 |
|---|---|
| 사용자 결정(2026-11-07, 기본값으로 확정) | 밈은 움직이는 스티커 또는 소리 든 짧은 밈 영상이다. 밈·효과음·음악은 자리 표시 자산으로 개발하고 V6 전까지 출처를 다시 묻는다. 가로·세로 작품 모두 지원하며 첫 영상의 방향으로 정한다. 작품 길이 상한 10분. 영상 바이트는 브라우저 저장소에 복사한다. 사진 조각은 넣지 않는다. WebM으로 낼 때 결과 창에 형식을 보여 준다. 시작 화면 최근 작품 6개. 전체 목록은 §10 |
| 이 문서 | 영상 작품의 데이터 필드, 모든 편집 명령과 취소 단위, 검사와 상한, 미디어 입력·저장·삭제, 미리보기·출력 규칙, 시작 화면이 두 편집기를 구분하는 방법 |
| 슬라이드 계약에서 그대로 쓰는 것 | 상태 소유자 원칙(§2), 글씨 줄 배치·글꼴 등록표·IME·빈 글씨 규칙(§3 텍스트), 취소 기록의 revision·메모리 규칙(§4), 색·ID 형식(§5), 자동 저장 시점과 잠금 순서(§6), 파일명 처리와 네트워크 금지(§8) |
| V2에서 결정 | 움직이는 스티커의 파일 형식, 영상 바이트 저장 위치(IndexedDB Blob / OPFS), 컨테이너 라이브러리, 출력 비트레이트 최종값, 작품 길이 상한 축소 여부, `.canvavideo` 대용량 쓰기·읽기 방법, 공식 지원 형식(MP4 우선 / WebM만), Worker 안 소리 섞기 방법. 8개, §10 둘째 표 |

슬라이드 편집기의 코드·문서·시험은 이 계약으로 바뀌지 않는다. 바뀌어야 하는 곳(시작 화면 추가, `src/state/store.ts` 일반화, 캔버스 크기 인자화, CSP·실행 파일 MIME)은 §9의 V3·V8에 적고 각 단계에서 슬라이드 쪽 시험 전체가 통과하는 것을 조건으로 한다.

### 기능 ↔ 계약 대조표 (V1 완료 기준)

기획안 §1의 포함 기능이 모두 데이터·명령·화면 조작·출력 규칙에 연결되는지 확인하는 표다.

| 기능 | 저장 필드 | 명령 | 어린이의 조작 | 출력 규칙 |
|---|---|---|---|---|
| 영상 가져오기 | Media, Clip, VideoProject.orientation·fps | addClip | 파일 선택·끌어놓기 | §8 조각 → 출력 프레임 대응 |
| 자르기·다듬기·지우기·순서 | Clip.inMs·outMs, clips 순서 | splitClip, trimClip, deleteClip, reorderClip | 재생 막대에서 자르기, 조각 끝 끌기, 지우기, 메뉴로 순서 | §3 작품 시각 계산, §4 겹침 요소 따라가기 |
| 자막 | CaptionOverlay | addCaption, updateCaption, setOverlayTime, moveOverlay, resizeOverlay, reorderOverlay, duplicateOverlay, deleteOverlay | 글씨 입력, 끌기, 보이는 시간 −/+, 지금부터, 타임라인 막대 끌기 | §8 layoutText 1.5배 그리기, 반투명 띠 |
| 움직이는 스티커 | MemeOverlay(memeKind='sticker') | addMeme, setOverlayTime, moveOverlay, resizeOverlay, reorderOverlay, duplicateOverlay, deleteOverlay | 밈 카드 끌어놓기, 크기, 보이는 시간 | §3 반복 프레임 식, §8 프레임 합성 |
| 밈 영상 | MemeOverlay(memeKind='clip'), soundOn | 위와 같음 + setMemeSound | 소리 켜기/끄기 | §8 둘째 해독기, 소리 섞기 |
| 효과음 | Meme.soundId(내장 목록), MemeOverlay.soundOn | setMemeSound | 소리 켜기/끄기(밈 영상 소리와 함께) | §8 startMs에 1회 |
| 원본 소리·배경음악 | Clip.muted, AudioSettings | setClipMuted, setAudio | 조각 소리 켜기/끄기, 원본 크기 3단계, 음악 카드·크기 | §8 소리 섞기 |
| 미리보기 | (문서 아님) | — | 재생·일시정지·재생 막대 끌기 | §8 미리보기 허용 오차 |
| 작품 저장·다시 열기 | VideoProject 전체, VideoProjectSummary | — | 자동 저장, 작품 목록 | §6 |
| 원본 파일 | `.canvavideo` | — | 파일 메뉴 원본 저장·열기 | §6 |
| 내보내기 | (문서 아님) | — | 내보내기 버튼, 진행률·취소, 결과 창 | §8 |
| 되돌리기 | 기록 | undo, redo | Ctrl+Z, 버튼 | §4 |
| 시작 화면 | `canvacraft.current-project` 값 형식, 두 저장소의 요약 | — | 타일 2개, 최근 작품 6개 | §6 |

## 2. 상태의 소유자와 저장 객체

문서 변경은 dispatch·undo·redo만 수행한다(슬라이드 계약 §2와 같다). 재생 위치, 선택, 활성 도구, 타임라인 확대율, 해독기·`<video>` 요소, 미리보기 프레임, 되돌리기 기록은 문서 원본이 아니다. 영상·소리의 실제 바이트는 문서 밖에 해시로 참조한다.

| 객체 | 저장 필드와 의미 |
|---|---|
| VideoProject | schemaVersion=1, kind='video', id, title, revision, createdAt, updatedAt, orientation, fps, clips, overlays, audio, mediaManifest |
| orientation | 'landscape'(논리 1280×720, 출력 1920×1080) 또는 'portrait'(논리 720×1280, 출력 1080×1920). 새 작품은 'landscape'다. clips가 비어 있을 때 addClip이 그 영상의 표시 크기(회전 적용 후)로 정한다. 세로가 더 길면 'portrait'. 그 뒤 조각을 모두 지워도 바뀌지 않으며, 다시 비었을 때의 addClip이 다시 정한다 |
| fps | 24·25·30 중 하나. 새 작품은 30. orientation과 같은 시점에 첫 영상에서 정한다. 영상 프레임률 f가 40보다 크면 40 이하가 될 때까지 절반으로 줄이고(60→30, 50→25, 120→30), 24·25·30 중 가장 가까운 값으로 반올림한다(23.976→24, 29.97→30). 그 뒤 추가하는 조각은 바꾸지 않는다 |
| Clip | id, mediaId, inMs, outMs, muted. inMs·outMs는 원본 영상 안의 구간(정수 ms, 0 ≤ inMs < outMs ≤ Media.durationMs). muted 기본 false. clips 배열 순서가 재생 순서다. 조각의 작품 안 시작 시각은 앞 조각 길이의 합으로 계산하고 저장하지 않는다 |
| Overlay 공통 | id, type('caption' 또는 'meme'), startMs, durationMs, x, y, width. startMs·durationMs는 작품 시각의 정수 ms. overlays 배열 순서가 뒤→앞 그리기 순서다(자막과 밈을 한 배열에 둔다) |
| CaptionOverlay | 공통 + text, fontId, fontSize, bold, color, align, lineHeight, backdrop('none' 또는 'band'). 높이는 저장하지 않고 layoutText로 계산한다(슬라이드 TextElement와 같다) |
| MemeOverlay | 공통 + height, memeId, memeKind('sticker' 또는 'clip'), soundOn(기본 true). memeKind는 내장 목록의 kind를 복사한 값이며 검사에서 일치해야 한다. 반복 여부는 저장하지 않는다(항상 반복, §3) |
| AudioSettings | originalVolume(0, 0.5, 1 중 하나. 기본 1), musicId(내장 음악 ID 또는 null. 기본 null), musicVolume(0, 0.5, 1 중 하나. 기본 0.5) |
| Media | id(원본 파일 바이트의 SHA-256, 64자리 hex), mime('video/mp4', 'video/quicktime', 'video/webm' 중 하나), byteLength, durationMs, width, height(회전을 적용한 표시 크기), rotation(0·90·180·270. 컨테이너가 알려 준 값), fps(원본 값, 소수 허용), hasAudio, videoCodec(예: 'avc1.64001f', 'hvc1.1.6.L93.B0', 'vp09.00.10.08'), audioCodec('mp4a.40.2', 'opus' 등, 없으면 null) |
| mediaManifest | Media 배열. 조각에서 지운 영상도 작품을 지울 때까지 남겨 다시 넣을 수 있게 한다(슬라이드의 assetManifest와 같은 규칙) |
| VideoProjectSummary | projectId, kind='video', title, updatedAt, revision, durationMs, thumbnailRevision, thumbnail(첫 조각 첫 프레임의 320×180 또는 180×320 JPEG). 미리보기는 삭제·재생성 가능한 파생 저장물이다 |

내장 자산 목록(밈·효과음·음악)은 문서가 아니라 앱 파일이다. 문서는 ID로만 참조한다.

| 내장 목록 | 위치와 필드 |
|---|---|
| 밈 | `public/memes/manifest.json`: schemaVersion, packId, version, assets[]. 각 항목은 id(`^[a-z0-9-]{1,64}$`), kind('sticker'·'clip'), label, category('cat'·'dog'·'reaction'·'effect'), tags[], file, durationMs, width, height, fps(스티커의 프레임률), hasSound, soundId(효과음 ID 또는 null), sha256, license, hidden(선택). `src/assets/library.ts`처럼 파일을 받은 뒤 형식·크기·해시를 확인하고 틀리면 그 밈을 쓸 수 없는 것으로 처리한다 |
| 효과음·음악 | `public/sounds/manifest.json`: sfx[]와 music[]. 항목은 id, label, file, durationMs, sha256, license. 모두 48kHz로 미리 변환한 파일만 넣는다 |
| 삭제 금지 | 한 번 배포한 밈·소리 ID는 목록에서 지우지 않는다. 패널에서 빼려면 hidden=true로 숨긴다. 저장된 작품이 ID로 참조하기 때문이다 |

되돌리기가 복원하는 내용(VideoProjectContent)은 title, orientation, fps, clips, overlays, audio, mediaManifest다. revision·updatedAt은 내용과 분리한다(슬라이드 계약 §4).

## 3. 시간·좌표·자막·밈 규칙

### 작품 시각과 출력 프레임

- 작품 길이 total = Σ(outMs − inMs). 조각이 없으면 0이다.
- 출력 프레임 k(0부터)의 시각은 마이크로초 정수 t_k = ⌊k × 1,000,000 / fps⌋이고, 겹침 요소 비교에는 ms 단위 ⌊t_k / 1000⌋을 쓴다. 출력 프레임 수는 ⌈total × fps / 1000⌉이다.
- 프레임 k가 보여 주는 조각은 start_c ≤ t_k/1000 < start_c + (outMs − inMs)인 조각 c이고, 원본 시각은 s = inMs + (t_k/1000 − start_c)다. 해독한 프레임 중 타임스탬프가 s 이하인 가장 늦은 프레임을 쓴다(이전 프레임 유지). 조각의 프레임률이 작품 fps와 달라도 이 규칙 하나로 맞춘다.
- 겹침 요소는 startMs ≤ t < startMs + durationMs인 프레임에 보인다(끝은 포함하지 않는다). §9의 "±1프레임"은 이 식으로 계산한 프레임과 실제 출력 파일의 프레임 차이를 뜻한다.
- 밈 프레임: 보이는 동안 밈 길이 L(ms)로 반복한다. 프레임 시각 t에서의 밈 안 시각은 m = (t − startMs) mod L이고, 스티커는 프레임 번호 ⌊m × 밈fps / 1000⌋의 그림, 밈 영상은 타임스탬프 m 이하의 가장 늦은 해독 프레임을 쓴다. 반복 경계에서 프레임을 건너뛰지 않는다는 뜻은 m이 L 직전 값에서 0으로 돌아갈 때 마지막 프레임 다음에 첫 프레임이 온다는 것이다.
- 겹침 요소의 startMs는 작품 시각으로 저장하지만, 조각을 바꾸는 명령은 그 시각이 가리키던 **원본 프레임**을 따라가도록 startMs를 다시 계산한다(§4 "겹침 요소 따라가기"). 아이가 앞부분을 잘라 내면 뒤의 자막이 같은 장면 위에 남아 있어야 하기 때문이다.

### 좌표

논리 좌표계는 orientation에 따라 1280×720 또는 720×1280이다. 화면 좌표 → 논리 좌표 변환, 손잡이에서 논리 크기를 직접 계산하는 규칙, 요소를 화면 밖으로 완전히 밀어낼 수 없다는 규칙은 슬라이드 계약 §3과 같다. 출력은 논리 좌표 × 1.5다. `geometry.ts`·`SelectionLayer`·`validate.ts`가 `LIMITS.slideWidth/Height`를 직접 읽는 부분은 V3에서 캔버스 크기를 인자로 받게 바꾸고, 슬라이드 쪽은 지금 값으로 호출해 동작이 바뀌지 않아야 한다.

영상 조각은 좌표를 갖지 않는다. 조각 프레임은 비율을 유지한 채 논리 캔버스 안에 **들어가도록 맞춘다(contain)**. 캔버스보다 작으면 키우고 크면 줄이며 남는 곳은 검은색이다. 기획안 §7의 "원본이 더 작으면 늘리지 않는다"는 720p 영상이 1080p 출력 가운데에 작게 보이게 되어 바꿨다(§10).

### 자막

줄 배치는 슬라이드 계약 §3의 layoutText를 캔버스 크기만 바꿔 그대로 쓴다. 글꼴 등록표·굵기 허용·폰트 로딩 후 배치·이모지 규칙도 같다. IME·빈 글씨 규칙은 슬라이드 계약 §3·§4와 같되, 빈 글씨로 끝난 새 자막은 명령을 만들지 않고 기존 자막을 비우고 확정하면 deleteOverlay로 처리한다.

| 항목 | 규칙 |
|---|---|
| 새 자막 기본값 | fontId 'sans-ko', fontSize 48, bold true, color '#FFFFFF', align 'center', lineHeight 1.3, backdrop 'band'. 가로 작품: width 960, x 160, y 540. 세로 작품: width 600, x 60, y 1000. startMs는 재생 막대 시각, durationMs 3000 |
| 스타일 예시 3개(자막 패널) | 보통(위 기본값), 크게(fontSize 72, width 1120·x 80 / 세로 660·x 30), 띠 없음(기본값에 backdrop 'none'). 기획안의 '말풍선'은 backdrop 종류를 늘려야 해서 첫 버전에서 뺐다(§10) |
| 반투명 띠(backdrop 'band') | 글씨 전체 영역(layoutText 높이 × width)에 논리 8px 여백을 더한 사각형, 모서리 반지름 8, 색 rgba(0,0,0,0.5). 띠는 자막 상자 좌표에 포함되지 않으며 여백만큼 캔버스 밖으로 나갈 수 있다 |
| 보이는 시간 | 1,000~60,000ms. UI의 −/+는 1,000ms 단위이고 끌기는 100ms 단위로 반올림한다. UI는 영상 끝을 넘지 않게 먼저 줄이고 안내하며, 명령은 넘는 값을 INVALID_VALUE로 거부한다 |
| 손잡이 | 좌우 손잡이는 width만, 모서리는 width와 fontSize를 같은 비율로(슬라이드와 같다) |

### 밈

| 항목 | 규칙 |
|---|---|
| 새 밈 기본값 | 캔버스 가운데에 놓는다. 스티커는 width 320(밈이 더 작으면 원래 크기), 밈 영상은 가로 작품 width 480·세로 작품 width 360. height는 밈 비율로 계산. startMs 재생 막대 시각, durationMs는 밈 길이를 1,000ms 단위로 올림한 값(최소 3,000ms), soundOn true |
| 크기 | 모서리 손잡이만 있고 비율을 유지한다. width·height는 내장 목록의 비율과 0.1% 이내로 일치해야 한다. width는 32~캔버스 너비 |
| 동시 개수 | 어느 시각에도 보이는 밈 영상은 2개, 스티커는 4개까지다. "같은 시각에 보인다"는 [startMs, startMs+durationMs) 구간이 겹친다는 뜻이다. 출력 때 동시에 여는 해독기 수를 묶기 위한 상한이며 §4의 명령과 §5의 검사가 같은 식을 쓴다 |
| 소리 | soundOn=false면 밈 영상의 소리와 붙은 효과음을 모두 끈다. 하나만 끄는 설정은 없다 |

## 4. 명령 계약과 취소

dispatch(projectId, expectedRevision, command)의 성공·실패 형태, revision 불일치·읽기 전용·부분 적용 금지, 변화 없는 명령의 처리는 슬라이드 계약 §4와 같다. 성공 결과의 "영향받은 장"은 영상에서 **focus**로 바꾼다: `{ kind: 'clip' | 'overlay', id } | null`. 되돌리기 뒤 UI는 focus의 요소를 선택하고 재생 막대를 그 요소의 시작 시각으로 옮긴다. 요소가 없어졌으면 선택을 해제하고 재생 막대는 그대로 둔다.

| 명령 | 입력 | 추가 실패 조건 | 취소 단위 |
|---|---|---|---|
| renameProject | title | 제목 한도 초과 | 이름 확정 1회 |
| addClip | media(Media 필드 전체), 새 영상이면 바이트가 이미 저장소에 있어야 함(§6) | 조각 수·미디어 수·합계 바이트·작품 길이 상한 초과, 미디어 필드 위반. clips가 비어 있으면 orientation·fps를 함께 정한다 | 영상 1개 추가(끝에 붙임) |
| splitClip | clipId, atMs(원본 시각) | inMs + 100 ≤ atMs ≤ outMs − 100이 아니면 INVALID_VALUE, 조각 수 상한 | 자르기 1회. 앞쪽이 원래 id를 유지하고 뒤쪽은 새 id로 바로 뒤에 들어간다 |
| trimClip | clipId, inMs, outMs | 0 ≤ inMs, outMs ≤ Media.durationMs, outMs − inMs ≥ 100, 작품 길이 상한 | 끌기 1회 |
| deleteClip | clipId | 대상 없음 | 1조각 삭제. 마지막 조각도 지울 수 있다(빈 작품 허용) |
| reorderClip | clipId, toIndex | 범위 밖 인덱스 | 이동 1회 |
| setClipMuted | clipId, muted | 대상 없음 | 켜기/끄기 1회 |
| addCaption | 자막 필드 전체(startMs·durationMs 포함) | 빈 글씨, 글자·시간·좌표·글꼴 위반, 겹침 요소 수 상한, total=0 | 첫 입력 확정 1회 |
| updateCaption | overlayId, text / 서식 / width / backdrop | 자막 아님, 값 위반 | 편집 묶음 1회(슬라이드 updateText와 같은 묶음 규칙) |
| addMeme | memeId, memeKind, x, y, width, height, startMs, durationMs, soundOn | 내장 목록에 없는 ID, kind 불일치, 비율 위반, 동시 밈 수 초과(LIMIT_EXCEEDED), 겹침 요소 수 상한, total=0 | 밈 1개 추가 |
| setOverlayTime | overlayId, startMs, durationMs | 0 ≤ startMs < total, 1,000 ≤ durationMs ≤ 60,000, startMs + durationMs ≤ total이 아니면 INVALID_VALUE. 밈이면 동시 밈 수 초과 | 끌기 또는 −/+ 1회. UI의 '지금부터'는 startMs만 바꾼 setOverlayTime이다 |
| moveOverlay | overlayId, x, y | 좌표 위반 | 끌기 1회 |
| resizeOverlay | overlayId, x, y, width, (자막) fontSize / (밈) height | 자막은 width·fontSize 범위, 밈은 비율·크기 범위 | 끌기 1회 |
| reorderOverlay | overlayId, toIndex | 범위 밖 | 앞뒤 변경 1회 |
| duplicateOverlay | overlayId | 겹침 요소 수 상한, (밈) 동시 밈 수 초과 | 복제 1회. 원본 바로 앞(그리기 순서상 위)에 두고 x·y에 각각 20을 더한 뒤 화면 안으로 보정한다. 시간은 같다 |
| deleteOverlay | overlayId | 대상 없음 | 삭제 1회 |
| setMemeSound | overlayId, soundOn | 밈 아님 | 켜기/끄기 1회 |
| setAudio | originalVolume / musicId / musicVolume 중 바꿀 것 | 허용값 아님, 내장 목록에 없는 음악 ID | 설정 1회 |

새 영상의 등록은 addClip의 media로 같은 명령에서 처리하고, 되돌리면 mediaManifest 등록도 돌아간다. 바이트는 저장소에 남는다(§6). 같은 해시의 영상을 다시 넣으면 Media를 추가하지 않고 조각만 추가한다.

### 겹침 요소 따라가기 (splitClip·trimClip·deleteClip·reorderClip 공통)

조각을 바꾸는 명령은 같은 원자적 작업 안에서 모든 겹침 요소를 다음 순서로 고친다. 결과는 명령 하나의 취소 기록에 들어가므로 되돌리면 자막·밈도 함께 돌아온다.

1. 명령 적용 전에 요소마다 startMs가 가리키는 (조각 id, 조각 안 원본 시각 s)를 구한다.
2. 명령을 적용한 뒤 그 (조각, s)가 남아 있으면 새 작품 시각을 startMs로 쓴다. splitClip으로 조각이 둘이 된 경우 s가 든 쪽을 따라간다.
3. 그 원본 구간이 없어졌으면(지운 조각 위, 다듬어 낸 구간 위) 요소를 지운다.
4. startMs + durationMs가 새 total을 넘으면 durationMs를 total − startMs로 줄이고, 그 결과가 1,000ms 미만이면 요소를 지운다.
5. 밈의 동시 개수가 상한을 넘게 되면 **늦게 시작하는 밈부터** 지워 상한에 맞춘다.
6. 요소가 지워지거나 줄어들었으면 결과에 `adjustedOverlays: number`를 넣어 UI가 "자막(밈) n개가 영상과 함께 없어졌어요"로 안내한다.

durationMs는 1~4단계에서 작품 시각 길이를 그대로 유지한다(원본 프레임 길이로 바꾸지 않는다). reorderClip은 요소가 따라가므로 자막이 조각과 함께 움직인다. addClip은 끝에 붙이므로 기존 요소가 움직이지 않는다.

### 취소

undo/redo의 revision 발급, redo 비우기, 기록 상한(500개·추정 32MiB), 구조 공유를 중복 세지 않는 추정은 슬라이드 계약 §4와 같다. 추정식은 조각당 64바이트, 겹침 요소당 128바이트 + 글자 수 × 2, Media당 160바이트로 둔다. 영상·소리 바이트는 문서 밖이라 세지 않는다. 저장·출력·재생·선택·재생 막대 이동은 기록을 만들지 않는다.

`src/state/store.ts`는 `Project`·`Slide`에 묶여 있다(`nearestSlide`, `estimateBytes`, `touchedSlide`). V3에서 문서 내용 타입·명령 적용 함수·메모리 추정 함수·focus 계산 함수를 인자로 받는 공통 저장소로 일반화한다. 조건은 `tests/contracts`와 `tests/e2e/flow.spec.ts`가 수정 없이 통과하는 것이다. 일반화가 그 조건을 깨면 같은 규칙의 `src/state/videoStore.ts`를 따로 두고, AGENTS.md의 "문서를 바꾸는 곳은 src/state/store.ts의 dispatch·undo·redo뿐이다"에 videoStore를 추가한다.

## 5. 파일 검사와 초기 상한

원본 파일과 저장소 읽기는 같은 `validateVideoProject`를 통과하고 런타임 명령도 같은 필드 검증을 쓴다. 알 수 없는 필드와 지원하지 않는 schemaVersion의 처리는 슬라이드 계약 §5와 같다. 한도를 넘는 요소를 몰래 잘라 열지 않는다.

상한은 `src/domain/videoLimits.ts`(가칭)에 `VIDEO_LIMITS`로 따로 둔다. 슬라이드 `LIMITS`의 x·y 범위가 가로 캔버스 전용이고 자막 글자 수가 다르기 때문이다. 글꼴·글씨 크기·줄 간격·색 규칙은 `LIMITS`의 값을 참조한다.

| 대상 | 초기 상한·허용 규칙 |
|---|---|
| 제목·자막 | 제목 100 code point(슬라이드와 같다), 자막 200 code point |
| 영상 파일 | 파일당 2GiB, 길이 10분(600,000ms), 표시 크기 각 변 최대 3840. mime은 §2의 3종. 길이·크기 초과는 LIMIT_EXCEEDED |
| 작품 | 조각 50개, total 600,000ms, 겹침 요소(자막+밈) 300개, Media 20개·합계 4GiB |
| 조각 | 0 ≤ inMs < outMs ≤ durationMs, outMs − inMs ≥ 100ms |
| 겹침 요소 시간 | 0 ≤ startMs < total, 1,000 ≤ durationMs ≤ 60,000, startMs + durationMs ≤ total. 조각이 없으면 겹침 요소도 없어야 한다 |
| 좌표·크기 | 캔버스 W×H에 대해 x: −W~2W, y: −H~2H. 자막 width 16~W. 밈 width 32~W, height 32~H, 내장 목록 비율과 0.1% 이내. 계산한 요소 영역이 캔버스와 교차해야 한다 |
| 자막 스타일 | fontSize 12~240, lineHeight 1~2, align left/center/right, 등록 fontId, 굵기 허용 글꼴만 bold, 색 #RRGGBB, backdrop none/band |
| 밈 | memeId가 내장 목록에 있고 memeKind가 일치. 어느 시각에도 밈 영상 2개·스티커 4개 이하(§3의 겹침 정의) |
| 내장 밈 파일 | 스티커 1,000~5,000ms, 512×512 이하, 투명 채널 있음. 밈 영상 1,000~10,000ms, 1280×720 이하. 효과음 3,000ms 이내, 음악 300,000ms 이내. 목록 검사는 빌드 시험(`tests/contracts`)에서 한다 |
| 소리 | originalVolume·musicVolume ∈ {0, 0.5, 1}, musicId는 null 또는 내장 목록 ID |
| ID | 작품·조각·요소 UUID(슬라이드 validate.ts의 UUID와 같다), Media 64자리 hex, 작품 안 중복 거부 |
| 원본 ZIP | §6 |

Media 필드는 저장소의 실제 바이트와 일치해야 한다. 열 때 byteLength를 비교하고, 해시 재계산은 하지 않는다(2GiB 해시는 가져올 때 한 번만 계산한다). mediaManifest에 있지만 바이트가 없는 영상은 조각이 쓰지 않으면 목록에서 빼고, 조각이 쓰면 ASSET_MISSING으로 열기 실패다(슬라이드 계약 §6의 사진 규칙과 같다).

## 6. 미디어 입력·저장·삭제

### 가져오기 (importMedia)

1. 파일 크기와 저장소 남은 공간을 비교한다. `navigator.storage.estimate()`의 (quota − usage)가 파일 크기 × 1.1보다 작으면 복사하지 않고 STORAGE_FULL이다.
2. 파일 앞부분으로 컨테이너 형식을 확인한다(MP4/MOV 'ftyp', WebM EBML). 아니면 ASSET_INVALID("영상 파일이 아니에요").
3. 컨테이너를 읽어 트랙·길이·크기·회전·코덱 문자열을 얻는다. 영상 트랙이 없거나 읽을 수 없으면 ASSET_INVALID. 길이·크기 상한 초과는 LIMIT_EXCEEDED.
4. `VideoDecoder.isConfigSupported()`로 이 PC가 해독할 수 있는지 확인한다. 소리 트랙이 있으면 `AudioDecoder.isConfigSupported()`도 확인한다. 하나라도 안 되면 MEDIA_UNSUPPORTED("이 영상은 이 컴퓨터에서 읽을 수 없어요. 휴대폰 설정에서 '호환성 높은 형식(MP4)'으로 다시 찍거나 변환해 주세요"). HEVC는 지원을 약속하지 않는다.
5. 바이트를 저장소에 복사하면서 SHA-256을 계산한다. 메인 스레드가 아닌 Worker에서 하고, 2GiB 파일의 소요 시간은 V2에서 잰다. 같은 해시가 이미 있으면 복사하지 않는다.
6. 첫 프레임을 해독해 미리보기 그림을 만든다. 실패해도 가져오기는 성공이며 미리보기만 비운다.
7. 결과 Media를 돌려주고, UI가 addClip을 보낸다. 2~6 어느 단계가 실패해도 작품은 바뀌지 않는다.

원본 파일명·경로·EXIF·위치 정보 같은 메타데이터는 문서에 저장하지 않고 출력 파일에도 넣지 않는다. 화면에는 '영상 1'처럼 순번으로 표시한다. 바이트는 재인코딩하지 않고 그대로 복사한다(해시가 원본 바이트의 것이라 같은 파일을 다시 넣어도 하나로 모인다).

### 저장소

| 항목 | 결정 |
|---|---|
| 데이터베이스 | 새 IndexedDB `canvacraft-video` 버전 1: projects, summaries, media(바이트 저장 위치가 OPFS로 정해지면 media에는 메타데이터만). 기존 `canvacraft` 데이터베이스의 구조·버전은 바꾸지 않는다(RELEASE.md: 버전을 올리면 앞 버전으로 되돌릴 수 없다) |
| 바이트 위치 | 사용자 영상 바이트는 IndexedDB Blob과 OPFS 중 V2 측정으로 정한다. 조건은 500MB 파일 쓰기 30초 이내, 부분 읽기(Range) 가능, 삭제 즉시 용량 회수. 선택한 뒤 이 표를 갱신한다 |
| 임시 파일 | 내보내기 결과를 흘려 쓰는 임시 파일(§8)과 `.canvavideo` 스트리밍 쓰기(아래)는 영상 바이트 위치와 무관하게 **OPFS**를 쓴다(Worker에서 `createSyncAccessHandle`). IndexedDB는 조각 단위로 이어 쓰기가 안 되기 때문이다. OPFS 쓰기 속도와 용량 회수는 V2에서 함께 잰다 |
| 저장 순서 | 바이트는 가져올 때 이미 저장돼 있다. 자동 저장은 projects와 summaries를 한 트랜잭션으로 갱신하며 이 성공이 저장 확정이다. 더 새로운 revision이 저장돼 있으면 REVISION_CONFLICT(슬라이드 계약 §6과 같다) |
| 자동 저장 시점 | 변경 1초 뒤, 연속 편집 중 최대 5초(슬라이드와 같다. `autosave.ts` 재사용) |
| 잠금 | Web Locks 이름은 `canvacraft-video-catalog`(공유)와 `canvacraft-video-project-<id>`(배타). 순서는 catalog → project. 슬라이드 잠금과 이름이 달라 같은 id의 작품이 있어도 충돌하지 않는다. 잠금이 없으면 읽기 전용(슬라이드 계약 §6 Phase 8 결정과 같다). 둘째 탭은 읽기 전용 |
| 고아 정리 | 어느 영상 작품의 mediaManifest에도 없는 바이트를 지운다. 배타 `canvacraft-video-catalog` 잠금을 얻었을 때만, 즉 영상 편집 세션이 없을 때만 한다. 가져오기 뒤 addClip을 되돌린 바이트도 이때 지워진다. 슬라이드 저장소의 `removeOrphanAssets`와 트랜잭션·잠금을 섞지 않는다 |
| 작품 삭제 | 작품 목록의 '이 컴퓨터에서 지우기'는 문서·요약·미리보기를 지우고 고아 정리를 실행해 그 작품만 쓰던 바이트를 회수한다. 내려받은 파일은 지우지 않는다. undo 대상이 아니다 |
| 용량 표시 | 영상 패널에 "이 컴퓨터에 영상을 더 넣을 자리: 약 n GB"를 `estimate()`로 표시한다. 추정값이며 보장이 아니다 |
| 영구 보관 | `navigator.storage.persist()`를 요청하되 보장으로 설명하지 않는다(슬라이드와 같다) |

### 시작 화면과 두 저장소

- 시작 화면의 최근 작품은 슬라이드 `canvacraft`의 summaries와 영상 `canvacraft-video`의 summaries를 각각 읽어 kind를 붙인 뒤 updatedAt 순으로 6개를 보여 준다. 슬라이드 summaries에 kind 필드를 추가하지 않는다(버전을 올리지 않기 위해).
- `sessionStorage`의 `canvacraft.current-project` 값은 JSON `{"kind":"slide"|"video","id":"<uuid>"}`로 바꾼다. JSON이 아닌 문자열은 옛 형식이며 슬라이드 작품 id로 해석한다. 두 편집기 모두 새 형식으로 쓴다.
- 기억한 작품이 있으면 그 편집기로 바로 돌아가고, 없으면 항상 시작 화면이다(기획안 §2).

### 원본 파일 `.canvavideo`

| 항목 | 규칙 |
|---|---|
| 구조 | ZIP. manifest.json `{ format: 'canvavideo', schemaVersion: 1 }`, project.json(조각이 쓰는 Media만 든 mediaManifest), media/<sha256>.mp4 / .mov / .webm(STORE, 압축 안 함). 밈·효과음·음악은 ID로만 참조하므로 넣지 않는다 |
| 형식 구분 | format이 'canvavideo'가 아니면 영상 편집기는 INVALID_VALUE("영상 작품 파일이 아니에요")로 거부한다. 슬라이드 편집기가 format 'canvacraft'가 아닌 파일을 거부하는 것은 코드에서 확인됨(`src/storage/projectFile.ts` 101행, "CanvaCraft 작품 파일이 아니에요"). 그래서 `.canvavideo`를 슬라이드 편집기에서 열어도 깨지지 않는다 |
| 열기 | 검증 후 새 projectId, revision 0으로 가져온다(슬라이드 계약 §6과 같다). media/ 항목은 해시를 다시 계산해 파일명과 비교하고 저장소에 복사한다 |
| 검사 | 허용 경로만, 중복·절대·상위 경로·암호화 항목 거부, 헤더 크기를 믿지 않고 실제 해제 바이트에 상한 적용(슬라이드 계약 §5와 같다). 항목 수 ≤ 22(manifest, project, media 20) |
| 크기 | 저장 전에 예상 크기(media byteLength 합 + 1MiB)를 보여 주고 확인을 받는다 |
| 대용량 | JSZip은 ZIP 전체를 메모리에 만들고 읽을 때도 전체를 올린다. 4GiB 작품에는 쓸 수 없다. **V2에서** 스트리밍 ZIP 쓰기·읽기(예: 저장소 임시 파일로 흘려 쓰기, File System Access API) 가능 여부를 측정해 정한다. 정해지기 전의 규칙: media 합계 1GiB 이하만 원본 저장을 허용하고, 넘으면 "영상이 커서 원본 파일로 저장할 수 없어요. 이 컴퓨터에는 자동 저장돼 있어요"로 안내한다 |

## 7. 모듈 API와 오류

| API | 결과와 책임 |
|---|---|
| dispatch / undo / redo | 변경된 문서·revision·focus·adjustedOverlays 또는 오류 |
| validateVideoProject | 값·참조·개수·동시 밈 수 검사. 자동 복구 없음 |
| importMedia(file, signal) | Media 또는 오류. 바이트를 저장소에 쓴다 |
| loadMemes / loadSounds | 내장 목록을 받아 해시 검증. 항목별 실패는 그 항목만 사용 불가 |
| prepareVideoRender | 글꼴·밈 프레임·소리 버퍼 준비. 실패하면 중단 |
| composeFrame(frame, overlays, t, assets, scale) | 영상 프레임 위에 자막·밈을 그린 캔버스. 미리보기(scale 1)와 출력(scale 1.5)이 같은 함수를 쓴다 |
| saveVideoProject / openVideoProject | revision 확인·잠금·저장·검사 |
| serializeVideoProject / deserializeVideoProject | `.canvavideo` 생성 / 새 작품 후보 |
| exportVideo(snapshot, mediaResolver, options, signal) | `{ ok: true, file: Blob, container: 'mp4' \| 'webm', warnings }` 또는 오류. 진행률 콜백 포함 |

오류 code는 슬라이드의 `ErrorCode`에 둘을 더한다: **MEDIA_UNSUPPORTED**(이 PC가 해독할 수 없는 코덱·형식), **ENCODER_UNAVAILABLE**(H.264+AAC도 VP9+Opus도 쓸 수 없음). 손상·비영상 파일은 ASSET_INVALID, 저장된 바이트 없음은 ASSET_MISSING, 길이·크기·개수 초과는 LIMIT_EXCEEDED, 시간·좌표 위반은 INVALID_VALUE다. 예상 실패를 빈 문서·성공 Blob으로 위장하지 않고, 메시지·로그에 영상 내용·원본 파일명을 넣지 않는다(슬라이드 계약 §7과 같다).

메모리: 해독한 `VideoFrame`은 그린 직후 `close()`한다. 미리보기는 현재 조각과 다음 조각의 `<video>` 두 개, 보이는 밈 영상의 `<video>`(최대 2), 보이는 스티커의 프레임만 쥔다. 스티커 프레임은 보이는 동안만 메모리에 두고 안 보이면 해제한다. 출력 바이트는 저장소 임시 파일로 흘려 쓴다(§8).

## 8. 미리보기·출력·네트워크 계약

### 미리보기

재생 시계는 Web Audio `AudioContext.currentTime`이다. 영상 조각은 숨긴 `<video>`(저장소 Blob URL)를 시계에 맞춰 재생하고 프레임을 캔버스에 그린 뒤 composeFrame으로 자막·밈을 겹친다. 밈 영상은 보이는 것마다 숨긴 `<video>` 하나를 §3의 m 시각에 맞춘다. 스티커는 `ImageDecoder`(또는 V2에서 정한 방법)로 풀어 둔 프레임 중 §3의 프레임 번호를 그린다. 효과음·음악·밈 소리는 Web Audio로 같은 시계에 맞춘다. 재생 막대를 끌 때는 그 시각의 프레임을 seek해 그린다. 미리보기는 출력과 1프레임 차이를 허용하고 끊김도 허용하지만, 자막·밈이 **보이기 시작하는 시각과 끝나는 시각**은 §3의 식과 같아야 한다.

### 출력

| 항목 | 결정 |
|---|---|
| 처리 위치 | Worker. 메인 화면은 진행률·취소만 맡는다. 슬라이드 계약 §8의 "worker는 쓰지 않는다"는 영상 모드에 적용하지 않는다(개정). contracts.md §8 그 문장 뒤에 "영상 모드는 video-contracts.md §8을 따른다"를 V8에서 한 문장 추가한다(슬라이드 계약의 다른 내용은 바꾸지 않는다). 같은 origin 스크립트 Worker라 현재 CSP `script-src 'self'`로 허용된다. 라이브러리가 WASM을 쓰면 `'wasm-unsafe-eval'`을 더해야 하며 V2에서 확인한다 |
| 순서 | 입력 확정 → snapshot → 글꼴·밈 프레임·소리 준비 → 프레임 k = 0부터 §3의 식으로 조각 프레임 해독·composeFrame(scale 1.5)·`VideoEncoder` → 소리 섞기·`AudioEncoder` → 컨테이너 쓰기 → 다운로드. 출력 중 편집은 snapshot에 섞지 않는다 |
| 해상도 | 가로 1920×1080, 세로 1080×1920. 조각은 contain으로 맞추고 여백은 검은색(§3) |
| 프레임률 | 작품 fps. 조각 프레임률이 달라도 §3의 "타임스탬프 s 이하의 가장 늦은 프레임" 규칙으로 맞춘다 |
| 형식 선택 | **쌍으로 정한다.** H.264(High, 'avc1.640028')와 AAC-LC('mp4a.40.2')가 **둘 다** `isConfigSupported()`를 통과하면 MP4. 하나라도 안 되면 파일 전체를 WebM(VP9 'vp09.00.40.08' + Opus)으로 낸다. 둘 다 안 되면 ENCODER_UNAVAILABLE. V2에서 두 조합을 각각 시험한다 |
| 비트레이트 | 시작값 1080p30 영상 10Mbps VBR, 소리 AAC 192kbps 또는 Opus 128kbps. V2 결과와 YouTube 권장값 재확인으로 조정한다 |
| 소리 섞기 | 48kHz 스테레오로 섞는다. 섞는 위치는 **V2에서 결정**한다: Web Audio `OfflineAudioContext`는 메인 스레드에서만 만들 수 있다고 알려져 있어(미확인) Worker 안에서 쓸 수 없으면, Worker가 `AudioDecoder`의 Float32 출력을 직접 더해 섞는다. 메인 스레드에서 섞으면 10분 작품의 소리 버퍼(약 230MB)가 메인 메모리에 올라가고 "메인 화면은 진행률·취소만"이라는 규칙이 깨지므로 그 방법은 마지막 선택이다. 섞는 규칙은 어느 위치든 같다: 조각 원본 소리(muted가 아닌 조각, × originalVolume) + 밈 영상 소리(soundOn인 밈, §3의 반복 포함, × 1) + 효과음(soundOn인 밈의 startMs에 1회, 반복마다 다시 내지 않음) + 배경음악(musicId가 있으면 0초부터, 음악 길이가 작품보다 짧으면 반복, 작품 끝에서 자름, 페이드 없음, × musicVolume). 합은 −1~1로 자르고 압축기는 쓰지 않는다. 자주 잘리면 V7에서 음량 단계를 조정하고 이 표를 갱신한다. 소리가 전혀 없는 작품도 무음 소리 트랙을 넣는다 |
| 메모리 | 한 번에 쥐는 해독 프레임은 조각 1개분 + 밈 영상 2개분이며 그린 직후 close. 인코딩 결과는 OPFS 임시 파일(§6)로 흘려 쓰고 끝나면 File로 내려준다. 실패·취소 시 임시 파일을 지운다 |
| 진행·취소 | 진행률 = 인코딩한 프레임 / 전체 프레임. 취소는 CANCELLED이며 부분 파일을 내려주지 않는다. 취소 뒤 다시 내보낼 수 있다 |
| 결과 창 | 파일 형식(MP4 / WebM), 길이, 크기. WebM이면 "YouTube에 올릴 수 있어요"를 함께 쓴다. YouTube 안내는 "보호자 계정으로 올리기" 한 문단, 외부 링크 없음 |
| 파일명 | 제목 처리 규칙은 슬라이드 계약 §8과 같고 확장자 .mp4 / .webm은 앱이 붙인다 |
| 메타데이터 | 출력 파일에 원본 파일명·위치 정보·앱 외 메타데이터를 넣지 않는다 |

### 네트워크·CSP·실행 파일

영상·소리·밈·음악은 모두 같은 origin 파일 또는 저장소 Blob이다. 외부 요청은 0건이다(슬라이드 계약 §8과 같다). 바뀌어야 하는 곳:

| 파일 | 변경 | 시점 |
|---|---|---|
| `scripts/prune-dist.mjs` CSP | `media-src 'self' blob:` 추가(필수. 지금은 `default-src 'none'`에 media-src가 없어 배포본에서 `<video src="blob:…">`·`<audio>`가 막힌다). WASM이면 `script-src`에 `'wasm-unsafe-eval'` | V2에서 확인, V8에서 반영 |
| `launcher/CanvaCraftLauncher.cs` `TypeOf` | `.mp4`, `.webm`, `.mp3`, `.ogg`, `.wasm` MIME 추가(`nosniff`를 보내므로 없으면 거부된다) | V8 |
| `scripts/serve-dist.mjs` | 같은 MIME 추가 | V8 |
| 내장 소리·밈 파일 받기 | `fetch()`로 통째로 받아 Blob URL로 쓴다. 실행 파일 서버가 Range를 지원하지 않기 때문이다. 사용자 영상은 저장소에서 읽어 서버를 거치지 않는다 | V6 |
| `tests/release`, `scripts/test-exe.mjs` | 시작 화면 타일 클릭 단계, 미리보기 재생, 내보내기 1회 추가 | V3·V8 |
| `docs/contracts.md` §8 | "worker는 쓰지 않는다" 뒤에 영상 모드 예외 한 문장 추가 | V8 |

## 9. 단계 반영과 완료 조건

| 단계 | 이 계약에서 쓰는 절 | 인계 근거 |
|---|---|---|
| V1 계약 | 전체 (이 문서) | 기능 대조표(§1)에 빈 칸 없음, §10 결정 표 |
| V2 기술 검증 | §6 저장소 선택, §8 형식 선택·비트레이트·CSP, §3 스티커 형식 | `docs/VIDEO_PHASE2_RESULTS.md`: 브라우저·라이브러리 버전, 두 PC 측정값, 출력 파일 재생 확인, 이 문서의 "V2에서 결정" 칸 채움 |
| V3 시작 화면·문서·명령·저장 틀 | §2, §4 전체, §5, §6 저장소·시작 화면·`.canvavideo` | 명령별 실행→취소→다시 실행 시험, 겹침 요소 따라가기 시험(앞 조각 삭제·다듬기·순서 변경·분할 뒤 자막 시각), 동시 밈 수 상한 시험, 공통 fixture(WebM 2개 + 문서) 왕복, 시작 화면 e2e, 슬라이드 쪽 시험 전체 통과 |
| V4 가져오기·타임라인·자르기 | §6 가져오기, §3 작품 시각, §8 미리보기 | 손상·미지원·초과 파일 시험, 조각 경계 재생, 자르기 취소 |
| V5 자막 | §3 자막 | IME 시험 재사용, 자막 시작·끝 시각 일치, 영상 끝 넘김 처리 |
| V6 밈·소리 | §2 내장 목록, §3 밈, §8 미리보기 소리 | 밈 프레임·효과음 시각 ±1프레임, 반복 경계, 소리 끄기, 자산 라이선스 기록 |
| V7 내보내기 | §8 출력 | 출력 파일을 다시 해독해 §3의 식으로 계산한 프레임과 비교하는 자동 시험, 두 PC 측정, 플레이어 재생·YouTube 업로드(사람 확인) |
| V8 통합 | §8 네트워크·CSP·실행 파일 | test:release·test:exe 통과, 기획안 §9 시나리오 7개 |

각 단계는 `npm test` 전체와 `tests/e2e/flow.spec.ts`가 계속 통과하는 것을 전제로 한다(AGENTS.md). 성능 목표(출력 시간 영상 길이의 2배 이내, 탭 메모리 1.5GB 이내, 밈 영상 2개 겹친 구간 20%인 작품의 출력 시간 1.5배 이내 등)는 기획안 §9에 있고 기준 기기는 RAM 8GB PC다. 개발 PC 수치만으로 통과 처리하지 않는다. 이 문서 작성만으로 V1 이후의 어떤 단계도 완료로 선언하지 않는다.

## 10. 결정 기록

### 사용자 결정 (2026-11-07 "기본값으로 진행")

| 결정 | 확정값 | 계약 위치 |
|---|---|---|
| 밈의 종류 | 움직이는 스티커(투명 애니메이션)와 소리 든 짧은 밈 영상 | §2 MemeOverlay, §3 밈 |
| 밈·효과음·음악 출처 | 자리 표시 자산으로 개발한다. **출처는 V6 전까지 다시 묻는다**(아직 열려 있는 유일한 사용자 결정) | §2 내장 목록, §9 V6 |
| 세로 영상 | 가로·세로 모두 지원. 첫 영상의 방향으로 정하고 섞이면 contain 여백 | §2 orientation, §3 좌표 |
| 작품 길이 상한 | 10분. V2 측정으로 줄일 수 있다 | §5 |
| 영상 저장 방식 | 브라우저 저장소에 복사 | §6 |
| 사진 조각 | 첫 버전에 넣지 않음 | §1 |
| WebM 안내 | 결과 창에 형식과 "YouTube에 올릴 수 있어요" 표시 | §8 결과 창 |
| 최근 작품 수 | 6개 | §6 시작 화면 |

### V2 측정 후 결정 (측정 전에 임의 값으로 확정하지 않는다)

| 항목 | 선택지 | 결정 조건 |
|---|---|---|
| 스티커 파일 형식 | 애니메이션 WebP / APNG(`ImageDecoder`) 또는 투명 WebM(VP9 알파, WebCodecs 알파 전달 여부 미확인) | 프레임 시각을 얻을 수 있고 512×512×5초 프레임 메모리가 허용 범위인 것 |
| 영상 바이트 저장 위치 | IndexedDB Blob / OPFS | 500MB 쓰기 30초 이내, 부분 읽기, 삭제 즉시 회수 |
| 컨테이너 라이브러리 | Mediabunny(후보) / mp4-muxer+webm-muxer 조합 | 설치·MP4·MOV·WebM 읽기·쓰기·회전 정보·WebCodecs 연결·라이선스·번들 크기·WASM 여부 |
| 비트레이트 | 10Mbps 시작값 | 두 PC 출력 시간·파일 크기, YouTube 권장값 현재 페이지 |
| 작품 길이 상한 | 10분 유지 / 축소 | 8GB PC에서 10분 출력이 시간·메모리 목표를 넘는지 |
| `.canvavideo` 대용량 | 스트리밍 ZIP 쓰기·읽기(OPFS 임시 파일 경유) / 1GiB 제한 유지 | 메모리에 올리지 않고 쓰고 읽을 수 있는지 |
| 공식 지원 형식 | MP4 우선 + WebM 대체 / WebM만 | H.264+AAC가 두 PC에서 모두 안 되면 WebM만 |
| Worker 안 소리 섞기 | `OfflineAudioContext`(Worker에서 만들 수 있으면) / Worker가 `AudioDecoder` 출력을 직접 합산 / 메인 스레드에서 섞기(마지막 선택) | Worker에서 Web Audio 사용 가능 여부, 10분 작품 소리 섞기의 시간·메모리 |

### 기획안과 달라진 점

| 기획안 | 이 계약 | 이유 |
|---|---|---|
| §7 "원본이 더 작으면 늘리지 않고 그대로" | contain으로 키우거나 줄인다(§3) | 720p 영상이 1080p 가운데에 작게 보이고 YouTube에서 검은 테두리가 생긴다 |
| §3 자막 스타일 예시 "크게·보통·말풍선" | 보통·크게·띠 없음(§3) | 말풍선은 backdrop 종류와 그리기 규칙을 늘려야 한다. 후속 범위 |
| §4 겹침 요소는 작품 시각 | 저장은 작품 시각이지만 조각 명령이 원본 프레임을 따라가도록 다시 계산한다(§4) | 앞을 자르면 자막이 다른 장면 위로 밀리는 문제를 막는다 |
| §3 "자막·밈이 영상 끝을 넘으면 줄이고 안내" | UI가 먼저 줄이고 명령은 거부한다. 조각 명령으로 넘게 되면 같은 명령 안에서 줄이거나 지우고 adjustedOverlays로 안내한다(§4) | 검사와 명령이 같은 규칙을 쓰기 위해 |
| §4 동시 밈 수는 상한만 | 추가·시간 변경·복제는 LIMIT_EXCEEDED로 거부하고, 조각 명령으로 넘게 되면 늦게 시작하는 밈부터 지운다(§4) | 조각 지우기가 밈 때문에 실패하면 아이가 이유를 알 수 없다 |
| §7 배경음악 길이 처리 없음 | 작품보다 짧으면 반복, 끝에서 자름, 페이드 없음(§8) | 음악 상한 5분·작품 10분이라 규칙이 필요하다 |
| §4 ErrorCode 2개 추가만 | 손상 파일 ASSET_INVALID, 바이트 없음 ASSET_MISSING, 초과 LIMIT_EXCEEDED로 기존 코드에 배정(§7) | 코드 수를 늘리지 않는다 |
| §2 기억 값 "형식 변경" | JSON `{kind,id}`, 옛 문자열은 슬라이드(§6) | 구체화 |

## 11. 다음 할 일

1. V2 기술 검증. 산출물은 `docs/VIDEO_PHASE2_RESULTS.md`이고 이 문서의 "V2에서 결정" 8개를 채운다.
2. V2 결과로 §5 상한과 §8 형식 규칙을 고치고, 바뀐 이유를 §10에 적는다.
3. 진행 상황은 PROGRESS.md에 남긴다.
