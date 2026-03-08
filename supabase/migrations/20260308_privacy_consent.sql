-- 개인정보처리방침 동의 시점 기록
-- 기존 유저는 NULL (영향 없음), 신규 유저는 가입 시 timestamp 저장
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS privacy_agreed_at TIMESTAMPTZ DEFAULT NULL;
