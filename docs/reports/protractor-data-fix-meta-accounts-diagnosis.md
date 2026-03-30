# Meta 데이터 없음 7개 계정 코드 레벨 원인 분석

> 작성일: 2026-03-30 | TASK: protractor-data-fix
> 대상 계정: 유비드, 리바이너, 고요아, 아토리카버크림, MKM_동현, 온기브, 리아르

## 결론

Meta 데이터 수집 실패의 코드 레벨 차단 지점은 **3단계 필터 체인**으로 구성됨:
1. discover-accounts: 90일 impressions = 0 → 비활성 스킵
2. collect-daily: checkMetaPermission() 실패 → permission_denied 마킹
3. collect-daily: active = false → 초기 쿼리에서 제외

7개 계정이 데이터 없는 원인은 이 3단계 중 하나 이상에서 차단된 것.

---

## 1. discover-accounts 스킵 조건

**파일**: `src/app/api/cron/discover-accounts/route.ts`

### 스킵 체인
```
META_ACCESS_TOKEN 미설정 → 전체 실패 (500)
↓ (통과)
/me/adaccounts API 호출 → 토큰에 연결되지 않은 계정 → 목록에 포함 안 됨
↓ (포함됨)
checkAccountActive(accountId, token) → 90일 impressions = 0 → 비활성 스킵
↓ (impressions > 0)
ad_accounts UPSERT (active = true)
```

### 차단 가능 지점

| 지점 | 코드 | 설명 |
|------|------|------|
| 토큰 미연결 | `fetchAllAdAccounts()` 라인 99-120 | Meta 앱 토큰에 해당 계정이 연결되지 않으면 API 응답 자체에 포함 안 됨 |
| 90일 비활성 | `checkAccountActive()` 라인 123-146 | 최근 90일간 impressions = 0이면 `skippedInactive++` 처리 |
| API 응답 제외 | `findAccountsToDeactivate()` | 이전에 등록됐지만 현재 API 응답에 없는 계정 → active = false |

**가능성**: 7개 계정이 Meta Business Manager에서 토큰 연결이 해제되었거나, 90일간 광고를 집행하지 않은 경우.

---

## 2. collect-daily 스킵 조건

**파일**: `src/app/api/cron/collect-daily/route.ts`

### 초기 필터
```sql
-- 라인 359-363
SELECT account_id, account_name
FROM ad_accounts
WHERE active = true
ORDER BY created_at;
```
→ `active = false`인 계정은 여기서 이미 제외됨.

### checkMetaPermission() 체크
```
계정 목록 순회 (라인 402-417)
↓
account_id가 숫자가 아님 → 스킵 ("잘못된 account_id")
↓
checkMetaPermission(account_id, token) → API 호출 실패 → permission_denied 마킹
↓ (통과)
permittedAccounts에 추가
```

### incremental 스킵
```
해당 날짜에 이미 수집된 계정 → 중복 수집 방지 스킵 (라인 440-453)
```

**차단 가능 지점 요약**:

| 지점 | 코드 라인 | 조건 |
|------|-----------|------|
| active = false | 362 | discover-accounts에서 비활성 처리된 경우 |
| 잘못된 account_id | 404 | 숫자가 아닌 ID (예: 테스트 계정) |
| checkMetaPermission 실패 | 410-416 | Meta API 권한 거부 → `meta_status = 'permission_denied'` |
| 이미 수집됨 | 440-452 | 해당 날짜 데이터 이미 존재 (정상 동작) |

---

## 3. checkMetaPermission() 로직

**파일**: `src/lib/collect-daily-utils.ts` 라인 224-244

```typescript
export async function checkMetaPermission(
  accountId: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  // GET /act_{id}?fields=name,account_status
  // → ok: 200 응답
  // → 실패: error 메시지 반환
}
```

### 실패 원인 분류

| 원인 | Meta API 에러 | 빈도 |
|------|---------------|------|
| 토큰 권한 없음 | `(#100) Unsupported get request` | 높음 |
| 계정 비활성화 | `account_status != 1` | 중간 |
| 토큰 만료 | `(#190) Invalid OAuth 2.0 Access Token` | 낮음 (전체 영향) |
| 앱 권한 부족 | `(#200) Requires ads_read permission` | 낮음 |
| 계정 삭제 | `(#100) Object does not exist` | 낮음 |

**핵심**: 실패 시 `meta_status = 'permission_denied'`로 마킹되며, 이후 collect-daily에서 자동 스킵.

---

## 4. 7개 계정별 예상 차단 시나리오

7개 계정의 정확한 차단 지점은 DB 데이터(ad_accounts.active, meta_status) 확인이 필요하지만, 코드 레벨에서 가능한 시나리오:

| 시나리오 | 확인 방법 |
|----------|-----------|
| **A. 토큰 미연결** | ad_accounts에 레코드 자체가 없음 |
| **B. 90일 비활성** | active = false, discover-accounts 로그에 "비활성 스킵" |
| **C. 권한 거부** | meta_status = 'permission_denied' |
| **D. 계정 미등록** | 온보딩/설정에서 account_id를 입력하지 않음 |
| **E. is_member = false** | 데이터는 수집되지만 총가치각도기에서 필터 안 됨 |

---

## 5. 확인 SQL (운영 DB)

```sql
-- 7개 계정 상태 일괄 확인
SELECT
  account_id,
  account_name,
  active,
  meta_status,
  is_member,
  last_checked_at,
  discovered_at,
  updated_at
FROM ad_accounts
WHERE account_name IN ('유비드', '리바이너', '고요아', '아토리카버크림', 'MKM_동현', '온기브', '리아르')
   OR account_name ILIKE '%유비드%'
   OR account_name ILIKE '%리바이너%'
   OR account_name ILIKE '%고요아%'
   OR account_name ILIKE '%아토리카%'
   OR account_name ILIKE '%MKM%'
   OR account_name ILIKE '%온기브%'
   OR account_name ILIKE '%리아르%';
```

## 권장 조치

1. 위 SQL로 7개 계정의 `active`, `meta_status`, `is_member` 확인
2. `meta_status = 'permission_denied'` → Meta Business Manager에서 토큰 재연결
3. `active = false` → discover-accounts 수동 실행 또는 active = true 수동 설정
4. 레코드 없음 → 설정 페이지에서 계정 추가 또는 discover-accounts 실행
