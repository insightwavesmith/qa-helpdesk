-- =============================================================================
-- Supabase Storage URL → GCS URL 일괄 변환
-- =============================================================================
--
-- 실행 전 반드시 DB 백업 또는 트랜잭션 안에서 실행
-- BEGIN; / ROLLBACK; 으로 드라이런 가능
--
-- Supabase URL 형식:
--   https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/{bucket}/{path}
--
-- GCS URL 형식:
--   https://storage.googleapis.com/bscamp-storage/{bucket}/{path}
--
-- 변환 규칙 (gcs-storage.ts convertSupabaseUrlToGcs 동일):
--   /storage/v1/object/public/{bucket}/{path}  →  /bscamp-storage/{bucket}/{path}
--
-- =============================================================================

-- GCS 기본 URL 상수 (Supabase project ID: symvlrsmkjlztoopbnht)
-- Supabase Storage URL prefix: https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public
-- GCS Storage URL prefix:      https://storage.googleapis.com/bscamp-storage

-- =============================================================================
-- 0. DRY RUN — 영향받는 행 수 먼저 확인
-- =============================================================================

-- 1. answers.image_urls (JSONB — 배열 형태)
--    예: ["https://symvlrsmkjlztoopbnht.supabase.co/.../image.jpg"]
SELECT
  'answers.image_urls' AS target,
  COUNT(*) AS affected_rows
FROM answers
WHERE image_urls::text LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';

-- 2. questions.image_urls (JSONB — 배열 형태)
SELECT
  'questions.image_urls' AS target,
  COUNT(*) AS affected_rows
FROM questions
WHERE image_urls::text LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';

-- 3. contents.thumbnail_url (TEXT)
SELECT
  'contents.thumbnail_url' AS target,
  COUNT(*) AS affected_rows
FROM contents
WHERE thumbnail_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';

-- 4. contents.body_md (TEXT — 마크다운 본문에 이미지 URL 포함 가능)
SELECT
  'contents.body_md' AS target,
  COUNT(*) AS affected_rows
FROM contents
WHERE body_md LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';

-- 5. contents.email_html (TEXT — 뉴스레터 HTML에 이미지 URL 포함 가능)
SELECT
  'contents.email_html' AS target,
  COUNT(*) AS affected_rows
FROM contents
WHERE email_html LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';

-- 6. contents.images (JSONB)
SELECT
  'contents.images' AS target,
  COUNT(*) AS affected_rows
FROM contents
WHERE images::text LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';

-- 7. contents.video_url (TEXT — 동영상 URL, Supabase Storage 업로드 가능)
SELECT
  'contents.video_url' AS target,
  COUNT(*) AS affected_rows
FROM contents
WHERE video_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';

-- 8. knowledge_chunks.image_url (TEXT)
SELECT
  'knowledge_chunks.image_url' AS target,
  COUNT(*) AS affected_rows
FROM knowledge_chunks
WHERE image_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';

-- 9. profiles.business_cert_url (TEXT)
--    NOTE: 신규 업로드는 이미 GCS URL 저장. 구 Supabase 업로드 데이터만 해당.
SELECT
  'profiles.business_cert_url' AS target,
  COUNT(*) AS affected_rows
FROM profiles
WHERE business_cert_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';

-- 10. reviews.image_urls (TEXT[] — 배열)
SELECT
  'reviews.image_urls' AS target,
  COUNT(*) AS affected_rows
FROM reviews
WHERE image_urls::text LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';

-- 11. creative_media.storage_url (TEXT)
--     NOTE: process-media 크론이 이미 GCS URL로 저장. 구 Supabase 데이터만 해당.
SELECT
  'creative_media.storage_url' AS target,
  COUNT(*) AS affected_rows
FROM creative_media
WHERE storage_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';

-- 12. creative_media.media_url (TEXT — Meta CDN URL이지만 혹시 Supabase URL 저장된 경우)
SELECT
  'creative_media.media_url' AS target,
  COUNT(*) AS affected_rows
FROM creative_media
WHERE media_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';

-- 13. creative_media.thumbnail_url (TEXT)
SELECT
  'creative_media.thumbnail_url' AS target,
  COUNT(*) AS affected_rows
FROM creative_media
WHERE thumbnail_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';

-- 14. creative_media.saliency_url (TEXT)
SELECT
  'creative_media.saliency_url' AS target,
  COUNT(*) AS affected_rows
FROM creative_media
WHERE saliency_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';

-- 15. lp_snapshots.screenshot_url
--     NOTE: 현재 코드는 상대 경로(GCS path)를 저장하므로 Supabase URL 없음.
--           구 데이터에 풀 URL이 저장된 경우를 대비하여 포함.
SELECT
  'lp_snapshots.screenshot_url' AS target,
  COUNT(*) AS affected_rows
FROM lp_snapshots
WHERE screenshot_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';

-- 16. lp_snapshots.cta_screenshot_url
SELECT
  'lp_snapshots.cta_screenshot_url' AS target,
  COUNT(*) AS affected_rows
FROM lp_snapshots
WHERE cta_screenshot_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';


-- =============================================================================
-- 1. 실제 UPDATE (주석 해제 후 실행 — 반드시 BEGIN/ROLLBACK으로 먼저 검증)
-- =============================================================================
--
-- 사용법:
--   BEGIN;
--   <UPDATE 구문 실행>
--   SELECT ... WHERE column LIKE '%supabase.co%';  -- 변환 후 0건이어야 함
--   ROLLBACK;  -- 검증만 할 때
--   COMMIT;    -- 실제 적용할 때

-- ─── 1-1. answers.image_urls (JSONB) ─────────────────────────────────────────
-- JSONB 텍스트 치환: jsonb_set은 배열 전체 순회가 필요하므로 regexp_replace 사용
/*
UPDATE answers
SET image_urls = regexp_replace(
  image_urls::text,
  'https://symvlrsmkjlztoopbnht\.supabase\.co/storage/v1/object/public',
  'https://storage.googleapis.com/bscamp-storage',
  'g'
)::jsonb
WHERE image_urls::text LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';
*/

-- ─── 1-2. questions.image_urls (JSONB) ───────────────────────────────────────
/*
UPDATE questions
SET image_urls = regexp_replace(
  image_urls::text,
  'https://symvlrsmkjlztoopbnht\.supabase\.co/storage/v1/object/public',
  'https://storage.googleapis.com/bscamp-storage',
  'g'
)::jsonb
WHERE image_urls::text LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';
*/

-- ─── 1-3. contents.thumbnail_url (TEXT) ──────────────────────────────────────
/*
UPDATE contents
SET thumbnail_url = replace(
  thumbnail_url,
  'https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public',
  'https://storage.googleapis.com/bscamp-storage'
)
WHERE thumbnail_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';
*/

-- ─── 1-4. contents.body_md (TEXT) ────────────────────────────────────────────
-- body_md에 마크다운 이미지 ![alt](URL) 형태로 Supabase URL이 포함된 경우
/*
UPDATE contents
SET body_md = replace(
  body_md,
  'https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public',
  'https://storage.googleapis.com/bscamp-storage'
)
WHERE body_md LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';
*/

-- ─── 1-5. contents.email_html (TEXT) ─────────────────────────────────────────
/*
UPDATE contents
SET email_html = replace(
  email_html,
  'https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public',
  'https://storage.googleapis.com/bscamp-storage'
)
WHERE email_html LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';
*/

-- ─── 1-6. contents.video_url (TEXT) ─────────────────────────────────────────
/*
UPDATE contents
SET video_url = replace(
  video_url,
  'https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public',
  'https://storage.googleapis.com/bscamp-storage'
)
WHERE video_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';
*/

-- ─── 1-7. contents.images (JSONB) ────────────────────────────────────────────
/*
UPDATE contents
SET images = regexp_replace(
  images::text,
  'https://symvlrsmkjlztoopbnht\.supabase\.co/storage/v1/object/public',
  'https://storage.googleapis.com/bscamp-storage',
  'g'
)::jsonb
WHERE images::text LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';
*/

-- ─── 1-7. knowledge_chunks.image_url (TEXT) ──────────────────────────────────
/*
UPDATE knowledge_chunks
SET image_url = replace(
  image_url,
  'https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public',
  'https://storage.googleapis.com/bscamp-storage'
)
WHERE image_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';
*/

-- ─── 1-8. profiles.business_cert_url (TEXT) ──────────────────────────────────
/*
UPDATE profiles
SET business_cert_url = replace(
  business_cert_url,
  'https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public',
  'https://storage.googleapis.com/bscamp-storage'
)
WHERE business_cert_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';
*/

-- ─── 1-9. reviews.image_urls (TEXT[]) ────────────────────────────────────────
-- TEXT[] 배열: 배열 전체를 텍스트로 변환 후 치환 → 다시 배열로 캐스팅
/*
UPDATE reviews
SET image_urls = regexp_replace(
  image_urls::text,
  'https://symvlrsmkjlztoopbnht\.supabase\.co/storage/v1/object/public',
  'https://storage.googleapis.com/bscamp-storage',
  'g'
)::text[]
WHERE image_urls::text LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';
*/

-- ─── 1-10. creative_media.storage_url (TEXT) ─────────────────────────────────
/*
UPDATE creative_media
SET storage_url = replace(
  storage_url,
  'https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public',
  'https://storage.googleapis.com/bscamp-storage'
)
WHERE storage_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';
*/

-- ─── 1-11. creative_media.media_url (TEXT) ───────────────────────────────────
/*
UPDATE creative_media
SET media_url = replace(
  media_url,
  'https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public',
  'https://storage.googleapis.com/bscamp-storage'
)
WHERE media_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';
*/

-- ─── 1-12. creative_media.thumbnail_url (TEXT) ───────────────────────────────
/*
UPDATE creative_media
SET thumbnail_url = replace(
  thumbnail_url,
  'https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public',
  'https://storage.googleapis.com/bscamp-storage'
)
WHERE thumbnail_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';
*/

-- ─── 1-13. creative_media.saliency_url (TEXT) ────────────────────────────────
/*
UPDATE creative_media
SET saliency_url = replace(
  saliency_url,
  'https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public',
  'https://storage.googleapis.com/bscamp-storage'
)
WHERE saliency_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';
*/

-- ─── 1-14. lp_snapshots.screenshot_url (TEXT) ────────────────────────────────
-- 현재 코드는 상대 GCS 경로 저장. 구 Supabase URL이 있는 경우만 실행.
/*
UPDATE lp_snapshots
SET screenshot_url = replace(
  screenshot_url,
  'https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public',
  'https://storage.googleapis.com/bscamp-storage'
)
WHERE screenshot_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';
*/

-- ─── 1-15. lp_snapshots.cta_screenshot_url (TEXT) ────────────────────────────
/*
UPDATE lp_snapshots
SET cta_screenshot_url = replace(
  cta_screenshot_url,
  'https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public',
  'https://storage.googleapis.com/bscamp-storage'
)
WHERE cta_screenshot_url LIKE '%symvlrsmkjlztoopbnht.supabase.co/storage%';
*/


-- =============================================================================
-- 2. 변환 후 검증 — 0건이어야 완료
-- =============================================================================

/*
SELECT 'answers.image_urls'             AS col, COUNT(*) FROM answers         WHERE image_urls::text       LIKE '%supabase.co/storage%'
UNION ALL
SELECT 'questions.image_urls',                  COUNT(*) FROM questions        WHERE image_urls::text       LIKE '%supabase.co/storage%'
UNION ALL
SELECT 'contents.thumbnail_url',                COUNT(*) FROM contents         WHERE thumbnail_url          LIKE '%supabase.co/storage%'
UNION ALL
SELECT 'contents.body_md',                      COUNT(*) FROM contents         WHERE body_md                LIKE '%supabase.co/storage%'
UNION ALL
SELECT 'contents.email_html',                   COUNT(*) FROM contents         WHERE email_html             LIKE '%supabase.co/storage%'
UNION ALL
SELECT 'contents.images',                       COUNT(*) FROM contents         WHERE images::text           LIKE '%supabase.co/storage%'
UNION ALL
SELECT 'contents.video_url',                     COUNT(*) FROM contents         WHERE video_url              LIKE '%supabase.co/storage%'
UNION ALL
SELECT 'knowledge_chunks.image_url',            COUNT(*) FROM knowledge_chunks WHERE image_url              LIKE '%supabase.co/storage%'
UNION ALL
SELECT 'profiles.business_cert_url',            COUNT(*) FROM profiles         WHERE business_cert_url      LIKE '%supabase.co/storage%'
UNION ALL
SELECT 'reviews.image_urls',                    COUNT(*) FROM reviews          WHERE image_urls::text       LIKE '%supabase.co/storage%'
UNION ALL
SELECT 'creative_media.storage_url',            COUNT(*) FROM creative_media   WHERE storage_url            LIKE '%supabase.co/storage%'
UNION ALL
SELECT 'creative_media.media_url',              COUNT(*) FROM creative_media   WHERE media_url              LIKE '%supabase.co/storage%'
UNION ALL
SELECT 'creative_media.thumbnail_url',          COUNT(*) FROM creative_media   WHERE thumbnail_url          LIKE '%supabase.co/storage%'
UNION ALL
SELECT 'creative_media.saliency_url',           COUNT(*) FROM creative_media   WHERE saliency_url           LIKE '%supabase.co/storage%'
UNION ALL
SELECT 'lp_snapshots.screenshot_url',           COUNT(*) FROM lp_snapshots     WHERE screenshot_url         LIKE '%supabase.co/storage%'
UNION ALL
SELECT 'lp_snapshots.cta_screenshot_url',       COUNT(*) FROM lp_snapshots     WHERE cta_screenshot_url     LIKE '%supabase.co/storage%';
*/


-- =============================================================================
-- 3. 코드 수정 필요 항목 (SQL이 아닌 코드 레벨)
-- =============================================================================
--
-- 다음 파일은 런타임에서 supabase.co URL을 감지하여 분기 처리하는 코드가 있음.
-- DB 마이그레이션 완료 후 해당 분기를 제거해야 함:
--
-- [1] src/components/posts/post-body.tsx:47
--     if (src.includes("supabase.co/storage")) {
--       → supabase.co 체크 제거, GCS URL이든 외부 URL이든 동일하게 figure로 래핑
--
-- [2] src/lib/gcs-storage.ts:39
--     convertSupabaseUrlToGcs()
--       → DB 마이그레이션 완료 후 이 함수는 더 이상 필요 없음
--         (현재 코드에서 호출하는 곳 없음 — 주석 또는 삭제 가능)
--
-- =============================================================================
