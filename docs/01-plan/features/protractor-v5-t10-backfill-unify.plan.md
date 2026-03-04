# T10 백필 통합 (광고+믹스패널+타겟중복) — Plan

> 작성일: 2026-03-04
> 작성자: Leader
> 상태: Plan

---

## 1. 배경

현재 관리자 페이지(`/admin/protractor`)에 두 개의 데이터 수집 UI가 공존한다:

1. **RecollectButtons** (`recollect-buttons.tsx`): 당일 재수집 버튼 4개 (벤치마크/광고데이터/매출데이터/타겟중복)
2. **BackfillSection** (`backfill-section.tsx`): 과거 데이터 수동 수집 (광고데이터만, 7/30/90일)

문제점:
- 재수집 버튼 4개가 개별 엔드포인트를 호출하여 UX가 분산됨
- 백필 섹션은 광고데이터만 수집하고, 믹스패널/타겟중복은 수동 수집 불가
- 당일 데이터도 백필 섹션에서 1일 선택으로 해결 가능하므로 재수집 버튼이 불필요

## 2. 목표

> 백필 섹션 하나로 광고데이터 + 믹스패널 + 타겟중복을 한번에 수집하도록 통합

### 핵심 변경
1. `RecollectButtons` 컴포넌트 제거 (벤치마크 재수집은 `/admin/protractor/benchmarks`에 별도 유지)
2. `BackfillSection` 기간 선택에 **1일** 옵션 추가 (1/7/30/90일)
3. 백필 API(`/api/admin/backfill`)가 3종 데이터를 순차 수집:
   - 광고데이터 → `daily_ad_insights` (upsert)
   - 믹스패널 → `daily_mixpanel_insights` (upsert)
   - 타겟중복 → `adset_overlap_cache` (upsert)
4. SSE 스트리밍에 3종 각각 진행률 표시

## 3. 범위 (Scope)

### In-Scope
| # | 항목 | 설명 |
|---|------|------|
| S1 | RecollectButtons 제거 | `recollect-buttons.tsx` 삭제, `page.tsx`에서 import/사용 제거 |
| S2 | BackfillSection 1일 옵션 | 기간 선택에 1일 추가 (days 타입 확장) |
| S3 | 백필 API 확장 | `/api/admin/backfill/route.ts`에 믹스패널 + 타겟중복 수집 로직 추가 |
| S4 | SSE 진행률 3종 분리 | type별 진행률 이벤트: `ad_progress`, `mixpanel_progress`, `overlap_progress` |
| S5 | BackfillSection UI 개선 | 3종 진행률 바/상태 표시 |

### Out-of-Scope
| # | 항목 | 이유 |
|---|------|------|
| O1 | 벤치마크 재수집 | `/admin/protractor/benchmarks` 페이지에 별도 유지 (건드리지 않음) |
| O2 | collect-daily 크론 코드 | 크론 스케줄러 수정 불필요 |
| O3 | collect-mixpanel 크론 코드 | 크론 스케줄러 수정 불필요 |
| O4 | DB 스키마 변경 | `daily_overlap_insights` 테이블 미생성. 기존 `adset_overlap_cache` 활용 |
| O5 | 기존 SSE 구조 변경 | 스트림 방식 유지, 이벤트 타입만 추가 |

## 4. 성공 기준

| # | 기준 | 검증 방법 |
|---|------|-----------|
| C1 | RecollectButtons 완전 제거 | `recollect-buttons.tsx` 파일 삭제 확인, page.tsx에서 import 없음 |
| C2 | 1일 백필 동작 | 1일 선택 후 수동 수집 → 당일-1일 데이터 수집 확인 |
| C3 | 3종 동시 수집 | 백필 실행 시 `daily_ad_insights` + `daily_mixpanel_insights` + `adset_overlap_cache` 모두 upsert |
| C4 | SSE 3종 진행률 | 클라이언트에서 광고/믹스패널/타겟중복 각각 진행 상태 확인 가능 |
| C5 | 빌드 성공 | `npm run build` + `npx tsc --noEmit` 에러 0 |
| C6 | 벤치마크 무영향 | `/admin/protractor/benchmarks` 페이지 기능 정상 |
| C7 | 크론 무영향 | collect-daily, collect-mixpanel 크론 코드 변경 없음 |

## 5. 리스크 & 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 믹스패널 시크릿키 없는 계정 | 수집 스킵 | SSE에 "시크릿키 없음 → 스킵" 메시지 전송, 에러 아님 |
| Meta API rate limit (타겟중복) | 조합 수만큼 API 호출 필요 | 기존 overlap API처럼 상위 8개 adset 제한 + 55초 타임아웃 |
| `daily_overlap_insights` 미존재 | DB 스키마 변경 금지 제약 | `adset_overlap_cache` 테이블 활용 (이미 존재, 코드에서 사용 중) |
| Vercel 5분 타임아웃 | 90일 × 3종 = 장시간 | 광고→믹스패널→타겟중복 순차 처리, 각 단계별 rate limit 대기 |

## 6. 참고 파일

### 삭제 대상
- `src/app/(main)/admin/protractor/recollect-buttons.tsx`

### 수정 대상
- `src/app/(main)/admin/protractor/page.tsx` — RecollectButtons import/사용 제거
- `src/app/(main)/admin/protractor/backfill-section.tsx` — 1일 옵션 추가, 3종 진행률 UI
- `src/app/api/admin/backfill/route.ts` — 믹스패널 + 타겟중복 수집 로직 추가

### 참고 (수정하지 않음)
- `src/app/api/cron/collect-mixpanel/route.ts` — 믹스패널 수집 로직 참고
- `src/lib/protractor/overlap-utils.ts` — 타겟중복 수집 로직 참고
- `src/app/api/protractor/overlap/route.ts` — 타겟중복 DB 저장 방식 참고
- `src/lib/protractor/meta-collector.ts` — 광고 수집 공통 모듈

### DB Upsert Key
| 테이블 | Upsert Key | 비고 |
|--------|-----------|------|
| `daily_ad_insights` | `account_id, date, ad_id` | 기존 동작 유지 |
| `daily_mixpanel_insights` | `date, account_id, project_id` | collect-mixpanel 크론과 동일 |
| `adset_overlap_cache` | `account_id, adset_pair, period_start, period_end` | overlap API와 동일 |

## 7. 의존성

- T8 (백필 기능): 이미 완료. 기존 SSE 백필 구조 위에 확장.
- A3 (collect-daily overlap 제거): 이미 완료. collect-daily에서 overlap 코드 분리됨.
- 타겟중복 기능: 이미 구현됨 (`adset_overlap_cache`, `overlap-utils.ts`).

## 8. 구현 순서 (예상)

```
1. page.tsx에서 RecollectButtons import/사용 제거
2. recollect-buttons.tsx 파일 삭제
3. backfill-section.tsx에 1일 옵션 추가
4. /api/admin/backfill/route.ts에 믹스패널 수집 로직 추가
5. /api/admin/backfill/route.ts에 타겟중복 수집 로직 추가
6. SSE 이벤트 타입 확장 (3종 분리)
7. backfill-section.tsx UI에 3종 진행률 표시
8. npm run build + tsc 확인
```
