# LP 분석 파이프라인 기획서

## Executive Summary

| 항목 | 내용 |
|------|------|
| 기능명 | LP 분석 파이프라인 |
| 작성일 | 2026-03-25 |
| 작성자 | PM팀 |
| 목표 | 소재 5축 분석과 유기적으로 연결되는 LP(랜딩페이지) 분석 파이프라인 구축. AI 스크린샷 분석(reference_based) + Mixpanel 행동 데이터(data_based) + 소재↔LP 일관성을 통합하여 "랜딩 총가치각도기"를 완성하고, 최종 목적함수 reach_to_purchase_rate를 산출한다. |

---

## 1. 배경 및 현황

### 현재 완료된 것
| 항목 | 상태 | 비고 |
|------|------|------|
| LP 크롤링 (crawl-lps v2) | ✅ 완료 | lp_snapshots에 스크린샷 저장 |
| LP 전체 캡처 (동영상, GIF 포함) | ✅ 완료 | GCS Storage에 mobile_full.jpg 저장 |
| DB 스키마 (reference_based, data_based JSONB) | ✅ 완료 | lp_analysis 테이블에 컬럼 존재 |
| creative_lp_map 테이블 | ✅ 완료 | alignment 컬럼 (message, cta, offer, overall) 존재 |
| Gemini Vision 분석 패턴 | ✅ 검증됨 | analyze-five-axis.mjs에서 동일 패턴 사용 중 |
| Mixpanel SDK 설치 (수강생 전원) | ✅ 완료 | 카페24 기반, 14개 이벤트 수집 중 |
| 소재 5축 분석 파이프라인 (L1~L4) | ✅ 완료 | creative_media.analysis_json에 결과 저장 |
| 광고 총가치각도기 | ✅ 완료 | 기반(3축) + 참여(5축) + 전환(6축, CTR이 끝점) |

### 해결할 문제
1. **LP 분석 데이터 부재**: lp_analysis.reference_based가 아직 비어 있음 — AI 스크린샷 분석 미실행
2. **소재↔LP 단절**: 소재 5축 분석은 완료되었으나, LP 분석과 연결되지 않아 "광고는 좋은데 왜 안 팔리지?" 진단 불가
3. **행동 데이터 미활용**: Mixpanel에 수강생 40명 × 카페24 이벤트가 수집 중이나, LP별 퍼널/전환율 분석 미구현
4. **랜딩 총가치각도기 부재**: 광고 총가치각도기는 CTR까지만 — 클릭 이후(체류, 스크롤, 장바구니, 구매)를 진단하는 도구 없음
5. **세트 목적함수 미산출**: reach_to_purchase_rate(노출→구매율) = 광고+LP 세트의 최종 성적표가 아직 없음

---

## 2. 목표

### 핵심 목표
> 소재 분석(광고)과 LP 분석(랜딩)을 하나의 세트로 유기적 연결하여, "클릭 이후 왜 전환이 안 되는지"를 데이터+AI로 진단한다.

### 성공 기준
| 기준 | 목표치 | 측정 방법 |
|------|--------|-----------|
| LP AI 분석 완료율 | 100% (전체 LP) | lp_analysis.reference_based IS NOT NULL 비율 |
| Mixpanel 퍼널 데이터 수집 | 40개 계정 × 30일 | data_based JSONB 채움 |
| 소재↔LP 일관성 점수 산출 | 전체 매핑 | creative_lp_map.overall_score IS NOT NULL |
| reach_to_purchase_rate 산출 | 전체 계정 | 광고 CTR × LP 전환율 합산 |
| 랜딩 총가치각도기 대시보드 | MVP 완성 | 수강생이 자기 LP 진단 가능 |

---

## 3. 범위 (IN/OUT)

### IN (이번 파이프라인에 포함)
- LP 스크린샷 AI 분석 → reference_based 8개 카테고리 채우기
- Mixpanel API/MCP 연동 → LP별 행동 데이터 수집
- 소재↔LP 일관성 분석 (creative_lp_map alignment 점수)
- data_based JSONB 채우기 (퍼널 전환율 + 요소 교차분석)
- 랜딩 총가치각도기 지표 정의 + 대시보드 MVP
- reach_to_purchase_rate 산출 로직
- 광고+LP 세트 리포트

### OUT (이번 범위 밖)
- LP 미디어 원본 다운로드 (별도 Plan: lp-media-download.plan.md)
- LP A/B 테스트 자동화
- LP 자동 생성/수정 제안
- Mixpanel 실시간 대시보드 (수강생 카페24 대시보드와 별도)
- 처방 시스템 (prescription — 별도로 보류 상태, 2026-03-25 Smith님 결정)

---

## 4. 소재 분석과의 유기적 연결

### 4.1 광고→LP 세트 흐름 (Smith님 확정 구조)

```
┌─────────────── 광고 총가치각도기 ───────────────┐    ┌──────────── 랜딩 총가치각도기 ────────────┐
│                                                  │    │                                           │
│  기반점수        참여율(진단만)     전환율         │    │  체류       스크롤      장바구니    구매     │
│  ┌──────┐       ┌──────┐       ┌──────┐         │    │  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  │
│  │3초시청│       │좋아요│       │ CTR  │─────────┼───→│  │체류시간│  │스크롤율│  │카트추가│  │구매율│  │
│  │Thru  │       │댓글  │       │      │  클릭!  │    │  │      │  │      │  │      │  │      │  │
│  │지속율 │       │공유  │       │(끝점)│         │    │  └──────┘  └──────┘  └──────┘  └──────┘  │
│  └──────┘       └──────┘       └──────┘         │    │                                           │
└──────────────────────────────────────────────────┘    └───────────────────────────────────────────┘

                    ↕ 소재↔LP 일관성 점수 ↕                     ↓ reach_to_purchase_rate ↓
                    (creative_lp_map)                         = 노출 → 구매까지 전체 확률
```

### 4.2 핵심 원칙
- **광고 = 클릭까지**: 소재의 역할은 CTR(클릭률)이 끝점
- **랜딩 = 구매까지**: LP의 역할은 클릭 이후 구매 전환
- **CTR 높은데 구매 안됨 → LP 문제**: 소재는 잘 만들었는데 LP에서 이탈
- **CTR 낮음 → 소재 문제**: LP까지 도달 자체가 안됨
- **최종 목적함수**: reach_to_purchase_rate (노출당구매확률) = 광고+LP 세트의 성적표

### 4.3 소재 5축 → LP 분석 연결 포인트

소재 analysis_json의 5축 분석 결과가 LP 분석에 직접 연결되는 지점:

| 소재 5축 | LP 연결 | 일관성 검증 항목 |
|----------|---------|-----------------|
| **visual** (색상, 구도, 제품 노출) | LP hero 이미지, 색감 톤 | 소재 색감 ↔ LP dominant_color 일치 |
| **text** (헤드라인, CTA 문구) | LP 헤드라인, CTA 버튼 텍스트 | 소재 메시지 ↔ LP 헤드라인 일관성 |
| **psychology** (감정, 긴급성, 사회적 증거) | LP urgency_scarcity, social_proof | 소재 긴급성 ↔ LP 타이머/재고 일관성 |
| **quality** (제작 품질, 브랜드 일관성) | LP trust_elements, mobile_ux | 소재 브랜드 톤 ↔ LP 브랜드 스토리 |
| **hook** (훅 유형, 비주얼 스타일) | LP page_structure (첫 섹션) | 소재 첫인상 ↔ LP hero 영역 연결감 |

### 4.4 creative_lp_map 활용

기존 `creative_lp_map` 테이블의 alignment 점수 체계:
- `message_alignment` (가중치 0.35): 소재 메시지 ↔ LP 헤드라인/카피 일관성
- `cta_alignment` (가중치 0.25): 소재 CTA ↔ LP CTA 버튼 일관성
- `offer_alignment` (가중치 0.25): 소재 제안(할인, 혜택) ↔ LP 가격/오퍼 일관성
- `visual_consistency` (가중치 0.15): 색감, 이미지 스타일 일관성
- `overall_score` = 가중 평균
- `issues` JSONB: 불일치 항목 목록 (type, severity, description, action)

> v3 목업(creative-analysis-v3.html)에서 이미 "소재↔LP 일관성 분석" 섹션이 설계됨 — 광고 소재 ↔ LP 스크린샷을 나란히 보여주고, 불일치 항목(메시지/색감/CTA)을 시각적으로 표시

---

## 5. LP 스크린샷 분석 파이프라인

### 5.1 분석 대상
- `lp_snapshots` 테이블의 모든 LP 스크린샷 (mobile_full.jpg)
- Storage 경로: `lp/{account_id}/{lp_id}/mobile_full.jpg`
- 전체 캡처 완료 상태 (동영상, GIF 포함 — 정적 이미지로 캡처됨)

### 5.2 AI 분석 (Gemini 2.5 Pro)
- 설계서: `lp-analysis-v2.design.md` 기준
- 입력: LP 스크린샷 이미지 + canonical_url
- 출력: reference_based 8개 카테고리 JSON

### 5.3 reference_based 8개 카테고리

| # | 카테고리 | 분석 항목 | LP 전환에 미치는 영향 |
|---|----------|-----------|---------------------|
| 1 | **page_structure** | 섹션 순서, 페이지 길이, 스크롤 깊이 | 정보 구조 → 이탈률 |
| 2 | **pricing_strategy** | 앵커링, 번들, 할인 표시, 가격 위치 | 가격 인식 → 구매 결정 |
| 3 | **social_proof** | 리뷰 수, 별점, 유형, 전문가 권위 | 신뢰 → 전환 촉진 |
| 4 | **urgency_scarcity** | 타이머, 재고 표시, FOMO 카피 | 긴급성 → 즉시 구매 유도 |
| 5 | **cta_structure** | CTA 유형(sticky/floating), 간편결제, 문구 | 행동 유도 → 결제 시작 |
| 6 | **trust_elements** | 인증마크, 브랜드 스토리, 환불 정책 | 불안 해소 → 이탈 방지 |
| 7 | **conversion_psychology** | 설득 트리거, 이의 처리, 혜택 우선순위 | 심리적 장벽 → 전환 |
| 8 | **mobile_ux** | 스티키 CTA, 가독성, 텍스트 밀도 | UX 품질 → 체류/이탈 |

### 5.4 실행 스크립트
- `scripts/analyze-lps-v2.mjs` (설계서에 정의됨)
- Rate limiting: 4초 간격 (Gemini 15 req/min)
- lp_analysis UPSERT (on conflict: lp_id, viewport)
- 기존 flat 컬럼과 병행 저장 (deprecated이지만 삭제 안 함)

---

## 6. Mixpanel 행동 데이터 연동

### 6.1 수강생 Mixpanel 텍소노미 (카페24 기반, 설치 완료)

수강생 40명의 카페24 쇼핑몰에 Mixpanel이 설치되어 실제 고객 행동 데이터가 수집 중이다.

#### LP 관련 핵심 이벤트

| 이벤트 | LP 분석 활용 | 데이터 포인트 |
|--------|-------------|--------------|
| `view_page` | LP 도달 확인, 체류 시간 | page_url, page_path, page_title |
| `view_product` | 상품 상세 조회 (LP 내 행동) | product_id, product_name, product_price |
| `click_product` | 상품 클릭 (관심 표현) | product_id, product_name |
| `add_to_cart` | 장바구니 추가 (구매 의도) | product_id, quantity |
| `cart` | 장바구니 페이지 진입 | 상품 속성 |
| `purchase` | 구매 완료 (최종 전환) | product_id, product_price, quantity, coupon_code |
| `scroll_rate` | LP 스크롤 비율 | 비율 값 (%) |
| `scroll_depth` | LP 스크롤 깊이 | px 값 |
| `remove_from_cart` | 카트 이탈 (음성 시그널) | product_id |
| `refund` | 환불 (사후 불만족) | product_id |

#### UTM 파라미터 (광고↔LP 추적)
- `$initial_utm_source/medium/campaign/term/content` — 첫 유입
- `last_utm_source/medium/campaign/term/content` — 최근 유입
- UTM campaign → Meta 캠페인 ID 매핑 → 어떤 광고가 이 LP로 보냈는지 추적

#### al_data (Meta 광고 성과 연동)
- `name`, `material`, `category_id`, `category_name` — 광고 식별
- `ad_set` — 광고세트
- `performance`, `cost_value_conversion` — 성과/전환 비용

### 6.2 LP별 퍼널 구성

```
view_page (LP 도달)
  ↓ 체류 + 스크롤
view_product (상품 상세 조회)
  ↓
add_to_cart (장바구니 추가)
  ↓
cart (장바구니 페이지)
  ↓
purchase (구매 완료)
```

각 단계 전환율 산출:
- **LP 도달→상품 조회율**: view_product / view_page
- **상품 조회→카트율**: add_to_cart / view_product
- **카트→구매율**: purchase / add_to_cart
- **LP 도달→구매율** (click_to_purchase_rate): purchase / view_page

### 6.3 데이터 수집 방식

**Option A: Mixpanel Export API** (권장 — Phase B)
- Mixpanel Data Export API로 이벤트 데이터를 배치 수집
- LP의 page_url 기준 필터링 → LP별 퍼널 전환율 계산
- 일 1회 크론으로 수집 → lp_analysis.data_based JSONB에 저장

**Option B: Mixpanel MCP 서버** (탐색 — Phase B 후반)
- bscamp 서비스 내에서 Mixpanel 쿼리를 실시간으로 실행
- 수강생별 실시간 퍼널 조회 가능
- 구현 복잡도 높음 — API 연동 안정화 후 검토

### 6.4 UTM → Meta 광고 → LP 연결 체인

```
Meta 광고 (campaign_id, ad_id)
  → UTM 파라미터 (utm_campaign, utm_content)
    → Mixpanel 이벤트 (view_page의 utm_campaign)
      → LP 식별 (page_url = landing_pages.canonical_url)
        → LP별 행동 데이터 집계
```

이 체인으로 "어떤 Meta 광고가 어떤 LP로 보냈고, 그 LP에서 얼마나 전환했는지" 추적 가능.

---

## 7. 랜딩 총가치각도기 설계

### 7.1 지표 정의

광고 총가치각도기(metric-groups.ts)의 전환율 그룹이 CTR에서 끝나는 반면, 랜딩 총가치각도기는 **클릭 이후 퍼널**을 다룬다.

| 그룹 | 지표 | 데이터 소스 | 설명 |
|------|------|------------|------|
| **체류** | avg_session_duration | Mixpanel view_page 타임스탬프 차이 | LP 평균 체류 시간 (초) |
| **체류** | bounce_rate | Mixpanel view_page only (후속 이벤트 없음) | LP 이탈률 (%) |
| **스크롤** | avg_scroll_rate | Mixpanel scroll_rate | 평균 스크롤 비율 (%) |
| **스크롤** | avg_scroll_depth | Mixpanel scroll_depth | 평균 스크롤 깊이 (px) |
| **장바구니** | view_to_cart_rate | add_to_cart / view_page | LP 도달 → 카트 추가율 (%) |
| **장바구니** | cart_abandonment_rate | 1 - (purchase / add_to_cart) | 카트 이탈률 (%) |
| **구매** | click_to_purchase_rate | purchase / view_page | LP 도달 → 구매율 (%) |
| **구매** | avg_order_value | purchase.product_price × quantity 평균 | 평균 주문 금액 (원) |
| **구매** | refund_rate | refund / purchase | 환불률 (%) |

### 7.2 벤치마크 기준

수강생 40명의 LP 데이터를 집계하여 **내부 벤치마크** 생성:
- 하위 25% / 중간 50% / 상위 25% 구간
- 카테고리별(의류, 식품, 화장품 등) 세분화 가능 (데이터 축적 후)
- 초기에는 전체 수강생 풀을 벤치마크로 사용

### 7.3 reach_to_purchase_rate 산출 방식

```
reach_to_purchase_rate = impressions → purchase 전체 확률

= (clicks / impressions) × (purchases / clicks)
= CTR × click_to_purchase_rate

또는 직접 계산:
= purchases / impressions × 100
```

**데이터 소스 결합:**
- `impressions`, `clicks` → Meta API (daily_ad_insights 테이블)
- `purchases` → Mixpanel purchase 이벤트 (UTM으로 광고 매핑) 또는 Meta purchase 이벤트
- 30일 롤링 기간으로 산출

**세트 단위 산출:**
- 광고 소재 A + LP X → reach_to_purchase_rate_A_X
- 광고 소재 A + LP Y → reach_to_purchase_rate_A_Y
- 같은 소재, 다른 LP → LP 성과 비교 가능
- 같은 LP, 다른 소재 → 소재 성과 비교 가능

### 7.4 총가치각도기 통합 뷰

```
┌─────────────────────────────────────────────────────┐
│  광고+LP 세트 진단                                    │
│                                                      │
│  광고 총가치각도기: 72점 (상위 35%)                    │
│  ├ 기반: 80  ├ 참여: 65 (진단만)  ├ CTR: 2.8%        │
│                                                      │
│  소재↔LP 일관성: 72% → "메시지 불일치" 경고            │
│                                                      │
│  랜딩 총가치각도기: 58점 (상위 55%) ← 개선 필요        │
│  ├ 체류: 45초  ├ 스크롤: 62%  ├ 카트: 3.2%  ├ 구매: 1.4% │
│                                                      │
│  reach_to_purchase_rate: 0.039% (상위 42%)            │
│  = CTR 2.8% × LP구매율 1.4%                          │
│                                                      │
│  진단: "CTR은 양호하나 LP 전환율이 낮음 → LP 개선 우선" │
└─────────────────────────────────────────────────────┘
```

---

## 8. 데이터 흐름

### 8.1 전체 파이프라인 아키텍처

```
[수집 계층]
Meta Marketing API ─── daily_ad_insights ──── impressions, clicks, spend, CTR
                   └── creative_media ──────── analysis_json (5축 분석 완료)
                   └── creatives ────────────── lp_id → landing_pages 연결

LP 크롤러 ──────────── lp_snapshots ─────────── screenshot_url (GCS)
                   └── landing_pages ─────────── canonical_url, account_id

Mixpanel SDK ──────── view_page, view_product, add_to_cart, purchase, scroll_rate/depth
(카페24)               UTM 파라미터 (utm_campaign → Meta 광고 매핑)


[분석 계층]
analyze-lps-v2.mjs ───────────────── lp_analysis.reference_based (8카테고리)
                                      ↑ Gemini 2.5 Pro Vision

compute-lp-data-analysis.mjs ────── lp_analysis.data_based (퍼널 + 교차분석)
                                      ↑ Mixpanel API + daily_ad_insights

analyze-creative-lp-alignment.mjs ── creative_lp_map (alignment 점수 + issues)
                                      ↑ analysis_json + reference_based → Gemini 비교


[서빙 계층]
랜딩 총가치각도기 대시보드 ──── LP별 진단 (체류/스크롤/카트/구매)
광고+LP 세트 리포트 ────────── reach_to_purchase_rate + 일관성 진단
소재 상세 분석 v3 ─────────── 소재↔LP 일관성 섹션 (목업 완료)
```

### 8.2 데이터 갱신 주기

| 데이터 | 갱신 주기 | 트리거 |
|--------|----------|--------|
| LP 스크린샷 (lp_snapshots) | 주 1회 | crawl-lps 크론 |
| reference_based (AI 분석) | 스크린샷 변경 시 | analyze-lps-v2 크론 (주 1회) |
| Mixpanel 행동 데이터 | 일 1회 | compute-lp-data-analysis 크론 |
| creative_lp_map alignment | 소재/LP 분석 변경 시 | analyze-creative-lp-alignment 크론 |
| reach_to_purchase_rate | 일 1회 | data_based 갱신과 함께 |

---

## 9. 구현 Phase

### Phase A: LP 스크린샷 AI 분석 + reference_based 채우기

**목표**: 전체 LP의 reference_based 8개 카테고리 채우기

| 항목 | 내용 |
|------|------|
| 스크립트 | `scripts/analyze-lps-v2.mjs` |
| 입력 | lp_snapshots.screenshot_url (GCS 이미지) |
| 출력 | lp_analysis.reference_based JSONB |
| AI 모델 | Gemini 2.5 Pro Vision |
| 의존성 | lp_snapshots 존재 (✅), Gemini API (✅) |
| 설계서 | `docs/02-design/features/lp-analysis-v2.design.md` |

**세부 작업:**
1. analyze-lps-v2.mjs 구현 (설계서 기준)
2. Gemini 프롬프트 최적화 (8카테고리 JSON 정확도)
3. Cloud Scheduler 크론 등록 (주 1회)
4. 전체 LP 일괄 분석 실행 (초기 backfill)

### Phase B: Mixpanel API 연동 + 행동 데이터 수집

**목표**: LP별 Mixpanel 행동 데이터를 수집하여 data_based 채우기

| 항목 | 내용 |
|------|------|
| 스크립트 | `scripts/compute-lp-data-analysis.mjs` (확장) |
| 입력 | Mixpanel Export API + daily_ad_insights |
| 출력 | lp_analysis.data_based JSONB |
| 의존성 | Phase A (reference_based 존재), Mixpanel API 키 |
| 설계서 | `docs/02-design/features/lp-data-analysis.design.md` + Mixpanel 텍소노미 |

**세부 작업:**
1. Mixpanel Export API 연동 모듈 구현
   - 이벤트 쿼리: view_page, view_product, add_to_cart, purchase, scroll_rate/depth
   - UTM 파라미터 기반 LP 식별
   - 계정(account_id) 단위 데이터 분리
2. LP별 퍼널 전환율 계산
   - view_page → view_product → add_to_cart → purchase 각 단계
   - scroll_rate/depth 평균
   - bounce_rate, session_duration
3. 요소 교차분석 (reference_based boolean 요소 × 전환율)
   - reviews_present, sticky_cta, urgency_timer 등 8개 요소
   - with/without 전환율 비교 + confidence
4. data_based JSONB UPSERT + conversion_score 백분위
5. reach_to_purchase_rate 산출
   - Meta daily_ad_insights (impressions, clicks) + Mixpanel (purchases)
   - UTM campaign → ad_id 매핑
6. Cloud Scheduler 크론 등록 (일 1회)

### Phase C: 소재↔LP 일관성 분석

**목표**: creative_lp_map의 alignment 점수 채우기

| 항목 | 내용 |
|------|------|
| 스크립트 | `scripts/analyze-creative-lp-alignment.mjs` |
| 입력 | creative_media.analysis_json + lp_analysis.reference_based |
| 출력 | creative_lp_map (message/cta/offer/overall alignment + issues) |
| 의존성 | Phase A (reference_based 존재), 소재 5축 분석 (✅) |
| 설계서 | `docs/02-design/features/creative-lp-alignment.design.md` |

**세부 작업:**
1. analyze-creative-lp-alignment.mjs 구현 (설계서 기준)
2. Gemini 프롬프트: 소재 5축 ↔ LP 8카테고리 비교
3. 4가지 alignment 점수 + issues 생성
4. overall_score 가중 평균 계산
5. Cloud Scheduler 크론 등록

### Phase D: 랜딩 총가치각도기 대시보드 + 세트 리포트

**목표**: 수강생이 자기 LP 진단을 볼 수 있는 대시보드 MVP

| 항목 | 내용 |
|------|------|
| 페이지 | 총가치각도기 > 랜딩 탭 (기존 protractor 내) |
| 데이터 | lp_analysis (reference_based + data_based), creative_lp_map |
| UI 참고 | creative-analysis-v3.html 목업의 소재↔LP 일관성 섹션 |

**세부 작업:**
1. 랜딩 총가치각도기 지표 정의 (metric-groups.ts 확장 또는 별도 파일)
   - 체류 그룹: avg_session_duration, bounce_rate
   - 스크롤 그룹: avg_scroll_rate, avg_scroll_depth
   - 장바구니 그룹: view_to_cart_rate, cart_abandonment_rate
   - 구매 그룹: click_to_purchase_rate, avg_order_value, refund_rate
2. LP 진단 대시보드 컴포넌트
   - LP별 reference_based 8카테고리 시각화
   - 퍼널 전환율 차트 (view → cart → purchase)
   - 벤치마크 비교 (내부 수강생 풀)
3. 광고+LP 세트 리포트
   - 광고 총가치각도기 점수 + 랜딩 총가치각도기 점수
   - reach_to_purchase_rate (세트 목적함수)
   - 소재↔LP 일관성 점수 + 불일치 항목
   - AI 진단: "CTR은 좋은데 구매 안됨 → LP 개선" 등
4. 소재 상세 분석 v3 내 LP 일관성 섹션 구현
   - 목업(creative-analysis-v3.html) 기반
   - 광고 소재 ↔ LP 스크린샷 나란히 표시
   - 불일치 항목 (메시지/색감/CTA) 시각적 표시

---

## 10. 의존성

### 선행 의존성 (완료)
| 의존성 | 상태 | 비고 |
|--------|------|------|
| crawl-lps v2 (LP 크롤링) | ✅ | lp_snapshots, landing_pages 테이블 |
| LP 스크린샷 GCS 저장 | ✅ | lp/{account_id}/{lp_id}/mobile_full.jpg |
| 소재 5축 분석 (L1~L4) | ✅ | creative_media.analysis_json |
| DB 스키마 (reference_based, data_based) | ✅ | v3 마이그레이션 완료 |
| creative_lp_map alignment 컬럼 | ✅ | message/cta/offer/overall + issues |
| Mixpanel SDK 설치 (수강생 카페24) | ✅ | 14개 이벤트 수집 중 |
| 광고 총가치각도기 | ✅ | metric-groups.ts 정의 완료 |
| Gemini 2.5 Pro API | ✅ | 소재 분석에서 검증됨 |

### Phase 간 의존성
```
Phase A (reference_based 채우기)
  ↓
Phase B (Mixpanel + data_based) ←── Mixpanel API 키 필요
Phase C (소재↔LP 일관성)       ←── Phase A 완료 필요
  ↓
Phase D (대시보드 + 리포트)    ←── Phase A, B, C 모두 완료 필요
```

### 외부 의존성
| 의존성 | 상태 | 리스크 |
|--------|------|--------|
| Mixpanel API 키 (수강생별 프로젝트) | 확인 필요 | 수강생 프로젝트 접근 권한 |
| Mixpanel Export API 쿼터 | 확인 필요 | 무료 플랜 제한 가능 |
| Gemini 2.5 Pro 쿼터 | 충분 | 현재 소재 분석에서 여유 |

---

## 11. 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| **Mixpanel API 키 접근 제한** | Phase B 지연 | 수강생별 API 키 수집 프로세스 사전 준비. 대안: Mixpanel MCP 서버 |
| **Mixpanel 무료 플랜 쿼터 부족** | 데이터 수집 제한 | 일 배치 수집으로 API 호출 최소화. 필요 시 유료 전환 |
| **UTM→Meta 광고 매핑 불완전** | reach_to_purchase_rate 정확도 저하 | utm_campaign 규칙 표준화. 매핑 불가 트래픽은 "organic"으로 분류 |
| **LP 스크린샷 품질 불균일** | AI 분석 정확도 저하 | 분석 실패 시 재크롤링 → 재분석. confidence 점수 부여 |
| **수강생 40명 데이터 = 소규모** | 벤치마크 통계 신뢰도 낮음 | 전체 풀 벤치마크 우선. 카테고리별 세분화는 데이터 축적 후 |
| **Gemini Vision rate limit** | Phase A 소요 시간 증가 | 4초 간격 유지, 야간 크론 실행. exponential backoff |
| **소재-LP 매핑 누락** | 일관성 분석 불가 | creative_lp_map에 매핑 없는 경우 자동 URL 매칭 로직 추가 |

---

## 12. 일정 (예상)

| Phase | 내용 | 예상 기간 | 선행 조건 |
|-------|------|----------|----------|
| **Phase A** | LP AI 분석 + reference_based | 3~4일 | 없음 (바로 시작 가능) |
| **Phase B** | Mixpanel API 연동 + data_based | 5~7일 | Mixpanel API 키 확보 |
| **Phase C** | 소재↔LP 일관성 분석 | 2~3일 | Phase A 완료 |
| **Phase D** | 대시보드 + 세트 리포트 | 5~7일 | Phase A, B, C 완료 |
| **전체** | | **15~21일** | |

### 권장 실행 순서
1. **즉시**: Phase A 시작 (의존성 없음)
2. **병렬**: Mixpanel API 키 확보 + Phase B 준비
3. **Phase A 완료 후**: Phase C 시작 (병렬로 Phase B 진행 중)
4. **Phase A+B+C 완료 후**: Phase D (대시보드)

---

## 부록: 기존 설계서 참조

| 문서 | 경로 | 역할 |
|------|------|------|
| LP 분석 v2 설계 | `docs/02-design/features/lp-analysis-v2.design.md` | Phase A 상세 설계 |
| LP 데이터 분석 설계 | `docs/02-design/features/lp-data-analysis.design.md` | Phase B 상세 설계 |
| 소재↔LP 일관성 설계 | `docs/02-design/features/creative-lp-alignment.design.md` | Phase C 상세 설계 |
| Mixpanel SDK 기획 | `docs/01-plan/features/mixpanel-sdk.plan.md` | 텍소노미 참조 |
| Mixpanel SDK 설계 | `docs/02-design/features/mixpanel-sdk.design.md` | SDK 구조 참조 |
| LP 미디어 다운로드 | `docs/01-plan/features/lp-media-download.plan.md` | 범위 밖 (별도) |
| 소재 분석 v3 목업 | `docs/mockup/creative-analysis-v3.html` | Phase D UI 참고 |
| 총가치각도기 지표 | `src/lib/protractor/metric-groups.ts` | 광고 지표 정의 |
