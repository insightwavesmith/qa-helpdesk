# TASK-벤치마크: collect-daily 자동 계정 수집 전환

## 개요
collect-daily가 현재 DB `ad_accounts` 테이블에서만 계정을 가져오는데,
Meta API `me/adaccounts`로 접근 가능한 **전체 계정**을 자동 수집하도록 변경.

## 필수 참고
- 현재 코드: `src/app/api/cron/collect-daily/route.ts` 340~360행
- Meta API: `GET https://graph.facebook.com/v21.0/me/adaccounts?access_token={token}&fields=account_id,name&limit=500`
- 기획서: docs/design/protractor-integrated-plan.html — "벤치마크 모집단 = 전체 접근 계정"

## T1. collect-daily 계정 조회 변경

### 현재:
```typescript
// 1. active ad_accounts 조회
const { data: accounts, error: accErr } = await svc
  .from("ad_accounts")
  .select("account_id, account_name, mixpanel_project_id")
  .eq("active", true);
```

### 변경:
```typescript
// 1. Meta API로 접근 가능한 전체 광고계정 조회
const token = process.env.META_ACCESS_TOKEN;
if (!token) throw new Error("META_ACCESS_TOKEN not set");

const adAccountsUrl = new URL("https://graph.facebook.com/v21.0/me/adaccounts");
adAccountsUrl.searchParams.set("access_token", token);
adAccountsUrl.searchParams.set("fields", "account_id,name");
adAccountsUrl.searchParams.set("limit", "500");

const adAccountsRes = await fetch(adAccountsUrl.toString());
const adAccountsJson = await adAccountsRes.json();

if (!adAccountsJson.data || adAccountsJson.data.length === 0) {
  return NextResponse.json({ message: "No accessible accounts", results: [] });
}

// Meta API는 account_id를 "act_123456" 형태로 반환
const accounts = adAccountsJson.data.map((a: any) => ({
  account_id: a.account_id.replace(/^act_/, ""),
  account_name: a.name,
}));
```

### 주의사항:
- `fetchDailyInsights()` 함수(127행)에서 이미 `act_` 접두사를 붙이므로, account_id는 숫자만 저장
- `daily_ad_insights` 테이블의 `account_id` 컬럼 형식과 일치시킬 것
- mixpanel_project_id는 벤치마크 수집에 불필요 — null 허용
- 페이지네이션: 500개 이상이면 `paging.next` 따라가기 (현재는 불필요할 수 있으나 안전장치)

## T2. collect-benchmarks 확인
- collect-benchmarks는 `daily_ad_insights` 테이블에서 읽으므로 변경 불필요
- collect-daily가 데이터를 넣으면 자동으로 벤치마크 계산됨
- **확인만 하고 수정하지 말 것**

## 실행 순서
1. collect-daily route.ts 수정
2. npm run build 성공 확인
3. tsc --noEmit 에러 0 확인

## 리뷰 결과
(에이전트팀 리뷰 후 기록)
