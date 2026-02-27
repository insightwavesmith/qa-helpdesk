# TASK-관리자개선.md — 기수별/성과별 분류 + T3 점수 연동

> 작성: 모찌 | 2026-02-26
> 기획서: https://mozzi-reports.vercel.app/reports/architecture/2026-02-26-admin-cohort-performance-plan.html
> 우선순위: 높음
> Phase 1 (DB 변경 없음)

---

## ⚠️ 절대 규칙

1. **기존 코드를 먼저 읽어라.** members-client.tsx, performance-client.tsx, actions 파일 전부.
2. **"이미 구현됨" 판단 금지.** 현재 동작과 아래 스펙을 비교하여 다르면 수정.
3. **DB 변경 없음.** profiles.cohort (자유 텍스트) 그대로 사용. 새 테이블/컬럼 추가 금지.
4. **라이트 모드(화이트) 전용.** 다크모드 고려 불필요.

---

## T1. 회원 목록 기수 필터 추가

### 현재
- 역할(role) 필터만 있음: 전체/리드/멤버/수강생/관리자
- 기수 정보는 테이블에 표시되지만 필터 불가

### 수정
- 역할 필터 옆에 **기수 필터 드롭다운** 추가
- 기수 목록: `SELECT DISTINCT cohort FROM profiles WHERE cohort IS NOT NULL AND cohort != '' ORDER BY cohort`
- 선택 시 해당 기수 회원만 필터
- URL searchParams에 `?cohort=xxx` 저장 (뒤로가기 시 유지)
- "전체 기수" 옵션 포함

### 파일
- `src/app/(main)/admin/members/members-client.tsx` — 드롭다운 UI
- `src/app/(main)/admin/members/page.tsx` — searchParams 처리
- 서버 액션 (getMembers 등) — cohort 파라미터 추가

### 완료 기준
- [ ] 기수 드롭다운 표시
- [ ] 기수 선택 시 회원 목록 필터
- [ ] URL에 cohort 파라미터 반영

---

## T2. 성과 페이지 기간 선택 추가

### 현재
- 30일 고정, 변경 불가
- 기수 필터는 이미 있음 (getStudentPerformance(cohortId?))

### 수정
- 기수 필터 옆에 **기간 선택 드롭다운** 추가
- 기간 옵션: [7일] [14일] [30일] (총가치각도기와 유사하게)
- 기본값: 30일
- 선택 시 요약 카드 + 테이블 전체 갱신
- URL searchParams: `?cohort=xxx&period=30`

### 파일
- `src/app/(main)/admin/performance/performance-client.tsx` — 드롭다운 UI + 기간 연동
- `src/app/(main)/admin/performance/page.tsx` — searchParams
- 서버 액션 (getStudentPerformance) — period 파라미터 추가, DATE 범위 동적 계산

### 완료 기준
- [ ] 기간 드롭다운 (7일/14일/30일) 표시
- [ ] 기간 변경 시 요약 카드 + 테이블 갱신
- [ ] 기수 + 기간 동시 필터 동작

---

## T3. 성과 등급 배지

### 현재
- ROAS 색상만: ≥300% 초록, <100% 빨강

### 수정
- 테이블 마지막 컬럼에 **성과 등급 배지** 추가
- 등급 기준:
  - 🥇 **우수**: ROAS ≥ 300% AND 광고비 ≥ 10,000원
  - 🥈 **보통**: 100% ≤ ROAS < 300%
  - 🔴 **미달**: ROAS < 100% AND 광고비 > 0
  - ⚪ **데이터없음**: 광고비 = 0 또는 데이터 없음
- 배지 스타일: 작은 라벨 (배경색 + 텍스트)

### 파일
- `src/app/(main)/admin/performance/performance-client.tsx` — 등급 계산 + 배지 렌더링

### 완료 기준
- [ ] 각 수강생 행에 등급 배지 표시
- [ ] 등급 기준에 따른 올바른 분류

---

## T4. T3 점수 연동 — 수강생별 T3 점수 표시

### 현재
- 성과 페이지에 T3 점수 없음
- T3 점수 계산 로직이 `/api/protractor/total-value/route.ts` 안에 묶여있음

### 수정

#### 4-1. T3 엔진 추출
- `total-value/route.ts`에서 순수 계산 로직을 `src/lib/protractor/t3-engine.ts`로 분리
- 추출 대상: 타입/상수/calculateMetricScore/scoreToGrade/집계+점수 계산
- 제외: HTTP 파싱, 인증(requireProtractorAccess)
- 기존 total-value API는 추출된 함수를 import해서 사용 (동작 변경 없음)

#### 4-2. 수강생별 T3 일괄 계산 (N+1 방지)
- DB 쿼리 3회로 제한:
  1. 모든 학생의 active ad_accounts 한 번에 조회 (기존 performance.ts에서 이미 수행)
  2. 해당 account_ids 전체의 daily_ad_insights 한 번에 조회 (기간 내)
  3. 벤치마크 한 번만 조회
- 메모리에서 계정별 그루핑 후 T3 계산

#### 4-3. 테이블 + 요약 카드
- 성과 테이블에 **T3 점수 컬럼** 추가 (ROAS 옆)
- T3 점수 표시: 0~100점 + 등급 (A/B/C/D/F) — 5등급 유지
- 점수 없으면 "-" 표시
- 기존 4개 요약 카드 + **평균 T3 점수** 카드 1개 추가
- 선택 기간(T2)과 동일 기간 사용
- 벤치마크 없으면 점수 50(기본값) 처리 + "벤치마크 미수집" 안내

#### 4-4. creative_type 처리
- 계정별 dominant creative_type 판정 (기존 API 로직 재사용)
- 해당 creative_type 벤치마크 사용, 없으면 'ALL' 폴백

### 파일
- `src/app/(main)/admin/performance/performance-client.tsx` — T3 컬럼 + 요약 카드
- 서버 액션 — T3 점수 일괄 계산 로직 (total-value/route.ts의 계산 로직 import 또는 공통 함수 추출)

### 완료 기준
- [ ] 테이블에 T3 점수 컬럼 표시 (0~100 + 등급)
- [ ] 요약 카드에 평균 T3 점수 표시
- [ ] 기수/기간 필터 시 T3도 연동
- [ ] 데이터 없는 수강생은 "-" 표시

---

## 수정 대상 파일 요약

| 파일 | T1 | T2 | T3 | T4 |
|------|----|----|----|----|
| `admin/members/members-client.tsx` | ✅ | | | |
| `admin/members/page.tsx` | ✅ | | | |
| `admin/performance/performance-client.tsx` | | ✅ | ✅ | ✅ |
| `admin/performance/page.tsx` | | ✅ | | |
| 서버 액션 (admin.ts / performance.ts) | ✅ | ✅ | | ✅ |
| `src/lib/protractor/` (T3 계산 공통화) | | | | ✅ |

---

## 리뷰 발견 이슈 (반드시 수정)

### B1. 🔴 기수 필터 ID/텍스트 불일치 (기존 버그)
- `performance-client.tsx`: 드롭다운 value에 `c.id` (UUID) 사용
- `performance.ts getStudentPerformance()`: `.eq("cohort", cohortFilter)` → profiles.cohort는 자유 텍스트
- **UUID와 텍스트 비교 → 필터 미작동**
- 수정: 드롭다운 value를 `c.name` (cohort 텍스트값)으로 변경

### B2. ROAS 단위 확인
- `performance.ts`: roas는 비율(3.0 = 300%)로 저장
- 등급 기준: roas >= 3.0 (우수), 1.0~3.0 (보통), < 1.0 (미달)
- `performance-client.tsx`: `roasPercent = row.roas * 100` → 표시는 퍼센트, 판정은 비율 기준

### B4. 요약 카드 라벨 하드코딩
- "(30일)" 텍스트 → 선택 기간에 따라 동적 변경

---

## 금지 사항
- DB 테이블/컬럼 추가 금지 (Phase 1)
- 다크모드 스타일 추가 금지
- 기존 동작하는 기능 변경 금지 (B1 버그 수정은 예외)
- 총가치각도기 UI 수정 금지 (T3 계산 로직 추출만)

---

## 리뷰 결과

> 리뷰어: Claude | 2026-02-26
> 전체 리포트: mozzi-reports/public/reports/review/2026-02-26-admin-improvement-review.md

### T1. 회원 목록 기수 필터 — 미구현 (작업 필요)

| 항목 | 현재 상태 | 필요 작업 |
|------|-----------|-----------|
| `getMembers()` cohort 파라미터 | ❌ 없음 | 파라미터 추가 + `.eq("cohort", cohort)` 필터 |
| `page.tsx` searchParams | ❌ cohort 미처리 | `searchParams.cohort` 추출 → `getMembers`에 전달 |
| `members-client.tsx` 드롭다운 | ❌ 없음 | 기수 드롭다운 UI 추가 (Select 컴포넌트) |
| 기수 목록 데이터 | ❌ 없음 | DISTINCT cohort 조회 서버 액션 또는 props로 전달 |

**주의사항:**
- TASK는 `SELECT DISTINCT cohort FROM profiles`를 요구 → `cohorts` 테이블이 아닌 profiles.cohort (자유 텍스트) 기반
- `updateParams` 함수는 이미 잘 구현되어 있어 `cohort` 키만 추가하면 URL 반영됨

### T2. 성과 페이지 기간 선택 — 미구현 (작업 필요)

| 항목 | 현재 상태 | 필요 작업 |
|------|-----------|-----------|
| `getStudentPerformance()` period | ❌ 30일 하드코딩 (L109) | period 파라미터 추가, 날짜 계산 동적화 |
| `performance-client.tsx` 기간 드롭다운 | ❌ 없음 | 7/14/30일 Select 추가 |
| `page.tsx` searchParams | ❌ 미처리 | cohort + period 추출 → 초기값 전달 |
| 요약 카드 라벨 | ❌ "(30일)" 하드코딩 (L91, L107) | 선택 기간에 따라 동적 변경 |
| URL 동기화 | ❌ client-side state만 | searchParams 기반으로 전환 |

**🐛 기존 버그 발견 — cohort 필터 ID/텍스트 불일치:**
- `performance-client.tsx` L126: 드롭다운 value에 `c.id` (UUID) 사용
- `getStudentPerformance()` L69: `.eq("cohort", cohortFilter)` → `profiles.cohort`는 자유 텍스트 ("1기" 등)
- **UUID와 자유 텍스트를 비교하므로 기수 필터가 동작하지 않을 가능성 높음**
- 수정안: `c.id` 대신 `c.name` 또는 `c.short_name`으로 비교하거나, profiles.cohort와 cohorts.name 매핑 로직 추가

### T3. 성과 등급 배지 — 미구현 (작업 필요)

| 항목 | 현재 상태 | 필요 작업 |
|------|-----------|-----------|
| 등급 컬럼 | ❌ 없음 | 테이블 마지막 컬럼에 배지 추가 |
| 등급 계산 로직 | ❌ 없음 | ROAS/광고비 조합 판정 함수 작성 |

**주의사항:**
- ROAS 값 단위 확인 필요: `performance.ts` L153에서 `roas = roasSum / days` (일평균 ROAS). daily_ad_insights.roas가 비율(3.0)인지 퍼센트(300)인지에 따라 등급 기준 분기 달라짐
- 현재 `performance-client.tsx` L228: `roasPercent = row.roas * 100` → roas가 비율(0~N)로 저장되어 있음 확인. 등급 기준도 비율 기준으로 맞출 것
  - 🥇 우수: `roas >= 3.0 && spend >= 10000`
  - 🥈 보통: `1.0 <= roas < 3.0`
  - 🔴 미달: `roas < 1.0 && spend > 0`
  - ⚪ 데이터없음: `spend === 0`

### T4. T3 점수 연동 — 미구현 (가장 복잡, 작업 필요)

| 항목 | 현재 상태 | 필요 작업 |
|------|-----------|-----------|
| T3 계산 공통 함수 | ❌ route.ts에 API 핸들러 내부에 묶여있음 | `src/lib/protractor/t3-engine.ts`로 추출 |
| 성과 서버액션 T3 통합 | ❌ 없음 | `getStudentPerformance`에서 일괄 T3 계산 |
| 테이블 T3 컬럼 | ❌ 없음 | 점수 + 등급(S/A/B/C/D/F) 표시 |
| 요약 카드 평균 T3 | ❌ 없음 | 5번째 카드 추가 |

**🔴 Critical Issues:**

1. **등급 스펙 불일치**: TASK는 "S/A/B/C/D/F" 6등급 요구, `total-value/route.ts` L86의 `scoreToGrade()`는 A/B/C/D/F 5등급만 구현 (S등급 없음). 추출 시 S등급(≥90?) 추가 필요.

2. **T3 엔진 추출 범위**: route.ts L8~L106 (타입/상수/계산함수) + L166~L357 (집계+점수 계산)을 분리해야 함. 인증(`requireProtractorAccess`)과 HTTP 파싱은 제외.

3. **N+1 쿼리 방지**: 현재 API는 계정 1개씩 처리. 수강생 N명의 T3를 구하려면:
   - 모든 학생의 active ad_accounts를 한 번에 조회 (이미 `performance.ts` L84에서 수행)
   - 해당 account_ids 전체의 daily_ad_insights를 한 번에 조회
   - 벤치마크도 한 번만 조회
   - 계정별로 메모리에서 그루핑 후 T3 계산 → **DB 쿼리 3회로 제한 가능**

4. **벤치마크 의존성**: T3 점수는 `benchmarks` 테이블 필수. 데이터 없으면 모든 개별 지표 점수가 50으로 기본값 처리됨 (route.ts L61). 이 경우의 UX 처리 필요.

5. **creative_type 결정**: 현재 API는 계정 단위로 dominant creative_type 판정 후 해당 벤치마크 사용. 일괄 처리 시 계정별로 creative_type을 결정해야 하므로 로직이 복잡해짐.

### 숨은 이슈 총정리

| # | 이슈 | 위치 | 심각도 |
|---|------|------|--------|
| B1 | 기수 필터 ID/텍스트 불일치 (기존 버그) | performance.ts L69 + performance-client.tsx L126 | 🔴 High |
| B2 | ROAS 계산 방식: 일평균 ROAS vs 총매출/총광고비 | performance.ts L140,153 | 🟡 Medium |
| B3 | T3 등급 S 누락 | total-value/route.ts L86 | 🟡 Medium |
| B4 | 요약 카드 라벨 하드코딩 "(30일)" | performance-client.tsx L91,107 | 🟢 Low |
| B5 | performance page.tsx에 searchParams 미사용 | performance/page.tsx | 🟡 Medium |
| B6 | mixpanel_board_id profiles 미저장 | admin.ts L58 (extra.mixpanel_board_id 무시) | 🟢 Low |

### 권장 실행 순서

```
T1 (기수 필터) ──────────────────────────── 단독, 가장 단순
  ↓
T2 (기간 선택) + B1 수정 ───────────────── 기존 버그 함께 수정
  ↓
T3 (등급 배지) ──────────────────────────── T2와 같은 파일, 의존
  ↓
T4 (T3 점수 연동) + B3 수정 ─────────────── 가장 복잡, 마지막
```

**T1은 독립적**이므로 먼저 착수 가능. T2~T4는 `performance-client.tsx` 공유하므로 순차 진행 필수.
**B1(cohort 필터 버그)은 T2 착수 시 반드시 함께 수정** — 기간 선택 추가해도 기수 필터가 안 되면 의미 없음.
**T4 착수 전 T3 엔진 추출 설계 필요** — route.ts에서 순수 계산 로직만 `lib/protractor/t3-engine.ts`로 분리하는 설계를 먼저 확정할 것.
