# T10-F4: ROAS 벤치마크 기준값 표시 제거 설계서

## 1. 데이터 모델
- 변경 없음. DB 스키마, API 응답 구조 모두 유지.

## 2. API 설계
- 변경 없음. 벤치마크 데이터 수집/저장 로직 유지.

## 3. 컴포넌트 구조

### 3-1. `src/lib/protractor/aggregate.ts`
- `toSummaryCards()` 함수에서 ROAS 카드의 벤치마크 정보를 null로 설정
- **변경**: `...bm("roas", ...)` → `benchmarkText: null, benchmarkGood: null, benchmarkAbove: null`
- 다른 지표(3초시청률, CTR, 구매전환율, 노출당구매확률)는 기존 `bm()` 호출 유지

### 3-2. `src/components/protractor/TotalValueGauge.tsx`
- 지표 카드(showMetricCards) 루프에서 `m.key === "roas"` 조건으로 "기준 대비 X%" 텍스트 숨김
- **변경**: line 311 부근, ROAS일 때 `-` 표시 또는 빈 문자열

### 3-3. `src/components/protractor/DiagnosticPanel.tsx`
- T3DiagnosticView: `m.key === "roas"` 조건으로 "기준 대비" 텍스트 숨김 (3곳)
- LegacyDiagnosticView: `m.name` 기준으로 ROAS 판별하여 숨김 (1곳)

### 3-4. `src/components/protractor/SummaryCards.tsx`
- 직접 수정 불필요. aggregate.ts에서 ROAS benchmarkText를 null로 주면 자동으로 숨겨짐.

## 4. 에러 처리
- 해당 없음 (UI 표시 제거만)

## 5. 구현 순서
- [ ] 1. `aggregate.ts`: toSummaryCards() ROAS 벤치마크 null 처리
- [ ] 2. `TotalValueGauge.tsx`: ROAS 지표 카드 기준값 숨김
- [ ] 3. `DiagnosticPanel.tsx`: ROAS 진단 기준값 숨김
- [ ] 4. tsc + build 검증
