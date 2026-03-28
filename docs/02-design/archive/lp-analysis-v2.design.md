# lp_analysis 2축 구조 전환 설계서

> 작성일: 2026-03-22
> TASK: T5 (architecture-v3-execution-plan.md)
> 의존성: T4 ✅ (crawl-lps v2, lp_snapshots 존재)
> 관련 Plan: docs/01-plan/features/architecture-v3-execution-plan.md T5 섹션

---

## 현재 상태 요약

### lp_analysis 현재 구조 (flat 컬럼 20+개)
```
hero_type, price_position, discount_highlight,
review_position_pct, review_type, review_density, review_count,
cta_type, cta_position, social_proof, page_length, trust_badges,
option_types, cross_sell, easy_pay, urgency_stock, urgency_timedeal,
touches_to_checkout, dominant_color, color_palette, color_tone,
text_density_pct, photo_review_ratio, video_review_count, ...
```

### 이미 준비된 인프라
| 항목 | 상태 |
|------|------|
| `reference_based` JSONB 컬럼 | ✅ DB에 존재 (v3 마이그레이션) |
| `data_based` JSONB 컬럼 | ✅ DB에 존재 |
| `conversion_score` float 컬럼 | ✅ DB에 존재 |
| `lp_snapshots` 테이블 | ✅ 크롤링 데이터 존재 |
| `landing_pages` 테이블 | ✅ canonical_url, account_id |
| Gemini Vision 호출 패턴 | ✅ analyze-five-axis.mjs에서 검증됨 |

---

## 1. 데이터 모델

### 1.1 reference_based JSON 스키마 (8개 카테고리)

```json
{
  "page_structure": {
    "section_order": ["hero", "benefits", "reviews", "pricing", "cta"],
    "page_length": "long",
    "scroll_depth": 4500
  },
  "pricing_strategy": {
    "anchoring": true,
    "bundle": false,
    "discount_display": "percent",
    "price_position": "mid"
  },
  "social_proof": {
    "review_count": 234,
    "rating": 4.8,
    "types": ["text", "photo"],
    "authority": "dermatologist",
    "position_pct": 60
  },
  "urgency_scarcity": {
    "timer": false,
    "stock_count": true,
    "fomo_copy": "1,234명 구매",
    "timedeal": false
  },
  "cta_structure": {
    "type": "sticky",
    "position": "bottom",
    "options": 3,
    "easy_pay": ["naverpay", "kakaopay"],
    "text": "구매하기"
  },
  "trust_elements": {
    "certification": true,
    "brand_story": true,
    "refund_policy": "전액 환불",
    "badges": ["GMP", "식약처"]
  },
  "conversion_psychology": {
    "primary_trigger": "social_proof",
    "objection_handling": true,
    "benefit_hierarchy": ["효과", "가격", "안전"]
  },
  "mobile_ux": {
    "sticky_cta": true,
    "readability": "good",
    "scroll_depth_pct": 65,
    "text_density_pct": 35,
    "gif_count": 2,
    "video_autoplay": true
  }
}
```

### 1.2 기존 flat 컬럼과의 호환

기존 flat 컬럼은 **삭제하지 않음** (deprecated).
reference_based JSONB와 병행 저장. 프론트엔드는 reference_based 우선 사용.

---

## 2. API 설계

### 2.1 analyze-lps-v2.mjs (신규 스크립트)

```
Usage: node scripts/analyze-lps-v2.mjs [--limit N] [--dry-run] [--lp-id UUID]

동작:
1. lp_snapshots에서 스크린샷 URL 조회
   - JOIN landing_pages ON lp_id (account_id, canonical_url 포함)
   - WHERE lp_analysis.reference_based IS NULL
     OR lp_analysis.reference_based 미존재
   - ORDER BY landing_pages.last_crawled_at DESC
   - LIMIT (기본 50)

2. 각 LP에 대해:
   a. lp_snapshots.screenshot_url에서 Storage 이미지 다운로드 → base64
   b. Gemini 2.5 Pro에 이미지 + canonical_url 전달
   c. 8개 카테고리 레퍼런스 분석 프롬프트
   d. lp_analysis UPSERT (on conflict: lp_id, viewport)
      - reference_based = Gemini 응답 JSON
      - 기존 flat 컬럼도 reference_based에서 추출하여 동기화
      - analyzed_at = now()
      - model_version = "gemini-2.5-pro-lp-v2"

3. Rate limiting: 4초 간격 (Gemini 15 req/min)

4. 출력:
   { analyzed: N, skipped: M, errors: E }
```

### 2.2 Gemini 프롬프트

```
이 모바일 랜딩 페이지 스크린샷을 분석하세요.
URL: {canonical_url}

아래 8개 카테고리로 구조화된 JSON을 반환하세요:

1. page_structure: 섹션 순서, 페이지 길이(short/medium/long), 스크롤 깊이(px)
2. pricing_strategy: 가격 앵커링, 번들, 할인 표시(percent/amount/none), 가격 위치(top/mid/bottom)
3. social_proof: 리뷰 수, 별점, 리뷰 유형(text/photo/video), 전문가 권위, 리뷰 위치(%)
4. urgency_scarcity: 타이머, 재고 표시, FOMO 카피, 타임딜
5. cta_structure: CTA 유형(sticky/floating/inline/none), 위치, 옵션 수, 간편결제, CTA 문구
6. trust_elements: 인증마크, 브랜드 스토리, 환불 정책, 배지 목록
7. conversion_psychology: 주요 설득 트리거, 이의 처리 여부, 혜택 우선순위
8. mobile_ux: 스티키 CTA, 가독성(good/fair/poor), 스크롤 깊이(%), 텍스트 밀도(%), GIF/비디오

{JSON 스키마 예시}
```

### 2.3 Storage 이미지 접근

lp_snapshots.screenshot_url 형식: `lp/{account_id}/{lp_id}/mobile_full.jpg`
→ Supabase Storage public URL로 변환:
```
{SUPABASE_URL}/storage/v1/object/public/creatives/{screenshot_url}
```

---

## 3. 컴포넌트 구조

### 3.1 변경 파일

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `scripts/analyze-lps-v2.mjs` | **신규** | Gemini 2.5 Pro LP 8카테고리 레퍼런스 분석 |

### 3.2 기존 서비스 영향

| 영향받는 코드 | 이행 전략 |
|-------------|----------|
| lp_analysis 기존 flat 컬럼 | **유지** — 삭제 안 함, deprecated |
| migrate-lp-analysis.mjs | **무영향** — 기존 이관 스크립트 그대로 |
| lp_structure_analysis 테이블 | **무영향** — 원본 데이터 유지 |
| 프론트엔드 LP 관련 UI | **무영향** — reference_based는 신규 컬럼 |

---

## 4. 에러 처리

| 상황 | 처리 |
|------|------|
| lp_snapshots 없음 (스크린샷 미크롤링) | 스킵 — 다음 LP 진행 |
| Storage 이미지 다운로드 실패 | 스킵 + 에러 로그 |
| Gemini 429 (rate limit) | 재시도 (exponential backoff, 최대 3회) |
| Gemini 5xx | 재시도 (exponential backoff, 최대 3회) |
| JSON 파싱 실패 | 스킵 + 에러 로그 |
| lp_analysis UPSERT 실패 | 에러 로그 + 다음 LP 진행 |
| 분석 대상 0건 | 즉시 종료 (정상) |

---

## 5. 구현 순서

- [ ] sbGet/sbPatch REST 헬퍼 (analyze-five-axis.mjs 패턴 재사용)
- [ ] lp_snapshots + landing_pages JOIN 조회 (reference_based IS NULL 필터)
- [ ] Storage → base64 이미지 다운로드
- [ ] Gemini 2.5 Pro 8카테고리 프롬프트 + JSON 응답 파싱
- [ ] lp_analysis UPSERT (reference_based + flat 컬럼 동기화)
- [ ] Rate limiting (4초 간격)
- [ ] `--limit`, `--dry-run`, `--lp-id` CLI 옵션
- [ ] `npx tsc --noEmit` 통과
- [ ] `npm run build` 통과

---

> 설계서 작성 완료.
