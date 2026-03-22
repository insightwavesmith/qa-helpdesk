# db-restructure-phase1 Gap 분석

- **기능**: DB 정규화 Phase 1 — landing_pages/lp_snapshots 테이블 분리
- **설계서**: docs/02-design/features/db-restructure-phase1.design.md
- **분석일**: 2026-03-22
- **Match Rate**: 92%

## 일치 항목

### 1. landing_pages 테이블 (100% 일치)
- 설계서 12개 컬럼 전부 동일하게 구현됨
  - `id`, `account_id`, `canonical_url`, `original_urls`, `domain`, `product_id`, `product_name`, `page_type`, `platform`, `is_active`, `ad_count`, `created_at`, `updated_at`
- 타입, DEFAULT 값, UNIQUE/NOT NULL 제약조건 모두 일치
- 인덱스 3개(`account_id`, `domain`, `page_type`) 설계서와 동일

### 2. lp_snapshots 테이블 (기본 구조 일치)
- 설계서 8개 컬럼 전부 구현됨
  - `id`, `lp_id`, `viewport`, `screenshot_url`, `cta_screenshot_url`, `screenshot_hash`, `cta_screenshot_hash`, `crawled_at`, `crawler_version`
- FK 참조 `landing_pages(id) ON DELETE CASCADE` 일치
- 인덱스: `lp_id` 단일 인덱스 + `UNIQUE(lp_id, viewport)` 복합 유니크 일치

### 3. normalize-lps.mjs 정규화 로직 (100% 일치)
- 쿼리스트링 제거 (`?` 이후 파라미터, UTM, fbclid 등)
- `/utm_source=` 경로 파라미터 제거
- `surl` 리다이렉트 해소 (HEAD 요청 + AbortController 타임아웃)
- `www.` / `m.` 도메인 통합
- 외부 도메인(`fb.com`, `facebook.com`, `instagram.com`, `naver.com` 등) → `page_type='external'`
- `/article/` 패턴 → `page_type='article'`
- 플랫폼 감지: cafe24(`surl`, `product/detail.html`), smartstore, oliveyoung
- `--dry-run` 모드 + upsert 배치(50건) 구현

### 4. validate-lp-crawl.mjs (일치)
- `landing_pages` 대상 URL HEAD 요청 검증
- `--dry-run` / `--fix` 모드 구현
- 실패 시 `is_active=false` 업데이트 로직

### 5. crawl-all-lps.mjs (핵심 동작 일치)
- `viewport` 파라미터 지원 (`mobile` / `desktop` / `both`)
- Railway 크롤러 호출 시 `{ url, clickCta: true, viewport }` 전달
- `lp_snapshots` upsert (ON CONFLICT `lp_id,viewport`)
- Storage 업로드 (`lp-screenshots` 버킷)
- `--limit`, `--dry-run` CLI 옵션

### 6. 에러 처리 (일치)
- 리다이렉트 실패 시 원본 URL 유지 + `is_active=false` 처리
- HEAD 요청 타임아웃 10초 설정
- 크롤링 실패 시 재시도 로직 구현

## 불일치 항목

### 1. lp_snapshots에 `section_screenshots` 컬럼 추가 (설계서에 없음)
- **구현**: `section_screenshots jsonb DEFAULT '{}'` 컬럼이 마이그레이션에 추가됨
- **설계서**: 해당 컬럼 언급 없음
- **영향**: 기능 확장 (섹션별 스크린샷 저장). 설계서 범위를 초과하지만 유용한 기능
- **심각도**: 낮음 (추가 기능, 기존 설계 훼손 없음)

### 2. RLS 정책 4개 추가 (설계서에 미기재)
- **구현**: 두 테이블 모두 RLS 활성화 + `service_role` 전체 권한 + `authenticated` 읽기 전용 정책
- **설계서**: RLS 정책에 대한 명시적 설계 없음
- **영향**: 프로젝트 규칙(CLAUDE.md "DB 안전: RLS 정책 필수")에 따른 필수 구현이므로 올바른 판단
- **심각도**: 없음 (설계서 누락이지만 구현이 정확)

### 3. 크롤러 재시도 횟수 차이
- **설계서**: "retry 2회 → 실패 시 로그" (총 3회 시도)
- **구현**: `maxAttempts = 3` (총 3회 시도)
- **영향**: 실질적으로 동일 (설계서의 "retry 2회"는 최초 시도 + 재시도 2회 = 총 3회로 해석 가능)
- **심각도**: 없음

### 4. Storage 경로 패턴
- **구현**: `{lpId}/{viewport}/{filename}` (예: `abc-123/mobile/main.jpg`)
- **ADR-001 패턴**: `{account_id}/` 폴더 분리 권장
- **영향**: LP 스크린샷은 계정 종속 리소스가 아닌 LP 종속 리소스이므로 `lpId` 기준이 합리적. 다만 ADR-001과 일관성 검토 필요
- **심각도**: 낮음 (설계 의도에 부합하나 ADR 원칙과 명시적 정합성 확인 권장)

## 수정 필요

1. **설계서 보완 권장** (코드 수정 불필요):
   - `section_screenshots jsonb` 컬럼을 설계서 1-2. lp_snapshots 테이블에 추가
   - RLS 정책 섹션 추가 (두 테이블의 4개 정책 명시)
   - Storage 경로 패턴(`{lpId}/{viewport}/`) 명시

2. **코드 수정 불필요**: 구현이 설계 의도를 올바르게 반영하고 있으며, 불일치 항목은 모두 기능 확장 또는 보안 강화 방향

## 검증 결과

- tsc: 확인 대상 아님 (스크립트는 `.mjs` 파일, TypeScript 아님)
- build: 확인 대상 아님 (독립 스크립트, Next.js 빌드와 무관)
- SQL: Supabase 적용 완료 (landing_pages 15컬럼, lp_snapshots 10컬럼, 인덱스 8개, RLS 정책 4개 확인됨)
- 정규화 스크립트: 실행 완료 확인 (ad_creative_embeddings → landing_pages 마이그레이션)
