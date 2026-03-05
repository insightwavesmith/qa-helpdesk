# TASK: 회원가입 폼 Validation 강화 + 프로필 필수값

## 목표
회원가입 폼 유효성 검사를 실사용 수준으로 강화하고, 프로필 정보 모달의 필수값을 강제한다.

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234! (admin), student@test.com / test1234! (student)

---

## T1. 회원가입 폼 클라이언트 Validation 강화

### 파일
- `src/app/(auth)/signup/page.tsx`

### 현재 동작
- 비밀번호 불일치 / 8자 미만 / 사업자번호 빈값만 JS 체크
- 나머지는 HTML `required` + `type="email"`에만 의존
- 잘못된 값 입력 시 Supabase signUp까지 간 후에야 에러 발생
- 에러는 폼 상단에 1개만 표시 → 어떤 필드가 문제인지 불명확

### 기대 동작
- **필수값 체크**: submit 시 빈 필드가 있으면 해당 필드 아래에 "필수 항목입니다" 빨간 텍스트
- **이메일 형식**: 정규식으로 기본 형식 검사. 틀리면 "올바른 이메일 형식이 아닙니다"
- **전화번호 형식** (lead 모드): 01X-XXXX-XXXX 또는 01XXXXXXXXX 형태. 틀리면 "올바른 전화번호 형식이 아닙니다" (자동 하이픈 포맷팅이면 더 좋음)
- **사업자번호 형식** (lead 모드): XXX-XX-XXXXX (10자리 숫자). 틀리면 "올바른 사업자등록번호 형식이 아닙니다" (자동 하이픈 포맷팅이면 더 좋음)
- **비밀번호 확인**: 입력 중 실시간으로 불일치 표시 (기존은 submit 시에만)
- **submit 버튼**: 필수 필드 미입력 시 disabled 상태 유지 (현재는 사업자번호만 체크)
- **에러 표시**: 각 필드 아래에 개별 에러 메시지. 상단 에러 박스는 서버 에러(Supabase 등)용으로만 유지

### 하지 말 것
- 회원가입 전체 로직/흐름 변경 금지 — validation만 추가
- 기존 B1 수정 (authError + user 존재 시 진행) 건드리지 말 것
- 이메일 중복은 T2에서 처리 — 여기서는 클라이언트 형식 검사만

---

## T2. Supabase 에러 메시지 한국어 매핑

### 파일
- `src/app/(auth)/signup/page.tsx`

### 현재 동작
- line 145: `authError.message` 영문 그대로 표시 (예: "User already registered")
- line 150: `!authData?.user`일 때 "회원가입 중 오류가 발생했습니다." (원인 불명)
- line 183: catch block도 동일 generic 메시지

### 기대 동작
- 에러 매핑 함수 추가:
  - "User already registered" → "이미 가입된 이메일입니다"
  - "Password should be at least 6 characters" → "비밀번호는 6자 이상이어야 합니다"
  - "Invalid email" → "올바른 이메일 형식이 아닙니다"
  - "Signups not allowed for this instance" → "현재 회원가입이 제한되어 있습니다"
  - 기타 → "회원가입 중 오류가 발생했습니다. 다시 시도해 주세요."
- catch block: 가능하면 에러 객체에서 정보 추출, 아니면 "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."

### 하지 말 것
- Supabase auth 로직 자체 변경 금지 — 에러 메시지 매핑만

---

## T3. 프로필 정보 입력 필수화

### 파일
- `src/app/(auth)/onboarding/page.tsx`

### 현재 동작
- 프로필 정보 확인 모달에서 submit 버튼 disabled 조건: `!name.trim() || !isCategoryValid`만 체크
- 브랜드명(shopName), 쇼핑몰 URL(shopUrl), 연매출(annualRevenue), 월 광고예산(monthlyAdBudget) — 빈 채로 저장 가능

### 기대 동작
- 4개 필드 모두 필수:
  - 브랜드명: 빈값 불가
  - 쇼핑몰 URL: 빈값 불가
  - 연매출: 선택 안 하면 불가
  - 월 광고예산: 선택 안 하면 불가
- submit 버튼 disabled 조건에 4개 필드 빈값 체크 추가
- 미입력 필드에 빨간색 "필수 항목입니다" 텍스트 (submit 시도 시 또는 blur 시)

### 하지 말 것
- 온보딩 전체 흐름(Step 구조) 변경 금지
- 새 UI 컴포넌트 추가 금지 — 기존 스타일로 에러 텍스트만 추가

---

## 리뷰 결과
(에이전트팀 리뷰 후 기록)
