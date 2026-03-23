# raw JSONB 수집 구조 설계서

## 1. 데이터 모델

### daily_ad_insights 변경

```sql
-- 새 컬럼 추가
ALTER TABLE daily_ad_insights ADD COLUMN raw_insight JSONB;
ALTER TABLE daily_ad_insights ADD COLUMN raw_ad JSONB;

-- raw_insight: Meta Insights API 응답 (actions, action_values, spend, impressions 등)
-- raw_ad: Meta Ad 정보 (name, creative, campaign 등)
```

**접근 방식**: generated column 대신 **BEFORE INSERT/UPDATE 트리거** 사용.

이유:
- PostgreSQL generated column은 ALTER로 기존 컬럼을 변환 불가
- 기존 데이터가 있어 DROP + RECREATE는 위험
- 트리거는 raw_insight가 있으면 자동 추출, 없으면 기존 값 유지
- 코드 변경 최소화: collect-daily에서 raw만 넣으면 트리거가 나머지 처리

### 트리거 설계

```sql
CREATE OR REPLACE FUNCTION fn_extract_daily_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- raw_insight가 있으면 자동 추출
  IF NEW.raw_insight IS NOT NULL THEN
    NEW.impressions := (NEW.raw_insight->>'impressions')::bigint;
    NEW.clicks := (NEW.raw_insight->>'clicks')::integer;
    NEW.spend := round((NEW.raw_insight->>'spend')::numeric, 2);
    NEW.reach := (NEW.raw_insight->>'reach')::integer;
    NEW.ctr := round((NEW.raw_insight->>'ctr')::numeric, 4);
    -- ... (나머지 직접 매핑 필드)

    -- actions 배열에서 추출
    NEW.purchases := (
      SELECT COALESCE(SUM((a->>'value')::int), 0)
      FROM jsonb_array_elements(NEW.raw_insight->'actions') a
      WHERE a->>'action_type' IN ('purchase', 'omni_purchase')
    );
    -- ... (나머지 action 기반 필드)
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### creatives 변경

```sql
ALTER TABLE creatives ADD COLUMN raw_creative JSONB;
-- Meta Creative API 응답 통째 저장
-- creative_type, lp_url 등은 기존 컬럼 유지 (트리거 또는 코드에서 추출)
```

## 2. API 설계

### collect-daily 변경
- Meta API 응답을 `raw_insight`, `raw_ad`에 통째 저장
- `calculateMetrics()` 함수는 트리거가 대체
- 코드에서는 date, account_id, ad_id + raw만 전달

### collect-benchmark-creatives 변경
- creative 정보를 `raw_creative`에 저장
- 기존 ad_id 제외 로직 유지 (이전 커밋에서 구현)

## 3. 컴포넌트 구조
변경 파일:
- `supabase/migrations/` — 새 마이그레이션 SQL
- `src/app/api/cron/collect-daily/route.ts` — raw 저장 방식
- `scripts/collect-benchmark-creatives.mjs` — raw_creative 저장
- `src/types/database.ts` — 타입 추가

## 4. 에러 처리
- raw_insight가 NULL이면 기존 방식 (수동 매핑) 동작 — 하위 호환
- 트리거 에러 시 INSERT 자체가 실패 → 로그로 확인

## 5. 구현 순서
1. [ ] 마이그레이션 SQL 작성 (컬럼 추가 + 트리거)
2. [ ] collect-daily route 수정 (raw 저장)
3. [ ] collect-benchmark-creatives 수정 (raw_creative)
4. [ ] 타입 정의 업데이트
5. [ ] 빌드 검증 + 커밋
