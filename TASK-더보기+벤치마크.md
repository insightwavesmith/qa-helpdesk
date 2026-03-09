# TASK: 더보기 수정 + 벤치마크 카테고리 제거

## 이게 뭔지

1. 경쟁사 분석기 "더보기" 페이지네이션이 작동하지 않는 버그 수정
2. 벤치마크 수집 로직에서 카테고리별 분리 계산을 제거하고 전체 광고 합산으로 변경

## 왜 필요한지

- 더보기: 수강생이 경쟁사 광고를 20개 이상 볼 수 없음
- 벤치마크: 카테고리별로 쪼개면 샘플 수가 극소(1~6개)여서 벤치마크로 의미 없음. 전체 광고 합산이 원래 방식이었고 가장 정확함

## 구현 내용

### T1: 더보기 페이지네이션 수정
- **파일**: `src/lib/meta-ad-library.ts` 162~187줄 부근
- **원인**: page_token 분기에서 `ad_active_status=active` 파라미터 누락
- **수정**: page_token 분기에 `url.searchParams.set("ad_active_status", "active")` 추가
- 첫 검색과 동일한 파라미터 셋에 page_token만 추가되도록 통일

### T2: 벤치마크 카테고리 분리 제거
- **파일**: `src/app/api/cron/collect-benchmarks/route.ts`
- **수정 내용**:
  - STEP 0 (계정 카테고리 분류) 로직은 유지 (수집/저장은 계속)
  - STEP 2 (벤치마크 계산)에서 카테고리별 for문 제거 → 전체 광고 합산으로 변경
  - 조합: `(소재타입 × 랭킹종류 × 랭킹등급)` — 카테고리 축 없음
  - STEP 3 (MEDIAN_ALL)도 동일하게 카테고리 없이 전체 합산
  - benchmarks UPSERT의 onConflict에서 category 제거
  - commit `de8bc30`의 원래 방식(카테고리 미적용) 참고
- **파일**: `src/app/api/protractor/total-value/route.ts`
  - 벤치마크 조회 시 카테고리 관련 조건 제거 (있다면)
- **파일**: `src/app/(main)/protractor/components/benchmark-admin.tsx`
  - 카테고리 관련 표시 제거 (있다면)

### T3: 벤치마크 재수집 실행
- T2 수정 후 `npm run build` 성공 확인
- 수동 재수집은 하지 마라 (빌드 검증만)

## 하지 말 것
- 카테고리 수집/저장 로직 삭제하지 마라 (STEP 0은 유지)
- classify-account.ts 수정하지 마라
- DB 마이그레이션 직접 실행하지 마라 (스키마 변경 필요하면 SQL만 작성)
