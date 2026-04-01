# signup-profile-fix Design — 회원가입 프로필 생성 실패 수정

> 작성일: 2026-04-02
> 프로세스 레벨: L1
> TASK: /Users/smith/.openclaw/workspace/tasks/TASK-SIGNUP-PROFILE-FIX.md
> 근본 원인: Firebase UID(28자 문자열)를 profiles.id(UUID 타입)에 INSERT → PostgreSQL 22P02

---

## 1. 결정: UUID v5 Deterministic 변환

### 왜 이 방식인가

| 옵션 | 설명 | 판정 |
|------|------|------|
| A. profiles.id UUID→TEXT 변경 | FK 12개 + 연관 테이블 전부 수정 | ❌ Smith님 스키마 변경 금지 |
| B. **UUID v5 변환 (코드)** | Firebase UID → 고정 UUID 생성. 스키마 불변 | ✅ 채택 |
| C. firebase_uid 컬럼 추가 | 새 컬럼 + 매핑 로직 | ❌ 스키마 변경 |

### UUID v5 동작 원리

```
입력: "931EZvrM96MdN8Kx0QijFgd4njk2" (Firebase UID)
네임스페이스: "6ba7b810-9dad-11d1-80b4-00c04fd430c8" (DNS)
출력: "1e323198-d03d-5a77-958a-8ff2ca2c3447" (항상 동일)
```

- **결정적(deterministic)**: 같은 Firebase UID → 항상 같은 UUID
- **충돌 없음**: UUID v5는 SHA-1 기반, 실질적 충돌 확률 0
- **역호환**: 기존 Supabase Auth 유저(UUID 형식)는 `validate(uid) === true` → 변환 스킵

---

## 2. 핵심 유틸리티

### 2.1 신규 파일: `src/lib/firebase-uid-to-uuid.ts`

```typescript
import { v5 as uuidv5, validate as uuidValidate } from "uuid";

// DNS namespace — Firebase UID → UUID 변환 전용
const FIREBASE_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/**
 * Firebase UID를 profiles.id UUID 형식으로 변환.
 * 이미 UUID 형식이면 그대로 반환 (기존 Supabase Auth 유저 호환).
 */
export function toProfileId(uid: string): string {
  if (uuidValidate(uid)) return uid;
  return uuidv5(uid, FIREBASE_NAMESPACE);
}
```

---

## 3. 적용 범위 — Gateway 함수 10개

### 전략: Gateway 패턴

109곳에서 profiles를 쿼리하지만, **모든 경로가 10개 gateway 함수를 경유**한다.
gateway 함수 입구에서 `toProfileId(userId)` 적용 → 하위 모든 쿼리 자동 수정.

### 3.1 `src/actions/auth.ts` — 6개 함수

| 함수 | 라인 | 변경 |
|------|------|------|
| `ensureProfile` | 10 | `userId = toProfileId(userId)` 추가 (함수 첫 줄) |
| `updateBusinessCertUrl` | 58 | 동일 |
| `getProfileById` | 78 | 동일 |
| `getProfileRoleStatus` | 100 | 동일 |
| `updateProfile` | 114 | 동일 |
| `savePrivacyConsent` | 124 | 동일 |

패턴:
```typescript
export async function ensureProfile(userId: string, ...) {
  userId = toProfileId(userId);  // ← 추가
  // 기존 코드 그대로
}
```

### 3.2 `src/lib/auth-utils.ts` — 3개 함수

| 함수 | 라인 | 변경 |
|------|------|------|
| `getProfile` | 10 | `uid = toProfileId(uid)` |
| `requireAdmin` | 23 | `user.uid` → `toProfileId(user.uid)` |
| `requireStaff` | 42 | `user.uid` → `toProfileId(user.uid)` |

### 3.3 `src/lib/firebase/middleware.ts` — 1개

| 위치 | 라인 | 변경 |
|------|------|------|
| raw SQL query | 124 | `uid` → `toProfileId(uid)` |

### 3.4 직접 Supabase 쿼리 (page components + API routes)

**50+ 파일**이 `.from("profiles")...eq("id", user.uid)` 패턴으로 직접 쿼리.
이들은 gateway 함수를 경유하지 않으므로 별도 수정 필요.

**적용 방법**: `user.uid` → `toProfileId(user.uid)` 치환

대상 파일 (전수):
- `src/actions/admin.ts` — 8곳
- `src/actions/onboarding.ts` — 10곳
- `src/actions/questions.ts` — 4곳
- `src/actions/qa-reports.ts` — 3곳
- `src/actions/reviews.ts` — 5곳
- `src/actions/answers.ts` — 2곳
- `src/actions/posts.ts` — 1곳
- `src/app/api/` — 8개 route 파일
- `src/app/(main)/` — 16개 page 파일
- `src/lib/precompute/` — 3개 파일
- `src/lib/protractor/mixpanel-collector.ts` — 1곳

**총 수정: 약 60개 파일, 각 파일 1~10줄 변경 (import + uid 치환)**

---

## 4. FK 참조 영향 없음

profiles.id를 참조하는 FK 12개:

| FK | 테이블.컬럼 |
|----|------------|
| ad_accounts.user_id | ✅ 영향 없음 — INSERT 시 이미 변환된 UUID 사용 |
| answers.author_id | ✅ 동일 |
| comments.author_id | ✅ 동일 |
| contents.author_id | ✅ 동일 |
| invite_codes.created_by | ✅ 동일 |
| leads.converted_user_id | ✅ 동일 |
| likes.user_id | ✅ 동일 |
| notification_preferences.user_id | ✅ 동일 |
| questions.author_id | ✅ 동일 |
| reviews.author_id | ✅ 동일 |
| service_secrets.user_id | ✅ 동일 |
| student_registry.matched_profile_id | ✅ 동일 |

**이유**: profiles.id에 변환된 UUID가 INSERT되면, FK를 참조하는 다른 테이블들도 같은 변환된 UUID로 INSERT/SELECT하게 됨. `toProfileId()`가 모든 gateway에 적용되므로 일관성 유지.

---

## 5. 기존 가입 실패 유저 복구

### 케이스 A: Firebase 계정 삭제됨 (대다수)
- signup 코드가 프로필 실패 시 `deleteUser(cred.user)` 실행 (line 339-344)
- **복구**: 재가입하면 수정된 코드로 정상 처리

### 케이스 B: Firebase 계정 존재 + 프로필 없음 (deleteUser 실패한 경우)
- login 코드에 자동 복구 로직 존재 (login/page.tsx line 44-58)
- `ensureProfile(user.uid, ...)` 호출 → 수정된 코드로 UUID 변환 → 프로필 생성
- **복구**: 로그인하면 자동 복구

### 별도 복구 스크립트 불필요

---

## 6. 구현 순서

```
1. src/lib/firebase-uid-to-uuid.ts 생성 (유틸리티)
2. src/actions/auth.ts 수정 (6개 함수)
3. src/lib/auth-utils.ts 수정 (3개 함수)
4. src/lib/firebase/middleware.ts 수정 (1곳)
5. src/actions/{admin,onboarding,questions,qa-reports,reviews,answers,posts}.ts 수정
6. src/app/api/ 8개 route 수정
7. src/app/(main)/ 16개 page 수정
8. src/lib/precompute/ 3개 + mixpanel-collector 1개 수정
9. tsc + build 검증
10. 로컬에서 신규 가입 테스트
```

---

## 7. TDD 케이스 (Gap 100% 기준)

### 유틸리티

| ID | 테스트 | 예상 결과 |
|----|--------|----------|
| SP-01 | `toProfileId("931EZvrM96MdN8Kx0QijFgd4njk2")` | 유효 UUID 반환 + 결정적 |
| SP-02 | `toProfileId(uuidv4())` | 입력 그대로 반환 (Supabase 호환) |
| SP-03 | 같은 Firebase UID 2회 호출 | 동일 UUID 반환 |
| SP-04 | 빈 문자열 입력 | UUID 반환 (에러 아님) |

### 가입 플로우

| ID | 테스트 | 예상 결과 |
|----|--------|----------|
| SP-05 | Firebase UID로 `ensureProfile` 호출 | profiles.id에 UUID 형식으로 INSERT 성공 |
| SP-06 | 동일 Firebase UID로 `ensureProfile` 재호출 | 기존 row 발견 → 스킵 (중복 방지) |
| SP-07 | 기존 Supabase UUID로 `ensureProfile` 호출 | UUID 그대로 사용 → 정상 |
| SP-08 | Firebase UID로 `getProfileById` 호출 | 변환 UUID로 조회 → 프로필 반환 |

### 로그인 복구

| ID | 테스트 | 예상 결과 |
|----|--------|----------|
| SP-09 | Firebase 계정 있고 프로필 없는 유저 로그인 | 자동 복구 → 프로필 생성 + 로그인 성공 |
| SP-10 | 기존 Supabase 유저 로그인 | 기존 프로필 정상 조회 (변환 스킵) |

### 빌드

| ID | 테스트 | 예상 결과 |
|----|--------|----------|
| SP-11 | `npx tsc --noEmit` | 에러 0 |
| SP-12 | `npm run build` | 성공 |

---

## 8. 리스크

| 리스크 | 영향 | 완화 |
|--------|------|------|
| 60개 파일 수정 범위 | 누락 시 일부 쿼리 실패 | grep 전수 검사 + tsc 타입 체크 |
| uuid 패키지 미설치 | 빌드 실패 | `npm install uuid @types/uuid` (lock 확인 — 이미 간접 의존) |
| 기존 Supabase 유저 영향 | 로그인 불가 | `validate()` 분기로 기존 UUID 그대로 통과 |
