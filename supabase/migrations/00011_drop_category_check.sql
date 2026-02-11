-- ============================================
-- 00011: contents_category_check 제약조건 제거
-- ============================================
-- 콘텐츠 유형 체계 통합(T1~T7) 이후 category CHECK 제약이
-- 새 유형 추가를 방해하므로 완전히 제거한다.
-- category 유효성은 애플리케이션 레벨(Zod 스키마)에서 검증.
-- ============================================

ALTER TABLE contents DROP CONSTRAINT IF EXISTS contents_category_check;
