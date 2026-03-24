# Supabase + Vercel 의존도 분석 — GCP 완전 이관 범위

> 분석일: 2026-03-24
> 목적: Supabase/Vercel 완전 제거 시 영향 범위 + 수정 난이도 + 예상 공수
> 방법: 전체 src/ grep 기반 전수 조사

---

## 총괄 요약

| # | 카테고리 | 영향 파일 | 호출 횟수 | 난이도 | 공수 | GCP 대안 |
|:-:|---------|:--------:|:--------:|:------:|:----:|---------|
| 1 | **Auth** | 62 | 91 | **높음** | 2-3주 | Firebase Auth / 자체 JWT |
| 2 | **Storage** | 17 (실업로드 7) | 32 | **낮음** | 2-3일 | GCS 직접 (이미 준비됨) |
| 3 | **DB 쿼리** | 80+ | 수백 | **완료** | 0일 | Cloud SQL Proxy 패턴 |
| 4 | **RLS** | 33 migration | 241 정책 | **중간** | 3-5일 | 서버 사이드 인증 |
| 5 | **Vercel** | 39 (maxDuration 33) | 58 revalidate | **중간** | 1-2주 | Cloud Run + Scheduler + CDN |

---

## 1. Auth — Supabase Auth (62파일, 91호출)

### 난이도: **높음** / 공수: 2-3주 / 대안: Firebase Auth or 자체 JWT

### 호출 분포

| 패턴 | 파일 수 | 호출 수 |
|------|:------:|:------:|
| `.auth.getUser()` | 57 | 79 |
| `.auth.signInWithPassword()` | 2 | 2 |
| `.auth.signUp()` | 1 | 1 |
| `.auth.signOut()` | 3 | 3 |
| `.auth.exchangeCodeForSession()` | 1 | 1 |
| `.auth.verifyOtp()` | 1 | 1 |
| `.auth.resetPasswordForEmail()` | 1 | 1 |
| `.auth.updateUser()` | 2 | 3 |
| **합계** | **62** | **91** |

### 파일별 상세 (Auth 직접 호출)

**Server Actions (10파일, 29호출)**
| 파일 | 호출 수 | 기능 |
|------|:------:|------|
| `src/actions/onboarding.ts` | 9 | 온보딩 단계별 getUser |
| `src/actions/reviews.ts` | 5 | 리뷰 CRUD 인증 |
| `src/actions/questions.ts` | 4 | 질문 CRUD 인증 |
| `src/actions/posts.ts` | 3 | 게시물 CRUD 인증 |
| `src/actions/qa-reports.ts` | 3 | QA 리포트 인증 |
| `src/actions/answers.ts` | 2 | 답변 작성/승인 인증 |
| `src/actions/auth.ts` | 1 | 프로필 생성 (signUp 후) |
| `src/actions/invites.ts` | 1 | 초대코드 검증 |
| `src/lib/auth-utils.ts` | 2 | getUser 헬퍼 |

**API Routes (22파일, 25호출)**
| 파일 | 호출 수 | 기능 |
|------|:------:|------|
| `src/app/api/auth/callback/route.ts` | 3 | OAuth 콜백 + OTP 검증 |
| `src/app/api/competitor/monitors/*/route.ts` | 4 | 경쟁사 모니터링 |
| `src/app/api/competitor/monitors/*/alerts/route.ts` | 2 | 경쟁사 알림 |
| `src/app/api/ext/auth/route.ts` | 1 | 크롬 확장 signIn |
| `src/app/api/ext/_shared.ts` | 1 | 외부 앱 인증 공통 |
| `src/app/api/admin/_shared.ts` | 1 | 관리자 공통 인증 |
| `src/app/api/admin/backfill/route.ts` | 1 | 백필 인증 |
| `src/app/api/admin/embed/route.ts` | 1 | 임베딩 인증 |
| `src/app/api/admin/reembed/route.ts` | 1 | 재임베딩 인증 |
| `src/app/api/admin/knowledge/stats/route.ts` | 1 | 지식 통계 인증 |
| `src/app/api/admin/protractor/collect/route.ts` | 1 | 수동 수집 인증 |
| `src/app/api/protractor/_shared.ts` | 1 | 총가치각도기 공통 인증 |
| `src/app/api/protractor/save-secret/route.ts` | 1 | 시크릿 저장 인증 |
| `src/app/api/creative/[id]/route.ts` | 1 | 소재 상세 인증 |
| `src/app/api/creative/search/route.ts` | 1 | 소재 검색 인증 |
| `src/app/api/competitor/download/route.ts` | 1 | 다운로드 인증 |
| `src/app/api/competitor/download-zip/route.ts` | 1 | ZIP 다운로드 인증 |
| `src/app/api/competitor/analysis-status/route.ts` | 1 | 분석 상태 인증 |
| `src/app/api/competitor/insights/route.ts` | 1 | 인사이트 인증 |
| `src/app/api/qa-chatbot/route.ts` | 1 | QA 챗봇 인증 |
| `src/app/api/sales-summary/route.ts` | 1 | 매출 요약 인증 |

**Page/Component (30파일, 37호출) — 브라우저 클라이언트**
| 파일 | 기능 |
|------|------|
| `src/app/(auth)/login/page.tsx` | signInWithPassword, signInWithOAuth |
| `src/app/(auth)/signup/page.tsx` | signUp |
| `src/app/(auth)/reset-password/page.tsx` | updateUser(password) |
| `src/app/(auth)/forgot-password/page.tsx` | resetPasswordForEmail |
| `src/app/(auth)/pending/page.tsx` | getUser (승인 대기 체크) |
| `src/app/(auth)/onboarding/page.tsx` | getUser |
| `src/app/(main)/layout.tsx` | getUser (네비게이션) |
| `src/app/(main)/dashboard/page.tsx` | getUser |
| `src/components/dashboard/Sidebar.tsx` | signOut |
| `src/components/layout/app-sidebar.tsx` | signOut |
| `src/components/layout/student-header.tsx` | signOut |
| 기타 19개 페이지 | getUser (인증 체크) |

**핵심 인프라**
| 파일 | 역할 |
|------|------|
| `src/lib/supabase/middleware.ts` | **세션 갱신 + role 라우팅** (254줄) |
| `src/lib/supabase/server.ts` | Proxy 패턴 (Auth는 Supabase 유지) |
| `src/lib/supabase/client.ts` | 브라우저 Auth 클라이언트 |

### 이관 평가

| 대안 | 작업 | 위험 |
|------|------|------|
| **Firebase Auth** | SDK 교체 + OAuth 재설정 + 사용자 마이그레이션 | 기존 사용자 재인증 필요 |
| **자체 JWT** | bcrypt + jose + OAuth 클라이언트 직접 구현 | 개발 공수 최대, 보안 위험 |
| **Supabase Auth 유지** | 변경 없음 | Supabase 의존 유지 (무료 50K MAU) |

**권장: Supabase Auth 유지.** DB/Storage만 GCP 이관. `server.ts` Proxy가 이미 분리 완료.

---

## 2. Storage — Supabase Storage (17파일, 32호출)

### 난이도: **낮음** / 공수: 2-3일 / 대안: GCS 직접 (준비 완료)

### 업로드 기능 (실제 수정 대상: 7파일)

| 파일 | 버킷 | 기능 | 우선순위 |
|------|------|------|:--------:|
| `src/app/api/admin/email/upload/route.ts` | email-attachments | 이메일 첨부 업로드 | 중 |
| `src/app/api/cron/crawl-lps/route.ts` | lp-snapshots | LP 스크린샷 + HTML 저장 | 높음 |
| `src/app/api/cron/collect-benchmarks/route.ts` | benchmarks | 벤치마크 이미지 | 높음 |
| `src/actions/contents.ts` | content-images | 콘텐츠 이미지 업로드 | 중 |
| `src/lib/lp-media-downloader.ts` | lp-snapshots | LP 미디어 다운로드+저장 | 높음 |
| `src/lib/competitor/competitor-storage.ts` | competitors | 경쟁사 이미지 | 중 |
| 8개 프론트 컴포넌트 | content-images | 이미지 업로드 (Supabase Storage 직접) | 중 |

### 하드코딩된 Supabase Storage URL (5파일, 15개소)

| 파일 | 용도 | 내용 |
|------|------|------|
| `src/lib/email-default-template.ts` | 이메일 템플릿 | 로고/배너 이미지 URL 9건 |
| `src/lib/newsletter-row-templates.ts` | 뉴스레터 | 로고/배너 URL 3건 |
| `src/lib/email-template-utils.ts` | 이메일 유틸 | BANNER_BASE_URL 1건 |
| `src/components/posts/post-body.tsx` | 게시물 본문 | Supabase Storage URL 참조 1건 |
| `src/lib/gcs-storage.ts` | GCS 변환 | URL 파싱 (이관 도구) 1건 |

### GCS 이관 준비 상태

`src/lib/gcs-storage.ts` 에 이미 구현됨:
- `uploadToGcs(bucket, path, buffer, contentType)` — GCS 직접 업로드
- `getGcsPublicUrl(bucket, path)` — Public URL 생성
- `convertSupabaseUrlToGcs(supabaseUrl)` — URL 마이그레이션
- `useGcsStorage()` — `USE_CLOUD_SQL=true` 시 활성화 판단

### 수정 계획
1. 7개 업로드 파일에서 `svc.storage.from("bucket").upload()` → `uploadToGcs()` 교체
2. 8개 프론트 컴포넌트에서 Supabase Storage 직접 업로드 → API Route 경유로 변경
3. 15개 하드코딩 URL → GCS URL 또는 환경변수 기반으로 교체

---

## 3. DB 쿼리 — PostgREST → Cloud SQL (이미 완료)

### 난이도: **완료** / 공수: 0일

### 현황
- `server.ts` Proxy 패턴으로 `.from()` / `.rpc()` → Cloud SQL 자동 라우팅
- Cloud Run에 `USE_CLOUD_SQL=true` + `DATABASE_URL` 이미 적용 (revision 00016)
- **코드 변경 없이 환경변수 하나로 전환 완료**

### 브라우저 직접 쿼리 (40개 .tsx 파일)
| 카테고리 | 파일 수 | 내용 |
|----------|:------:|------|
| Auth 페이지 | 6 | login, signup, pending, onboarding, reset, forgot |
| 메인 페이지 | 16 | questions, posts, reviews, dashboard, protractor, settings |
| 관리자 페이지 | 6 | admin/answers, admin/email, admin/protractor, admin/layout |
| 컴포넌트 | 12 | Sidebar, QaChatPanel, 폼 컴포넌트들 |

이 40개 파일은 `createBrowserClient()`를 통해 Supabase PostgREST에 직접 접근.
GCP 완전 이관 시 → **API Route 경유로 변경 필요** (RLS 제거와 연동).

### Cloud SQL 미호환 패턴 (이번 세션 발견)

| 패턴 | 설명 | 영향 |
|------|------|------|
| `table!inner(cols)` | PostgREST 임베딩 조인 | 2단계 쿼리로 분리 필요 |
| `.or("col.not.is.null")` | PostgREST or + not 조합 | JS 필터링으로 대체 |
| `table:alias!fk(cols)` | FK 기반 임베딩 | query-builder 지원됨 (OK) |

**47개 API 라우트** 중 `!inner` 또는 `.or("...not...")` 패턴 사용처 점검 필요.

---

## 4. RLS — Row Level Security (33 migration, 241 정책)

### 난이도: **중간** / 공수: 3-5일 / 대안: 서버 사이드 인증

### 정책 분포 (상위 migration)

| 마이그레이션 파일 | 정책 수 | 대상 |
|------------------|:------:|------|
| `00002_rls_policies.sql` | 48 | profiles, categories, questions, answers 등 핵심 |
| `20260228020000_rls_security_fix.sql` | 18 | SECURITY DEFINER 보안 픽스 |
| `00013_rag_layer0.sql` | 28 | knowledge_chunks 벡터 테이블 |
| `20260320_db_v2_normalized.sql` | 15 | creatives, creative_media, landing_pages |
| `organic-channel.sql` | 12 | 유기적 채널 |
| `20260312_precompute_phase2.sql` | 12 | 프리컴퓨트 캐시 테이블 |
| `20260318_creative_intelligence.sql` | 9 | 소재 인텔리전스 |
| 기타 26개 파일 | 99 | 각종 테이블 |

### RLS 핵심 의존
- `auth.uid()` — Supabase Auth 전용 함수 → Cloud SQL에서 작동 안 함
- `get_user_role()`, `is_admin()`, `is_approved_user()` — `auth.uid()` 기반 헬퍼
- 브라우저 ANON_KEY 접근 시 RLS가 유일한 보호막

### 이관 전략

| 방식 | 설명 | 공수 |
|------|------|:----:|
| **A: 서버 사이드 전환** | 브라우저 직접 쿼리 제거 → 모든 쿼리 API Route/Server Action 경유 → RLS 불필요 | 3-5일 |
| **B: Cloud SQL RLS** | `set_config('request.jwt.claim.sub', ...)` 주입 + PostgreSQL RLS 유지 | 1-2주 |
| **C: 병행** | 크론/API는 SERVICE_ROLE (RLS 무시), 프론트는 점진적 API 경유 전환 | 점진적 |

**권장: A (서버 사이드 전환).** 현재도 대부분 `createServiceClient()` (RLS 우회) 사용 중.
브라우저 40개 파일만 API Route 경유로 변경하면 됨.

---

## 5. Vercel 의존 (maxDuration 33파일, revalidate 58호출)

### 난이도: **중간** / 공수: 1-2주 / 대안: Cloud Run + Cloud Scheduler + CDN

### 5-1. maxDuration (33파일)

Vercel Pro의 300초 제한. Cloud Run은 900초까지 가능 → **제거하거나 900으로 변경**.

| 파일 | maxDuration | 비고 |
|------|:----------:|------|
| `api/cron/collect-daily/route.ts` | 300 | Cloud Run 900초 |
| `api/cron/process-media/route.ts` | 300 | Cloud Run 900초 |
| `api/cron/crawl-lps/route.ts` | 300 | Cloud Run 900초 |
| `api/cron/embed-creatives/route.ts` | 300 | Cloud Run 900초 |
| `api/cron/collect-benchmarks/route.ts` | 300 | Cloud Run 900초 |
| `api/cron/analyze-competitors/route.ts` | 300 | Cloud Run 900초 |
| 기타 27개 | 60-300 | 전부 Cloud Run 호환 |

### 5-2. revalidatePath (6파일, 58호출)

Next.js 내장 기능이지만 Vercel CDN과 연동 최적화됨. Cloud Run 자체 호스팅 시 효과 제한적.

| 파일 | 호출 수 | 경로 |
|------|:------:|------|
| `actions/answers.ts` | 13 | /questions/*, /admin/answers, /dashboard |
| `actions/admin.ts` | 13 | /admin/members, /admin/accounts |
| `actions/reviews.ts` | 10 | /reviews, /admin/reviews |
| `actions/questions.ts` | 10 | /questions, /dashboard |
| `actions/curation.ts` | 6 | /admin/content |
| `actions/posts.ts` | 6 | /posts, /dashboard |

### 5-3. Cache-Control 헤더 (17개 API 라우트)

| 패턴 | 파일 수 | 예시 |
|------|:------:|------|
| `s-maxage` (CDN 캐시) | 3 | posts 30초, sales-summary 60초, og 604800초 |
| `no-store/no-cache` | 11 | protractor, admin, email tracking |
| `private, no-store` | 6 | protractor 내부 데이터 |

### 5-4. vercel.json

```json
{ "regions": ["icn1"] }
```
Cron 설정 없음 (Cloud Run Cloud Scheduler로 이미 이관). 리전만 설정.

### 5-5. Vercel 전용 패키지

`package.json`에 `@vercel/*` 패키지 **없음**. 의존도 낮음.

### 이관 계획

| Vercel 기능 | Cloud Run 대안 | 공수 |
|-------------|---------------|:----:|
| maxDuration 33파일 | 제거 또는 무시 (Next.js standalone에서 무효) | 0.5일 |
| revalidatePath 58호출 | Next.js standalone에서 작동 (메모리 캐시) | 0일 |
| s-maxage CDN 캐시 3파일 | Cloud CDN 또는 Cloudflare | 2-3일 |
| Cron 스케줄링 | Cloud Scheduler (이미 Cloud Run 호출 중) | 1일 |
| Preview 배포 | Cloud Build + PR Preview | 3-5일 |
| Edge Middleware | Next.js 서버 미들웨어 (자동 폴백) | 0일 |

---

## 이관 로드맵 (권장)

### Phase 0: 현재 완료 (0일)
- [x] DB 쿼리 Cloud SQL Proxy 패턴
- [x] Cloud Run `USE_CLOUD_SQL=true`
- [x] 90일 백필 실행 중

### Phase 1: Storage → GCS (2-3일)
- [ ] 7개 업로드 파일 `→ uploadToGcs()` 교체
- [ ] 15개 하드코딩 URL → 환경변수 기반
- [ ] 8개 프론트 컴포넌트 → API Route 경유

### Phase 2: Cron → Cloud Scheduler (1일)
- [ ] Cloud Scheduler로 기존 cron 일정 등록
- [ ] vercel.json cron 제거 (현재 없음 — 이미 Cloud Run 호출)

### Phase 3: Vercel 의존 제거 (3-5일)
- [ ] maxDuration 33파일 — 제거 또는 주석
- [ ] CDN 캐시 전략 재설계 (s-maxage 3파일)
- [ ] Cloud Build PR Preview 설정

### Phase 4: RLS → 서버 사이드 인증 (3-5일)
- [ ] 브라우저 40개 .tsx → API Route/Server Action 경유
- [ ] ANON_KEY 브라우저 노출 제거
- [ ] RLS 정책 비활성화 (SERVICE_ROLE로 통일)

### Phase 5: Auth (유보 — ROI 낮음)
- [ ] Supabase Auth 유지 권장 (무료 50K MAU)
- [ ] 이관 시 62파일 91호출 전면 수정 + 사용자 재인증 필요

---

## 최종 공수 산정

| 범위 | 파일 수 | 공수 | 비고 |
|------|:------:|:----:|------|
| Storage → GCS | 22 | 2-3일 | gcs-storage.ts 이미 준비 |
| Cron → Scheduler | 0 | 1일 | 설정만 |
| Vercel 제거 | 36 | 3-5일 | maxDuration + CDN |
| RLS → 서버 인증 | 40 + 33 migration | 3-5일 | 프론트 쿼리 API 경유 전환 |
| **합계 (Auth 제외)** | **~130** | **2-3주** | |
| Auth 이관 (선택) | 62 | +2-3주 | **비권장** |
