# TASK: 전화번호 필수화 + 관리자 전화번호 입력

## What
1. 수강생 가입 시 전화번호를 필수 입력으로 변경
2. 관리자가 고객데이터(accounts) 탭에서 기존 수강생 전화번호를 직접 입력/수정할 수 있게

## Why
- 답변 완료 시 카카오 알림톡을 보내려면 전화번호가 필요
- 현재 수강생 대부분 전화번호 미입력 상태
- 기존 가입자는 관리자가 직접 넣어줘야 함

## 1. 가입 폼 전화번호 필수화

### Files
- `src/app/(auth)/signup/page.tsx`

### 변경
- `isStudentMode`일 때 validation에 phone 필수 추가
- 현재: `if (isStudentMode) return base && privacyAgreed;`
- 변경: `if (isStudentMode) return base && privacyAgreed && formData.phone.trim() !== "" && PHONE_REGEX.test(formData.phone);`
- `fieldsToValidate`에도 수강생 모드일 때 "phone" 포함
- 전화번호 입력 필드가 수강생 모드에서도 보이는지 확인 (현재 숨겨져 있으면 표시)

## 2. 관리자 고객데이터 전화번호 편집

### Files
- 관리자 accounts/고객데이터 페이지 (경로 확인 필요)
- 해당 페이지의 수강생 목록에서 전화번호 컬럼 표시 + 인라인 편집 또는 편집 모달

### 구현
- 수강생 목록에 phone 컬럼 표시
- 클릭하면 인라인 편집 가능 (input + 저장 버튼)
- 저장 시 profiles 테이블 phone 업데이트
- 전화번호 포맷 검증 (010-xxxx-xxxx)

## Validation
- [ ] 수강생 모드 가입 시 전화번호 미입력하면 가입 불가
- [ ] 전화번호 형식 틀리면 에러 메시지
- [ ] 관리자 고객데이터에서 전화번호 표시됨
- [ ] 관리자가 전화번호 입력/수정 가능
- [ ] `tsc --noEmit` 통과

## 하지 말 것
- profiles 테이블 스키마 변경 금지 — phone 컬럼 이미 존재
- 기존 가입자 데이터 자동 마이그레이션 하지 말 것
- 수강생 본인이 마이페이지에서 수정하는 기능은 지금 안 만들어도 됨
