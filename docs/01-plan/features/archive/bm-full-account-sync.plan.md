# BM Full Account Sync (비즈니스 매니저 전체 계정 데이터 수집 체계) — Plan

> **Summary**: 비즈니스 매니저에 등록된 ~150개 광고계정 전체의 광고 데이터를 수집하여 벤치마크 모수를 확보하고, 수강생은 자기 계정 데이터만 조회하는 데이터 레이크 구조를 완성한다.
>
> **Project**: bscamp
> **Author**: PM팀
> **Date**: 2026-03-30
> **Status**: Draft
> **프로세스 레벨**: L2 (src/ 수정 포함, DB 스키마 변경 없음)

---

## Executive Summary

| 관점 | 내용 |
|------|------|
| **문제** | BM에 150개 광고계정이 있지만 수강생 직접 등록 45개만 수집 중 → 벤치마크 모수 30%만 확보, 업종별 비교 불가 |
| **솔루션** | discover-accounts 크론 정상화 + collect-daily 배치 확장 + creatives is_member 동적 판단으로 150개 전체 수집 |
| **기능/UX 효과** | 벤치마크 정확도 3배 향상, 수강생 계정 등록 없이도 자동 데이터 축적, 업종별 비교 기반 마련 |
| **핵심 가치** | "모든 데이터를 먼저 수집 → 벤치마크/분석 축적 → 수강생은 자기 것만 꺼내 쓰는" 원래 설계 의도 실현 |

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

### 1.1 Purpose

비즈니스 매니저에 등록된 전체 광고계정(~150개)의 광고 콘텐츠와 성과 데이터를 수집하여:
1. 벤치마크 모수를 45개 → 150개로 3배 확보
2. 수강생 등록 없이도 데이터가 자동 축적되는 데이터 레이크 구조 완성
3. 향후 업종별/카테고리별 비교 분석의 기반 마련

### 1.2 Background

Smith님의 원래 설계 의도는 **"모든 데이터를 먼저 수집 → 벤치마크/분석 데이터 축적 → 수강생은 자기 계정 데이터만 꺼내 쓰는 구조"**(NoSQL식 데이터 레이크). 현재는 수강생이 온보딩에서 직접 광고계정 ID를 입력해야만 ad_accounts에 등록되고, collect-daily가 그 계정만 수집한다. 이 때문에:

- 150개 중 45개(30%)만 데이터가 있음
- 105개 계정의 광고 소재/성과 데이터가 아예 없음
- 총가치각도기 벤치마크 정확도가 실제 모집단 대비 낮음

**이미 구현된 인프라:**
- `discover-accounts` 크론: `/me/adaccounts`로 전체 계정 발견 → `is_member=false`로 UPSERT (collection-v3에서 구현)
- `ad_accounts.is_member` 컬럼: 수강생/비수강생 구분
- `collect-daily`: `active=true` 전체 수집 (is_member 무관)
- 하위 테이블 전부 `account_id` FK로 종속 (ADR-001)

### 1.3 Related Documents

- ADR-001: 계정 종속 구조 (`docs/adr/ADR-001-account-ownership.md`)
- ADR-002: 서비스 맥락 (`docs/adr/ADR-002-service-context.md`)
- Collection v3 Plan/Design (`docs/01-plan/features/collection-v3.plan.md`, `docs/02-design/features/collection-v3.design.md`)

---

## 2. Scope

### 2.1 In Scope

- [ ] discover-accounts 크론 동작 점검 및 문제 수정 (현재 45개밖에 없는 원인 분석)
- [ ] collect-daily 배치 구조 확장 (4배치 * 10계정 = 40개 → 150개+ 지원)
- [ ] creatives 테이블 is_member 하드코딩(true) → ad_accounts에서 동적 조회로 변경
- [ ] collect-daily 권한 체크(checkMetaPermission) 최적화 (150개 직렬 체크 → 병렬화)
- [ ] 비수강생 계정 데이터 벤치마크 활용 방안 명시

### 2.2 Out of Scope

- 프론트엔드 UI 변경 (계정 셀렉터, 벤치마크 대시보드는 별도 TASK)
- ad_accounts DB 스키마 변경 (이미 collection-v3에서 완료)
- 과거 데이터 백필 (backfill 크론은 별도 운영)
- 비수강생 데이터의 개별 노출 정책 (별도 기획)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | 요구사항 | 우선순위 | 상태 |
|----|----------|----------|------|
| FR-01 | discover-accounts가 BM 전체 ~150개 계정을 ad_accounts에 등록 | High | 점검 필요 |
| FR-02 | collect-daily가 active=true 전체 계정(150개+) 데이터 수집 | High | 배치 확장 |
| FR-03 | creatives.is_member가 ad_accounts.is_member 값을 동적 반영 | Medium | 수정 필요 |
| FR-04 | 비수강생 계정(is_member=false)의 데이터가 벤치마크 집계에 포함 | High | 검증 필요 |
| FR-05 | discover-accounts 주 1회 → 신규 계정 자동 발견 + active 상태 갱신 | Medium | 동작 확인 |

### 3.2 Non-Functional Requirements

| 카테고리 | 기준 | 측정 방법 |
|----------|------|-----------|
| 성능 | collect-daily 전체 실행시간 15분 이내 | Cloud Run 로그 |
| 안정성 | Meta API 429 에러 시 자동 재시도 + 백오프 | fetchMetaWithRetry 로그 |
| 비용 | API 호출량 3배 증가 대비 Cloud Run 비용 월 $5 이내 추가 | GCP 빌링 |
| 확장성 | 200개 계정까지 배치 구조 확장 가능 | 배치 파라미터 동적화 |

---

## 4. Success Criteria

### 4.1 테스트 시나리오

#### Happy Path
- [ ] discover-accounts 실행 → ad_accounts에 140개+ 계정 등록 (active=true)
- [ ] collect-daily batch 1~N 순차 실행 → 전체 active 계정 수집 완료
- [ ] creatives 테이블에 비수강생 계정(is_member=false) 소재 데이터 존재
- [ ] daily_ad_insights에 비수강생 계정 성과 데이터 존재
- [ ] 벤치마크 쿼리에서 전체 계정 데이터 집계됨

#### Edge Cases (P0)
- [ ] Meta API 429 → 자동 재시도 후 정상 수집
- [ ] 계정 권한 없음 → meta_status='permission_denied' 마킹 후 스킵
- [ ] 90일 impressions=0 계정 → active=false 처리 (수집 제외)

#### Edge Cases (P1)
- [ ] 수강생이 비수강생 계정을 온보딩에서 등록 → is_member=true로 업데이트
- [ ] discover-accounts에서 사라진 계정 → active=false 처리

### 4.2 Quality Criteria

- [ ] `npx tsc --noEmit` 통과
- [ ] `npm run build` 성공
- [ ] 기존 collect-daily 동작 깨지지 않음
- [ ] 기존 backfill 엔드포인트 정상 동작

---

## 5. Risks and Mitigation

| 리스크 | 영향 | 가능성 | 대응 |
|--------|------|--------|------|
| Meta API rate limit (150개 계정 동시 수집) | High | Medium | 배치 분할 + 계정간 200ms 딜레이 + CONCURRENCY=5 유지 |
| collect-daily 실행시간 10분+ → Cloud Run 타임아웃 | Medium | Medium | 배치 수 확대 (4→8+), Cloud Scheduler 배치별 시간 분산 |
| discover-accounts가 /me/adaccounts로 BM 전체를 못 가져오는 경우 | High | Low | 원인 분석: 토큰 권한/BM ID 기반 조회로 전환 검토 |
| 비수강생 데이터 포함 시 벤치마크 왜곡 | Medium | Low | is_member 필터로 수강생/전체 벤치마크 분리 가능 |
| TypeScript 타입 파일 미반영 (is_member 등) | Low | High | database.ts 타입 재생성 또는 as any 유지 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| 리소스 | 타입 | 변경 내용 |
|--------|------|-----------|
| `collect-daily/route.ts` | API | 배치 구조 확장 (10계정/배치 → 동적), creatives is_member 동적화 |
| `discover-accounts/route.ts` | API | 동작 점검, 필요 시 /me/adaccounts → /{business_id}/owned_ad_accounts 전환 |
| `collect-daily-utils.ts` | Lib | 변경 없음 (fetchAccountAds는 이미 범용) |
| `ad_accounts` | DB Table | 데이터만 증가 (스키마 변경 없음) |
| `creatives` | DB Table | is_member 값이 동적으로 변경됨 |

### 6.2 Current Consumers

| 리소스 | 오퍼레이션 | 코드 경로 | 영향 |
|--------|-----------|-----------|------|
| `ad_accounts` | READ | `collect-daily/route.ts` → `svc.from("ad_accounts").select().eq("active", true)` | 데이터 증가 (45→150), 정상 |
| `ad_accounts` | READ | 총가치각도기 대시보드 → 계정 셀렉터 | 비수강생 계정 노출 여부 확인 필요 |
| `ad_accounts` | WRITE | `onboarding.ts` → `saveAdAccount()` | 영향 없음 (is_member 유지) |
| `ad_accounts` | WRITE | `discover-accounts/route.ts` → UPSERT | 핵심 변경 대상 |
| `creatives` | READ | 총가치각도기 소재 목록 | is_member=false 소재 노출 여부 확인 필요 |
| `creatives` | WRITE | `collect-daily/route.ts` → UPSERT | is_member 하드코딩 수정 대상 |
| `daily_ad_insights` | READ | 벤치마크 쿼리 | 데이터 3배 증가, 정상 |
| `daily_ad_insights` | WRITE | `collect-daily/route.ts` → UPSERT | 데이터 증가, 정상 |

### 6.3 Verification

- [ ] 총가치각도기 계정 셀렉터가 비수강생 계정을 노출하지 않는지 확인 (user_id 필터)
- [ ] 벤치마크 쿼리가 전체 계정 데이터를 정상 집계하는지 확인
- [ ] 프론트 소재 목록에서 비수강생 소재가 노출되지 않는지 확인 (user_id/is_member 필터)

---

## 7. Architecture Considerations

### 7.1 프로세스 레벨: L2

| 근거 | 판단 |
|------|------|
| src/ 코드 수정 | collect-daily, discover-accounts |
| DB 스키마 변경 | 없음 (이미 collection-v3에서 완료) |
| Auth/인프라 변경 | 없음 |
| 결론 | **L2 (표준)** — Plan + Design 필수, TDD 적용 |

### 7.2 Key Architectural Decisions

| 결정 | 선택지 | 선택 | 이유 |
|------|--------|------|------|
| 계정 발견 방식 | /me/adaccounts vs /{bm_id}/owned_ad_accounts | 현행 /me/adaccounts 점검 후 판단 | 이미 구현됨, 동작 여부 먼저 확인 |
| 배치 전략 | 고정 4배치 vs 동적 배치 | 동적 배치 (계정수/배치크기) | 150개+ 확장 대응 |
| 비수강생 데이터 활용 | 벤치마크만 vs 개별 노출 | 벤치마크 집계만 (익명) | Smith님 결정 대기, 우선 안전하게 |

---

## 8. 현재 코드 분석 요약

### 8.1 discover-accounts (이미 구현됨)

```
위치: src/app/api/cron/discover-accounts/route.ts
주기: 주 1회 월요일
방식: GET /me/adaccounts → 90일 impressions 체크 → ad_accounts UPSERT
현황: collection-v3에서 구현 완료, 실제 동작 여부 미확인
```

**확인 필요 사항:**
1. Cloud Scheduler에 등록되어 있는가?
2. 마지막 실행 시간 (cron_runs 테이블)?
3. `/me/adaccounts`가 BM 전체 계정을 반환하는가? (토큰 권한 문제 가능성)

### 8.2 collect-daily (수정 필요)

```
위치: src/app/api/cron/collect-daily/route.ts
주기: 매일 4회 배치 (batch 1~4, 각 10계정)
현재 용량: 4 * 10 = 40계정 (batch 4는 나머지 전부)
필요 용량: 150계정+
```

**수정 사항:**
1. BATCH_SIZE / 배치 수 동적화 (150계정 대응)
2. creatives UPSERT 시 `is_member: true` 하드코딩 → ad_accounts 조회로 변경

### 8.3 onboarding.ts (수정 불필요)

- 수강생 계정 등록 시 is_member=true는 이미 동작 중
- discover-accounts가 먼저 is_member=false로 등록한 계정을, onboarding에서 is_member=true + user_id 연결하는 흐름은 정상

---

## 9. Next Steps

1. [ ] Design 문서 작성 (`bm-full-account-sync.design.md`)
2. [ ] CTO팀 핸드오프 — 구현 진행
3. [ ] discover-accounts 실제 동작 확인 (Cloud Scheduler + cron_runs 로그)
4. [ ] collect-daily 배치 확장 구현
5. [ ] creatives is_member 동적화 구현
6. [ ] TDD 테스트 작성 + 검증

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-30 | 초안 작성 | PM팀 |
