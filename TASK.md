# TASK: T10 — 백필 통합 (광고+믹스패널+타겟중복)

## 목표
관리자 페이지(/admin/protractor)에서 "당일 재수집 버튼 4개"를 제거하고, 기존 백필 섹션에 통합. 백필이 광고데이터 + 믹스패널 + 타겟중복을 한번에 수집하도록 변경.

## 현재 동작
- `recollect-buttons.tsx`: 벤치마크/광고데이터/매출데이터/타겟중복 재수집 버튼 4개 (당일만)
- `backfill-section.tsx`: 과거 데이터 수동 수집 (광고데이터만, 7/30/90일)
- `/api/admin/backfill/route.ts` + `meta-collector.ts`: Meta 광고만 수집

## 기대 동작
1. `RecollectButtons` 컴포넌트 제거 (page.tsx에서 import/사용 제거, recollect-buttons.tsx 삭제)
2. `BackfillSection` 기간 선택에 **1일** 옵션 추가 (1/7/30/90일)
3. 백필 API가 3가지 데이터를 한번에 수집:
   - 광고데이터 (기존 Meta API → daily_ad_insights, upsert)
   - 믹스패널 (Mixpanel API → daily_mixpanel_insights, upsert)
   - 타겟중복 (Meta API → daily_overlap_insights, upsert)
4. 진행 상태 SSE에 3가지 각각 진행률 표시 (예: "광고데이터 3/7일 완료", "믹스패널 3/7일 완료")
5. 벤치마크 재수집은 그대로 `/admin/protractor/benchmarks` 페이지에 유지 (건드리지 않음)

## 참고 파일
- 제거: `src/app/(main)/admin/protractor/recollect-buttons.tsx`
- 수정: `src/app/(main)/admin/protractor/page.tsx` (RecollectButtons import 제거)
- 수정: `src/app/(main)/admin/protractor/backfill-section.tsx` (1일 옵션 추가, UI에 3종 진행률)
- 수정: `src/app/api/admin/backfill/route.ts` (믹스패널+타겟중복 수집 추가)
- 참고: `src/app/api/cron/collect-mixpanel/route.ts` (믹스패널 수집 로직)
- 참고: `src/lib/protractor/overlap-utils.ts` (타겟중복 수집 로직)
- 참고: `src/app/api/protractor/overlap/route.ts` (타겟중복 DB 저장 방식)
- upsert key: daily_ad_insights → (account_id, date, ad_id), daily_mixpanel_insights → 확인 필요, daily_overlap_insights → 확인 필요

## 하지 말 것
- 벤치마크 재수집 버튼/로직 건드리지 말 것 (`benchmark-admin.tsx`, `/admin/protractor/benchmarks/`)
- collect-daily, collect-mixpanel 크론 코드 수정하지 말 것
- 기존 백필 SSE 구조 깨지 말 것 (스트림 방식 유지)
- DB 스키마 변경하지 말 것
