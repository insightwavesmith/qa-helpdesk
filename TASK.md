# TASK: Supabase SECURITY DEFINER 함수 search_path 수정

## 목표
Supabase Security Advisor에서 경고하는 SECURITY DEFINER 함수에 `SET search_path = public` 추가.

## 현재 동작
아래 함수들이 SECURITY DEFINER인데 search_path 미설정 — SQL injection 위험:
- `debug_log_autonomous`
- `get_user_role`
- `is_admin`
- `is_member_or_above`
- `is_student_or_above`

(dblink_connect_u는 시스템 함수라 제외)

## 기대 동작
각 함수에 `SET search_path = public` 추가하는 마이그레이션 SQL 작성 + 실행.

## 참고
- Supabase docs: https://supabase.com/docs/guides/database/database-linter
- 기존에 이미 설정된 함수 참고: `auto_create_ad_account`, `handle_new_user`, `is_approved_user`, `match_lecture_chunks`, `search_knowledge`, `update_content_sources_updated_at`, `update_reviews_updated_at`

## 하지 말 것
- 함수 로직 변경 금지. search_path만 추가.
- 테이블 구조 변경 금지.
- dblink_connect_u는 건드리지 말 것 (시스템 함수).
