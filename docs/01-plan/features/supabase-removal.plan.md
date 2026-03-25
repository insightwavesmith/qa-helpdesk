# Supabase SDK 완전 제거 Plan

> 작성일: 2026-03-25 (소급 — 구현 완료 후 문서화)
> 상위 계획: `vercel-supabase-migration.plan.md` Phase D

## Executive Summary

| 관점 | 내용 |
|------|------|
| Problem | Supabase SDK(`@supabase/supabase-js`, `@supabase/ssr`)가 95+파일에 의존 — GCP 전환 시 이중 의존성으로 유지보수 비용 증가 |
| Solution | 서버 DB는 `@/lib/db`(Cloud SQL pg Pool), 인증은 Firebase Auth, 스토리지는 GCS로 완전 전환 |
| Function UX Effect | 사용자 체감 변화 없음 — 동일 UI, 동일 기능, 백엔드 인프라만 교체 |
| Core Value | 단일 GCP 클라우드 통합으로 벤더 락인 탈피, 운영 비용 절감, 인프라 일원화 |

## Context Anchor

| 항목 | 내용 |
|------|------|
| WHY | Supabase 벤더 락인 탈피, 단일 GCP 클라우드 통합 |
| WHO | 전체 사용자 (~40명 수강생 + 관리자) |
| RISK | 180파일 일괄 변경 — tsc/build 실패, 인증 흐름 깨짐 가능성 |
| SUCCESS | `@supabase/supabase-js`, `@supabase/ssr` 패키지 0개, import 0개, tsc 0 에러, build 성공 |
| SCOPE | src/ 내 모든 Supabase 의존성 완전 제거 (DB, Auth, Storage, 타입, 패키지) |

## 1. 배경 및 목표

### 1.1 문제
- Supabase SDK가 서버 액션(10), API 라우트(22), 브라우저 페이지(9), 미들웨어(2) 등 95+파일에 걸쳐 의존
- GCP Cloud SQL + Firebase Auth로 이미 전환 중이나, Supabase SDK 잔존으로 이중 의존
- npm 패키지 2개(`@supabase/supabase-js`, `@supabase/ssr`)와 래퍼 파일 3개(`supabase/server.ts`, `client.ts`, `middleware.ts`)가 코드베이스에 남아있음

### 1.2 목표
1. `@supabase/supabase-js`, `@supabase/ssr` npm 패키지 완전 제거
2. `src/lib/supabase/` 디렉토리 삭제
3. 모든 DB 접근 → `@/lib/db` (`createServiceClient`, `createDbClient`)
4. 모든 서버 인증 → `@/lib/firebase/auth` (`getCurrentUser`)
5. 모든 브라우저 인증 → `@/lib/firebase/client` (Firebase Client SDK)
6. 모든 Storage → `@/lib/gcs-storage` (`uploadToGcs`)
7. tsc 0 에러, npm run build 성공

## 2. 범위

### 2.1 변환 대상

| 카테고리 | 파일 수 | 변환 내용 |
|----------|:-------:|----------|
| Server Actions (`src/actions/`) | ~10 | import 경로 변경 + auth 패턴 전환 |
| API Routes (`src/app/api/`) | ~22 | import 경로 변경 + auth 패턴 전환 |
| 브라우저 Auth 페이지 | 9 | Supabase Client SDK → Firebase Client SDK |
| 미들웨어 | 2 | Supabase 폴백 제거, Firebase 단일 경로 |
| Storage (`.storage`) | 6 | Supabase Storage → GCS (`uploadToGcs`) |
| 크롬 확장 API (`ext/`) | 2 | Supabase JWT → Firebase ID Token |
| 하드코딩 URL | 3 | Supabase Storage URL → GCS URL |
| SupabaseClient 타입 | 14 | `SupabaseClient<Database>` → `DbClient` |
| 레거시 파일 삭제 | 3 | `supabase/server.ts`, `client.ts`, `middleware.ts` |
| npm 패키지 제거 | 2 | `@supabase/supabase-js`, `@supabase/ssr` |

### 2.2 범위 외
- DB 스키마 변경 없음 (Cloud SQL 이미 전환 완료)
- Firebase 사용자 마이그레이션 (별도 태스크 A-1)
- Vercel → Cloud Run 인프라 전환 (별도 계획)

## 3. 성공 기준

| # | 기준 | 측정 방법 |
|---|------|----------|
| S1 | `@supabase` import 0개 (src/ 내) | `grep -r "@supabase" src/` |
| S2 | `@/lib/supabase` import 0개 | `grep -r "@/lib/supabase" src/` |
| S3 | npm 패키지 제거 | `npm ls @supabase/supabase-js` → not found |
| S4 | `src/lib/supabase/` 디렉토리 삭제 | `ls src/lib/supabase/` → not found |
| S5 | tsc 0 에러 | `npx tsc --noEmit` |
| S6 | build 성공 | `npm run build` |
| S7 | 로그인/회원가입 동작 | 브라우저 QA |
| S8 | 관리자 기능 동작 | 브라우저 QA |

## 4. 리스크

| 리스크 | 영향 | 완화 |
|--------|------|------|
| 180파일 일괄 변경으로 tsc 에러 폭발 | High | 자동화 스크립트 + 단계별 실행 |
| Auth 패턴 변경으로 로그인 깨짐 | Critical | Firebase 세션 쿠키 인프라 사전 구축 |
| TypeScript strict 모드 implicit any | Medium | `fix-implicit-any.mjs` 자동 수정 |
| 브라우저 Auth SDK 변경 | High | Firebase Client SDK 이미 설치됨 |

## 5. 의존성

- [완료] Cloud SQL 직접 연결 (`@/lib/db/index.ts`, `query-builder.ts`)
- [완료] Firebase Auth 서버 헬퍼 (`@/lib/firebase/auth.ts`)
- [완료] Firebase Admin SDK (`@/lib/firebase/admin.ts`)
- [완료] Firebase Client SDK (`@/lib/firebase/client.ts`)
- [완료] GCS Storage 헬퍼 (`@/lib/gcs-storage.ts`)
- [완료] Firebase 세션 API (`/api/auth/firebase-session`, `/api/auth/firebase-logout`)

## 6. 구현 순서

1. `src/lib/db/index.ts`에 `createServiceClient()` 추가
2. 일괄 치환 스크립트로 95파일 import 변경
3. `SupabaseClient` 타입 → `DbClient` 치환 (14파일)
4. `supabase.auth.getUser()` → `getCurrentUser()` 패턴 전환
5. `user.id` → `user.uid` (AuthUser 인터페이스 차이)
6. `.storage` 6파일 → GCS 전환
7. 하드코딩 URL 3파일 수정
8. 브라우저 Auth 9파일 → Firebase Client SDK
9. 크롬 확장 API 2파일 → Firebase Token/REST
10. 미들웨어 Supabase 폴백 제거
11. TypeScript implicit any 자동 수정 (68개)
12. Supabase 래퍼 파일 3개 삭제
13. npm 패키지 2개 제거
14. tsc + build 검증
