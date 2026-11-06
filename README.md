# CanvaCraft

어린이용 슬라이드 편집기를 만드는 프로젝트입니다. 시작 템플릿을 열거나 사진·배경·요소 그림을 넣어 옮기고 크기를 바꾸고, 저장하고, PPT·PDF로 내려받을 수 있습니다. 글씨 입력과 그리기 도구는 아직 없습니다.

## 실행

Node.js 24에서 확인했습니다. 프로젝트 폴더에서 실행합니다.

```powershell
npm ci
npm run dev
```

- http://127.0.0.1:5173 : 앱. 작품은 자동 저장되고 작품 목록에서 다시 열 수 있습니다. 상단 발표 버튼으로 전체 화면 발표를 합니다. 사진·요소·배경 넣기, 요소 선택·이동·크기 조절, 슬라이드 추가·복제·삭제·순서 변경, 되돌리기, 저장, 원본 파일 열기·저장, 공유 → 다운로드를 할 수 있습니다. 샘플은 `npm test`가 만드는 `artifacts/phase3/sample.canvacraft`를 파일 → 원본 열기로 엽니다.
- http://127.0.0.1:5173/probe.html : Phase 2 기술 시험 화면. 측정 기록 재현용으로 고정해 두었습니다.

```powershell
npm run build
npx playwright install chromium
npm test
```

`npm test`는 문서·명령·원본 파일·조작 계산 시험(`tests/contracts`), 샘플 문서의 전체 흐름과 화면 조작(`tests/e2e`), Phase 2 시험 화면(`tests/probe.spec.ts`)을 실행합니다. 한글 시험은 CDP 조합 입력이며 실제 Windows 입력기·iPad 시험을 대신하지 않습니다. 줄·PowerPoint·성능 비교는 `npm run test:phase2`로 따로 실행합니다(docs/PHASE2_RESULTS.md §8). 설계와 현재 인계 상태는 docs/PROGRESS.md를 읽습니다.

## 집에서 쓰기

[Releases](https://github.com/oSiny84/easyPoint/releases)에서 `CanvaCraft.exe`를 받거나, `npm run exe`로 `artifacts/release/CanvaCraft.exe`를 만들어 옮긴 뒤 더블클릭합니다. Node.js나 인터넷이 필요 없습니다.

## 문서

- 사용 방법: [docs/USER_GUIDE.md](docs/USER_GUIDE.md)
- 배포 패키지와 되돌리기: [docs/RELEASE.md](docs/RELEASE.md) (`npm run package`, 웹 호스트에는 아직 배포하지 않았습니다)
- 통합 시험 결과와 남은 확인: [docs/INTEGRATION_REPORT_2026-11-06.md](docs/INTEGRATION_REPORT_2026-11-06.md)
- 배포본 시험: `npm run test:release`
