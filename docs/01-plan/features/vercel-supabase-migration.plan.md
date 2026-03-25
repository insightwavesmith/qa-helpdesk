# Vercel+Supabase 의존도 탈피 마이그레이션 기획서

> 작성일: 2026-03-25
> 작성자: CTO팀
> 상태: Plan (코드 변경 없음)
> 참조: `docs/03-analysis/supabase-vercel-dependency.analysis.md`, `docs/01-plan/features/gcp-full-migration.plan.md`

---

## 6. Executive Summary

| 항목 | 내용 |
|------|------|
| **서비스** | 자사몰사관학교 (bscamp) — Meta 광고 교육 플랫폼, ~40명 수강생 |
| **현재 인프라** | Vercel (Next.js 16 프론트) + Supabase (Auth만) + GCP (Cloud Run, Cloud SQL, GCS, Scheduler) |
| **목표** | Vercel+Supabase 완전 제거 → GCP 단일 클라우드 통합 |
| **이미 완료** | DB(Cloud SQL), Storage(GCS), Cron(Cloud Scheduler), maxDuration 제거, vercel.json 정리 |
| **남은 작업** | (A) Auth 마이그레이션, (B) 프론트 호스팅 이관, (C) 잔여 코드 정리 |
| **총 예상 공수** | 3~4주 (Auth 2~3주 + 프론트 이관 3~5일 + 정리 2~3일) |
| **긴급도** | 낮음 — Vercel 무료 티어 + Supabase 무료 티어(50K MAU)로 비용 부담 없음 |
| **장기 이점** | 인프라 자립, 단일 클라우드 운영, 레이턴시 감소(서울 리전 통합), 벤더 락인 탈피 |

---

## 1. 현재 의존성 맵

### 1-1. Vercel 의존성

| 기능 | 현재 상태 | 파일 수 | 상세 |
|------|:---------:|:-------:|------|
| Next.js 호스팅 (SSR) | **사용 중** | 전체 | `bscamp.vercel.app`에서 서빙 중 |
| Edge 미들웨어 | **사용 중** | 1 | `src/proxy.ts` → `src/lib/supabase/middleware.ts` 호출 |
| Vercel Cron | **제거됨** | 0 | Cloud Scheduler 23개로 완전 이관 완료 |
| Preview 배포 | **사용 중** | — | PR별 자동 배포 + bypass 시크릿으로 QA |
| 이미지 최적화 (next/image) | **사용 중** | 27 | `next.config.ts`에 Supabase Storage remotePatterns 설정 |
| maxDuration | **제거됨** | 0 | 33파일에서 모두 삭제 완료 |
| CDN 캐시 (s-maxage) | **유지** | 3 | 표준 HTTP 헤더 — Cloud CDN에서도 동작 |
| vercel.json | **빈 객체** | 1 | `{}` — regions 설정 제거됨 |
| @vercel/* 패키지 | **없음** | 0 | 의존도 낮음 |
| VERCEL_URL 환경변수 | **간접 사용** | 1 | `NEXT_PUBLIC_BASE_URL` 폴백으로 참조 |
| Dockerfile | **준비됨** | 1 | 3-stage standalone 빌드, PORT=8080 |

### 1-2. Supabase 의존성

| 기능 | 현재 상태 | 파일/호출 수 | 상세 |
|------|:---------:|:-----------:|------|
| **Auth (핵심)** | **사용 중** | 62파일 / 91호출 | `supabase.auth.getUser()` 79회, `signInWithPassword()` 2회, `signUp()` 1회, `signOut()` 3회 등 |
| **DB 쿼리 (.from/.rpc)** | **이관 완료** | — | `server.ts` Proxy + `USE_CLOUD_SQL=true` → Cloud SQL 자동 라우팅 |
| **RLS (Row Level Security)** | **비활성 가능** | 33 migration / 241 정책 | `auth.uid()` 기반 — Cloud SQL에서 미작동. `createServiceClient()` RLS 우회로 대부분 동작 |
| **Storage** | **이관 완료** | — | `gcs-storage.ts` 구현 완료. GCS `gs://bscamp-storage` 사용 중 |
| **Realtime** | **미사용** | 0 | `.channel()`, `.subscribe()` 호출 없음 |
| **PostgREST REST API** | **이중 모드** | 11 스크립트 | `scripts/lib/db-helpers.mjs`에서 `USE_CLOUD_SQL` 분기 — Cloud SQL / Supabase REST 병행 |
| **Edge Functions** | **미사용** | 0 | `supabase/functions/` 비어있음 |
| **supabase-js SDK** | **사용 중** | 69파일 | `@supabase/supabase-js` + `@supabase/ssr` — Auth + Proxy 패턴 |

### 1-3. Supabase Auth 호출 분포 (파일/함수 수준)

**Server Actions (10파일, 29호출)**

| 파일 | 호출 수 | Auth 함수 |
|------|:-------:|-----------|
| `src/actions/onboarding.ts` | 9 | `getUser()` |
| `src/actions/reviews.ts` | 5 | `getUser()` |
| `src/actions/questions.ts` | 4 | `getUser()` |
| `src/actions/posts.ts` | 3 | `getUser()` |
| `src/actions/qa-reports.ts` | 3 | `getUser()` |
| `src/actions/answers.ts` | 2 | `getUser()` |
| `src/actions/invites.ts` | 1 | `getUser()` |
| `src/lib/auth-utils.ts` | 2 | `getUser()` (requireAdmin, requireStaff 헬퍼) |

**API Routes (22파일, 25호출)**

| 파일 | Auth 함수 |
|------|-----------|
| `src/app/api/auth/callback/route.ts` | `exchangeCodeForSession()`, `getUser()`, `verifyOtp()` |
| `src/app/api/ext/auth/route.ts` | `signInWithPassword()` (크롬 확장) |
| `src/app/api/ext/_shared.ts` | 직접 Supabase 클라이언트 생성 |
| `src/app/api/admin/_shared.ts` | `getUser()` |
| `src/app/api/protractor/_shared.ts` | `getUser()` |
| 기타 17개 API Route | `getUser()` |

**브라우저 페이지 (30파일, 37호출)**

| 파일 | Auth 함수 |
|------|-----------|
| `src/app/(auth)/login/page.tsx` | `signInWithPassword()`, `getUser()` |
| `src/app/(auth)/signup/page.tsx` | `signUp()` |
| `src/app/(auth)/reset-password/page.tsx` | `onAuthStateChange()`, `exchangeCodeForSession()`, `getSession()`, `updateUser()` |
| `src/app/(auth)/forgot-password/page.tsx` | `resetPasswordForEmail()` |
| `src/app/(auth)/pending/page.tsx` | `getUser()`, `signOut()` |
| `src/app/(auth)/onboarding/page.tsx` | `getUser()`, `signOut()` |
| `src/components/dashboard/Sidebar.tsx` | `signOut()` |
| `src/components/layout/app-sidebar.tsx` | `signOut()` |
| `src/components/layout/student-header.tsx` | `signOut()` |
| 기타 21개 페이지 | `getUser()` (Server Component에서 인증 확인) |

**핵심 인프라 (3파일)**

| 파일 | 역할 | 줄 수 |
|------|------|:-----:|
| `src/lib/supabase/middleware.ts` | 세션 갱신 + role 기반 라우팅 | 254줄 |
| `src/lib/supabase/server.ts` | Auth(Supabase) + DB(Cloud SQL) Proxy 패턴 | 81줄 |
| `src/lib/supabase/client.ts` | 브라우저 Auth 클라이언트 | 10줄 |
| `src/proxy.ts` | Next.js 미들웨어 → supabase middleware 위임 | 13줄 |

### 1-4. 하드코딩된 Supabase URL

| 파일 | 내용 |
|------|------|
| `next.config.ts` | `remotePatterns` — `symvlrsmkjlztoopbnht.supabase.co` (이미지 최적화) |
| `Dockerfile` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 빌드 시 인라인 |
| `src/lib/email-default-template.ts` | 로고/배너 이미지 URL 9건 |
| `src/lib/newsletter-row-templates.ts` | 로고/배너 URL 3건 |
| `src/lib/email-template-utils.ts` | `BANNER_BASE_URL` 1건 |
| `src/lib/gcs-storage.ts` | URL 파싱 (이관 도구) 1건 |

### 1-5. 환경변수 의존성

| 변수 | 용도 | 제거 시점 |
|------|------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Auth 클라이언트 + 이미지 URL | Phase A 완료 후 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 브라우저 Auth 클라이언트 | Phase A 완료 후 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 Auth + DB fallback | Phase A 완료 후 |

---

## 2. GCP 대안 매핑

| # | 현재 (Vercel/Supabase) | GCP 대안 | 상태 | 비고 |
|:-:|------------------------|----------|:----:|------|
| 1 | Vercel 호스팅 (SSR) | Cloud Run (`bscamp-web`) | Dockerfile 준비 완료 | standalone 빌드 + PORT=8080 |
| 2 | Edge 미들웨어 | Next.js server middleware on Cloud Run | **자동 폴백** | Edge → Node.js 런타임으로 자동 전환 |
| 3 | Supabase Auth | Firebase Auth (bscamp.app 도메인) | **설정 완료** | 이메일+비밀번호, SDK 4파일 구현됨 |
| 4 | Supabase RLS | 앱 레벨 인증 (Server Action/API Route) | **대부분 완료** | `createServiceClient()` RLS 우회 이미 사용 |
| 5 | PostgREST API (scripts) | Cloud SQL 직접 연결 (`pg` Pool) | **이중 모드** | `db-helpers.mjs`에서 분기 처리 중 |
| 6 | Supabase DB | Cloud SQL (PostgreSQL) | **완료** | Proxy 패턴 + `USE_CLOUD_SQL=true` |
| 7 | Supabase Storage | GCS (`gs://bscamp-storage`) | **완료** | `gcs-storage.ts` 구현됨 |
| 8 | Preview 배포 | Cloud Build + Preview URL | 미구현 | 별도 TASK 필요 |
| 9 | Vercel Cron | Cloud Scheduler | **완료** | 23개 크론 운영 중 |
| 10 | next/image 최적화 | sharp (self-hosted) | **준비됨** | `package.json`에 `sharp` 이미 포함 |

### Firebase Auth 준비 현황 (이미 구현된 파일)

| 파일 | 역할 | 줄 수 |
|------|------|:-----:|
| `src/lib/firebase/client.ts` | Firebase Client SDK 초기화 (브라우저) | 33줄 |
| `src/lib/firebase/admin.ts` | Firebase Admin SDK 초기화 (서버) | 43줄 |
| `src/lib/firebase/auth.ts` | `getCurrentUser()`, `createSessionCookie()`, `verifyIdToken()` 헬퍼 | 54줄 |
| `src/lib/firebase/middleware.ts` | 세션 쿠키 검증 + role 라우팅 (Supabase 미들웨어 1:1 포팅) | 234줄 |
| `src/app/api/auth/firebase-session/route.ts` | ID Token → 세션 쿠키 생성 API | 41줄 |
| `src/app/api/auth/firebase-logout/route.ts` | 세션 쿠키 삭제 API | 14줄 |

---

## 3. 마이그레이션 단계별 계획

### 순서 변경 근거 (2026-03-24 보안 검토)

기존 분석서에서 Phase 4(RLS 제거) → Phase 5(Auth 전환) 순서였으나, **보안상 순서 변경 필수**:
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`가 브라우저에 노출된 상태에서 RLS를 끄면 보안 취약
- Auth 전환(ANON_KEY 제거) → RLS 비활성화 순서가 안전

또한, `createBrowserClient()` 사용처 9개가 **전부 Auth 전용** (데이터 쿼리 0개)이므로 Phase 4(브라우저→API Route 전환)가 대폭 축소됨.

**최종 순서: Phase A(Auth) → Phase B(프론트 호스팅) → Phase C(잔여 정리)**

---

### Phase A: 인증 마이그레이션 (Supabase Auth → Firebase Auth)

**공수: 2~3주 / 난이도: 높음 / 의존성: 없음**

#### A-1. 사용자 데이터 마이그레이션 (1~2일)

| 항목 | 작업 |
|------|------|
| 사용자 수 | ~40명 (수강생 + 관리자) |
| 현재 Auth | Supabase Auth (이메일+비밀번호, bcrypt 해시) |
| 목표 Auth | Firebase Auth (이메일+비밀번호, scrypt 해시) |
| 비밀번호 호환성 | **비호환** — Supabase(bcrypt) vs Firebase(scrypt) |
| 마이그레이션 전략 | `firebase-admin.auth().importUsers()` + `BCRYPT` hash algorithm 지정 |

```
구현 파일: scripts/migrate-auth-to-firebase.ts (신규)
```

1. `supabase auth export` 또는 Management API로 사용자 목록 추출
2. `firebase-admin.auth().importUsers()` — bcrypt 해시 직접 임포트 지원 확인
3. 비호환 시 대안: 비밀번호 재설정 이메일 일괄 발송 (40명이므로 개별 안내 가능)
4. `profiles.id` 컬럼 업데이트: Supabase UUID → Firebase UID 매핑 필요

**주의**: `profiles.id`가 Supabase Auth `user.id`와 동일한 UUID. Firebase UID는 다른 형식이므로 **DB profiles 테이블의 id 마이그레이션도 필요**.

**대안 검토**:
- (A) Firebase `importUsers()`에 `passwordHash` + `passwordSalt` + `hashConfig` 지정 — bcrypt 지원 여부 확인 필요
- (B) 사용자에게 비밀번호 재설정 안내 (40명 규모이므로 현실적)
- (C) 병행 운영: 기존 사용자는 Supabase Auth 유지, 신규만 Firebase → 장기적으로 비권장

#### A-2. JWT 토큰 전환 (1일)

| 항목 | Supabase Auth | Firebase Auth |
|------|--------------|---------------|
| 서버 검증 | `supabase.auth.getUser()` | `firebaseAdmin.auth().verifySessionCookie()` |
| 브라우저 토큰 | Supabase 쿠키 (자동 갱신) | Firebase ID Token → 세션 쿠키 |
| 미들웨어 | 쿠키 기반 세션 갱신 | 세션 쿠키 검증 (`verifySessionCookie`) |

이미 구현됨:
- `src/lib/firebase/auth.ts` — `getCurrentUser()`, `createSessionCookie()`, `verifyIdToken()`
- `src/lib/firebase/middleware.ts` — 세션 쿠키 검증 + role 라우팅
- `src/app/api/auth/firebase-session/route.ts` — ID Token → 세션 쿠키 생성
- `src/app/api/auth/firebase-logout/route.ts` — 세션 쿠키 삭제

#### A-3. Server Action/API Route Auth 교체 (3~5일)

**서버측 32파일에서 `supabase.auth.getUser()` → Firebase `getCurrentUser()` 교체**

핵심 패턴 변환:
```typescript
// Before (Supabase)
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) throw new Error("인증되지 않은 사용자입니다.");

// After (Firebase)
const user = await getCurrentUser();
if (!user) throw new Error("인증되지 않은 사용자입니다.");
// user.uid (Firebase UID), user.email
```

수정 대상:

| 카테고리 | 파일 목록 | 호출 수 |
|----------|----------|:-------:|
| Server Actions | `onboarding.ts`(9), `reviews.ts`(5), `questions.ts`(4), `posts.ts`(3), `qa-reports.ts`(3), `answers.ts`(2), `invites.ts`(1) | 27 |
| auth-utils | `auth-utils.ts` — `requireAdmin()`, `requireStaff()` | 2 |
| API Routes | `ext/auth/route.ts`, `ext/_shared.ts`, `admin/_shared.ts`, `protractor/_shared.ts`, `upload/route.ts`, 기타 17개 | 25 |

**주의**: `src/lib/auth-utils.ts`의 `requireAdmin()` / `requireStaff()` 함수가 서버 Auth의 **핵심 게이트웨이**. 이 2개 함수만 교체하면 나머지 admin/staff 인증은 자동 전환됨. 단, 이 함수들은 현재 `createClient()` → `supabase.auth.getUser()` 후 `createServiceClient()` 반환 패턴이므로, `getCurrentUser()` 호출 후 `createServiceClient()` 반환으로 변경.

#### A-4. 브라우저 Auth 교체 (3~5일)

**브라우저 30파일에서 Supabase Auth SDK → Firebase Auth SDK 교체**

| Auth 함수 | Supabase | Firebase | 수정 파일 |
|-----------|----------|----------|-----------|
| 로그인 | `signInWithPassword({email, password})` | `signInWithEmailAndPassword(auth, email, password)` + `/api/auth/firebase-session` POST | `login/page.tsx` |
| 회원가입 | `signUp({email, password})` | `createUserWithEmailAndPassword(auth, email, password)` | `signup/page.tsx` |
| 로그아웃 | `signOut()` | `signOut(auth)` + `/api/auth/firebase-logout` POST | `Sidebar.tsx`, `app-sidebar.tsx`, `student-header.tsx`, `pending/page.tsx`, `onboarding/page.tsx` |
| 비밀번호 재설정 요청 | `resetPasswordForEmail(email)` | `sendPasswordResetEmail(auth, email)` | `forgot-password/page.tsx` |
| 비밀번호 변경 | `updateUser({password})` | `updatePassword(user, newPassword)` | `reset-password/page.tsx` |
| 인증 상태 확인 | `getUser()` | `onAuthStateChanged()` 또는 세션 쿠키 | 21개 페이지 |
| 인증 상태 변경 | `onAuthStateChange()` | `onAuthStateChanged()` | `reset-password/page.tsx` |

**주요 차이점**:
- Supabase Auth는 쿠키 기반 자동 세션 갱신
- Firebase Auth는 Client SDK의 ID Token → 서버측 세션 쿠키 변환 필요
- 로그인 성공 시 추가 API 호출 (`/api/auth/firebase-session`) 필요

#### A-5. 미들웨어 전환 (0.5일)

```
수정 파일: src/proxy.ts (1줄)
```

```typescript
// Before
import { updateSession } from "@/lib/supabase/middleware";

// After
import { updateSession } from "@/lib/firebase/middleware";
```

`src/lib/firebase/middleware.ts`는 이미 구현 완료 (234줄, role 라우팅 동일 로직).
단, 현재 firebase middleware에서 `USE_CLOUD_SQL=false` 분기에 Supabase 직접 쿼리 잔재 있음 → Cloud SQL 전용으로 정리 필요.

#### A-6. RLS 비활성화 (Phase A 완료 후, 0.5일)

`NEXT_PUBLIC_SUPABASE_ANON_KEY` 브라우저 노출 제거 완료 후 안전하게 실행:
- Cloud SQL migration으로 `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` 실행
- 33개 migration의 241개 RLS 정책 비활성화
- `createServiceClient()` (RLS 우회) 이미 사용 중이므로 동작 영향 없음

#### A-7. 정리 (1일)

| 삭제 대상 | 사유 |
|-----------|------|
| `src/lib/supabase/client.ts` | 브라우저 Auth 클라이언트 (Firebase로 대체) |
| `src/lib/supabase/middleware.ts` | 미들웨어 (Firebase middleware로 대체) |
| `@supabase/ssr` 패키지 | 브라우저 Auth SSR 전용 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` 환경변수 | 브라우저 노출 키 |

유지:
| 유지 대상 | 사유 |
|-----------|------|
| `src/lib/supabase/server.ts` | DB Proxy 패턴 (Cloud SQL 라우팅) — `@supabase/supabase-js` 의존 |
| `@supabase/supabase-js` 패키지 | `server.ts`에서 Auth + Storage fallback 사용 → 최종 제거는 Phase D |

---

### Phase B: API 계층 마이그레이션 (PostgREST → 직접 API)

**공수: 1~2일 / 난이도: 낮음 / 의존성: 없음 (독립 실행 가능)**

#### B-1. scripts/ PostgREST REST 제거

| 파일 | 현재 | 변경 |
|------|------|------|
| `scripts/lib/db-helpers.mjs` | Supabase REST fallback 포함 (343줄) | Cloud SQL 전용으로 단순화 — REST fallback 코드 삭제 |
| `scripts/lib/env.mjs` | `SB_URL`, `SB_KEY` export | 삭제 (Cloud SQL만 유지) |

사용 스크립트 (11개):
`crawl-all-lps.mjs`, `crawl-lps-local.mjs`, `compute-andromeda-similarity.mjs`, `compute-change-insights.mjs`, `validate-lp-crawl.mjs`, `download-missing-media.mjs`, `migrate-post-images.ts`, `migrate-lectures-to-contents.ts`, `embed-notion.mjs`, `sync-contents.ts`, `local-collect.mjs`

모든 스크립트가 `db-helpers.mjs`의 `sbGet/sbPatch/sbPost/sbUpsert/sbDelete`를 통해 접근하므로, **db-helpers.mjs 하나만 수정하면 11개 스크립트 일괄 전환**.

#### B-2. src/ Proxy 패턴 정리

현재 `src/lib/supabase/server.ts`의 `createServiceClient()`가 `USE_CLOUD_SQL=true` 시 Proxy 패턴으로 동작:
- `.from()`, `.rpc()` → Cloud SQL (query-builder.ts)
- `.auth` → Supabase Auth
- `.storage` → Supabase Storage (GCS 이관 완료이므로 제거 가능)

Phase A 완료 후 `.auth` 프록시가 불필요해지므로:
1. `createServiceClient()` → 순수 Cloud SQL DbClient 반환
2. `createClient()` (서버) → Firebase Auth + Cloud SQL 조합으로 재작성
3. `@supabase/supabase-js` 의존 완전 제거

---

### Phase C: 프론트엔드 호스팅 (Vercel → Cloud Run)

**공수: 3~5일 / 난이도: 중간 / 의존성: Phase A 권장 (Auth 전환 후 동시에 배포)**

#### C-1. Cloud Run 프론트 서비스 배포 (1일)

```bash
gcloud run deploy bscamp-web \
  --source . \
  --region asia-northeast3 \
  --project modified-shape-477110-h8 \
  --memory 1Gi --cpu 1 \
  --min-instances 1 --max-instances 5 \
  --port 8080 \
  --allow-unauthenticated
```

| 항목 | 값 |
|------|-----|
| 서비스명 | `bscamp-web` (기존 `bscamp-cron`은 크론 전용 유지) |
| Dockerfile | 이미 준비됨 (3-stage standalone, PORT=8080) |
| output | `standalone` (`next.config.ts`에 설정됨) |
| 이미지 최적화 | `sharp` (이미 package.json에 포함) — Vercel 이미지 최적화 대체 |
| 메모리 | 1Gi (프론트엔드 SSR 용) |
| min-instances | 1 (콜드 스타트 방지) |

#### C-2. Dockerfile 수정

```
수정 파일: Dockerfile
```

| 변경 | 이전 | 이후 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL 하드코딩 | **삭제** (Phase A 완료 후) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon Key 하드코딩 | **삭제** (Phase A 완료 후) |
| `NEXT_PUBLIC_SITE_URL` | `https://bscamp.app` | 유지 |
| Firebase 환경변수 추가 | — | `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID` |

#### C-3. next.config.ts 수정

```
수정 파일: next.config.ts
```

```typescript
// Before
remotePatterns: [
  { protocol: "https", hostname: "symvlrsmkjlztoopbnht.supabase.co", pathname: "/storage/v1/object/public/**" },
]

// After
remotePatterns: [
  { protocol: "https", hostname: "storage.googleapis.com", pathname: "/bscamp-storage/**" },
]
```

#### C-4. 도메인 매핑 (bscamp.app) (1일)

| 방식 | 설명 | 권장 |
|------|------|:----:|
| Cloud Run 도메인 매핑 | `gcloud run domain-mappings create --service bscamp-web --domain bscamp.app` | O |
| Cloud Load Balancer | L7 LB + Cloud CDN + SSL | 향후 |

DNS 변경: A/AAAA 레코드 → Cloud Run 제공 IP (현재 Vercel → GCP)

#### C-5. 환경변수 이관 (0.5일)

Vercel 환경변수 → Cloud Run 환경변수 (Cloud Run Secret Manager 권장):

| 카테고리 | 변수 수 | 비고 |
|----------|:-------:|------|
| DB | 2 | `DATABASE_URL`, `USE_CLOUD_SQL=true` |
| Auth | 3 | Firebase 키 3개 (`NEXT_PUBLIC_FIREBASE_*`) |
| AI | 5 | `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` 등 |
| Meta | 1 | `META_ACCESS_TOKEN` |
| SMTP | 2 | `SMTP_USER`, `SMTP_PASS` |
| 기타 | 8+ | `CRON_SECRET`, `SLACK_BOT_TOKEN` 등 |

#### C-6. Preview 배포 구현 (2~3일)

| 방식 | 설명 | 공수 |
|------|------|:----:|
| Cloud Build + PR Preview | GitHub PR webhook → Cloud Build → Preview Cloud Run revision | 2~3일 |
| 대안: Coolify / Railway | 셀프호스트 PaaS | 1일 |
| 대안: Vercel Preview만 유지 | 프론트만 Cloud Run, Preview는 Vercel | 0일 |

---

### Phase D: 잔여 의존성 완전 제거

**공수: 2~3일 / 난이도: 낮음 / 의존성: Phase A, B, C 모두 완료**

#### D-1. supabase-js SDK 완전 제거

| 파일 | 작업 |
|------|------|
| `src/lib/supabase/server.ts` | Proxy 패턴 → 순수 Cloud SQL DbClient 직접 반환 |
| `src/lib/supabase/` 폴더 | 전체 삭제 |
| `src/types/supabase.ts` | 삭제 (Supabase 타입 제거) |
| `src/types/database.ts` | Supabase CLI 생성 타입 → 수동 타입으로 전환 |
| `package.json` | `@supabase/supabase-js`, `@supabase/ssr` 제거 |

#### D-2. 하드코딩 URL 정리

| 파일 | 변경 |
|------|------|
| `src/lib/email-default-template.ts` | Supabase Storage URL 9건 → GCS URL |
| `src/lib/newsletter-row-templates.ts` | Supabase Storage URL 3건 → GCS URL |
| `src/lib/email-template-utils.ts` | `BANNER_BASE_URL` → GCS 기반 |
| `src/lib/gcs-storage.ts` | `convertSupabaseUrlToGcs()` 함수 제거 (불필요) |

#### D-3. Vercel 완전 제거

| 항목 | 작업 |
|------|------|
| `vercel.json` | 파일 삭제 (현재 `{}`) |
| Vercel 프로젝트 | 아카이브 |
| DNS | bscamp.vercel.app → 리다이렉트 또는 제거 |
| `VERCEL_URL` 참조 | `NEXT_PUBLIC_BASE_URL` 환경변수로 교체 |

#### D-4. Supabase 프로젝트 아카이브

| 항목 | 작업 |
|------|------|
| Supabase 프로젝트 | Pause (무료 유지) 또는 삭제 |
| Auth 사용자 | Firebase로 이관 완료 확인 |
| Storage 데이터 | GCS 이관 완료 확인 |
| DB 데이터 | Cloud SQL 이관 완료 (이미 완료) |

---

## 4. 리스크 + 의존성

### 4-1. 핵심 리스크

| # | 리스크 | 영향도 | 발생 확률 | 완화 전략 |
|:-:|--------|:------:|:---------:|-----------|
| 1 | **비밀번호 해시 비호환** (Supabase bcrypt → Firebase scrypt) | 높음 | 중간 | Firebase `importUsers()` bcrypt 지원 확인. 미지원 시 40명 개별 비밀번호 재설정 안내 |
| 2 | **profiles.id UUID 변경** (Supabase UUID → Firebase UID) | 높음 | 높음 | 마이그레이션 스크립트로 profiles.id + 모든 FK 참조 일괄 업데이트 |
| 3 | **다운타임** (DNS 전환 시) | 중간 | 낮음 | DNS TTL 낮추기 + 병행 운영(Vercel+Cloud Run) 기간 설정 |
| 4 | **next/image 성능 저하** (Vercel CDN → self-hosted sharp) | 낮음 | 낮음 | sharp 이미 설치됨, Cloud CDN 추가 가능 |
| 5 | **Preview 배포 부재** (Cloud Build 미구현 기간) | 중간 | 높음 | Vercel Preview를 임시 유지하거나, 로컬 빌드+테스트로 대체 |
| 6 | **크롬 확장 Auth** (`ext/auth/route.ts`) | 중간 | 중간 | Firebase `verifyIdToken()` 이미 구현됨 — 확장 클라이언트도 동시 교체 |

### 4-2. 의존성 체인

```
Phase A (Auth) ──→ Phase A-6 (RLS 비활성화) ──→ Phase D-1 (SDK 제거)
                                                   ↑
Phase B (API 계층) ─────────────────────────────────┘
                                                   ↑
Phase C (프론트 호스팅) ────────────────────────────┘
```

- Phase A, B, C는 **독립 병렬 실행 가능** (단, Phase A가 가장 높은 우선순위)
- Phase D는 A+B+C **모두 완료 후** 실행
- Phase A-6 (RLS 비활성화)는 Phase A 완료(ANON_KEY 제거) **이후에만** 안전

### 4-3. profiles.id UUID 마이그레이션 상세

현재 DB 구조에서 `profiles.id`는 Supabase Auth `user.id` (UUID v4). Firebase UID는 28자 문자열.

**영향 범위**:
- `profiles.id` (PK)
- `questions.author_id` (FK)
- `answers.author_id` (FK)
- `posts.author_id` (FK)
- `reviews.author_id` (FK)
- `qa_reports.author_id` (FK)
- `knowledge_chunks` 관련 테이블
- `student_registry` (profiles와 미연결이지만 향후 연결 가능)

**전략**:
- (A) Firebase UID를 Supabase UUID와 동일하게 설정 — Firebase `importUsers()`에서 `uid` 직접 지정 가능
- **(B) 권장**: Firebase `importUsers({uid: supabaseUuid, ...})` — Firebase는 커스텀 UID 허용 (최대 128자). Supabase UUID(36자)를 그대로 사용하면 DB 변경 불필요

---

## 5. 우선순위 + 타임라인

### 현재 급하지 않은 이유
- Vercel 무료 티어: Hobby 플랜 무료 (100GB bandwidth, 서버리스 100시간)
- Supabase 무료 티어: Free 플랜 (50K MAU, 500MB DB, 1GB Storage)
- ~40명 수강생으로 무료 티어 한도 내 운영 중

### GCP 통합의 장기적 이점
| 항목 | 현재 (3사 분산) | GCP 통합 후 |
|------|----------------|-------------|
| 레이턴시 | Vercel(미국 CDN) → Supabase(ap-northeast-1) → Cloud SQL(asia-northeast3) | Cloud Run(서울) → Cloud SQL(서울) 직접 |
| 비용 | 무료 티어 3개 | Cloud Run 1개 ($0 — 무료 등급 충분) |
| 운영 복잡도 | 환경변수 3곳 관리 (Vercel, Supabase, GCP) | GCP Secret Manager 1곳 |
| 벤더 락인 | Supabase Auth + Vercel CDN 종속 | Firebase Auth (GCP 내) |
| 장애 대응 | 3사 중 하나라도 장애 시 서비스 영향 | 단일 장애점 (GCP) |

### Phase별 예상 공수

| Phase | 작업 | 공수 | 우선순위 | 의존성 |
|-------|------|:----:|:--------:|--------|
| **A** | Auth → Firebase | **2~3주** | 1순위 | 없음 |
| A-1 | 사용자 데이터 마이그레이션 | 1~2일 | — | — |
| A-2 | JWT 토큰 전환 | 1일 | — | A-1 |
| A-3 | Server Action/API Route 교체 (32파일) | 3~5일 | — | A-2 |
| A-4 | 브라우저 Auth 교체 (30파일) | 3~5일 | — | A-2 |
| A-5 | 미들웨어 전환 (1파일) | 0.5일 | — | A-3, A-4 |
| A-6 | RLS 비활성화 | 0.5일 | — | A-5 |
| A-7 | 정리 | 1일 | — | A-6 |
| **B** | PostgREST → Cloud SQL 직접 | **1~2일** | 2순위 (A와 병렬 가능) | 없음 |
| **C** | Vercel → Cloud Run 프론트 | **3~5일** | 3순위 | A 권장 |
| C-1~C-5 | 배포 + 도메인 + 환경변수 | 2일 | — | — |
| C-6 | Preview 배포 | 2~3일 | — | C-1 |
| **D** | 잔여 의존성 완전 제거 | **2~3일** | 최후순위 | A+B+C |
| **합계** | | **3~4주** | | |

### 권장 일정

```
Week 1: Phase A-1~A-2 (사용자 마이그레이션 + JWT 전환) + Phase B (scripts 정리)
Week 2: Phase A-3~A-4 (서버+브라우저 Auth 교체)
Week 3: Phase A-5~A-7 (미들웨어+RLS+정리) + Phase C (Cloud Run 배포)
Week 4: Phase D (완전 제거) + QA + 안정화
```

---

## 부록: 전체 수정 파일 목록 (Phase별)

### Phase A 수정 파일 (62파일 + 신규 1)

**신규**: `scripts/migrate-auth-to-firebase.ts`

**수정 (Server Actions — 10파일)**:
- `src/actions/onboarding.ts`
- `src/actions/reviews.ts`
- `src/actions/questions.ts`
- `src/actions/posts.ts`
- `src/actions/qa-reports.ts`
- `src/actions/answers.ts`
- `src/actions/invites.ts`
- `src/actions/auth.ts`
- `src/lib/auth-utils.ts`

**수정 (API Routes — 22파일)**:
- `src/app/api/auth/callback/route.ts`
- `src/app/api/ext/auth/route.ts`
- `src/app/api/ext/_shared.ts`
- `src/app/api/admin/_shared.ts`
- `src/app/api/admin/backfill/route.ts`
- `src/app/api/admin/embed/route.ts`
- `src/app/api/admin/knowledge/stats/route.ts`
- `src/app/api/admin/protractor/collect/route.ts`
- `src/app/api/protractor/_shared.ts`
- `src/app/api/protractor/save-secret/route.ts`
- `src/app/api/creative/[id]/route.ts`
- `src/app/api/creative/search/route.ts`
- `src/app/api/competitor/monitors/route.ts`
- `src/app/api/competitor/monitors/[id]/route.ts`
- `src/app/api/competitor/monitors/[id]/alerts/route.ts`
- `src/app/api/competitor/insights/route.ts`
- `src/app/api/competitor/download/route.ts`
- `src/app/api/competitor/download-zip/route.ts`
- `src/app/api/competitor/analysis-status/route.ts`
- `src/app/api/qa-chatbot/route.ts`
- `src/app/api/sales-summary/route.ts`
- `src/app/api/upload/route.ts`

**수정 (브라우저 페이지 — 30파일)**:
- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/signup/page.tsx`
- `src/app/(auth)/reset-password/page.tsx`
- `src/app/(auth)/forgot-password/page.tsx`
- `src/app/(auth)/pending/page.tsx`
- `src/app/(auth)/onboarding/page.tsx`
- `src/app/(main)/layout.tsx`
- `src/app/(main)/dashboard/page.tsx`
- `src/app/(main)/dashboard/student-home.tsx`
- `src/app/(main)/questions/page.tsx`
- `src/app/(main)/questions/[id]/page.tsx`
- `src/app/(main)/questions/[id]/edit/page.tsx`
- `src/app/(main)/questions/new/page.tsx`
- `src/app/(main)/posts/page.tsx`
- `src/app/(main)/posts/[id]/page.tsx`
- `src/app/(main)/posts/new/page.tsx`
- `src/app/(main)/reviews/page.tsx`
- `src/app/(main)/reviews/[id]/page.tsx`
- `src/app/(main)/reviews/new/page.tsx`
- `src/app/(main)/settings/page.tsx`
- `src/app/(main)/admin/layout.tsx`
- `src/app/(main)/admin/email/[id]/page.tsx`
- `src/app/(main)/admin/protractor/benchmarks/page.tsx`
- `src/app/(main)/protractor/page.tsx`
- `src/app/(main)/protractor/layout.tsx`
- `src/app/(main)/protractor/creatives/page.tsx`
- `src/app/(main)/protractor/competitor/page.tsx`
- `src/components/dashboard/Sidebar.tsx`
- `src/components/layout/app-sidebar.tsx`
- `src/components/layout/student-header.tsx`

**수정 (미들웨어 — 1파일)**:
- `src/proxy.ts` — import 경로 변경

**삭제**:
- `src/lib/supabase/client.ts`
- `src/lib/supabase/middleware.ts`

### Phase B 수정 파일 (2파일)

- `scripts/lib/db-helpers.mjs` — REST fallback 제거
- `scripts/lib/env.mjs` — `SB_URL`, `SB_KEY` 제거

### Phase C 수정 파일 (3파일)

- `Dockerfile` — Supabase 환경변수 제거, Firebase 추가
- `next.config.ts` — remotePatterns Supabase → GCS
- `vercel.json` — 삭제

### Phase D 수정 파일 (7파일)

- `src/lib/supabase/server.ts` — Proxy 제거, 순수 DbClient
- `src/types/supabase.ts` — 삭제
- `src/types/database.ts` — Supabase CLI 타입 → 수동 타입
- `src/lib/email-default-template.ts` — URL 교체
- `src/lib/newsletter-row-templates.ts` — URL 교체
- `src/lib/email-template-utils.ts` — URL 교체
- `src/lib/gcs-storage.ts` — convertSupabaseUrlToGcs 제거
- `package.json` — `@supabase/supabase-js`, `@supabase/ssr` 제거
