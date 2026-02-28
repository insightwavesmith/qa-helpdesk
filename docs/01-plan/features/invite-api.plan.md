# T2. 초대코드 검증 API + student_registry 매칭 Plan

## 요구사항
- POST /api/invite/validate: 초대코드 유효성 검증 (인증 불필요, 가입 폼에서 호출)
- useInviteCode() server action: 가입 완료 후 초대코드 사용 처리 + student_registry 매칭
- getInviteCodes() / createInviteCode() / deleteInviteCode(): 관리자용 CRUD

## 범위
- 파일: `src/app/api/invite/validate/route.ts` (신규), `src/actions/invites.ts` (신규)
- 의존: T0 (DB 마이그레이션 — invite_codes, profiles 컬럼 추가)

## 성공 기준
1. 유효한 코드 -> { valid: true, cohort: "..." }
2. 존재하지 않는 코드 -> { valid: false, error: "유효하지 않은 초대코드입니다" }
3. 만료된 코드 -> { valid: false, error: "초대코드가 만료되었습니다" }
4. 사용 초과 코드 -> { valid: false, error: "초대코드 사용 한도를 초과했습니다" }
5. useInviteCode: used_count 원자적 증가, profiles 업데이트, student_registry 매칭
6. 관리자 CRUD: requireAdmin() 패턴 사용
7. npm run build 성공
