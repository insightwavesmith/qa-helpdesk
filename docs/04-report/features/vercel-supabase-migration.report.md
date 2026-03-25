# Vercel + Supabase 탈피 마이그레이션 완료 보고서

> 작성일: 2026-03-25
> 브랜치: feat/vercel-supabase-migration (PR #4)
> 기획서: docs/01-plan/features/vercel-supabase-migration.plan.md

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| **목적** | Supabase + Vercel 의존성 완전 제거, GCP 단일 스택 전환 |
| **변경 규모** | 292파일, +32,248 / -15,163줄 |
| **커밋 수** | 12 commits |
| **기간** | 2026-03-24 ~ 2026-03-25 |
| **QA 결과** | tsc PASS, build PASS, Vercel preview QA PASS |
| **잔여 Supabase 참조 (src/)** | 0건 |
| **잔여 Vercel 참조 (src/)** | 0건 |

---

## 마이그레이션 3대 축

### 1. Supabase SDK 제거 — Match Rate 93%

| 분류 | 상태 | 비고 |
|------|:----:|------|
| Auth (62파일) | ✅ 완료 | Firebase Auth 전환 (6파일 신규) |
| Storage (17파일) | ✅ 완료 | GCS 직접 연결 (`gcs-storage.ts`) |
| DB 쿼리 (80+파일) | ✅ 완료 | Cloud SQL Proxy (`db/index.ts`) |
| SDK 패키지 | ✅ 완료 | `@supabase/supabase-js`, `@supabase/ssr` 삭제 |
| RLS (246정책) | ⏳ 대기 | Phase C (서버사이드 인증 전환) |

**검증 결과:**
- `@supabase` import in src/: **0건**
- `NEXT_PUBLIC_SUPABASE` in src/: **0건**
- `createBrowserClient` in src/: **0건**
- `supabase.auth.*` in src/: **0건**
- `src/lib/supabase/` 디렉토리: **삭제됨**

**분석서:** docs/03-analysis/supabase-removal.analysis.md

### 2. Vercel 의존성 제거 — Match Rate 97%

| 분류 | 상태 | 비고 |
|------|:----:|------|
| bscamp.vercel.app (13파일) | ✅ 완료 | `bscamp.app`으로 전환 |
| VERCEL_URL (3파일) | ✅ 완료 | `NEXT_PUBLIC_SITE_URL` 통일 |
| vercel.json | ✅ 완료 | 파일 삭제 |
| maxDuration | ✅ 거의 완료 | 1건 잔여 (admin/content) |
| @vercel/* 패키지 | ✅ 없음 | 의존도 제로 |
| Preview 배포 | ⏳ 미구현 | Cloud Build 전환 필요 |
| 프론트 호스팅 | ⏳ 대기 | Cloud Run 전환 필요 |

**검증 결과:**
- `bscamp.vercel.app` in src/: **0건**
- `VERCEL_URL` in src/: **0건**

**분석서:** docs/03-analysis/vercel-removal.analysis.md

### 3. Agent Ops 분리 — Match Rate 100%

| 분류 | 상태 | 비고 |
|------|:----:|------|
| 대시보드 UI (13파일) | ✅ 삭제 | agent-ops 독립 프로젝트로 이전 |
| 터미널 UI (10파일) | ✅ 삭제 | agent-ops 독립 프로젝트로 이전 |
| API (9파일) | ✅ 삭제 | agent-ops 독립 프로젝트로 이전 |
| npm 패키지 (3개) | ✅ 삭제 | @xterm/xterm, @xterm/addon-fit, @slack/web-api |
| 스크립트 (5파일) | ✅ 삭제 | agent-ops 전용 스크립트 |

**총 삭제:** 52파일, -14,096줄
**분석서:** docs/03-analysis/agent-ops-separation.analysis.md

---

## 커밋 이력 (12 commits)

| # | Hash | 메시지 |
|---|------|--------|
| 1 | c507191 | feat: Phase A 완료 — Supabase Auth → Firebase Auth 전환 (68파일) |
| 2 | 4d96d9b | feat: Phase B + C 준비 — PostgREST 제거 + Dockerfile Firebase 전환 |
| 3 | d86a923 | feat: Supabase SDK 완전 제거 (126파일, +3057/-1247줄) |
| 4 | 15660c5 | fix: Supabase 잔여 참조 정리 + Gap 재분석 93% (12파일) |
| 5 | 3150b04 | fix: 대시보드 PDCA Match Rate 0% 버그 수정 |
| 6 | 317e0d6 | feat: Supabase URL 마이그레이션 스크립트 + Agent Ops 분리 설계서 |
| 7 | 1606abd | feat: Agent Ops 프로젝트 분리 — 52파일 삭제 (63파일, +908/-14096줄) |
| 8 | f943dbe | feat: Vercel 의존성 제거 (19파일, +284/-78줄) |
| 9 | d45ebdb | refactor: Vercel 잔존 참조 정리 (19파일, +28/-28줄) |
| 10 | 7aaf9c2 | chore: 에이전트팀 작업물 보존 |
| 11 | dbcfea5 | fix: 컨텍스트 90% 자동종료 제거 |
| 12 | 69c3750 | chore: Vercel+Supabase 기획서 보완 + 소재분석 목업 v3 |

---

## QA 검증 결과

### 빌드 검증
- `npx tsc --noEmit`: **PASS** (에러 0개)
- `npm run build`: **PASS** (107 정적 페이지 생성)

### Vercel Preview 브라우저 QA (2026-03-25)

| 페이지 | URL | 결과 | 비고 |
|--------|-----|:----:|------|
| 메인 | / | ✅ PASS | 로그인 폼 정상 렌더링 |
| 로그인 | /login | ✅ PASS | 이메일/비밀번호 폼 정상 |
| 회원가입 | /signup | ✅ PASS | 초대코드+계정+사업자 폼 정상 |
| 비밀번호 찾기 | /forgot-password | ✅ PASS | 이메일 입력 + 재설정 링크 |
| 대시보드 | /dashboard | ✅ PASS | 미인증 → 로그인 리다이렉트 |
| 질문 | /questions | ✅ PASS | 미인증 → 로그인 리다이렉트 |
| 총가치각도기 | /protractor | ✅ PASS | 미인증 → 로그인 리다이렉트 |
| 콘텐츠 관리 | /admin/content | ✅ PASS | 미인증 → 로그인 리다이렉트 |
| 정보공유 | /posts | ✅ PASS | 미인증 → 로그인 리다이렉트 |

- HTTP 에러 (500/404): **0건**
- Application Error: **0건**
- 인증 게이트: **정상 동작** (미인증 사용자 → 로그인 페이지 리다이렉트)

### 잔여 참조 전수조사
- `@supabase` import in src/: **0건**
- `bscamp.vercel.app` in src/: **0건**
- `VERCEL_URL` in src/: **0건**
- `supabase.auth.*` in src/: **0건**

---

## 잔여 항목 (후속 작업)

| # | 항목 | 우선순위 | 비고 |
|---|------|:--------:|------|
| 1 | RLS 비활성화 (Phase C) | 중 | 246개 정책 → 서버사이드 인증 전환 |
| 2 | Cloud Run 프론트 호스팅 (Phase B) | 높 | Dockerfile 준비됨, 배포만 남음 |
| 3 | Cloud Build Preview 배포 | 중 | Vercel Preview 대체 |
| 4 | CI/CD 파이프라인 | 중 | Cloud Build 기반 구축 |
| 5 | maxDuration 1건 잔여 | 낮 | admin/content/[id]/page.tsx |
| 6 | 환경변수 이관 | 높 | Vercel → Cloud Run env + Secret Manager |
| 7 | PR #4 merge 충돌 해결 | 높 | 10개 파일 충돌 (대부분 설정/상태 파일) |

---

## Firebase Auth 구현 현황

| 파일 | 역할 |
|------|------|
| `src/lib/firebase/client.ts` | 브라우저 SDK 초기화 |
| `src/lib/firebase/admin.ts` | Admin SDK 초기화 (서버) |
| `src/lib/firebase/auth.ts` | `getCurrentUser()` 헬퍼 (51파일에서 사용) |
| `src/lib/firebase/middleware.ts` | 세션 검증 + role 라우팅 |
| `src/app/api/auth/firebase-session/route.ts` | 세션 쿠키 생성 |
| `src/app/api/auth/firebase-logout/route.ts` | 로그아웃 처리 |

---

## 결론

Supabase SDK + Vercel 코드 의존성 **완전 제거** 완료. src/ 내 잔여 참조 0건 확인.
Agent Ops 52파일 분리로 코드베이스 14,096줄 경량화.
GCP 단일 스택(Firebase Auth + Cloud SQL + GCS) 전환 기반 확립.
후속으로 Cloud Run 배포(Phase B), RLS 전환(Phase C), CI/CD 구축 필요.
