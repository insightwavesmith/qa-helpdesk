# Onboarding 4-Step UI Plan

## Scope
- Student/Alumni 전용 온보딩 4단계 페이지 (/onboarding)
- 서버 액션: 프로필 조회, 단계 업데이트, 프로필 저장, 광고계정 저장, 완료 처리

## Success Criteria
- Step 0~3 화면 전환 (state 기반, router.push 미사용)
- 중간 이탈 시 마지막 step 기억 (onboarding_step + onboarding_status)
- Step 3 완료 시 onboarding_status = 'completed'
- 모바일 반응형 (375px~)
- 브랜드 스타일 (#F75D5D, rounded-xl, shadow-lg)
- 한국어 UI only

## Files
1. `src/actions/onboarding.ts` (신규) - Server actions
2. `src/app/(auth)/onboarding/page.tsx` (신규) - Client page

## Dependencies
- T0 (DB migration): onboarding_status, onboarding_step columns
- T3 (Middleware): student/alumni + onboarding incomplete -> /onboarding redirect
