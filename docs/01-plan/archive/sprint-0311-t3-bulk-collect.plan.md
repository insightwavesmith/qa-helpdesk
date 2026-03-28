# T3: 총가치각도기 전체 계정 일괄 수집 + 선택 수집

## 이게 뭔지
관리자가 등록된 모든 광고계정 또는 선택한 계정들의 Meta 데이터를 일괄 수집하는 기능

## 왜 필요한지
현재 BackfillSection에서 계정 1개만 선택하여 수집 가능. 관리자가 전체 계정을 한번에 수집하거나 원하는 계정만 골라서 수집하고 싶어함.

## 현재 상태
- `collect-daily` cron: 매일 자동으로 전체 활성 Meta 계정 데이터 수집 (ACTIVE 광고만)
- `backfill` API: 단일 계정 + 날짜 범위 지정 수집 (3-phase SSE 스트리밍)
- 캠페인 objective 필터: **collect-daily에는 없음** (이미 전체 캠페인 수집). OUTCOME_SALES 필터는 overlap 분석에서만 사용.
- 관리자 페이지: `/admin/protractor/` — BackfillSection (단일 계정 수집) + 계정 상태 테이블

## 캠페인 범위 확인 결과
✅ collect-daily는 `effective_status: ACTIVE` 필터만 사용, campaign objective 필터 없음.
→ 이미 전체 캠페인(판매+잠재고객+인지도 등) 수집 중. 추가 변경 불필요.

## 구현 내용

### 1. API — POST `/api/admin/protractor/collect`
- body: `{ accountIds: string[] | "all", date?: string }`
- "all"이면 `ad_accounts` 테이블에서 `active=true` 전체 조회
- 각 계정별로 `fetchAccountAds()` 호출 (collect-daily 로직 재사용)
- SSE 스트리밍으로 진행 상태 반환
- 인증: `requireStaff()` (admin/assistant)

### 2. 프론트엔드 — 관리자 페이지 수집 UI
- 기존 BackfillSection 하단 또는 별도 섹션에 추가
- "전체 수집" 버튼 + 체크박스 계정 선택
- 수집 진행 상태 표시 (계정별 성공/실패/로딩)

## 변경 파일
- `src/app/api/admin/protractor/collect/route.ts` — 신규 API
- `src/app/(main)/admin/protractor/bulk-collect-section.tsx` — 신규 UI 컴포넌트
- `src/app/(main)/admin/protractor/page.tsx` — bulk-collect-section 추가

## 성공 기준
- "전체 수집" 클릭 → 모든 활성 계정 데이터 수집
- 체크박스 선택 후 "선택 수집" → 선택된 계정만 수집
- 진행 상태 실시간 표시 (계정별 완료/에러)
- 빌드 성공
