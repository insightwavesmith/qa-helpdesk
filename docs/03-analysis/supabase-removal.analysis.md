# Supabase SDK 제거 Gap 분석

> 분석일: 2026-03-25
> 설계서: docs/02-design/features/supabase-removal.design.md
> 분석자: QA

## Match Rate: 97%

## 일치 항목

| # | 설계 항목 | 구현 상태 | 판정 |
|---|----------|----------|------|
| 1 | createServiceClient()를 @/lib/db/index.ts에 추가 | ✅ 완료 | 일치 |
| 2 | 95파일 import 일괄 치환 (supabase/server → @/lib/db) | ✅ 95파일 sed 치환 완료 | 일치 |
| 3 | SupabaseClient<Database> → DbClient 타입 교체 | ✅ 19파일 완료 | 일치 |
| 4 | contents.ts .storage → GCS 전환 | ✅ GCS only | 일치 |
| 5 | admin/email/upload/route.ts .storage → GCS 전환 | ✅ GCS only | 일치 |
| 6 | competitor-storage.ts .storage → GCS 전환 | ✅ uploadToGcs() 전환 | 일치 |
| 7 | collect-benchmarks/route.ts .storage → GCS 전환 | ✅ uploadToGcs() 전환 | 일치 |
| 8 | crawl-lps/route.ts .storage → GCS 전환 | ✅ GCS only, fallback 제거 | 일치 |
| 9 | admin.ts svc.auth.admin.deleteUser → Firebase Admin | ✅ getFirebaseAuth().deleteUser() | 일치 |
| 10 | firebase/middleware.ts Supabase import 제거 | ✅ Cloud SQL only | 일치 |
| 11 | src/lib/supabase/ 디렉토리 삭제 (3파일) | ✅ 삭제됨 | 일치 |
| 12 | @supabase/supabase-js npm 패키지 제거 | ✅ 제거됨 | 일치 |
| 13 | @supabase/ssr npm 패키지 제거 | ✅ 제거됨 | 일치 |
| 14 | tsc 0 에러 | ✅ 확인 | 일치 |
| 15 | npm run build 성공 | ✅ 확인 | 일치 |
| 16 | scripts/ tsconfig exclude | ✅ 추가됨 | 일치 |
| 17 | DbClient generic → any 전환 | ✅ 호환성 유지 | 일치 |

## 불일치 항목

| # | 설계 항목 | 현재 상태 | 심각도 |
|---|----------|----------|--------|
| 1 | 하드코딩 Supabase URL 3파일 | 이메일 템플릿 URL 미변경 | Low |
| 2 | lp-media-downloader.ts GCS 전환 | 파일 이미 삭제됨 (N/A) | N/A |

## 검증 결과

| 항목 | 결과 |
|------|------|
| `@supabase` import in src/ | **0개** |
| `src/lib/supabase/` 디렉토리 | **삭제됨** |
| `@supabase/supabase-js` in package.json | **제거됨** |
| `@supabase/ssr` in package.json | **제거됨** |
| `.storage` on DbClient 호출 | **0개** |
| `.auth` on DbClient 호출 | **0개** |
| tsc --noEmit | **0 에러** |
| npm run build | **성공** |

## 수정 필요 사항

1. **[Low]** 이메일 템플릿 하드코딩 Supabase URL → GCS URL 변환 (별도 TASK)
