# TASK.md — Phase 3b 핫픽스 + QA 피드백
> 2026-02-20 | Phase 3b 배포 후 Smith님 직접 QA에서 발견된 버그 9건 수정

## 목표
Phase 3b 배포 후 발견된 버그 5건 + 기능 변경 4건 수정. 가입→승인→로그인→온보딩→메인 전체 플로우가 정상 동작해야 함.

## 레퍼런스
- 기존 TASK.md 기반 구현: commit `ecad07b`
- 미들웨어: `src/lib/supabase/middleware.ts`
- 리뷰 보고서: mozzi-reports/public/reports/review/2026-02-20-phase3b-member-management.html

## 현재 코드

### 승인 로직 (src/actions/admin.ts:56~85)
```ts
export async function approveMember(
  userId: string,
  newRole: "member" | "student" = "member",
  extra?: { cohort?: string; meta_account_id?: string; mixpanel_project_id?: string; mixpanel_secret_key?: string; }
) {
  const supabase = await requireAdmin();
  const update: ProfileUpdate = { role: newRole };
  // extra 필드 설정...
  const { error } = await supabase.from("profiles").update(update).eq("id", userId);
  // 이메일 발송 로직 없음!
}
```

### /pending 페이지 (src/app/(auth)/pending/page.tsx)
```tsx
// 로그아웃 버튼 없음. Link href="/login"만 있지만 세션이 살아있으면 미들웨어가 다시 /pending으로 보냄
<Link href="/login">로그인 페이지로 돌아가기</Link>
```

### 미들웨어 lead 처리 (src/lib/supabase/middleware.ts:166~175)
```ts
if (role === "lead") {
  if (pathname === "/pending") return supabaseResponse;
  // 모든 경로 → /pending 리다이렉트
  url.pathname = "/pending";
  return createRedirectWithCookies(url, supabaseResponse);
}
```
문제: 승인 후 role이 member로 바뀌는데, 미들웨어 캐시 쿠키(x-user-role)가 "lead"로 남아있으면 계속 /pending으로 감

### 온보딩 스킵 (src/app/(auth)/onboarding/page.tsx:621~633)
```ts
const handleAdSkip = useCallback(async () => {
  const result = await saveAdAccount({ metaAccountId: null, mixpanelProjectId: null, mixpanelSecretKey: null });
  if (result.error) { setError(result.error); }
  else { setStep(3); }  // → StepComplete로 이동. onboarding_completed 안 됨!
}, []);
```
문제: 스킵해도 completeOnboarding() 호출되지 않아서 onboarding_status가 "completed"가 안 됨 → 다음 로그인 시 다시 온보딩으로

### 가입 폼 (src/app/(auth)/signup/page.tsx)
```tsx
// lead 모드에서 business_number 필드에 required 속성 있음 (line 401)
// 하지만 HTML required만으로는 프로그래밍적 제출 시 우회 가능
// 서버 사이드 validation 없음
```

### 프로필 설정 (src/app/(main)/settings/settings-form.tsx)
```ts
interface Profile {
  name: string | null;
  phone: string | null;
  shop_name: string | null;
  shop_url: string | null;
}
// meta_account_id, mixpanel_project_id, mixpanel_secret_key, annual_revenue 없음
```

### 온보딩 카테고리 (src/app/(auth)/onboarding/page.tsx)
카테고리 선택 UI에 "기타" 옵션이 있으나 텍스트 입력 불가. 선택만 가능.

## 제약
- 기존 동작(student 가입, admin 회원관리, 수강후기) 깨뜨리지 않기
- 미들웨어 캐시 쿠키 메커니즘 유지 (성능 위해)
- reviews 테이블/RLS 변경 없음

## 태스크

### T1. 승인 후 접근 불가 버그 수정
- 파일: `src/actions/admin.ts`, `src/lib/supabase/middleware.ts`
- 의존: 없음
- 원인: approveMember()에서 role 변경 후 캐시 쿠키(x-user-role) 무효화 안 됨. 다음 로그인 시 미들웨어가 stale 쿠키로 /pending 리다이렉트
- 수정:
  - approveMember()에서 role 업데이트 성공 후 해당 사용자의 캐시 쿠키를 무효화할 수 있도록 onboarding_status도 함께 설정
  - 또는 /pending 페이지에서 로드 시 DB에서 현재 role 재조회 → lead가 아니면 /dashboard로 리다이렉트
- 완료 기준:
  - [ ] lead 승인 후 로그인하면 /pending이 아닌 /dashboard(또는 /onboarding)로 이동
  - [ ] member로 승인된 사용자가 정상 접근 가능

### T2. 승인 메일 발송
- 파일: `src/actions/admin.ts`
- 의존: T1 완료 후
- 수정: approveMember() 성공 후 해당 사용자 이메일로 승인 완료 메일 발송
  - profiles에서 user의 email 조회 (auth.users 또는 profiles 테이블)
  - 간단한 텍스트 이메일: "승인이 완료되었습니다. 로그인하여 서비스를 이용하세요."
  - 이메일 발송 실패해도 승인 자체는 성공 처리 (fire-and-forget)
- 완료 기준:
  - [ ] 회원 승인 시 해당 이메일로 승인 완료 메일 발송
  - [ ] 메일 발송 실패 시에도 승인은 정상 처리

### T3. /pending 로그아웃 기능
- 파일: `src/app/(auth)/pending/page.tsx`
- 의존: 없음
- 수정: "로그인 페이지로 돌아가기" 링크를 로그아웃 + 리다이렉트로 변경
  - 클라이언트 컴포넌트로 전환 ("use client")
  - supabase.auth.signOut() 호출 후 /login으로 이동
  - 캐시 쿠키(x-user-role, x-onboarding-status)도 삭제
- 완료 기준:
  - [ ] /pending에서 "로그아웃" 버튼 클릭 시 세션 종료 + /login 이동
  - [ ] 다시 로그인하면 최신 role로 라우팅

### T4. 온보딩 스킵 제거 (수강생 필수 완료)
- 파일: `src/app/(auth)/onboarding/page.tsx`
- 의존: 없음
- 수정:
  - Step 2 (광고계정/믹스패널)의 "나중에 할게요, 건너뛰기" 버튼 제거
  - Step 2도 필수 입력으로 변경 (Meta 광고계정 ID 필수, 믹스패널은 선택 유지)
  - 또는: 스킵 시에도 completeOnboarding()을 호출하여 온보딩 완료 처리
  - Smith님 의견: "수강생들은 무조건 등록을 해야됨" → 스킵 버튼 제거가 맞음
- 완료 기준:
  - [ ] 온보딩 Step 2에 "나중에 할게요" 버튼 없음
  - [ ] 온보딩 완료 전까지 메인 페이지 접근 불가
  - [ ] 온보딩 완료 후 메인 페이지 정상 접근

### T5. 사업자등록번호 서버 사이드 validation
- 파일: `src/app/(auth)/signup/page.tsx`
- 의존: 없음
- 수정:
  - 클라이언트: 가입 버튼을 disabled로 — lead 모드에서 business_number 빈 값이면 비활성화
  - 서버: signUp 전에 business_number 빈 값 체크 → 에러 반환
  - 기존 HTML required 유지 + JS validation 추가 (이중 방어)
- 완료 기준:
  - [ ] 사업자등록번호 비우고 가입 시도 → 에러 메시지 + 가입 차단
  - [ ] 사업자등록번호 입력 후 가입 → 정상 처리

### T6. 프로필 설정에 광고계정/믹스패널 필드 추가
- 파일: `src/app/(main)/settings/settings-form.tsx`, `src/app/(main)/settings/page.tsx`
- 의존: 없음
- 수정:
  - Profile interface에 meta_account_id, mixpanel_project_id, mixpanel_secret_key, annual_revenue 추가
  - 설정 폼에 해당 필드 입력 UI 추가
  - mixpanel_secret_key는 마스킹 처리 (보기/숨기기 토글)
  - page.tsx에서 DB 조회 시 해당 컬럼도 포함
- 완료 기준:
  - [ ] 설정 페이지에서 Meta 광고계정 ID 수정 가능
  - [ ] 믹스패널 프로젝트 ID 수정 가능
  - [ ] 믹스패널 시크릿키 수정 가능 (마스킹 + 토글)
  - [ ] 연매출 수정 가능
  - [ ] 저장 후 DB 반영 확인

### T7. 카테고리 "기타" 텍스트 입력
- 파일: `src/app/(auth)/onboarding/page.tsx`
- 의존: 없음
- 수정: 카테고리 선택에서 "기타" 선택 시 텍스트 입력 필드 표시
  - "기타" 선택 → 하단에 input 표시 → 입력값을 category로 저장
- 완료 기준:
  - [ ] 카테고리 "기타" 선택 시 텍스트 입력란 표시
  - [ ] 입력한 텍스트가 profiles.category에 저장

### T8. 리드 가입 시 기수 필드 제거
- 파일: `src/app/(auth)/signup/page.tsx`
- 의존: 없음
- 수정: lead 모드 가입 폼에서 기수(cohort) 관련 필드가 보이지 않아야 함. 현재 코드상 lead 모드에서는 이미 cohort를 보내지 않지만, UI에 표시되는지 확인 후 제거
- 완료 기준:
  - [ ] lead 가입 폼에 기수 선택 필드 없음
  - [ ] student(초대코드) 가입에만 기수 표시

## 엣지 케이스
| 상황 | 기대 동작 |
|------|-----------|
| 승인된 회원이 /pending 직접 접근 | /dashboard로 리다이렉트 |
| 온보딩 중간에 브라우저 닫기 | 다음 로그인 시 이어서 온보딩 |
| 사업자등록번호에 특수문자 입력 | 숫자+하이픈만 허용 (000-00-00000 형식) |
| 승인 메일 발송 실패 | 승인 자체는 성공. 콘솔 에러 로그만 |
| 프로필에서 시크릿키를 빈 값으로 저장 | 허용 (nullable) |
| "기타" 카테고리 텍스트 빈 값 | "기타" 텍스트 입력 필수 |
| 캐시 쿠키 만료 전 역할 변경 | /pending 페이지에서 DB 재조회로 해결 (T1) |
| 온보딩 Step 2 모든 필드 빈 값 | 다음 단계 진행 불가 (스킵 버튼 제거됨) |
| lead가 /signup에서 기수 입력 시도 | 기수 필드 자체가 없음 |
| lead가 로그인 후 /dashboard URL 직접 입력 | /pending으로 리다이렉트 (기존 동작 유지) |
| member가 /onboarding URL 직접 입력 | /dashboard로 리다이렉트 (기존 동작 유지) |
| student 온보딩 완료 후 /onboarding 재접근 | /dashboard로 리다이렉트 (기존 동작 유지) |
| 승인 메일 수신자 이메일이 잘못된 형태 | Supabase auth.users의 email 사용 (가입 시 검증됨) |
| 프로필 저장 시 네트워크 에러 | toast로 에러 메시지 표시 |

## 리뷰 보고서
- 보고서 파일: mozzi-reports/public/reports/review/2026-02-20-phase3b-hotfix.html
- 리뷰 일시: 2026-02-20 21:30
- 변경 유형: 혼합 (프론트엔드 + 서버 액션 + 미들웨어)
- 피드백 요약: Critical 3건(T1 승인 접근불가, T3 /pending 루프), High 2건(T2 메일, T6 프로필), Medium 2건(T4 스킵, T5 validation), Low 1건(T7 기타)
- 반영 여부: 반영함 — 권장 구현 순서 T1+T3 → T2 → T4+T7 → T5+T8 → T6

## 검증
☐ npm run build 성공
☐ lead 가입 → 사업자등록번호 빈 값 → 가입 차단
☐ lead 가입 → 사업자등록번호 입력 → /pending 리다이렉트
☐ admin이 lead 승인 → 해당 계정 로그인 → /dashboard 접근 가능
☐ 승인 시 이메일 발송 확인
☐ /pending에서 로그아웃 → /login 이동
☐ 온보딩 Step 2에 스킵 버튼 없음
☐ 온보딩 완료 → 메인 페이지 접근 가능
☐ 프로필 설정에서 광고계정/믹스패널/시크릿키 수정 + 저장
☐ 카테고리 "기타" 텍스트 입력 + 저장
☐ lead 가입 폼에 기수 필드 없음
