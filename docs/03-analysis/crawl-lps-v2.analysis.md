# crawl-lps v2 전환 Gap 분석

> 분석일: 2026-03-22
> 설계서: docs/02-design/features/crawl-lps-v2.design.md
> TASK: T4 (architecture-v3-execution-plan.md)

---

## Match Rate: 95%

---

## 일치 항목 (19/20)

### 1. 데이터 모델
| 항목 | 설계 | 구현 | 일치 |
|------|------|------|:----:|
| 데이터 소스 전환 | ad_creative_embeddings → landing_pages | landing_pages 조회 (route.ts:76-82) | ✅ |
| 조회 조건 | is_active=true, last_crawled_at NULL or 7일 경과 | `.eq("is_active", true).or(...)` (route.ts:79-80) | ✅ |
| 정렬 | ORDER BY last_crawled_at NULLS FIRST | `.order("last_crawled_at", { ascending: true, nullsFirst: true })` (route.ts:81) | ✅ |
| LIMIT | 10 | `.limit(10)` (route.ts:82) | ✅ |
| Storage 경로 | creatives/lp/{account_id}/{lp_id}/{viewport}_full.jpg | `lp/${account_id}/${lp_id}/mobile_full.jpg` (route.ts:135) | ✅ |
| lp_snapshots UPSERT | on conflict: lp_id, viewport | `.upsert({...}, { onConflict: "lp_id,viewport" })` (route.ts:166-181) | ✅ |
| landing_pages UPDATE | content_hash, last_crawled_at | 갱신 (route.ts:192-199) | ✅ |
| content_hash 계산 | sha256 | `createHash("sha256").update(base64Data).digest("hex")` (route.ts:41-43) | ✅ |
| hash 변경 감지 | 변경 시만 재분석 | `hashChanged` 플래그 + 변경 시만 업로드 (route.ts:133) | ✅ |

### 2. API 설계
| 항목 | 설계 | 구현 | 일치 |
|------|------|------|:----:|
| 인증 | Bearer CRON_SECRET | `verifyCron()` (route.ts:34-39) | ✅ |
| CrawlV2Options | viewport, sections | 인터페이스 정의 (railway-crawler.ts:80-83) | ✅ |
| CrawlV2Result | url, screenshot, ctaScreenshot, sections, screenshotHash, text, error | 인터페이스 정의 (railway-crawler.ts:85-93) | ✅ |
| crawlV2() | 단건 크롤링 + viewport 전달 | Railway /crawl 호출, viewport 파라미터 전달 (railway-crawler.ts:97-157) | ✅ |
| crawlSingle/crawlBatch 유지 | 무변경 | 기존 함수 완전 보존 | ✅ |
| 응답 형식 | { crawled, skipped, errors, hashChanged } | `stats` 객체 (route.ts:62-67, 217-221) | ✅ |

### 3. URL 필터링
| 항목 | 설계 | 구현 | 일치 |
|------|------|------|:----:|
| 차단 패턴 | facebook.com/canvas_doc, naver.com, google.com, mkt.shopping.naver.com | `BLOCKED_URL_PATTERNS` (route.ts:17-22) → is_active=false (route.ts:107-113) | ✅ |

### 4. 에러 처리
| 항목 | 설계 | 구현 | 일치 |
|------|------|------|:----:|
| Railway 실패 | 스킵 + 에러 로그 | `crawlResult` null 시 스킵 + errorMessages push (route.ts:122-127) | ✅ |
| Storage 실패 | 에러 로그 + lp_snapshots 스킵 | `uploadOk=false` 시 continue (route.ts:142-147) | ✅ |
| 0건 | 즉시 종료 | 빈 응답 반환 (route.ts:91-96) | ✅ |

### 5. 마이그레이션 스크립트
| 항목 | 설계 | 구현 | 일치 |
|------|------|------|:----:|
| 매핑 체인 | ad_id → creatives.lp_id → landing_pages.account_id | `sbGet()` + `adToCreative` Map (migrate-lp-screenshots-v2.mjs:77-101) | ✅ |
| Storage 복사 | 기존 유지, 신규 경로 복사 | download → upload (기존 삭제 안 함) (migrate-lp-screenshots-v2.mjs:160-213) | ✅ |
| lp_snapshots INSERT | crawler_version 구분 | `"v1-migrated"` (migrate-lp-screenshots-v2.mjs:229) | ✅ |

---

## 불일치 항목 (1/20)

### 엔드포인트 선택 — /crawl vs /crawl/batch
- **설계**: "기존 `/crawl/batch`를 그대로 사용하되, viewport 파라미터 전달"
- **구현**: `/crawl` 단건 엔드포인트 호출 (railway-crawler.ts:106)
- **사유**: crawlV2()는 LP별 단건 처리 흐름. 배치 API는 URL 배열을 받는 구조로, 개별 LP에 대해 viewport/sections 옵션을 다르게 전달해야 할 수 있어 단건이 적합.
- **영향**: 없음 (동일 Railway 서버, 동일 Playwright 인스턴스)
- **판정**: 구현이 더 적합. 설계서 업데이트 권장.

---

## 빌드 검증

- `npx tsc --noEmit` — ✅ 에러 0
- `npm run build` — ✅ 성공

---

## v1 무영향 확인

| 기존 코드 | 영향 |
|-----------|------|
| creatives/page.tsx (lp_screenshot_url) | ✅ 무영향 — ad_creative_embeddings 참조 유지 |
| ad-creative-embedder.ts (lp-screenshots/) | ✅ 무영향 — 미수정 |
| creative/[id]/route.ts (lp_screenshot_url) | ✅ 무영향 — 미수정 |

---

## 변경 파일 요약

| 파일 | 변경 유형 | 줄 수 |
|------|----------|------|
| `src/lib/railway-crawler.ts` | 확장 (+80줄) | 122→204 |
| `src/app/api/cron/crawl-lps/route.ts` | 전면 재작성 | 292→262 |
| `scripts/migrate-lp-screenshots-v2.mjs` | 신규 | 265줄 |

---

> Gap 분석 완료. Match Rate 95%.
