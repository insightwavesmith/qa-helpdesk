-- P0-1: RAG Layer 0 — Knowledge Base 통합 마이그레이션
-- lecture_chunks → knowledge_chunks rename + VIEW 하위호환
-- 새 컬럼 추가 + 인덱스 + contents 확장 + priority 일괄 설정 + RLS 보안 수정

-- ============================================
-- 1) 테이블 rename + VIEW (하위호환)
-- ============================================
ALTER TABLE lecture_chunks RENAME TO knowledge_chunks;

CREATE VIEW lecture_chunks AS SELECT * FROM knowledge_chunks;
-- 기존 코드 하위호환: match_lecture_chunks RPC 등이 VIEW를 통해 동작

-- ============================================
-- 2) 새 컬럼 추가 (source_type은 이미 존재 — 제외)
-- ============================================
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS priority int DEFAULT 3;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS topic_tags text[];
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS source_ref text;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS content_id uuid REFERENCES contents(id);
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS chunk_total int;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS image_description text;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS search_vector tsvector;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding_model text DEFAULT 'gemini-embedding-001';
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS image_embedding vector(1024);
-- image_embedding은 P2 멀티모달 대비. 텍스트(768d)와 다른 벡터 공간 (ADR-15)

-- VIEW 재생성 (새 컬럼 포함 — SELECT * 는 생성 시점 컬럼만 포함하므로)
CREATE OR REPLACE VIEW lecture_chunks AS SELECT * FROM knowledge_chunks;

-- ============================================
-- 3) 인덱스
-- ============================================
CREATE INDEX IF NOT EXISTS idx_kc_source_priority ON knowledge_chunks(source_type, priority);

-- ============================================
-- 4) contents 확장
-- ============================================
ALTER TABLE contents ADD COLUMN IF NOT EXISTS embedding_status text DEFAULT 'pending';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS chunks_count int;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS embedded_at timestamptz;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS priority int DEFAULT 3;

-- ============================================
-- 5) priority 일괄 설정
-- ============================================

-- 자사몰사관학교 강의 (1강~6강) = T1
UPDATE knowledge_chunks SET priority = 1
  WHERE lecture_name ~ '^[0-9]+강';

-- 블루프린트 = T1
UPDATE knowledge_chunks SET priority = 1
  WHERE lecture_name LIKE 'Blueprint:%'
     OR lecture_name IN ('meta-auction','meta-setup','beginner-guide',
        'benchmark-architecture','benchmark-troubleshooting','context7-guide',
        'meta-diagnosis','seasonality-guide');

-- papers = T1
UPDATE knowledge_chunks SET priority = 1
  WHERE lecture_name = 'papers';

-- 엠타트업/마케팅본질 = T3 (source_type: marketing_theory)
UPDATE knowledge_chunks SET priority = 3, source_type = 'marketing_theory'
  WHERE lecture_name IN ('엠타트업', '마케팅본질프레임워크');

-- papers = source_type 분리
UPDATE knowledge_chunks SET source_type = 'papers'
  WHERE lecture_name = 'papers';

-- 미팅 = T4
UPDATE knowledge_chunks SET priority = 4, source_type = 'meeting'
  WHERE metadata->>'source' = 'email';

-- 불필요 강의 삭제
DELETE FROM knowledge_chunks
  WHERE lecture_name IN ('상표강의(1)', '상표강의(2)', '디자인강의');

-- ============================================
-- 6) RLS 보안 수정 — 정확한 정책명으로 교체
-- ============================================

-- --- contents ---
DROP POLICY IF EXISTS "Service role full access on contents" ON contents;
DROP POLICY IF EXISTS "Admins can manage contents" ON contents;  -- 00005에서 생성 시도된 정책
CREATE POLICY "service_role_contents" ON contents FOR ALL
  USING (auth.role() = 'service_role' OR is_admin())
  WITH CHECK (auth.role() = 'service_role' OR is_admin());

-- --- distributions ---
DROP POLICY IF EXISTS "Service role full access on distributions" ON distributions;
DROP POLICY IF EXISTS "Admins can manage distributions" ON distributions;
CREATE POLICY "service_role_distributions" ON distributions FOR ALL
  USING (auth.role() = 'service_role' OR is_admin())
  WITH CHECK (auth.role() = 'service_role' OR is_admin());

-- --- email_logs ---
DROP POLICY IF EXISTS "Service role full access on email_logs" ON email_logs;
DROP POLICY IF EXISTS "Admins can manage email_logs" ON email_logs;
CREATE POLICY "service_role_email_logs" ON email_logs FOR ALL
  USING (auth.role() = 'service_role' OR is_admin())
  WITH CHECK (auth.role() = 'service_role' OR is_admin());

-- --- knowledge_usage ---
DROP POLICY IF EXISTS "Service role full access" ON knowledge_usage;
CREATE POLICY "service_role_knowledge_usage" ON knowledge_usage FOR ALL
  USING (auth.role() = 'service_role' OR is_admin())
  WITH CHECK (auth.role() = 'service_role' OR is_admin());

-- --- knowledge_chunks (rename 후 기존 정책 정리 + 신규) ---
DROP POLICY IF EXISTS "Approved users can view lecture chunks" ON knowledge_chunks;
DROP POLICY IF EXISTS "Admins can manage lecture chunks" ON knowledge_chunks;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_knowledge_chunks" ON knowledge_chunks FOR ALL
  USING (auth.role() = 'service_role' OR is_admin())
  WITH CHECK (auth.role() = 'service_role' OR is_admin());
-- authenticated 읽기 허용 (QA 검색용)
CREATE POLICY "authenticated_read_knowledge" ON knowledge_chunks FOR SELECT
  USING (auth.role() = 'authenticated');

-- --- 백업 테이블 정리 ---
DROP TABLE IF EXISTS _backup_contents_category;
DROP TABLE IF EXISTS _backup_posts;

-- --- 나머지 RLS 미적용 테이블 활성화 ---
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

-- 기존 정책 안전하게 정리 (00002에서 생성된 정책이 있을 수 있음)
DROP POLICY IF EXISTS "authenticated_read" ON blocks;
DROP POLICY IF EXISTS "admin_all" ON blocks;
DROP POLICY IF EXISTS "Approved users can view categories" ON categories;
DROP POLICY IF EXISTS "Admins can manage categories" ON categories;
DROP POLICY IF EXISTS "authenticated_read" ON categories;
DROP POLICY IF EXISTS "admin_all" ON categories;
DROP POLICY IF EXISTS "authenticated_read" ON cohorts;
DROP POLICY IF EXISTS "admin_all" ON cohorts;
DROP POLICY IF EXISTS "Approved users can view comments" ON comments;
DROP POLICY IF EXISTS "Approved users can create comments" ON comments;
DROP POLICY IF EXISTS "Users can update own comments" ON comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON comments;
DROP POLICY IF EXISTS "Admins can delete any comment" ON comments;
DROP POLICY IF EXISTS "authenticated_read" ON comments;
DROP POLICY IF EXISTS "authenticated_read" ON curriculum;
DROP POLICY IF EXISTS "admin_all" ON curriculum;
DROP POLICY IF EXISTS "Approved users can view likes" ON likes;
DROP POLICY IF EXISTS "Approved users can create likes" ON likes;
DROP POLICY IF EXISTS "Users can delete own likes" ON likes;
DROP POLICY IF EXISTS "authenticated_read" ON likes;
DROP POLICY IF EXISTS "Users can view own notification preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can create own notification preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can update own notification preferences" ON notification_preferences;
DROP POLICY IF EXISTS "authenticated_read" ON notification_preferences;
DROP POLICY IF EXISTS "authenticated_read" ON schedules;
DROP POLICY IF EXISTS "admin_all" ON schedules;

-- 읽기 정책 (로그인 사용자)
CREATE POLICY "authenticated_read" ON blocks FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON categories FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON cohorts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON comments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON curriculum FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON likes FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON notification_preferences FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_read" ON schedules FOR SELECT USING (auth.role() = 'authenticated');

-- admin 전체 접근
CREATE POLICY "admin_all" ON blocks FOR ALL USING (is_admin());
CREATE POLICY "admin_all" ON categories FOR ALL USING (is_admin());
CREATE POLICY "admin_all" ON cohorts FOR ALL USING (is_admin());
CREATE POLICY "admin_all" ON curriculum FOR ALL USING (is_admin());
CREATE POLICY "admin_all" ON schedules FOR ALL USING (is_admin());
