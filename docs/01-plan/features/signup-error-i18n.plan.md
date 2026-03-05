# Supabase 에러 메시지 한국어 매핑 (T2) Plan

## 요구사항
회원가입 시 Supabase Auth에서 반환하는 영문 에러 메시지를 한국어로 매핑하여 표시한다.
현재는 `authError.message` 영문 그대로 표시되거나, generic "회원가입 중 오류가 발생했습니다." 메시지만 노출된다.

## 범위
- **파일**: `src/app/(auth)/signup/page.tsx` (수정만)
- **의존**: 없음 (T1과 독립 — 에러 매핑은 서버 에러 표시 영역에만 적용)
- **제외**: Supabase auth 로직 자체 변경 금지 — 에러 메시지 매핑만

## 현재 문제점
1. line 145: `authError.message` 영문 그대로 표시 (예: "User already registered")
2. line 150: `!authData?.user`일 때 "회원가입 중 오류가 발생했습니다." — 원인 불명확
3. line 183: catch block도 동일 generic 메시지

## 에러 매핑 목록
| Supabase 영문 메시지 | 한국어 매핑 |
|---|---|
| User already registered | 이미 가입된 이메일입니다 |
| Password should be at least 6 characters | 비밀번호는 6자 이상이어야 합니다 |
| Invalid email | 올바른 이메일 형식이 아닙니다 |
| Signups not allowed for this instance | 현재 회원가입이 제한되어 있습니다 |
| (기타/미매핑) | 회원가입 중 오류가 발생했습니다. 다시 시도해 주세요. |

## 기대 동작
1. 에러 매핑 함수 `mapSupabaseError(message: string): string` 추가
2. line 145: `authError.message` → `mapSupabaseError(authError.message)`
3. line 150: 그대로 유지 (이미 한국어)
4. line 183 catch block: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."로 변경

## 성공 기준
1. "User already registered" → "이미 가입된 이메일입니다" 표시
2. 기타 영문 에러 → 적절한 한국어 메시지 표시
3. catch block → 사용자 친화적 한국어 메시지
4. 기존 auth 로직 무변경 (signUp 호출, B1 처리 등)
5. `npm run build` 성공

## 충돌 방지
- `signup-refactor` (implementing): signUp() 호출 로직 보존
- `b1b2-t2fix-t4fix-bugfix` (completed): B1 authError + user 존재 시 진행 로직 보존
- T1과 같은 파일 수정 — 동시 구현 시 충돌 주의 (에러 표시 영역이 다름: T1은 필드별, T2는 상단 서버 에러)
