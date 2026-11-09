# 영상 편집기 V2 기술 시험 결과

갱신: 2026-11-09. 개발 PC에서 실행해 확인한 결과와 확인하지 못한 항목을 나눠 적는다. 계약은 [video-contracts.md](video-contracts.md), 기획은 [VIDEO_EDITOR_PLAN.md](VIDEO_EDITOR_PLAN.md)다.

## 1. 요약

브라우저 안에서 영상을 해독·합성·인코딩해 MP4·WebM으로 내는 경로가 이 PC에서 동작한다. 10분 1080p30 작품(자막 + 움직이는 스티커 + 밈 영상 2개가 전 구간에 겹침)의 MP4 출력이 101초, WebM 출력이 192초 걸렸고, 브라우저 전체 메모리 최대값은 1.2GB 안팎이었다. 목표(출력 시간 영상 길이의 2배 이내, 탭 메모리 1.5GB 이내)를 이 PC에서는 만족한다.

**RAM 8GB 가상 PC(그래픽 가속 없음)에서는 시간 목표는 통과했지만 메모리 목표를 넘었다(§4.1).** 10분 출력 6종이 모두 끝까지 만들어졌고 프레임 어긋남은 0건이었다. 가장 오래 걸린 출력은 1,048초로 목표 1,200초 안이었다. 그러나 브라우저 메모리 최대값이 MP4 1.4~2.4GB, WebM 3.8~5.6GB였다. 개발 PC에서는 같은 코드가 1.2GB 안에 있었으므로, 하드웨어 해독기가 없을 때 해독된 프레임이 쌓이는 것으로 의심하지만 원인은 확인하지 않았다. 실제 휴대폰 영상, Windows 미디어 플레이어·YouTube 확인도 하지 않았다. 그래서 V2는 완료가 아니다.

계약의 "V2에서 결정" 8개 중 6개를 정했고 2개(작품 길이 상한, 공식 지원 형식)는 잠정값이다. 길이 상한은 메모리 원인을 찾을 때까지 잠정으로 둔다.

| 항목 | 결정 | 근거(이 PC) |
|---|---|---|
| 스티커 파일 형식 | **애니메이션 WebP**, `ImageDecoder`로 필요한 프레임만 푼다 | 512×512×120프레임 674KB, 프레임당 해독 1.3ms(중앙값). APNG는 2.0MB. 투명 WebM도 알파까지 왕복되지만 라이브러리가 `blob:` Worker를 추가로 띄운다 |
| 영상 바이트 위치 | **OPFS**. IndexedDB `media`에는 메타데이터만 | 500MB 저장은 둘 다 2초 이내. IndexedDB는 지우고 DB까지 삭제해도 5초 뒤 사용량이 줄지 않았고 OPFS는 즉시 줄었다 |
| 컨테이너 라이브러리 | **Mediabunny 1.62.1**(MPL-2.0, 정확한 버전 고정) | 순수 TypeScript, WASM 없음. 시험 Worker 묶음 589KB(gzip 147KB). MP4·WebM 쓰기·읽기, OPFS 흘려 쓰기, Fast Start 확인 |
| 비트레이트 | **영상 8Mbps VBR**(YouTube 1080p30 SDR 권장값). 소리는 AAC 192kbps / Opus 128kbps 유지 | YouTube 도움말 확인(§9). 10Mbps 1분 75MB, 8Mbps 1분 61MB |
| 작품 길이 상한 | **10분 유지(잠정)** | 이 PC 최악 192초, 8GB 가상 PC 최악 1,048초(목표 1,200초). 8GB 가상 PC 메모리 최대 5.6GB로 목표 1.5GB 초과, 원인 미확인(§4.1) |
| `.canvavideo` 대용량 | **자체 STORE ZIP 스트리밍 쓰기·읽기**. JSZip을 영상 원본에 쓰지 않는다. 1GiB 임시 상한은 구현 후 해제 | 1GB 원본 쓰기 10초, 목록 읽기 3ms, CRC 검사 통과, JS 힙 변화 없음 |
| 공식 지원 형식 | **MP4 우선 + WebM 대체 유지(잠정)** | H.264+AAC 인코딩이 Chrome·Edge(하드웨어·소프트웨어)와 번들 Chromium(소프트웨어), 하드웨어 인코더가 없는 8GB 가상 PC Edge에서 모두 통과. 가상 PC에서 MP4가 WebM보다 메모리를 덜 썼다 |
| Worker 안 소리 섞기 | **Worker가 `AudioDecoder` 출력을 직접 더한다** | Worker에는 `OfflineAudioContext`·`AudioContext`가 없다(만들면 ReferenceError, 3개 브라우저). 10분 소리 섞기 2.0초 |

측정 중 계약의 결함 2건을 찾았다.

- **원본 프레임 찾기(계약 §3).** "타임스탬프가 s 이하인 가장 늦은 프레임"을 그대로 쓰면 출력 프레임 일부가 한 장 앞 프레임이 된다. 1분 출력 표본 24개 중 MP4 14개, WebM 5개가 어긋났다. s + 1ms까지 허용하도록 고친 뒤 모든 출력(1분 3개 브라우저, 10분)에서 0개가 됐다(§4).
- **Media id 해시(계약 §6).** `crypto.subtle.digest`는 입력 전체를 메모리에 받는다. 2GiB 파일을 한 번에 해시할 수 없다. 8MiB 조각마다 SHA-256을 구하고 그 값들을 이어 다시 SHA-256 하는 방식으로 바꾼다. 측정 속도는 690~760MB/s(§7)다.

## 2. 측정 환경과 한계

- PC: AMD Ryzen 7 8700G, RAM 약 31GB, NVIDIA GeForce RTX 3060, Windows 11.
- 브라우저: Google Chrome 157.0.8103.39, Microsoft Edge 157.0.4341.42(둘 다 창을 띄워 실행), Playwright 번들 Chromium 158.0.8127.18(headless, GPU 없음·SwiftShader). Playwright 1.65.0.
- 라이브러리: mediabunny 1.62.1(2026-10-22 배포, 최신 1.65.2 대신 2주 넘은 판을 골랐다).
- **입력 영상은 모두 합성이다.** 잡음 무늬 위에 움직이는 원과 프레임 번호(왼쪽 위 흰/검은 사각형 16개)를 그려 브라우저가 인코딩했다. 실제 휴대폰 영상(가변 프레임률, 회전 정보, HEVC, 편집 목록)은 시험하지 않았다.
- 메모리는 운영체제에서 2초마다 잰 **브라우저 전체 프로세스 작업 집합의 합**(브라우저·GPU·렌더러·유틸리티)과 렌더러·GPU 프로세스 각각의 최대값이다. 공유 페이지가 중복 합산될 수 있다. `performance.memory`는 `VideoFrame`의 네이티브·GPU 메모리를 보지 못해 쓰지 않았다. 번들 Chromium(headless)은 프로세스 이름 필터가 맞지 않아 메모리 값을 쓰지 않는다.
- **Playwright 기본 컨텍스트는 시크릿 창과 같다.** OPFS·IndexedDB가 메모리에 잡히고 용량이 작아 10분 출력이 `QuotaExceededError`로 멈췄다. 디스크 프로필(`launchPersistentContext`)로 바꿔 다시 쟀고, 이 문서의 수치는 모두 디스크 프로필 기준이다. 제품 e2e에서 큰 영상을 다룰 때도 같은 설정이 필요하다.
- 측정 코드: `src/videoprobe/`(시험 페이지·Worker, 제품 코드 아님), `video-probe.html`, `tests/video-phase2/`, `playwright.video-phase2.config.ts`(포트 5179), `vite.videoprobe.config.ts`, `scripts/videoprobe-dist.mjs`. 원자료 JSON과 출력 파일은 `artifacts/video-phase2/`(Git 제외).

## 3. 코덱 지원 (`isConfigSupported`)

인코딩 1920×1080·1080×1920, 30fps, 10Mbps. Y = 지원, N = 미지원. 가로·세로 결과는 모두 같았다.

| 코덱 | Chrome 157 / Edge 157 (기본·하드웨어·소프트웨어) | 번들 Chromium 158 headless |
|---|---|---|
| H.264 High `avc1.640028` 인코딩 | Y · Y · Y | Y · N · Y |
| VP9 `vp09.00.40.08` 인코딩 | Y · N · Y | Y · N · Y |
| AV1 `av01.0.08M.08` 인코딩 | Y · N · Y | Y · N · Y |
| AAC-LC `mp4a.40.2` / Opus 인코딩 | Y / Y | Y / Y |
| H.264 해독 | Y · Y · Y | Y · N · Y |
| HEVC `hvc1.1.6.L120.90`·`hev1`·4K Main10 해독 | Y · Y · **N** | N · N · N |
| VP9 해독 | Y · Y · Y | Y · N · Y |
| AAC·Opus·Vorbis·MP3 해독 | Y | Y |

- **HEVC는 하드웨어 해독기로만 된다.** 이 PC는 RTX 3060 덕분에 되지만 그래픽 해독기가 없는 PC에서는 안 될 수 있다. 계약대로 HEVC는 지원을 약속하지 않고 가져올 때 `isConfigSupported`로 확인한다.
- **번들 Chromium도 H.264·AAC를 소프트웨어로 만들고 재생한다**(출력·재생 시험으로 확인). 기획안 §8의 "번들 Chromium에는 H.264·AAC가 없다"는 이 버전에서 틀렸다. 자동 시험에서 MP4 경로를 번들 Chromium으로도 돌릴 수 있다. 다만 하드웨어 인코더 성능은 Chrome·Edge 채널로만 잴 수 있다.
- H.264 인코더가 돌려준 코덱 문자열은 요청한 `avc1.640028`(레벨 4.0)이 아니라 `avc1.640032`(레벨 5.0)였다(하드웨어). 소프트웨어 경로는 `avc1.640c28`. 재생에는 문제가 없었다.
- Worker 안 API: `ImageDecoder`·`VideoEncoder`·`AudioEncoder`·`OffscreenCanvas`·`FontFace`·`createSyncAccessHandle` 있음. `OfflineAudioContext`·`AudioContext` 없음.

## 4. 출력 (해독 → 합성 → 인코딩 → OPFS 흘려 쓰기)

**시험 방법.** 합성 1080p30 원본을 OPFS에 만든 뒤, Worker에서 Mediabunny로 원본 프레임을 §3의 시각에 꺼내 1920×1080 캔버스에 그리고(contain), 자막(논리 좌표 × 1.5)·스티커(애니메이션 WebP 512², `ImageDecoder`)·밈 영상(1280×720 4초 반복 2개)을 겹쳐 인코딩했다. 소리는 원본 AAC/Opus를 해독해 배경음악 대용 330Hz를 0.5배로 더하고 ±1로 잘랐다. 결과 파일을 다시 읽어 길이·프레임 수·고르게 뽑은 24프레임의 번호를 확인했다.

| 출력(Chrome) | 1분 시간 | 10분 시간 | 10분 크기 | 메모리 최대(전체 / 렌더러 / GPU) |
|---|---|---|---|---|
| MP4 하드웨어, 자막만 | 8.0초 | 78초 | 756MB | 0.89GB / 258MB / 325MB |
| MP4 하드웨어, 자막+스티커+밈 영상 2 | 12.4초 | 100초 | 758MB | 1.05GB / 335MB / 401MB |
| MP4 하드웨어, 위와 같음, 8Mbps·Fast Start | 12.2초 | 101초 | 612MB | 1.05GB / 364MB / 366MB |
| MP4 소프트웨어(prefer-software), 자막만 | 18.1초 | 180초 | **1,963MB** | 1.11GB / 510MB / 345MB |
| WebM VP9, 자막만 | 18.3초 | 181초 | 997MB | 1.13GB / 541MB / 300MB |
| WebM VP9, 자막+스티커+밈 영상 2 | 21.5초 | 192초 | 969MB | 1.20GB / 572MB / 319MB |

- Edge 1분 결과는 Chrome과 5% 이내로 같았다. 번들 Chromium(GPU 없음)은 MP4 18.8~30.9초, WebM 19.0~34.0초였고 합성(캔버스 그리기)이 대부분을 차지했다.
- **프레임 대응.** 원본 프레임 찾기를 고치기 전에는 1분 MP4 표본 24개 중 14개, WebM 5개가 한 장 앞 프레임이었다. 원인은 두 가지가 겹친 것이다. ① 출력 시각 t_k = ⌊k×10⁶/fps⌋µs가 원본의 정확한 시각 k/fps보다 최대 1µs 작다(MP4에서 k mod 3 ≠ 0인 모든 표본). ② WebM은 시각을 1ms 단위로 반올림해 적어 원본 프레임 시각이 최대 0.5ms 늦다(WebM에서 k mod 3 = 2인 모든 표본). 표본 24개가 이 예측과 모두 맞았다. 해독기 프레임 누락(패킷 1,800개, 빠진 프레임 0)과 번호 판독 오류(같은 판독기로 관문 시험 0건, 어긋남이 규칙적)는 기각했다. s + 1ms까지 허용하도록 바꾼 뒤 1분(3개 브라우저 × 5~6종)과 10분(6종) 출력 모두 0건이다.
- **길이.** MP4 60.011초·600.000초, WebM 60.000초·600.000초. 소리 트랙 길이도 같았다. 프레임 수는 모두 1,800 / 18,000.
- **메모리는 길이에 거의 비례하지 않는다.** 1분과 10분의 최대값 차이가 10% 안팎이다. 흘려 쓰기로 출력 바이트가 메모리에 쌓이지 않는다는 뜻이다.
- **밈 겹침 비용.** 스티커 1개 + 밈 영상 2개가 **전 구간**에 겹친 출력이 자막만 있는 출력의 1.28배(MP4), 1.06배(WebM)였다. 기획안 목표(겹친 구간 20% 작품이 1.5배 이내)보다 무거운 조건에서 통과했다. 비용의 대부분은 스티커 해독(10분 35초, 프레임당 약 2ms)이다. 보이는 동안 프레임을 캐시하면 줄일 수 있다(V6).
- **인코더마다 비트레이트를 지키는 정도가 다르다.** 10Mbps를 요청했을 때 하드웨어 H.264는 약 10Mbps(75MB/분), VP9는 약 13.3Mbps(10분 997MB), 소프트웨어 H.264는 약 26Mbps(10분 1.96GB)였다. 잡음 무늬 합성 영상은 압축이 어려워 실제 영상보다 크게 나왔을 수 있다. V7에서 소프트웨어 경로와 VP9의 비트레이트 모드·품질 설정을 따로 정하고 파일 크기 안내를 검토한다.
- 밈 영상 2개는 같은 파일을 두 번 열어 썼다. 해독기는 2개가 따로 돌았으므로 해독 비용은 실제와 비슷하다고 보지만, 서로 다른 해상도·코덱의 밈 2개는 시험하지 않았다.
- **Fast Start.** 기본 설정은 moov 상자가 파일 끝에 간다(`ftyp, mdat, moov`). 트랙별 최대 패킷 수를 주고 `fastStart: 'reserve'`로 쓰면 흘려 쓰기를 유지하면서 `ftyp, moov, free, mdat`이 됐다. 시간 차이는 1% 이내. 편집 목록(`elst`)은 어느 출력에도 없었다. YouTube 권장(§9)에 맞춰 MP4는 'reserve'로 쓴다.
- **자막 1.5배.** 출력 프레임 PNG(`artifacts/video-phase2/frame-mp4-chrome.png`)를 눈으로 확인했다. Noto Sans KR 굵게 72px(논리 48px), 반투명 띠, 컬러 이모지, 투명 스티커 가장자리가 깨끗했고 프레임 번호는 165(5.5초 × 30)로 맞았다.

### 4.1 RAM 8GB 가상 PC (2026-11-09)

**환경.** 개발 PC 위 VirtualBox 가상 PC. Windows 11 Home, RAM 8,077MB, CPU 4개, Edge 157.0.4341.42(개발 PC와 같은 판). 그래픽은 SwiftShader(소프트웨어)여서 **하드웨어 인코더·해독기가 모두 없다**(`prefer-hardware`는 모든 코덱에서 N, HEVC 해독도 N). 실제 저가 PC보다 나쁜 조건이다. CPU는 개발 PC의 Ryzen 7 8700G를 나눠 쓰므로 **시간은 실제 PC 속도가 아니다.** 판단은 메모리와 성공 여부로 한다. 실행은 `scripts/videoprobe-vm-test.cmd`로 했다. 공유 폴더에 이 파일과 `canvacraft\`(커밋 `de3a8d7` 사본 + node_modules), `node\`(Node.js 폴더)를 나란히 두고 가상 PC에서 두 번 클릭하면, 가상 PC 디스크로 복사한 뒤 `support export --project msedge --timeout=0`(MINUTES 기본 10)을 돌리고 결과를 `results-<컴퓨터 이름>\`으로 돌려놓는다. 전체 전체 1.6시간 걸렸다. 원자료는 `export-10m-msedge.json`·`support-msedge.json`(`artifacts/video-phase2/vm-win11/`, Git 제외. `systeminfo.txt` 포함)이다.

| 10분 출력(Edge, 가상 PC) | 시간 | 크기 | 메모리 최대(전체 / 렌더러) |
|---|---|---|---|
| MP4, 자막만(no-preference → 소프트웨어) | 1,033초 | 3,071MB | 1.43GB / 1.03GB |
| MP4, 자막+스티커+밈 영상 2 | 1,048초 | 2,719MB | 1.67GB / 1.31GB |
| MP4 소프트웨어(prefer-software), 자막만 | 730초 | 3,071MB | 1.71GB / 1.34GB |
| MP4, 자막+스티커+밈 영상 2, 8Mbps·Fast Start | 878초 | 2,721MB | **2.43GB** / 2.05GB |
| WebM VP9, 자막만 | 511초 | 992MB | **5.59GB** / 5.24GB |
| WebM VP9, 자막+스티커+밈 영상 2 | 739초 | 930MB | **3.76GB** / 3.40GB |

- **통과한 것.** 6종 모두 18,000프레임, 600.000초, 빠진 프레임 0, 표본 24프레임 어긋남 0. Fast Start 출력은 `ftyp, moov, free, mdat`. 가장 느린 출력 1,048초가 목표 1,200초 안이다. 원본 해독은 MP4 351fps(실시간 11.7배), WebM 230fps(7.7배). 스티커 해독은 프레임당 2ms(중앙값).
- **넘은 것: 메모리.** 6종 중 5종이 목표 1.5GB를 넘었다. WebM 자막만 출력은 5.59GB로 RAM 8GB 기기에서 다른 프로그램을 밀어낼 수준이다. 개발 PC에서는 같은 코드·같은 Edge 판에서 1.2GB 이내였고, 1분·10분 차이도 10% 안팎이었다.
- **원인은 확인하지 않았다.** 후보는 셋이다. ① 하드웨어 해독기는 프레임 버퍼 수가 정해져 있어 해독이 저절로 멈추지만, 소프트웨어 해독기는 해독된 프레임(1080p 한 장 약 3MB)이 렌더러 메모리에 계속 쌓일 수 있다. 해독은 230~351fps로 합성·인코딩(약 17~35fps)보다 훨씬 빠르다. ② GPU가 없어 캔버스·`VideoFrame` 사본이 렌더러 메모리로 옮겨 왔고, 인코더 대기열에 쌓인 프레임이 늘었다. ③ 측정 방식(작업 집합 합)이 공유 페이지나 파일 캐시를 더 크게 셌다. 렌더러 하나가 5.24GB여서 ③만으로는 설명하기 어렵다.
- **조사는 보류했다(2026-11-09 사용자 결정).** 실제 PC는 그래픽 해독기가 있어 이 조건보다 낫다고 보고 더 쓰지 않기로 했다. 보류 전에 한 것:
  - Mediabunny 코드를 읽어 보니 해독 쪽(꺼낸 프레임 + 해독 대기 ≤ 4)과 인코딩 쪽(`encodeQueueSize` ≥ 4면 대기)에 모두 상한이 있다.
  - 개발 PC Edge를 `--disable-gpu --disable-accelerated-video-decode --disable-accelerated-video-encode`로 띄워(SwiftShader 확인) 3분 WebM을 만들고 자막만 넣어 출력했다. 메모리는 처음부터 끝까지 평평했다(전체 약 1.4GB, 렌더러 작업 집합 약 1.0GB, 렌더러 전용 커밋 약 0.53GB). 넣은 프레임과 나온 패킷의 차이도 8~9장으로 일정했다. 이 조건에서는 ①(해독 프레임 누적)과 인코더 대기열 누적이 일어나지 않았다. **가상 PC 현상은 재현하지 못했다.**
  - 남은 후보: CPU 코어 수(가상 PC 4개), 가상 PC 고유 조건, 또는 같은 브라우저에서 앞선 출력·검사가 남긴 메모리(가상 PC 시험은 출력 6종과 검사를 한 브라우저에서 이어 돌렸고 MP4 최대값이 1.43→1.67→1.71→2.43GB로 차례로 올랐으며 WebM이 마지막이었다).
  - 다시 조사할 때: `tests/video-phase2/memory.spec.ts`(단계별 메모리·프레임·패킷 시간 기록, `PAIR`·`SECONDS`·`LABEL`·`PROBE_ARGS`)를 가상 PC에서 `scripts/videoprobe-vm-memory.cmd`로 돌린다(약 20분). 분석 기준은 전용 커밋도 같이 느는지, 프레임−패킷 차이가 느는지, 만들기 단계에서도 느는지다.
- **소프트웨어 H.264 비트레이트 초과가 더 컸다.** 10Mbps 요청에 약 41Mbps(10분 3.07GB), 8Mbps 요청에 약 36Mbps였다. 개발 PC 소프트웨어 경로는 26Mbps였다. VP9는 약 13Mbps로 개발 PC와 같았다. 가상 PC에서는 `no-preference`도 소프트웨어 인코더(`avc1.640c28`)로 갔다.
- `no-preference`(1,033초)가 `prefer-software`(730초)보다 느렸고 인코딩 대기 시간이 514초 대 183초였다. 둘 다 같은 코덱 문자열이어서 다른 인코더인지 알 수 없다. 원인 미조사.

## 5. 해독과 재생

- 합성 원본 전체 해독 속도(Chrome, `VideoSampleSink.samples()`): MP4 1080p30 620~635fps(실시간의 약 21배), WebM 800~990fps. 실제 휴대폰 영상은 측정하지 않았다.
- 출력 파일 17개(1분, 3개 브라우저에서 만든 MP4·WebM)를 **파일 선택 → blob URL → `<video>`** 경로로 3개 브라우저에서 재생했다. 51회 모두 길이 60.01~60.02초, 1920×1080, 1.4초 재생 동안 해독 프레임 45~49개·떨어진 프레임 0, 소리 해독 바이트 > 0, 30초 위치로 이동 성공.
- Windows 미디어 플레이어·영화 및 TV 앱에서는 열어 보지 않았다(§10).

## 6. 움직이는 밈 형식

| 형식 | 크기(512², 24fps, 5초) | 해독 | 프레임 시각 | 판단 |
|---|---|---|---|---|
| 애니메이션 WebP(손실, 알파) | 674KB | 1.3ms/프레임(중앙값), 임의 접근 1.3ms | 0, 42, 84 ms… 마지막 4,998ms | **채택** |
| APNG | 2.0MB | 0.6ms/프레임 | 0, 41, 82 ms… 마지막 4,879ms | 3배 크다 |
| 투명 WebM(VP9 알파) | 256² 24프레임 92KB | Mediabunny가 알파를 따로 인코딩해 되합친다. 해독 결과 I420A, 투명 픽셀 확인 | 영상 시각 | 가능하지만 라이브러리가 `blob:` Worker 4개까지 띄우고 경로가 복잡하다 |

- 두 이미지 형식 모두 `ImageDecoder`가 프레임 시각을 **ms 단위로 반올림한 지속 시간의 누적**으로 준다(24fps가 41.67ms가 아니라 42ms·41ms). 그래서 계약 §3의 스티커 프레임 식 ⌊m × 밈fps / 1000⌋ 대신 "타임스탬프가 m 이하인 가장 늦은 프레임"을 쓴다. 시각이 정수 ms라 영상 조각의 1ms 허용은 두지 않는다.
- 모든 프레임을 풀어 두면 512² × 4바이트 × 120 = 126MB다. 스티커 4개면 500MB라서 미리 다 풀어 두지 않고 필요한 프레임만 푼다(출력에서 프레임당 약 2ms).
- 시험용 WebP·APNG는 캔버스 프레임을 직접 묶어 만들었다(`src/videoprobe/animated.ts`). 실제 자산 제작 도구로 만든 파일은 V6에서 다시 확인한다.

## 7. 저장소와 원본 파일

**500MB 영상(디스크에 있는 File을 원본으로).** Chrome·Edge·Chromium 결과가 비슷했다. 아래는 Chrome.

| 항목 | IndexedDB Blob | OPFS |
|---|---|---|
| 쓰기 | 0.64초 | 1.09초 |
| 가운데 1MB 읽기 | 1.2ms | 1.5ms |
| 전체 순차 읽기 | 0.15초 | 0.23초 |
| 지우기 후 사용량 | **줄지 않음**(지운 뒤, DB 삭제 뒤, 5초 뒤 모두 그대로) | **즉시 528MB 감소** |

- 계약 조건(500MB 30초 이내, 부분 읽기, 삭제 즉시 회수) 중 셋째를 OPFS만 만족한다. IndexedDB의 Blob 파일은 브라우저가 나중에 정리하는 것으로 보이나 언제인지 확인하지 않았다.
- **메모리에서 만든 500MB Blob을 IndexedDB에 넣으면 Chrome·Edge에서 `DataError: Failed to write blobs (InvalidBlob)`로 실패했다**(번들 Chromium은 성공). 디스크 File은 성공했다. 큰 데이터를 메모리 Blob으로 만들어 IndexedDB에 넣지 않는다.

**`.canvavideo` 1GB(STORE ZIP).** 디스크 Blob(OPFS 파일)과 헤더 바이트를 `new Blob([...])`으로 이어 붙여 OPFS에 흘려 쓰고, 끝 레코드만 읽어 항목을 `Blob.slice`로 꺼냈다.

| 쓰기(CRC 계산 포함) | 목록 읽기 | 항목 CRC 다시 계산 | JS 힙 | 브라우저 전체 메모리 최대 |
|---|---|---|---|---|
| 10.1초 | 3ms | 7.9초, 일치 | 23~153MB(파일 크기와 무관) | 0.55GB |

- 1GB를 메모리에 올리지 않고 쓰고 읽을 수 있다. 시험 코드는 ZIP32만 썼다. 계약 상한(Media 4GiB)을 넘는 파일은 4GiB를 넘을 수 있으므로 V3 구현은 ZIP64를 지원한다.
- **조각 해시 속도.** 1GB를 8MiB 조각마다 `crypto.subtle.digest`한 뒤 합쳐 다시 해시: 1.34~1.48초(690~760MB/s). 2GiB 파일은 약 3초다. **메인 스레드에서 쟀다**(계약은 Worker에서 계산한다). Worker 안 속도는 V4 구현 때 다시 확인한다.

## 8. 배포본 CSP와 Worker

시험 페이지를 배포 형식으로 빌드하고 제품과 같은 방식(meta 태그)으로 CSP를 넣어 Chrome·Chromium에서 출력·검사·재생을 돌렸다.

| CSP | 결과 |
|---|---|
| 지금 제품 CSP(`default-src 'none'`, media-src 없음) | Worker·출력은 동작. **`<video src="blob:…">`가 막힘**("media-src 미지정 → default-src 사용") |
| 제품 CSP + `media-src 'self' blob:` + `worker-src 'self'` | 출력·검사(프레임 번호 0건)·재생 모두 통과. 위반 0건 |
| 위 + `worker-src 'self' blob:` | 같음 |

- Mediabunny는 WASM·`eval`을 쓰지 않는다. `'wasm-unsafe-eval'`은 필요 없다.
- Mediabunny는 투명 영상 처리·타이머용으로 `blob:` Worker를 만든다(코드 확인). 시험에서는 투명 WebM 시험도 `worker-src 'self'`에서 통과했다. meta 태그 CSP는 Worker 안에 적용되지 않고, 그 Worker들은 시험 Worker 안에서 만들어졌기 때문으로 보인다(추정). 스티커를 WebP로 정했으므로 제품은 이 경로를 쓰지 않는다.
- 실행 파일(`npm run exe`)에서는 확인하지 않았다(V8).

## 9. YouTube 권장값 (2026-11-09 도움말 확인)

[YouTube 권장 업로드 인코딩 설정](https://support.google.com/youtube/answer/1722171?hl=en): MP4, 편집 목록 없음, moov 앞쪽(Fast Start). H.264 High, 닫힌 GOP(프레임률의 절반), 연속 B프레임 2개, CABAC, VBR. 1080p 24/25/30fps SDR 8Mbps, 720p 5Mbps. 소리 AAC-LC 또는 Opus, 48kHz, 스테레오 384kbps. [지원 파일 형식](https://support.google.com/youtube/troubleshooter/2888402?hl=en)에 WebM이 있다. 이 값들은 권장이며 편집 목록과 moov 위치 외에는 필수 조건이 아니라고 적혀 있다.

- 반영: 8Mbps, Fast Start, 편집 목록 없음(확인).
- 반영하지 않음: 닫힌 GOP 길이는 Mediabunny `keyFrameInterval`로 정할 수 있다. 시험은 2초로 했고 YouTube 권장은 0.5초(프레임률의 절반)다. 키 프레임이 잦으면 같은 비트레이트에서 화질이 떨어지므로 V7에서 비교해 정한다. B프레임은 WebCodecs 설정으로 고를 수 없고 출력에 B프레임 표시(`ctts`)는 없었다. 소리 384kbps는 측정하지 않아 192kbps를 유지한다. 업로드 처리 결과는 사람 확인(§10)으로 본다.

## 10. 확인하지 못한 것과 다음에 할 일

| 항목 | 상태 | 누가·언제 |
|---|---|---|
| 그래픽 가속 없는 환경의 출력 메모리 | **목표 초과, 원인 미확인**(§4.1). MP4 1.4~2.4GB, WebM 3.8~5.6GB. 길이 상한이 잠정인 이유 | **보류**(2026-11-09 사용자 결정). 개발 PC에서는 재현되지 않았다(§4.1). 다시 볼 때는 가상 PC에서 `scripts/videoprobe-vm-memory.cmd` |
| 실제 RAM 8GB PC(그래픽 해독기 있음) | 미측정. 가상 PC는 더 나쁜 조건만 쟀다 | 사용자, 기기가 있을 때. 저장소를 받아 `npm ci` 후 `MINUTES=10 npx playwright test --config playwright.video-phase2.config.ts export --project chrome`(cmd는 `set MINUTES=10`, PowerShell은 `$env:MINUTES=10` 먼저). Node.js가 없으면 §4.1의 `scripts/videoprobe-vm-test.cmd` 묶음을 넘겨 두 번 클릭한다 |
| 실제 휴대폰 영상(Android MP4, iPhone MOV·HEVC, 세로·회전) | 미검증. 회전 정보 읽기·가변 프레임률·편집 목록 처리도 미확인 | 사용자가 1분 안팎 파일 2~3개를 주면 V4 시작 전에 해독·출력 시험 |
| Windows 미디어 플레이어·영화 및 TV 앱 재생 | 미검증 | 사용자. `artifacts/video-phase2/files/`의 MP4·WebM |
| YouTube 비공개 업로드 처리 | 미검증 | 사용자(보호자 계정), V7 |
| 소리 시각 정확도(삑 소리 위치), 밈 영상 소리 섞기 | 미검증. 소리 길이만 확인 | V6·V7 |
| 미리보기(`<video>` + `AudioContext` 동기) | 미검증 | V4 |
| 세로 1080×1920 실제 인코딩 | `isConfigSupported`만 통과 | V7 |
| 실행 파일에서 Worker·라이브러리 | 미검증 | V8 |
| 소프트웨어 H.264 비트레이트 초과(개발 PC 26Mbps, 가상 PC 36~41Mbps) | 원인 미조사 | V7 |
| Mediabunny 라이선스(MPL-2.0) 안내 | 배포본이 코드 의존성 라이선스를 어떻게 안내하는지 확인하지 않았다(`src/export/notices.ts`는 내장 그림의 MIT 고지만 다룬다). MPL-2.0은 실행 형태로 배포할 때 원본 코드를 구할 수 있는 곳을 알리도록 요구한다(수정하지 않고 쓰는 경우 포함) | V8 |
