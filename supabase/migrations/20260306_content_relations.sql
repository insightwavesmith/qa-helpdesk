-- content_relations: 소스 콘텐츠 → 생성물(정보공유) 관계 테이블
CREATE TABLE content_relations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  generated_id uuid NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(source_id, generated_id)
);

CREATE INDEX idx_content_relations_source ON content_relations(source_id);
CREATE INDEX idx_content_relations_generated ON content_relations(generated_id);

-- 기존 source_ref 콤마 데이터를 content_relations로 마이그레이션
INSERT INTO content_relations (source_id, generated_id)
SELECT unnest(string_to_array(source_ref, ','))::uuid AS source_id, id AS generated_id
FROM contents
WHERE source_type = 'info_share' AND source_ref IS NOT NULL AND source_ref != ''
ON CONFLICT DO NOTHING;

-- RLS 정책
ALTER TABLE content_relations ENABLE ROW LEVEL SECURITY;

-- staff(admin/assistant)만 조회/삽입/삭제 가능
CREATE POLICY "staff_select_content_relations" ON content_relations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'assistant')
    )
  );

CREATE POLICY "staff_insert_content_relations" ON content_relations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'assistant')
    )
  );

CREATE POLICY "staff_delete_content_relations" ON content_relations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'assistant')
    )
  );

-- Service role은 RLS 바이패스 (createServiceClient 사용)
