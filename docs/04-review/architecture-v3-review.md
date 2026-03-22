# Architecture v3 기획서 vs 현재 코드 — Gap 분석 리뷰

> 작성일: 2026-03-21
> 기획서: mozzi-reports.vercel.app/reports/plan/2026-03-21-analysis-architecture-v3.html
> 리뷰어: Leader (코드리뷰)

---

## 1. 수집 파이프라인

### 기획서 요구사항

| 크론 | 주기 | 대상 | 저장 |
|------|------|------|------|
| collect-daily | 매일 03:00 | 40개 활성 계정, Meta `/act_{id}/ads` | creatives + creative_media + landing_pages + daily_ad_insights |
| collect-benchmarks | 매주 화 02:00 | impressions≥3500 | ad_insights_classified → benchmarks (117+ 포인트) |
| analyze-competitors | 매일 23:00 | 62개 브랜드 | competitor_monitors → competitor_ad_cache |

기획서 핵심:
- collect-daily에 **미디어 다운로드** + **임베딩 생성** + **5축 분석** 통합
- embed-creatives 크론은 **collect-daily에 흡수** (역할 중복 제거)
- crawl-lps는 **landing_pages(lp_id) 기준**으로 전환 (ad_id 기준 → 중복 크롤링 제거)
- effective_object_story_spec에서 LP URL 추출

### 현재 코드 상태

| 파일 | 상태 | 비고 |
|------|------|------|
| `collect-daily/route.ts` (705줄) | **부분 구현** | v1 ad_creative_embeddings + v2 creatives/creative_media/landing_pages UPSERT. 미디어 다운로드/임베딩 미포함 |
| `embed-creatives/route.ts` (176줄) | **v1 그대로** | ad_creative_embeddings 대상. v2 creative_media 미참조 |
| `crawl-lps/route.ts` (291줄) | **v1 그대로** | ad_creative_embeddings.lp_url 기반, ad_id별 크롤링. Storage: `lp-screenshots/{ad_id}/` |
| `collect-benchmarks/route.ts` (664줄) | **구현 완료** | 기획서와 일치 |
| `analyze-competitors/route.ts` (396줄) | **구현 완료** | 기획서와 일치 |
| `download-videos.mjs` (462줄) | **별도 스크립트** | collect-daily에 미통합 |
| `migrate-image-storage-paths.mjs` (217줄) | **실행 완료** | 일회성 마이그레이션 |

### Gap 상세

| # | Gap | 심각도 | 설명 |
|---|-----|--------|------|
| C-1 | embed-creatives v2 미전환 | **High** | 현재 ad_creative_embeddings 대상. v2 creative_media.embedding/text_embedding에도 저장해야 함 |
| C-2 | crawl-lps v2 미전환 | **High** | ad_id 기반 크롤링 → landing_pages.id 기준으로 전환 필요. 같은 LP 10회 크롤링 낭비 |
| C-3 | crawl-lps Storage 경로 ADR-001 미준수 | **High** | 현재: `lp-screenshots/{ad_id}/main.png`. 기획서: `lp/{account_id}/{lp_id}/mobile_full.png` |
| C-4 | 미디어 다운로드 별도 스크립트 | **Medium** | 기획서는 collect-daily 통합. 현재는 download-videos.mjs + migrate-image-storage-paths.mjs 별도 실행 |
| C-5 | effective_object_story_spec LP 추출 | **구현 완료** | route.ts:83-89 extractLpUrl() ✅ |
| C-6 | v2 UPSERT FK 순서 | **구현 완료** | landing_pages → creatives → creative_media ✅ |
| C-7 | creative_media.storage_url 누락 | **수정 완료** | 이번 세션에서 route.ts 수정 + 2,732건 백필 완료 ✅ |

### 구현 가능성 평가

- **C-1 (embed-creatives v2)**: 난이도 **중**. embedCreative() 함수가 ad_creative_embeddings에 직접 UPSERT. creative_media에도 병렬 UPSERT 추가하면 됨. 약 2-3시간.
- **C-2 (crawl-lps v2)**: 난이도 **상**. 전체 재설계 필요. landing_pages 테이블 기준 크롤링 + lp_snapshots 저장 + content_hash 변경감지. 약 6-8시간.
- **C-3 (Storage 경로)**: C-2와 함께 처리. landing_pages.id 기준 경로 패턴 적용.
- **C-4 (미디어 다운로드 통합)**: 난이도 **상**. collect-daily에 이미지/영상 다운로드 추가 시 실행 시간 급증 (현재 5분 제한). 별도 큐/워커 필요할 수 있음.

---

## 2. 저장 구조 (DB + Storage)

### 기획서 요구사항 vs 현재 DB

#### creative_media

| 컬럼 | 기획서 | 현재 v2 | 상태 |
|------|--------|---------|------|
| id (UUID PK) | ✅ | ✅ | 일치 |
| creative_id (FK → creatives) | ✅ | ✅ UNIQUE | 일치 |
| ad_id (VARCHAR UNIQUE) | ✅ | ❌ 없음 (creatives.ad_id로 간접) | **Gap** |
| account_id (FK → ad_accounts) | ✅ | ❌ 없음 (creatives.account_id로 간접) | **Gap** |
| media_type | ✅ | ✅ | 일치 |
| media_url | ✅ | ✅ | 일치 |
| storage_url | ✅ | ✅ (백필 완료) | 일치 |
| ad_copy | ✅ | ✅ | 일치 |
| embedding (3072) | ✅ | ✅ | 일치 |
| text_embedding (3072) | ✅ | ✅ | 일치 |
| analysis_json (JSONB) | ✅ | ✅ (ALTER 완료) | 일치 |
| saliency_url | ✅ | ❌ 없음 | **Gap** |
| is_active | ✅ | ❌ 없음 | **Gap** |
| updated_at + trigger | ✅ | ❌ 없음 | **Gap** |

#### landing_pages

| 컬럼 | 기획서 | 현재 v2 | 상태 |
|------|--------|---------|------|
| id, canonical_url, account_id | ✅ | ✅ | 일치 |
| domain | ✅ | ✅ | 일치 |
| content_hash (변경 감지) | ✅ | ❌ 없음 | **Gap** |
| last_crawled_at | ✅ | ❌ 없음 | **Gap** |
| is_active | ✅ | ❌ 없음 | **Gap** |

#### lp_analysis

| 항목 | 기획서 | 현재 v2 | 상태 |
|------|--------|---------|------|
| 구조 | `reference_based` JSONB + `data_based` JSONB | flat columns (hero_type, price_position, ...) | **구조 불일치** |
| 레퍼런스 8개 카테고리 | 페이지구조/가격전략/소셜프루프/긴급성/CTA/신뢰/전환심리/모바일UX | 일부만 (hero_type, cta_type, review_type 등) | **Gap** |
| 데이터 기반 분석 | conversion_rate, benchmark_percentile, element_correlation | 완전 부재 | **Gap** |
| embedding (3072) | ✅ | ✅ | 일치 |

#### creative_lp_map

| 항목 | 기획서 | 현재 v2 | 상태 |
|------|--------|---------|------|
| 점수 컬럼 | message_alignment, visual_consistency, cta_alignment, offer_alignment, overall_score | visual_score, semantic_score, holistic_score, total_score | **컬럼 불일치** |
| issues JSONB | ✅ (type/severity/description/action) | ❌ 없음 | **Gap** |

### Storage 경로 비교

| 유형 | 기획서 | 현재 | 상태 |
|------|--------|------|------|
| 이미지 | `creatives/{account_id}/media/{ad_id}.jpg` | `creatives/{account_id}/media/{ad_id}.jpg` | **일치** ✅ |
| 영상 | `creatives/{account_id}/video/{ad_id}.mp4` | `creatives/{account_id}/video/{ad_id}.mp4` | **일치** ✅ |
| 영상 썸네일 | `creatives/{account_id}/thumb/{ad_id}.jpg` | 미구현 | **Gap** |
| LP 모바일 풀 | `lp/{account_id}/{lp_id}/mobile_full.png` | `lp-screenshots/{ad_id}/main.png` | **불일치** |
| LP 섹션별 | `lp/{account_id}/{lp_id}/mobile_hero.png` 등 | 미구현 | **Gap** |
| 시선 히트맵 | `saliency/{account_id}/{ad_id}.png` | `saliency/{account_id}/{ad_id}.png` | **일치** ✅ |

### Gap 요약

| # | Gap | 심각도 | 해결 방법 |
|---|-----|--------|----------|
| S-1 | creative_media에 saliency_url 없음 | Medium | ALTER TABLE ADD COLUMN |
| S-2 | creative_media에 is_active, updated_at 없음 | Medium | ALTER TABLE + trigger |
| S-3 | landing_pages에 content_hash, last_crawled_at, is_active 없음 | High | ALTER TABLE (crawl-lps v2 전제 조건) |
| S-4 | lp_analysis 2축 구조 불일치 | High | 마이그레이션 또는 신규 JSONB 컬럼 추가 |
| S-5 | creative_lp_map 컬럼 불일치 | Medium | 컬럼 rename/추가 (데이터 30건이라 마이그레이션 부담 적음) |
| S-6 | LP Storage 경로 ADR-001 불일치 | High | crawl-lps v2와 함께 처리 |

---

## 3. 분석 파이프라인

### 기획서 요구사항

**이미지 4축**: Visual, Text, Psychology, Quality → Gemini 3.1 Pro Preview
**영상 5축**: + Audio, Eye Tracking → Gemini 3.1 Pro Preview
**시선**: 이미지 = DeepGaze IIE, 영상 = Gemini 추론
**통합 저장**: creative_media.analysis_json 단일 JSONB
**점수**: overall, visual_impact, message_clarity, cta_effectiveness
**Andromeda**: visual/text/audio/structure fingerprint + PDA

### 현재 코드 상태

| 레이어 | 파일 | 테이블 | 모델 | 상태 |
|--------|------|--------|------|------|
| L1 요소 태깅 | `services/creative-pipeline/analyze.mjs` | creative_element_analysis | Gemini 2.5 Pro | **가동 중** |
| L2 시선 예측 | `services/creative-pipeline/saliency/predict.py` | creative_saliency | DeepGaze IIE | **가동 중** |
| L3 요소 성과 | `services/creative-pipeline/benchmark.mjs` | creative_element_performance | 통계 집계 | **가동 중** |
| L4 종합 점수 | `services/creative-pipeline/score.mjs` | creative_intelligence_scores | Gemini 2.5 Pro | **가동 중** |
| 5축 통합 | `scripts/analyze-five-axis.mjs` | creative_media.analysis_json | Gemini 3.1 Pro Preview | **작성됨 (미커밋)** |

### Gap 상세

| # | Gap | 심각도 | 설명 |
|---|-----|--------|------|
| A-1 | L1 스키마 ≠ 기획서 4축 | **High** | 현재 L1: format/hook/product/human/text/color/style/social/cta. 기획서: Visual/Text/Psychology/Quality 4축. Psychology(emotion, trigger, offer, urgency) + Quality(production, readability, fatigue) 축 누락 |
| A-2 | 5축 스크립트 스키마 ≠ 기획서 | **High** | analyze-five-axis.mjs: hook/product/color/text/composition. 기획서: visual/text/psychology/quality + audio/eye_tracking. 완전히 다른 구조 |
| A-3 | 분석 결과 저장 위치 분산 | **Medium** | L1→creative_element_analysis, L2→creative_saliency, L4→creative_intelligence_scores. 기획서는 analysis_json 하나로 통합 |
| A-4 | 영상 시선 추론 미구현 | **Medium** | 기획서: Gemini로 프레임별 fixation 예측 → analysis_json.eye_tracking. 현재: 이미지 DeepGaze만 |
| A-5 | Andromeda 호환 신호 미구현 | **Medium** | visual/text/audio/structure fingerprint + PDA(persona/desire/awareness). 완전 신규 기능 |
| A-6 | Scores 구조 불일치 | **Low** | 기획서: overall/visual_impact/message_clarity/cta_effectiveness/suggestions. 현재 L4: element_score/performance_score/consistency_score/overall_score |
| A-7 | 모델 버전 차이 | **Low** | 현재 L1: gemini-2.5-pro. 기획서: gemini-3.1-pro-preview. 모델 교체는 단순 |

### 현재 L1/L2/L4와 기획서 통합 방향

기획서의 의도는 **L1/L2/L4를 폐기하고 analysis_json으로 통합**하는 것:

```
현재 (분산):
  creative_element_analysis (L1) — 별도 테이블
  creative_saliency (L2) — 별도 테이블
  creative_intelligence_scores (L4) — 별도 테이블

기획서 (통합):
  creative_media.analysis_json = {
    visual: {...},      // L1 대체
    text: {...},        // L1 대체
    psychology: {...},  // 신규
    quality: {...},     // 신규
    audio: {...},       // 영상만, 신규
    eye_tracking: {...}, // L2 대체 (영상만)
    scores: {...},      // L4 대체
    andromeda_signals: {...} // 신규
  }
  creative_media.saliency_url  // L2 이미지 히트맵 (DeepGaze)
```

### 변경 필요한 코드

| 코드 | 변경 유형 | 설명 |
|------|----------|------|
| `analyze-five-axis.mjs` | **대폭 수정** | 기획서 스키마로 프롬프트 재설계 (4축→Psychology/Quality 추가) |
| `services/creative-pipeline/analyze.mjs` | **deprecated** | L1 → analysis_json.visual + text로 대체 |
| `services/creative-pipeline/score.mjs` | **deprecated** | L4 → analysis_json.scores로 대체 |
| `services/creative-pipeline/saliency/predict.py` | **유지** | DeepGaze 이미지 시선은 그대로. saliency_url 컬럼만 creative_media에 추가 |
| `services/creative-pipeline/benchmark.mjs` | **유지** | L3 요소 성과 집계는 기획서에도 있음 (클러스터링 → 성과 집계) |

### 신규 개발 필요

| 기능 | 난이도 | 설명 |
|------|--------|------|
| Psychology 축 프롬프트 | Medium | emotion, trigger, offer, urgency, social_proof |
| Quality 축 프롬프트 | Medium | production_quality, readability, fatigue_risk |
| 영상 Audio 축 | Medium | Gemini 3.1 Pro로 음성 분석 (narration, bgm, sfx) |
| 영상 Eye Tracking | High | 프레임별 fixation 예측 (Gemini 추론) + Canvas 렌더링 |
| Andromeda 신호 | Medium | fingerprint + PDA 분류 |
| Canvas 오버레이 UI | Medium | 영상 재생 + 시선 히트맵 실시간 렌더링 |

---

## 4. LP 분석

### 기획서 요구사항

**2축 분석:**
1. **레퍼런스 기반** (8개 카테고리): 페이지구조, 가격전략, 소셜프루프, 긴급성/희소성, CTA구조, 신뢰요소, 전환심리, 모바일UX
2. **데이터 기반**: LP 요소 × 전환율 교차분석, benchmark_percentile, element_correlation

**크롤링:**
- landing_pages 기준 (lp_id), 중복 크롤링 제거
- 듀얼 뷰포트 (375×812, 1280×800)
- 섹션별 캡처 (hero, detail, review, CTA)
- content_hash 변경 감지
- 자동 비활성화 (fb.com/canvas, naver.com 등)

### 현재 코드 상태

| 항목 | 현재 | 기획서 | Gap |
|------|------|--------|-----|
| 크롤링 기준 | ad_id (ad_creative_embeddings) | lp_id (landing_pages) | **전면 재설계** |
| 크롤링 도구 | Railway Playwright (crawlBatch) | Railway Playwright | 일치 |
| 뷰포트 | 모바일만 (main + cta 2장) | 듀얼 (모바일 + PC, 각 5장) | **Gap** |
| Storage 경로 | `lp-screenshots/{ad_id}/main.png` | `lp/{account_id}/{lp_id}/mobile_full.png` | **ADR-001 불일치** |
| 변경 감지 | screenshot_hash (ad_creative_embeddings) | content_hash (landing_pages) | **위치 불일치** |
| 자동 비활성화 | 없음 | fb.com/canvas, naver.com 필터 | **Gap** |
| 분석 구조 | flat columns (hero_type, cta_type...) | 2축 JSONB (reference_based, data_based) | **구조 불일치** |
| 전환율 교차분석 | 없음 | LP 요소별 전환율 impact_delta | **완전 신규** |

### 변경 필요한 코드

| 코드 | 변경 | 설명 |
|------|------|------|
| `crawl-lps/route.ts` (291줄) | **전면 재설계** | landing_pages 기준 크롤링, 듀얼 뷰포트, 섹션별 캡처, ADR-001 경로 |
| `railway-crawler.ts` (122줄) | **확장** | 듀얼 뷰포트 + 섹션 캡처 응답 구조 변경 |
| Railway Playwright 서비스 | **확장** | /crawl 엔드포인트에 viewport, sections 파라미터 추가 |
| `lp-normalizer.ts` (92줄) | **유지** | URL 정규화 + 분류 그대로 사용 가능 |
| LP 분석 스크립트 | **신규** | Gemini 3.1 Pro로 8개 카테고리 레퍼런스 분석 |
| LP 교차분석 | **신규** | daily_ad_insights + lp_analysis JOIN → element_correlation 계산 |

### 난이도 평가

crawl-lps v2 전환이 **이 기획서에서 가장 큰 작업**:
- Railway 서비스 수정 필요 (듀얼 뷰포트 + 섹션 캡처)
- landing_pages에 content_hash/last_crawled_at 추가
- Storage 경로 전면 변경 + 기존 데이터 마이그레이션
- 크롤링 로직 재설계 (ad_id → lp_id)
- LP 분석 2축 구조 재설계

예상 작업량: **3-5일** (PDCA 포함)

---

## 5. 전체 구현 난이도 + 예상 작업량 + 리스크

### 구현 우선순위 매트릭스

| 작업 | 난이도 | 작업량 | 의존성 | 우선순위 |
|------|--------|--------|--------|----------|
| **DB 컬럼 추가** (S-1~S-3) | Low | 1시간 | 없음 | **P0** |
| **5축 분석 프롬프트 재설계** (A-1~A-2) | Medium | 4시간 | DB 컬럼 | **P1** |
| **embed-creatives v2** (C-1) | Medium | 3시간 | 없음 | **P1** |
| **crawl-lps v2 전환** (C-2, C-3, S-6) | High | 3-5일 | Railway 서비스 수정 | **P2** |
| **lp_analysis 2축 구조** (S-4) | High | 1일 | crawl-lps v2 | **P2** |
| **creative_lp_map 리뉴얼** (S-5) | Medium | 4시간 | lp_analysis 2축 | **P3** |
| **영상 Audio 축** (A-4 일부) | Medium | 4시간 | 5축 프롬프트 | **P3** |
| **영상 Eye Tracking** (A-4) | High | 1일 | Gemini + Canvas UI | **P3** |
| **Andromeda 신호** (A-5) | Medium | 4시간 | 5축 분석 | **P4** |
| **LP 교차분석** (데이터 기반) | High | 2일 | crawl-lps v2 + 충분한 데이터 | **P4** |
| **미디어 다운로드 통합** (C-4) | High | 1일 | 큐 시스템 검토 | **P5** |

### 총 예상 작업량

| Tier | 범위 | 작업량 |
|------|------|--------|
| **Tier 0** (즉시) | DB 컬럼 추가 + 기존 마이그레이션 | 1-2시간 |
| **Tier 1** (이번 주) | 5축 프롬프트 재설계 + embed-creatives v2 | 1일 |
| **Tier 2** (다음 주) | crawl-lps v2 + LP 2축 분석 | 3-5일 |
| **Tier 3** (이후) | 영상 Audio/Eye Tracking + Andromeda + 교차분석 | 3-5일 |
| **합계** | | **8-13일** |

### 리스크

| # | 리스크 | 영향 | 대응 |
|---|--------|------|------|
| R-1 | **Vercel 5분 실행 제한** | collect-daily에 미디어 다운로드 + 임베딩 + 분석 통합 시 시간 초과 | 별도 큐/워커 또는 Railway 위임 |
| R-2 | **Gemini 3.1 Pro Preview 가용성** | 모델이 preview 상태라 API 변경/중단 가능 | gemini-2.5-pro 폴백 준비 |
| R-3 | **Railway 서비스 수정** | crawl-lps v2에 듀얼 뷰포트 + 섹션 캡처 추가 시 Railway 배포 필요 | Railway Dockerfile 수정 + 배포 파이프라인 확인 |
| R-4 | **LP 데이터 부족** | 데이터 기반 교차분석에 최소 30+ LP × 30일 성과 필요 | 레퍼런스 기반 먼저 구현, 데이터 기반은 데이터 축적 후 |
| R-5 | **L1/L2/L4 → analysis_json 전환 기간** | 기존 L1/L2/L4 테이블 참조 코드 (프론트엔드, 진단 엔진) 전부 수정 필요 | 이행기간 동안 양쪽 유지 (deprecated 마킹) |
| R-6 | **analysis_json 스키마 확정** | 기획서 스키마와 현재 5축 스크립트 스키마가 다름 — 확정 전 분석 실행하면 재작업 | **스키마 확정 후 분석 배치 실행** |

### 권장 실행 순서

```
Week 1: 기반 정비
├─ P0: DB 컬럼 추가 (creative_media.saliency_url/is_active/updated_at, landing_pages.content_hash/last_crawled_at)
├─ P1: analysis_json 스키마 확정 (기획서 기준, 모찌님 리뷰)
├─ P1: 5축 프롬프트 재설계 → analyze-five-axis.mjs 수정
└─ P1: embed-creatives v2 전환

Week 2: LP 파이프라인
├─ P2: Railway 서비스 수정 (듀얼 뷰포트 + 섹션 캡처)
├─ P2: crawl-lps v2 재설계 (landing_pages 기준)
├─ P2: LP Storage 경로 마이그레이션
└─ P2: lp_analysis 2축 구조 전환

Week 3: 강화 기능
├─ P3: creative_lp_map 리뉴얼
├─ P3: 영상 Audio 축
├─ P3: 영상 Eye Tracking + Canvas
└─ P4: Andromeda 신호
```

---

## 부록: 파일별 변경 영향도

| 파일 | 변경 유형 | 이유 |
|------|----------|------|
| `src/app/api/cron/collect-daily/route.ts` | 유지 | v2 UPSERT 이미 완료 |
| `src/app/api/cron/embed-creatives/route.ts` | **수정** | creative_media에도 임베딩 저장 |
| `src/app/api/cron/crawl-lps/route.ts` | **전면 재설계** | landing_pages 기준 + 듀얼 뷰포트 |
| `src/lib/railway-crawler.ts` | **확장** | 새 크롤링 응답 구조 |
| `src/lib/lp-normalizer.ts` | 유지 | 그대로 사용 가능 |
| `src/lib/ad-creative-embedder.ts` | **수정** | creative_media 임베딩 업데이트 추가 |
| `services/creative-pipeline/analyze.mjs` | **deprecated** | analysis_json으로 대체 |
| `services/creative-pipeline/score.mjs` | **deprecated** | analysis_json.scores로 대체 |
| `services/creative-pipeline/saliency/predict.py` | 유지 | creative_media.saliency_url만 연결 |
| `scripts/analyze-five-axis.mjs` | **대폭 수정** | 기획서 스키마 반영 |
| `supabase/migrations/` | **신규** | 컬럼 추가 마이그레이션 |
