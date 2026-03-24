# Wave 1: DB 스키마 변경 설계서

## 1. 데이터 모델

### creative_media 변경
```sql
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS position INT DEFAULT 0;
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS card_total INT DEFAULT 1;
ALTER TABLE creative_media DROP CONSTRAINT IF EXISTS creative_media_creative_id_key;
ALTER TABLE creative_media ADD CONSTRAINT creative_media_creative_position_unique UNIQUE (creative_id, position);
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS lp_id UUID REFERENCES landing_pages(id);
```

### creatives CAROUSEL 재분류
```sql
UPDATE creatives SET creative_type = 'CAROUSEL'
WHERE raw_creative IS NOT NULL AND creative_type != 'CAROUSEL'
  AND (raw_creative->'object_story_spec'->'template_data' IS NOT NULL
    OR jsonb_array_length(COALESCE(raw_creative->'asset_feed_spec'->'images', '[]'::jsonb)) > 1);
```

## 2. API 변경
- collect-daily:659 — onConflict "creative_id" → "creative_id,position"
- collect-benchmark:282 — sbUpsert 3rd arg "creative_id" → "creative_id,position"
- analyze-competitors:368 — onConflict "creative_id" → "creative_id,position"
- 각 upsert row에 position: 0 명시 추가 (DEFAULT이지만 안전)

## 3. 에러 처리
- UNIQUE 제약 변경 시 기존 데이터 position=0 (DEFAULT) → 충돌 없음
- onConflict 변경 안 하면 UNIQUE 제약 불일치로 upsert 실패

## 4. 구현 순서
1. [ ] Migration SQL 작성
2. [ ] collect-daily onConflict + position 추가
3. [ ] collect-benchmark onConflict + position 추가
4. [ ] analyze-competitors onConflict + position 추가
5. [ ] 빌드 검증
