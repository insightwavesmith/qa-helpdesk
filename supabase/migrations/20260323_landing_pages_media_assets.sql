-- landing_pages 테이블에 media_assets 컬럼 추가
-- 미디어 리소스 매핑 정보를 저장 (원본 URL → Storage 경로)

ALTER TABLE landing_pages
ADD COLUMN IF NOT EXISTS media_assets jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN landing_pages.media_assets IS '미디어 리소스 매핑 [{original_url, storage_path, type, size_bytes, hash}]';
