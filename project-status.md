# BS CAMP QA Helpdesk — PDCA 프로젝트 현황

> 최종 업데이트: 2026-02-27 13:30 KST
> 프로젝트: https://qa-helpdesk.vercel.app
> GitHub: https://github.com/insightwavesmith/qa-helpdesk
> 최신 커밋: `4e16647`

---

## 총가치각도기 v2 + 벤치마크 서비스 리빌드

### Plan (계획) — 완료
- GCP 방식(Meta 랭킹 기반 ABOVE_AVERAGE 그룹 평균) 벤치마크 확정
- 장바구니 지표 2개 삭제 (카페24 픽셀 오류), 최종 13개 지표
- UI v2: TOP5→타겟중복 이동, 콘텐츠 1~5등, 벤치마크 관리 탭 신규
- 기획서: mozzi-reports #77(아키텍처 비교), #78(서비스 기획)

### Design (설계) — 완료
- TASK.md v2 작성 (12태스크, 4 Phase)
- 목업: docs/design/protractor-v2-mockup.html
- 코드 리뷰: mozzi-reports #79 (51KB 리뷰 보고서)
- DB 설계: benchmarks wide format(creative_type × ranking_type × ranking_group) + ad_insights_classified

### Do (구현) — 완료

| Phase | 태스크 | 커밋 | 상태 |
|-------|--------|------|------|
| Phase 1 | T1~T4: LP/장바구니 제거 + DB 타입 | `b92d3f0` | 완료 |
| Phase 2 | T5: collect-benchmarks GCP 재작성 | `de8bc30` | 완료 |
| Phase 3 | T6~T9: 진단엔진 + API + 판정통일 | `4e16647` | 완료 |
| Phase 4 | T10~T12: UI v2 (4탭 구조) | `4e16647` | 완료 |

### Check (검증) — 진행 중

| 항목 | 상태 |
|------|------|
| tsc --noEmit | 0에러 통과 |
| npm run build | 성공 |
| Vercel 배포 | READY |
| 브라우저 QA | 진행 중 |
| gap-detector | 미실행 |

### Act (개선) — 대기
- QA 결과 기반 재작업 예정
- DB 마이그레이션 실행 대기

---

## 미실행 DB 마이그레이션

| 파일 | 내용 |
|------|------|
| 벤치마크 v2 M1 | benchmarks DROP + 재생성 |
| 벤치마크 v2 M2 | ad_insights_classified 신규 |
| 20260226_saves_per_10k.sql | saves_per_10k 컬럼 |
| 20260226_daily_mixpanel_insights.sql | 믹스패널 테이블 |

## 다음 개발 대기

| 항목 | 우선순위 |
|------|---------|
| 믹스패널 연동 기획 | 다음 |
| 메타 배지 개발 | 보류 |
| QA 임베딩 파이프라인 | 보류 |
