# Mixpanel 미연동 원인 분석

> 작성일: 2026-03-30 | TASK: protractor-data-fix

## 결론

Mixpanel 데이터 수집 코드는 **완전히 구현되어 있으나**, 실제 동작하려면 3가지 조건이 모두 충족되어야 한다:
1. `ad_accounts.mixpanel_project_id`가 NOT NULL
2. `service_secrets` 또는 `profiles.mixpanel_secret_key`에 시크릿키 존재
3. Cloud Scheduler에 `collect-mixpanel` 크론 잡 등록

**현재 상태**: 대부분의 계정에 mixpanel_project_id가 미설정 → 크론이 돌아도 "연동 계정 없음"으로 스킵.

---

## 1. 설정 페이지 Mixpanel UI

**파일**: `src/app/(main)/settings/settings-form.tsx`

- 광고계정 추가/수정 시 3개 필드 노출:
  - 믹스패널 프로젝트 ID (`mixpanel_project_id`)
  - 믹스패널 보드 ID (`mixpanel_board_id`)
  - 믹스패널 시크릿키 (`mixpanel_secret_key`)
- UI는 정상 구현됨. 사용자가 직접 입력해야 함.

**판단**: UI 자체는 문제 없음. 사용자 설정 미완료가 원인.

---

## 2. ad_accounts.mixpanel_project_id 컬럼

**파일**: `src/types/database.ts`

- `ad_accounts` 테이블에 `mixpanel_project_id: string | null`, `mixpanel_board_id: string | null`, `mixpanel_status: Json | null` 존재
- `profiles` 테이블에도 `mixpanel_project_id`, `mixpanel_board_id`, `mixpanel_secret_key` 존재

**데이터 흐름**:
1. 온보딩(`src/actions/onboarding.ts`): 사용자 입력 → `ad_accounts.mixpanel_project_id` 저장
2. 설정 페이지(`syncAdAccount`, `addAdAccount`, `updateAdAccount`): 동일 패턴
3. 시크릿키는 `service_secrets` 테이블에 별도 암호화 저장 (`key_name: secret_{accountId}`)

**판단**: 스키마 정상. 사용자가 온보딩/설정에서 프로젝트 ID + 시크릿키를 입력하지 않으면 연동 불가.

---

## 3. collect-mixpanel 크론 라우트

**파일**: `src/app/api/cron/collect-mixpanel/route.ts`

- Cloud Run Cron 인증 (`Bearer CRON_SECRET`)
- `ad_accounts`에서 `active=true AND mixpanel_project_id IS NOT NULL` 필터
- 계정별 순차 처리 (Mixpanel rate limit: 60 queries/hour)
- `lookupMixpanelSecret()` → 시크릿키 없으면 개별 계정 스킵
- `fetchMixpanelRevenue()` → 매출/구매건수 수집

**스킵 조건 체인**:
```
mixpanel_project_id IS NULL → 계정 목록에서 제외
↓ (통과)
시크릿키 없음 → 개별 스킵 ("시크릿키 없음")
↓ (통과)
API 호출 실패 → 1회 재시도 후 실패 기록
```

**판단**: 코드 정상. `mixpanel_project_id` 미설정 계정은 쿼리 자체에서 제외.

---

## 4. mixpanel-collector.ts 코드 흐름

**파일**: `src/lib/protractor/mixpanel-collector.ts`

### fetchMixpanelRevenue()
- Mixpanel Segmentation API (`/api/2.0/segmentation`) 호출
- event="purchase" 기준 매출(sum) + 건수(general) 2회 API 호출
- Basic Auth: `{secretKey}:` → Base64
- 401 에러 시 "시크릿키 만료 또는 무효" 에러

### lookupMixpanelSecret()
- 1순위: `service_secrets` 테이블 → `service=mixpanel, key_name=secret_{accountId}`
- 2순위: `profiles.mixpanel_secret_key` 폴백
- 두 곳 모두 없으면 null → 수집 스킵

**판단**: 코드 정상. 시크릿키 저장 경로 2중 폴백 구현됨.

---

## 5. Cloud Scheduler 등록 상태

**파일**: `src/app/api/cron/health/route.ts` (헬스 체크)

- `cronNames` 목록에 `collect-mixpanel` 포함 → 크론 대상으로 인식
- 그러나 실제 Cloud Scheduler 등록 여부는 코드에서 확인 불가 (인프라 레벨)
- `project_bm_account_status` 메모리: "discover-accounts Cloud Scheduler 미등록" 기록 있음 → collect-mixpanel도 동일 상태일 가능성

**판단**: Cloud Scheduler 등록 여부 인프라 확인 필요.

---

## 종합 진단

| 점검 항목 | 상태 | 비고 |
|-----------|------|------|
| 설정 UI (프로젝트 ID, 시크릿키 입력) | 정상 | 사용자 미입력이 문제 |
| ad_accounts.mixpanel_project_id 컬럼 | 정상 | 스키마 존재 |
| collect-mixpanel 크론 라우트 | 정상 | 코드 동작 검증 가능 |
| mixpanel-collector.ts 수집 로직 | 정상 | API 호출 + 시크릿 조회 정상 |
| Cloud Scheduler 등록 | 미확인 | 인프라 확인 필요 |
| 사용자 데이터 입력 | **미완료** | 핵심 원인 |

### 미연동 핵심 원인

1. **사용자 설정 미완료**: 대부분의 광고계정에 `mixpanel_project_id`와 시크릿키가 미입력
2. **Cloud Scheduler 미등록 가능성**: 크론이 등록되지 않으면 코드가 있어도 실행되지 않음
3. **Mixpanel → 자사몰 이벤트 연동 선행 필요**: Mixpanel에 purchase 이벤트가 전송되어야 수집 가능

### 권장 조치

1. 관리자 페이지에서 각 계정의 Mixpanel 설정 상태 일괄 조회
2. Cloud Scheduler에 collect-mixpanel 잡 등록 확인
3. 수강생별 Mixpanel 프로젝트 설정 가이드 제공
