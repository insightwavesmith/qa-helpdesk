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

---

## TDD 보완 (테스트 주도 개발 지원)

### T1. 단위 테스트 시나리오

| 대상 함수/API | 입력 | 기대 출력 | 비고 |
|---------------|------|-----------|------|
| `GET /api/protractor/total-value` | `{ ad_account_id }` | 벤치마크 `creative_type: "ALL"` 사용 | VIDEO/IMAGE 분기 없음 |
| `fetchBenchmarks()` | (내부 호출) | `{ creative_type: "ALL", ...metrics }` | fallback 블록 삭제 확인 |
| `getDominantCreativeType()` | (호출 안 됨) | 함수 제거 또는 미사용 확인 | 코드에서 참조 0건 |

### T2. 엣지 케이스 정의

| 시나리오 | 입력/상황 | 기대 동작 |
|----------|-----------|-----------|
| ALL 행만 존재하는 DB | benchmarks에 ALL만 1행 | 정상 조회 |
| benchmarks 테이블 비어있음 | 0건 | 에러 또는 기본값 반환 |
| 레거시 VIDEO/IMAGE 행 잔존 | DB 정리 전 상태 | ALL 행만 조회 (WHERE creative_type='ALL') |
| 벤치마크 수집 직후 조회 | collect-benchmarks 직후 | 최신 ALL 데이터 반영 |

### T3. 모킹 데이터 (Fixture)

```json
// fixtures/benchmark-unification/benchmarks-all.json
{
  "id": "bench_001",
  "creative_type": "ALL",
  "ctr": 0.020,
  "cpc": 450,
  "cpm": 9500,
  "three_sec_rate": 0.30,
  "thruplay_rate": 0.10,
  "engagement_rate": 0.025,
  "reach_to_purchase_rate": 0.0012,
  "collected_at": "2026-03-28T00:00:00Z"
}

// fixtures/benchmark-unification/legacy-rows.json
[
  { "id": "bench_legacy_1", "creative_type": "VIDEO", "ctr": 0.018 },
  { "id": "bench_legacy_2", "creative_type": "IMAGE", "ctr": 0.022 },
  { "id": "bench_legacy_3", "creative_type": "CATALOG", "ctr": 0.015 }
]
```

### T4. 테스트 파일 경로 규약

| 테스트 파일 | 테스트 대상 | 프레임워크 |
|-------------|-------------|------------|
| `__tests__/benchmark-unification/total-value-all.test.ts` | 총가치 점수 ALL 벤치마크 조회 | vitest |
| `__tests__/benchmark-unification/no-fallback.test.ts` | fallback 블록 제거 확인 | vitest |
| `__tests__/benchmark-unification/db-cleanup.test.ts` | 레거시 행 삭제 검증 | vitest |
| `__tests__/benchmark-unification/fixtures/` | JSON fixture 파일 | - |
