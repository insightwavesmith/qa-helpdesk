# TASK-벤치마크통합.md

## 목적
총가치각도기 점수 산출 시 creative_type 구분 없이 전체 데이터의 평균으로 벤치마크 기준값을 통일한다.

## 배경
- 데일리 수집은 SHARE, 벤치마크 수집은 CATALOG으로 분류 → 매칭 실패 → 점수 0점
- Smith님 결정: "카탈로그 광고에 단일동영상 많이 쓴다. creative_type 구분 의미 없다. 전체 평균으로."

---

## T1: 벤치마크 수집 — creative_type="ALL" 통합

### 이게 뭔지
벤치마크 수집(collect-benchmarks) 시 VIDEO/CATALOG/IMAGE별로 따로 계산하는 걸, 전체 데이터를 합쳐서 "ALL" 하나로 계산하도록 변경.

### 왜 필요한지
creative_type별 분리가 데일리와 안 맞아서 점수 산출이 깨진다. 전체 평균이 더 정확한 기준값.

### 구현 내용
- `src/app/api/cron/collect-benchmarks/route.ts`
- STEP 2 (L526~556): `creativeTypes = ["VIDEO", "IMAGE", "CATALOG"]` 루프 → 제거, 전체 데이터로 `creative_type: "ALL"` 행만 생성
- STEP 3 (L561~579): 카테고리별 벤치마크도 동일하게 ALL 통합
- 기존 VIDEO/CATALOG/IMAGE 개별 행은 더 이상 생성하지 않음
- **수집 자체(STEP 1)는 변경 없음** — 각 광고의 creative_type은 그대로 분류하고 저장, 벤치마크 "평균 계산"만 통합

---

## T2: 총가치 점수 — ALL 벤치마크만 조회

### 이게 뭔지
총가치 점수 산출(total-value API) 시 수강생의 dominant creative_type으로 벤치마크를 찾는 로직을 제거하고, 무조건 "ALL"로 조회.

### 왜 필요한지
T1에서 벤치마크를 ALL로만 생성하니까, 조회도 ALL로 통일해야 한다.

### 구현 내용
- `src/app/api/protractor/total-value/route.ts`
- `getDominantCreativeType()` 호출 제거 → `dominantCT = "ALL"` 고정
- `fetchBenchmarks()` 함수: creative_type 파라미터 → "ALL" 고정
- fallback 블록 (ALL 재조회) 삭제 — 이미 ALL로 조회하니까 불필요

---

## T3: 기존 벤치마크 DB 정리

### 이게 뭔지
기존 VIDEO/CATALOG 행 삭제, ALL 행만 유지.

### 왜 필요한지
코드가 ALL만 조회하는데 과거 데이터가 남아있으면 혼란.

### 구현 내용
- 기존 VIDEO/CATALOG/IMAGE 벤치마크 행 삭제 (SQL)
- ALL 행만 유지
- 벤치마크 재수집 트리거 (최신 데이터로 ALL 생성)

---

## 검증
- `npx tsc --noEmit` 통과
- 벤치마크 수집 API 호출 후 benchmarks 테이블에 ALL만 존재하는지 확인
- 총가치 API 호출 시 점수가 정상 산출되는지 확인 (0점이 아닌 값)
