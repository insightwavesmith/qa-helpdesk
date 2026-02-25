# TASK — 총가치각도기 UI/UX 개선 (세션1)

> 작성: 모찌 | 2026-02-25
> 목업: https://mozzi-reports.vercel.app/reports/architecture/2026-02-25-protractor-ui-mockup.html
> 기획서: https://mozzi-reports.vercel.app/reports/architecture/2026-02-25-protractor-integrated-plan.html

---

## 배경

백엔드 리팩토링(T1~T5)은 완료됐지만 UI/UX가 목업과 다름. 이 TASK에서 프론트엔드를 목업 기준으로 맞춤.

---

## U1. 진단 UI 3컬럼 레이아웃

- 파일: `src/components/protractor/DiagnosticPanel.tsx` (204줄)
- 현재: 이슈 목록형 (진단 요약 + 발견된 이슈 나열)
- 변경: 3컬럼 카드형 (기반점수 / 참여율 / 전환율)
  - 각 파트별 지표를 카드로 분리
  - 각 지표: 이름 + 내 값 + 벤치마크(p50/p75) + 판정(🟢🟡🔴)
  - 파트별 소계 점수
- 데이터 소스: `/api/diagnose` 응답의 parts 배열
- 목업 참고: "광고 상세 진단" 섹션

## U2. TOP 5 광고 버튼 추가

- 파일: `src/app/(main)/protractor/components/ad-metrics-table.tsx` (281줄)
- 현재: 광고별 지표만 표시
- 변경: 각 광고 행에 2개 버튼 추가
  - **Meta 광고관리**: `https://adsmanager.facebook.com/adsmanager/manage/ads?act={account_id}&selected_ad_ids={ad_id}`
  - **믹스패널**: `https://mixpanel.com/project/{mixpanel_project_id}/view/{mixpanel_board_id}` (ad_accounts 테이블에서 조회)
- ad_accounts 테이블에 `mixpanel_board_id` 컬럼 없으면 추가 (마이그레이션)

## U3. 벤치마크 크론 수동 실행 + 데이터 복구

- `/api/cron/collect-benchmarks` GET 호출로 벤치마크 데이터 수집
- `/api/cron/collect-daily` GET 호출로 일일 데이터 수집
- 실행 후 benchmarks 테이블에 최신 날짜 데이터 존재하는지 확인
- 에러 시 원인 파악 + 수정

## U4. 기존 ad_accounts 전부 삭제

```sql
DELETE FROM ad_accounts;
DELETE FROM daily_ad_insights;
DELETE FROM benchmarks;
```
- Smith님이 직접 재등록할 예정

## U5. sample-dashboard 목업 동기화

- 파일: `src/app/(main)/protractor/sample-dashboard.tsx` (258줄)
- 현재 샘플 데이터가 기존 4파트 기준 → 3파트 기준으로 업데이트
- 전환 퍼널: 노출→클릭→결제시작→구매 (장바구니 없음)
- 샘플 진단 이슈도 3파트에 맞게 수정

---

## 완료 기준

- 진단 UI가 3컬럼 카드형으로 표시
- TOP 5 광고에 Meta/믹스패널 버튼 존재
- 벤치마크 데이터 최신 날짜 확인
- ad_accounts 비어있음
- sample-dashboard에 장바구니 없음
- 빌드 성공
