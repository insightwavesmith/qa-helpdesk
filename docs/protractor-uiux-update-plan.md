# 총가치각도기 UI/UX 업데이트 계획서

> 작성: 2026-03-19 | 기준: 목업 HTML + 현재 코드 분석
> 참고: mockup (4탭 전체), architecture (AI 분석 아키텍처), plan (소재분석×벤치마크 연동)

---

## 1. 현재 코드 구조 분석

### 1.1 탭 구조 (현재 3탭)

| 탭 | 경로 | 파일 | 설명 |
|---|---|---|---|
| 대시보드 | `/protractor` | `real-dashboard.tsx` | T3 점수 + 성과요약 + 콘텐츠랭킹 |
| 소재 분석 | `/protractor/creatives` | `creative-analysis.tsx` | L1~L4 개별소재 + 포트폴리오 + 경쟁사검색 |
| 경쟁사 분석 | `/protractor/competitor` | `competitor-dashboard.tsx` | Meta Ad Library 검색 + 모니터링 |

### 1.2 파일 맵 (protractor 디렉토리)

```
src/app/(main)/protractor/
├── page.tsx                     # role 기반 분기 (admin→전체, student→본인)
├── layout.tsx                   # ProtractorTabNav 포함
├── loading.tsx                  # 로딩 UI
├── real-dashboard.tsx           # 실제 대시보드 (클라이언트)
├── sample-dashboard.tsx         # 미연결 사용자용 샘플
├── protractor-tab-nav.tsx       # 탭 네비게이션
│
├── creatives/
│   ├── page.tsx                 # 서버 컴포넌트
│   └── creative-analysis.tsx    # 3개 서브탭 (개별/포트폴리오/경쟁사비교)
│
├── competitor/
│   ├── page.tsx                 # 서버 컴포넌트
│   └── competitor-dashboard.tsx # 키워드/브랜드 검색 + 모니터링
│       └── components/          # search-bar, ad-card 등 8개 파일
│
└── components/                  # 공유 컴포넌트
    ├── account-selector.tsx
    ├── period-tabs.tsx
    ├── content-ranking.tsx      # 콘텐츠 랭킹 (벤치마크 포함)
    ├── ad-metrics-table.tsx
    ├── benchmark-compare.tsx
    ├── verdict-dot.tsx
    └── utils.ts
```

### 1.3 API 의존성 (현재)

| API 엔드포인트 | 사용처 | 테이블 |
|---|---|---|
| `GET /api/protractor/accounts` | 대시보드 | ad_accounts |
| `GET /api/protractor/insights` | 대시보드 | daily_ad_insights |
| `GET /api/protractor/total-value` | 대시보드 | T3 엔진 계산 |
| `GET /api/protractor/overlap` | 대시보드 | 타겟중복 분석 |
| `POST /api/diagnose` | 대시보드 | ad_diagnosis_cache |
| `GET /api/admin/creative-intelligence` | 소재분석 | creative_intelligence |
| `GET /api/admin/creative-benchmark` | 소재분석 | creative_benchmarks |
| `GET /api/admin/creative-lp-consistency` | 소재분석 | creative_lp_consistency |
| `POST /api/creative/search` | 소재분석 | ad_creative_embeddings |
| `GET /api/competitor/search` | 경쟁사 | SearchAPI.io |
| `GET /api/competitor/monitors` | 경쟁사 | competitor_monitors |

### 1.4 핵심 라이브러리

| 파일 | 역할 |
|---|---|
| `src/lib/protractor/metric-groups.ts` | 14개 지표 정의 (single source of truth) |
| `src/lib/protractor/t3-engine.ts` | T3 점수 계산 엔진 |
| `src/lib/protractor/aggregate.ts` | 데이터 집계 + bm() 판정 |
| `src/lib/diagnosis/engine.ts` | 진단 엔진 (judgeMetric, judgePart) |
| `src/lib/diagnosis/metrics.ts` | PART_METRICS 3부문 14지표 |

---

## 2. 변경 범위

### 2.1 탭 구조 변경

| 현재 (3탭) | 목표 (4탭) | 변경 유형 |
|---|---|---|
| 대시보드 | 대시보드 | **수정** — 목업 디자인 적용 |
| 소재 분석 | 소재 분석 | **대폭 수정** — 히트맵 + 벤치마크 패턴 비교 추가 |
| *(없음)* | 랜딩페이지 | **신규** — LP 구조 분석 + 벤치마크 LP 비교 |
| 경쟁사 분석 | 경쟁사 분석 | **수정** — 1:1 비교 뷰 추가 |

### 2.2 파일별 변경 계획

#### 신규 파일 (10~12개)

| 파일 | 내용 | 예상 줄수 |
|---|---|---|
| `protractor/landing-page/page.tsx` | LP 탭 서버 컴포넌트 | ~30 |
| `protractor/landing-page/lp-analysis.tsx` | LP 분석 메인 (클라이언트) | ~400 |
| `protractor/components/heatmap-overlay.tsx` | L2 히트맵 시각화 | ~250 |
| `protractor/components/gaze-flow-chart.tsx` | 시선 동선 비교 | ~150 |
| `protractor/components/lp-structure-card.tsx` | LP 구조 체크리스트 | ~200 |
| `protractor/components/lp-score-card.tsx` | LP 종합 점수 + AI 제안 | ~200 |
| `protractor/components/element-compare-table.tsx` | 요소별 벤치마크 비교 테이블 | ~180 |
| `protractor/components/competitor-compare-view.tsx` | 경쟁사 1:1 비교 뷰 | ~300 |
| `src/app/api/protractor/lp-analysis/route.ts` | LP 분석 API | ~120 |
| `src/app/api/protractor/saliency/route.ts` | 히트맵 데이터 API | ~100 |
| `src/app/api/protractor/lp-benchmark/route.ts` | LP 벤치마크 API | ~100 |

#### 수정 파일 (8~10개)

| 파일 | 변경 내용 | 예상 변경량 |
|---|---|---|
| `protractor-tab-nav.tsx` | 4탭으로 확장 (랜딩페이지 추가) | +10줄 |
| `creative-analysis.tsx` | 히트맵 섹션 + 벤치마크 패턴 비교 추가 | +300줄 |
| `real-dashboard.tsx` | 목업 디자인 적용 (5개 지표 카드 + 소재 랭킹 테이블) | +100줄 |
| `content-ranking.tsx` | 랭킹 테이블 디자인 업데이트 (색상 배지, 종합 점수) | +80줄 |
| `competitor-dashboard.tsx` | 1:1 비교 뷰 통합 | +150줄 |
| `account-selector.tsx` | 디자인 통일 | +20줄 |
| `period-tabs.tsx` | 디자인 통일 | +20줄 |
| `verdict-dot.tsx` | 3색 판정 확장 (점수 배지) | +30줄 |

#### 삭제 파일

| 파일 | 사유 |
|---|---|
| 없음 | 기존 파일은 유지, 신규 파일 추가 방식 |

### 2.3 예상 총 작업량

| 항목 | 수량 |
|---|---|
| 신규 파일 | 10~12개 |
| 수정 파일 | 8~10개 |
| 신규 줄 수 | ~2,500줄 |
| 수정 줄 수 | ~700줄 |
| 총 변경량 | ~3,200줄 |

---

## 3. 탭별 상세 계획

### 3.1 대시보드 탭 (수정)

**현재**: T3 점수 게이지 + 6개 SummaryCard + ContentRanking (단순 테이블)

**목업 디자인**:
- 상단: 5개 핵심 지표 카드 (총지출, 총노출, 평균CTR vs 벤치마크, 평균ROAS vs 벤치마크, 활성소재수)
- 하단: 소재 랭킹 테이블 (순위 배지 + 벤치마크 색상 + 종합 점수 배지)
- 3개 부문 점수 카드 (기반/참여/전환 — 프로그레스 바)

**변경 사항**:

| 구분 | 현재 | 변경 후 |
|---|---|---|
| 지표 카드 | SummaryCards 6개 (숫자만) | 5개 카드 + 벤치마크 대비 표시 |
| 랭킹 테이블 | ContentRanking (단순 행) | 순위 배지(금/은/동) + 지표별 🟢🟡🔴 + 종합 점수 |
| 부문 점수 | 없음 (T3 게이지만) | 3개 부문 카드 + 프로그레스 바 |

**필요한 API**: 기존 API 활용 (추가 없음)
- `/api/protractor/insights` → 지표 카드
- `/api/diagnose` → 벤치마크 색상 + 부문 점수

**데이터**: 현재 DB에 모두 있음. 추가 수집 불필요.

---

### 3.2 소재 분석 탭 (대폭 수정)

**현재**: 3개 서브탭 (개별소재/포트폴리오/경쟁사비교)
- 개별소재: 카드 그리드 + 우측 상세 (RadarChart + L1태그 + ROAS벤치마크 + LP일관성 + 개선제안)
- 포트폴리오: 4개 요약카드 + 히스토그램 + 훅별/스타일별 ROAS 차트
- 경쟁사비교: 벡터 검색 기반 유사 소재 목록

**목업 디자인 — 개별 소재**:

#### 상단: 소재 분석 (38% 좌 / 60% 우)

**좌측 — 내 소재 카드**:
- 썸네일 (9:16)
- L1 태그 칩 (hook, style, CTA, 자막, 모델)
- 3부문 미니 점수 (기반/참여/전환)

**우측 — AI 분석**:
- 종합 점수 원형 배지 (0~100, 3색)
- 요소별 벤치마크 패턴 비교 테이블 (내 소재 vs 벤치마크 상위 → 🟢일치/🟡개선가능/🔴개선필요)
- AI 개선 제안 (번호 목록 + 예상 효과)

#### 하단: 히트맵 섹션 (38% 좌 / 60% 우) — **신규**

**좌측 — 시선 히트맵**:
- 소재 이미지 위에 히트맵 오버레이 (빨강→파랑 그라디언트)
- 영역 라벨 (Hook텍스트, 제품, CTA, 배경)
- 범례 (집중/보통/약한/무시)

**우측 — 시선 분석**:
- 영역별 시선 집중도 비교 테이블 (내 소재 vs 벤치마크 상위)
- 시선 동선 비교 (벤치마크: Hook→제품→CTA vs 내 소재 동선)
- AI 시선 개선 제안

**필요한 API**:

| API | 상태 | 데이터 소스 |
|---|---|---|
| `GET /api/admin/creative-intelligence` | ✅ 있음 | creative_intelligence |
| `GET /api/admin/creative-benchmark` | ✅ 있음 (ROAS만) | creative_benchmarks |
| `GET /api/admin/creative-lp-consistency` | ✅ 있음 | creative_lp_consistency |
| `GET /api/protractor/saliency?ad_id=X` | ❌ **신규** | creative_saliency_results |
| `GET /api/admin/creative-benchmark` 확장 | ⚠️ **수정** | 3단계 지표 추가 필요 |

**데이터 의존성**:

| 데이터 | DB 테이블 | 현재 상태 |
|---|---|---|
| L1 태그 (hook, style, CTA 등) | creative_intelligence | ✅ 358건 |
| L4 종합 점수 | creative_intelligence | ✅ 358건 |
| L2 히트맵 | creative_saliency_results | ❌ 0건 (배치 미시작) |
| 벤치마크 패턴 통계 | creative_benchmarks | ⚠️ ROAS만 있음, 3단계 미계산 |
| 개선 제안 | creative_intelligence.suggestions | ✅ 있음 |

---

### 3.3 랜딩페이지 탭 (신규)

**목업 디자인 — 38% 좌 / 60% 우**:

#### 좌측 — LP 구조 분석
- URL 입력 + 재크롤링 버튼
- LP 스크린샷 (9:16 폰 목업)
- 구조 체크리스트 (Hero/리뷰/가격/FAQ/CTA/GIF/성분/배송 — ✅/❌/⚠️)
- 소재↔LP 일관성 점수 (0~100)

#### 우측 — AI 분석
- LP 종합 점수 원형 배지 (0~100, 3색)
- 벤치마크 LP 패턴 비교 테이블 (CTA개수, 리뷰섹션, 가격위치, FAQ, 사회적증거, 일관성)
- AI 개선 제안 (CTA 추가, 리뷰 섹션, FAQ 등)

**필요한 API**:

| API | 상태 | 데이터 소스 |
|---|---|---|
| `GET /api/protractor/lp-analysis?ad_id=X` | ❌ **신규** | ad_creative_embeddings + lp_structure_analysis |
| `GET /api/protractor/lp-benchmark` | ❌ **신규** | 벤치마크 LP 패턴 통계 |
| `POST /api/protractor/lp-recrawl` | ❌ **신규** | lp_crawl_queue에 재등록 |
| `GET /api/admin/creative-lp-consistency` | ✅ 있음 | creative_lp_consistency |

**데이터 의존성**:

| 데이터 | DB 테이블 | 현재 상태 |
|---|---|---|
| LP 스크린샷 | ad_creative_embeddings.lp_screenshot_url | ⚠️ 908/1,626건 (56%) |
| LP 헤드라인/가격 | ad_creative_embeddings.lp_headline, lp_price | ⚠️ 908건 |
| LP 구조 분석 (Hero/CTA/리뷰/FAQ) | lp_structure_analysis | ❌ **테이블 미존재** |
| LP 벤치마크 패턴 | (미정) | ❌ **미수집** |
| LP 일관성 점수 | creative_lp_consistency | ✅ 있음 |

---

### 3.4 경쟁사 분석 탭 (수정)

**현재**: 키워드/브랜드 검색 + 광고 카드 목록 + 모니터링 패널

**목업 추가 기능 — 1:1 비교 뷰**:
- 광고 카드에 "내 소재와 비교" 버튼
- 클릭 시 2-컬럼 비교 패널 오픈:
  - 좌: 내 소재 (썸네일 + 메타 + 지표)
  - 우: 경쟁사 소재 (썸네일 + 메타 + 추정 지표)
- AI 인사이트 (장기 게재 = 성과 좋음, CTA 차이점, 리뷰 삽입 전략)

**필요한 API**: 기존 API 활용 + 내 소재 선택 로직
- `/api/competitor/search` → 경쟁사 목록
- `/api/admin/creative-intelligence` → 내 소재 L1 태그 (비교용)

**데이터**: 현재 DB에 있음. 경쟁사 L1 태깅은 온디맨드로 처리.

---

## 4. 데이터 의존성 정리

### 4.1 현재 있는 데이터 (즉시 사용 가능)

| 데이터 | 건수 | 비고 |
|---|---|---|
| daily_ad_insights (광고 성과) | 3,884건 | VIDEO만 |
| benchmarks (업종 벤치마크) | 166건 | 13지표 × ranking 조합 |
| creative_intelligence (L1~L4) | 358건 | 점수 + 태그 + 제안 |
| creative_lp_consistency (일관성) | 있음 | 시각/메시지/교차/총점 |
| ad_creative_embeddings (소재 메타) | 3,096건 | 임베딩 358건 |
| LP 스크린샷 | 908건 | 56% 완료, 배치 진행중 |
| ad_diagnosis_cache (진단 캐시) | 175건 | 14지표 snake_case |
| 경쟁사 광고 (SearchAPI.io) | 실시간 | 캐시 24시간 |

### 4.2 추가 수집/계산 필요 (구현 전 준비)

| 데이터 | 필요 작업 | 우선순위 | 예상 소요 |
|---|---|---|---|
| **L2 히트맵** | Saliency 배치 실행 (0/2,873건) | P0 | Railway 복구 후 자동 |
| **벤치마크 3단계 지표** | benchmark.mjs 확장 (ROAS → 12지표) | P0 | 1 TASK |
| **LP 구조 분석** | lp_structure_analysis 테이블 + Gemini Vision 분석 | P1 | 2 TASK |
| **LP 벤치마크 패턴** | 상위 LP 크롤링 + 패턴 통계 | P2 | 3 TASK |
| **벤치마크 소재 패턴** | 상위 소재 L1 태깅 + 통계화 | P2 | 2 TASK |

---

## 5. 단계별 구현 순서

### Phase 1: 기반 (데이터 준비) — 코드 수정 없음

| # | 작업 | 설명 | 선행조건 |
|---|---|---|---|
| 1-1 | L2 Saliency 배치 완료 | Railway 복구 → predict.py 배치 (2,873건) | Railway 정상화 |
| 1-2 | LP 크롤링 662건 완료 | 중복 제거 적용된 스크립트 실행 | Railway 정상화 |
| 1-3 | benchmark.mjs 3단계 확장 | ROAS만 → 기반/참여/전환 12지표 가중평균 | 없음 |
| 1-4 | LP 구조 분석 테이블 + 스크립트 | lp_structure_analysis 생성 + Gemini Vision 분석 | LP 크롤링 완료 |

### Phase 2: 대시보드 리디자인

| # | 작업 | 파일 | 예상 줄수 |
|---|---|---|---|
| 2-1 | 5개 핵심 지표 카드 | real-dashboard.tsx 수정 | +80 |
| 2-2 | 소재 랭킹 테이블 리디자인 | content-ranking.tsx 수정 | +80 |
| 2-3 | 3부문 점수 카드 (프로그레스 바) | real-dashboard.tsx 수정 | +120 |

### Phase 3: 소재 분석 업그레이드

| # | 작업 | 파일 | 예상 줄수 |
|---|---|---|---|
| 3-1 | 요소별 벤치마크 패턴 비교 테이블 | element-compare-table.tsx (신규) | ~180 |
| 3-2 | 개별소재 좌/우 레이아웃 리팩토링 | creative-analysis.tsx 수정 | +200 |
| 3-3 | 히트맵 오버레이 컴포넌트 | heatmap-overlay.tsx (신규) | ~250 |
| 3-4 | 시선 동선 비교 | gaze-flow-chart.tsx (신규) | ~150 |
| 3-5 | 히트맵 API | api/protractor/saliency/route.ts (신규) | ~100 |
| 3-6 | 벤치마크 API 3단계 확장 | api/admin/creative-benchmark 수정 | +60 |

### Phase 4: 랜딩페이지 탭 신규

| # | 작업 | 파일 | 예상 줄수 |
|---|---|---|---|
| 4-1 | 탭 추가 | protractor-tab-nav.tsx 수정 | +10 |
| 4-2 | LP 분석 페이지 | landing-page/page.tsx (신규) | ~30 |
| 4-3 | LP 분석 메인 | landing-page/lp-analysis.tsx (신규) | ~400 |
| 4-4 | LP 구조 체크리스트 | lp-structure-card.tsx (신규) | ~200 |
| 4-5 | LP 점수 + AI 제안 | lp-score-card.tsx (신규) | ~200 |
| 4-6 | LP 분석 API | api/protractor/lp-analysis/route.ts (신규) | ~120 |
| 4-7 | LP 벤치마크 API | api/protractor/lp-benchmark/route.ts (신규) | ~100 |

### Phase 5: 경쟁사 분석 강화

| # | 작업 | 파일 | 예상 줄수 |
|---|---|---|---|
| 5-1 | 1:1 비교 뷰 | competitor-compare-view.tsx (신규) | ~300 |
| 5-2 | 경쟁사 대시보드 통합 | competitor-dashboard.tsx 수정 | +100 |

### Phase 6: 디자인 통일 + QA

| # | 작업 | 설명 |
|---|---|---|
| 6-1 | 색상/컴포넌트 통일 | 목업 색상 팔레트 + 배지 디자인 |
| 6-2 | 모바일 반응형 | 38%/60% → 100% 스택 |
| 6-3 | 브라우저 QA | Vercel preview + 스크린샷 비교 |

---

## 6. Phase별 우선순위와 의존성

```
Phase 1 (데이터 준비)
  ├── 1-1 L2 배치 ─────────────────────→ Phase 3 히트맵
  ├── 1-2 LP 크롤링 완료 ──────────────→ Phase 4 LP 탭
  ├── 1-3 벤치마크 3단계 ──────────────→ Phase 2 + Phase 3
  └── 1-4 LP 구조 분석 ───────────────→ Phase 4 LP 탭

Phase 2 (대시보드) ←── Phase 1-3 완료 후
  └── 독립 진행 가능

Phase 3 (소재 분석) ←── Phase 1-1, 1-3 완료 후
  ├── 3-1~3-2: 벤치마크 3단계 필요
  └── 3-3~3-5: L2 히트맵 필요

Phase 4 (LP 탭) ←── Phase 1-2, 1-4 완료 후
  └── 전부 LP 데이터 의존

Phase 5 (경쟁사) ←── 독립 진행 가능
  └── Phase 2~4와 병렬

Phase 6 (QA) ←── 모든 Phase 완료 후
```

---

## 7. 데이터 모델 변경

### 7.1 신규 테이블

```sql
-- LP 구조 분석 (Gemini Vision 결과)
CREATE TABLE lp_structure_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id TEXT NOT NULL REFERENCES ad_creative_embeddings(ad_id),
  lp_url TEXT NOT NULL,
  has_hero BOOLEAN DEFAULT false,
  has_reviews BOOLEAN DEFAULT false,
  has_price BOOLEAN DEFAULT false,
  has_faq BOOLEAN DEFAULT false,
  has_gif_video BOOLEAN DEFAULT false,
  has_shipping_info BOOLEAN DEFAULT false,
  has_social_proof BOOLEAN DEFAULT false,
  cta_count INTEGER DEFAULT 0,
  cta_positions TEXT[],          -- ['hero_below', 'mid_scroll', 'bottom']
  price_position TEXT,           -- 'hero_below', 'mid', 'bottom'
  review_structure TEXT,         -- 'photo+text+star', 'text_only', etc
  overall_score INTEGER,         -- 0~100
  analysis_json JSONB,           -- Gemini 원본 분석
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 7.2 기존 테이블 확장

```sql
-- creative_benchmarks에 3단계 지표 추가
-- 현재: element_type, element_value, avg_roas, sample_count
-- 추가: 기반/참여/전환 12개 지표
ALTER TABLE creative_benchmarks
  ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'VIDEO',
  ADD COLUMN IF NOT EXISTS avg_video_p3s_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS avg_thruplay_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS avg_ctr NUMERIC,
  ADD COLUMN IF NOT EXISTS avg_reactions_per_10k NUMERIC,
  ADD COLUMN IF NOT EXISTS avg_comments_per_10k NUMERIC,
  ADD COLUMN IF NOT EXISTS avg_shares_per_10k NUMERIC,
  ADD COLUMN IF NOT EXISTS avg_saves_per_10k NUMERIC,
  ADD COLUMN IF NOT EXISTS avg_click_to_purchase_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS avg_reach_to_purchase_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS avg_checkout_to_purchase_rate NUMERIC;
```

---

## 8. 디자인 시스템 (목업 기준)

### 색상

| 용도 | 현재 | 목업 | 변경 |
|---|---|---|---|
| Primary | #F75D5D | #6c63ff (목업) | **유지 #F75D5D** (프로젝트 규칙) |
| 🟢 양호 | #22c55e | #22a55b | 미세 조정 |
| 🟡 보통 | #eab308 | #f59e0b | 미세 조정 |
| 🔴 미달 | #ef4444 | #e0463a | 미세 조정 |
| 배경 | white | #f5f6fa | 밝은 회색 채택 가능 |
| 카드 | white | white | 유지 |

> 주의: 프로젝트 규칙에 따라 Primary #F75D5D 유지. 목업의 #6c63ff는 적용하지 않음.

### 컴포넌트 패턴 (목업에서 추출)

| 패턴 | 설명 | 사용처 |
|---|---|---|
| 38/60 그리드 | 좌측 소재/LP + 우측 분석 | 소재분석, LP탭 |
| 프로그레스 바 | 6px, 20px radius, 3색 | 부문 점수, 시선 비교 |
| 원형 점수 배지 | 큰 숫자 + 테두리 색상 | 종합 점수 |
| 비교 테이블 | 내 소재 / 벤치마크 / 판정 3컬럼 | 요소비교, LP비교 |
| 칩/태그 | inline-flex, pill shape | L1 태그, 플랫폼 |
| 순위 배지 | 금/은/동/회색 원형 | 소재 랭킹 |

---

## 9. 리스크 및 고려사항

| 리스크 | 영향 | 대응 |
|---|---|---|
| L2 Saliency 0건 | Phase 3 히트맵 불가 | Railway 복구 우선 → 배치 실행 |
| LP 구조 분석 미구현 | Phase 4 LP 탭 데이터 없음 | Phase 1-4에서 스크립트 + 테이블 선작업 |
| 벤치마크 3단계 미계산 | Phase 2~3 벤치마크 비교 불가 | Phase 1-3에서 benchmark.mjs 확장 선작업 |
| LP 크롤링 56% | LP 탭 데이터 부족 | 중복 제거로 효율화, 배치 계속 |
| 대시보드 리디자인 범위 | 기존 T3/SummaryCard 호환성 | 기존 로직 유지, UI만 변경 |

---

## 10. 요약

| 항목 | 내용 |
|---|---|
| 총 변경량 | ~3,200줄 (신규 2,500 + 수정 700) |
| 신규 파일 | 10~12개 |
| 수정 파일 | 8~10개 |
| 신규 API | 3개 (saliency, lp-analysis, lp-benchmark) |
| 신규 DB 테이블 | 1개 (lp_structure_analysis) |
| 기존 테이블 확장 | 1개 (creative_benchmarks 3단계 지표) |
| 선행 데이터 작업 | 4개 (L2 배치, LP 크롤링, 벤치마크 확장, LP 구조 분석) |
| 권장 구현 순서 | Phase 1(데이터) → 2(대시보드) → 3(소재) → 4(LP) → 5(경쟁사) → 6(QA) |
| 최우선 차단 요인 | Railway 복구 (L2 + LP 배치), benchmark.mjs 3단계 확장 |
