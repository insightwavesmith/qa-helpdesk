# 5개 필드 전수조사 보고서

> 작성일: 2026-03-01
> 범위: account_id, account_name, mixpanel_project_id, mixpanel_secret, mixpanel_board_id

---

## 1. 저장소 매핑

| 필드 | ad_accounts | profiles (레거시) | service_secrets | 비고 |
|------|:-----------:|:-----------------:|:---------------:|------|
| account_id | ✅ PRIMARY | `meta_account_id` (대표 1개) | key_name에 포함 | 이중 저장 |
| account_name | ✅ PRIMARY | ✗ | ✗ | 정상 |
| mixpanel_project_id | ✅ | ⚠️ 중복 | ✗ | 이중 저장 |
| mixpanel_board_id | ✅ | ⚠️ 중복 | ✗ | 이중 저장 |
| mixpanel_secret | ✗ | ⚠️ **평문** | ✅ 암호화 | 이중 저장 + 보안 위험 |

**Single Source of Truth 아님** — ad_accounts와 profiles 양쪽에 중복 저장

---

## 2. key_name 패턴 일관성 (service_secrets)

| 파일 | 라인 | 용도 | 패턴 |
|------|------|------|------|
| `actions/onboarding.ts` | L36,147,202,262,320 | save/sync/add/update/remove | `secret_${metaAccountId}` |
| `actions/admin.ts` | L457,486,521 | add/update/delete | `secret_${data.accountId}` |
| `api/protractor/save-secret/route.ts` | L36 | POST 저장 | `secret_${metaAccountId}` |
| `api/protractor/accounts/route.ts` | L58 | DELETE 삭제 | `secret_${account_id}` |
| `api/cron/collect-mixpanel/route.ts` | L146 | 크론 조회 | `secret_${accountId}` |
| `api/admin/protractor/status/route.ts` | L63 | 상태 조회 | `secret_${id}` → **`secret_act_${id}`로 수정됨 (미확정)** |

**결론:** 코드 9곳 전부 `secret_${account_id}` 패턴. status/route.ts만 `secret_act_`로 수정된 상태 → **DB 확인 후 확정 필요**

---

## 3. 저장 경로 (Write)

| 경로 | 함수 | 저장 테이블 | 5필드 |
|------|------|-----------|-------|
| 온보딩 Step2 | `onboarding.ts:saveAdAccount` | profiles + ad_accounts + service_secrets | 5개 전부 |
| 설정 동기화 | `onboarding.ts:syncAdAccount` | profiles + ad_accounts + service_secrets | 5개 전부 |
| 계정 추가 | `onboarding.ts:addAdAccount` | ad_accounts + service_secrets | 5개 전부 |
| 계정 편집 | `onboarding.ts:updateAdAccount` | ad_accounts + service_secrets | 5개 전부 |
| 관리자 추가 | `admin.ts:addAdAccount` | ad_accounts + service_secrets | 5개 전부 |
| 관리자 편집 | `admin.ts:updateAdAccount` | ad_accounts + service_secrets | 5개 전부 |
| Secret API | `save-secret/route.ts` | service_secrets | secret만 |

---

## 4. 조회 경로 (Read)

| 경로 | 조회 테이블 | 용도 |
|------|-----------|------|
| 온보딩 페이지 | profiles | 기존값 표시 |
| 설정 페이지 | profiles + ad_accounts | 프로필 + 계정 목록 |
| 관리자 멤버상세 | profiles + ad_accounts | 멤버별 계정 관리 |
| 관리자 계정관리 | ad_accounts | 전체 계정 목록 |
| 총가치각도기 | ad_accounts | 계정 선택 드롭다운 |
| 크론 collect-mixpanel | ad_accounts → service_secrets → profiles(fallback) | 시크릿 조회 |
| 관리자 status | ad_accounts + service_secrets | 연동 상태 확인 |

---

## 5. 표시 경로 (UI 폼 노출 여부)

| 페이지 | account_id | account_name | mp_project_id | mp_secret | mp_board_id |
|--------|:----------:|:------------:|:-------------:|:---------:|:-----------:|
| 온보딩 | ✅ 입력 | ✗ 미노출 | ✅ 입력 | ✅ 입력 | ✅ 입력 |
| 설정 페이지 | ✅ 표시+편집 | ✅ 표시+편집 | ✅ 표시+편집 | ❓ 확인필요 | ✅ 표시+편집 |
| 관리자 멤버상세 | ✅ 표시+편집 | ✅ 표시+편집 | ✅ 표시+편집 | ❓ 확인필요 | ✅ 표시+편집 |
| 관리자 계정관리 | ✅ 표시 | ✅ 표시+편집 | ❓ 확인필요 | ✗ | ❓ 확인필요 |
| 총가치각도기 | ✅ 드롭다운 | ✅ 드롭다운 | ✗ | ✗ | ✗ |

---

## 6. 발견된 문제점

| # | 문제 | 심각도 | 상세 |
|---|------|--------|------|
| P1 | 이중 저장 (profiles ↔ ad_accounts) | 중 | mixpanel_project_id, mixpanel_board_id 양쪽 저장, 어느 쪽이 최신인지 보장 없음 |
| P2 | 시크릿키 평문 저장 | 높음 | profiles.mixpanel_secret_key 평문, service_secrets는 암호화 |
| P3 | status/route.ts 패턴 불확실 | 중 | `secret_act_`로 수정했으나 DB 확인 전 정확성 불확실 |
| P4 | 온보딩에서 account_name 미입력 | 낮음 | null로 저장, 설정에서 편집 가능 |

---

## 7. Smith님 확인 필요

```sql
-- 1. service_secrets 실제 key_name 패턴
SELECT key_name FROM service_secrets WHERE service='mixpanel' LIMIT 5;

-- 2. ad_accounts.account_id에 act_ 접두사 포함 여부
SELECT account_id FROM ad_accounts LIMIT 5;
```

이 결과에 따라:
- account_id = `act_123...` → `secret_${account_id}` = `secret_act_123...` (자동) → status/route.ts 원복
- account_id = `123...` + key_name = `secret_act_123...` → 저장 측 9곳 전부 수정 필요

---

## 8. 권장 조치

| 우선순위 | 조치 | 대상 |
|---------|------|------|
| 즉시 | DB 확인 후 key_name 패턴 확정 | status/route.ts |
| 중기 | profiles 레거시 필드 → ad_accounts 일원화 | onboarding.ts, settings |
| 중기 | profiles.mixpanel_secret_key 컬럼 삭제 | DB 마이그레이션 |
| 장기 | collect-mixpanel profiles fallback 제거 | collect-mixpanel/route.ts |
