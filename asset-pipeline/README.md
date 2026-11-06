# 독립 자산 준비 도구

앱 코드와 패키지를 수정하지 않고 public/library만 준비한다. 결과와 연결 규칙은 [ASSET_LIBRARY_READY.md](../docs/ASSET_LIBRARY_READY.md)를 읽는다.

prepare.py: 상류 커밋을 고정해 96개 MIT SVG를 받고 직접 정의한 도형 24개를 생성한다.

render.cjs: resvg로 투명 PNG·미리보기·8색 도형을 생성하고 라이선스 tEXt를 넣는다. 결과의 알파·가장자리·개수를 검사한다.

check.cjs: 임시 정적 서버와 Playwright로 목록·검색·색·모든 PNG 디코딩을 검사한다. 앱 개발 서버는 건드리지 않는다.

미리보기 페이지는 public/library/preview.html이다. 제품 UI가 아니다.
