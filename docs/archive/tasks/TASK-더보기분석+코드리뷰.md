# TASK: 더보기 버그 분석 + 벤치마크 코드리뷰

## 이게 뭔지

경쟁사 분석기(`/protractor/competitor`)의 "더보기" 페이지네이션이 여전히 작동하지 않는다.
이미 5차례 수정(1484ca8, 3c50f58 등)했지만 또 안 됨.

추가로, 벤치마크 수집 로직(`collect-benchmarks`)에 대한 코드리뷰가 필요하다.

## 왜 필요한지

- 더보기: 수강생이 경쟁사 광고를 20개 이상 볼 수 없음. 핵심 기능이 막혀있는 상태
- 벤치마크: 카테고리별 분리 계산 → 전체 광고 합산으로 변경 예정. 변경 전 현재 코드 상태 파악 필요

## 구현 내용

### T1: 더보기 버그 원인 분석 + 보고
- 현재 동작: "더보기" 버튼 클릭 시 추가 광고가 로드되지 않음
- 기대 동작: 다음 20개 광고가 정상 로드
- **분석할 파일:**
  - `src/app/(main)/protractor/components/competitor-dashboard.tsx` (handleLoadMore)
  - `src/lib/meta-ad-library.ts` (page_token 처리)
  - `src/app/api/competitor/ads/route.ts` (API)
- **수정하지 말고 원인만 분석해서 보고해라**
- 보고 포맷: 원인 / 영향 범위 / 수정 방향 제안

### T2: 벤치마크 수집 로직 코드리뷰
- 대상 파일:
  - `src/app/api/cron/collect-benchmarks/route.ts`
  - `src/app/api/protractor/benchmarks/route.ts`
  - `src/app/(main)/protractor/components/benchmark-admin.tsx`
  - `src/app/api/protractor/total-value/route.ts`
- 리뷰 관점:
  - 현재 카테고리별 분리 계산 로직 위치 파악
  - 프론트에서 카테고리 필터 없이 전부 보여주는 부분 파악
  - total-value API에서 벤치마크 가져올 때 카테고리 처리 방식
- **수정하지 말고 분석 결과만 보고해라**

## 하지 말 것
- 코드 수정하지 마라 (분석/보고만)
- 커밋하지 마라
- 빌드 돌리지 마라
