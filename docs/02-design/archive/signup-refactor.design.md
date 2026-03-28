# 가입 폼 리팩토링 (T1) 설계서

> 최종 갱신: 2026-02-28 (코드 기준 현행화)

## 1. 데이터 모델
- 기존 profiles 테이블 사용 (invite_code_used, onboarding_status 포함)
- invite_codes 테이블: code, cohort, expires_at, max_uses, used_count

## 2. API 설계
- `POST /api/invite/validate` — 초대코드 검증
  - 요청: `{ code: string }`
  - 응답: `{ valid: boolean, cohort?: string, error?: string }`

## 3. 컴포넌트 구조

### signup/page.tsx
- 상태:
  - `inviteCode`, `isStudentMode`, `inviteValidating`, `inviteCohort`, `inviteError`
- UI 분기:
  - 초대코드 섹션: 입력 + "확인" 버튼 (폼 최상단)
  - isStudentMode === true: 전체 폼 (name, cohort readonly)
  - isStudentMode === false: lead 폼 (이메일, 비밀번호, 이름, phone, shopUrl, shopName, businessNumber, businessFile 업로드)
  - 안내 문구: student="수강생 정보를 입력해주세요", lead="헬프데스크에 가입합니다"
- signUp():
  - student: invite_code 포함
  - lead: phone, shop_name, businessNumber 필수, businessFile → Supabase Storage 업로드
- 가입 후 리다이렉트:
  - isStudentMode → `/onboarding`
  - !isStudentMode → `/pending` (lead는 승인 대기)

## 4. 에러 처리
- 초대코드 검증 실패: "유효하지 않은 초대코드입니다"
- 비밀번호 불일치: "비밀번호가 일치하지 않습니다."
- 비밀번호 8자 미만: "비밀번호는 8자 이상이어야 합니다."
- 가입 오류: authError.message 표시

## 5. 구현 순서
- [x] Plan 문서 작성
- [x] Design 문서 작성
- [x] 상태 변수 추가 (inviteCode, isStudentMode, inviteValidating, inviteCohort, inviteError)
- [x] validateInviteCode 함수 구현
- [x] 초대코드 섹션 UI (입력 + 확인 버튼)
- [x] 안내 문구 분기 (student/lead)
- [x] student 모드: 전체 폼 (cohort readonly)
- [x] lead 모드: 간소화 폼 (이메일+비밀번호+이름)
- [x] signUp() 수정 (invite_code, 조건부 필드)
- [x] 리다이렉트 분기 (/onboarding vs /dashboard)
- [x] npm run build 확인
- [x] (추가) T0 nullable 마이그레이션 영향: Member/PostData 인터페이스 shop_name/phone 타입 수정
