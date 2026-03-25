# Supabase SDK 완전 제거 설계서

> 작성일: 2026-03-25
> 선택 설계안: Option A (일괄 치환)
> 참조: `docs/01-plan/features/vercel-supabase-migration.plan.md` Phase D

## Context Anchor

| 항목 | 내용 |
|------|------|
| WHY | Supabase 벤더 락인 탈피, 단일 GCP 클라우드 통합 |
| WHO | 전체 사용자 (~40명 수강생 + 관리자) |
| RISK | 95파일 일괄 변경 — tsc/build 실패 가능성 |
| SUCCESS | `@supabase/supabase-js`, `@supabase/ssr` 패키지 0개, import 0개 |
| SCOPE | src/ 내 Supabase 의존성 완전 제거 |

## 1. 현재 의존성

| 카테고리 | 파일 수 | 내용 |
|----------|:-------:|------|
| `createServiceClient()` import | 95 | `@/lib/supabase/server` → DB 쿼리빌더 |
| `@supabase/supabase-js` 직접 import | 19 | 타입, 클라이언트 생성 |
| `.storage` 사용 | 6 | Supabase Storage 업로드/다운로드 |
| 하드코딩 URL | 3 | 이메일 템플릿 Supabase Storage URL |
| Supabase 파일 | 3 | client.ts, middleware.ts, server.ts |
| npm 패키지 | 2 | `@supabase/supabase-js`, `@supabase/ssr` |

## 2. 변환 설계

### 2-1. createServiceClient() 이동

**Before** (`src/lib/supabase/server.ts`):
```typescript
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
export function createServiceClient() {
  // Supabase SDK로 프록시 클라이언트 생성
}
```

**After** (`src/lib/db/index.ts`에 추가):
```typescript
export function createServiceClient() {
  return createDbClient(); // 순수 Cloud SQL, Supabase 의존 0
}
```

### 2-2. Import 일괄 치환 (95파일)

```
Before: import { createServiceClient } from "@/lib/supabase/server";
After:  import { createServiceClient } from "@/lib/db";
```

스크립트로 sed 일괄 치환.

### 2-3. createClient() 제거

`createClient()` (쿠키 기반 서버 클라이언트)는 Auth 전환 후 DB 쿼리만 수행.
→ `createServiceClient()`로 통합. `createClient` import가 있으면 함께 치환.

### 2-4. .storage 6파일 → GCS 전환

| 파일 | 현재 | 변경 |
|------|------|------|
| `lp-media-downloader.ts` | `supabase.storage.from().upload()` | `uploadToGcs()` |
| `competitor-storage.ts` | `svc.storage.from().upload()` | `uploadToGcs()` |
| `contents.ts` | `supabase.storage.from().upload()` | `uploadToGcs()` |
| `admin/email/upload/route.ts` | `svc.storage.from().upload()` | `uploadToGcs()` |
| `collect-benchmarks/route.ts` | `anySvc.storage.from().upload()` | `uploadToGcs()` |
| `crawl-lps/route.ts` | `supabase.storage.from().upload()` | `uploadToGcs()` |

GCS 헬퍼: `src/lib/gcs-storage.ts`의 `uploadToGcs()`, `getPublicUrl()` 사용.

### 2-5. 하드코딩 URL 변환 (3파일)

```
Before: https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/content-images/newsletter-banners
After:  https://storage.googleapis.com/bscamp-storage/content-images/newsletter-banners
```

### 2-6. 삭제 대상

| 대상 | 경로 |
|------|------|
| `src/lib/supabase/client.ts` | 브라우저 Auth 클라이언트 (Firebase 대체) |
| `src/lib/supabase/middleware.ts` | 미들웨어 (Firebase 대체) |
| `src/lib/supabase/server.ts` | DB 프록시 (db/index.ts 대체) |
| `src/types/supabase.ts` | Supabase 전용 타입 |
| `@supabase/supabase-js` | npm 패키지 |
| `@supabase/ssr` | npm 패키지 |

## 3. 구현 순서

1. `src/lib/db/index.ts`에 `createServiceClient()` 추가
2. 일괄 치환 스크립트 실행 (95파일 import 변경)
3. `.storage` 6파일 GCS 전환
4. 하드코딩 URL 3파일 수정
5. Supabase 타입 import 정리
6. Supabase 파일 3개 삭제
7. npm 패키지 2개 제거
8. tsc + build 검증

## 4. 에러 처리

- `SupabaseClient<Database>` 타입 참조 → `DbClient` 타입으로 교체
- `supabase.auth.*` 잔여 호출 → Firebase `getCurrentUser()` 이미 전환됨
- `.storage` 반환 타입 → GCS 헬퍼 반환 타입으로 교체
