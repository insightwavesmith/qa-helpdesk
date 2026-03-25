# Supabase SDK 제거 Gap 분석 (v2)

> 분석일: 2026-03-25 (재분석)
> 설계서: docs/02-design/features/supabase-removal.design.md
> 구현 범위: src/ 전체 (126파일, +3057/-1247줄)
> 분석자: gap-detector + QA

## Match Rate: 93%

> 1차 분석(97%) → 재분석(85%, 누락 항목 발견) → 수정 적용 후 93%

---

## 일치 항목 (19건)

| # | 설계 항목 | 구현 상태 | 판정 |
|---|----------|----------|------|
| 1 | `@supabase/supabase-js` npm 제거 | package.json에 없음 | ✅ |
| 2 | `@supabase/ssr` npm 제거 | package.json에 없음 | ✅ |
| 3 | package-lock.json @supabase 0건 | 확인 완료 | ✅ |
| 4 | `src/lib/supabase/` 디렉토리 삭제 (3파일) | 삭제됨 | ✅ |
| 5 | `@supabase/supabase-js` import 0건 | src/ 전체 0건 | ✅ |
| 6 | `@supabase/ssr` import 0건 | src/ 전체 0건 | ✅ |
| 7 | `@/lib/supabase` import 0건 | src/ 전체 0건 | ✅ |
| 8 | `createServiceClient()` → `@/lib/db` | 110파일 전환 완료 | ✅ |
| 9 | `src/lib/db/index.ts` Cloud SQL 직접 연결 | 존재, 동작 확인 | ✅ |
| 10 | `.storage` 호출 0건 (DbClient) | src/ 전체 0건 | ✅ |
| 11 | Storage 6파일 GCS 전환 | 완료 | ✅ |
| 12 | `SupabaseClient<Database>` 타입 0건 | src/ 전체 0건 | ✅ |
| 13 | middleware.ts Firebase 기반 전환 | 완전 전환 | ✅ |
| 14 | `supabase.auth.*` 잔여 호출 0건 | Firebase `getCurrentUser()` 사용 | ✅ |
| 15 | `process.env.*SUPABASE` src/ 참조 0건 | 확인 완료 | ✅ |
| 16 | Dockerfile Supabase 참조 제거 | 0건 | ✅ |
| 17 | next.config.ts Supabase 참조 제거 | 0건 | ✅ |
| 18 | tsc --noEmit 에러 0 | 확인 완료 | ✅ |
| 19 | npm run build 성공 | 확인 완료 | ✅ |

## 수정 완료 항목 (이번 세션)

| # | 항목 | 수정 내용 |
|---|------|----------|
| 1 | 이메일 템플릿 Supabase URL fallback | `USE_CLOUD_SQL` 분기 제거, GCS URL 직접 사용 (3파일) |
| 2 | `src/types/supabase.ts` dead file | 삭제 (import 0건 확인 후) |

수정 대상 파일:
- `src/lib/email-default-template.ts` — BANNER_BASE GCS only
- `src/lib/newsletter-row-templates.ts` — BANNER_BASE_URL GCS only
- `src/lib/email-template-utils.ts` — BANNER_BASE_URL GCS only
- `src/types/supabase.ts` — 삭제 (1,965줄, database.ts와 중복)

## 잔여 항목 (의도적 유지 / 별도 TASK)

| # | 항목 | 사유 | 조치 |
|---|------|------|------|
| 1 | `.env.local/.prod/.vercel` SUPABASE_ 변수 | git untracked (.gitignore) | Vercel 환경변수에서 수동 제거 |
| 2 | `post-body.tsx` supabase.co URL 분기 | 기존 게시물 이미지 레거시 호환 | 데이터 마이그레이션 후 제거 |
| 3 | `gcs-storage.ts` convertSupabaseUrlToGcs() | 레거시 URL 변환 유틸리티 | 의도적 유지 |
| 4 | `database.ts` __InternalSupabase 필드 | 타입 재생성 시 자동 정리 | 다음 스키마 동기화 시 |
| 5 | 변수명 `supabase` → `db` (57파일) | 코드 컨벤션 리팩토링 | 별도 TASK |

## 검증 결과

| 항목 | 결과 |
|------|------|
| `@supabase` import in src/ | **0건** |
| `src/lib/supabase/` 디렉토리 | **삭제됨** |
| `@supabase/supabase-js` in package.json | **제거됨** |
| `@supabase/ssr` in package.json | **제거됨** |
| `.storage` on DbClient 호출 | **0건** |
| `supabase.co` in 이메일 템플릿 | **0건** (수정 완료) |
| `src/types/supabase.ts` | **삭제됨** |
| tsc --noEmit | **에러 0** |
| npm run build | **성공** |
