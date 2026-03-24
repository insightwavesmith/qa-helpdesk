# TASK: 수집 구조 리팩토링 — Raw JSONB + 분기 처리

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## 배경
GCP 이관 완료 상태, 프로덕션 전환 전. 지금 수집 구조를 확정해야 나중에 마이그레이션 안 해도 됨.

## 변경 1: daily_ad_insights → Raw JSONB

### 현재
- Meta API에서 28개 필드만 뽑아서 28개 컬럼에 저장
- 새 필드 추가하면 DB 마이그레이션 필요

### 변경
```sql
ALTER TABLE daily_ad_insights ADD COLUMN raw_response JSONB;

-- 자주 쓰는 필드는 generated column으로 유지 (기존 코드 호환)
-- 이미 있는 컬럼은 그대로 두고, raw_response에도 전체 저장
-- 향후 새 필드는 raw_response에서 꺼내기
```

### collect-daily 수정
- Meta API 응답을 raw_response에 통째로 저장
- 기존 컬럼 매핑 코드는 유지 (호환)
- 점진적으로 generated column으로 전환

## 변경 2: 소재 수집 통합 + 분기 처리

### 현재
- collect-daily: 수강생 소재만 (source='member')
- collect-benchmark-creatives: 벤치마크만 (source='benchmark')
- 중복 가능

### 변경
- 수집은 전체 계정 소재 전부 (1건 = 1레코드)
- ad_id 기준 중복 체크 — 이미 있으면 스킵
- 태깅으로 분기:
  ```sql
  -- creatives 테이블에 플래그 추가
  ALTER TABLE creatives ADD COLUMN is_member BOOLEAN DEFAULT false;
  ALTER TABLE creatives ADD COLUMN is_benchmark BOOLEAN DEFAULT false;
  -- 수강생 계정이면 is_member=true
  -- 성과가 벤치마크 기준 넘으면 is_benchmark=true
  -- 둘 다 해당 가능
  ```

### 벤치마크 소재 수집 시
- 기존 creative_media에 있는 ad_id 제외
- LP(랜딩페이지)도 기존에 있는 것 제외하고 수집
- 수집 후 임베딩 크론 돌려서 벤치마크 소재+LP 임베딩

## 변경 3: 소재 raw 저장

### creative_media에도 raw 추가
```sql
ALTER TABLE creative_media ADD COLUMN raw_creative JSONB;
-- Meta API에서 받은 creative 정보 전체 저장
```

## 변경 4: LP 수집 시 기존 제외
- landing_pages에 이미 있는 lp_url 제외하고 수집
- 벤치마크 LP도 동일하게 처리

## 실행 순서
1. DB 스키마 변경 (ALTER TABLE 3개)
2. collect-daily 수정 (raw_response 저장 추가)
3. collect-benchmark-creatives 수정 (기존 ad_id 제외 + LP 제외)
4. creatives 테이블 is_member/is_benchmark 플래그 추가 + 기존 데이터 태깅
5. 벤치마크 소재+LP 수집 실행
6. 임베딩 크론 트리거
7. 빌드 검증 + 커밋

## 주의
- 기존 컬럼 삭제하지 마. generated column으로 전환하더라도 기존 코드 호환 유지
- raw_response는 Meta API 응답 그대로 — 가공하지 마
- 프로덕션 전환 전에 완료해야 함
