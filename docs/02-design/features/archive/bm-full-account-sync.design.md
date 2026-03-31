# BM Full Account Sync (비즈니스 매니저 전체 계정 데이터 수집 체계) — Design

> **Summary**: discover-accounts 정상화 + collect-daily 배치 확장 + creatives is_member 동적화로 BM 전체 ~150개 계정 데이터를 수집하는 설계
>
> **Project**: bscamp
> **Author**: PM팀
> **Date**: 2026-03-30
> **Status**: Draft
> **Planning Doc**: [bm-full-account-sync.plan.md](../01-plan/features/bm-full-account-sync.plan.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 150개 중 45개(30%)만 수집 → 벤치마크 모수 부족, 총가치각도기 정확도 저하 |
| **WHO** | Smith님(관리자), 수강생(~40명), 크론 시스템(자동 수집) |
| **RISK** | Meta API rate limit (150개 계정 * 일 4배치), collect-daily 실행시간 3분→10분+ |
| **SUCCESS** | ad_accounts 150개+ active, collect-daily가 전체 수집, 벤치마크 모수 3배 증가 |
| **SCOPE** | Phase 1: discover-accounts 점검/수정, Phase 2: collect-daily 배치 확장, Phase 3: creatives is_member 동적화 |

---

## 1. Overview

### 1.1 Design Goals

1. discover-accounts 크론이 BM 전체 계정을 안정적으로 발견하고 등록
2. collect-daily가 150개+ 계정을 rate limit 내에서 안전하게 수집
3. creatives 테이블의 is_member 값이 ad_accounts 실제 상태를 정확히 반영
4. 기존 코드 변경 최소화 (collection-v3 인프라 최대 활용)

### 1.2 Design Principles

- **최소 변경**: 아키텍처 재설계 없음. 기존 discover-accounts + collect-daily 구조 유지
- **데이터 정합성**: creatives.is_member가 ad_accounts.is_member와 항상 일치
- **안전한 확장**: rate limit 내에서 점진적 확장, 배치 구조 동적화

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| 기준 | Option A: 최소 변경 | Option B: BM API 전환 | Option C: 실용적 균형 |
|------|:-:|:-:|:-:|
| **접근** | /me/adaccounts 유지, 배치 수만 확장 | /{bm_id}/owned_ad_accounts + client_ad_accounts로 전환 | /me/adaccounts 유지 + 배치 동적화 + is_member 수정 |
| **신규 파일** | 0 | 1 (bm-sync 유틸) | 0 |
| **수정 파일** | 2 (collect-daily, discover-accounts) | 3 (collect-daily, discover-accounts, 신규 유틸) | 2 (collect-daily, discover-accounts) |
| **복잡도** | Low | High | Medium |
| **유지보수성** | Medium (배치 하드코딩) | High (BM 구조 명시적) | High (동적 배치) |
| **노력** | Low | High | Medium |
| **리스크** | Low (/me/adaccounts가 전체를 반환한다는 전제) | Medium (API 변경 범위 큼) | Low |
| **추천** | 빠른 적용 | BM API가 더 완전한 목록 반환 시 | **기본 선택** |

**선택**: Option C (실용적 균형) — **이유**: /me/adaccounts가 BM 전체를 반환하는 것이 확인되면 API 변경 불필요. 배치 구조 동적화와 is_member 수정만으로 목표 달성 가능. 만약 /me/adaccounts가 부족하면 Option B로 전환하는 fallback 계획 포함.

### 2.1 Component Diagram

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│ Cloud Scheduler  │────▶│ discover-accounts │────▶│ ad_accounts │
│ (주 1회)         │     │ /me/adaccounts    │     │ UPSERT      │
└─────────────────┘     └──────────────────┘     └──────┬──────┘
                                                        │
┌─────────────────┐     ┌──────────────────┐           │ active=true 전체
│ Cloud Scheduler  │────▶│ collect-daily     │◀──────────┘
│ (매일 N배치)     │     │ batch 1~N        │
└─────────────────┘     └────────┬─────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
             ┌──────────┐ ┌──────────┐ ┌──────────────┐
             │daily_ad_  │ │creatives │ │creative_media│
             │insights   │ │(is_member│ │              │
             │           │ │ 동적)    │ │              │
             └──────────┘ └──────────┘ └──────────────┘
```

### 2.2 Data Flow

```
[주 1회] discover-accounts
  → Meta API: GET /me/adaccounts (전체 계정 목록)
  → 각 계정 90일 impressions 체크
  → ad_accounts UPSERT (신규: is_member=false, active=true)
  → API 응답에 없는 계정: active=false

[매일 N배치] collect-daily
  → ad_accounts WHERE active=true 조회 (150개+)
  → 동적 배치 분할 (BATCH_SIZE 기반)
  → 배치별 Meta API 호출 (fetchAccountAds)
  → daily_ad_insights UPSERT
  → creatives UPSERT (is_member: ad_accounts에서 조회)
  → creative_media UPSERT
  → pipeline chain → process-media
```

---

## 3. Data Model

### 3.1 ad_accounts (변경 없음, 현행 확인)

```sql
-- 이미 collection-v3에서 추가된 컬럼들 (스키마 변경 불필요)
-- is_member BOOLEAN DEFAULT false
-- discovered_at TIMESTAMPTZ DEFAULT now()
-- last_checked_at TIMESTAMPTZ
-- currency TEXT
-- account_status INT
-- meta_status TEXT  (permission_denied 등)
```

**데이터 변화:**
| 항목 | Before | After |
|------|--------|-------|
| 총 행 수 | ~45 | ~150+ |
| active=true | ~41 | ~120-140 |
| is_member=true | ~41 | ~41 (변동 없음) |
| is_member=false | ~4 | ~100+ |

### 3.2 creatives (is_member 값 변경)

```
현재: collect-daily가 모든 소재를 is_member=true로 하드코딩
변경: ad_accounts.is_member 값을 조회하여 동적 설정
```

**영향 범위:**
- 기존 45개 수강생 계정 소재: is_member=true (변동 없음)
- 신규 105개 비수강생 계정 소재: is_member=false (새로 수집됨)

### 3.3 TypeScript 타입 참고

`src/types/database.ts`의 `ad_accounts` Row 타입에 `is_member`, `discovered_at`, `last_checked_at`, `currency`, `account_status` 컬럼이 없음 (타입 재생성 필요). 현재 코드는 `(svc as any)`로 우회 중.

---

## 4. API Specification

### 4.1 discover-accounts (수정 사항)

**현행 방식 유지**: `GET /me/adaccounts`

```
위치: src/app/api/cron/discover-accounts/route.ts
주기: 주 1회 월요일
인증: CRON_SECRET
```

**수정 포인트:**

1. **동작 확인 우선**: Cloud Scheduler 등록 여부, cron_runs 최근 로그 확인
2. **BM 전체 포함 여부 검증**: /me/adaccounts 응답이 150개+ 반환하는지 확인
3. **Fallback (필요 시)**: `/me/adaccounts`가 부족하면 아래 BM API로 전환

```typescript
// Fallback: BM 기반 조회 (Option B)
// GET /{business_id}/owned_ad_accounts?fields=account_id,name,account_status,currency&limit=500
// + GET /{business_id}/client_ad_accounts?fields=... (광고대행사가 관리하는 계정)
// BUSINESS_ID는 환경변수로 관리
```

**Rate limit 대응:**
- 계정간 200ms 딜레이 (현행 유지)
- 90일 impressions 체크: 계정당 1회 API 호출
- 총 API 호출: ~150 (목록) + ~150 (impressions) = ~300회/주

### 4.2 collect-daily 배치 확장

**현행:**
```
batch 1~4, BATCH_SIZE=10, 최대 40계정 (batch 4는 나머지 전부)
```

**변경:**
```
batch 1~N, BATCH_SIZE=20, 동적 배치 수
- 150개 계정: ceil(150/20) = 8배치
- Cloud Scheduler: 8개 크론 잡 또는 batch 파라미터 동적화
```

**구현 방안 2가지:**

#### 방안 A: Cloud Scheduler 배치 수 확대 (추천)

```
기존: 4개 스케줄 (batch=1, 2, 3, 4)
변경: batch 파라미터 없이 단일 호출, 내부에서 자동 분할

또는: batch=1~8 (20계정씩), 5분 간격 분산 실행
```

#### 방안 B: 내부 자동 분할 (batch 파라미터 제거)

```typescript
// collect-daily 내부에서 전체 계정을 CONCURRENCY=5로 처리
// batch 파라미터는 하위 호환 유지하되, 없으면 전체 처리
// Cloud Run 최대 실행시간: 300s (5분)
// 150계정 * 평균 2s/계정 = 300s → 경계선
// → CONCURRENCY=5이면 150/5 * 2s = 60s (안전)
```

**추천: 방안 B** — batch 파라미터 없이 단일 크론으로 전체 처리. CONCURRENCY=5 병렬처리로 60초 내 완료 가능. 기존 batch 파라미터는 하위 호환 유지.

### 4.3 collect-daily creatives is_member 동적화

**현행 코드 (route.ts:182-183):**
```typescript
source: "member",
is_member: true,
```

**변경:**
```typescript
// 수집 시작 전 ad_accounts의 is_member 맵 조회
const { data: memberMap } = await svc
  .from("ad_accounts")
  .select("account_id, is_member")
  .eq("active", true);

const isMemberMap = new Map(
  (memberMap ?? []).map((a: any) => [a.account_id, a.is_member ?? false])
);

// creatives UPSERT 시
const isMember = isMemberMap.get(account.account_id) ?? false;
return {
  // ...
  source: isMember ? "member" : "discovered",
  is_member: isMember,
  // ...
};
```

---

## 5. UI/UX Design

해당 없음 — 백엔드 크론 변경만. 프론트엔드 변경 없음.

**단, 주의사항:**
- 총가치각도기 계정 셀렉터: `user_id` 필터로 수강생 본인 계정만 노출 (변경 불필요)
- 벤치마크 쿼리: 전체 계정 집계 (is_member 무관) → 데이터 증가로 정확도 향상
- 소재 목록: 수강생은 본인 계정(user_id) 소재만 조회 → 비수강생 소재 미노출

---

## 6. Error Handling

### 6.1 discover-accounts

| 상황 | 처리 |
|------|------|
| /me/adaccounts 오류 | 전체 실패 → cron_runs에 error 기록, 다음 주 재시도 |
| 90일 impressions 체크 실패 | 해당 계정 활성으로 간주 (보수적) |
| UPSERT 실패 | 개별 계정 로그 후 계속 진행 |

### 6.2 collect-daily

| 상황 | 처리 |
|------|------|
| Meta API 429 | fetchMetaWithRetry: 3초→6초 백오프, 최대 2회 재시도 |
| 계정 권한 없음 | meta_status='permission_denied' 마킹 + 스킵 (현행 유지) |
| 단일 계정 수집 실패 | Promise.allSettled로 격리, 다른 계정 영향 없음 |
| Cloud Run 타임아웃 (300s) | 단일 크론 방식 시 150개 계정 CONCURRENCY=5로 60s 예상 → 안전 |

---

## 7. Security Considerations

- [ ] 비수강생 계정 데이터 접근 제어: user_id 기반 RLS로 수강생은 본인 계정만 조회 (기존 정책 유지)
- [ ] 비수강생 데이터 벤치마크 활용: 익명 집계만 (개별 계정 성과 미노출)
- [ ] Meta API 토큰: 기존 META_ACCESS_TOKEN 사용 (변경 없음)
- [ ] CRON_SECRET 인증: 기존 방식 유지

---

## 8. Test Plan (TDD)

### 8.1 테스트 범위

| 타입 | 대상 | 도구 |
|------|------|------|
| Unit Test | collect-daily 배치 분할 로직 | vitest |
| Unit Test | is_member 동적 판단 로직 | vitest |
| Unit Test | discover-accounts 계정 UPSERT 로직 | vitest |
| Integration Test | 전체 수집 플로우 (mock Meta API) | vitest |

### 8.2 테스트 파일 구조

```
__tests__/bm-full-account-sync/
├── collect-daily-batch.test.ts     # 배치 분할 로직
├── is-member-dynamic.test.ts       # is_member 동적 판단
├── discover-accounts.test.ts       # 계정 발견 + UPSERT
└── fixtures/
    ├── meta-adaccounts-response.json  # /me/adaccounts 응답 mock
    ├── meta-ads-response.json         # /ads 응답 mock
    └── ad-accounts-db.json            # DB ad_accounts mock
```

### 8.3 핵심 테스트 케이스

```typescript
// 1. 배치 분할: 150개 계정을 20개씩 분할
describe("collect-daily batch splitting", () => {
  it("150개 계정을 8개 배치로 분할", () => {
    const accounts = Array.from({ length: 150 }, (_, i) => ({ account_id: `${i}`, account_name: `acc-${i}` }));
    const batches = splitIntoBatches(accounts, 20);
    expect(batches).toHaveLength(8);
    expect(batches[7]).toHaveLength(10); // 마지막 배치 나머지
  });
});

// 2. is_member 동적 판단
describe("creatives is_member", () => {
  it("ad_accounts.is_member=true → creatives.is_member=true", () => {
    const isMemberMap = new Map([["12345", true]]);
    expect(getIsMember(isMemberMap, "12345")).toBe(true);
  });
  it("ad_accounts.is_member=false → creatives.is_member=false", () => {
    const isMemberMap = new Map([["67890", false]]);
    expect(getIsMember(isMemberMap, "67890")).toBe(false);
  });
  it("ad_accounts에 없는 계정 → is_member=false (기본값)", () => {
    const isMemberMap = new Map();
    expect(getIsMember(isMemberMap, "99999")).toBe(false);
  });
});

// 3. discover-accounts: 기존 is_member=true 보존
describe("discover-accounts upsert", () => {
  it("기존 is_member=true 계정은 discover가 false로 덮어쓰지 않음", () => {
    // discover-accounts는 신규 계정만 is_member=false로 INSERT
    // 기존 계정은 account_name, account_status 등만 UPDATE
    // is_member는 UPDATE 대상에 포함되지 않음
  });
});
```

---

## 9. Implementation Guide

### 9.1 수정 파일 목록

| 파일 | 변경 내용 | Wave |
|------|-----------|------|
| `src/app/api/cron/discover-accounts/route.ts` | 동작 점검, 필요 시 BM API fallback 추가 | Wave 1 |
| `src/app/api/cron/collect-daily/route.ts` | 배치 동적화 + creatives is_member 동적화 | Wave 2 |
| `__tests__/bm-full-account-sync/*.test.ts` | TDD 테스트 파일 (신규) | Wave 1 |

### 9.2 Implementation Order (Wave 패턴)

#### Wave 1: 진단 + TDD Red (Day 1)

```
1. [ ] discover-accounts 동작 확인
   - Cloud Scheduler에 등록되어 있는가?
   - cron_runs 테이블에서 최근 실행 로그 확인
   - 수동 실행: curl /api/cron/discover-accounts → 몇 개 계정 반환되는지 확인
   - 반환 계정 수가 150개 미만이면 원인 분석

2. [ ] TDD 테스트 파일 작성 (Red)
   - __tests__/bm-full-account-sync/ 디렉토리 생성
   - 3개 테스트 파일 작성
   - npx vitest run __tests__/bm-full-account-sync/ → 전부 실패 확인
```

#### Wave 2: collect-daily 수정 + Green (Day 1~2)

```
3. [ ] collect-daily 배치 동적화
   - BATCH_SIZE를 환경변수 또는 상수로 분리
   - batch 파라미터 없이 호출 시 전체 계정 처리 로직
   - batch 파라미터 있으면 하위 호환 유지

4. [ ] creatives is_member 동적화
   - runCollectDaily 함수 시작 시 is_member 맵 조회
   - collectAccount 함수에 isMemberMap 전달
   - creatives UPSERT 시 동적 값 사용

5. [ ] TDD Green 확인
   - npx vitest run → 전부 통과
```

#### Wave 3: 검증 (Day 2)

```
6. [ ] discover-accounts 수동 실행 + 결과 확인
7. [ ] collect-daily 수동 실행 (단일 계정 테스트)
8. [ ] tsc + build 통과
9. [ ] Gap 분석 (Match Rate 90%+)
```

### 9.3 Session Guide

| Module | Scope Key | Description | 예상 턴 |
|--------|-----------|-------------|:-------:|
| 진단 + TDD | `module-1` | discover-accounts 점검 + 테스트 작성 | 20-30 |
| collect-daily 수정 | `module-2` | 배치 확장 + is_member 동적화 + Green | 30-40 |
| 검증 + 커밋 | `module-3` | 수동 테스트 + tsc + build + Gap | 15-20 |

#### Recommended Session Plan

| Session | Phase | Scope | Turns |
|---------|-------|-------|:-----:|
| Session 1 | Plan + Design | 전체 | 30-35 (현재 세션) |
| Session 2 | Do | `--scope module-1,module-2` | 40-50 |
| Session 3 | Do + Check | `--scope module-3` | 30-40 |

---

## 10. discover-accounts vs /{business_id} Fallback 설계

discover-accounts가 /me/adaccounts로 150개 미만을 반환하는 경우의 fallback.

### 10.1 원인 가능성

1. **토큰 유형**: System User 토큰이 아닌 개인 User 토큰 → 본인 접근 가능 계정만 반환
2. **BM 권한**: 일부 client_ad_accounts가 /me/adaccounts에 포함 안 됨
3. **account_status**: 비활성 계정은 목록에서 제외될 수 있음

### 10.2 Fallback 방안: BM API

```typescript
// 환경변수: META_BUSINESS_ID
const businessId = process.env.META_BUSINESS_ID;

// 1. owned_ad_accounts (BM이 소유한 계정)
const ownedUrl = `https://graph.facebook.com/v21.0/${businessId}/owned_ad_accounts?fields=account_id,name,account_status,currency&limit=500&access_token=${token}`;

// 2. client_ad_accounts (BM이 관리하는 외부 계정)
const clientUrl = `https://graph.facebook.com/v21.0/${businessId}/client_ad_accounts?fields=account_id,name,account_status,currency&limit=500&access_token=${token}`;

// 두 응답 합쳐서 중복 제거
const allAccounts = [...ownedAccounts, ...clientAccounts];
const uniqueAccounts = [...new Map(allAccounts.map(a => [a.account_id, a])).values()];
```

### 10.3 전환 조건

- /me/adaccounts 응답이 100개 미만이면 BM API로 전환 시도
- META_BUSINESS_ID 환경변수가 설정되어 있으면 BM API 우선 사용
- 두 API 모두 호출하여 더 많은 결과 사용하는 adaptive 방식도 가능

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-30 | 초안 작성 | PM팀 |
