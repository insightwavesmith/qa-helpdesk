# GCP 완전 이관 Plan — Supabase+Vercel 의존도 제거

## Executive Summary

| 항목 | 값 |
|------|-----|
| Feature | Supabase+Vercel → GCP 완전 이관 |
| 작성일 | 2026-03-24 |
| 분석서 | docs/03-analysis/supabase-vercel-dependency.analysis.md |
| 도메인 | bscamp.app |
| GCP 프로젝트 | modified-shape-477110-h8 |
| 리전 | asia-northeast3 |
| Firebase Auth | 이메일+비밀번호 (설정 완료) |
| 서비스 계정 | /Users/smith/projects/bscamp/gcp-service-key.json |

| 관점 | 내용 |
|------|------|
| Problem | Supabase+Vercel 이중 의존 → 비용, 레이턴시, 단일장애점 |
| Solution | GCP 통합 (Cloud Run + Cloud SQL + Firebase Auth + Cloud CDN) |
| Function UX Effect | 동일한 사용자 경험, 인프라 비용 절감, 레이턴시 개선 |
| Core Value | 인프라 자립, 단일 클라우드 통합 |

---

## 이미 완료된 Phase (Skip)

| Phase | 내용 | 상태 |
|-------|------|:----:|
| Phase 0 | DB 쿼리 Cloud SQL Proxy 패턴 | ✅ 완료 |
| Phase 1 | Storage → GCS 이관 (22파일) | ✅ 완료 |
| Phase 2 | Cron → Cloud Scheduler (18개 크론) | ✅ 완료 |
| Phase 3-A | maxDuration 33파일 제거 | ✅ 완료 |
| Phase 3-B | CDN 캐시 (s-maxage) — Cloud CDN 호환 | ✅ 변경 불필요 |
| Phase 3-C | vercel.json → 빈 객체 정리 | ✅ 완료 |

---

## Phase 3-D: Vercel → Cloud Run 프론트 이관

### 목표
Next.js standalone을 Cloud Run에서 서빙. bscamp.app 도메인 연결. Vercel 완전 대체.

### 현재 상태
- Dockerfile 있음 (3-stage standalone 빌드, PORT=8080)
- Cloud Run `bscamp-cron` 서비스 이미 존재 (크론 전용)
- `next.config.ts`: `output: "standalone"` 설정됨
- `NEXT_PUBLIC_SITE_URL=https://bscamp.vercel.app` → `https://bscamp.app`으로 변경 필요

### 작업 내용

#### 3-D-1. Dockerfile 수정
- `NEXT_PUBLIC_SITE_URL` → `https://bscamp.app`
- Supabase ANON_KEY/URL은 Phase 5 전까지 유지 (Auth 의존)
- 빌드 검증: `docker build --target runner -t bscamp-web .`

#### 3-D-2. Cloud Run 프론트 서비스 배포
```bash
gcloud run deploy bscamp-web \
  --source . \
  --region asia-northeast3 \
  --project modified-shape-477110-h8 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 5 \
  --port 8080 \
  --allow-unauthenticated \
  --set-env-vars-file /tmp/bscamp-web-env.yaml
```

#### 3-D-3. 도메인 매핑 (bscamp.app)
- Cloud Run 도메인 매핑: `gcloud run domain-mappings create --service bscamp-web --domain bscamp.app`
- 또는 Cloud Load Balancer + Cloud CDN + SSL 인증서 설정
- DNS: A/AAAA 레코드 → Cloud Run 제공 IP

#### 3-D-4. 환경변수 설정
기존 Vercel env → Cloud Run env로 이관:
- DB: `DATABASE_URL`, `USE_CLOUD_SQL=true`
- Auth: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Phase 5 전까지 유지)
- Supabase: `SUPABASE_SERVICE_ROLE_KEY`
- GCS: `GCS_BUCKET`, `GCS_PROJECT_ID`
- 크롤러: `RAILWAY_CRAWLER_URL`, `RAILWAY_API_SECRET`
- 파이프라인: `CREATIVE_PIPELINE_URL`, `CREATIVE_PIPELINE_SECRET`
- Gemini: `GOOGLE_API_KEY`
- 기타: `CRON_SECRET`, `MIXPANEL_TOKEN`, `META_APP_SECRET`

#### 3-D-5. 테스트
- Cloud Run URL로 주요 페이지 접근 확인
- 로그인/회원가입 동작 확인 (Supabase Auth 아직 사용)
- 크론 트리거 정상 동작 확인
- bscamp.app 도메인 SSL 인증서 확인

### 공수: 1-2일
### 위험: 낮음 (Dockerfile + standalone 이미 준비)

---

## Phase 4: RLS → 서버사이드 인증 전환

### 목표
브라우저에서 Supabase에 직접 쿼리하는 40개 .tsx → API Route/Server Action 경유.
ANON_KEY 브라우저 노출 제거. RLS 정책 비활성화 (SERVICE_ROLE 통일).

### 현재 상태
- 33개 migration에 241개 RLS 정책
- `auth.uid()` 기반 — Cloud SQL에서 작동 안 함
- 브라우저 40개 .tsx에서 `createBrowserClient()` 사용
- 서버측은 이미 대부분 `createServiceClient()` (RLS 우회)

### 작업 내용

#### 4-1. 브라우저 직접 쿼리 목록 (31개 .tsx)
| 카테고리 | 파일 | 작업 |
|----------|------|------|
| Auth 페이지 | login, signup, pending, onboarding, reset, forgot (6개) | Phase 5에서 Firebase로 교체 — 이번엔 skip |
| 메인 레이아웃 | layout.tsx | `getUser()` → Server Component에서 처리 |
| 대시보드 | dashboard/page.tsx, student-home.tsx | API Route 또는 Server Action 경유 |
| 질문 | questions/page, [id], [id]/edit (3개) | Server Component 데이터 페칭 |
| 게시판 | posts/page, [id], new (3개) | Server Component 데이터 페칭 |
| 리뷰 | reviews/page, [id], new (3개) | Server Component 데이터 페칭 |
| 설정 | settings/page | Server Component 데이터 페칭 |
| 관리자 | admin/layout, email/[id], protractor/benchmarks (3개) | Server Component 데이터 페칭 |
| 컴포넌트 | Sidebar, app-sidebar, student-header (3개) | signOut만 사용 — Phase 5에서 교체 |
| 경쟁사 | competitor/page (1개) | Server Component 데이터 페칭 |
| 챗봇 | QaChatPanel (1개) | API Route 경유 |

#### 4-2. 전환 전략
1. **Server Component 전환 (우선)**: 대부분의 페이지는 Server Component로 데이터 직접 페칭 가능 (createServiceClient 사용)
2. **Client Component → API Route**: 실시간 인터랙션 필요한 곳만 API Route 경유
3. **Auth 관련 (skip)**: login/signup/signOut 등 Auth 직접 호출은 Phase 5에서 Firebase로 일괄 교체

#### 4-3. ANON_KEY 제거
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → 빌드에서 제거 (Phase 5 완료 후)
- `src/lib/supabase/client.ts` (createBrowserClient) → 삭제 (Phase 5 후)
- 중간 단계: 브라우저 쿼리만 API Route로 전환, Auth는 유지

### 공수: 3-5일
### 위험: 중간 (40개 파일 전환, 기능 깨짐 주의)

---

## Phase 5: Supabase Auth → Firebase Auth 전환

### 목표
62파일 91호출의 Supabase Auth를 Firebase Auth(이메일+비밀번호)로 전환.
Firebase Auth 프로젝트 이미 설정됨. 도메인 bscamp.app.

### 현재 상태
- Firebase Auth 설정 완료 (이메일+비밀번호)
- GCP 서비스 계정: `/Users/smith/projects/bscamp/gcp-service-key.json`
- Supabase Auth 호출 분포: Server 32호출 + Browser 37호출 + 인프라 3파일

### 작업 내용

#### 5-1. Firebase Admin SDK 설정
```bash
npm install firebase-admin firebase
```
- `src/lib/firebase/admin.ts` — Firebase Admin SDK 초기화 (서버)
- `src/lib/firebase/client.ts` — Firebase Client SDK 초기화 (브라우저)
- `src/lib/firebase/auth.ts` — getUser(), verifyIdToken() 헬퍼

#### 5-2. Middleware 교체 (핵심)
- `src/lib/supabase/middleware.ts` (254줄) → `src/lib/firebase/middleware.ts`
- 쿠키 기반 세션 검증: Firebase ID Token → 쿠키 저장 → middleware에서 verifySessionCookie()
- role 라우팅 로직 유지 (profiles 테이블 조회)

#### 5-3. Server Action/API Route 교체 (32개)
- `.auth.getUser()` → Firebase Admin `verifyIdToken()`
- 헬퍼 함수: `getCurrentUser()` → Firebase token 검증 + profiles 조회
- 10개 Server Action + 22개 API Route

#### 5-4. 브라우저 Auth 교체 (30개 페이지)
- `signInWithPassword()` → Firebase `signInWithEmailAndPassword()`
- `signUp()` → Firebase `createUserWithEmailAndPassword()`
- `signOut()` → Firebase `signOut()`
- `getUser()` → Firebase `onAuthStateChanged()` 또는 cookie 기반

#### 5-5. 사용자 마이그레이션
- Supabase Auth → Firebase Auth 사용자 데이터 이관
- `supabase auth export` → Firebase Admin `createUser()` 배치
- 비밀번호 해시 호환성 확인 (Supabase bcrypt → Firebase scrypt)
- 비호환 시: 비밀번호 리셋 이메일 발송

#### 5-6. 정리
- `src/lib/supabase/client.ts` 삭제 (브라우저 클라이언트)
- `src/lib/supabase/middleware.ts` 삭제
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 제거
- `src/lib/supabase/server.ts`는 유지 (DB 쿼리용 Proxy)

### 공수: 2-3주
### 위험: 높음 (사용자 재인증, 62파일 대규모 변경)

---

## 전체 일정

**⚠ 순서 변경 (2026-03-24 보안 검토)**
Phase 4(RLS 제거) 전에 Phase 5(Firebase Auth)를 먼저 해야 함.
이유: ANON_KEY가 브라우저에 노출된 상태에서 RLS를 끄면 보안 취약.

| Phase | 작업 | 공수 | 의존성 |
|-------|------|:----:|--------|
| 3-D | Vercel → Cloud Run 프론트 | 1-2일 | 없음 |
| 5 | Auth → Firebase + ANON_KEY 제거 | 2-3주 | Phase 3-D |
| 4 | RLS 비활성화 | 0.5일 | Phase 5 (ANON_KEY 제거 후) |

**Phase 4 대폭 축소**: createBrowserClient() 9개 전부 Auth 전용 (데이터 쿼리 0개).
브라우저→API Route 전환 불필요. RLS disable migration만 실행.

## 성공 기준
- [ ] bscamp.app에서 Cloud Run 프론트 서빙
- [ ] createBrowserClient() 0건 (Auth 포함)
- [ ] NEXT_PUBLIC_SUPABASE_ANON_KEY 코드/환경에서 완전 제거
- [ ] Firebase Auth 로그인/회원가입 정상 동작
- [ ] tsc + build 성공
- [ ] 기존 기능 100% 동작

## 제외
- Supabase DB 완전 제거 (server.ts Proxy 패턴으로 Cloud SQL 이미 사용 중)
- Cloud Build PR Preview (별도 TASK)
- 모바일 앱 (없음)
