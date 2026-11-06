# PPT·PDF 출력 사전 점검 결과

작성일: 2026-11-06. 점검 코드 스냅샷 시각: 한국시간 15:15:33. 앱 코드 수정·커밋·배포는 하지 않았다. export-audit/의 독립 검사 도구와 artifacts/export-audit/ 출력물, 이 문서만 추가했다. Claude가 수정하는 PROGRESS.md도 변경하지 않았다.

## 결과 요약

| 항목 | 실제 확인 결과 | 판단 |
|---|---|---|
| 템플릿 12종 | 12장을 한 문서로 묶어 편집용 PPTX·이미지형 PPTX·PDF 생성 | 점검 범위 통과 |
| 한글 글씨 | PowerPoint 16.0에서 네이티브 텍스트 상자 73개. 원문과 줄별 내용 일치 | 줄바꿈 차이 0개 |
| 잘림 | PowerPoint의 실제 줄 영역이 슬라이드 오른쪽·아래로 나가는지 검사 | 검출 0개 |
| 재편집 | 매 장의 제목 1개 수정·이미지 1개 이동 후 저장·닫기·다시 열기 | 12장 모두 수정 값 유지 |
| 투명도·앞뒤 순서 | 별도 기술 시험 장에서 획→캐릭터→획→글씨→점 구성, 실제 PPT 렌더와 PDF 비교 | 관찰한 순서·투명도 유지 |
| 파일 내부 참조 | PPTX의 모든 내부 relationship 목적지 존재, 모드별 텍스트/이미지 요소 검사 | 깨진 참조 0개 |
| 라이선스 | 편집형의 PNG 고지, 이미지형 PPT의 노트, PDF licenses.txt 첨부 | MIT 고지 존재 확인 |
| 취소·누락 자산 | 3가지 출력 모드의 사전 취소 및 자산 누락 입력 | 6개 모두 명시 오류 반환 |

**이 범위에서 Claude에게 즉시 수정을 요청할 출력 결함은 발견하지 않았다.** Phase 9 전체 완료를 뜻하지 않는다. 실제 사진·다른 기기·사용자 입력·수동 더블클릭 열기는 아래 미검증 범위를 따른다.

## 대상과 방법

src/를 artifacts/export-audit/snapshot/src/에 복사하고 각 파일 SHA-256과 package-lock.json 해시를 snapshot.json에 기록했다. 복사 전후 해시가 같은지 확인한 후 이 복사본만 실행했다. 템플릿 문서와 PNG도 snapshot/templates/로 복사했다. 생성 종료·최종 보고 시점까지 원본 src/ 해시 변경은 0개였다.

실제 코드의 validateProject, renderSlide, exportPptx, exportPdf, licenseNotice를 별도 Vite 인스턴스에서 사용했다. 본래 개발 서버와 편집기 세션은 건드리지 않았다. 출력은 12종을 합친 12장 문서와 기술 시험 1장이다. 개별 템플릿마다 12개의 독립 PPTX를 만든 시험은 아니다.

PowerPoint는 Windows에 설치된 16.0 COM으로 파일을 열고 1280×720 PNG와 PDF로 실제 렌더링했다. 편집형 12장에서는 제목을 수정하고 마지막 이미지의 위치를 3pt 오른쪽·2pt 위로 바꾼 뒤 다른 파일로 저장했다. 문서를 닫은 후 다시 열어 모든 변경 값을 비교했다. 시험 전에 이미 실행 중인 PowerPoint가 있으면 앱 자체를 종료하지 않도록 검사 도구를 구성했다.

PDF는 PyMuPDF로 별도 렌더했다. 브라우저 기준·PowerPoint 편집형·PDF를 12장 모두 나란히 놓고 실제 이미지를 관찰했다. 추가 시험 장은 이미지형 PPT도 포함해 4가지 결과를 관찰했다. 렌더된 화면에서 글꼴 크기·글자 모양의 작은 차이는 있으므로 픽셀 단위 동일성으로 판정하지 않았다.

## 수치와 파일 구조

| 출력 | 용량 | 생성 시간(개발 PC) | 구조 |
|---|---:|---:|---|
| 편집용 PPTX | 741,092 bytes | 약 0.32초 | 12장, 글씨 상자 73개, 중복 제거 후 media 45개 |
| 모양 그대로 PPTX | 1,374,821 bytes | 약 0.75초 | 12장, 글씨 상자 0개, media 12개 |
| PDF | 1,683,056 bytes | 약 0.48초 | 12페이지, 각 960×540pt, licenses.txt 첨부 |

측정은 이 개발 PC·이 샘플에 한하며 RAM 8GB 기준이나 실제 사진이 많은 작품의 성능 보장이 아니다. 브라우저는 Chromium 158.0.8127.18이다. 출력 코드의 warnings 배열은 모두 비어 있었다. 점검 흐름의 브라우저 오류·외부 HTTP(S) 요청은 0건이다.

브라우저 기준과의 RGB 채널 절대 차이 평균(0~255)은 편집형 PPT 3.535, 이미지형 PPT 1.190, PDF 1.003이었다. 이 숫자는 JPEG 압축·대체 글꼴·렌더러 차이의 참고 지표이며 사전에 정의된 합격 임계값은 아니다. 줄 목록 일치·잘림 검사·실제 화면 관찰을 함께 사용했다.

라이선스 고지 검사 결과:

- 편집형 12장 문서: PNG media 20개에서 MIT 문자열 확인. 다른 media에는 직접 만든 안내 패널처럼 MIT가 필요 없는 자료도 포함된다.
- 이미지형 12장 문서: 개별 PNG 메타데이터 대신 슬라이드 노트에서 전체 MIT 고지 확인.
- PDF 12장 문서 및 기술 시험 PDF: licenses.txt 첨부의 실제 내용에 MIT License 존재 확인.

## 실패 입력과 검사 도구 수정

사전 AbortSignal이 취소된 경우 editable/image/pdf 모두 CANCELLED를 반환했다. 필요한 자산을 전혀 반환하지 않는 resolver로 첫 장을 출력했을 때 3모드 모두 ASSET_MISSING을 반환했다. 출력 도중 취소·다운로드 브라우저 실패는 이번 범위에서 시험하지 않았다.

검사용 PowerPoint 스크립트가 SaveAs 직후 같은 파일을 다시 열면서 동일 Presentation 객체를 받았고, 그 객체를 두 번 닫아 Presentation.Close 오류가 났다. 원래 문서를 먼저 닫은 다음 재열기하도록 **검사 스크립트만** 수정한 후 4개 PPTX 점검과 12장 재편집 검사가 끝까지 통과했다. 이 오류를 앱 출력 결함으로 분류하지 않았다.

초기 파일 탐색에서 phase3-powerpoint.ps1은 존재하지 않아 기존 phase2-powerpoint.ps1을 참고했다. 실제 검사는 이번에 추가한 export-audit/powerpoint.ps1로 수행했다.

## 남은 확인과 Claude 인계

1. Phase 6이 글꼴·줄 계산·서식·출력 관련 코드를 바꾸면 새 코드 스냅샷으로 이 검사를 재실행한다. UI만 바꾼 경우에도 실제 새 글씨를 저장·출력하는 흐름은 별도로 확인한다.
2. 사용자의 실제 한글 입력기로 입력한 긴 문장, 폰트 크기·정렬·줄 간격 조절, 텍스트 상자 폭 변경 후 출력은 Phase 6 인계 시험에 포함한다.
3. 휴대폰 JPEG·사진 방향/크롭·저해상도·초대형 파일, 실제 사진 20장×3개, 8GB PC, iPad, 다른 PowerPoint 버전은 미검증이다.
4. COM 열기·렌더·저장 성공은 확인했지만 파일을 탐색기에서 더블클릭해 복구 안내가 없는지 관찰한 시험은 아니다. 그 수동 확인 항목은 닫지 않는다.
5. 한쇼·Google Slides·PowerPoint 웹, 새 글꼴 대체 사례와 출력 중 메모리/취소 시험은 기존 계획대로 남겨 둔다.
6. 사진 이동 시험의 대상은 템플릿의 PNG 이미지 요소다. 실제 카메라 사진으로 대체해 편집한 시험은 아니다.

## 증거와 재실행

- artifacts/export-audit/snapshot.json: 입력 코드 해시·시각.
- generation.json: 문서별 기준 줄·시간·실패 입력 결과.
- powerpoint.json: 실제 PowerPoint 줄 영역·요소 개수·재편집 결과.
- analysis.json, final-state.json: 구조·줄 비교·픽셀 차이·원본 코드 변경 여부.
- comparison-1.png~comparison-3.png: 12장 브라우저·PPT·PDF 비교.
- probe-comparison.png: 투명도·앞뒤 순서·이모지 비교.
- templates-editable.pptx, templates-image.pptx, templates.pdf: 확인한 출력물.
- templates-edited.pptx: 실제 수정 후 재열어 확인한 사본.

```powershell
node export-audit/run.cjs
pwsh -NoProfile -File export-audit/powerpoint.ps1
python export-audit/analyze.py
```

run은 실행 시점 src/를 새로 복사하므로 기존 증거를 보관해야 한다면 먼저 artifacts/export-audit/를 다른 이름으로 보관한다. analyzer는 artifacts/python-libs의 PyMuPDF를 사용한다. 모든 산출물은 독립 폴더에 있고 앱 코드 수정은 없다.
