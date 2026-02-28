# T3. 미들웨어 역할 분기 Plan

## 요구사항
- 인증된 사용자의 role 및 onboarding_status를 조회하여 역할별 라우팅
- 성능 최적화: cookie 캐싱 (5분 TTL)으로 매 요청마다 DB 조회 방지
- 공개 경로 확장: /subscribe, /unsubscribe, /api/invite/validate 추가

## 범위
- 파일: `src/lib/supabase/middleware.ts` (수정)
- 의존: T0 (DB 마이그레이션 완료 — profiles에 onboarding_status, invite_code_used 컬럼 존재)

## 성공 기준
1. admin -> 전체 접근 허용
2. student/alumni + onboarding 미완료 -> /onboarding 강제 리다이렉트
3. student/alumni + onboarding 완료 -> 전체 접근, 단 /onboarding -> /dashboard 리다이렉트
4. lead/member -> /questions, /admin, /onboarding 접근 시 /dashboard 리다이렉트
5. pending (레거시) -> /pending 리다이렉트
6. profile 없는 경우 -> PASS (auth trigger 미완료 등)
7. cookie 캐싱으로 5분 내 반복 조회 방지
8. npm run build 성공
