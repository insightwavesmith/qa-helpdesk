# T1+T2+T3 Gap 분석

> 분석일: 2026-03-06
> 분석 대상: signup/page.tsx, onboarding/page.tsx
> 설계서: signup-validation.design.md, signup-error-i18n.design.md, onboarding-required-fields.design.md

## 전체 Match Rate: 92%

---

## T1. 회원가입 폼 클라이언트 Validation 강화

### Match Rate: 88%

### 일치 항목

1. **상태 추가 (3-1)**: `fieldErrors`, `touched` 상태가 설계대로 `useState<Record<string, string>>({})` / `useState<Record<string, boolean>>({})` 으로 선언됨 (line 81-82)
2. **정규식 상수 (3-2)**: `EMAIL_REGEX`, `PHONE_REGEX`, `BIZ_NUMBER_REGEX` 3개 모두 설계서와 동일한 패턴으로 컴포넌트 외부에 정의됨 (line 14-16)
3. **validateField 함수 (3-2)**: email/password/passwordConfirm/name/shopName/businessNumber 각 case의 조건과 에러 메시지가 설계서와 정확히 일치
4. **자동 하이픈 포맷팅 (3-3)**: `formatPhone()`, `formatBusinessNumber()` 함수가 설계서와 동일한 로직으로 구현됨 (line 19-31)
5. **updateField 수정 (3-4)**: phone/businessNumber 자동 포맷팅 적용, touched 상태 기반 실시간 검증 구현됨 (line 121-157)
6. **handleBlur 추가 (3-5)**: `setTouched` + `validateField` 호출 로직 설계서와 일치 (line 160-169)
7. **비밀번호 확인 실시간 검증 (3-6)**: passwordConfirm onChange 및 password onChange 시 재검증 로직 구현됨 (line 136-156)
8. **handleSignup 수정 (3-7)**: `fieldsToValidate` 배열, `newErrors`/`newTouched` 루프, `hasError` 기반 early return 구현됨 (line 238-274)
9. **에러 메시지 UI 패턴 (3-9)**: 모든 필드(email, password, passwordConfirm, name, phone, shopName, businessNumber)에 `{fieldErrors.xxx && <p className="text-xs text-red-500 mt-1">...}` 패턴 적용
10. **에러 border 스타일 (3-9)**: 모든 필드에 `fieldErrors.xxx ? "border-red-300" : "border-gray-200"` 조건부 스타일 적용
11. **기존 에러 표시 변경 (3-10)**: 상단 에러 박스는 서버 에러 전용으로 유지, 기존 개별 `setError()` 제거됨
12. **에러 메시지 정확성**: 설계서 4. 에러 처리 표의 12개 메시지 모두 정확히 일치

### 불일치 항목

1. **phone validateField 로직 차이 (3-2)**: 설계서는 `!isStudentMode` 조건 분기를 포함하지만, 구현체(line 102-106)는 `isStudentMode` 조건 없이 무조건 검증. 다만 phone 필드 자체가 `!isStudentMode`일 때만 UI에 렌더링되고, `fieldsToValidate` 배열에서도 학생모드 시 제외되므로 **실질적 동작 차이 없음**. 단, validateField 함수 단독 호출 시 student 모드에서도 에러를 반환하는 차이 존재.

2. **shopName validateField 로직 차이 (3-2)**: 설계서는 `!isStudentMode && !value.trim()` 조건이지만, 구현체(line 107-109)는 `isStudentMode` 조건 없이 무조건 빈값 체크. phone과 동일한 이유로 **실질적 동작 차이 없음**.

3. **businessNumber validateField 로직 차이 (3-2)**: 설계서는 `!isStudentMode` 분기 + `digits.replace(/-/g, "")` 후 10자리 체크이지만, 구현체(line 110-114)는 `isStudentMode` 조건 없이 `BIZ_NUMBER_REGEX.test(value)` 직접 테스트. BIZ_NUMBER_REGEX(`/^\d{3}-?\d{2}-?\d{5}$/`)가 이미 10자리(하이픈 제외) 패턴이므로 **결과 동치**. 다만 하이픈이 포함된 상태에서 regex를 적용하므로 formatBusinessNumber로 포맷팅된 값 `123-45-67890`도 정상 매칭됨.

4. **isFormValid 구현 차이 (3-8)**: 설계서는 `value.trim().length > 0` 만 확인하지만, 구현체(line 172-190)는 추가로 regex 검증(EMAIL_REGEX, PHONE_REGEX, BIZ_NUMBER_REGEX)과 비밀번호 길이/일치 검증을 포함. 이는 **설계보다 강화된 구현**으로 버튼 disabled를 더 정확하게 제어. 개선 사항이므로 문제 없음.

5. **handleSignup 내부 setFieldErrors/setTouched 방식 차이 (3-7)**: 설계서는 `setFieldErrors(newErrors)` (덮어쓰기)이지만, 구현체(line 271-272)는 `setFieldErrors(prev => ({...prev, ...newErrors}))` (병합). 이는 기존 에러를 유지하면서 새 에러를 추가하는 방식으로, 스프레드 시 이전 에러가 clearup되지 않을 수 있는 **미세한 차이**. 실제로는 submit 시 모든 필드를 재검증하므로 큰 영향 없으나, 이전 제출의 에러가 남아있을 수 있음.

### 수정 필요

- **[Low] handleSignup setFieldErrors**: 설계서대로 `setFieldErrors(newErrors)` 덮어쓰기로 변경하면 이전 검증 에러가 깔끔하게 클리어됨. 현재 병합 방식도 동작하지만 설계 의도와 미세하게 다름.

---

## T2. Supabase 에러 메시지 한국어 매핑

### Match Rate: 100%

### 일치 항목

1. **SUPABASE_ERROR_MAP 상수 (3-1)**: 6개 키-값 쌍 모두 설계서와 정확히 일치 (line 34-45)
   - "User already registered" -> "이미 가입된 이메일입니다"
   - "Password should be at least 6 characters" -> "비밀번호는 6자 이상이어야 합니다"
   - "Invalid email" -> "올바른 이메일 형식이 아닙니다"
   - "Signups not allowed for this instance" -> "현재 회원가입이 제한되어 있습니다"
   - "Email rate limit exceeded" -> "너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해 주세요."
   - "For security purposes, you can only request this after" -> "보안을 위해 잠시 후 다시 시도해 주세요."

2. **mapSupabaseError 함수 (3-1)**: 정확 매칭 -> 부분 매칭 -> 기본 메시지 3단계 로직 설계서와 일치 (line 47-53)

3. **기본 메시지**: "회원가입 중 오류가 발생했습니다. 다시 시도해 주세요." 설계서와 정확히 일치 (line 52)

4. **적용 위치 - authError 처리 (3-2)**: `mapSupabaseError(authError.message)` 적용됨 (line 314)

5. **적용 위치 - !authData?.user 처리 (3-2)**: "회원가입 중 오류가 발생했습니다." 메시지 그대로 유지 (line 319)

6. **적용 위치 - catch block (3-2)**: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." 설계서와 정확히 일치 (line 356-358)

7. **B1 로직 보존**: line 312-316에서 `authError && !authData?.user` 패턴 유지. authError가 있어도 user가 생성되었으면 정상 플로우 진행하는 B1 로직 정확히 보존됨.

8. **컴포넌트 외부 정의**: SUPABASE_ERROR_MAP과 mapSupabaseError 모두 컴포넌트 외부(순수 함수)로 정의됨 (line 33-53)

### 불일치 항목

- 없음

---

## T3. 온보딩 프로필 필수값 강제

### Match Rate: 93%

### 일치 항목

1. **submitted 상태 추가 (3-1)**: `const [submitted, setSubmitted] = useState(false)` 구현됨 (line 228)

2. **isProfileValid 계산 (3-3)**: 설계서와 동일한 5개 필드 체크 + isCategoryValid 포함 (line 233-239)
   - `!!name.trim()` / `!!shopName.trim()` / `!!shopUrl.trim()` / `!!annualRevenue` / `!!monthlyAdBudget` / `isCategoryValid`

3. **submit 버튼 disabled (3-3)**: `disabled={saving || !isProfileValid}` 설계서와 일치 (line 406)

4. **handleSubmit 수정 (3-4)**: `setSubmitted(true)` + `!isProfileValid` early return + 기존 로직(finalCategory, finalShopUrl) 그대로 유지 (line 241-252)

5. **라벨 필수 표시 (3-5)**: 4개 필드 모두에 `<span className="text-red-500">*</span>` 추가됨
   - 브랜드명 (line 288)
   - 쇼핑몰 URL (line 310)
   - 연매출 (line 329)
   - 월 광고예산 (line 352)

6. **에러 메시지 UI - shopName (3-6)**: `submitted && !shopName.trim()` 조건 + `text-xs text-red-500 mt-1` 스타일 (line 300-302)

7. **에러 메시지 UI - shopUrl (3-6)**: `submitted && !shopUrl.trim()` 조건 + 동일 스타일 (line 322-324)

8. **에러 메시지 UI - annualRevenue (3-6)**: `submitted && !annualRevenue` 조건 + 동일 스타일 (line 345-347)

9. **에러 메시지 UI - monthlyAdBudget (3-6)**: `submitted && !monthlyAdBudget` 조건 + 동일 스타일 (line 371-373)

10. **에러 border - shopName input (3-6)**: `submitted && !shopName.trim() ? "border-red-300" : "border-gray-200"` 적용 (line 296-298)

11. **에러 border - shopUrl input (3-6)**: `submitted && !shopUrl.trim() ? "border-red-300" : "border-gray-200"` 적용 (line 318-320)

12. **에러 border - annualRevenue SelectTrigger (3-6)**: `submitted && !annualRevenue ? "border-red-300" : "border-gray-200"` 적용 (line 332-334)

13. **에러 border - monthlyAdBudget SelectTrigger (3-6)**: `submitted && !monthlyAdBudget ? "border-red-300" : "border-gray-200"` 적용 (line 358-360)

14. **기존 로직 유지**: name `required` 속성, isCategoryValid, Step 0/2/3 무변경 확인

15. **새 UI 컴포넌트 미추가**: `<p>` 태그 에러 텍스트만 추가, 새 컴포넌트 도입 없음

### 불일치 항목

1. **getFieldError 함수 미구현 (3-2)**: 설계서에서 정의한 `getFieldError(field, value)` 함수가 구현되지 않음. 대신 인라인으로 `submitted && !value.trim()` / `submitted && !value` 조건을 직접 작성. 기능적으로는 동치이지만 설계서의 함수 추상화가 적용되지 않았음. 필드가 4개뿐이고 조건이 단순하므로 **실질적 영향 없음**.

2. **handleSubmit 필수값 체크 방식 차이 (3-4)**: 설계서는 `!name.trim() || !shopName.trim() || !shopUrl.trim() || !annualRevenue || !monthlyAdBudget || !isCategoryValid` 조건을 직접 나열하지만, 구현체(line 244)는 `!isProfileValid`로 대체. isProfileValid가 동일한 조건을 포함하므로 **결과 동치**.

---

## B1 로직 보존 검증

설계서 T2 주의사항: "B1 로직(authError + user 존재 시 진행) 절대 변경 금지 (line 143-147)"

**검증 결과: PASS**

구현체 line 312-316:
```typescript
// B1: authError가 있어도 유저가 실제 생성됐으면 정상 플로우 진행
if (authError && !authData?.user) {
  setError(mapSupabaseError(authError.message)); // T2: 한국어 매핑
  return;
}
```

- `authError && !authData?.user` 조건 패턴 유지됨
- authError가 있어도 user가 존재하면 return하지 않고 정상 플로우 진행
- 변경된 것은 `setError(authError.message)` -> `setError(mapSupabaseError(authError.message))` 뿐 (T2 적용)

---

## 빌드 검증

- **tsc (`npx tsc --noEmit`)**: PASS -- 에러 없음
- **lint (`npx eslint`)**: 기존 에러 1건만 존재 (onboarding/page.tsx line 658 `react-hooks/set-state-in-effect` -- `setCompleted(true)` in useEffect). T1/T2/T3 관련 신규 에러 없음.
- **npm run build**: PASS -- 빌드 성공, signup은 Static, onboarding은 Static으로 정상 출력

---

## 종합 요약

| 항목 | Match Rate | 상태 |
|------|-----------|------|
| T1. 회원가입 폼 클라이언트 Validation | 88% | 핵심 기능 100% 구현, validateField 내 isStudentMode 분기 미적용(실질 영향 없음), isFormValid 강화 구현, setFieldErrors 병합 방식 차이 |
| T2. Supabase 에러 메시지 한국어 매핑 | 100% | 완벽 일치. 6개 매핑 + 기본 메시지 + catch block 모두 정확 |
| T3. 온보딩 프로필 필수값 강제 | 93% | 핵심 기능 100% 구현, getFieldError 함수 미추출(인라인 처리), handleSubmit isProfileValid 대체 사용 |
| B1 로직 보존 | 100% | authError + user 존재 시 정상 진행 패턴 완벽 유지 |
| 빌드 | PASS | tsc 통과, lint 신규 에러 없음, build 성공 |

### 수정 권장 사항 (낮은 우선순위)

1. **[Low]** signup handleSignup 내 `setFieldErrors(prev => ({...prev, ...newErrors}))` -> `setFieldErrors(newErrors)` 로 변경 검토. 이전 제출 에러가 잔류하지 않도록 깔끔하게 덮어쓰기.
2. **[Info]** T1 validateField의 phone/shopName/businessNumber case에 isStudentMode 분기 미적용은 의도적 간소화로 보임. fieldsToValidate 배열과 UI 렌더링 조건에서 이미 student 모드를 분리하므로 실질적 문제 없음.
3. **[Info]** T3 getFieldError 함수 미추출은 인라인 조건이 충분히 단순하여 합리적 판단.
