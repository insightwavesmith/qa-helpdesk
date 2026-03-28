# A3. 데일리콜랙트 overlap 제거 — 설계서

> 작성: 2026-03-02
> 참조: cron-stabilization.design.md, 데이터수집v2.design.md

## 1. 데이터 모델
- 해당 없음 (DB 변경 없음)
- `daily_overlap_insights` 테이블 — **삭제하지 않음**. 기존 데이터 보존.
- `daily_ad_insights` 테이블 — 기존과 동일하게 upsert 유지

## 2. API 설계

### collect-daily 크론 (수정)
- **파일**: `src/app/api/cron/collect-daily/route.ts`
- **Method**: GET
- **인증**: CRON_SECRET Bearer 토큰 (기존 유지)
- **동작 변경**: 광고 데이터 수집만 수행. overlap 수집 제거.

#### 현재 흐름 (Before):
```
GET /api/cron/collect-daily
  ├── startCronRun("collect-daily")
  ├── for each account:
  │   ├── [유지] Meta API → daily_ad_insights upsert
  │   └── [제거] overlap-utils import → fetchActiveAdsets → fetchCombinedReach × N쌍 → daily_overlap_insights upsert
  └── completeCronRun(...)
```

#### 변경 후 (After):
```
GET /api/cron/collect-daily
  ├── startCronRun("collect-daily")
  ├── for each account:
  │   └── [유지] Meta API → daily_ad_insights upsert
  └── completeCronRun(...)
```

### 영향 없는 API (변경하지 않음)

| API | 이유 |
|-----|------|
| `GET /api/protractor/overlap` | 독립 구현. overlap-utils.ts를 직접 import하여 자체 캐싱/계산. collect-daily와 무관. |
| `GET /api/cron/collect-mixpanel` | 다른 크론, 무관 |
| `GET /api/cron/collect-benchmarks` | 다른 크론, 무관 |

## 3. 컴포넌트 구조

### 삭제 대상 코드 블록

**파일**: `src/app/api/cron/collect-daily/route.ts`

**삭제 범위** (약 lines 333~439, account for-loop 내부):
```typescript
// ── overlap 수집 ──────────────────────────────────────────
try {
  const { fetchActiveAdsets, fetchCombinedReach, makePairKey } =
    await import("@/lib/protractor/overlap-utils");

  const adsets = await fetchActiveAdsets(account.account_id);
  if (adsets.length > 0) {
    // 개별 reach — 당일 DB 데이터 사용
    const { data: reachRows } = await svc
      .from("daily_ad_insights")
      .select("adset_id, reach")
      ...

    // pair별 overlap 계산 (상위 8개 adset, 최대 28조합)
    ...

    // daily_overlap_insights UPSERT
    await svc
      .from("daily_overlap_insights" as never)
      .upsert(...)

    accountResult.overlap_rate = Math.round(overallRate * 10) / 10;
  }
} catch (overlapErr) {
  console.error(`overlap 수집 실패 (${account.account_id}):`, overlapErr);
}
```

### 유지 대상 코드

| 영역 | 라인 범위 (대략) | 내용 |
|------|------------------|------|
| Imports + 유틸리티 | 1~93 | safeFloat, safeInt, round, normalizeRanking, getCreativeType |
| calculateMetrics | 95~157 | 광고 지표 계산 |
| fetchMetaWithRetry | 159~193 | Meta API 재시도 래퍼 |
| fetchAccountAds | 195~231 | 광고 데이터 fetch |
| Main handler 시작 | 233~282 | auth, accounts 조회, for-loop 시작 |
| 광고 데이터 수집 | 283~331 | Meta API → daily_ad_insights upsert |
| Logging + Response | 440~467 | cron_runs 완료, JSON 응답 |

### 유지 대상 파일 (삭제 금지)

| 파일 | 이유 |
|------|------|
| `src/lib/protractor/overlap-utils.ts` | on-demand API(`/api/protractor/overlap`)에서 사용 |
| `src/app/api/protractor/overlap/route.ts` | 독립적 on-demand overlap 계산 API |
| `src/app/(main)/admin/protractor/recollect-buttons.tsx` | UI 버튼, 이 태스크 범위 밖 |

## 4. 에러 처리

| 상황 | 현재 (overlap 있음) | 변경 후 |
|------|---------------------|---------|
| overlap API 실패 | catch로 격리, console.error | 해당 없음 (코드 삭제) |
| 광고 수집 실패 | hasPartialError = true | 동일 (유지) |
| cron_runs 로깅 | startCronRun → completeCronRun | 동일 (유지) |
| 전체 실패 | catch → completeCronRun("error") | 동일 (유지) |

### 응답 포맷 변경

**Before** (account별 결과):
```json
{
  "meta_ads": 25,
  "overlap_rate": 12.3,
  "meta_error": null
}
```

**After**:
```json
{
  "meta_ads": 25,
  "meta_error": null
}
```

`overlap_rate` 필드가 응답에서 자연 소멸 (할당 코드 삭제로).

## 5. 구현 순서
- [ ] `src/app/api/cron/collect-daily/route.ts`에서 overlap 블록 전체 삭제 (lines 333~439)
- [ ] 삭제 후 코드 정합성 확인:
  - `hasPartialError` 변수 — 광고 수집에서도 사용하므로 유지
  - `accountResult` 타입 — `overlap_rate` 필드 없어도 런타임 에러 없음 (동적 할당)
  - `results` 배열 — 광고 수집 결과만 포함
  - `totalRecords` 계산 — `meta_ads`만 카운트하므로 영향 없음
- [ ] `npm run build` 성공 확인
- [ ] (선택) overlap 코드 삭제 후 console.log 확인 — overlap 관련 로그 없음 확인

## 6. 독립성 검증

### on-demand overlap API가 영향받지 않는 이유

`/api/protractor/overlap/route.ts`는:
1. `overlap-utils.ts`를 **직접 import** (collect-daily 경유 아님)
2. **자체 캐싱**: `daily_overlap_insights` 테이블 읽기 + `adset_overlap_cache` 테이블 사용
3. **자체 계산**: `fetchCombinedReach`를 직접 호출
4. collect-daily 크론과 **코드 의존성 없음**

따라서 collect-daily에서 overlap 삭제 → on-demand API 영향 **제로**.

### cron_runs 로깅 영향 없는 이유

`totalRecords` 계산:
```typescript
const totalRecords = results.reduce(
  (sum, r) => sum + (typeof r.meta_ads === "number" ? r.meta_ads : 0),
  0
);
```
- `meta_ads`만 카운트하므로 overlap 삭제와 무관
- `hasPartialError`는 광고 수집 실패 시에도 true 세팅되므로 유지

## 7. 영향 범위

| 파일 | 변경 유형 | 위험도 |
|------|----------|--------|
| `src/app/api/cron/collect-daily/route.ts` | overlap 블록 삭제 (~107줄) | 낮음 (격리된 try-catch 블록) |
| `src/lib/protractor/overlap-utils.ts` | 변경 없음 | 없음 |
| `src/app/api/protractor/overlap/route.ts` | 변경 없음 | 없음 |
| DB `daily_overlap_insights` | 변경 없음 (데이터 보존) | 없음 |
