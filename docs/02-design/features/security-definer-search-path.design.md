# SECURITY DEFINER search_path 수정 설계서

## 1. 데이터 모델
변경 없음. 함수 메타데이터만 수정.

## 2. API 설계
변경 없음. 함수 시그니처/반환 타입 동일.

## 3. 컴포넌트 구조
해당 없음 (DB 전용 작업).

## 4. 에러 처리
- `CREATE OR REPLACE` 사용 → 기존 함수 안전하게 덮어쓰기
- `auth.uid()` 는 스키마 한정 호출이므로 `search_path = public`에서도 정상 동작
- `user_role` 타입은 public 스키마에 존재하므로 정상

## 5. 구현 순서
- [x] 현재 함수 정의 조회 (`pg_get_functiondef`)
- [ ] 마이그레이션 SQL 작성 (`20260304_security_definer_search_path.sql`)
- [ ] Supabase에 SQL 실행
- [ ] 실행 결과 검증 (proconfig 확인)

## 변경 내용 (함수별)

### debug_log_autonomous
```sql
-- 추가: SET search_path = public
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
```

### get_user_role / is_admin / is_member_or_above / is_student_or_above
```sql
-- 추가: SET search_path = public
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
```

로직은 100% 동일. `SET search_path` 속성만 추가.
