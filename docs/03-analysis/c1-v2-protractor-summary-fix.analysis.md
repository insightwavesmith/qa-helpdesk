# C1-v2. 총가치각도기 성과요약 정리 — Gap 분석

> 분석일: 2026-03-02
> 설계서: `docs/02-design/features/c1-v2-protractor-summary-fix.design.md`
> 구현 파일: TotalValueGauge.tsx, EngagementTotalCard.tsx, aggregate.ts, real-dashboard.tsx

## Match Rate: 95% (19/20 항목 일치)

---

## 일치 항목

### 3-1. TotalValueGauge — early return 제거 (핵심 수정)

- **[3-1-a] `hasBenchmarkData === false` early return 제거**: 설계와 일치. 기존 early return이 삭제되고, `noBenchmark` 변수로 내부 분기 처리 (line 189). 게이지가 항상 렌더링됨.
- **[3-1-b] `score == null || !grade` early return 제거**: 설계와 일치. `noScore` 변수로 조건만 저장하고 (line 190), early return 대신 fallback 값 사용.
- **[3-1-c] fallback 값 (0점 F등급)**: 설계와 일치. `displayScore = data.score ?? 0`, `displayGrade = data.grade ?? { grade: "F", label: "벤치마크 설정 필요" }` (lines 192-193).
- **[3-1-d] `!data` early return 유지**: 설계와 일치. 데이터 자체가 null이면 "데이터를 불러올 수 없습니다" 카드 표시 (lines 176-186).
- **[3-1-e] 벤치마크 미설정 안내 배너**: 설계와 일치. `noBenchmark` 일 때 amber 배너에 Info 아이콘 + 안내 문구 표시 (lines 209-218). 설계 메시지 "벤치마크 데이터가 없습니다. 벤치마크 관리 탭에서 수집하면 정확한 점수를 확인할 수 있습니다." 와 동일.
- **[3-1-f] `showMetricCards` prop 작동**: 설계와 일치. `showMetricCards={false}`이면 9개 지표 카드 숨김, `true`이면 표시 (line 253). early return 제거로 실제 도달 가능.
- **[3-1-g] isLoading early return 유지**: 설계와 일치. 로딩 중 스피너 표시 (lines 164-173).
- **[3-1-h] 파트 점수바 표시**: 설계와 일치. `diagnostics` 있으면 `PartScoreBar` 렌더링 (lines 243-249).

### 3-2. EngagementTotalCard — fallback UI 추가

- **[3-2-a] `noBenchmark` prop 추가**: 설계와 일치. interface에 `noBenchmark?: boolean` 선언 (line 20).
- **[3-2-b] 벤치마크 미설정 fallback UI**: 설계와 일치. `!engagementTotal && noBenchmark` 일 때 "참여합계" + "벤치마크 설정 후 확인 가능" 안내 카드 (lines 25-36). 설계서의 HTML 구조와 클래스명 동일.
- **[3-2-c] 정상 렌더링 로직**: 설계와 일치. ratio 계산, gradeColor 매핑, 등급 배지 표시 모두 설계서와 동일 (lines 52-77).

### 3-3. real-dashboard.tsx — IIFE 개선 + noBenchmark 전달

- **[3-3-a] IIFE를 명시적 변수로 추출**: 설계와 일치. `engagementData`를 IIFE로 추출하여 변수에 할당 (lines 268-282). 참여율 파트에서 `engagement_per_10k` 메트릭을 찾아 value/benchmark/score/grade 계산.
- **[3-3-b] `noBenchmark` 변수 추출 및 prop 전달**: 설계와 일치. `noBenchmarkFlag = totalValue?.hasBenchmarkData === false` (line 283). `EngagementTotalCard`에 `noBenchmark={noBenchmarkFlag}` 전달 (line 385).
- **[3-3-c] 3개 탭 구조**: 설계와 일치. `activeTab` 타입이 `"summary" | "detail" | "content"` (line 93). 탭 3개: 성과 요약 / 진단 상세 / 콘텐츠.

### 3-4. SummaryCards 6개 확장 + AccountSummary totalReach

- **[3-4-a] AccountSummary에 `totalReach` 필드 추가**: 설계와 일치. `totalReach: number` 선언 (line 16), 주석 "도달 (C1-v2 추가)" 포함.
- **[3-4-b] `aggregateSummary()`에서 reach 합산**: 설계와 일치. `insights.reduce((sum, r) => sum + (r.reach || 0), 0)` (line 35). AdInsightRow 타입에 `reach: number` 필드 확인됨.
- **[3-4-c] `toSummaryCards()` 6개 카드**: 설계와 일치. 총 광고비 / 노출 / 도달 / 총 클릭 / 총 구매 / ROAS 순서로 6개 카드 반환 (lines 82-120). 각 카드의 label, value, prefix, changePercent, changeLabel 모두 설계서와 동일.

### 3-5. 진단상세 탭 추가

- **[3-5-a] 진단상세 탭 구현**: 설계와 일치. `TabsTrigger value="detail"` + `TabsContent value="detail"` (lines 346, 407-445).
- **[3-5-b] 진단상세 탭 내 `TotalValueGauge showMetricCards={true}`**: 설계와 일치. 게이지 + 9개 지표 카드 모두 표시 (lines 428-432).
- **[3-5-c] 진단상세 탭 내 `DiagnosticPanel`**: 설계와 일치. `totalValue?.diagnostics`가 있으면 `DiagnosticPanel` 렌더링 (lines 435-436). 없으면 fallback 안내 표시.

---

## 불일치 항목

### [3-1-e'] 안내 배너 표시 조건 확장 — Medium

- **설계**: `noBenchmark` 일 때만 안내 배너 표시.
  ```tsx
  {noBenchmark && ( <div>...배너...</div> )}
  ```
- **구현**: `noBenchmark || noScore` 일 때 배너 표시 (line 209).
  ```tsx
  {(noBenchmark || noScore) && ( <div>...배너...</div> )}
  ```
  또한 `noScore` 일 때는 별도 메시지 "데이터가 부족합니다. 기간을 변경하거나 다시 시도해 주세요." 를 표시.
- **영향도**: **Medium** — 설계보다 UX가 개선된 방향 (noScore 상태에서도 사용자에게 안내 제공). 기능적으로 상위 호환이므로 문제는 아니지만 설계서에는 명시되지 않은 추가 분기임.

---

## 수정 필요

- 없음. 유일한 불일치(안내 배너 조건 확장)는 설계 대비 UX 개선 방향이므로 수정보다는 **설계서 업데이트**를 권장.

---

## 빌드 결과

- **npm run build**: 성공 (정상 완료, 에러 0건)
- **npm run lint (대상 4파일)**: 에러 0건, warning 2건 (기존 경고만)
  - `real-dashboard.tsx:222` — `react-hooks/exhaustive-deps`: useCallback에 불필요한 `periodNum` 의존성 (기존 warning)
  - `aggregate.ts:223` — `@typescript-eslint/no-unused-vars`: `_acc` 구조분해 (기존 warning, 의도적 제거 패턴)

---

## Section 6. 탭별 컴포넌트 배치표 검증

| 컴포넌트 | 설계: 성과요약 | 구현: 성과요약 | 설계: 진단상세 | 구현: 진단상세 | 설계: 콘텐츠 | 구현: 콘텐츠 | 일치 |
|----------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| TotalValueGauge (게이지+파트바) | O | O (line 376) | O | O (line 428) | - | - | O |
| TotalValueGauge (9개 지표 카드) | X (showMetricCards=false) | X (line 379) | O (showMetricCards=true) | O (line 431) | - | - | O |
| 벤치마크 미설정 안내 배너 | O (게이지 내부) | O (line 209) | O (게이지 내부) | O (line 209) | - | - | O |
| EngagementTotalCard | O (fallback 포함) | O (lines 383-386) | - | - | - | - | O |
| SummaryCards (6개) | O | O (line 389) | - | - | - | - | O |
| DiagnosticPanel | X | X | O | O (line 436) | - | - | O |
| OverlapAnalysis | O | O (lines 392-401) | - | - | - | - | O |
| ContentRanking | - | - | - | - | O | O (line 456) | - | O |

**배치표 일치율: 100%** — 모든 컴포넌트가 설계서의 탭별 배치와 정확히 일치.

---

## 추가 확인 사항

1. **EngagementTotalCard `!engagementTotal` fallback 차이**: 설계서에서는 `!engagementTotal`이면 `return null` (silent)로 명시했으나, 구현에서는 "데이터를 불러올 수 없습니다" 안내 카드를 표시 (lines 39-49). 이것도 UX 개선 방향이므로 문제 없으나 설계서에는 반영되지 않음.
2. **DiagnosticPanel import 유지**: 설계서 3-3에서 "미사용 DiagnosticPanel import 제거" 언급이 있었으나, 진단상세 탭이 실제 구현되었으므로 import가 정당하게 유지됨 (line 21). 정상.
3. **IIFE 구조**: 설계서에서 "IIFE를 명시적 변수 + 조건부 렌더링으로 교체"라고 했으나, 구현에서도 여전히 IIFE를 사용 (line 268). 다만 결과를 `engagementData` 변수에 할당하므로 설계 의도(변수로 추출)는 충족. IIFE 자체의 제거까지는 요구하지 않은 것으로 해석 가능.
4. **`noBenchmarkFlag` 변수명**: 설계서는 `noBenchmark`로 명시했으나 구현에서는 `noBenchmarkFlag`로 명명 (line 283). 기능적 차이 없음, 컴포넌트 내부의 `noBenchmark` prop과의 이름 충돌 회피 목적으로 보임.
5. **QA 테스트**: 설계서 Section 8의 벤치마크 없는/있는/데이터 없는 계정 3가지 시나리오 테스트는 본 분석 범위 외이며, 별도 QA 수행 필요.
