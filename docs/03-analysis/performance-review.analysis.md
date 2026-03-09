# 성능 코드 리뷰 Gap 분석

## Match Rate: 100%

## 설계 대비 구현 일치 항목

### T1. SWR 프리페치 검증 ✅
- 프리페치 키 3개 (`PROTRACTOR_ACCOUNTS`, `COMPETITOR_MONITORS`, `SALES_SUMMARY`) 모두 페이지에서 동일한 `SWR_KEYS` 상수 사용 → 키 일치 확인
- `dedupingInterval: 60_000`, `revalidateOnFocus: false` — 적절
- `monitor-panel.tsx`의 `onSuccess → setMonitors` 이중 관리 패턴은 P1-9로 별도 추적 (이번 스코프 밖)
- **수정 불필요** (키 불일치 0건)

### T2. overlap API 병렬화 ✅
- 설계: 순차 → Promise.allSettled 병렬 (concurrency 5) → **구현 일치**
- 에러 격리: allSettled이므로 개별 pair 실패 시 나머지 정상 → **구현 일치**
- 기존 캐시 upsert 로직 유지 → **구현 일치**
- deadline 55초 체크 유지 → **구현 일치**
- 예상 효과: 28쌍 기준 55초 → ~12초 (6 chunks × ~2초)

### T3. total-value limit 제거 ✅
- 설계: `.select("*").limit(1000)` → 필요 컬럼만 select + limit 제거 → **구현 일치**
- 실제 select: `spend,impressions,reach,clicks,purchases,purchase_value,date,ad_id,adset_id,initiate_checkout,video_p3s_rate,thruplay_rate,retention_rate,reactions_per_10k,comments_per_10k,shares_per_10k,saves_per_10k,creative_type`
- `computeMetricValues()` 에서 사용하는 모든 필드 포함 확인

### T4. daily_ad_insights 안전장치 ✅
- 설계: 기본 90일 + limit 10000 + 필요 컬럼 select → **구현 일치**
- start/end 미입력 시 기본 90일 적용
- `.limit(10000)` OOM 방지 상한 추가
- 명시적 컬럼 select (30+ 컬럼 → 프론트에서 사용하는 필드만)

## 불일치 항목
없음

## 빌드 검증
- `npm run build` ✅ 성공

## 변경 파일 목록
1. `src/app/api/protractor/overlap/route.ts` — T2 병렬화
2. `src/app/api/protractor/total-value/route.ts` — T3 limit 제거 + select 최적화
3. `src/app/api/protractor/insights/route.ts` — T4 안전장치
