# T3. 미들웨어 역할 분기 설계서

> 최종 갱신: 2026-02-28 (코드 기준 현행화)

## 1. 데이터 모델
- profiles 테이블: role (user_role enum), onboarding_status (text: not_started/in_progress/completed)
- cookie: `x-user-role`, `x-onboarding-status` — maxAge 300초

## 2. API 설계
- 미들웨어 내부 로직 (src/lib/supabase/middleware.ts)
- role 조회: service role key로 profiles SELECT (RLS 우회)

## 3. 로직 흐름

```
1. Supabase SSR client 생성
2. getUser()
3. 공개 경로 체크 → 미인증이면 /login 리다이렉트
4. 인증됨:
   a. /login, /signup → /dashboard 리다이렉트
   b. cookie에서 role + onboarding_status 읽기
   c. cookie 없으면 → service role로 profiles SELECT → cookie 설정
   d. 역할별 라우팅:
      - admin | assistant → PASS (전체 접근)
      - student/alumni + onboarding != completed:
        - 현재 /onboarding → PASS
        - 아니면 → /onboarding 리다이렉트
      - student/alumni + onboarding completed:
        - /onboarding → /dashboard 리다이렉트
        - 나머지 → PASS
      - lead:
        - /pending만 접근 가능
        - 나머지 → /pending 리다이렉트
      - member:
        - /admin → /dashboard 리다이렉트
        - /onboarding → /dashboard 리다이렉트
        - 나머지 → PASS
      - pending → /pending 리다이렉트
      - profile 없음 → PASS
5. return supabaseResponse
```

> lead와 member는 라우팅이 다름: lead는 /pending만, member는 /admin과 /onboarding만 차단

## 4. 에러 처리
- profile 없는 경우 (trigger 미완료) → role=null → PASS (접근 허용)
- service role key 미설정 → 런타임 에러 가능 → 실패 시 PASS

## 5. 구현 순서
- [x] Plan 문서 작성
- [x] Design 문서 작성
- [x] 공개 경로 확장
- [x] cookie 기반 role 캐싱 로직
- [x] service role client로 profiles SELECT
- [x] 역할별 라우팅 분기
- [x] 리다이렉트 시 cookie 보존
- [x] npm run build 확인
