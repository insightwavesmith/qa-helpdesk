# 전화번호 필수화 + 관리자 전화번호 편집 설계서

## 1. 데이터 모델
- 기존 `profiles` 테이블의 `phone` 컬럼 활용 (변경 없음)
- 타입: `text | null`

## 2. API 설계
- 기존 `updateMember` server action 활용 (변경 없음)
- phone 필드 이미 지원됨

## 3. 컴포넌트 구조

### 3-1. 가입 폼 (`signup/page.tsx`)
- `isFormValid`: 수강생 모드에도 phone 필수 조건 추가
- `fieldsToValidate`: 수강생 모드에 "phone" 추가
- 전화번호 입력 필드: 수강생 모드에서도 표시 (현재 `!isStudentMode` 조건 제거)
- metadata: 수강생 모드에서도 `metadata.phone = formData.phone` 추가
- 레이아웃: 수강생 모드에서 이름+전화번호 2열 그리드

### 3-2. 회원 목록 (`members-client.tsx`)
- 테이블 헤더에 "전화번호" 컬럼 추가 (이메일 다음)
- 셀 클릭 시 인라인 편집 모드 전환
- 상태: `editingPhoneId`, `editingPhoneValue`
- 저장: `updateMember(id, { phone })` 호출
- 포맷 검증: `PHONE_REGEX = /^01[016789]-?\d{3,4}-?\d{4}$/`
- 자동 하이픈 포맷팅: `formatPhone()` 함수

## 4. 에러 처리
- 가입 폼: "올바른 전화번호 형식이 아닙니다" (기존 validateField 활용)
- 인라인 편집: toast.error로 실패 알림

## 5. 구현 순서
- [x] Plan 문서 작성
- [x] Design 문서 작성
- [ ] 가입 폼 수강생 모드 전화번호 필수화
- [ ] 관리자 회원 목록 전화번호 컬럼 + 인라인 편집
- [ ] 빌드 검증
