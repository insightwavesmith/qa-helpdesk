# TASK-코드리뷰.md

## 목적
현재 코드 구조를 분석하고, 아래 2개 영역의 문제를 파악해서 리포트 작성.
코드 수정은 하지 않는다. 분석만.

---

## T1: 벤치마크 × 총가치각도기 점수 산출 구조 분석

### 이게 뭔지
수강생의 총가치각도기 점수를 계산할 때, 벤치마크 기준값을 creative_type(VIDEO/CATALOG/IMAGE)별로 따로 가져오는데, 데일리 수집과 벤치마크 수집의 creative_type 분류가 다르다.

### 왜 필요한지
- 데일리 수집: Meta API `object_type`을 그대로 저장 (SHARE, VIDEO)
- 벤치마크 수집: `object_type`을 변환 (SHARE→CATALOG, VIDEO→VIDEO)
- 결과: 같은 광고가 데일리에선 SHARE, 벤치마크에선 CATALOG → 매칭 실패 → 점수 0점
- Smith님 결정: **creative_type 구분 없이 전체 데이터의 평균값으로 벤치마크 통일**

### 분석 내용
1. `src/lib/protractor/meta-collector.ts` — `getCreativeType()` 함수: 데일리 수집 분류 로직
2. `src/app/api/cron/collect-benchmarks/route.ts` — `getCreativeType()` 함수: 벤치마크 수집 분류 로직
3. `src/app/api/protractor/total-value/route.ts` — `fetchBenchmarks()` 함수: 점수 산출 시 벤치마크 조회 로직
4. 현재 매칭 흐름도 그려라: 데일리에서 dominantCT 추출 → 벤치마크 조회 → fallback → 점수 계산
5. Smith님 결정사항 반영 시 변경 범위 분석: "모든 수집 데이터 평균으로 통일"하려면 어디를 어떻게 바꿔야 하는지

---

## T2: 정보공유 × 큐레이션 × 콘텐츠 관리 구조 분석

### 이게 뭔지
관리자 화면의 "콘텐츠 관리" 탭과 "큐레이션" 탭에 표시되는 데이터의 분류 기준이 불명확하다.

### 왜 필요한지
- 큐레이션 탭: 크롤러가 수집한 원본 데이터
- 콘텐츠 탭: 큐레이션에서 "정보공유 생성"을 누른 것만 표시돼야 함
- 현실: 콘텐츠 탭에 예상보다 많은 데이터가 표시됨
- 썸네일 관련: (1) 기존 썸네일 표시 안 됨 (2) 삭제 불가, 변경만 가능

### 분석 내용
1. `contents` 테이블의 `source_type` 값 목록과 각 의미
2. 큐레이션 탭 쿼리: 어떤 source_type을 보여주는지
3. 콘텐츠 탭 쿼리: 어떤 source_type을 보여주는지 (현재 `info_share` 필터)
4. "정보공유 생성" 버튼 클릭 시 어떤 source_type으로 저장되는지
5. 정보공유 외에 콘텐츠 탭에 떠야 하는 항목이 있는지 (공지사항 등)
6. 썸네일 업로드/표시/삭제 코드 흐름
7. `content-images` Storage 버킷 RLS 정책 상태
8. 전체 데이터 흐름도: 크롤러 → 큐레이션 탭 → "정보공유 생성" → 콘텐츠 탭 → 수강생 화면

---

## 산출물
`docs/reviews/code-review-benchmarks-content.md`에 분석 결과 작성.
각 T별로 현재 구조, 문제점, 수정 방향 포함.
