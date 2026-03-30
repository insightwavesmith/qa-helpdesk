# 총가치각도기 데이터 아키텍처 검수 보고서

> 작성일: 2026-03-30 | L0 핫픽스 병행 검수
> 갱신일: 2026-03-30 | 2차 검수 — sync-status-precompute 캐시 라이터 근본 원인 추가

---

## 1. 핵심 테이블 관계도

```
profiles (사용자)
  └─ ad_accounts (광고계정, 1:N)
       ├─ daily_ad_insights (Meta 일별 광고 지표, 1:N by account_id + date + ad_id)
       ├─ daily_mixpanel_insights (Mixpanel 일별 매출 지표, 1:N by account_id + date)
       ├─ daily_overlap_insights (타겟중복 분석 결과, 1:N by account_id + date)
       ├─ adset_overlap_cache (광고세트 조합별 중복 캐시)
       ├─ t3_scores_precomputed (T3 점수 사전계산 캐시)
       ├─ insights_aggregated_daily (일별 집계 캐시)
       └─ benchmarks (벤치마크 기준 데이터)

service_secrets (서비스 시크릿 저장소)
  └─ key_name: "secret_{account_id}", service: "mixpanel"
     (ad_accounts와 account_id로 느슨하게 연결)

account_sync_status (관리자 상태 캐시, 1시간 TTL)
  └─ 기록자: sync-status-precompute.ts (크론)
     ⚠ 이 캐시 라이터가 service_secrets 미참조 → 전부 "not_configured" 기록
```

## 2. 수강생별 데이터 분류/관리 아키텍처

### 2.1 Meta ad_account ↔ bscamp 계정 매칭

| 필드 | 테이블 | 설명 |
|------|--------|------|
| `profiles.id` | profiles | Firebase Auth UID (=user_id) |
| `ad_accounts.user_id` | ad_accounts | FK → profiles.id |
| `ad_accounts.account_id` | ad_accounts | Meta 광고계정 ID (예: act_123456) |
| `ad_accounts.active` | ad_accounts | soft delete 플래그 |

- **관계**: `profiles 1:N ad_accounts` (user_id FK)
- **접근 제어**: `requireProtractorAccess()` → role 확인 (student/member/admin)
- **소유권 검증**: `verifyAccountOwnership(svc, uid, role, accountId)` → admin은 전체, 일반 사용자는 자기 계정만
- **ADR-001 준수**: account_id 기준 데이터 분리 (storage 경로도 `{account_id}/` 패턴)

### 2.2 account_id ↔ Mixpanel project 매칭 구조

**[발견된 구조적 문제]**

Mixpanel 설정은 **두 곳에 분산 저장**되어 불일치 발생:

| 저장 위치 | 필드 | 용도 | 실제 사용처 |
|-----------|------|------|------------|
| `ad_accounts.mixpanel_project_id` | project_id | Mixpanel API 호출 파라미터 | collect-mixpanel 크론 (필터 조건) |
| `ad_accounts.mixpanel_board_id` | board_id | 보드 식별 | 상태 판정 (기존 로직, 사실상 미사용) |
| `service_secrets` | key_value (암호화) | Mixpanel API 시크릿키 | lookupMixpanelSecret() 조회 |

**문제**:
- `save-secret` API는 `service_secrets`에만 저장하고 `ad_accounts.mixpanel_project_id`는 건드리지 않음
- 크론 수집은 `ad_accounts.mixpanel_project_id IS NOT NULL` 필터로 대상 선정
- 관리자 상태 API는 `ad_accounts.mixpanel_project_id` 체크만 하고 `service_secrets` 무시
- 결과: project_id가 ad_accounts에 없으면 → 크론 수집 대상에서 제외 + 상태 '미설정' 표시

**핫픽스 적용**: 상태 API에서 `secretSet` (service_secrets 기반) 활용하여 매칭 보정.

**근본 수정 필요**: save-secret 또는 온보딩 플로우에서 `ad_accounts.mixpanel_project_id`도 함께 업데이트하거나, 크론 수집 필터를 `service_secrets` JOIN으로 변경해야 함.

## 3. 데이터 수집 파이프라인

### 3.1 Meta 광고 데이터 (daily_ad_insights)

```
Cloud Scheduler (18:00 UTC, 매일)
  → /api/cron/collect-daily (크론 서비스)
    → Meta Graph API: /act_{id}/ads (광고 목록)
    → Meta Graph API: /act_{id}/insights (일별 지표)
    → UPSERT daily_ad_insights (account_id + date + ad_id)
    → 파생 지표 계산: video_p3s_rate, thruplay_rate, retention_rate,
      reactions_per_10k, engagement_per_10k, ctr, roas,
      click_to_checkout_rate, click_to_purchase_rate, reach_to_purchase_rate
```

**주요 필드**: spend, impressions, reach, clicks, purchases, purchase_value + 14개 파생 지표
**creative_type**: 광고 소재 유형 (VIDEO/IMAGE/CAROUSEL/ALL) — 벤치마크 매칭에 사용

### 3.2 Mixpanel 매출 데이터 (daily_mixpanel_insights)

```
Cloud Scheduler (18:30 UTC, 매일, collect-daily 30분 후)
  → /api/cron/collect-mixpanel
    → ad_accounts WHERE mixpanel_project_id IS NOT NULL  ← [문제: 필터 조건]
    → lookupMixpanelSecret(svc, accountId, userId)
      → service_secrets 우선 → profiles.mixpanel_secret_key 폴백
    → Mixpanel Segmentation API: purchase 이벤트 매출/건수
    → UPSERT daily_mixpanel_insights (date + account_id + project_id)
```

**주요 필드**: total_revenue, purchase_count, project_id

### 3.3 타겟중복 분석 (daily_overlap_insights)

```
사용자 대시보드 접근 시 온디맨드 계산 (24시간 캐시)
  → /api/protractor/overlap
    → DB 캐시 조회 (daily_overlap_insights, adset_overlap_cache)
    → 캐시 미스 → Meta API:
      → fetchActiveAdsets(accountId)
      → fetchPerAdsetReach(accountId, adsetIds, start, end)
      → fetchCombinedReach(accountId, adsetIds, start, end) — 전체 유니크 도달
      → pair별 조합 중복률 계산 (최대 6개 세트 → 15조합)
    → UPSERT daily_overlap_insights + adset_overlap_cache
```

**pairs 저장**: JSONB 배열 `[{adset_a_name, adset_b_name, campaign_a, campaign_b, overlap_rate}]`

## 4. 총가치각도기 데이터 조회 — JOIN/쿼리 구조

### 4.1 T3 총가치수준 점수 (/api/protractor/total-value)

```sql
-- 1단계: 사전계산 캐시 조회 (24시간 이내)
SELECT * FROM t3_scores_precomputed
WHERE account_id = ? AND period = ? AND computed_at >= ?
LIMIT 1;

-- 캐시 미스 시 실시간 계산:
-- 2단계: 원시 데이터 조회 (JOIN 없음, 단일 테이블 조회)
SELECT spend, impressions, reach, clicks, purchases, purchase_value,
       date, ad_id, adset_id, creative_type,
       video_p3s_rate, thruplay_rate, retention_rate,
       reactions_per_10k, comments_per_10k, shares_per_10k, saves_per_10k
FROM daily_ad_insights
WHERE account_id = ? AND date BETWEEN ? AND ?;

-- 3단계: 벤치마크 조회 (별도 쿼리, JOIN 아님)
SELECT * FROM benchmarks
WHERE creative_type IN (?, 'ALL')
  AND ranking_group IN ('ABOVE_AVERAGE', 'above_avg')
ORDER BY calculated_at DESC LIMIT 20;
```

**특징**: JOIN 없이 단일 테이블 조회 + 애플리케이션 레벨 계산 (t3-engine.ts)

### 4.2 관리자 상태 조회 (/api/admin/protractor/status)

```sql
-- 1단계: 캐시 조회
SELECT * FROM account_sync_status;  -- 1시간 TTL

-- 폴백: 4개 테이블 개별 조회 (JOIN 없음)
-- a. 계정 목록
SELECT id, account_id, account_name, mixpanel_project_id, mixpanel_board_id
FROM ad_accounts ORDER BY created_at DESC;

-- b. Meta 최신 수집 (3일 이내)
SELECT account_id, date, ad_id FROM daily_ad_insights
WHERE account_id IN (...) AND date >= ?;

-- c. Mixpanel 시크릿 유무
SELECT key_name FROM service_secrets
WHERE service = 'mixpanel' AND key_name IN ('secret_xxx', ...);

-- d. Mixpanel 최근 데이터 (7일 이내)
SELECT account_id, date FROM daily_mixpanel_insights
WHERE account_id IN (...) AND date >= ?;

-- → 애플리케이션 레벨에서 4개 결과 조합
```

### 4.3 인사이트 데이터 (/api/protractor/insights)

```sql
-- 집계 모드 우선
SELECT * FROM insights_aggregated_daily
WHERE account_id = ? AND date BETWEEN ? AND ?;

-- 폴백: raw 데이터
SELECT (26개 컬럼) FROM daily_ad_insights
WHERE account_id = ? AND date BETWEEN ? AND ?
ORDER BY date LIMIT 5000;
```

## 5. 발견된 데이터 누락/불일치 지점

### 5.1 [핫픽스 적용] Mixpanel 상태 판정 — 실시간 경로 secretSet 미사용 (심각도: HIGH)

- **위치**: `/api/admin/protractor/status/route.ts` line 118~168
- **증상**: 관리자 페이지에서 모든 계정 Mixpanel '미설정'
- **원인**: `secretSet` 구축 후 미참조. `hasProjectId`만 체크 → ad_accounts에 project_id 없으면 전부 not_configured
- **수정**: `secretSet.has(account_id)` 를 Mixpanel 설정 여부 판정에 포함
- **상태**: 1차 핫픽스 커밋 2d6ee36에서 수정 완료

### 5.1b [2차 핫픽스] sync-status-precompute 캐시 라이터 — 동일 버그 (심각도: **CRITICAL**)

- **위치**: `src/lib/precompute/sync-status-precompute.ts` line 62~83
- **증상**: 5.1 핫픽스 후에도 캐시 TTL(1시간) 내에는 여전히 전부 '미설정'
- **근본 원인**: `account_sync_status` 테이블에 Mixpanel 상태를 기록하는 **캐시 라이터**가 `service_secrets` 테이블을 전혀 조회하지 않음
  - `status/route.ts`(실시간 경로): `isConfigured = hasSecret || hasProjectId` ✅
  - `sync-status-precompute.ts`(캐시 라이터): `hasProjectId && hasBoardId` ❌
  - 캐시 라이터가 `hasBoardId` 까지 요구 → 대부분 계정은 board_id 미설정 → 캐시에 전부 "not_configured" 기록
  - 관리자 페이지가 캐시 우선 조회(1시간 TTL) → 잘못된 캐시 데이터 반환
- **수정**: precompute에서 `service_secrets` 조회 추가, 판정 로직을 실시간 경로와 동일하게 정렬:
  ```
  isConfigured = hasSecret || hasProjectId
  if (isConfigured && hasData) → "ok"
  else if (isConfigured && !hasData) → "no_board"
  else → "not_configured"
  ```
- **영향**: 이 수정으로 크론 실행 시 캐시에 정확한 Mixpanel 상태가 기록되어 관리자 페이지 상시 정상 표시

### 5.2 [핫픽스 적용] pairs JSONB 파싱 안전성 (심각도: HIGH)

- **위치**: `/api/protractor/overlap/route.ts` line 80, `OverlapAnalysis.tsx` line 168
- **증상**: 계정 선택 시 'A.filter is not a function' 크래시
- **원인**: DB에서 읽은 `row.pairs`가 문자열일 가능성 (JSONB 이중 직렬화 패턴)
- **수정**: `Array.isArray()` 가드 + `typeof === "string"` 파싱 폴백

### 5.3 [핫픽스 적용] total-value precomputed 캐시 JSON 파싱 (심각도: MEDIUM)

- **위치**: `/api/protractor/total-value/route.ts` line 126~137
- **증상**: T3 점수 precomputed 캐시에서 metrics_json/diagnostics_json이 문자열로 반환될 가능성
- **수정**: `typeof === "string"` 체크 후 `JSON.parse()` 적용

### 5.4 [미수정] Mixpanel 크론 수집 필터 불일치 (심각도: MEDIUM)

- **위치**: `/api/cron/collect-mixpanel/route.ts` line 38
- **현황**: `ad_accounts.mixpanel_project_id IS NOT NULL` 필터 사용
- **문제**: project_id가 ad_accounts에 없고 service_secrets에만 있으면 크론 수집 대상에서 제외
- **권장**: 크론 필터를 `service_secrets` JOIN 또는 `LEFT JOIN` 방식으로 변경, 또는 save-secret 시 ad_accounts.mixpanel_project_id도 함께 저장

### 5.5 [미수정] Mixpanel 시크릿과 project_id 이원화 (심각도: LOW)

- **현황**: save-secret은 service_secrets만 저장, 크론은 ad_accounts.mixpanel_project_id 필요
- **권장**: 온보딩 플로우에서 두 테이블 동기화 또는 single source of truth 통합

### 5.6 [정보] 비정규화 패턴 (NoSQL-like)

총가치각도기는 의도적으로 JOIN을 피하고 **비정규화 + 애플리케이션 레벨 조합** 패턴을 사용:

| 패턴 | 사용처 | 이유 |
|------|--------|------|
| 단일 테이블 full scan | daily_ad_insights | 계정당 최대 5000행, JOIN 불필요 |
| JSONB 배열 저장 | daily_overlap_insights.pairs | 조합별 데이터를 한 행에 저장 |
| 사전계산 캐시 테이블 | t3_scores_precomputed | T3 엔진 계산 비용 절감 (24시간 캐시) |
| 상태 캐시 테이블 | account_sync_status | 관리자 페이지 응답 속도 (1시간 TTL) |
| 4개 테이블 개별 조회 후 Map 조합 | status API | FK JOIN 대신 account_id 기준 Map 매칭 |

이 패턴 자체는 Supabase/서버리스 환경에서 합리적이지만, **테이블 간 데이터 일관성을 애플리케이션이 보장**해야 하므로 5.1~5.5 같은 불일치 발생 가능성이 있음.

## 6. 요약 및 권장 사항

| 구분 | 내용 | 긴급도 | 상태 |
|------|------|--------|------|
| ✅ 1차 핫픽스 | status/route.ts — secretSet 매칭 수정 | 즉시 | 완료 (2d6ee36) |
| ✅ 1차 핫픽스 | pairs/metrics JSON 파싱 안전성 | 즉시 | 완료 (2d6ee36) |
| ✅ 2차 핫픽스 | sync-status-precompute.ts — 캐시 라이터 동일 버그 수정 | 즉시 | 수정 중 |
| ✅ 2차 핫픽스 | filter 타입 안전성 전수 점검 | 즉시 | 수정 중 |
| ⚠️ 후속 | 크론 수집 필터 service_secrets 연동 | 이번 주 | 미착수 |
| ⚠️ 후속 | save-secret → ad_accounts.mixpanel_project_id 동기화 | 이번 주 | 미착수 |
| 📝 개선 | Mixpanel 설정 single source of truth 통합 | 다음 스프린트 | 미착수 |

## 7. 데이터 구조 정규화 평가

### 7.1 비정규화 수준 판정: 적정 (NoSQL-like 의도적 설계)

총가치각도기의 데이터 구조는 **완전 정규화(3NF)와 완전 비정규화(NoSQL) 사이의 실용적 중간 지점**:

| 항목 | 정규화 여부 | 판정 |
|------|------------|------|
| profiles ↔ ad_accounts | FK 정규화 (user_id) | ✅ 적정 |
| ad_accounts ↔ daily_ad_insights | account_id 소프트 참조 (FK 없음) | ⚠️ 의도적 — Supabase 서버리스 환경에서 CASCADE 회피 |
| daily_ad_insights 파생 지표 14개 | 동일 행에 비정규화 저장 | ✅ 적정 — 조회 성능 우선 |
| daily_overlap_insights.pairs | JSONB 배열 (비정규화) | ✅ 적정 — 조합 데이터를 별도 테이블로 분리하면 JOIN 비용 증가 |
| t3_scores_precomputed (캐시) | 계산 결과 스냅샷 | ✅ 적정 — CQRS 패턴 |
| account_sync_status (캐시) | 관리자 상태 스냅샷 | ⚠️ 캐시 라이터 로직 동기화 필수 (5.1b 참조) |

### 7.2 테이블 간 관계 무결성

```
ad_accounts.account_id (UNIQUE, 실질적 PK)
  ├── daily_ad_insights.account_id     — 소프트 참조, RLS로 보호
  ├── daily_mixpanel_insights.account_id — 소프트 참조
  ├── daily_overlap_insights.account_id  — 소프트 참조
  ├── service_secrets.key_name          — "secret_{account_id}" 패턴 (느슨)
  └── account_sync_status.account_id   — 캐시 테이블

creatives.account_id                   — 소프트 참조 (경쟁사 소재는 ad_accounts에 없음)
  ├── creative_media.creative_id       — FK CASCADE ✅
  ├── creative_performance.creative_id — FK CASCADE ✅
  └── creative_lp_map.creative_id      — FK CASCADE ✅
```

**결론**: 핵심 테이블(creatives 하위)은 FK CASCADE로 정규화됨. 성과 데이터(daily_*)는 의도적 소프트 참조로 서버리스 환경에 적합. 캐시 테이블의 로직 동기화가 유일한 구조적 위험.
