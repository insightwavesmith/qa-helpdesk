# Protractor Data Fix (총가치각도기 데이터 수정) Design

> 작성일: 2026-03-30 | PDCA Level: L2 | 상태: Design
> Plan: `docs/01-plan/features/protractor-data-fix.plan.md`

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | Protractor Data Fix (총가치각도기 데이터 수정) |
| 작성일 | 2026-03-30 |
| 예상 기간 | 1~2일 |

| 관점 | 내용 |
|------|------|
| Problem | purchase 2배 집계, Mixpanel 전원 미연동, 7계정 Meta 데이터 없음 |
| Solution | omni_purchase 우선 단일화 + 데이터 보정, Mixpanel 설정 경로 확인, 계정별 원인 분류 |
| Function UX Effect | 정확한 전환 지표 → 신뢰할 수 있는 코칭 데이터 |
| Core Value | 총가치각도기의 핵심 가치는 정확한 데이터 기반 진단 — 데이터가 틀리면 진단도 틀림 |

---

## 문제 1: purchase 중복집계

### 1.1 근본 원인 분석

**코드 현황** (`src/lib/collect-daily-utils.ts:170-172`):
```typescript
const purchases =
    getActionValue(actions, "purchase") ||
    getActionValue(actions, "omni_purchase");
```

JavaScript `||` 연산자는 첫 번째 truthy 값을 반환한다. `purchase=37`이면 37을 반환하고 `omni_purchase`는 평가하지 않는다. **따라서 이 코드 자체는 합산하지 않는다.**

**가설 검증이 필요한 시나리오:**

| # | 가설 | 검증 방법 |
|---|------|-----------|
| H1 | `collect-daily-utils.ts`와 `meta-collector.ts` 두 경로가 동시에 같은 테이블에 쓰면서 다른 시점의 데이터가 중첩 | DB에서 동일 (date, ad_id)에 대해 2개 row 존재 여부 확인 |
| H2 | Meta API가 같은 광고를 여러 breakdown으로 반환하여 ad_id 레벨에서 중복 row 생성 | raw_insight에서 같은 ad_id가 다른 row로 저장되는지 확인 |
| H3 | `omni_purchase`가 `purchase`를 포함하는 상위집합이고, `||` 대신 실제로는 `purchase` 값이 0인 경우 `omni_purchase`로 폴백하여 이중 계산 발생하지 않지만, 양쪽 모두 non-zero인 경우 실제 구매수는 `omni_purchase` 하나만 사용해야 하는데 `purchase`를 사용 중 | raw_insight에서 purchase vs omni_purchase 값 비교 |
| H4 | `t3-engine.ts`의 `computeMetricValues`에서 같은 계정의 같은 날짜 데이터가 복수 row로 합산 | `SELECT count(*), date, ad_id FROM daily_ad_insights WHERE account_id='X' GROUP BY date, ad_id HAVING count(*) > 1` |

**핵심 진단 SQL:**
```sql
-- 1) raw_insight에서 purchase vs omni_purchase 직접 비교
SELECT
  date, ad_id, purchases,
  raw_insight->'actions' AS raw_actions
FROM daily_ad_insights
WHERE account_id = '{검증 대상 account_id}'
  AND purchases > 0
ORDER BY date DESC
LIMIT 10;

-- 2) 같은 ad_id가 같은 날짜에 복수 row 존재 여부
SELECT date, ad_id, COUNT(*) as cnt
FROM daily_ad_insights
WHERE account_id = '{검증 대상 account_id}'
GROUP BY date, ad_id
HAVING COUNT(*) > 1;

-- 3) Meta Ads Manager 값과 비교: 특정 날짜의 계정 총 purchases
SELECT date, SUM(purchases) as total_purchases
FROM daily_ad_insights
WHERE account_id = '{검증 대상 account_id}'
  AND date = '2026-03-29'
GROUP BY date;
```

### 1.2 수정 방안

**방안 A (권장): `omni_purchase` 우선, `purchase` 폴백**

Meta API 공식 문서에 따르면 `omni_purchase`는 온/오프라인 전체 구매를 포함하는 상위 지표다. 대부분의 자사몰 광고주는 온라인만 사용하므로 `purchase == omni_purchase`이지만, `omni_purchase`가 Meta의 권장 표준이다.

```typescript
// BEFORE (현재)
const purchases =
    getActionValue(actions, "purchase") ||
    getActionValue(actions, "omni_purchase");

// AFTER (수정)
// omni_purchase 우선 사용 (Meta 권장), purchase를 폴백으로
const purchases =
    getActionValue(actions, "omni_purchase") ||
    getActionValue(actions, "purchase");

const purchaseValue =
    getActionValue(actionValues, "omni_purchase") ||
    getActionValue(actionValues, "purchase");
```

**동일 수정 대상 (DRY 위반 코드 2곳):**

| 파일 | 함수 | 라인 |
|------|------|------|
| `src/lib/collect-daily-utils.ts` | `calculateMetrics()` | 170-175 |
| `src/lib/protractor/meta-collector.ts` | `calculateMetrics()` | 125-130 |

> **TODO**: `meta-collector.ts`의 `calculateMetrics`는 `collect-daily-utils.ts`와 완전 중복이다. 장기적으로 하나로 통합하되, 이번 TASK 범위에서는 두 곳 모두 동일하게 수정한다.

### 1.3 기존 데이터 보정

진단 SQL 결과에 따라 두 가지 경로:

**경로 A: DB 값이 실제로 2배인 경우**
```sql
-- raw_insight에서 올바른 purchase 값을 재추출하여 보정
-- 주의: 이 쿼리는 dry-run으로 먼저 확인
UPDATE daily_ad_insights
SET
  purchases = (
    COALESCE(
      (SELECT (elem->>'value')::int
       FROM jsonb_array_elements(raw_insight->'actions') AS elem
       WHERE elem->>'action_type' = 'omni_purchase'
       LIMIT 1),
      (SELECT (elem->>'value')::int
       FROM jsonb_array_elements(raw_insight->'actions') AS elem
       WHERE elem->>'action_type' = 'purchase'
       LIMIT 1),
      0
    )
  ),
  purchase_value = (
    COALESCE(
      (SELECT (elem->>'value')::numeric
       FROM jsonb_array_elements(raw_insight->'action_values') AS elem
       WHERE elem->>'action_type' = 'omni_purchase'
       LIMIT 1),
      (SELECT (elem->>'value')::numeric
       FROM jsonb_array_elements(raw_insight->'action_values') AS elem
       WHERE elem->>'action_type' = 'purchase'
       LIMIT 1),
      0
    )
  )
WHERE raw_insight IS NOT NULL
  AND purchases > 0;
```

**경로 B: DB 값이 정확하고 문제가 다른 레이어에 있는 경우**
- `t3-engine.ts`나 `aggregate.ts`의 집계 로직 점검
- 프론트엔드에서 추가 합산 여부 확인

### 1.4 파생 지표 자동 재계산

`purchases` 보정 시 다음 컬럼도 연쇄 재계산 필요:

| 컬럼 | 계산식 |
|------|--------|
| `roas` | `purchase_value / spend` |
| `click_to_purchase_rate` | `purchases / clicks × 100` |
| `checkout_to_purchase_rate` | `purchases / initiate_checkout × 100` |
| `reach_to_purchase_rate` | `purchases / impressions × 100` |

---

## 문제 2: Mixpanel 연결 미설정

### 2.1 근본 원인

**인프라는 완비, 사용자 설정이 0건.**

| 구성요소 | 상태 | 위치 |
|----------|------|------|
| 크론 잡 (collect-mixpanel) | ✅ 구현 완료 | `src/app/api/cron/collect-mixpanel/route.ts` |
| DB 테이블 (daily_mixpanel_insights) | ✅ 스키마 존재 | `supabase/migrations/20260226_*.sql` |
| API 클라이언트 (fetchMixpanelRevenue) | ✅ 구현 완료 | `src/lib/protractor/mixpanel-collector.ts` |
| 설정 UI (settings 페이지) | ✅ 구현 완료 | `src/app/(main)/settings/page.tsx` |
| 관리자 UI (admin accounts) | ✅ 구현 완료 | `src/app/(main)/admin/accounts/` |
| **ad_accounts.mixpanel_project_id** | ❌ **전원 NULL** | DB |
| **profiles.mixpanel_secret_key** | ❌ **전원 NULL** | DB |
| **service_secrets (mixpanel)** | ❌ **0건** | DB |

**크론 실행 흐름:**
```
collect-mixpanel (매일 18:30 UTC)
  → SELECT FROM ad_accounts WHERE mixpanel_project_id IS NOT NULL
  → 결과: 0건
  → "믹스패널 연동 계정 없음" 반환
  → daily_mixpanel_insights: 0건
```

### 2.2 원인 분류

수강생이 Mixpanel을 설정하려면:
1. Mixpanel 계정에서 **Project ID** 확인
2. Mixpanel 설정에서 **Secret Key** (API 토큰) 발급
3. bscamp `/settings` 페이지에서 입력 또는 관리자가 admin 패널에서 설정

**미설정 이유 후보:**
- 수강생이 Mixpanel 사용법을 모름
- 설정 페이지 존재를 모름
- Mixpanel 자체를 사용하지 않는 계정 (쇼핑몰이 아닌 경우)
- Secret Key 발급이 복잡 (Mixpanel Organization Settings → Service Accounts)

### 2.3 해결 방안

**A. 즉시 조치 (관리자 일괄 설정)**
- Smith님이 수강생에게 Mixpanel Project ID + Secret Key를 수집
- admin 패널에서 일괄 입력
- 이 방안은 코드 변경 불필요

**B. 코드 개선 (선택)**
- `/settings` 페이지에 Mixpanel 연동 가이드 모달 추가
- admin 패널에 "Mixpanel 일괄 설정" CSV 업로드 기능
- 크론 로그에 "미설정 N건" 경고 → 관리자 알림

**이번 TASK 범위**: 원인 문서화 + 해결 경로 명시 (코드 변경은 Smith님 결정 후)

### 2.4 확인 SQL

```sql
-- Mixpanel 설정 상태 전체 조회
SELECT
  a.account_id,
  a.account_name,
  a.mixpanel_project_id,
  a.mixpanel_board_id,
  p.mixpanel_secret_key IS NOT NULL AS has_secret
FROM ad_accounts a
LEFT JOIN profiles p ON a.user_id = p.id
WHERE a.active = true
ORDER BY a.account_name;
```

---

## 문제 3: Meta 데이터 없음 7개 계정

### 3.1 대상 계정
유비드, 리바이너, 고요아, 아토리카버크림, MKM_동현, 온기브, 리아르

### 3.2 원인 분류 매트릭스

데이터 수집 파이프라인에서 차단될 수 있는 7개 지점:

| # | 차단 지점 | 코드 위치 | 확인 방법 |
|---|-----------|-----------|-----------|
| C1 | ad_accounts 테이블에 미등록 | `discover-accounts` route | `SELECT account_id FROM ad_accounts WHERE account_name ILIKE '%유비드%'` |
| C2 | `active = false` | `collect-daily:362` | `SELECT active FROM ad_accounts WHERE ...` |
| C3 | 90일 impressions = 0 (비활성 스킵) | `discover-accounts:204-210` | Meta API로 직접 90일 impressions 확인 |
| C4 | `meta_status = 'permission_denied'` | `collect-daily:420-425` | `SELECT meta_status FROM ad_accounts WHERE ...` |
| C5 | META_ACCESS_TOKEN이 해당 계정 접근 불가 | `checkMetaPermission()` | Meta Graph API `act_{id}?fields=name` 직접 호출 |
| C6 | account_id 형식 오류 (비숫자) | `collect-daily:404` | `SELECT account_id FROM ad_accounts WHERE account_id !~ '^\d+$'` |
| C7 | user_id 미할당 + 비관리자 조회 | RLS 정책 | `SELECT user_id FROM ad_accounts WHERE ...` |

### 3.3 진단 프로세스

```sql
-- Step 1: 7개 계정 이름으로 ad_accounts 검색
SELECT
  account_id, account_name, active, is_member,
  user_id, meta_status, discovered_at, last_checked_at
FROM ad_accounts
WHERE account_name ILIKE ANY(ARRAY[
  '%유비드%', '%리바이너%', '%고요아%',
  '%아토리카%', '%MKM%', '%동현%',
  '%온기브%', '%리아르%'
]);

-- Step 2: 데이터 존재 여부
SELECT DISTINCT account_id, MIN(date), MAX(date), COUNT(*)
FROM daily_ad_insights
WHERE account_id IN ({Step 1 결과})
GROUP BY account_id;

-- Step 3: cron 실행 로그에서 에러 확인
SELECT cron_name, status, error_message, details, finished_at
FROM cron_runs
WHERE cron_name IN ('discover-accounts', 'collect-daily')
  AND status != 'success'
ORDER BY finished_at DESC
LIMIT 20;
```

### 3.4 원인별 조치 방안

| 원인 | 조치 |
|------|------|
| C1: 미등록 | `discover-accounts` 수동 실행 또는 admin에서 수동 등록 |
| C2: active=false | `UPDATE ad_accounts SET active=true WHERE account_id=...` |
| C3: 90일 비활성 | 최근 광고 집행 여부 확인 → 집행 중이면 discover 재실행 |
| C4: permission_denied | Meta Business Manager에서 권한 확인 → 토큰 재발급 |
| C5: 토큰 접근 불가 | 해당 계정이 BM 소속인지 확인 → BM 추가 필요 |
| C6: ID 형식 오류 | account_id 정정 |
| C7: user_id 미할당 | admin에서 수강생과 매칭 |

---

## 영향 파일 상세

| 파일 | 수정 내용 | 영향도 |
|------|-----------|--------|
| `src/lib/collect-daily-utils.ts:170-175` | purchase → omni_purchase 우선 | HIGH |
| `src/lib/protractor/meta-collector.ts:125-130` | 동일 수정 | HIGH |
| DB: `daily_ad_insights` | purchases/purchase_value 보정 SQL | HIGH |
| DB: `ad_accounts` | 7개 계정 상태 조치 | MEDIUM |

**수정하지 않는 파일:**
- `src/lib/protractor/t3-engine.ts` — DB에서 읽은 값을 합산할 뿐, 로직 정상
- `src/lib/protractor/aggregate.ts` — 동일, DB 값 합산
- `src/lib/protractor/metric-groups.ts` — 지표 정의 변경 없음

## 롤백 전략

| 단계 | 롤백 방법 |
|------|-----------|
| 코드 수정 | git revert (omni_purchase ↔ purchase 순서만 바꾼 것이므로 안전) |
| DB 보정 | 보정 전 `daily_ad_insights` 백업 테이블 생성, 보정 SQL 역전 가능 |
| 계정 조치 | ad_accounts 변경 로그가 `updated_at`으로 추적됨 |

## 검증 체크리스트

- [ ] 진단 SQL로 purchase 중복 여부 확인
- [ ] 수정 후 특정 계정 1개로 collect-daily 재실행 → Meta Ads Manager 값과 비교
- [ ] 7개 계정 각각 원인 식별 완료
- [ ] `npx tsc --noEmit --quiet` — 타입 에러 0개
- [ ] `npm run build` — 빌드 성공
- [ ] Gap 분석 Match Rate 90%+
