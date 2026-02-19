-- T8: P2 모니터링 — knowledge_usage 확장 컬럼 + Storage 버킷

-- knowledge_usage 로깅 확장
ALTER TABLE knowledge_usage ADD COLUMN IF NOT EXISTS rerank_scores float[] DEFAULT NULL;
ALTER TABLE knowledge_usage ADD COLUMN IF NOT EXISTS expanded_queries text[] DEFAULT NULL;
ALTER TABLE knowledge_usage ADD COLUMN IF NOT EXISTS image_count int DEFAULT 0;
ALTER TABLE knowledge_usage ADD COLUMN IF NOT EXISTS chunks_before_rerank int DEFAULT 0;
ALTER TABLE knowledge_usage ADD COLUMN IF NOT EXISTS chunks_after_rerank int DEFAULT 0;

-- Storage 버킷 생성
INSERT INTO storage.buckets (id, name, public)
VALUES ('qa-images', 'qa-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('lecture-slides', 'lecture-slides', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: 누구나 읽기, admin만 쓰기
CREATE POLICY "Public read qa-images" ON storage.objects
  FOR SELECT USING (bucket_id = 'qa-images');
CREATE POLICY "Admin write qa-images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'qa-images' AND auth.role() = 'authenticated');
CREATE POLICY "Admin delete qa-images" ON storage.objects
  FOR DELETE USING (bucket_id = 'qa-images' AND auth.role() = 'authenticated');

CREATE POLICY "Public read lecture-slides" ON storage.objects
  FOR SELECT USING (bucket_id = 'lecture-slides');
CREATE POLICY "Admin write lecture-slides" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'lecture-slides' AND auth.role() = 'authenticated');
CREATE POLICY "Admin delete lecture-slides" ON storage.objects
  FOR DELETE USING (bucket_id = 'lecture-slides' AND auth.role() = 'authenticated');
