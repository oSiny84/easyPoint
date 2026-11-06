# CanvaCraft 프로젝트 안내

- 고정 AI 담당이나 병렬 개발 없이, 한 AI가 개발하다 다음 AI가 이어받는다.
- 시작할 때 docs/PROGRESS.md를 읽고 실제 파일 상태를 확인한다. 10단계 계획은 docs/DEVELOPMENT_PLAN.md, 데이터·출력 설계는 docs/contracts.md에 있다.
- 코어는 src/domain, src/commands, src/state, src/storage, src/rendering, src/export에 있고 화면은 src/app, src/editor, src/components에 있고 배치 기준은 docs/UI_REFERENCE.md다. src/probe는 Phase 2 측정 기록을 재현하는 고정 코드이며 제품 코드가 아니다.
- 실행: npm run dev. 빌드: npm run build. 브라우저 시험: npm test (최초 npx playwright install chromium). 배포본 시험: npm run test:release. 패키지: npm run package. 집 PC용 단일 실행 파일: npm run exe, 시험: npm run test:exe (docs/RELEASE.md).
- 문서를 바꾸는 곳은 src/state/store.ts의 dispatch·undo·redo뿐이다. 공통 샘플 문서는 tests/fixtures/sample이며 Phase 4~8은 tests/e2e/flow.spec.ts가 계속 통과하는지 확인한다.
- artifacts/는 재생성 가능한 출력으로 Git에서 제외된다. 시험 증거의 요약과 미검증 사항은 docs에 남긴다.
- 공통 개발 지침은 C:/D_ClaudeDevelop/AI_guidelines/COMMON_ENGINEERING_RULES.md를 따른다.
