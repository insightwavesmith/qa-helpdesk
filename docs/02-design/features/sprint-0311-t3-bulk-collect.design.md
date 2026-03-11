# T3: 총가치각도기 전체/선택 수집 — 설계서

## 1. 데이터 모델
변경 없음. 기존 `daily_ad_insights` 테이블에 upsert.

## 2. API 설계

### POST `/api/admin/protractor/collect`

**요청:**
```typescript
{
  accountIds: string[] | "all"  // 계정 ID 배열 또는 "all"
  date?: string                 // 수집 날짜 (기본: 어제)
}
```

**응답:** SSE 스트리밍
```
data: {"type":"start","totalAccounts":5}
data: {"type":"account_start","accountId":"123","accountName":"브랜드A"}
data: {"type":"account_complete","accountId":"123","adsCount":15}
data: {"type":"account_error","accountId":"456","error":"Rate limited"}
data: {"type":"complete","summary":{"success":4,"failed":1,"totalAds":60}}
```

**인증:** requireStaff() (admin/assistant)

**로직:**
1. accountIds === "all" → `ad_accounts` 테이블에서 `active=true` 전체 조회
2. 아니면 해당 ID들의 계정 정보 조회
3. 각 계정별 순차적으로 `fetchAccountAds()` 호출 (Rate limit 방지 2초 딜레이)
4. `buildInsightRows()` → `upsertInsights()` (backfill route.ts 로직 재사용)
5. 계정별 결과 SSE로 전송

## 3. 컴포넌트 구조

### `bulk-collect-section.tsx` (신규 클라이언트 컴포넌트)
```
Props: { accounts: { account_id: string, account_name: string }[] }

State:
  - selectedIds: Set<string>
  - status: "idle" | "running" | "done" | "error"
  - results: Map<string, { status, adsCount?, error? }>
  - date: string (기본 어제)

UI:
  ┌─────────────────────────────────────────────┐
  │ 일괄 데이터 수집                              │
  │                                              │
  │ [전체 선택] [선택 해제]        날짜: [2026-03-10] │
  │                                              │
  │ ☑ 브랜드A (123456)                           │
  │ ☑ 브랜드B (789012)                           │
  │ ☐ 브랜드C (345678)                           │
  │                                              │
  │ [전체 수집]  [선택 수집(2)]                     │
  │                                              │
  │ 진행 상태:                                    │
  │ ✅ 브랜드A — 15건 수집                        │
  │ ⏳ 브랜드B — 수집 중...                       │
  └─────────────────────────────────────────────┘
```

### `page.tsx` 수정
- BackfillSection 아래에 BulkCollectSection 추가
- accounts prop은 이미 서버에서 fetch하고 있으므로 그대로 전달

## 4. 에러 처리
| 상황 | 처리 |
|------|------|
| 미인증/권한 없음 | 401/403 |
| 계정 없음 | 빈 결과 반환 |
| 개별 계정 Meta API 에러 | 해당 계정 skip + 에러 표시, 나머지 계속 |
| Rate limit (429) | fetchMetaWithRetry() 재시도 로직 사용 |

## 5. 구현 순서
- [x] Plan 작성
- [x] Design 작성
- [ ] `/api/admin/protractor/collect/route.ts` API 생성
- [ ] `bulk-collect-section.tsx` UI 컴포넌트 생성
- [ ] `page.tsx`에 섹션 추가
- [ ] 빌드 검증
