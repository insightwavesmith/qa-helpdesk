# TASK: 사전계산 진단 캐시 3가지 버그 수정

## 배경
사전계산(`diagnosis-precompute.ts`)이 3/12에 도입된 후 총가치각도기 벤치마크 표시가 깨짐.
기존 실시간 진단(`aggregate.ts`)은 정상이었음. 사전계산 캐시가 끼어들면서 3군데 깨짐.

## 증상 → 수정 결과

### 1. ✅ 일부 소재에서 벤치마크 값+색상이 아예 안 나옴 (전부 회색)
**근본 원인**: 프론트 top5 ad_id ≠ 캐시 top5 ad_id (기간 차이). 캐시 미스 시 실시간 폴백 없이 빈 데이터 반환.
**수정**:
- `content-ranking.tsx`: `adIds` 파라미터를 API에 전달
- `route.ts`: `adIds`가 캐시에 모두 없으면 실시간 진단으로 폴백
- `route.ts`: 캐시 쿼리 limit 5→20 확대
- `precompute-scores.mjs`: 계정당 캐시 5→10개 확대
- `diagnosis-precompute.ts`: TOP_ADS_LIMIT 5→10 동기화

### 2. ✅ 구매전환율 0.00%인데 노랑(🟡)으로 표시
**근본 원인**: 이전 캐시가 camelCase로 저장되어 `key` 필드 누락 → `diagMetricMap`이 비어서 verdict 대신 기본 회색/노랑 표시.
**수정**: 캐시 snake_case 재생성 완료. 검증: 0%인 123건 전부 🔴 (정상).

### 3. ✅ 결제시작율 3.08% / 16.29%인데 노랑(🟡)
**근본 원인**: 증상 1과 동일. 캐시 미스로 diagnosis 데이터 없음 → 기본 표시.
**수정**: 검증: 벤치마크 75% 미만인데 🟡인 건 = 0건 (정상).

### 4. ⚠️ 이미지/카탈로그 탭에서 "데이터 없음"
**근본 원인**: `daily_ad_insights` 전체가 VIDEO 3,884건. IMAGE/CATALOG 행 = 0건. DB에 데이터 자체가 없음 (코드 버그 아님).
**원인 3 (TASK에 기술된)**: `ALL` 타입 벤치마크는 존재하며, `diagnoseAd()` fallback 체인 (`[CT] → ALL → VIDEO`)도 정상 작동.

## 수정된 파일
1. `src/app/api/diagnose/route.ts` — adIds 파라미터+캐시 커버리지 체크+실시간 폴백
2. `src/app/(main)/protractor/components/content-ranking.tsx` — adIds 전달+benchVal 조건 완화
3. `scripts/precompute-scores.mjs` — top10 캐시+배치 크기 5+딜레이 추가+실패 시 pending 리셋
4. `src/lib/precompute/diagnosis-precompute.ts` — TOP_ADS_LIMIT 10

## 검증 결과
- 캐시 175건 전부 snake_case, key 포함, 14개 메트릭
- 구매전환율 0%: 123건 전부 🔴
- 결제시작율 75% 미만+🟡: 0건
- tsc + build 통과

## 완료 조건 체크
1. ✅ 모든 소재에서 벤치마크 값+색상 정상 표시 (캐시 미스 → 실시간 폴백)
2. ✅ 0% 값 → 빨강 표시 (123건 검증)
3. ✅ 벤치마크 75% 미만 → 빨강, 75~100% → 노랑, 100%↑ → 초록 (일관)
4. ⚠️ 이미지/카탈로그: 데이터 자체 없음 (collect-daily가 VIDEO만 수집)
5. ✅ `tsc --noEmit` + `npm run build` 통과
