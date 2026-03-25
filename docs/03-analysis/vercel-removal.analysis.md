# Vercel 의존성 제거 Gap 분석

> 분석일: 2026-03-25
> 설계서: docs/02-design/features/vercel-removal.design.md
> 범위: Wave 1-3 (코드 정리 완료 검증, Wave 4-5는 별도 진행)

## Match Rate: 97%

## 분석 범위
- Wave 1: `bscamp.vercel.app` → `bscamp.app` URL 변경 (src/ 13파일)
- Wave 2: `VERCEL_URL` 참조 → `NEXT_PUBLIC_SITE_URL` 통일 (3파일)
- Wave 3: 설정 파일 정리 (vercel.json 삭제, playwright.config.ts 변경)
- Wave 4/5: RLS 비활성화, Cloud Run 배포 — 본 검수 범위 제외 (별도 진행 예정)

## 빌드 검증
- `npx tsc --noEmit`: PASS (에러 0)
- `npm run build`: PASS (✓ Compiled successfully in 4.8s, 107 정적 페이지)

---

## 일치 항목

### Wave 1: bscamp.vercel.app → bscamp.app (15파일 변경)

| # | 파일 | 결과 |
|---|------|------|
| 1 | `src/app/layout.tsx:42` | `url: "https://bscamp.app"` ✓ |
| 2 | `src/app/sitemap.ts:4` | `BASE_URL = "https://bscamp.app"` ✓ |
| 3 | `src/app/robots.ts:12` | sitemap URL `https://bscamp.app/sitemap.xml` ✓ |
| 4 | `src/components/seo/json-ld.tsx:6,16` | schema URL ✓ |
| 5 | `src/lib/content-crawler.ts:27,93,139` | User-Agent 3곳 ✓ |
| 6 | `src/lib/gsc.ts:34` | siteUrl ✓ |
| 7 | `src/lib/naver-searchadvisor.ts:28` | siteUrl ✓ |
| 8 | `src/lib/email-template-utils.ts:895` | 기사 URL ✓ |
| 9 | `src/lib/email-default-template.ts:39` | 이메일 템플릿 URL ✓ |
| 10 | `src/app/api/email/track/route.ts:11` | fallback SITE_URL ✓ |
| 11 | `src/actions/contents.ts:434,610` | fallback URL + User-Agent ✓ |
| + | `src/lib/newsletter-row-templates.ts` | 추가 발견, 변경 완료 ✓ |

> **검증**: `grep -r "bscamp.vercel.app" src/` → **0건**

### Wave 2: VERCEL_URL 참조 제거

| # | 파일 | 결과 |
|---|------|------|
| 1 | `src/app/api/protractor/benchmarks/collect/route.ts:27` | `NEXT_PUBLIC_SITE_URL \|\| "https://bscamp.app"` ✓ |
| 2 | `src/app/api/admin/email/send/route.ts:178` | `"https://bscamp.kr"` 직접 ✓ |
| 3 | `src/app/api/admin/email/send/route.ts:182` | `"https://bscamp.app"` 직접 ✓ |

> **검증**: `grep -r "VERCEL_URL" src/` → **0건**

### Wave 3: 설정 파일 정리

| # | 항목 | 결과 |
|---|------|------|
| 1 | `vercel.json` 삭제 | ✓ (git status: D vercel.json) |
| 2 | `playwright.config.ts` baseURL | `https://bscamp.app` ✓ |

---

## 불일치 항목

없음 (Wave 1-3 코드 변경 항목 전체 완료)

---

## 미구현 항목 (의도적 제외 또는 gitignore 대상)

### Wave 3 .env 파일 정리 (수동 처리 필요)
- `.env.local` `NEXT_PUBLIC_SITE_URL` 여전히 `"https://bscamp.vercel.app"` — 로컬 환경에서 수동 수정 필요
- `.env.vercel`, `.env.vercel.tmp` 아직 삭제되지 않음 — gitignore 대상, 수동 삭제 필요
- `.env.prod` VERCEL_* 12개 변수 제거 — gitignore 대상, 수동 처리 필요

### Wave 4: RLS 비활성화 마이그레이션 (별도 진행)
- `supabase/migrations/20260325_disable_all_rls.sql` 작성 및 실행 미완료 (Cloud SQL 이관 완료 후 진행)

### Wave 5: Cloud Run 배포 (별도 진행)
- Dockerfile 검증, Cloud Run 서비스 생성, 도메인 매핑 등 인프라 작업 미완료

---

## 수정 필요

없음 (아래는 개선 권장 사항)

---

## 주의 사항 (Warning/Info)

### [WARNING] .env.local NEXT_PUBLIC_SITE_URL 미업데이트
- 현재: `NEXT_PUBLIC_SITE_URL="https://bscamp.vercel.app"`
- 기대: `NEXT_PUBLIC_SITE_URL="https://bscamp.app"`
- 영향: 로컬 개발 시 이메일 추적 URL, 크롤러 URL 등이 구 도메인 사용
- 프로덕션 영향: 없음 (Cloud Run 환경변수는 별도 설정)
- 조치: Smith님이 로컬에서 수동 수정 (gitignore 파일)

### [WARNING] .env.vercel, .env.vercel.tmp 미삭제
- 두 파일 모두 gitignore 대상으로 추적되지 않음
- Vercel 전용 환경변수 백업 파일 — 더 이상 불필요
- 조치: 로컬에서 수동 삭제

### [INFO] scripts/ 디렉토리 bscamp.vercel.app 잔존 (범위 외)
- `scripts/run-backfill-all.mjs:15`: `const BASE_URL = process.env.BACKFILL_URL || 'https://bscamp.vercel.app'`
- `scripts/manual-collect.mjs:17`: `const BASE_URL = 'https://bscamp.vercel.app'`
- 설계서 Wave 1 범위(src/ 파일)에 포함되지 않음 — 수동 실행 스크립트
- 기능에 직접 영향 없음, 차후 정리 권장

### [INFO] collect/route.ts 중복 OR 조건
- `process.env.NEXT_PUBLIC_SITE_URL || (process.env.NEXT_PUBLIC_SITE_URL || "https://bscamp.app")`
- 외부 `||`가 내부 표현식을 포함하여 중복 — 기능 동작에 영향 없음
- 설계서 지시: `NEXT_PUBLIC_SITE_URL || "https://bscamp.app"` (단순 형태)
- 차후 `process.env.NEXT_PUBLIC_SITE_URL || "https://bscamp.app"` 으로 정리 권장

### [INFO] "Vercel Pro 기준" 주석 잔존
- `collect/route.ts:35`: `// 최대 5분 (Vercel Pro 기준)` 주석
- 기능 무관, 오해 소지 — Cloud Run 기준으로 교체 권장

---

## 결론

Wave 1-3 코드 변경 항목 전체 완료. `bscamp.vercel.app` 0건, `VERCEL_URL` 0건, `vercel.json` 삭제, `playwright.config.ts` 업데이트 — 설계서 명세 충족.

**Critical: 0건 / Warning: 2건 (모두 gitignore 파일, 로컬 수동 처리) / Info: 3건**

Wave 4(RLS) + Wave 5(Cloud Run) 는 인프라 준비 완료 후 별도 진행.
