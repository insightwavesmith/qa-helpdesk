-- Soft Delete: contents 테이블에 deleted_at 컬럼 추가
ALTER TABLE contents ADD COLUMN deleted_at timestamptz DEFAULT NULL;

-- 삭제된 콘텐츠 조회 성능을 위한 부분 인덱스
CREATE INDEX idx_contents_deleted_at
  ON contents (deleted_at)
  WHERE deleted_at IS NOT NULL;
