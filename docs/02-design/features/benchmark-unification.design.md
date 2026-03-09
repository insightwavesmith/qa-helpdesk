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
