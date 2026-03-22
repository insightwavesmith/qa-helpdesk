# Architecture v3 실행 플랜

> 작성일: 2026-03-21 (v2: 보완 8건 반영)
> 근거: docs/04-review/architecture-v3-review.md (Gap 분석)
> 원칙: 기존 서비스 무중단. v1 테이블/크론 유지하면서 v2 병렬 구축 → 검증 후 전환.

---

## 의존관계 다이어그램

```
T1 (DB 컬럼) ─────────────────────────────────────────────────┐
  │                                                            │
  ├── T2 (5축 스키마 확정 + 프롬프트)                            │
  │     │  ├─ T2-A: 속성값 3단계 (자유태깅→클러스터→확정)         │
  │     │  ├─ T2-B: fatigue_risk 계산                           │
  │     │  └─ T2-C: scores 점수 기준 (벤치마크 상대값)            │
  │     ├── T6 (영상 Audio 축)                                  │
  │     ├── T7 (영상 Eye Tracking + Canvas)                     │
  │     ├── T8 (Andromeda 신호 + 유사도 60% 계산)               │
  │     └── T11 (경쟁사 9,553건 5축 분석)                       │
  │                                                            │
  ├── T3 (embed-creatives v2 듀얼 라이트)                       │
  │                                                            │
  └── T4 (crawl-lps v2)                                        │
        ├── T5 (lp_analysis 2축 구조)                           │
        │     └── T9 (creative_lp_map 리뉴얼) ←────────────────┘
        │           └── T10 (LP 교차분석 + 전환율 추정)
        └── (기존 LP 스크린샷 마이그레이션)

자동화 체인 (T2 완료 후):
  collect-daily 03:00 → embed-creatives 07:00 → analyze 08:00 (신규 크론)
```

---

## T1: DB 스키마 보강 (P0)

**이게 뭔지**: v3 기획서에서 요구하는 누락 컬럼/트리거를 v2 테이블에 추가
**왜 필요한지**: T2~T10 전부 이 컬럼들이 전제 조건. 없으면 시작 불가.
**의존성**: 없음 (독립 실행)
**예상 작업량**: 1시간

### 구현 내용

**신규 마이그레이션 파일**: `supabase/migrations/20260322_v3_schema_additions.sql`

```sql
-- creative_media 보강
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS saliency_url text;
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TRIGGER update_creative_media_updated_at
  BEFORE UPDATE ON creative_media
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- landing_pages 보강
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS last_crawled_at timestamptz;
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- creative_lp_map 보강 (기존 데이터 30건, 리스크 낮음)
ALTER TABLE creative_lp_map ADD COLUMN IF NOT EXISTS message_alignment float;
ALTER TABLE creative_lp_map ADD COLUMN IF NOT EXISTS cta_alignment float;
ALTER TABLE creative_lp_map ADD COLUMN IF NOT EXISTS offer_alignment float;
ALTER TABLE creative_lp_map ADD COLUMN IF NOT EXISTS overall_score float;
ALTER TABLE creative_lp_map ADD COLUMN IF NOT EXISTS issues jsonb;

-- lp_analysis 보강 (기존 flat 컬럼 유지 + 신규 JSONB 병행)
ALTER TABLE lp_analysis ADD COLUMN IF NOT EXISTS reference_based jsonb;
ALTER TABLE lp_analysis ADD COLUMN IF NOT EXISTS data_based jsonb;
ALTER TABLE lp_analysis ADD COLUMN IF NOT EXISTS conversion_score float;
```

### 변경 파일

| 파일 | 변경 | 이유 |
|------|------|------|
| `supabase/migrations/20260322_v3_schema_additions.sql` | **신규** | 위 SQL |

### 완료 조건
- [ ] SQL 실행 성공 (Supabase Dashboard 또는 CLI)
- [ ] `creative_media` 컬럼 확인: saliency_url, is_active, updated_at 존재
- [ ] `landing_pages` 컬럼 확인: content_hash, last_crawled_at, is_active 존재
- [ ] `creative_lp_map` 컬럼 확인: message_alignment, cta_alignment, offer_alignment, overall_score, issues 존재
- [ ] `lp_analysis` 컬럼 확인: reference_based, data_based, conversion_score 존재
- [ ] `tsc + build` 통과 (SQL만이라 영향 없음)

---

## T2: 5축 분석 스키마 확정 + 프롬프트 재설계 (P1)

**이게 뭔지**: 기획서의 analysis_json 스키마를 확정하고, analyze-five-axis.mjs 프롬프트를 재설계
**왜 필요한지**: 현재 5축 스크립트(hook/product/color/text/composition)와 기획서(visual/text/psychology/quality)가 완전히 다름. 스키마 확정 없이 배치 실행하면 재작업. (Gap A-1, A-2)
**의존성**: T1 (analysis_json, analyzed_at, analysis_model 컬럼 — 이미 존재)
**예상 작업량**: 6-8시간 (3단계 실행 포함)

### T2-A: 속성값 3단계 실행 (🔴 보완 #1)

기획서의 "자유 태깅 → 클러스터링 → 확정 선택지" 3단계를 구체화한다.

**Step 1: 자유 태깅 (100건 샘플)**
- **대상**: `creative_media` WHERE `is_active = true` 중 **ROAS 분포 기반 층화 샘플링**
  - 상위 20% (고성과): 34건
  - 중위 60% (평균): 33건
  - 하위 20% (저성과): 33건
  - 이유: 랜덤이면 평균 소재만 나옴. 고성과/저성과 패턴을 모두 포착해야 분류 기준이 의미 있음.
- **프롬프트**: 선택지를 주지 않고 자유 기술 (예: hook_type에 "question|shock|..." 대신 "이 소재의 훅 유형을 자유롭게 기술해라")
- **출력**: `analysis_json_draft` 임시 필드 또는 별도 JSON 파일

**Step 2: 클러스터링 (Gemini)**
- **방법**: 100건의 자유 태깅 결과를 Gemini에 전달
- **프롬프트**: "아래 100건의 {속성명} 자유 기술을 분석하여, 5-8개의 대표 카테고리로 클러스터링해라. 각 카테고리의 이름, 설명, 해당 건수를 출력해라."
- **왜 Gemini인가**: 수동 분류는 주관적 + 시간 소모. Gemini가 의미 기반 클러스터링 수행.
- **대상 속성**: hook_type, visual_style, composition, headline_type, emotion, psychological_trigger, offer_type, production_quality

**Step 3: 확정 선택지 → 프롬프트 반영**
- Step 2 결과를 Smith님 리뷰 → 확정
- 확정 선택지를 분석 프롬프트의 enum으로 주입:
  ```
  "hook_type": "question|shock|benefit|problem|curiosity|comparison|testimonial|none"
  ```
- **스키마 차이**: Step 1(자유 기술) → Step 3(enum 강제)로 analysis_json 구조가 변경됨
  - Step 1: `"hook_type": "사용자의 공감을 유도하는 질문형 카피"` (자유 텍스트)
  - Step 3: `"hook_type": "question"` (enum 값)
- **전체 배치 재실행**: Step 3 확정 후 전체 소재 대상 재분석 (확정 선택지 프롬프트)

### T2-B: creative_fatigue_risk 계산 방식 (🔴 보완 #2)

**현재 코드** (`creative-analyzer.ts`):
- 같은 계정(account_id) 내 활성 소재 간 embedding 코사인 유사도
- 임계값: 0.90=duplicate, 0.85=danger, 0.70=warning

**v3 계산 방식 정의**:

| 항목 | 정의 |
|------|------|
| **비교 범위** | 같은 account_id 내 활성 소재 (is_active=true) |
| **비교 대상** | 분석 대상 소재 vs 해당 계정의 다른 모든 활성 소재 |
| **비교 벡터** | creative_media.embedding (3072D 비주얼 임베딩) |
| **유사도 계산** | 코사인 유사도 (기존 creative-analyzer.ts 함수 재사용) |
| **임계값** | high: ≥0.85 (같은 시각 패턴), medium: ≥0.70, low: <0.70 |
| **출력** | analysis_json.quality.creative_fatigue_risk = "high\|medium\|low" |
| **추가 출력** | analysis_json.quality.most_similar_ad_id + similarity_score |

**Segwise 비교**:
- Segwise: CTR 24% 하락 기준 (시계열 성과 기반)
- 우리: **임베딩 유사도 기반** (시각적 유사 = 오디언스 피로 예측)
- 이유: daily_ad_insights에 시계열 CTR이 있지만, 소재별 CTR 하락을 피로 때문인지 시장 변화인지 분리 불가. 임베딩 유사도가 더 객관적.
- **향후**: 시계열 CTR 하락 + 임베딩 유사도 복합 모델은 데이터 축적 후 (P5)

**구현**:
- analyze-five-axis.mjs에서 분석 전 해당 계정의 임베딩 벡터 로드
- 분석 대상과 가장 유사한 소재 찾기 → fatigue_risk 판정
- Gemini 프롬프트에는 넣지 않음 (Gemini가 판단할 영역이 아님, 순수 수치 계산)

### T2-C: scores 점수 기준 (🔴 보완 #3)

**문제**: 절대값 점수(0-100)는 기준 없이 비교 불가. "overall 82"가 좋은 건지 나쁜 건지 모름.

**v3 점수 체계: 벤치마크 상대값**

```
scores: {
  overall: 82,
  overall_percentile: 75,        // 동일 카테고리 내 백분위
  visual_impact: 85,
  message_clarity: 78,
  cta_effectiveness: 65,
  benchmark_category: "뷰티",    // 비교 기준 카테고리
  benchmark_sample_size: 342,    // 비교 대상 소재 수
  suggestions: ["CTA 색상 대비 강화"]
}
```

**점수 계산 방식**:

| 단계 | 설명 |
|------|------|
| 1. Gemini 절대값 | Gemini가 0-100 점수 출력 (visual_impact, message_clarity 등) |
| 2. 카테고리 분류 | creatives → ad_accounts → profiles.category (뷰티/건강/식품/패션/기타) |
| 3. 벤치마크 계산 | 같은 카테고리 내 전체 소재 대비 백분위 (percentile_cont) |
| 4. overall 계산 | visual_impact 30% + message_clarity 25% + cta_effectiveness 25% + social_proof 20% (가중 평균) |

**벤치마크 소스**:
- `benchmarks` 테이블에는 성과 지표(ROAS, CTR)만 있음 — 소재 속성 벤치마크 아님
- **소재 속성 벤치마크는 자체 계산**: creative_media.analysis_json이 전부 채워진 후, 카테고리별 scores 분포 계산
- 최소 50건/카테고리 이상이어야 백분위 유의미 → 부족하면 전체(ALL) 대비

**구현 타이밍**:
- Step 3 확정 선택지로 전체 배치 완료 후 → 백분위 계산 배치 실행
- `scripts/compute-score-percentiles.mjs` (신규)

### 구현 내용 (기존)

1. **analysis_json 스키마 확정** (기획서 기준 + 위 보완)

```json
{
  "model": "gemini-3.1-pro-preview",
  "type": "IMAGE",
  "visual": {
    "hook_type": "benefit",
    "visual_style": "professional",
    "composition": "center",
    "product_visibility": { "position": "center", "size_pct": 40 },
    "human_element": { "face": true, "body": "upper", "expression": "smile" },
    "color": { "dominant": "#FF6B6B", "palette": [], "tone": "warm", "contrast": "high" },
    "text_overlay_ratio": 15
  },
  "text": {
    "headline_type": "benefit",
    "key_message": "할인",
    "cta_text": "지금 구매하기",
    "overlay_texts": []
  },
  "psychology": {
    "emotion": "trust",
    "psychological_trigger": "social_proof",
    "offer_type": "discount",
    "urgency": "timer",
    "social_proof": "review_count"
  },
  "quality": {
    "production_quality": "professional",
    "readability": "high",
    "creative_fatigue_risk": "low",
    "most_similar_ad_id": "120225918946530448",
    "similarity_score": 0.72
  },
  "scores": {
    "overall": 82,
    "overall_percentile": 75,
    "visual_impact": 85,
    "message_clarity": 78,
    "cta_effectiveness": 65,
    "social_proof_score": 70,
    "benchmark_category": "뷰티",
    "benchmark_sample_size": 342,
    "suggestions": ["CTA 색상 대비 강화"]
  }
}
```

영상 추가 축 (T6, T7, T8에서 구현):
```json
{
  "audio": { "narration_text": "", "bgm_genre": "", "audio_emotion": "", "audio_type": "narration" },
  "eye_tracking": { "frames": [{ "timestamp": 0, "fixations": [] }] },
  "andromeda_signals": { ... }
}
```

2. **실행 순서**:
   - Step 1: 100건 자유 태깅 (층화 샘플링) → 2시간
   - Step 2: Gemini 클러스터링 → 30분
   - Step 3: Smith님 리뷰 → 확정 → 프롬프트 반영 → 30분
   - Step 4: 전체 배치 (이미지 2,709건 + 영상 225건) → 3시간 (4초/건)
   - Step 5: fatigue_risk 계산 배치 → 30분
   - Step 6: 백분위 계산 배치 → 30분

### 변경 파일

| 파일 | 변경 | 설명 |
|------|------|------|
| `scripts/analyze-five-axis.mjs` | **대폭 수정** | 3단계 모드 지원 (--mode free/cluster/final), 기획서 스키마 프롬프트 |
| `scripts/compute-score-percentiles.mjs` | **신규** | 카테고리별 scores 백분위 계산 |
| `docs/02-design/features/five-axis-analysis.design.md` | **신규** | 확정 스키마 + 속성 선택지 + 점수 기준 명세 |

### 기존 서비스 영향: 없음
- L1/L2/L4 테이블/크론 **그대로 유지** (deprecated 마킹만)
- analysis_json은 creative_media의 **별도 컬럼**이라 기존 쿼리 무영향
- fatigue_risk 계산은 기존 creative-analyzer.ts의 detectFatigue()와 별개 (analysis_json에 저장)

### 완료 조건
- [ ] Step 1: 100건 자유 태깅 완료 → JSON 파일 산출
- [ ] Step 2: 속성별 5-8개 클러스터 도출
- [ ] Step 3: Smith님 확정 → 프롬프트 enum 반영
- [ ] Step 4: 전체 배치 (2,709+225건) → 90%+ 성공
- [ ] Step 5: creative_fatigue_risk 필드 채워짐
- [ ] Step 6: overall_percentile 계산 완료
- [ ] 샘플 검증: 고성과 소재 overall_percentile > 70, 저성과 < 30 (대략)

---

## T3: embed-creatives v2 듀얼 라이트 (P1)

**이게 뭔지**: 임베딩 생성 시 ad_creative_embeddings + creative_media **양쪽에** 저장
**왜 필요한지**: 현재 embed-creatives/ad-creative-embedder.ts가 ad_creative_embeddings만 업데이트. creative_media.embedding/text_embedding이 비어있으면 search_similar_creatives_v2() RPC 작동 불가. (Gap C-1)
**의존성**: 없음 (T1과 병렬 가능)
**예상 작업량**: 3시간

### 구현 내용

1. `ad-creative-embedder.ts`의 `embedCreative()` 함수에서:
   - 기존: `ad_creative_embeddings` UPSERT (embedding, text_embedding)
   - 추가: `creative_media` UPSERT (embedding, text_embedding, embedding_model, embedded_at)
   - creatives.ad_id → creative_media.creative_id 매핑 필요

2. `embed-creatives/route.ts`의 `embedMissingCreatives()`:
   - 기존: ad_creative_embeddings에서 embedding IS NULL 조회
   - 추가: creative_media에서도 embedding IS NULL 조회 → 보충

### 변경 파일

| 파일 | 변경 | 설명 |
|------|------|------|
| `src/lib/ad-creative-embedder.ts` (~200줄) | **수정** | embedCreative() 안에 creative_media UPSERT 추가. 독립 try-catch로 v1 실패 안 전파 |
| `src/app/api/cron/embed-creatives/route.ts` (176줄) | **수정** | embedMissingCreatives 범위에 creative_media 포함 |

### 기존 서비스 영향: 없음
- ad_creative_embeddings UPSERT **그대로 유지** (듀얼 라이트)
- creative_media UPSERT는 독립 try-catch — 실패해도 v1 무영향
- embed-creatives 크론 실행 시간 약간 증가 (DB 쿼리 1회 추가)

### 완료 조건
- [ ] embed-creatives 크론 실행 후 creative_media.embedding NOT NULL 증가
- [ ] ad_creative_embeddings.embedding 기존 데이터 무변경
- [ ] search_similar_creatives_v2() RPC 테스트 (유사도 검색 동작)
- [ ] `tsc + build` 통과

---

## T4: crawl-lps v2 전환 (P2)

**이게 뭔지**: LP 크롤링을 ad_id 기반 → landing_pages(lp_id) 기준으로 전환. 듀얼 뷰포트 + 섹션 캡처 + ADR-001 Storage 경로.
**왜 필요한지**: 현재 같은 LP를 10개 소재가 공유하면 10번 크롤링. landing_pages 기준이면 1번만. Storage 경로도 ADR-001 미준수. (Gap C-2, C-3, S-6)
**의존성**: T1 (landing_pages.content_hash/last_crawled_at/is_active 컬럼)
**예상 작업량**: 3-5일 (가장 큰 TASK)

### 구현 내용

**Phase A: Railway 서비스 확장** (1일)

Railway Playwright 서비스에 새 엔드포인트 추가:
```
POST /crawl/v2
{
  "url": "https://...",
  "viewports": ["mobile", "desktop"],
  "sections": ["full", "hero", "detail", "review", "cta"]
}

Response:
{
  "url": "...",
  "viewports": {
    "mobile": {
      "full": "base64...",
      "hero": "base64...",
      ...
    },
    "desktop": { ... }
  },
  "text": { "headline": "...", "price": "...", "description": "..." },
  "contentHash": "sha256..."
}
```

**Phase B: crawl-lps v2 크론 재설계** (2일)

```
1. landing_pages 조회:
   WHERE is_active = true
   AND (last_crawled_at IS NULL OR last_crawled_at < now() - interval '7 days')
   ORDER BY last_crawled_at NULLS FIRST
   LIMIT 10

2. URL 필터링 (자동 비활성화):
   fb.com/canvas_doc/* → is_active = false
   naver.com, google.com → is_active = false
   mkt.shopping.naver.com → is_active = false

3. Railway /crawl/v2 호출 (듀얼 뷰포트 + 섹션)

4. 결과 저장:
   - Storage: lp/{account_id}/{lp_id}/mobile_full.png 등
   - lp_snapshots INSERT (viewport, screenshot_url, screenshot_hash)
   - landing_pages UPDATE (content_hash, last_crawled_at)
   - content_hash 비교 → 변경 시만 재분석 트리거

5. LP 임베딩 생성 → lp_analysis.embedding
```

**Phase C: LP Storage 기존 데이터 마이그레이션** (반나절)

기존 `lp-screenshots/{ad_id}/main.png` → `lp/{account_id}/{lp_id}/mobile_full.png`
- 마이그레이션 스크립트: `scripts/migrate-lp-screenshots-v2.mjs`
- ad_creative_embeddings.lp_screenshot_url은 유지 (v1 호환)

### 변경 파일

| 파일 | 변경 | 설명 |
|------|------|------|
| `src/app/api/cron/crawl-lps/route.ts` (291줄) | **전면 재작성** | landing_pages 기준 크롤링, ADR-001 경로 |
| `src/lib/railway-crawler.ts` (122줄) | **확장** | crawlV2() 함수 추가. 기존 crawlSingle/crawlBatch 유지 |
| Railway Playwright 서비스 (Docker) | **확장** | /crawl/v2 엔드포인트, 듀얼 뷰포트, 섹션 캡처 |
| `scripts/migrate-lp-screenshots-v2.mjs` | **신규** | 기존 LP 스크린샷 경로 마이그레이션 |

### 기존 서비스 영향: 최소
- 기존 crawlSingle/crawlBatch 함수 **삭제 안 함** (유지)
- ad_creative_embeddings.lp_screenshot_url **유지** (v1 프론트엔드 호환)
- creatives/page.tsx의 LP 스크린샷 표시는 ad_creative_embeddings.lp_screenshot_url 사용 — **그대로 동작**
- 새 크론은 landing_pages + lp_snapshots에 저장 → 별도 경로

### Blast Radius (v1 LP 참조 코드)

| 파일 | 참조 | 이행 전략 |
|------|------|----------|
| `src/app/(main)/creatives/page.tsx:413,420` | lp_screenshot_url 이미지 표시 | v1 유지. v2 UI는 별도 LP 상세 페이지에서 lp_snapshots 사용 |
| `src/lib/ad-creative-embedder.ts:128,242,338` | lp_screenshot_url, lp-screenshots/ 경로 | v1 유지. embed-creatives에서 LP 크롤링은 crawl-lps v2로 위임 |
| `src/app/api/creative/[id]/route.ts:32` | lp_screenshot_url 조회 | v1 유지 |

### 완료 조건
- [ ] Railway /crawl/v2 엔드포인트 배포 + 테스트
- [ ] landing_pages 10건 크롤링 → lp_snapshots에 mobile/desktop 스크린샷 저장
- [ ] Storage 경로: `lp/{account_id}/{lp_id}/mobile_full.png` 확인
- [ ] content_hash 변경 감지 동작 (같은 LP 재크롤링 → hash 동일 시 스킵)
- [ ] 기존 creatives/page.tsx LP 스크린샷 표시 정상 (v1 무영향)
- [ ] `tsc + build` 통과

---

## T5: lp_analysis 2축 구조 전환 (P2)

**이게 뭔지**: LP 분석을 기획서의 2축(레퍼런스 기반 + 데이터 기반) JSONB 구조로 전환
**왜 필요한지**: 현재 flat columns(hero_type, cta_type...)로는 기획서의 8개 카테고리 레퍼런스 분석 불가. (Gap S-4)
**의존성**: T4 (크롤링 데이터 + lp_snapshots 존재)
**예상 작업량**: 1일

### 구현 내용

1. **LP 분석 스크립트** (`scripts/analyze-lps-v2.mjs`): 신규
   - lp_snapshots에서 스크린샷 URL 조회
   - Gemini 3.1 Pro에 스크린샷 + URL 전달
   - 8개 카테고리 레퍼런스 분석 → reference_based JSONB
   - lp_analysis UPSERT (기존 flat 컬럼 유지 + reference_based 추가)

2. **reference_based JSON 스키마**:
```json
{
  "page_structure": { "section_order": [...], "page_length": "long", "scroll_depth": 4500 },
  "pricing_strategy": { "anchoring": true, "bundle": false, "discount_display": "percent" },
  "social_proof": { "review_count": 234, "rating": 4.8, "types": ["text", "photo"], "authority": "dermatologist" },
  "urgency_scarcity": { "timer": false, "stock_count": true, "fomo_copy": "1,234명 구매" },
  "cta_structure": { "type": "sticky", "position": "bottom", "options": 3, "easy_pay": ["naverpay"] },
  "trust_elements": { "certification": true, "brand_story": true, "refund_policy": "전액 환불" },
  "conversion_psychology": { "primary_trigger": "social_proof", "objection_handling": true },
  "mobile_ux": { "sticky_cta": true, "readability": "good", "scroll_depth_pct": 65 }
}
```

3. **기존 flat 컬럼 유지** (deprecated 마킹) — 프론트엔드 호환

### 변경 파일

| 파일 | 변경 | 설명 |
|------|------|------|
| `scripts/analyze-lps-v2.mjs` | **신규** | Gemini 3.1 Pro LP 2축 분석 |
| `docs/02-design/features/lp-analysis-v2.design.md` | **신규** | 2축 스키마 명세 |

### 기존 서비스 영향: 없음
- lp_analysis 기존 flat 컬럼 **삭제 안 함**
- reference_based, data_based는 **신규 JSONB 컬럼** — 기존 쿼리 무영향

### 완료 조건
- [ ] LP 10건 분석 → reference_based JSONB 저장 확인
- [ ] 8개 카테고리 전부 채워지는지 검증
- [ ] 기존 lp_analysis flat 컬럼 데이터 무변경
- [ ] `tsc + build` 통과

---

## T6: 영상 Audio 축 추가 (P3)

**이게 뭔지**: 영상 소재의 오디오 분석(나레이션, BGM, 효과음)을 analysis_json에 추가
**왜 필요한지**: 기획서 5축 중 Audio 축 미구현. 영상 225건 대상. (Gap A-4 일부)
**의존성**: T2 (analysis_json 스키마 확정)
**예상 작업량**: 4시간

### 구현 내용

1. `analyze-five-axis.mjs`의 영상 분석 프롬프트에 audio 축 추가:
```json
{
  "audio": {
    "narration_text": "전사 텍스트",
    "bgm_genre": "경쾌한 팝",
    "sound_effects": "반짝이는 효과음",
    "audio_emotion": "공감→자신감",
    "audio_type": "narration|bgm|sfx|silent"
  }
}
```

2. 영상만 해당 (media_type = 'VIDEO' + mp4 Storage 있는 건)
3. Gemini 3.1 Pro는 비디오 파일 직접 분석 가능 → mp4 전달

### 변경 파일

| 파일 | 변경 | 설명 |
|------|------|------|
| `scripts/analyze-five-axis.mjs` | **수정** | 영상 프롬프트에 audio 축 추가 |

### 완료 조건
- [ ] 영상 10건 분석 → analysis_json.audio 존재 확인
- [ ] 이미지 분석에 audio = null 확인 (영상만)

---

## T7: 영상 Eye Tracking + Canvas 오버레이 (P3)

**이게 뭔지**: 영상 소재의 프레임별 시선 예측(Gemini 추론) + 프론트엔드 Canvas 히트맵 오버레이
**왜 필요한지**: 기획서의 영상 시선 분석. 이미지는 DeepGaze(L2)가 있지만 영상은 없음. (Gap A-4)
**의존성**: T2 (analysis_json 스키마)
**예상 작업량**: 1일

### 구현 내용

**백엔드**: analyze-five-axis.mjs 영상 프롬프트에 eye_tracking 축 추가
```json
{
  "eye_tracking": {
    "frames": [
      { "timestamp": 0, "fixations": [{ "x": 0.5, "y": 0.3, "weight": 0.9, "label": "텍스트" }] },
      { "timestamp": 3, "fixations": [...] }
    ]
  }
}
```

**프론트엔드**: Canvas 오버레이 컴포넌트
- `src/components/video-heatmap-overlay.tsx` (신규)
- video timeupdate 이벤트 → 해당 프레임의 fixation 렌더링
- 구간별 색상: 0-3초 빨강(훅), 3-8초 파랑(제품), 8-15초 초록(CTA)

### 변경 파일

| 파일 | 변경 | 설명 |
|------|------|------|
| `scripts/analyze-five-axis.mjs` | **수정** | 영상 프롬프트에 eye_tracking 추가 |
| `src/components/video-heatmap-overlay.tsx` | **신규** | Canvas 오버레이 컴포넌트 |

### 완료 조건
- [ ] 영상 5건 분석 → analysis_json.eye_tracking.frames 존재
- [ ] Canvas 오버레이: 영상 재생 중 히트맵 표시 동작
- [ ] `tsc + build` 통과

---

## T8: Andromeda 호환 신호 + 유사도 60% 계산 (P4)

**이게 뭔지**: Meta Andromeda 시맨틱 지문 + PDA(Persona×Desire×Awareness) 분류 + 지문 기반 유사도 계산
**왜 필요한지**: 유사도 60% 이상 소재를 Meta가 같은 광고로 취급 → 다양성 관리 필요. (Gap A-5)
**의존성**: T2 (analysis_json 스키마)
**예상 작업량**: 6시간

### 구현 내용

**A. Gemini 지문 생성** — analyze-five-axis.mjs 프롬프트에 andromeda_signals 추가:
```json
{
  "andromeda_signals": {
    "visual_fingerprint": "mom-child-beauty-demo",
    "text_fingerprint": "problem-solution-result",
    "audio_fingerprint": "narration-upbeat",
    "structure_fingerprint": "hook-demo-cta",
    "pda": {
      "persona": "young_mom",
      "desire": "beauty",
      "awareness": "problem_aware"
    }
  }
}
```

### T8-A: 유사도 60% 계산 방식 (🟡 보완 #6)

**문제**: "Andromeda 유사도 60%"가 구체적으로 어떻게 계산되는지 정의 필요.

**Meta Andromeda의 실제 동작** (공개된 정보 기반):
- Meta는 광고 소재를 시맨틱 벡터화하여, 유사한 소재를 같은 "광고 경험"으로 묶음
- 같은 경험으로 묶이면 동일 옥션에서 경쟁하지 않지만, 피로도는 공유됨
- 정확한 알고리즘은 비공개 → **우리는 근사치를 계산**

**유사도 계산: 4축 가중 복합 방식**

| 축 | 비교 방법 | 가중치 | 이유 |
|-----|----------|--------|------|
| visual_fingerprint | 문자열 토큰 Jaccard 유사도 | **40%** | 시각적 요소가 Andromeda에서 가장 큰 비중 |
| text_fingerprint | 문자열 토큰 Jaccard 유사도 | **30%** | 카피 구조(problem-solution 등)가 시맨틱 핵심 |
| audio_fingerprint | 문자열 토큰 Jaccard 유사도 (영상만, 이미지는 제외) | **15%** | 영상에서만 적용 |
| structure_fingerprint | 문자열 토큰 Jaccard 유사도 | **15%** | 전체 구조 패턴 |

**Jaccard 유사도 계산**:
```javascript
// fingerprint는 "mom-child-beauty-demo" 형태의 하이픈 구분 토큰
function fingerprintSimilarity(fp1, fp2) {
  const tokens1 = new Set(fp1.split("-"));
  const tokens2 = new Set(fp2.split("-"));
  const intersection = [...tokens1].filter(t => tokens2.has(t)).length;
  const union = new Set([...tokens1, ...tokens2]).size;
  return intersection / union; // 0.0 ~ 1.0
}

// 4축 가중 유사도
function andromedaSimilarity(a, b) {
  const visual = fingerprintSimilarity(a.visual_fingerprint, b.visual_fingerprint) * 0.40;
  const text   = fingerprintSimilarity(a.text_fingerprint, b.text_fingerprint) * 0.30;
  const audio  = (a.audio_fingerprint && b.audio_fingerprint)
    ? fingerprintSimilarity(a.audio_fingerprint, b.audio_fingerprint) * 0.15
    : 0; // 이미지는 audio 축 제외 → 나머지 축 비중 자동 상승
  const struct = fingerprintSimilarity(a.structure_fingerprint, b.structure_fingerprint) * 0.15;
  return visual + text + audio + struct;
}
```

**임계값**:
- **≥ 0.60**: Meta가 같은 광고 경험으로 묶을 가능성 높음 → 다양성 경고
- **≥ 0.80**: 거의 동일 소재 → 강력 경고 (하나 제거 권고)
- **< 0.60**: 충분히 다른 소재 → 안전

**Embedding 유사도와의 차이**:
- T2-B의 `creative_fatigue_risk`: **임베딩 코사인 유사도** (3072D 벡터) → 시각적 유사도에 집중
- T8의 `andromeda_similarity`: **지문 토큰 유사도** (4축 가중) → Meta의 시맨틱 분류에 근사
- 두 값은 **별개로 저장**: fatigue_risk는 quality 축, andromeda는 andromeda_signals 축

**배치 실행**:
- `scripts/compute-andromeda-similarity.mjs` (신규)
- 같은 account_id 내 활성 소재 간 pairwise 비교
- O(n²) 이지만 계정당 소재 수 < 300이라 실용적 (~45,000 비교/계정)
- 결과: `andromeda_signals.similar_creatives` 배열로 저장:
  ```json
  "similar_creatives": [
    { "creative_id": "uuid", "similarity": 0.72, "overlap_axes": ["visual", "text"] }
  ]
  ```

### 변경 파일

| 파일 | 변경 | 설명 |
|------|------|------|
| `scripts/analyze-five-axis.mjs` | **수정** | andromeda_signals 프롬프트 추가 |
| `scripts/compute-andromeda-similarity.mjs` | **신규** | 4축 가중 유사도 계산 + similar_creatives 저장 |

### 완료 조건
- [ ] 소재 20건 분석 → andromeda_signals 존재
- [ ] 같은 계정 내 유사도 60%+ 소재 쌍 탐지 가능
- [ ] 유사도 상위 10쌍 수동 검증 (실제로 비슷한 소재인지)
- [ ] andromeda_similarity와 fatigue_risk가 서로 다른 값인 소재 존재 확인 (독립성 검증)

---

## T9: creative_lp_map 리뉴얼 (P3)

**이게 뭔지**: 소재↔LP 일관성 점수를 기획서 스키마(message/visual/cta/offer alignment + issues)로 전환
**왜 필요한지**: 현재 컬럼(visual_score, semantic_score 등)이 기획서와 불일치. issues JSONB 없음. (Gap S-5)
**의존성**: T5 (lp_analysis 2축 분석 완료), T2 (analysis_json 존재)
**예상 작업량**: 4시간

### 구현 내용

1. **분석 스크립트** (`scripts/analyze-creative-lp-alignment.mjs`): 신규
   - creative_media.analysis_json + lp_analysis.reference_based 비교
   - Gemini로 4가지 alignment 점수 + issues 생성
   - creative_lp_map UPSERT

2. **점수 구조**:
```json
{
  "message_alignment": 78,
  "visual_consistency": 85,
  "cta_alignment": 45,
  "offer_alignment": 50,
  "overall_score": 64,
  "issues": [
    { "type": "message_mismatch", "severity": "high", "description": "광고: 무료 체험 / LP: 구매만", "action": "LP에 무료 체험 배너 추가" }
  ]
}
```

### 변경 파일

| 파일 | 변경 | 설명 |
|------|------|------|
| `scripts/analyze-creative-lp-alignment.mjs` | **신규** | 소재↔LP 일관성 분석 |

### 기존 서비스 영향: 없음
- 기존 visual_score/semantic_score 등 **유지** (deprecated)
- 신규 컬럼에 병렬 저장

### 완료 조건
- [ ] creative_lp_map 10건 분석 → message_alignment, issues 존재
- [ ] overall_score 계산 로직 검증

---

## T10: LP 데이터 기반 교차분석 + 전환율 추정 (P4)

**이게 뭔지**: LP 요소별 전환율 impact_delta 계산 (리뷰 있음/없음 → 전환율 차이)
**왜 필요한지**: 기획서 2축 중 '데이터 기반' 분석. 레퍼런스만으로는 정량적 근거 부족. (Gap S-4 data_based)
**의존성**: T5 (lp_analysis.reference_based 존재) + 최소 30+ LP × 30일 성과 데이터
**예상 작업량**: 2일

### T10-A: LP 전환율 데이터 획득 방법 (🔴 보완 #5)

**문제**: LP 자체의 전환율 데이터는 존재하지 않음. Meta API는 광고(ad) 레벨 성과만 제공.

**해결: 광고→LP 역매핑 집계**

LP 전환율은 **해당 LP를 사용하는 모든 광고의 성과를 집계**하여 추정한다:

```sql
-- LP별 전환율 추정 쿼리
SELECT
  lp.id AS lp_id,
  lp.canonical_url,
  COUNT(DISTINCT dai.ad_id) AS ad_count,
  SUM(dai.impressions) AS total_impressions,
  SUM(dai.clicks) AS total_clicks,
  SUM(dai.purchases) AS total_purchases,
  SUM(dai.spend) AS total_spend,
  SUM(dai.revenue) AS total_revenue,
  -- 전환율 지표
  CASE WHEN SUM(dai.clicks) > 0
    THEN SUM(dai.purchases)::float / SUM(dai.clicks) * 100
    ELSE NULL END AS click_to_purchase_rate,
  CASE WHEN SUM(dai.spend) > 0
    THEN SUM(dai.revenue) / SUM(dai.spend)
    ELSE NULL END AS roas,
  CASE WHEN SUM(dai.impressions) > 0
    THEN SUM(dai.clicks)::float / SUM(dai.impressions) * 100
    ELSE NULL END AS ctr
FROM landing_pages lp
JOIN creatives c ON c.lp_id = lp.id
JOIN daily_ad_insights dai ON dai.ad_id = c.ad_id
WHERE dai.date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY lp.id, lp.canonical_url
HAVING SUM(dai.clicks) >= 100  -- 최소 클릭 100 이상 (통계 유의미성)
ORDER BY click_to_purchase_rate DESC;
```

**JOIN 경로**: `daily_ad_insights.ad_id → creatives.ad_id → creatives.lp_id → landing_pages.id`

**핵심 가정과 한계**:

| 항목 | 설명 |
|------|------|
| **가정** | 같은 LP로 보내는 광고들의 전환율 평균 ≈ LP 전환율 |
| **한계 1** | 소재 퀄리티가 전환율에 영향 → LP만의 기여도 분리 불가 |
| **한계 2** | 같은 LP지만 UTM이 다르면 별도 URL로 인식될 수 있음 (정규화 필요) |
| **한계 3** | 현재 `creatives.lp_id`가 NULL인 행 존재 → T4(crawl-lps v2)에서 매핑 보강 |
| **보완** | 소재 효과를 제거하려면, **동일 소재 다른 LP** 비교가 이상적이지만 샘플 부족 → P5 |

**데이터 충분성 사전 체크**:
```sql
-- LP별 매칭 광고 수 확인 (실행 전 체크)
SELECT
  COUNT(DISTINCT lp.id) AS total_lps,
  COUNT(DISTINCT lp.id) FILTER (WHERE dai.ad_id IS NOT NULL) AS lps_with_ads,
  COUNT(DISTINCT lp.id) FILTER (
    WHERE dai.ad_id IS NOT NULL
    GROUP BY lp.id HAVING SUM(dai.clicks) >= 100
  ) AS lps_with_sufficient_data
FROM landing_pages lp
LEFT JOIN creatives c ON c.lp_id = lp.id
LEFT JOIN daily_ad_insights dai ON dai.ad_id = c.ad_id
  AND dai.date >= CURRENT_DATE - INTERVAL '30 days';
```

### 구현 내용

1. **LP 성과 집계** → `scripts/compute-lp-data-analysis.mjs`
   - 위 SQL로 LP별 click_to_purchase_rate, roas, ctr 계산
   - 최소 clicks 100건 필터 (통계 유의미성)

2. **LP 요소 × 전환율 교차분석**
   - lp_analysis.reference_based의 요소(review_present, sticky_cta 등)별 그룹
   - 요소 있는 LP vs 없는 LP의 전환율 비교
   - impact_delta + confidence (sample_count 기반)

3. **element_correlation 계산** → lp_analysis.data_based JSONB

```json
{
  "data_based": {
    "conversion_rate": 2.8,
    "roas": 3.2,
    "ctr": 1.5,
    "ad_count": 12,
    "data_period": "2026-02-19~2026-03-21",
    "benchmark_percentile": 65,
    "element_correlation": {
      "reviews_present": { "with": 3.2, "without": 2.0, "impact_delta": 1.2, "impact_pct": 60, "sample_with": 45, "sample_without": 28, "confidence": "high" },
      "sticky_cta": { "with": 3.5, "without": 2.8, "impact_delta": 0.7, "impact_pct": 25, "sample_with": 52, "sample_without": 21, "confidence": "high" },
      "urgency_timer": { "with": 4.1, "without": 2.9, "impact_delta": 1.2, "impact_pct": 41, "sample_with": 8, "sample_without": 65, "confidence": "low" }
    },
    "confidence_note": "high: ≥30 samples, medium: 10-29, low: <10"
  }
}
```

### 변경 파일

| 파일 | 변경 | 설명 |
|------|------|------|
| `scripts/compute-lp-data-analysis.mjs` | **신규** | LP 성과 집계 + 요소 × 전환율 교차분석 |

### 리스크
- **데이터 부족**: landing_pages 166건 중 daily_ad_insights와 매칭되는 건 확인 필요 → 사전 체크 SQL 실행
- `creatives.lp_id` NULL 비율이 높으면 T4(crawl-lps v2)의 LP 매핑 완료 후 실행
- 통계적 유의미성: confidence 필드로 sample_count < 10은 "low" 표시
- **LP 전환율 ≠ LP만의 기여**: 소재 품질 영향 포함된 추정치임을 UI에 명시

### 완료 조건
- [ ] LP 30건+ data_based JSONB 저장
- [ ] click_to_purchase_rate 계산 확인 (수동 검증 5건)
- [ ] element_correlation에 최소 3개 요소 비교 결과
- [ ] confidence "low" 항목은 UI에서 별도 표시
- [ ] impact_delta가 합리적 범위인지 수동 검증

---

## T11: 경쟁사 소재 5축 분석 (P4) — 🟡 보완 #8

**이게 뭔지**: competitor_ad_cache의 9,553건 경쟁사 소재를 5축(analysis_json) 동일 스키마로 분석
**왜 필요한지**: 현재 analyze-competitors가 L1 스키마(hook/product/color/text/composition)로 분석. 기획서 v3 5축과 호환 안 됨. 자사 vs 경쟁사 비교를 동일 축으로 해야 의미 있음.
**의존성**: T2 (analysis_json 스키마 확정 + 프롬프트)
**예상 작업량**: 1일

### 현황 분석

**현재 analyze-competitors 구조** (`src/app/api/cron/analyze-competitors/route.ts`):
- `competitor_analysis_queue`에서 미분석 건 가져와 Gemini 2.0 Flash로 분석
- 프롬프트: IMAGE_ANALYSIS_PROMPT (services/creative-pipeline/analyze.mjs와 동일 — L1 스키마)
- 결과: `competitor_ad_cache.element_analysis` JSONB에 저장
- 모델: `gemini-2.0-flash` (비용 절감)

**competitor_ad_cache 테이블**:
- 9,553건 (Ad Library API로 수집)
- 핵심 컬럼: `image_url`, `video_url`, `element_analysis` (기존 L1), `page_id` (경쟁사 페이지)
- **storage_url 없음** — 이미지는 Meta CDN URL 직접 사용 (만료 가능)

### 구현 내용

**방식 A: 통합 프롬프트 (권장)**

analyze-five-axis.mjs에 `--source competitor` 모드 추가:
- 입력: competitor_ad_cache.image_url (Meta CDN)
- 프롬프트: T2에서 확정한 5축 스키마 **동일 프롬프트** (속성값 enum도 동일)
- 출력: competitor_ad_cache.`analysis_json_v3` (신규 컬럼)
- 모델: `gemini-2.0-flash` 유지 (경쟁사는 Flash로 충분. 자사만 Pro)

```sql
ALTER TABLE competitor_ad_cache ADD COLUMN IF NOT EXISTS analysis_json_v3 jsonb;
```

**왜 별도 컬럼인가**:
- 기존 `element_analysis` (L1 스키마) 유지 → 기존 경쟁사 분석 UI 무영향
- `analysis_json_v3`에 5축 스키마 저장 → 자사 creative_media.analysis_json과 동일 구조

**배치 실행**:
- 9,553건 × ~2초/건 (Flash) = ~5시간
- Meta CDN URL 만료 문제: 403 에러 시 스킵 + 로그
- 예상 성공률: ~70-80% (CDN 만료된 건 제외)

**자사 vs 경쟁사 비교 쿼리**:
```sql
-- 자사 vs 경쟁사 hook_type 분포 비교
SELECT
  '자사' AS source,
  analysis_json->'visual'->>'hook_type' AS hook_type,
  COUNT(*) AS cnt
FROM creative_media
WHERE analysis_json IS NOT NULL
GROUP BY 2

UNION ALL

SELECT
  '경쟁사' AS source,
  analysis_json_v3->'visual'->>'hook_type' AS hook_type,
  COUNT(*) AS cnt
FROM competitor_ad_cache
WHERE analysis_json_v3 IS NOT NULL
GROUP BY 2
ORDER BY source, cnt DESC;
```

### 변경 파일

| 파일 | 변경 | 설명 |
|------|------|------|
| `supabase/migrations/20260322_v3_schema_additions.sql` | **수정** | competitor_ad_cache.analysis_json_v3 컬럼 추가 |
| `scripts/analyze-five-axis.mjs` | **수정** | `--source competitor` 모드 추가, competitor_ad_cache 입출력 |

### 기존 서비스 영향: 없음
- analyze-competitors 크론 **그대로 유지** (기존 L1 분석 계속)
- competitor_ad_cache.element_analysis **유지** (기존 UI 호환)
- analysis_json_v3는 **별도 컬럼** — 기존 쿼리 무영향

### 완료 조건
- [ ] competitor_ad_cache 100건 분석 → analysis_json_v3 존재
- [ ] 자사 analysis_json과 동일 스키마 (키 구조 비교)
- [ ] 자사 vs 경쟁사 hook_type 분포 비교 쿼리 동작
- [ ] CDN 만료 건 에러 로깅 + 스킵 확인

---

## 전체 일정 요약

```
Week 1 (즉시)
  T1: DB 컬럼 추가 ..................... 1시간  ← 시작점
  T2: 5축 스키마 + 프롬프트 ............ 6-8시간 (3단계 포함)
  T3: embed-creatives 듀얼 라이트 ...... 3시간

Week 2
  T4: crawl-lps v2 전환 ............... 3-5일   ← 최대 TASK
  T5: lp_analysis 2축 구조 ............ 1일

Week 3
  T6: 영상 Audio 축 ................... 4시간
  T7: 영상 Eye Tracking + Canvas ...... 1일
  T9: creative_lp_map 리뉴얼 .......... 4시간

Week 4 (데이터 축적 후)
  T8: Andromeda 신호 + 유사도 계산 .... 6시간
  T10: LP 데이터 기반 교차분석 ........ 2일
  T11: 경쟁사 5축 분석 ................ 1일 (배치 5시간)
```

**총 예상**: 12-18일 (PDCA 문서 작업 포함)

---

## Deprecated 대상 (전환 완료 후 정리)

전환기 동안 v1/v2 양쪽 유지. **v2가 안정화된 후** 아래 항목 정리:

| 대상 | 현재 참조 코드 | 정리 시점 |
|------|--------------|----------|
| `creative_element_analysis` (L1 테이블) | analyze-competitors, admin/creative-analysis, admin/creative-intelligence/score | T2 배치 완료 + 프론트엔드 전환 후 |
| `creative_saliency` (L2 테이블) | admin/creative-saliency | creative_media.saliency_url 연결 후 |
| `creative_intelligence_scores` (L4 테이블) | admin/creative-intelligence, admin/creative-intelligence/score | T2 배치 완료 + 프론트엔드 전환 후 |
| `ad_creative_embeddings.lp_screenshot_url` | creatives/page.tsx, creative/[id], ad-creative-embedder | T4 완료 + 프론트엔드 v2 LP 뷰 구현 후 |
| `lp-screenshots/{ad_id}/` Storage 경로 | crawl-lps, ad-creative-embedder | T4 마이그레이션 완료 후 |

**삭제 금지**: 전환 완료 확인 전까지 v1 테이블/컬럼 DROP 하지 않음.

---

## 부록 A: 벤치마크 소재 패턴 추출 아키텍처 (🔴 보완 #4)

**문제**: 기획서에서 "업종별 벤치마크 소재 패턴"을 언급하지만, 벤치마크 데이터에서 소재 미디어에 어떻게 접근하는지 불명확.

### 현재 벤치마크 데이터 구조

**`benchmarks` 테이블** (collect-benchmarks 크론):
- 업종(category) × 랭킹(ranking) × 소재 타입(creative_type) 별 성과 지표
- **저장 데이터**: CTR, CPC, CPM, ROAS, 전환율 등 **성과 메트릭만**
- **미저장**: 소재 이미지/영상 URL, analysis_json, 시각적 속성
- **이유**: Marketing API의 `/insights`는 성과만 반환. 소재 미디어는 별도 API.

**`ad_insights_classified` 테이블**:
- 광고별 일별 성과 + 업종 분류
- `ad_id` 있음 → **소재 미디어 JOIN 가능**

### 벤치마크 소재 패턴 추출 경로

```
ad_insights_classified.ad_id
  → ad_creative_embeddings.ad_id (v1) / creatives.ad_id (v2)
    → creative_media.storage_url (이미지/영상)
    → creative_media.analysis_json (5축 분석)
```

**구체적 쿼리**:
```sql
-- 고성과 소재 (상위 ROAS 20%)의 분석 패턴
WITH ranked AS (
  SELECT
    aic.ad_id,
    aic.category,
    aic.roas,
    PERCENT_RANK() OVER (PARTITION BY aic.category ORDER BY aic.roas) AS roas_pctl
  FROM ad_insights_classified aic
  WHERE aic.date >= CURRENT_DATE - INTERVAL '30 days'
    AND aic.roas > 0
)
SELECT
  r.category,
  cm.analysis_json->'visual'->>'hook_type' AS hook_type,
  cm.analysis_json->'psychology'->>'emotion' AS emotion,
  cm.analysis_json->'scores'->>'overall' AS overall_score,
  COUNT(*) AS cnt,
  AVG(r.roas) AS avg_roas
FROM ranked r
JOIN creatives c ON c.ad_id = r.ad_id
JOIN creative_media cm ON cm.creative_id = c.id
WHERE r.roas_pctl >= 0.80  -- 상위 20%
  AND cm.analysis_json IS NOT NULL
GROUP BY r.category, hook_type, emotion, overall_score
ORDER BY r.category, cnt DESC;
```

### 범위 제한 (중요)

| 항목 | 가능 여부 | 이유 |
|------|----------|------|
| **자사 계정 고성과 소재 패턴** | ✅ 가능 | ad_insights_classified + creative_media JOIN |
| **타 계정 소재 패턴** | ❌ 불가 | Marketing API 토큰은 자사 계정만 접근 가능 |
| **경쟁사 소재 패턴** | ⚠️ 제한적 | Ad Library API로 이미지 수집 가능하나 **성과 데이터 없음** |
| **업종 전체 벤치마크 패턴** | ❌ 불가 | Meta Marketing API는 개별 계정 데이터만 반환 |

**결론**: "업종별 벤치마크 소재 패턴"은 **자사 계정 내 업종 분류 기반**으로 한정된다.
- 같은 계정에서 운영하는 여러 업종(뷰티/건강/식품)의 고성과 소재 패턴 비교는 가능
- 타사 소재 패턴은 Ad Library(T11) 기반으로 분석하되, 성과 없이 속성 분포만 비교 가능

### T2-C 영향
- scores의 benchmark_category 백분위: **자사 계정 내 동일 카테고리** 소재 대비 (타사 아님)
- benchmark_sample_size: 해당 카테고리 내 analysis_json이 채워진 자사 소재 수
- 향후 경쟁사 데이터 누적 → "경쟁사 대비 백분위" 추가 가능 (P5)

---

## 부록 B: 수집→분석 자동화 체인 (🟡 보완 #7)

**문제**: collect-daily → embed-creatives 이후 분석(analyze)이 자동으로 트리거되지 않음.

### 현재 크론 체인

```
Vercel Cron Schedule (vercel.json):

03:00 KST  collect-daily-1~4     META API → DB 수집
07:00 KST  embed-creatives       임베딩 생성 (ad_creative_embeddings + creative_media)
매시        crawl-lps             LP 크롤링
6시간마다   analyze-competitors    경쟁사 분석 큐 처리
```

**Gap**: embed-creatives 완료 → **분석 시작 크론이 없음**

### v3 자동화 체인 설계

```
03:00 KST  collect-daily-1~4     META API → DB 수집
07:00 KST  embed-creatives       임베딩 생성
08:00 KST  analyze-new-creatives 5축 분석 (신규 크론) ← 추가
09:00 KST  compute-scores        백분위 계산 (T2-C) ← 추가
매시        crawl-lps-v2          LP 크롤링 (T4 완료 후)
12:00 KST  analyze-lps-new       LP 분석 (T5, 하루 1회) ← 추가
6시간마다   analyze-competitors    경쟁사 분석 큐 처리
```

### 신규 크론: analyze-new-creatives

**파일**: `src/app/api/cron/analyze-new-creatives/route.ts` (신규)

**로직**:
```
1. creative_media 조회:
   WHERE analysis_json IS NULL
   AND embedding IS NOT NULL  -- 임베딩은 있는데 분석은 안 된 건
   AND is_active = true
   ORDER BY created_at ASC
   LIMIT 50  -- 1회 50건 제한 (Gemini rate limit)

2. 각 건에 대해:
   a. analyze-five-axis.mjs 로직 실행 (5축 Gemini 분석)
   b. fatigue_risk 계산 (T2-B, 같은 account_id 내 유사도)
   c. creative_media.analysis_json UPSERT

3. 결과 로깅:
   analyzed: N건, failed: N건, remaining: N건
```

**Vercel Cron 등록**:
```json
// vercel.json 추가
{ "path": "/api/cron/analyze-new-creatives", "schedule": "0 23 * * *" }
// 23:00 UTC = 08:00 KST (embed-creatives 22:00 UTC + 1시간)
```

### 이벤트 기반이 아닌 이유

| 방식 | 장점 | 단점 | 채택 |
|------|------|------|------|
| **Vercel Cron (시간 기반)** | 단순, 비용 없음, 장애 시 재실행 easy | 1시간 지연 | ✅ 채택 |
| **Inngest/Trigger.dev (이벤트)** | 실시간, 워크플로우 정의 | 추가 서비스 의존, 비용 | ❌ |
| **DB 트리거 (pg_notify)** | 실시간 | Vercel Serverless에서 WebSocket 불가 | ❌ |
| **Edge Function Chaining** | 전 단계 완료 후 호출 | embed-creatives 실패 시 체인 끊김 | ❌ |

**결론**: Vercel Cron이 현재 인프라에 가장 적합. 1시간 지연은 일 배치 기준으로 무시 가능.

### 전체 자동화 타임라인 (하루 기준)

```
03:00  collect-daily         →  creatives, creative_media, daily_ad_insights 갱신
                                 (v1: ad_creative_embeddings도 갱신)
07:00  embed-creatives       →  creative_media.embedding 생성 (신규 건)
                                 (v1: ad_creative_embeddings.embedding도 갱신)
08:00  analyze-new-creatives →  creative_media.analysis_json 생성 (5축)
                                 + creative_fatigue_risk 계산
09:00  compute-scores        →  scores.overall_percentile 갱신 (카테고리 백분위)
                                 (전체가 아닌 당일 분석 완료 건만)
12:00  analyze-lps-new       →  lp_analysis.reference_based 생성 (신규 LP)
매시    crawl-lps-v2          →  landing_pages 크롤링 (변경 감지)
18:00  analyze-competitors   →  competitor_ad_cache 분석 큐 처리
```

**실행 보장**:
- 각 크론은 **독립 실행** (이전 크론 실패해도 자기 할 일 함)
- 대상이 없으면 empty run + 로그만 남김
- 실패 건은 다음 실행에서 재시도 (analysis_json IS NULL 조건)

### 변경 파일

| 파일 | 변경 | TASK |
|------|------|------|
| `src/app/api/cron/analyze-new-creatives/route.ts` | **신규** | T2 완료 후 |
| `src/app/api/cron/compute-scores/route.ts` | **신규** | T2-C 완료 후 |
| `src/app/api/cron/analyze-lps-new/route.ts` | **신규** | T5 완료 후 |
| `vercel.json` | **수정** | 3개 크론 추가 |
