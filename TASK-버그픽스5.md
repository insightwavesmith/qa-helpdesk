# TASK-버그픽스5.md — 총가치각도기 + 관리자 페이지 버그 수정

> 작성: 모찌 | 2026-02-27
> 프로젝트: /Users/smith/projects/qa-helpdesk
> 최신 커밋: 3f43467
> QA 결과 기반 (브라우저 QA 2026-02-27 16:20)

---

## 타입
버그 수정 + UI 개선

## 목표
1. 광고계정명/믹스패널 데이터 입력 일관성 확보 (모든 입력 경로 통일)
2. 총가치각도기 타겟중복 + 콘텐츠 #1~#5 정상 작동
3. 관리자 수강생 관리 UI 정리

## 제약
- daily_ad_insights 테이블 구조 변경 금지
- 기존 데이터 삭제 금지
- npm run build 성공 필수

---

## B1. 조교(assistant) 역할 목록에서 "리드"로 표시되는 버그

**파일:** `src/app/(main)/admin/members/members-client.tsx`

**현재:**
```tsx
const roleLabels = {
  lead: { label: "리드", ... },
  member: { label: "멤버", ... },
  student: { label: "수강생", ... },
  admin: { label: "관리자", ... },
};
// assistant 누락 → fallback으로 lead 표시 (262줄)
```

**변경:**
- roleLabels에 `assistant: { label: "조교", variant: "default", className: "bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-50" }` 추가
- roleFilters에 `{ value: "assistant", label: "조교" }` 추가

**검증:** /admin/members → 제인 → "조교" 배지 표시

---

## B2. 광고계정명 — 모든 입력 경로에서 account_name 정상 저장

**파일:** `src/actions/onboarding.ts`

**현재 문제:**
- 131줄: `account_name: data.metaAccountId` ← ID를 이름으로 저장
- 184줄: `account_name: data.metaAccountId` ← 동일 버그
- 233줄: `account_name: data.accountName || data.metaAccountId` ← 정상
- 242줄: `account_name: data.accountName || data.metaAccountId` ← 정상

**변경:**
- 131줄 → `account_name: data.accountName || data.metaAccountId`
- 184줄 → `account_name: data.accountName || data.metaAccountId`
- data 타입에 `accountName` 필드가 없으면 추가

**전체 코드 검색 필수:** `account_name`을 INSERT/UPDATE하는 모든 곳 확인
- `src/actions/onboarding.ts`
- `src/actions/admin.ts`
- `src/app/api/protractor/accounts/route.ts`
- 기타 ad_accounts 테이블에 쓰는 모든 파일

**검증:** 
- 온보딩 시 광고계정명 입력 → ad_accounts.account_name에 이름 저장
- 수정 시에도 계정명 유지

---

## B3. 광고계정 수정 폼 — 광고계정명 필드 누락/불일치

**파일:** `src/app/(main)/admin/members/member-detail-modal.tsx`

**현재:** 수정 폼에 "계정명" 레이블만 있고, 수정 시 account_name이 빈 값으로 덮어씌워질 수 있음

**변경:**
- 수정 폼에 "광고계정명" 필드 명확히 표시
- 수정 저장 시 account_name 값 유지
- accountForm 초기값에 account_name 포함

**모든 광고계정 수정 UI 확인:**
- `/settings/settings-form.tsx` — 수강생 본인 수정
- `/admin/members/member-detail-modal.tsx` — 관리자 수정
- 두 곳 다 account_name, mixpanel_project_id, mixpanel_board_id, mixpanel_secret_key 필드 통일

---

## B4. 관리자 수강생 상세 — 비활성 광고계정 삭제 기능

**파일:** `src/app/(main)/admin/members/member-detail-modal.tsx`

**현재:** 광고계정 카드에 수정(연필) 아이콘만 있고 삭제 버튼 없음
**변경:** 
- 각 광고계정 카드에 Trash2 삭제 아이콘 추가
- 클릭 시 confirm("광고계정 {id}를 삭제하시겠습니까?")
- 삭제 API: DELETE /api/protractor/accounts (이미 존재)
- 삭제 후 계정 목록 refresh

---

## B5. 관리자 수강생 상세 — 상단 레거시 필드 제거

**파일:** `src/app/(main)/admin/members/member-detail-modal.tsx`

**현재:** 상단 정보 섹션에 "메타 광고계정 ID (레거시)" + 믹스패널 프로젝트 ID/보드 ID/시크릿키 표시 → 하단 "배정된 광고계정"과 중복

**변경:**
- 상단의 레거시 광고계정/믹스패널 필드 제거
- 하단 "배정된 광고계정" 섹션만 유지

---

## B6. 총가치각도기 타겟중복 — OverlapAnalysis 컴포넌트 내부 7일 제한

**파일:** `src/components/protractor/OverlapAnalysis.tsx`, `src/app/api/protractor/overlap/route.ts`

**현재:** real-dashboard.tsx에서 periodNum < 7 조건은 제거했으나, OverlapAnalysis 컴포넌트 내부에서 "7일 이상 기간을 선택해주세요" 메시지를 표시하며 분석을 차단하고 있음

**변경:**
- OverlapAnalysis 내부의 7일 최소 기간 제한 제거
- 1일부터도 Meta overlap API 호출 → 결과 표시
- Meta API가 1일 데이터로 overlap을 반환하지 못하면 "데이터 부족" 안내 (에러가 아닌 안내)

---

## B7. 콘텐츠 탭 — #1~#5 카드 표시

**파일:** `src/app/(main)/protractor/components/content-ranking.tsx`, `src/lib/protractor/aggregate.ts`

**현재:** #1 카드만 표시됨 (#2~#5 없음)

**확인 사항 (리뷰 시 중점):**
1. `getTop5Ads()` 함수: daily_ad_insights에서 ad_id별 합산 → spend DESC → 5개
2. 실제 DB: 해당 계정의 2/26 데이터 25건 → ad_id가 몇 개인지
3. 1일(어제) 선택 시: 25건 중 unique ad_id 수가 1개뿐이면 데이터 문제
4. 7일 선택 시: 7일 합산으로 더 많은 ad_id가 나와야 함

**수정 (데이터 문제가 아닌 경우):**
- ContentRanking 컴포넌트에서 top5 배열이 올바르게 전달/렌더링되는지 확인
- 각 카드에 #1, #2, ... 번호 + 광고명 + 광고비/노출/클릭/CTR/구매
- 전부 펼쳐진 상태 (접기/펼치기 없음)
- 벤치마크 비교: 지표별 `내수치 / 기준선` + 판정 색상

---

## 리뷰 요청 사항

### 광고계정/믹스패널 데이터 일관성 전수 조사
ad_accounts 테이블에 데이터를 INSERT/UPDATE하는 **모든 경로**를 찾아서 다음 필드가 빠짐없이 처리되는지 확인:
- `account_id` (필수)
- `account_name` (필수 — 빈 값이면 account_id fallback)
- `mixpanel_project_id` (선택)
- `mixpanel_board_id` (선택)
- `mixpanel_secret_key` → service_secrets 테이블 (선택)

경로 목록:
1. 온보딩 (회원가입 → 광고계정 등록): `src/actions/onboarding.ts`
2. 설정 (수강생 본인 수정): `src/app/(main)/settings/settings-form.tsx`
3. 관리자 수강생 상세 (관리자 수정): `src/app/(main)/admin/members/member-detail-modal.tsx`
4. 관리자 광고계정 관리: `src/app/(main)/admin/accounts/`
5. 총가치각도기 계정 추가: `src/app/(main)/protractor/real-dashboard.tsx`
6. API: `src/app/api/protractor/accounts/route.ts`
7. 서버 액션: `src/actions/admin.ts`

### 총가치각도기 타겟중복 전수 조사
- real-dashboard.tsx → OverlapAnalysis 호출 흐름
- OverlapAnalysis 내부 조건문 전부
- /api/protractor/overlap API — 기간 제한 있는지
- Meta Graph API overlap 호출 시 date_preset/time_range 파라미터

### 콘텐츠 #1~#5 전수 조사
- insights API → getTop5Ads → ContentRanking 데이터 흐름 전체
- daily_ad_insights에서 ad_id별 데이터 분포
- 카드 렌더링 로직 — map 함수에서 몇 개를 렌더하는지
- 벤치마크 비교 — findAboveAvg로 올바른 벤치마크 행 선택하는지

---

## 리뷰 결과

(에이전트팀 리뷰 후 작성)

## 리뷰 보고서

(에이전트팀 리뷰 후 작성)

---

## 완료 기준
- [ ] B1: 조교 → "조교" 배지 표시
- [ ] B2: 모든 경로에서 account_name 정상 저장
- [ ] B3: 수정 폼에 광고계정명 필드 유지
- [ ] B4: 관리자 수강생 상세에서 광고계정 삭제 가능
- [ ] B5: 상단 레거시 필드 제거
- [ ] B6: 타겟중복 1일부터 표시
- [ ] B7: 콘텐츠 #1~#5 카드 정상 표시
- [ ] 리뷰에서 발견된 추가 이슈 반영
- [ ] npm run build 성공
- [ ] tsc --noEmit 0에러

---

## 리뷰 결과 (2026-02-27 16:30)

### B2 범위 확대 — TASK가 놓친 2곳 추가
- `admin.ts:107` approveMember INSERT — account_name에 ID 저장 (추가)
- `admin.ts:359` updateMember INSERT — account_name에 ID 저장 (추가)
- UPDATE 4곳에서 account_name 미포함 → 수정 필요

### B6 타겟중복 — 이중 차단 확인
- `OverlapAnalysis.tsx:121` 프론트 차단 + `overlap/route.ts:160` 백엔드 차단
- 두 곳 다 제거 필요

### B7 콘텐츠 — 코드 정상, 데이터 문제 + 숨은 버그
- #1만 나오는 건 1일 기간에 unique ad_id가 1개뿐이라서 (코드 버그 아님)
- **숨은 버그 A4:** `getTop5Ads()` per_10k/비율 지표 미재계산 → 7일+ 기간에서 첫날 값만 유지 → 벤치마크 비교 부정확

### 추가 발견 이슈 (TASK에 포함)
| # | 심각도 | 이슈 |
|---|:------:|------|
| A1 | 높음 | admin.ts:107 approveMember — account_name에 ID 저장 |
| A2 | 높음 | admin.ts:359 updateMember — account_name에 ID 저장 |
| A3 | 중간 | UPDATE 4곳 account_name 미포함 |
| A4 | 중간 | getTop5Ads() per_10k/비율 미재계산 (7일+ 부정확) |
| A5 | 낮음 | overlap 1일 신뢰도 안내 문구 없음 |

## 리뷰 보고서
~/.claude/plans/soft-mixing-sundae.md (전문)
