# T5. 참여합계 제거 — Plan

> 작성일: 2026-03-04
> 스프린트: 총가치각도기 v5

## 1. 개요

- **기능**: 성과요약 탭 핵심 지표에서 "참여합계" 지표 카드 완전 제거
- **해결하려는 문제**: 성과요약 탭에 참여합계(`EngagementTotalCard`) 가 별도로 표시되어 핵심 지표 6개와 중복/혼란을 주고 있음
- **목업 기준**: `protractor-v5.html` 성과요약 탭은 게이지 + 등급 카드 + 핵심 지표 6개 + 타겟중복만 표시. `EngagementTotalCard` 해당 없음.

## 2. 현재 상태 분석

### 화면 구성 (현재)
성과요약 탭 렌더링 순서:
1. `TotalValueGauge` (showMetricCards=false)
2. **`EngagementTotalCard`** ← 제거 대상
3. `SummaryCards` (6개: 3초시청률/CTR/CPC/구매전환율/노출당구매확률/ROAS)
4. `OverlapAnalysis`

### 관련 코드 (`real-dashboard.tsx`)
- 라인 267~282: `engagementData` IIFE 계산 (diagnostics에서 참여율 파트 추출)
- 라인 283: `noBenchmarkFlag` 변수
- 라인 382~385: `<EngagementTotalCard>` 렌더링

### 콘텐츠 탭 참여 지표 현황
- `ContentRanking` 컴포넌트 → `content-ranking.tsx` → 광고별 14개 지표 표시 (참여합계/만노출 포함) → **유지**

## 3. 핵심 요구사항

### 기능적 요구사항
- FR-01: 성과요약 탭에서 `EngagementTotalCard` 컴포넌트 제거
- FR-02: 성과요약 탭 핵심 지표는 `SummaryCards` 6개만 유지 (3초시청률, CTR, CPC, 구매전환율, 노출당구매확률, ROAS)
- FR-03: 콘텐츠 탭 광고별 지표에서 참여합계/만노출 유지

### 비기능적 요구사항
- 점수 계산 로직(t3-engine) 변경 금지
- 콘텐츠 탭 변경 금지
- 타겟중복 분석 섹션 변경 금지

## 4. 범위

### 포함
- `real-dashboard.tsx`: `EngagementTotalCard` 렌더링 코드 제거
- `real-dashboard.tsx`: `engagementData`, `noBenchmarkFlag` 관련 코드 제거 (dead code 정리)
- `real-dashboard.tsx`: `EngagementTotalCard` import 제거

### 제외
- `EngagementTotalCard.tsx` 컴포넌트 파일 삭제 (다른 곳에서 참조 가능성 → 유지)
- T3 엔진 로직 수정
- `sample-dashboard.tsx` (해당 컴포넌트 미사용 확인 필요)
- 콘텐츠 탭 지표 변경

## 5. 성공 기준

- [ ] 성과요약 탭에 EngagementTotalCard가 더 이상 표시되지 않는다
- [ ] SummaryCards 6개(3초시청률/CTR/CPC/구매전환율/노출당구매확률/ROAS)는 정상 표시된다
- [ ] 콘텐츠 탭의 광고별 참여합계/만노출 지표가 그대로 유지된다
- [ ] `npm run build` 성공, TypeScript 에러 없음

## 6. 실행 순서

1. `real-dashboard.tsx` — `EngagementTotalCard` import 제거
2. `real-dashboard.tsx` — `engagementData` IIFE 코드 블록 제거
3. `real-dashboard.tsx` — `noBenchmarkFlag` 변수 제거 (T3 관련 사용처 없으면)
4. `real-dashboard.tsx` — `<EngagementTotalCard ...>` 렌더링 코드 제거
5. `sample-dashboard.tsx` — 동일 컴포넌트 사용 여부 확인 후 동일 처리
6. 빌드 확인
