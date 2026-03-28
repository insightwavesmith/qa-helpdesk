# Mixpanel SDK 클라이언트 트래킹 설계서

## 1. 데이터 모델
환경변수:
- `NEXT_PUBLIC_MIXPANEL_TOKEN` — 클라이언트 토큰
- `NEXT_PUBLIC_MIXPANEL_PROJECT_ID` — 프로젝트 ID (참조용)

## 2. API 설계
해당 없음 (클라이언트 SDK 직접 호출)

## 3. 컴포넌트 구조

### 3-1. `src/lib/mixpanel.ts` — 헬퍼 모듈
- `mp.init()` — SDK 초기화 (window 가드)
- `mp.identify(userId)` — 유저 식별
- `mp.track(event, props)` — 이벤트 전송
- `mp.people.set(props)` — 유저 프로필 업데이트
- `mp.register(props)` — 슈퍼 프로퍼티 설정
- `mp.reset()` — 로그아웃 시 초기화

### 3-2. `src/components/mixpanel-provider.tsx` — 초기화 컴포넌트
- `"use client"` 컴포넌트
- `useEffect`에서 `mp.init()` 호출
- `layout.tsx`에서 렌더링

### 3-3. 트래킹 삽입 위치
| 파일 | 함수 | 이벤트 |
|------|------|--------|
| `(auth)/login/page.tsx` | handleLogin 성공 후 | login + identify + people.set + register |
| `components/layout/app-sidebar.tsx` | handleLogout | logout + reset |
| `(auth)/onboarding/page.tsx` | handleWelcomeNext | onboarding_step_completed (step 0→1) |
| `(auth)/onboarding/page.tsx` | handleProfileSave | onboarding_step_completed (step 1→2) |
| `(auth)/onboarding/page.tsx` | handleAdConnect | onboarding_step_completed (step 2→3) |
| `(auth)/onboarding/page.tsx` | useEffect step===3 | onboarding_completed |
| `questions/new/new-question-form.tsx` | onSubmit 성공 | question_created |
| `questions/[id]/question-detail-tracker.tsx` | useEffect mount | question_detail_viewed |
| `protractor/real-dashboard.tsx` | useEffect mount | protractor_viewed |
| `protractor/real-dashboard.tsx` | onValueChange 탭 | protractor_tab_switched |
| `settings/settings-form.tsx` | handleSave 성공 | profile_updated |
| `settings/settings-form.tsx` | handleAddAccount 성공 | ad_account_connected |
| `settings/page.tsx` | 클라이언트 래퍼 useEffect | settings_viewed |

### 3-4. 유저 프로필 프로퍼티
```
$name, $email, role, cohort, cohort_id, brand_name, shop_url,
annual_revenue, monthly_ad_budget, category,
ad_account_count, onboarding_completed, last_login
```

### 3-5. 슈퍼 프로퍼티
```
platform: "web", app_version: "1.0.0", user_role, user_cohort, session_id
```

## 4. 에러 처리
- `typeof window === 'undefined'` 가드로 SSR 방지
- TOKEN 미설정 시 no-op (조용히 무시)

## 5. 구현 순서
1. [x] `npm install mixpanel-browser @types/mixpanel-browser`
2. [ ] `src/lib/mixpanel.ts` 생성
3. [ ] `src/components/mixpanel-provider.tsx` 생성
4. [ ] `layout.tsx`에 Provider 추가
5. [ ] `.env.local`에 환경변수 추가
6. [ ] 각 파일에 트래킹 코드 삽입 (상기 테이블 순서)
7. [ ] 빌드 검증
