-- 00023: 콘텐츠 큐레이션 대시보드
-- contents 테이블에 AI 분석 + 큐레이션 상태 컬럼 추가

-- 1. 신규 컬럼 추가
ALTER TABLE contents ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS importance_score INT DEFAULT 0;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS key_topics TEXT[] DEFAULT '{}';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS curation_status TEXT DEFAULT 'new';

-- 2. CHECK 제약
ALTER TABLE contents ADD CONSTRAINT chk_importance_score
  CHECK (importance_score >= 0 AND importance_score <= 5);

ALTER TABLE contents ADD CONSTRAINT chk_curation_status
  CHECK (curation_status IN ('new', 'selected', 'dismissed', 'published'));

-- 3. 인덱스
CREATE INDEX IF NOT EXISTS idx_contents_curation_status ON contents(curation_status);
CREATE INDEX IF NOT EXISTS idx_contents_importance ON contents(importance_score DESC);

-- 4. 기존 crawl/youtube 데이터 소급 (DEFAULT가 기존 행에 적용되지 않으므로 명시적 UPDATE)
UPDATE contents
SET curation_status = 'new'
WHERE source_type IN ('crawl', 'youtube')
  AND curation_status IS NULL;
