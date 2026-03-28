# 벤치마크 통합 설계서

## 1. 데이터 모델

### benchmarks 테이블 (변경 없음, 데이터만 정리)
- `creative_type`: 기존 VIDEO/IMAGE/CATALOG/ALL 중 **ALL만 유지**
- unique constraint: `(creative_type, ranking_type, ranking_group, date, category)`

### 정리 SQL
```sql
DELETE FROM benchmarks WHERE creative_type != 'ALL';
```

## 2. API 변경

### `GET /api/protractor/total-value`

#### Before
```ts
const dominantCT = getDominantCreativeType(rows);
const benchMap = await fetchBenchmarks(svc, dominantCT);
```

#### After
```ts
const benchMap = await fetchBenchmarks(svc);
```

### fetchBenchmarks() 수정
- `dominantCT` 파라미터 제거, 내부에서 `creative_type = "ALL"` 고정
- fallback 블록(44~63행) 삭제 — 항상 ALL만 조회하므로 불필요

```ts
async function fetchBenchmarks(svc: any): Promise<Record<string, BenchEntry>> {
  const benchMap: Record<string, BenchEntry> = {};
  try {
    const benchSvc = svc as any;
    const { data: latestBench } = await benchSvc
      .from("benchmarks")
      .select("calculated_at")
      .order("calculated_at", { ascending: false })
      .limit(1);
    if (!latestBench || latestBench.length === 0) return benchMap;
    const latestAt = (latestBench[0].calculated_at as string).slice(0, 10);

    const { data: rows } = await benchSvc
      .from("benchmarks")
      .select("*")
      .eq("creative_type", "ALL")
      .in("ranking_group", ["ABOVE_AVERAGE", "above_avg"])
      .gte("calculated_at", latestAt);

    if (!rows || rows.length === 0) return benchMap;

    for (const row of rows as Record<string, unknown>[]) {
      for (const def of ALL_METRIC_DEFS) {
        const val = row[def.key];
        if (val != null && typeof val === "number" && benchMap[def.key] == null) {
          benchMap[def.key] = val;
        }
      }
    }
  } catch {
    // 벤치마크 없어도 T3 계산 가능
  }
  return benchMap;
}
```

## 3. 컴포넌트 구조
- 프론트엔드 변경 없음 (API 응답 형태 동일)

## 4. 에러 처리
- 벤치마크 없음 → 기존과 동일 (빈 benchMap, hasBenchmarkData=false)

## 5. 구현 순서
- [ ] T2: `total-value/route.ts` — getDominantCreativeType 제거, fetchBenchmarks 단순화
- [ ] T2: `t3-engine.ts`에서 getDominantCreativeType export는 유지 (다른 곳 사용 가능성)
- [ ] T3: Supabase SQL로 `creative_type != 'ALL'` 행 삭제
- [ ] 빌드 검증

---

## TDD 보완 (테스트 주도 개발 지원)

### T1. 단위 테스트 시나리오

| 함수 | 입력 | 기대 출력 | 검증 포인트 |
|------|------|----------|------------|
| `fetchBenchmarks(svc)` | benchmarks에 ALL 행 존재 | `Record<string, BenchEntry>` (각 메트릭별 값 매핑) | creative_type="ALL" 고정 조회 |
| `fetchBenchmarks(svc)` | benchmarks 테이블 비어있음 | `{}` (빈 객체) | 벤치마크 없을 때 안전 반환 |
| `fetchBenchmarks(svc)` | ALL 행만 존재 (VIDEO/IMAGE 행 없음) | 정상 결과 반환 | ALL만으로 동작 확인 |
| `getDominantCreativeType(rows)` | (export 유지 확인) | 기존 반환값 | 다른 곳 사용 가능성 위해 export 유지 확인 |

### T2. 엣지 케이스 정의

| # | 엣지 케이스 | 입력 조건 | 기대 동작 | 우선순위 |
|---|-----------|---------|---------|---------|
| E1 | benchmarks 테이블 비어있음 | 벤치마크 데이터 0건 | 빈 benchMap 반환, hasBenchmarkData=false | P0 |
| E2 | creative_type='ALL' 행만 존재 | VIDEO/IMAGE 행 삭제 후 | 정상 동작 (ALL만 조회) | P0 |
| E3 | calculated_at 날짜 필터 | 여러 날짜의 벤치마크 존재 | 최신 calculated_at 날짜의 행만 조회 | P1 |
| E4 | ranking_group 대소문자 | "ABOVE_AVERAGE" + "above_avg" 혼재 | 두 값 모두 in 필터로 매칭 | P1 |
| E5 | 메트릭 값 null | 특정 메트릭 컬럼이 null | 해당 메트릭 스킵 (benchMap에 미포함) | P2 |

### T3. 모킹 데이터 (Fixture)

```json
// fixture: benchmarks_all_type — ALL 타입 벤치마크 행
{
  "id": "bench-uuid-001",
  "creative_type": "ALL",
  "ranking_type": "metric",
  "ranking_group": "ABOVE_AVERAGE",
  "date": "2026-03-20",
  "category": null,
  "ctr": 2.1,
  "video_p3s_rate": 45.0,
  "engagement_per_10k": 85.0,
  "click_to_purchase_rate": 3.5,
  "roas": 4.2,
  "calculated_at": "2026-03-20T04:00:00Z"
}
```

### T4. 테스트 파일 경로 규약

| 테스트 대상 | 테스트 파일 경로 | 테스트 프레임워크 |
|-----------|---------------|----------------|
| `fetchBenchmarks` 함수 | `__tests__/benchmark-unification/fetch-benchmarks.test.ts` | vitest |
| `total-value/route.ts` 통합 | `__tests__/benchmark-unification/total-value-route.test.ts` | vitest |

### T5. 통합 테스트 시나리오

| 시나리오 | Method | Endpoint | 요청 Body | 기대 응답 | 상태 코드 |
|---------|--------|----------|----------|---------|---------|
| 벤치마크 조회 (ALL 타입) | GET | `/api/protractor/total-value` | (인증 + account_id) | 응답에 benchmarkData 포함, creative_type 분기 없음 | 200 |
| 벤치마크 없음 | GET | `/api/protractor/total-value` | benchmarks 테이블 비어있음 | hasBenchmarkData=false, T3 점수 계산은 정상 | 200 |
| creative_type != 'ALL' 삭제 확인 | SQL | `SELECT count(*) FROM benchmarks WHERE creative_type != 'ALL'` | - | 0건 | - |
