# 제공 글꼴과 시험 자산

- 글꼴: @fontsource/noto-sans-kr 5.3.1, Noto Sans KR, 굵기 400·700.
- 추가 글꼴: @fontsource 5.3.0의 Jua, Do Hyeon, Gamja Flower, Nanum Pen Script(각 400), Gaegu(400·700). 모두 SIL Open Font License 1.1. 원문은 public/licenses/의 글꼴별 `*-OFL.txt`에 있다.
- 제공: npm 패키지의 CSS와 WOFF2를 Vite가 앱과 같은 origin에서 제공한다. 배포 때 WOFF는 `scripts/prune-dist.mjs`가 지운다. Google Fonts 외부 서버 요청은 사용하지 않는다.
- 라이선스: SIL Open Font License 1.1. 패키지의 LICENSE를 public/licenses/NotoSansKR-OFL.txt에 보관한다.
- 글꼴 포함 범위: 웹앱에만 포함한다. 편집형 PPTX에는 폰트를 포함하지 않고 이름만 기록한다. Phase 2 결정에 따라 PPTX에는 Windows 기본 글꼴인 맑은 고딕을 이름으로 지정하며 글꼴 파일은 배포하지 않는다.
- 사진 시험: 자동 시험에서 직접 생성한 단색·그라데이션 PNG. 외부 사진이나 Canva 자산을 사용하지 않았다.
- 이모지: 운영체제 대체 글꼴을 사용하므로 기기별 모양 차이가 있다. 입력은 허용하고 모양 차이를 안내한다(contracts.md §3).
- 내장 캐릭터·스티커 96종: Microsoft Fluent Emoji, MIT. Copyright (c) Microsoft Corporation. 원문은 public/library/licenses/fluent-emoji-MIT.txt, 항목별 출처는 public/library/manifest.json에 있다. 앱의 요소 패널에서 사용 조건을 볼 수 있다.
- 내장 도형 24종: 이 프로젝트에서 직접 정의한 기하학 그림, CC0(public/library/licenses/original-shapes-CC0.txt).
- 제공 배경 24종: 직접 구성한 그림은 CC0, Fluent Emoji 그림을 포함한 배경에는 MIT가 함께 적용된다(public/backgrounds/licenses, docs/BACKGROUNDS_READY.md).
- 시작 템플릿 12종: 직접 구성한 레이아웃은 CC0, 포함된 Microsoft 그림은 MIT(public/templates/licenses, docs/TEMPLATES_READY.md).
- 출력물의 고지: 편집용 PPT와 원본 파일은 PNG 안의 라이선스 정보를 그대로 유지한다. 모양 그대로 PPT는 첫 장 노트, PDF는 첨부 파일 licenses.txt에 MIT 고지 전문을 넣는다(contracts.md §8).
