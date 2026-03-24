# TASK: Wave 1 — DB 스키마 변경 + 기존 데이터 교정

> CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라
> 코드리뷰 보고서: docs/03-analysis/collection-review.analysis.md 참조

## 배경
수집→저장→분석 구조 코드리뷰 완료. 13개 변경점 중 Wave 1(DB 스키마)부터 시작.
Wave 1은 모든 코드 변경의 전제조건이다.

## T1: Migration SQL

### creative_media 테이블 변경
```sql
-- 1. position 컬럼 추가 (카드별 식별자)
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS position INT DEFAULT 0;
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS card_total INT DEFAULT 1;

-- 2. UNIQUE(creative_id) 제거 → UNIQUE(creative_id, position)
ALTER TABLE creative_media DROP CONSTRAINT IF EXISTS creative_media_creative_id_key;
ALTER TABLE creative_media ADD CONSTRAINT creative_media_creative_position_unique
  UNIQUE (creative_id, position);

-- 3. 카드별 LP (슬라이드 카드마다 LP 다를 수 있음)
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS lp_id UUID REFERENCES landing_pages(id);

-- 4. 인덱스
CREATE INDEX IF NOT EXISTS idx_cm_position ON creative_media (creative_id, position);
```

### 기존 데이터 교정
- 기존 creative_media 데이터 → position=0 자동 (DEFAULT)
- creatives 테이블에서 CAROUSEL 재분류:
  - raw_creative JSONB에서 object_story_spec.template_data 있으면 → creative_type='CAROUSEL'
  - raw_creative에서 asset_feed_spec.images 2개 이상이면 → creative_type='CAROUSEL'
  - raw_creative가 NULL인 기존 데이터는 현재 분류 유지 (재수집 시 교정)

```sql
-- CAROUSEL 재분류 (raw_creative가 있는 것만)
UPDATE creatives 
SET creative_type = 'CAROUSEL'
WHERE raw_creative IS NOT NULL
  AND creative_type != 'CAROUSEL'
  AND (
    raw_creative->'object_story_spec'->'template_data' IS NOT NULL
    OR jsonb_array_length(COALESCE(raw_creative->'asset_feed_spec'->'images', '[]'::jsonb)) > 1
  );
```

## T2: database.ts 타입 업데이트

`src/types/database.ts`에 추가:
- creative_media 타입에 `position`, `card_total`, `lp_id` 추가
- creatives의 creative_type에 'CAROUSEL' 추가

## 검증

1. Migration SQL을 Cloud SQL에 실행
2. 기존 데이터 정합성 확인:
   - `SELECT count(*) FROM creative_media WHERE position = 0` — 전체와 같아야 함
   - `SELECT creative_type, count(*) FROM creatives GROUP BY creative_type` — CAROUSEL 카운트 확인
3. UNIQUE 제약 변경 확인:
   - `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'creative_media'`
4. tsc + build 통과

## 주의사항
- onConflict("creative_id") 사용하는 코드 → onConflict("creative_id,position")으로 변경 필요 (collect-daily, collect-benchmark)
- 이 코드 변경도 이 TASK에 포함 (UNIQUE 바꾸면 바로 깨지니까)
- embed-creatives의 maybeSingle() → 이건 Wave 3에서 처리
