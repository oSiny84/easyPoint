# 출력 사전 점검

앱 src/를 artifacts/export-audit/snapshot/src/로 복사해 고정한 뒤, 템플릿 12장과 순서·투명도 시험 장을 출력한다. 앱 파일을 수정하지 않는다.

```powershell
node export-audit/run.cjs
pwsh -NoProfile -File export-audit/powerpoint.ps1
python export-audit/analyze.py
```

PowerPoint가 설치된 Windows와 artifacts/python-libs의 PyMuPDF가 필요하다. 원본 파일은 닫은 후 사본을 재열어 편집 결과를 검사한다. 전체 결과·제약은 docs/EXPORT_AUDIT_2026-11-06.md에 있다.

run 재실행은 직전 증거를 갱신한다. 보고서 날짜와 snapshot 시각을 함께 확인한다. 스냅샷의 문서 테스트 성공을 현재 작업 중인 최신 src/의 시험 결과로 바꾸어 말하지 않는다.
