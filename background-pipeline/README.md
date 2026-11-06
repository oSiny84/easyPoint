# 독립 배경 팩

public/backgrounds/에 16:9 배경 24종을 만든다. 앱 연결 안내는 docs/BACKGROUNDS_READY.md를 따른다.

- build.cjs: SVG 원본 구성 → PNG/미리보기 → 대비·불투명 검사 → manifest·라이선스 고지.
- check.cjs: Chromium에서 48개 PNG 로드, 분류·검색·예시 화면 검사.
- 의존성은 artifacts/asset-toolchain에 설치한다. root package.json을 수정하지 않는다.

public/library는 읽기 전용 원재료이며 이 도구가 수정하지 않는다.
