# T10 백필 통합 (광고+믹스패널+타겟중복) — Gap 분석

> 분석일: 2026-03-04
> 분석자: qa-engineer
> 참조: protractor-v5-t10-backfill-unify.design.md

---

## Match Rate: 95%

## 일치 항목 (19/20)

| # | 설계 항목 | 구현 상태 | 일치 |
|---|----------|----------|------|
| 1 | RecollectButtons 컴포넌트 삭제 | `recollect-buttons.tsx` 파일 삭제 완료 | ✅ |
| 2 | page.tsx에서 RecollectButtons import/사용 제거 | import + JSX 제거 완료 | ✅ |
| 3 | `mixpanel-collector.ts` 신규 모듈 생성 | `fetchMixpanelRevenue` + `lookupMixpanelSecret` 추출 완료 | ✅ |
| 4 | collect-mixpanel/route.ts에서 새 모듈 import | `decrypt` 직접 import 제거, `lookupMixpanelSecret` 사용으로 변경 | ✅ |
| 5 | days 허용값에 1 추가 | `[1, 7, 30, 90]` 검증 완료 (API + 프론트 양쪽) | ✅ |
| 6 | PERIOD_OPTIONS에 1 추가 | `[1, 7, 30, 90] as const` 적용 | ✅ |
| 7 | days state 타입에 1 추가 | `useState<1 \| 7 \| 30 \| 90>(30)` | ✅ |
| 8 | SSE start 이벤트: phases 배열 전송 | `{ type: "start", phases: [...] }` 구현 | ✅ |
| 9 | Phase 1 (ad): 기존 로직 유지 + phase SSE | `phase_start`, `phase_progress`, `phase_complete` 이벤트 전송 | ✅ |
| 10 | Phase 2 (mixpanel): project_id 없으면 skip | `phase_skip("mixpanel", "믹스패널 미연동")` | ✅ |
| 11 | Phase 2 (mixpanel): 시크릿키 없으면 skip | `phase_skip("mixpanel", "시크릿키 없음")` | ✅ |
| 12 | Phase 2 (mixpanel): 날짜별 수집 + upsert | `daily_mixpanel_insights` upsert, `onConflict: "date,account_id,project_id"` | ✅ |
| 13 | Phase 2 (mixpanel): 1회 재시도 (타임아웃) | `retries <= 1` + `TimeoutError` 체크 | ✅ |
| 14 | Phase 3 (overlap): 활성 캠페인 없으면 skip | `phase_skip("overlap", "활성 캠페인 없음")` | ✅ |
| 15 | Phase 3 (overlap): 상위 8개 adset 제한 | `cappedAdsets = sortedAdsets.slice(0, 8)` | ✅ |
| 16 | Phase 3 (overlap): 55초 타임아웃 | `Date.now() - startTime > 55_000` | ✅ |
| 17 | Phase 3 (overlap): adset_overlap_cache upsert | `makePairKey` + `__overall__` 모두 upsert | ✅ |
| 18 | SSE complete 이벤트: summary 배열 | `{ type: "complete", summary: [...] }` | ✅ |
| 19 | 클라이언트 3종 진행률 UI | PhaseRow 컴포넌트: pending/running/done/skipped/error 아이콘+바 | ✅ |

## 불일치 항목 (1/20)

| # | 설계 항목 | 구현 상태 | 차이 | 영향도 |
|---|----------|----------|------|--------|
| 20 | collect-mixpanel/route.ts도 mixpanel-collector.ts를 import하도록 변경 (DRY) | `fetchMixpanelRevenue`는 import 완료, `lookupMixpanelSecret`도 완료. 그러나 원본 `fetchMixpanelRevenue` 함수가 route.ts에서 완전히 제거되었으나 cron의 동작은 동일 | 낮음 — DRY 달성 완료, 기능 동일 | ✅ (사실상 일치) |

## 수정 필요

없음. 모든 핵심 항목 일치.

## 추가 관찰

1. **벤치마크 무영향**: `/admin/protractor/benchmarks/` 관련 파일 수정 없음 확인 ✅
2. **크론 무영향**: `collect-daily/route.ts`, `collect-mixpanel/route.ts`의 핵심 로직 변경 없음 (import만 변경) ✅
3. **DB 스키마 변경 없음**: 기존 테이블(`daily_ad_insights`, `daily_mixpanel_insights`, `adset_overlap_cache`) 활용 ✅
4. **빌드 검증**: `npx tsc --noEmit` 에러 0, `npx eslint` 에러 0, `npm run build` 성공 ✅

## 파일 변경 요약

| 파일 | 작업 | 설계 일치 |
|------|------|----------|
| `src/lib/protractor/mixpanel-collector.ts` | **신규** | ✅ |
| `src/app/api/cron/collect-mixpanel/route.ts` | import 변경 | ✅ |
| `src/app/api/admin/backfill/route.ts` | 3종 수집 + phase SSE | ✅ |
| `src/app/(main)/admin/protractor/page.tsx` | RecollectButtons 제거 | ✅ |
| `src/app/(main)/admin/protractor/recollect-buttons.tsx` | **삭제** | ✅ |
| `src/app/(main)/admin/protractor/backfill-section.tsx` | 1일 옵션 + 3종 UI | ✅ |
