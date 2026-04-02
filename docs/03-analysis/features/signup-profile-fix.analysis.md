# signup-profile-fix Gap 분석

> 작성일: 2026-04-02
> Design: docs/02-design/features/signup-profile-fix.design.md
> 레벨: L1

---

## 1. Design vs 구현 비교

| Design 항목 | 구현 상태 | 비고 |
|-------------|----------|------|
| toProfileId 유틸리티 | ✅ 구현 | src/lib/firebase-uid-to-uuid.ts |
| Gateway 6함수 (auth.ts) | ✅ 패치 | ensureProfile 등 6개 |
| Gateway 3함수 (auth-utils.ts) | ✅ 패치 | getProfile, requireAdmin, requireStaff |
| middleware.ts raw SQL | ✅ 패치 | toProfileId(uid) 적용 |
| actions/ 직접 쿼리 6파일 | ✅ 패치 | onboarding(10), questions(4), qa-reports(3), reviews(5), answers(2), posts(1) |
| API routes 11파일 | ✅ 패치 | competitor, admin, protractor, qa-chatbot, ext |
| Pages 17파일 | ✅ 패치 | settings, posts, admin, protractor, questions, reviews, dashboard |
| INSERT author_id/user_id | ✅ 패치 | toProfileId 적용 |
| === 비교문 | ✅ 패치 | questions, reviews, answers의 isOwner/isAuthor |

## 2. TDD 검증

| ID | 테스트 | 결과 |
|----|--------|------|
| SP-01 | Firebase UID → 유효 UUID 변환 | ✅ PASS |
| SP-02 | 기존 UUID 그대로 반환 | ✅ PASS |
| SP-03 | 동일 UID → 동일 UUID (결정적) | ✅ PASS |
| SP-04 | 빈 문자열 → UUID 반환 | ✅ PASS |
| SP-05 | ensureProfile Firebase UID INSERT | ✅ PASS |
| SP-06 | ensureProfile 중복 방지 | ✅ PASS |
| SP-07 | ensureProfile Supabase UUID 통과 | ✅ PASS |
| SP-08 | getProfileById 변환 조회 | ✅ PASS |
| SP-09 | 프로필 없는 유저 생성 복구 | ✅ PASS |
| SP-10 | Supabase 유저 정상 조회 | ✅ PASS |
| 추가1 | 다른 UID → 다른 UUID | ✅ PASS |
| 추가2 | UUID v5 버전 비트 확인 | ✅ PASS |
| 추가3 | Firebase UID 원본 .eq() 미전달 | ✅ PASS |

## 3. 빌드 검증

- npx tsc --noEmit: 에러 0건 ✅
- npm run build: 성공 ✅
- npx eslint src/ --max-warnings 999: error 0건 ✅

## 4. 미패치 잔여 검증

```
grep -rn '.eq("id", user.uid)' src/ | grep -v toProfileId → 0건
grep -rn '.eq("user_id", user.uid)' src/ | grep -v toProfileId → 0건
grep -rn '.eq("author_id", user.uid)' src/ | grep -v toProfileId → 0건
```

## 5. 로컬 테스트

- 새 이메일 회원가입: ✅ 성공 (프로필 생성 에러 없음)
- 기존 계정 로그인: ✅ 정상

## Match Rate: 100%

Design 문서의 모든 항목 구현 완료. 미구현 0건.
