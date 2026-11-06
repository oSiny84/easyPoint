# 템플릿 팩 준비

12개의 한 장짜리 편집 가능한 시작 템플릿을 public/templates/에 준비한다. 앱 코드는 수정하지 않는다.

1. build.cjs: 기존 자산을 읽고 문서 JSON·자산 manifest를 만든다.
2. render.cjs: 현재 앱 검사·렌더·저장·열기·store 모듈로 검증하고 PNG·원본 파일을 만든다. render.html은 이 빌드 도구 전용이다.
3. check.cjs: 정적 미리보기 페이지의 목록·검색·원본 다운로드를 검사한다.

상세 결과와 앱 연결 방법은 docs/TEMPLATES_READY.md를 읽는다.
