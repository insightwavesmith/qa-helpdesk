# TASK.md — Phase 3 쿠키 캐시 버그 수정
> 2026-02-20 | 온보딩 완료 / 로그아웃 시 미들웨어 캐시 쿠키 미삭제 버그 2건

## 목표
미들웨어가 캐싱하는 `x-user-role`, `x-onboarding-status` 쿠키가 lifecycle 이벤트(온보딩 완료, 로그아웃) 시 무효화되지 않는 버그 2건 수정.

성공 기준:
1. 온보딩 완료 후 즉시 /questions 접근 가능 (5분 대기 없이)
2. 로그아웃 후 다른 계정 로그인 시 이전 역할 쿠키 잔존하지 않음

## 레퍼런스
- 미들웨어 쿠키 설정: `src/lib/supabase/middleware.ts`
- 기존 패턴: Next.js `cookies()` from `next/headers`

## 현재 코드

### 미들웨어 — 쿠키 캐싱 (middleware.ts)
```ts
// src/lib/supabase/middleware.ts
const ROLE_COOKIE = "x-user-role";
const ONBOARDING_COOKIE = "x-onboarding-status";
const COOKIE_MAX_AGE = 300; // 5분

// role 없으면 service role로 profiles 조회 후 cookie 설정
if (!role) {
  // ... profiles 조회 ...
  supabaseResponse.cookies.set(ROLE_COOKIE, fetchedRole, { path: "/", maxAge: COOKIE_MAX_AGE });
  supabaseResponse.cookies.set(ONBOARDING_COOKIE, fetchedStatus, { path: "/", maxAge: COOKIE_MAX_AGE });
}
```

### 온보딩 완료 — 쿠키 무효화 없음 (Bug #1)
```ts
// src/actions/onboarding.ts — completeOnboarding()
export async function completeOnboarding() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "인증되지 않은 사용자입니다" };

  const svc = createServiceClient();
  const { error } = await svc
    .from("profiles")
    .update({ onboarding_step: 3, onboarding_status: "completed" } as never)
    .eq("id", user.id);

  // ❌ x-onboarding-status 쿠키를 삭제하지 않음 → 5분간 캐시된 "in_progress" 유지
  if (error) return { error: error.message };
  return { error: null };
}
```

### 로그아웃 — 쿠키 삭제 없음 (Bug #2)
```tsx
// 3곳 동일 패턴:
// - src/components/layout/app-sidebar.tsx (line 86~90)
// - src/components/dashboard/Sidebar.tsx (line 69~73)
// - src/components/layout/student-header.tsx (line 25~29)

const handleLogout = async () => {
  const supabase = createClient();
  await supabase.auth.signOut();
  router.push("/login");
  router.refresh();
  // ❌ x-user-role, x-onboarding-status 쿠키 미삭제 → 다른 계정 로그인 시 이전 역할로 동작
};
```

## 제약
- 미들웨어 캐시 구조(ROLE_COOKIE, ONBOARDING_COOKIE, COOKIE_MAX_AGE) 자체는 유지 — 매 요청 DB 조회 방지 목적
- Supabase auth 쿠키는 건드리지 않음 — `signOut()`이 알아서 처리
- `handleLogout`은 클라이언트 컴포넌트 → `cookies()` (next/headers) 사용 불가

## 태스크

### T1. 온보딩 완료 시 캐시 쿠키 삭제 → Leader
- 파일: `src/actions/onboarding.ts`
- 의존: 없음
- 방법: `completeOnboarding()` 성공 후 `cookies()` from `next/headers`로 두 쿠키 삭제
- 완료 기준:
  - [ ] `completeOnboarding()` 성공 시 `x-user-role`, `x-onboarding-status` 쿠키 삭제
  - [ ] import `cookies` from `next/headers` 추가
  - [ ] 에러 시에는 쿠키 삭제하지 않음 (DB 업데이트 실패 시 기존 캐시 유지)

### T2. 로그아웃 시 캐시 쿠키 삭제 → Leader
- 파일: `src/components/layout/app-sidebar.tsx`, `src/components/dashboard/Sidebar.tsx`, `src/components/layout/student-header.tsx`
- 의존: 없음
- 방법: `handleLogout()` 내 `signOut()` 후 `document.cookie`로 두 쿠키 만료 처리
- 완료 기준:
  - [ ] 3개 파일 모두 `handleLogout()`에 쿠키 삭제 추가
  - [ ] `document.cookie = 'x-user-role=; path=/; max-age=0'`
  - [ ] `document.cookie = 'x-onboarding-status=; path=/; max-age=0'`
  - [ ] `signOut()` 후, `router.push` 전에 실행

## 엣지 케이스
| 상황 | 기대 동작 |
|------|-----------|
| 온보딩 DB 업데이트 실패 | 쿠키 삭제 안 함 (캐시 유지, 재시도 가능) |
| signOut 실패 | 쿠키는 삭제해도 무방 (어차피 다음 요청에서 미인증 처리) |
| 쿠키가 이미 없는 상태에서 삭제 시도 | document.cookie로 없는 쿠키 삭제해도 에러 안 남 |
| SSR에서 document 접근 | handleLogout은 onClick 핸들러 → CSR만 → document 안전 |

## 리뷰 보고서
- 보고서 파일: mozzi-reports/public/reports/review/2026-02-20-phase3-cookie-bugfix.html
- 리뷰 일시: (리뷰 후 채움)
- 변경 유형: 백엔드 구조 + 프론트엔드
- 피드백 요약: (리뷰 후 채움)
- 반영 여부: (리뷰 후 채움)

## 검증
☐ npm run build 성공
☐ 기존 온보딩 플로우 안 깨짐
☐ 온보딩 완료 → 즉시 /questions 접근 가능 (쿠키 클리어 없이)
☐ 로그아웃 → admin 로그인 → student 로그인 → student 메뉴 정상 표시
☐ 로그아웃 → 브라우저 DevTools에서 x-user-role, x-onboarding-status 쿠키 없음 확인
