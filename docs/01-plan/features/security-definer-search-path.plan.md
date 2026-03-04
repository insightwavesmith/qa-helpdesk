# SECURITY DEFINER search_path 수정 Plan

## 배경
Supabase Security Advisor에서 SECURITY DEFINER 함수 5개에 `SET search_path` 미설정 경고.
search_path 미설정 시 SQL injection 공격에 취약할 수 있음.

## 범위
아래 5개 함수에 `SET search_path = public` 추가:
1. `debug_log_autonomous(p_msg text)` — plpgsql
2. `get_user_role()` — sql, STABLE
3. `is_admin()` — sql, STABLE
4. `is_member_or_above()` — sql, STABLE
5. `is_student_or_above()` — sql, STABLE

## 제외
- `dblink_connect_u` — 시스템 함수 (수정 불가)
- 이미 설정된 함수: `auto_create_ad_account`, `handle_new_user`, `is_approved_user`, `match_lecture_chunks`, `search_knowledge` 등

## 하지 말 것
- 함수 로직 변경 금지
- 테이블 구조 변경 금지

## 성공 기준
- 5개 함수 모두 `SET search_path = public` 포함
- Security Advisor 경고 해소
- 기존 RLS 정책 정상 동작
