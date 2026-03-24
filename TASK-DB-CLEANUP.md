# TASK: DB 전면 정리 (불필요 테이블 + 데이터 삭제)

## 배경
DB가 더러워서 판단 오류 발생. v1→v2 이관 과정에서 레거시 테이블과 데이터가 남아있음. 전수 조사해서 정리해라.

## 작업 범위

### 1단계: 전체 테이블 목록 뽑기
- Supabase에서 전체 public 테이블 목록 조회
- 각 테이블의 row 수, 마지막 업데이트 시점, 용도 파악

### 2단계: 코드에서 참조 여부 체크
- 전체 테이블에 대해 `grep -r "테이블명"` 으로 코드 참조 체크
- 참조 없는 테이블 = 삭제 후보
- 참조 있어도 v2로 대체된 테이블 = 코드 수정 후 삭제

### 3단계: 확실한 삭제 대상 (이미 파악된 것)
1. creative_element_analysis (862건) → analysis_json 통합됨
2. creative_intelligence_scores (358건) → analysis_json 통합됨
3. creative_element_performance (30건) → analysis_json 통합됨
4. lp_crawl_queue (1796건) → crawl-lps v2 대체
5. lp_structure_analysis (90건) → lp_analysis 통합됨
6. creative_lp_consistency (170건) → creative_lp_map 통합됨
7. ad_creative_embeddings (3107건) → creative_media 이관됨

### 4단계: 추가 삭제 후보 조사
- 테스트용 테이블, 임시 테이블, 빈 테이블
- 같은 데이터를 중복 저장하는 테이블
- 더 이상 사용 안 하는 기능의 테이블

### 5단계: 불필요 데이터 정리
- 테이블은 살리되 안 쓰는 row 삭제 (예: 삭제된 계정 데이터, 테스트 데이터)

## 순서
1. 전체 테이블 목록 + row 수 + 코드 참조 여부 → 리스트 작성
2. 삭제 후보 정리 (테이블명 + 사유 + row 수)
3. 코드에서 참조하는 삭제 대상 → v2 테이블로 코드 수정
4. tsc 빌드 확인
5. DROP TABLE 실행
6. 불필요 row 삭제
7. 커밋 + 결과 보고

## 주의
- DROP 전에 반드시 코드 참조 0건 확인
- 프론트 수동 수집 버튼(/api/protractor/collect-daily, collect-mixpanel)도 GCP Cloud Run 호출로 변경
- compute-fatigue-risk.mjs 등 분석 스크립트에서 ad_creative_embeddings 참조 특히 주의
