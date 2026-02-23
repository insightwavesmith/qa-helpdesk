-- 00024: assistant(조교) role 추가
-- admin(전체관리) + assistant(조교) 2단계 권한 체계

ALTER TYPE user_role ADD VALUE 'assistant' BEFORE 'admin';
