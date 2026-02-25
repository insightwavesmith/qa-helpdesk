-- 타겟중복율 캐시 테이블
-- adset 조합별 overlap 결과를 캐싱하여 Meta API 호출 최소화

CREATE TABLE adset_overlap_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id text NOT NULL,
  adset_pair text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  overlap_data jsonb NOT NULL,
  cached_at timestamptz DEFAULT now(),
  UNIQUE(account_id, adset_pair, period_start, period_end)
);

-- RLS 활성화 (service_role만 접근 — API에서 createServiceClient 사용)
ALTER TABLE adset_overlap_cache ENABLE ROW LEVEL SECURITY;

-- TTL 만료 조회용 인덱스
CREATE INDEX idx_overlap_cache_ttl ON adset_overlap_cache(cached_at);
