# 벤치마크 통합 Plan

## 배경
총가치각도기 점수 산출 시 creative_type(VIDEO/IMAGE/CATALOG)별로 벤치마크를 구분 조회하던 구조를 폐기하고, 전체 데이터 평균(ALL)으로 기준값을 통일한다.

## 왜 필요한지
- creative_type별 샘플 수가 적어 벤치마크 신뢰도 낮음
- fallback 분기 등 불필요한 복잡도 발생
- T1(수집)은 이미 ALL로 변경 완료 → 조회/정리만 남음

## 범위

### T1: 벤치마크 수집 (완료)
- `collect-benchmarks/route.ts` STEP 2에서 `creative_type: "ALL"` 적용 완료

### T2: 총가치 점수 — ALL 벤치마크만 조회
- 파일: `src/app/api/protractor/total-value/route.ts`
- `getDominantCreativeType()` 호출 제거, `dominantCT = "ALL"` 고정
- `fetchBenchmarks()` 내 fallback 블록 삭제 (항상 ALL 조회)

### T3: 기존 벤치마크 DB 정리
- `benchmarks` 테이블에서 `creative_type != 'ALL'` 행 삭제
- VIDEO/IMAGE/CATALOG 행 제거, ALL 행만 유지

## 성공 기준
- 총가치 점수 API가 creative_type 무관하게 ALL 벤치마크만 사용
- `npm run build` 성공
- DB에 ALL 외 creative_type 행 없음
