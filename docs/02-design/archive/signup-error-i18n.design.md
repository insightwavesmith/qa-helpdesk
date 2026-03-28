# Supabase 에러 메시지 한국어 매핑 (T2) 설계서

> 작성일: 2026-03-06

## 1. 데이터 모델

변경 없음.

## 2. API 설계

변경 없음. Supabase Auth 에러 메시지 클라이언트 매핑만.

## 3. 컴포넌트 구조

### 수정 파일: `src/app/(auth)/signup/page.tsx`

#### 3-1. 에러 매핑 함수

파일 상단(컴포넌트 외부)에 순수 함수로 정의:

```typescript
/**
 * Supabase Auth 에러 메시지를 한국어로 매핑한다.
 * 매핑되지 않는 메시지는 기본 한국어 메시지를 반환한다.
 */
const SUPABASE_ERROR_MAP: Record<string, string> = {
  "User already registered": "이미 가입된 이메일입니다",
  "Password should be at least 6 characters": "비밀번호는 6자 이상이어야 합니다",
  "Invalid email": "올바른 이메일 형식이 아닙니다",
  "Signups not allowed for this instance": "현재 회원가입이 제한되어 있습니다",
  "Email rate limit exceeded": "너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해 주세요.",
  "For security purposes, you can only request this after": "보안을 위해 잠시 후 다시 시도해 주세요.",
};

function mapSupabaseError(message: string): string {
  // 정확한 매칭 우선
  if (SUPABASE_ERROR_MAP[message]) {
    return SUPABASE_ERROR_MAP[message];
  }

  // 부분 매칭 (Supabase 메시지가 추가 context를 포함할 수 있음)
  for (const [key, value] of Object.entries(SUPABASE_ERROR_MAP)) {
    if (message.includes(key)) {
      return value;
    }
  }

  // 미매핑 → 기본 메시지
  return "회원가입 중 오류가 발생했습니다. 다시 시도해 주세요.";
}
```

#### 3-2. 적용 위치

**line 144-145 (authError 처리):**
```typescript
// 변경 전:
if (authError && !authData?.user) {
  setError(authError.message);
  return;
}

// 변경 후:
if (authError && !authData?.user) {
  setError(mapSupabaseError(authError.message));
  return;
}
```

**line 149-151 (!authData?.user 처리):**
```typescript
// 변경 없음 — 이미 한국어 메시지
if (!authData?.user) {
  setError("회원가입 중 오류가 발생했습니다.");
  return;
}
```

**line 182-183 (catch block):**
```typescript
// 변경 전:
} catch {
  setError("회원가입 중 오류가 발생했습니다.");
}

// 변경 후:
} catch {
  setError("일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
}
```

## 4. 에러 처리

### Supabase Auth 에러 → 한국어 매핑표
| Supabase 영문 메시지 | 한국어 표시 |
|---|---|
| User already registered | 이미 가입된 이메일입니다 |
| Password should be at least 6 characters | 비밀번호는 6자 이상이어야 합니다 |
| Invalid email | 올바른 이메일 형식이 아닙니다 |
| Signups not allowed for this instance | 현재 회원가입이 제한되어 있습니다 |
| Email rate limit exceeded | 너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해 주세요. |
| For security purposes, you can only request this after... | 보안을 위해 잠시 후 다시 시도해 주세요. |
| (기타 미매핑) | 회원가입 중 오류가 발생했습니다. 다시 시도해 주세요. |

### catch block 에러
| 상황 | 한국어 표시 |
|---|---|
| 네트워크/런타임 에러 | 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요. |

## 5. 구현 순서

- [ ] `SUPABASE_ERROR_MAP` 상수 정의 (컴포넌트 외부)
- [ ] `mapSupabaseError()` 함수 구현 (정확 매칭 → 부분 매칭 → 기본값)
- [ ] line 145: `authError.message` → `mapSupabaseError(authError.message)` 적용
- [ ] line 183: catch block 메시지 변경 ("일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
- [ ] `npm run build` 확인

### 주의사항
- B1 로직(authError + user 존재 시 진행) 절대 변경 금지 (line 143-147)
- `!authData?.user` 분기 (line 149-151) 메시지는 이미 한국어이므로 그대로 유지
- 향후 Supabase 에러 메시지 추가 시 `SUPABASE_ERROR_MAP`에만 추가하면 됨
