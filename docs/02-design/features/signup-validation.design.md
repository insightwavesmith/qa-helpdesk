# 회원가입 폼 클라이언트 Validation 강화 (T1) 설계서

> 작성일: 2026-03-06

## 1. 데이터 모델

변경 없음. 기존 profiles 테이블 그대로 사용.

## 2. API 설계

변경 없음. 클라이언트 사이드 validation만 추가.

## 3. 컴포넌트 구조

### 수정 파일: `src/app/(auth)/signup/page.tsx`

#### 3-1. 새로운 상태 추가

```typescript
// 필드별 에러 메시지 상태
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
// submit 시도 여부 (blur 에러 표시 제어용)
const [touched, setTouched] = useState<Record<string, boolean>>({});
```

#### 3-2. Validation 함수

```typescript
// 이메일 정규식
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 전화번호 정규식 (01X-XXXX-XXXX 또는 01XXXXXXXXX)
const PHONE_REGEX = /^01[016789]-?\d{3,4}-?\d{4}$/;

// 사업자번호 정규식 (XXX-XX-XXXXX 또는 10자리 숫자)
const BIZ_NUMBER_REGEX = /^\d{3}-?\d{2}-?\d{5}$/;

function validateField(field: string, value: string): string {
  switch (field) {
    case "email":
      if (!value.trim()) return "필수 항목입니다";
      if (!EMAIL_REGEX.test(value)) return "올바른 이메일 형식이 아닙니다";
      return "";
    case "password":
      if (!value) return "필수 항목입니다";
      if (value.length < 8) return "비밀번호는 8자 이상이어야 합니다";
      return "";
    case "passwordConfirm":
      if (!value) return "필수 항목입니다";
      if (value !== formData.password) return "비밀번호가 일치하지 않습니다";
      return "";
    case "name":
      if (!value.trim()) return "필수 항목입니다";
      return "";
    case "phone":
      if (!isStudentMode) {
        if (!value.trim()) return "필수 항목입니다";
        if (!PHONE_REGEX.test(value.replace(/-/g, "").replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3") || value))
          return "올바른 전화번호 형식이 아닙니다";
      }
      return "";
    case "shopName":
      if (!isStudentMode && !value.trim()) return "필수 항목입니다";
      return "";
    case "businessNumber":
      if (!isStudentMode) {
        if (!value.trim()) return "필수 항목입니다";
        const digits = value.replace(/-/g, "");
        if (digits.length !== 10 || !/^\d{10}$/.test(digits))
          return "올바른 사업자등록번호 형식이 아닙니다";
      }
      return "";
    default:
      return "";
  }
}
```

#### 3-3. 자동 하이픈 포맷팅 함수

```typescript
// 전화번호 자동 하이픈: 010-1234-5678
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

// 사업자번호 자동 하이픈: 000-00-00000
function formatBusinessNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}
```

#### 3-4. updateField 수정

```typescript
const updateField = (field: string, value: string) => {
  let formatted = value;
  if (field === "phone") formatted = formatPhone(value);
  if (field === "businessNumber") formatted = formatBusinessNumber(value);

  setFormData((prev) => ({ ...prev, [field]: formatted }));

  // 실시간 validation (touched 또는 submitted 상태일 때만 에러 표시)
  if (touched[field]) {
    const error = validateField(field, formatted);
    setFieldErrors((prev) => ({ ...prev, [field]: error }));
  }
};
```

#### 3-5. handleBlur 추가

```typescript
const handleBlur = (field: string) => {
  setTouched((prev) => ({ ...prev, [field]: true }));
  const error = validateField(field, formData[field as keyof typeof formData]);
  setFieldErrors((prev) => ({ ...prev, [field]: error }));
};
```

#### 3-6. 비밀번호 확인 실시간 검증

```typescript
// passwordConfirm onChange에서 실시간 불일치 체크
// password onChange에서도 passwordConfirm이 비어있지 않으면 재검증
```

#### 3-7. handleSignup 수정

```typescript
const handleSignup = async (e: React.FormEvent) => {
  e.preventDefault();
  setError("");

  // 전체 필드 validation
  const requiredFields = isStudentMode
    ? ["email", "password", "passwordConfirm", "name"]
    : ["email", "password", "passwordConfirm", "name", "phone", "shopName", "businessNumber"];

  const newErrors: Record<string, string> = {};
  const newTouched: Record<string, boolean> = {};

  for (const field of requiredFields) {
    newTouched[field] = true;
    const error = validateField(field, formData[field as keyof typeof formData]);
    if (error) newErrors[field] = error;
  }

  setFieldErrors(newErrors);
  setTouched(newTouched);

  if (Object.keys(newErrors).length > 0) return;

  // 기존 handleSignup 로직 그대로 유지 (setLoading → signUp → redirect)
  // 단, 기존 password/passwordConfirm/businessNumber 개별 체크 제거 (위에서 통합)
};
```

#### 3-8. submit 버튼 disabled 조건 변경

```typescript
// 기존: loading || (!isStudentMode && !formData.businessNumber.trim())
// 변경:
const isFormValid = (() => {
  const requiredFields = isStudentMode
    ? ["email", "password", "passwordConfirm", "name"]
    : ["email", "password", "passwordConfirm", "name", "phone", "shopName", "businessNumber"];
  return requiredFields.every((field) => {
    const value = formData[field as keyof typeof formData];
    return value && value.trim().length > 0;
  });
})();

// 버튼: disabled={loading || !isFormValid}
```

#### 3-9. 에러 메시지 UI 패턴

각 input/select 아래에 조건부 에러 메시지:

```tsx
{fieldErrors.email && (
  <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>
)}
```

- 스타일: `text-xs text-red-500 mt-1`
- 에러 있는 input: `border-red-300` 추가 (기존 `border-gray-200` 대신)

#### 3-10. 기존 에러 표시 변경

- 상단 에러 박스 (`error` state): 서버 에러(Supabase 등)용으로만 유지
- 기존 `handleSignup` 내 비밀번호/사업자번호 개별 `setError()` 제거 → `fieldErrors`로 이전

## 4. 에러 처리

### 클라이언트 Validation 에러 (필드별)
| 필드 | 조건 | 메시지 |
|---|---|---|
| 이메일 | 빈값 | 필수 항목입니다 |
| 이메일 | 형식 오류 | 올바른 이메일 형식이 아닙니다 |
| 비밀번호 | 빈값 | 필수 항목입니다 |
| 비밀번호 | 8자 미만 | 비밀번호는 8자 이상이어야 합니다 |
| 비밀번호 확인 | 빈값 | 필수 항목입니다 |
| 비밀번호 확인 | 불일치 | 비밀번호가 일치하지 않습니다 |
| 이름 | 빈값 | 필수 항목입니다 |
| 전화번호 (lead) | 빈값 | 필수 항목입니다 |
| 전화번호 (lead) | 형식 오류 | 올바른 전화번호 형식이 아닙니다 |
| 쇼핑몰 이름 (lead) | 빈값 | 필수 항목입니다 |
| 사업자번호 (lead) | 빈값 | 필수 항목입니다 |
| 사업자번호 (lead) | 형식 오류 | 올바른 사업자등록번호 형식이 아닙니다 |

### 서버 에러 (상단 에러 박스)
- Supabase auth 에러 → T2에서 한국어 매핑 (이 설계에서는 기존 그대로)

## 5. 구현 순서

- [ ] `fieldErrors`, `touched` 상태 추가
- [ ] `EMAIL_REGEX`, `PHONE_REGEX`, `BIZ_NUMBER_REGEX` 상수 정의
- [ ] `validateField()` 함수 구현
- [ ] `formatPhone()`, `formatBusinessNumber()` 자동 하이픈 함수 구현
- [ ] `updateField()` 수정 (자동 포맷팅 + 실시간 validation)
- [ ] `handleBlur()` 추가 + 각 input에 `onBlur` 바인딩
- [ ] 비밀번호 확인 실시간 검증 (password onChange 시 passwordConfirm 재검증)
- [ ] `handleSignup()` 수정 (전체 필드 validation 통합, 기존 개별 체크 제거)
- [ ] submit 버튼 disabled 조건 변경 (`isFormValid`)
- [ ] 각 필드 아래 에러 메시지 JSX 추가
- [ ] 에러 상태 input에 `border-red-300` 스타일 추가
- [ ] `npm run build` 확인
