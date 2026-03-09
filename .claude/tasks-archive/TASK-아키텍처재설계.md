# TASK: 총가치각도기 아키텍처 재설계

> Plan 인터뷰 스킵
> 이 TASK는 아키텍처 감사(2026-02-28)에서 발견된 P1~P8 + QA수정11 미수정 버그 4건을 한번에 해결한다.

## 배경

아키텍처 감사에서 데이터 수집 → 계산 엔진 → UI까지 전수 분석 결과,
구조적 결함 8개 + UI 버그 4개가 확인됨. 패치가 아니라 근본 수정.

## Phase 1: 데이터 수집 안정화 (collect-daily, collect-benchmarks)

## A1. daily_ad_insights INSERT → UPSERT (P1 🔴)

- **현재**: `supabase.from("daily_ad_insights").insert(rows)` — 재실행 시 중복
- **변경**: `.upsert(rows, { onConflict: "account_id,date,ad_id" })` 로 변경
- **파일**: `src/app/api/cron/collect-daily/route.ts` (275행 근처)
- **주의**: daily_ad_insights 테이블에 `(account_id, date, ad_id)` unique constraint가 없으면 SQL로 추가 필요
  ```sql
  ALTER TABLE daily_ad_insights
  ADD CONSTRAINT daily_ad_insights_unique
  UNIQUE (account_id, date, ad_id);
  ```

## A2. retention_rate 계산 통일 (P2 🔴)

- **현재 불일치**:
  - collect-daily (DB 저장): `retention_rate = video_p100 / video_p3s × 100`
  - t3-engine (합산 재계산): `retention_rate = thruplay / video_p3s × 100`
- **확정 공식**: `retention_rate = video_p100 / video_p3s × 100`
  - 이유: "이탈률"이니까 끝까지(100%) 본 사람 비율이 맞음. thruplay는 15초/97% 기준이라 다른 지표.
- **변경 대상**: `src/lib/protractor/t3-engine.ts` (171행)
  - `totalThruplay` 대신 `totalVideoP100` 사용
  - 변수명도 `totalP100`으로 변경
- **주의**: t3-engine에서 `row.video_p100` 컬럼을 읽어야 함 → daily_ad_insights에 video_p100 컬럼 존재 확인

## A3. creative_type 판별 통일 (P4 🟡)

- **현재 불일치**:
  - collect-daily: 메타 API `creative.object_type` 필드로 정확 판별
  - collect-benchmarks: "video_p3s > 0 || thruplay > 0 이면 VIDEO" 추정
- **변경**: collect-benchmarks도 메타 API 필드 사용
- **파일**: `src/app/api/cron/collect-benchmarks/route.ts` (143~150행)
  - `creative.fields(object_type)` 요청 필드 추가
  - `ad.creative?.object_type` 기반 판별로 변경
- **주의**: benchmarks API (`/act_{id}/insights?level=ad`)에서 creative.object_type 가져올 수 있는지 확인 필요. 안 되면 `ad_creative_id`로 별도 조회.

## A4. benchmarks 테이블 date 컬럼 추가 (P5 🟡)

- **현재**: `calculated_at` 타임스탬프만 있음. 전체 삭제 후 재삽입 → 이력 없음
- **변경**:
  1. `date` 컬럼 추가 (해당 주의 월요일 날짜)
  2. 전체 삭제 대신 `upsert` (onConflict: creative_type, ranking_type, ranking_group, date)
  3. 과거 데이터 보존
- **SQL**:
  ```sql
  ALTER TABLE benchmarks ADD COLUMN IF NOT EXISTS date DATE;
  UPDATE benchmarks SET date = calculated_at::date WHERE date IS NULL;
  ALTER TABLE benchmarks
  ADD CONSTRAINT benchmarks_unique
  UNIQUE (creative_type, ranking_type, ranking_group, date);
  ```
- **파일**: `src/app/api/cron/collect-benchmarks/route.ts`
  - 전체 삭제(.delete()) 제거
  - .upsert() 사용
  - date 필드에 해당 주 월요일 날짜 기입

## Phase 2: UI 통일 (카드 렌더링 + 라벨)

## B1. 1등 카드 / 2~5등 카드 렌더링 통일 (P3 🔴 + QA수정11)

- **현재**:
  - 1등: `DiagnosisDetail` 컴포넌트 → 14개 지표 (1개 초과)
  - 2~5등: `BenchmarkCompareGrid` 컴포넌트 → 13개 지표
  - 다른 컴포넌트라서 라벨, 배치, 지표 수가 다름
- **변경**: 1~5등 전부 동일 카드 컴포넌트 사용
  - `BenchmarkCompareGrid`를 기본으로 통일
  - `DiagnosisDetail`의 진단 문구(one_line_diagnosis)는 카드 상단에 별도 표시
  - 13개 지표는 `metric-groups.ts` 에서 import (single source of truth)
- **파일**: `src/app/(main)/protractor/components/content-ranking.tsx`

## B2. 라벨 통일 (P6 🟡 + QA수정11)

- **현재 불일치**:
  - retention_rate: "이탈률" vs "시청유지율" 혼재
  - reach_to_purchase_rate: "노출당구매확률" vs "도달당구매율" 혼재
  - click_to_purchase_rate: "구매전환율" vs "클릭당구매율" 혼재
- **확정 라벨** (metric-groups.ts 기준):
  - retention_rate → "이탈률"
  - reach_to_purchase_rate → "노출당구매확률"
  - click_to_purchase_rate → "구매전환율"
- **변경**: `DiagnosisDetail` 내 하드코딩된 라벨 전부 제거, `metric-groups.ts`에서 가져오기
- **확인**: 모든 UI 파일에서 지표 라벨이 `metric-groups.ts`만 참조하는지 grep 확인

## B3. 2~5등 카드 노출당구매확률 표시 (QA수정11)

- **현재**: 2~5등 카드에 노출당구매확률(reach_to_purchase_rate)이 안 나옴
- **원인**: BenchmarkCompareGrid에서 이 지표를 건너뛰고 있을 수 있음
- **변경**: metric-groups.ts의 13개 전부 표시되는지 확인 후 누락 수정

## Phase 3: 코드 정리

## C1. reach_to_purchase_rate 주석 필수 (P7 🟡)

- **이유**: DB 컬럼명이 `reach_to_purchase_rate`인데 실제 분모는 impressions (reach 아님)
- **변경**: 이 컬럼을 사용하는 모든 파일에 주석 추가
  ```
  // reach_to_purchase_rate: 이름과 달리 분모는 impressions (= purchases / impressions × 100)
  // DB 컬럼명은 호환성 위해 유지
  ```
- **대상 파일**: collect-daily, t3-engine, metric-groups.ts, content-ranking.tsx

## C2. 설계서 갱신

- 변경된 파일에 맞춰 설계서 현행화 (validate-design.sh hook이 강제)
- `protractor-refactoring.design.md` + `cron-collection.design.md` 갱신

## 파일 변경 예상

| 파일 | 변경 내용 |
|------|-----------|
| `src/app/api/cron/collect-daily/route.ts` | A1: insert→upsert |
| `src/app/api/cron/collect-benchmarks/route.ts` | A3: creative_type + A4: date+upsert |
| `src/lib/protractor/t3-engine.ts` | A2: retention_rate p100 기반 |
| `src/app/(main)/protractor/components/content-ranking.tsx` | B1+B2+B3: 카드 통일+라벨+누락 지표 |
| `src/lib/protractor/metric-groups.ts` | C1: 주석 추가 |
| docs/02-design/features/ | C2: 설계서 갱신 |

## 하지 않는 것

- P8 (믹스패널 매출 교차검증): 카페24 데이터 필요 → 별도 작업
- daily_ad_insights 테이블 구조 변경 (기존 컬럼 유지)
- 이미 작동하는 기능의 리팩토링 (필요 최소한만 수정)

## DB 마이그레이션 SQL (에이전트팀이 작성, 모찌가 실행)

에이전트팀은 SQL 파일만 작성. 실제 실행은 모찌가 확인 후 수행.

## 완료 기준

- [ ] A1~A4, B1~B3, C1~C2 전부 구현
- [ ] npm run build 성공
- [ ] 13개 지표가 성과요약 + 1~5등 카드 전부 동일하게 표시
- [ ] retention_rate가 DB 저장값과 엔진 계산값 일치
- [ ] collect-daily 2회 실행해도 중복 없음
- [ ] 설계서 갱신 완료

---

## 리뷰 결과 (2026-02-28 코드 리뷰)

## A1. daily_ad_insights INSERT → UPSERT ✅ 정확

- **코드 확인**: `collect-daily/route.ts:273-275` — `.insert(rows as never[])` 확인됨
- **TASK 설명 정확**: 행 번호, 현재 코드, 변경 방향 모두 일치
- **리스크**:
  - unique constraint 추가 SQL이 실행되기 전에 코드를 배포하면 upsert가 실패할 수 있음
  - **배포 순서**: SQL 먼저 → 코드 배포 (순서 중요)
  - `ad_id` 컬럼에 null이 들어오는 경우 (line 262: `ad.ad_id ?? ad.id`) unique constraint 위반 가능성 확인 필요

## A2. retention_rate 계산 통일 ⚠️ 설명 불완전

- **코드 확인**: `t3-engine.ts:171` — `(totalThruplay / totalVideoP3s) * 100` 확인됨. 버그 맞음
- **문제**: TASK에 "totalVideoP100 사용"이라고만 적혀 있지만, `computeMetricValues` 함수에는 **`totalVideoP100` 변수가 존재하지 않음**
  - 현재 변수: `totalThruplay`만 있고 p100 관련 누적 변수 없음 (line 128-140)
  - **추가 작업 필요**: `let totalVideoP100 = 0;` 선언 + 누적 로직 추가
  - 누적 방법: `row.video_p100`(절대값) 사용, 또는 aggregate.ts처럼 `(row.retention_rate / 100) * p3sRaw`로 역산
- **참고**: `aggregate.ts:138`은 이미 올바르게 구현됨 (`_totalP100 = retention_rate / 100 * p3sRaw`). 이 패턴을 따를 것
- **놓친 파일 없음**: collect-daily(:141), collect-benchmarks(:161)는 이미 `video_p100 / videoP3s` 사용 중

## A3. creative_type 판별 통일 ⚠️ API 제약 확인 필요

- **코드 확인**: `collect-benchmarks/route.ts:144` — `videoP3s > 0 || thruplay > 0 ? "VIDEO" : "IMAGE"` 확인됨
- **핵심 리스크**: collect-benchmarks는 **`/insights?level=ad` 엔드포인트**를 사용 (line 291-298). 이 엔드포인트는 `creative.object_type` 필드를 **반환하지 않음**
  - collect-daily는 `/ads` 엔드포인트 + `creative.fields(object_type)` 사용 → 정확한 판별 가능
  - collect-benchmarks는 `/insights` 엔드포인트 → creative 정보 없음
- **해결 방안**:
  1. **방안 A**: `/ads` 엔드포인트로 변경 (collect-daily 방식) — API 호출 구조 대폭 변경 필요
  2. **방안 B**: `ad_id`별로 별도 `/ads/{ad_id}?fields=creative{object_type}` 조회 — API 콜 수 증가
  3. **방안 C**: daily_ad_insights에 이미 저장된 creative_type을 JOIN으로 가져오기 — DB 의존
- **TASK 행 번호**: "143~150행" → 실제 해당 로직은 **144행 한 줄**

## A4. benchmarks 테이블 date + upsert ✅ 정확

- **코드 확인**: `collect-benchmarks/route.ts:416-435` — DELETE → INSERT 패턴 확인됨
- **TASK 설명 정확**: SQL, 변경 방향 모두 타당
- **추가 확인**:
  - `ad_insights_classified`도 동일한 DELETE→INSERT 패턴 (line 342-358). TASK 범위 외이지만 동일 리스크 존재
  - A4 변경 시 `protractor/benchmarks/route.ts`의 조회 로직도 수정 필요할 수 있음 (현재 `calculated_at` 기준 최신 조회 → `date` 기준으로?)
  - upsert onConflict에 `date` 포함 → 이전 주 데이터 보존됨. 벤치마크 API가 최신 것만 조회하므로 큰 영향 없음

## B1. 카드 렌더링 통일 ⚠️ 현재 상태 설명이 실제와 다름

- **실제 코드**: `content-ranking.tsx`에서 1~5등 **모두** `AdRankCard` → `BenchmarkCompareGrid` 사용 (line 591-604, 466)
  - `DiagnosisDetail`은 `content-ranking.tsx:181`에 정의되어 있지만 **사용되지 않는 데드 코드**
  - `one_line_diagnosis`는 텍스트로만 표시 (line 461-464)
- **TASK 설명과 불일치**: "1등: DiagnosisDetail → 14개"라고 했지만, 현재 코드는 이미 전부 BenchmarkCompareGrid 사용
  - `top5-ad-cards.tsx`에 별도 DiagnosisDetail이 있으나, **어디서도 import하지 않는 데드 파일**
- **실제 필요 작업**: DiagnosisDetail 데드 코드 제거 (content-ranking.tsx:139-272 + top5-ad-cards.tsx 전체)
- **리스크**: 낮음. 이미 통일되어 있으므로 데드 코드 정리만 하면 됨

## B2. 라벨 통일 ⚠️ 모순 + 누락 파일 있음

- **라벨 모순**: TASK에 "확정 라벨: retention_rate → 이탈률"이라고 했지만, metric-groups.ts(line 33)는 현재 **"지속비율"**
  - TASK가 "metric-groups.ts 기준"이라고도 했으므로 **둘 중 하나가 틀림**
  - **판단 필요**: "이탈률"로 바꿀 것인지, "지속비율" 유지할 것인지 확정 필요
- **reach_to_purchase_rate**: metric-groups.ts(:57) = "노출당구매확률" ✅
- **click_to_purchase_rate**: metric-groups.ts(:55) = "구매전환율" ✅
- **TASK에 누락된 불일치 파일**:
  | 파일 | 현재 라벨 | metric-groups.ts 기준 | 상태 |
  |------|-----------|----------------------|------|
  | `diagnosis/metrics.ts:32` | "도달당구매율" | "노출당구매확률" | ❌ 불일치 |
  | `diagnosis/metrics.ts:10` | "지속비율" | "지속비율" | ✅ 일치 |
  | `benchmark-admin.tsx:52` | "지속 비율" (띄어쓰기) | "지속비율" | ⚠️ 미세 불일치 |
  | `benchmark-admin.tsx:49-63` | 독자적 라벨 13개 | metric-groups.ts 미참조 | ⚠️ 하드코딩 |
  | `sample-dashboard.tsx:135` | "구매전환율" | "구매전환율" | ✅ 일치 |
- **TASK 변경 대상에 추가 필요**:
  - `src/lib/diagnosis/metrics.ts` — "도달당구매율" → "노출당구매확률"
  - `src/app/(main)/protractor/components/benchmark-admin.tsx` — 라벨 하드코딩 → metric-groups.ts 참조로 변경

## B3. 노출당구매확률 표시 ⚠️ 근본 원인이 다를 수 있음

- **코드 확인**: `metric-groups.ts:57`에 `reach_to_purchase_rate` **포함되어 있음**. BenchmarkCompareGrid는 METRIC_GROUPS 전체를 순회하므로 코드상으로는 렌더링 되어야 함
- **진짜 원인 후보**:
  1. `collect-benchmarks/route.ts:24-38` — `METRIC_KEYS`에 **`reach_to_purchase_rate` 미포함** (13개에서 roas가 대신 포함)
  2. `protractor/benchmarks/route.ts:30-44` — `avg_reach_to_purchase_rate` 매핑 없음
  3. → 벤치마크 데이터에 이 지표가 없어 비교값이 null → 값 자체는 표시되나 벤치마크 비교 불가
  4. **만약 ad 자체 값도 null이면**: `renderMetricRow`가 `return null`하여 아예 안 보임
- **추가 변경 필요**:
  - `collect-benchmarks/route.ts` METRIC_KEYS에 `reach_to_purchase_rate` 추가 (→ 14개로 변경, 또는 roas 제거 여부 결정)
  - `protractor/benchmarks/route.ts` toFrontendRow에 `avg_reach_to_purchase_rate` 매핑 추가
  - `benchmark-admin.tsx` METRIC_DEFS에 추가

## C1. reach_to_purchase_rate 주석 ✅ + 누락 파일 있음

- **TASK 대상**: collect-daily, t3-engine, metric-groups.ts, content-ranking.tsx ✅
- **추가 대상 파일** (reach_to_purchase_rate를 직접 계산하는 곳):
  - `src/lib/protractor/aggregate.ts:179` — `purchases / impressions` 계산
  - `src/app/api/diagnose/route.ts:137` — ⚠️ **`totalReach` 사용 (버그!)**, 다른 곳은 모두 impressions 분모
  - `src/lib/diagnosis/metrics.ts:32` — 라벨 "도달당구매율" (B2와 겹침)
- **신규 발견 버그**: `diagnose/route.ts:137`
  ```
  existing.reach_to_purchase_rate = totalReach > 0 ? (totalPurchases / totalReach) * 100 : 0;
  ```
  → 분모가 `totalReach`인데, 나머지 모든 곳은 `totalImpressions` 사용. **분모 불일치 버그**
  → `totalImpressions`로 수정 필요

## C2. 설계서 갱신 ✅

- `protractor-refactoring.design.md` 존재 확인됨
- `cron-collection.design.md` 존재 여부 미확인 — 없으면 신규 작성 필요

---

### 리뷰 반영 확정 (Smith님 2026-02-28)

1. **A2**: "지속비율" 라벨 유지. t3-engine에 `totalVideoP100` 변수 신규 선언 + aggregate.ts 패턴 참고
2. **A3**: DB JOIN 방식 — daily_ad_insights에서 ad_id로 creative_type 조회, 없으면 기존 추정 fallback
3. **B1**: DiagnosisDetail 데드코드 제거 + top5-ad-cards.tsx 삭제
4. **B2 추가**: diagnosis/metrics.ts "도달당구매율"→"노출당구매확률", benchmark-admin.tsx 하드코딩→import
5. **B3 근본 원인**: collect-benchmarks METRIC_KEYS에 reach_to_purchase_rate 추가 (14개), benchmarks route 매핑 추가
6. **C3 신규**: diagnose/route.ts:137 totalReach→totalImpressions 분모 버그 수정

### 종합: TASK에서 놓친 파일/변경사항

| # | 파일 | 놓친 내용 | 관련 항목 |
|---|------|-----------|-----------|
| 1 | `src/lib/protractor/t3-engine.ts` | `totalVideoP100` 변수 선언+누적 로직 추가 필요 (TASK는 교체만 언급) | A2 |
| 2 | `src/app/api/diagnose/route.ts:137` | `totalReach` → `totalImpressions` 분모 버그 수정 | C1 신규 |
| 3 | `src/lib/diagnosis/metrics.ts:32` | "도달당구매율" → "노출당구매확률" 라벨 불일치 | B2 |
| 4 | `src/app/api/cron/collect-benchmarks/route.ts:24-38` | METRIC_KEYS에 reach_to_purchase_rate 누락 | B3 근본 원인 |
| 5 | `src/app/api/protractor/benchmarks/route.ts:30-44` | avg_reach_to_purchase_rate 매핑 누락 | B3 |
| 6 | `src/app/(main)/protractor/components/benchmark-admin.tsx` | 라벨 하드코딩 + reach_to_purchase_rate 누락 | B2, B3 |
| 7 | `src/app/(main)/protractor/components/top5-ad-cards.tsx` | 데드 파일 — 삭제 또는 방치 결정 필요 | B1 |

### 판단 필요 사항

1. **retention_rate 라벨**: "이탈률" vs "지속비율" — metric-groups.ts 기준으로 확정 필요
2. **A3 API 방식**: insights 엔드포인트에서 creative type 가져올 수 없음 → 대안 선택 필요
3. **METRIC_KEYS에 reach_to_purchase_rate 추가 시**: 총 지표 수 14개 vs roas 제거하여 13개 유지 결정
4. **B1 현황 재확인**: 이미 BenchmarkCompareGrid 통일됨. DiagnosisDetail 데드코드 정리 여부
