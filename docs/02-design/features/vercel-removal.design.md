# Vercel 의존 제거 설계서 (v2)

> 작성일: 2026-03-25 (v2 전면 개정)
> Plan: docs/01-plan/features/gcp-full-migration.plan.md
> 범위: Phase 3-D (Cloud Run 전환) + Phase 4 (RLS 제거) + 코드 정리

## 1. 데이터 모델

### RLS 비활성화 (Phase 4)
- 36개 마이그레이션에 246개 RLS 정책 존재
- Cloud SQL은 `auth.uid()` 미지원 → RLS 무의미
- 모든 테이블에서 RLS 비활성화 (SERVICE_ROLE 통일 완료)
- `ANON_KEY` 브라우저 노출 0건 확인 → RLS 끄기 안전

```sql
-- 새 마이그레이션: 20260325_disable_all_rls.sql
-- 모든 테이블에서 RLS 비활성화
ALTER TABLE answers DISABLE ROW LEVEL SECURITY;
ALTER TABLE questions DISABLE ROW LEVEL SECURITY;
ALTER TABLE contents DISABLE ROW LEVEL SECURITY;
-- ... (전체 테이블 목록은 구현 시 확인)
```

## 2. API 설계

변경 없음. 기존 API route 동작 유지.

## 3. 수정 대상 파일 목록

### Wave 1: URL 정리 (13개 src 파일)

`bscamp.vercel.app` → `bscamp.app`으로 일괄 변경:

| # | 파일 | 라인 | 내용 |
|---|------|------|------|
| 1 | `src/app/layout.tsx` | 42 | metadata.url |
| 2 | `src/app/sitemap.ts` | 4 | BASE_URL 상수 |
| 3 | `src/app/robots.ts` | 12 | sitemap URL |
| 4 | `src/components/seo/json-ld.tsx` | 6, 16 | JSON-LD schema URL |
| 5 | `src/lib/content-crawler.ts` | 27, 93, 139 | User-Agent 문자열 |
| 6 | `src/lib/gsc.ts` | 34 | Google Search Console siteUrl |
| 7 | `src/lib/naver-searchadvisor.ts` | 28 | Naver Search Advisor siteUrl |
| 8 | `src/lib/email-template-utils.ts` | 895 | 이메일 내 기사 URL |
| 9 | `src/lib/email-default-template.ts` | 39 | 이메일 템플릿 URL |
| 10 | `src/app/api/email/track/route.ts` | 11 | fallback SITE_URL |
| 11 | `src/actions/contents.ts` | 434, 610 | fallback URL + User-Agent |

### Wave 2: VERCEL_URL 참조 제거 (3파일)

`VERCEL_URL` → `NEXT_PUBLIC_SITE_URL` 통일:

| # | 파일 | 라인 | 변경 |
|---|------|------|------|
| 1 | `src/app/api/protractor/benchmarks/collect/route.ts` | 27 | `VERCEL_URL` 분기 → `NEXT_PUBLIC_SITE_URL \|\| "https://bscamp.app"` |
| 2 | `src/app/api/admin/email/send/route.ts` | 178 | `VERCEL_URL` 분기 제거 → `"https://bscamp.kr"` 직접 |
| 3 | `src/app/api/admin/email/send/route.ts` | 182 | `VERCEL_URL` 분기 제거 → `"https://bscamp.app"` 직접 |

### Wave 3: 설정 파일 정리

| # | 파일 | 작업 |
|---|------|------|
| 1 | `vercel.json` | 삭제 (`{}` 빈 객체) |
| 2 | `.env.local` | `NEXT_PUBLIC_SITE_URL` → `https://bscamp.app` |
| 3 | `.env.prod` | VERCEL_* 12개 변수 제거, SITE_URL 변경 |
| 4 | `.env.vercel.tmp` | 삭제 (Vercel 전용 환경변수 백업, 불필요) |
| 5 | `.env.vercel` | 삭제 (Vercel 전용) |
| 6 | `playwright.config.ts` | baseURL → `https://bscamp.app` |

### Wave 4: RLS 비활성화 마이그레이션

| # | 작업 |
|---|------|
| 1 | `supabase/migrations/20260325_disable_all_rls.sql` 작성 — 전체 테이블 RLS DISABLE |
| 2 | Cloud SQL에서 마이그레이션 실행 |
| 3 | 검증: `SELECT tablename FROM pg_tables WHERE rowsecurity = true` → 0건 |

### Wave 5: 인프라 전환 (Cloud Run)

Plan Phase 3-D 참조:

| # | 작업 |
|---|------|
| 1 | Dockerfile 검증 — `docker build -t bscamp-web .` 로컬 빌드 |
| 2 | Cloud Run `bscamp-web` 서비스 생성 — `gcloud run deploy` |
| 3 | 환경변수 설정 — Vercel env → Cloud Run env 이관 |
| 4 | 도메인 매핑 — bscamp.app DNS → Cloud Run |
| 5 | SSL 인증서 확인 |
| 6 | 스모크 테스트 — 주요 페이지 + 로그인 + 크론 |

## 4. 에러 처리

- URL 변경은 기능에 영향 없음 (SEO 리다이렉트 불필요, bscamp.app이 이미 canonical)
- RLS 비활성화는 서버사이드 인증(Firebase Auth) 완료 후이므로 보안 문제 없음
- Cloud Run 전환 실패 시 Vercel 롤백 (DNS만 되돌리면 됨)

## 5. 구현 순서

- [ ] Wave 1: `bscamp.vercel.app` → `bscamp.app` (13파일)
- [ ] Wave 2: `VERCEL_URL` 참조 제거 (3파일)
- [ ] Wave 3: 설정 파일 정리 (vercel.json 삭제, .env 정리)
- [ ] Wave 4: RLS 비활성화 마이그레이션
- [ ] Wave 5: Cloud Run 배포 + 도메인 + 검증
- [ ] tsc + build 성공 확인
- [ ] Vercel 프로젝트 비활성화
