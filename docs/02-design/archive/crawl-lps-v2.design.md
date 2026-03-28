# crawl-lps v2 전환 설계서

> 작성일: 2026-03-22
> TASK: T4 (architecture-v3-execution-plan.md)
> 의존성: T1 ✅ (landing_pages.content_hash/last_crawled_at/is_active 컬럼)
> 관련 Plan: docs/01-plan/features/architecture-v3-execution-plan.md T4 섹션

---

## 현재 상태 요약

### 이미 구현된 v2 인프라 (재사용)
| 파일 | 상태 | 역할 |
|------|------|------|
| `scripts/normalize-lps.mjs` (368줄) | ✅ 완료 | ad_creative_embeddings.lp_url → landing_pages 정규화 |
| `scripts/validate-lp-crawl.mjs` (294줄) | ✅ 완료 | URL 상태 검증, 실패→is_active=false |
| `scripts/crawl-lps-local.mjs` (528줄) | ✅ 완료 | Playwright 로컬 듀얼 뷰포트+섹션 크롤링 |
| `scripts/crawl-all-lps.mjs` (326줄) | ✅ 완료 | Railway 배치 크롤링 |
| `landing_pages` 테이블 | ✅ 적용됨 | canonical_url, account_id, page_type |
| `lp_snapshots` 테이블 | ✅ 적용됨 | lp_id FK, viewport, section_screenshots |

### 전환 필요 (본 설계서 범위)
| 파일 | 변경 | 설명 |
|------|------|------|
| `src/app/api/cron/crawl-lps/route.ts` (292줄) | **전면 재작성** | ad_creative_embeddings → landing_pages 기준 |
| `src/lib/railway-crawler.ts` (122줄) | **확장** | crawlV2() 함수 추가 |
| `scripts/migrate-lp-screenshots-v2.mjs` | **신규** | 기존 Storage 데이터 마이그레이션 |

---

## 1. 데이터 모델

### 1.1 크론 동작 변경

**Before (v1)**:
```
ad_creative_embeddings WHERE lp_url IS NOT NULL AND lp_screenshot_url IS NULL
→ Railway /crawl/batch (단일 뷰포트)
→ Storage: creatives/lp-screenshots/{adId}/main.png
→ ad_creative_embeddings UPDATE
```

**After (v2)**:
```
landing_pages WHERE is_active = true
  AND (last_crawled_at IS NULL OR last_crawled_at < now() - 7 days)
→ Railway /crawl/batch (듀얼 뷰포트: mobile + desktop)
→ Storage: creatives/lp/{account_id}/{lp_id}/{viewport}_full.jpg
→ lp_snapshots UPSERT (viewport별)
→ landing_pages UPDATE (content_hash, last_crawled_at)
→ content_hash 변경 시만 재분석 트리거
```

### 1.2 저장 구조

**lp_snapshots 저장 (viewport당 1행)**:
```json
{
  "lp_id": "uuid",
  "viewport": "mobile",
  "screenshot_url": "creatives/lp/{account_id}/{lp_id}/mobile_full.jpg",
  "cta_screenshot_url": "creatives/lp/{account_id}/{lp_id}/mobile_cta.jpg",
  "screenshot_hash": "sha256...",
  "section_screenshots": {
    "hero": "creatives/lp/{account_id}/{lp_id}/mobile_hero.jpg",
    "detail": "creatives/lp/{account_id}/{lp_id}/mobile_detail.jpg",
    "review": "creatives/lp/{account_id}/{lp_id}/mobile_review.jpg",
    "cta": "creatives/lp/{account_id}/{lp_id}/mobile_cta.jpg"
  },
  "crawled_at": "2026-03-22T...",
  "crawler_version": "v2-cron"
}
```

### 1.3 URL 필터링 (자동 비활성화)

v1 로직을 v2 크론에 통합:
```
facebook.com/canvas_doc/* → is_active = false
naver.com, google.com → is_active = false
mkt.shopping.naver.com → is_active = false
(이미 validate-lp-crawl.mjs에서 구현됨)
```

---

## 2. API 설계

### 2.1 route.ts v2 (크론 엔드포인트)

```
GET /api/cron/crawl-lps
Authorization: Bearer {CRON_SECRET}

동작:
1. landing_pages 조회:
   WHERE is_active = true
   AND (last_crawled_at IS NULL OR last_crawled_at < now() - interval '7 days')
   ORDER BY last_crawled_at NULLS FIRST
   LIMIT 10

2. 각 LP에 대해:
   a. Railway /crawl/batch 호출 (mobile 뷰포트)
   b. 스크린샷 → Storage (ADR-001 경로)
   c. content_hash 계산 (sha256)
   d. lp_snapshots UPSERT (on conflict: lp_id, viewport)
   e. landing_pages UPDATE (content_hash, last_crawled_at)
   f. hash 변경 시 → 재분석 플래그

3. 응답:
   { crawled: N, skipped: M, errors: E, hashChanged: C }
```

### 2.2 railway-crawler.ts 확장

```typescript
// 기존 함수 유지
export async function crawlSingle(url: string): Promise<CrawlResult | null>
export async function crawlBatch(urls: string[]): Promise<CrawlResult[]>

// 신규 추가
export interface CrawlV2Options {
  viewport: 'mobile' | 'desktop';
  sections?: boolean;  // hero, detail, review, cta 섹션 캡처
}

export interface CrawlV2Result {
  url: string;
  screenshot: string;       // base64 fullpage
  ctaScreenshot?: string;   // base64 CTA
  sections?: Record<string, string>;  // {hero, detail, review, cta} base64
  screenshotHash: string;
  text: { headline?: string; price?: string; description?: string };
  error?: string;
}

export async function crawlV2(url: string, options: CrawlV2Options): Promise<CrawlV2Result | null>
```

**Railway 엔드포인트**: 기존 `/crawl/batch`를 그대로 사용하되, viewport 파라미터 전달.
Railway Playwright 서비스(bscamp-crawler)가 이미 뷰포트 지원하므로 클라이언트만 확장.

---

## 3. 컴포넌트 구조

### 3.1 변경 파일

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `src/app/api/cron/crawl-lps/route.ts` | **전면 재작성** | landing_pages 기준, ADR-001 경로, lp_snapshots 저장 |
| `src/lib/railway-crawler.ts` | **확장** | crawlV2() 추가. crawlSingle/crawlBatch 유지 |
| `scripts/migrate-lp-screenshots-v2.mjs` | **신규** | 기존 lp-screenshots/ → lp/{account_id}/{lp_id}/ 이전 |

### 3.2 기존 서비스 영향

| 영향받는 코드 | 이행 전략 |
|-------------|----------|
| `creatives/page.tsx:413,420` (lp_screenshot_url) | **v1 유지** — ad_creative_embeddings.lp_screenshot_url 그대로 참조 |
| `ad-creative-embedder.ts:128,242` (lp-screenshots/) | **v1 유지** — embedCreative()의 LP 크롤링은 그대로 |
| `creative/[id]/route.ts:32` (lp_screenshot_url) | **v1 유지** |

핵심 원칙: **v1 UI는 건드리지 않음.** v2 크론은 landing_pages + lp_snapshots에 저장하고, v2 UI는 별도 LP 상세 페이지에서 lp_snapshots 사용.

---

## 4. 에러 처리

| 상황 | 처리 |
|------|------|
| Railway 연결 실패 | 스킵 + 에러 로그, 다음 LP 진행 |
| 스크린샷 타임아웃 (60초) | 스킵 + landing_pages.last_crawled_at 미갱신 (다음 크론에서 재시도) |
| Storage 업로드 실패 | 에러 로그 + lp_snapshots 저장 스킵 |
| landing_pages 0건 | 즉시 종료 (정상 — 모두 크롤링 완료) |
| canvas_doc URL 발견 | is_active = false 처리 |
| 동일 hash (변경 없음) | lp_snapshots UPDATE만 (스크린샷 재업로드 안 함), last_crawled_at 갱신 |

---

## 5. 구현 순서

### Phase A: railway-crawler.ts 확장 (30분)

- [ ] CrawlV2Options, CrawlV2Result 인터페이스 추가
- [ ] crawlV2() 함수 구현 (기존 Railway /crawl/batch에 viewport 파라미터 전달)
- [ ] 기존 crawlSingle/crawlBatch 함수 무변경

### Phase B: route.ts v2 재작성 (2시간)

- [ ] landing_pages 조회 (is_active + last_crawled_at 기준)
- [ ] 각 LP: crawlV2() 호출 (mobile 뷰포트)
- [ ] 스크린샷 → Storage 업로드 (ADR-001 경로)
- [ ] content_hash 계산 (sha256)
- [ ] lp_snapshots UPSERT
- [ ] landing_pages UPDATE (content_hash, last_crawled_at)
- [ ] hash 변경 감지 로직
- [ ] 에러 처리 + 통계 응답

### Phase C: 마이그레이션 스크립트 (1시간)

- [ ] `scripts/migrate-lp-screenshots-v2.mjs` 작성
- [ ] ad_creative_embeddings.lp_screenshot_url 조회
- [ ] 기존 경로 → 신규 경로 매핑 (ad_id → creatives.lp_id → landing_pages.account_id)
- [ ] Storage 복사 (기존 파일 유지, 신규 경로에 복사)
- [ ] lp_snapshots INSERT (기존 데이터 기반)

### Phase D: 빌드 검증

- [ ] `npx tsc --noEmit --quiet` 통과
- [ ] `npm run build` 통과
- [ ] 기존 creatives/page.tsx LP 스크린샷 표시 정상 (v1 무영향)

---

> 설계서 작성 완료.
