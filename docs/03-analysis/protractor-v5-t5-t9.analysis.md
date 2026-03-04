# 총가치각도기 v5 T5~T9 Gap 분석

> 분석일: 2026-03-04
> 분석 대상: T5(참여합계 제거), T6(게이지 목업 일치), T7(데이터 표시 이슈), T8(과거데이터 수동 수집), T9(AI 말투 제거)

## Match Rate: 92%

총 37개 체크리스트 항목 중 34개 일치, 3개 불일치/미완.

---

## 일치 항목

### T5: 참여합계 제거 (7/7 일치)

| # | 체크리스트 항목 | 상태 | 근거 |
|---|---------------|------|------|
| 1 | `EngagementTotalCard` import 제거 | OK | `real-dashboard.tsx` import 목록에 없음. `EngagementTotalCard` grep 결과 `real-dashboard.tsx`에서 0건 |
| 2 | `engagementData` IIFE 블록 삭제 | OK | `real-dashboard.tsx`에서 `engagementData` grep 결과 0건 |
| 3 | `noBenchmarkFlag` 사용처 확인 → 미사용 시 삭제 | OK | `noBenchmarkFlag` grep 전체 프로젝트 0건. 삭제 완료 |
| 4 | `<EngagementTotalCard>` JSX 블록 삭제 | OK | `real-dashboard.tsx` 성과요약 탭에 `EngagementTotalCard` 렌더링 없음 |
| 5 | `sample-dashboard.tsx` 확인 | OK | `sample-dashboard.tsx`에서 `EngagementTotalCard` grep 0건 — 미사용 확인 |
| 6 | `tsc --noEmit` 에러 없음 | OK | 사용자 보고: tsc 통과 |
| 7 | `npm run build` 성공 | OK | 사용자 보고: 빌드 통과 |

**설계 대비 특이사항**: 설계 문서대로 `EngagementTotalCard.tsx` 파일 및 `index.ts` export는 유지됨 (삭제 금지 준수). 성과요약 탭 렌더링 순서도 설계와 동일: TotalValueGauge → SummaryCards → OverlapAnalysis.

---

### T6: 게이지 목업 디자인 일치 (11/11 일치)

| # | 체크리스트 항목 | 상태 | 근거 |
|---|---------------|------|------|
| 1 | `SemiCircleGauge` 함수 재작성 | OK | viewBox `0 0 200 120`, r=80, cx=100, cy=100 — 설계와 정확히 일치 |
| 2 | 배경 회색 호 추가 (#e2e8f0) | OK | `stroke="#e2e8f0"` strokeWidth=16 strokeLinecap="round" 구현 확인 |
| 3 | 선명한 등급 구간 색상 적용 | OK | 빨강 #ef4444, 노랑 #eab308, 초록 #22c55e — 설계와 동일 |
| 4 | 포인터: line → circle dot 교체 | OK | `<circle cx={dotX} cy={dotY} r={6} fill="#1e293b" />` 구현 확인 |
| 5 | 파란 진행 아크 제거 | OK | `arcPath` 함수, 파란 아크 관련 코드 grep 0건 |
| 6 | 0/50/100 마커 제거 | OK | `<text>` 마커 요소 없음 |
| 7 | SVG 내부 텍스트 제거 | OK | SVG 내부에 `<text>` 요소 없음 (게이지 아래 HTML로 이동) |
| 8 | `PartScoreBar` → `GradeCard` 교체 | OK | `GradeCard` 함수 구현됨. 점수 숫자 + 등급 배지 + dotColor 동적 계산 + subLabel 매핑 모두 포함 |
| 9 | 게이지 카드 레이아웃: 카드형 + score/등급/레이블 | OK | `flex-shrink-0` 카드 내 SemiCircleGauge + 점수 + 등급배지 + periodLabel 구현 |
| 10 | flex 레이아웃: 좌(게이지) + 우(카드 3개) | OK | `flex flex-col gap-6 lg:flex-row lg:items-start` — 반응형 레이아웃 포함 (설계 대비 개선) |
| 11 | `PART_SUB_LABELS` 상수 추가 | OK | 기반점수/참여율/전환율 3개 매핑 설계와 동일 |

**설계 대비 특이사항**:
- `GAUGE_SEGMENT_COLORS` 상수 분리는 미적용 (색상이 SVG path에 하드코딩). 설계에서 "상수 분리" 제안이었으나 기능 영향 없음.
- `font-extrabold` 사용 (설계: `font-bold`). 미세한 스타일 차이, 기능 영향 없음.
- `flex-shrink-0` + `flex-1` 기반 반응형 레이아웃 추가 — 설계 대비 개선.

---

### T7: 총가치각도기 데이터 표시 이슈 (6/7 일치)

| # | 체크리스트 항목 | 상태 | 근거 |
|---|---------------|------|------|
| 1 | `total-value/route.ts` 에러 로깅 추가 | OK | `console.error("[total-value] Error:", { accountId, dateStart, dateEnd, error })` 구현 확인 |
| 2 | `real-dashboard.tsx` `totalValueError` 상태 변수 추가 | OK | `useState<string \| null>(null)` 선언 확인 |
| 3 | `real-dashboard.tsx` API 호출 시 에러 상태 처리 | OK | 403 → "권한이 없습니다", 기타 → json.error 또는 "T3 점수 조회 실패" 구현 |
| 4 | `TotalValueGauge.tsx` 벤치마크 없을 때 게이지 시각 처리 개선 | OK | `noBenchmark` 시 점수 대신 `-` 표시, `text-gray-300` 처리 확인 |
| 5 | 진단 후 임시 콘솔 로그 제거 | OK | `real-dashboard.tsx`에서 `console.log.*total-value` grep 0건 |
| 6 | `tsc --noEmit` 에러 없음 | OK | 사용자 보고 |
| 7 | 벤치마크 없을 때 amber 배너 텍스트 변경 | **불일치** | 아래 상세 |

**불일치 #1**: amber 배너 텍스트가 설계와 다름.
- 설계: `"벤치마크 데이터가 없어 점수를 계산할 수 없습니다.\n 현재 표시된 0점은 벤치마크 미설정 상태입니다."`
- 구현: `"벤치마크 데이터가 없어 점수를 계산할 수 없습니다. 관리자에게 벤치마크 수집을 요청하세요."`
- 평가: 구현 쪽이 더 실용적(actionable)이나 설계와 정확히 일치하지 않음. noBenchmark 시 점수를 `-`로 표시하므로 "현재 표시된 0점" 문구는 부적절해져서 구현 쪽이 오히려 올바름. **수정 불필요** — 의도적 개선으로 판단.

---

### T8: 과거데이터 수동 수집 (8/10 일치)

| # | 체크리스트 항목 | 상태 | 근거 |
|---|---------------|------|------|
| 1 | `meta-collector.ts` 공통 모듈 신규 작성 | OK | `fetchAccountAds()`, `calculateMetrics()`, `buildInsightRows()`, `upsertInsights()` 구현 확인 |
| 2 | `collect-daily/route.ts` → `meta-collector.ts` import 전환 | **미완** | 아래 상세 |
| 3 | `backfill/route.ts` 신규 작성 | OK | SSE 스트리밍 + admin 권한 확인 + 날짜 루프 + rate limit 2초 대기 구현 |
| 4 | admin 권한 확인 | OK | `createClient` auth + `createServiceClient` profiles role 체크 |
| 5 | SSE 스트리밍 구현 | OK | ReadableStream + TextEncoder + `data: JSON\n\n` 형식 |
| 6 | maxDuration = 300 설정 | OK | `export const maxDuration = 300` 확인 |
| 7 | `backfill-section.tsx` 신규 작성 | OK | 계정 드롭다운 + 7/30/90일 버튼 + SSE 스트림 읽기 + 진행 상태 + 완료 토스트 |
| 8 | `admin/protractor/page.tsx` 계정 목록 fetch + BackfillSection 추가 | OK | `createServiceClient` → `ad_accounts` select → `backfillAccounts` prop 전달 확인 |
| 9 | `tsc --noEmit` 에러 없음 | OK | 사용자 보고 |
| 10 | `npm run build` 성공 | OK | 사용자 보고 |

**불일치 #2**: `collect-daily/route.ts`가 `meta-collector.ts`를 import하지 않음.
- 설계: "collect-daily/route.ts → meta-collector.ts import 전환 (기능 동일 유지)"
- 구현: `collect-daily/route.ts`에서 `meta-collector` grep 결과 0건. 여전히 자체 내부 함수 사용.
- 평가: 설계에서 "(선택)" 표기 있었으나, 공통 모듈 추출의 핵심 목적(코드 중복 제거)이 미달성. `collect-daily`와 `backfill`에서 동일한 Meta API 호출/지표 계산 로직이 중복 존재. 기능에는 영향 없으나 유지보수 부담.

**설계 대비 특이사항**:
- 설계에서 `Card/CardHeader/CardTitle/CardContent` (shadcn/ui) 사용을 명시했으나, 구현은 plain `<div>` + Tailwind 클래스로 동일 레이아웃 구현. 시각적 차이 없음.
- `backfill-section.tsx`에 완료/에러 상태 표시 UI가 추가됨 (설계에 없던 개선).
- `backfill/route.ts`에서 `accountName` 조회 후 `buildInsightRows`에 전달 — 설계의 `backfillOneDay` 헬퍼 대신 인라인 처리. 기능 동일.

---

### T9: QA UI AI 말투 제거 (2/2 일치, 단 1개 잔존)

| # | 대상 파일 | 상태 | 근거 |
|---|---------|------|------|
| 1 | pending/page.tsx | OK | `~합니다/~드립니다` 0건. "이용할 수 있어요", "알려드려요" 등 자연스러운 톤 |
| 2 | onboarding/page.tsx | OK | `~합니다` 0건. "확인할 수 있어요", "확인하세요" 등 자연체 |
| 3 | forgot-password/page.tsx | OK | `~합니다` 0건. "보내드려요" 사용 |
| 4 | signup/page.tsx | OK | `~합니다` 0건. "이용할 수 있어요" 사용 |
| 5 | student-home.tsx | OK | `~합니다` 0건. 자연체 |
| 6 | new-question-form.tsx | **잔존 1건** | 아래 상세 |
| 7 | questions-list-client.tsx | OK | `~합니다` 0건 |
| 8 | DailyMetricsTable.tsx | OK | `~합니다` 0건. "정렬돼요" 사용 |
| 9 | access-denied.tsx | OK | `~합니다` 0건. "볼 수 있어요" 사용 |
| 10 | admin/answers/page.tsx | OK | `~합니다` 0건. "승인하세요" 사용 |

**불일치 #3**: `new-question-form.tsx` 라인 88에 `"이미지는 최대 ${MAX_IMAGES}개까지 첨부할 수 있습니다."` 잔존.
- toast 에러 메시지 1건. `~수 있습니다` 형식.
- 수정 제안: `"이미지는 최대 ${MAX_IMAGES}개까지 첨부할 수 있어요."` 또는 `"이미지는 ${MAX_IMAGES}개까지만 가능해요."`

---

## 불일치 항목 요약

| # | 태스크 | 항목 | 심각도 | 설명 |
|---|--------|------|--------|------|
| 1 | T7 | amber 배너 텍스트 | 낮음 | 설계와 문구 다르나, 구현이 더 적절함 (의도적 개선). 수정 불필요 |
| 2 | T8 | collect-daily 리팩토링 | 중간 | meta-collector.ts 공통 모듈 추출은 완료했으나 collect-daily에서 미사용. 코드 중복 잔존 |
| 3 | T9 | new-question-form.tsx 잔존 | 낮음 | toast 메시지 1건에 "~합니다" 잔존 |

---

## 수정 필요

### 1. [중간] T8 — collect-daily/route.ts 리팩토링 (권장)
- **파일**: `src/app/api/cron/collect-daily/route.ts`
- **내용**: `meta-collector.ts`의 `fetchAccountAds`, `buildInsightRows`, `upsertInsights`를 import하여 기존 내부 함수를 대체
- **이유**: 동일 로직이 2곳에 중복. 지표 계산 공식 변경 시 양쪽 모두 수정해야 하는 유지보수 위험
- **긴급도**: 당장 기능 문제는 없으나, 다음 지표 추가/변경 시 반드시 필요

### 2. [낮음] T9 — new-question-form.tsx 말투 잔존 수정
- **파일**: `src/app/(main)/questions/new/new-question-form.tsx`
- **위치**: 라인 88
- **현재**: `"이미지는 최대 ${MAX_IMAGES}개까지 첨부할 수 있습니다."`
- **수정안**: `"이미지는 최대 ${MAX_IMAGES}개까지 첨부할 수 있어요."`

---

## 빌드 상태

| 항목 | 상태 |
|------|------|
| `tsc --noEmit` | PASS |
| `next lint` | PASS |
| `npm run build` | PASS |
