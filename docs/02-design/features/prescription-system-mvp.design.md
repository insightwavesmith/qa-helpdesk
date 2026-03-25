# 처방 시스템 MVP 설계서

> 작성일: 2026-03-25
> 작성자: CTO팀 (Leader)
> 상태: Design 완료
> 기반 문서: `docs/01-plan/features/prescription-system-mvp.plan.md`
> 선행 조건: 5축 배치 완료 (현재 16% → 90%+ 필요)

---

## 1. 데이터 모델

### 1.1 prescription_patterns 테이블 (신규)

5축 분석 속성별 성과 패턴을 집계하여 축2(실데이터 패턴) 역할을 수행하는 테이블.

```sql
CREATE TABLE prescription_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 속성 식별
  attribute TEXT NOT NULL,         -- analysis_json 속성 경로 (ATTRIBUTE_AXIS_MAP.attribute와 매핑)
                                   -- 예: 'hook.hook_type', 'text.cta_text', 'psychology.emotion'
  value TEXT NOT NULL,             -- 속성값 (예: 'problem', 'curiosity', 'timer', 'benefit')
  axis TEXT NOT NULL,              -- 5축 분류 ('visual'|'text'|'psychology'|'quality'|'hook')
                                   -- ATTRIBUTE_AXIS_MAP.axis와 일치

  -- 성과 지표
  metric TEXT NOT NULL,            -- 성과 지표 키 (METRIC_GROUPS 기준)
                                   -- 'ctr', 'video_p3s_rate', 'engagement_per_10k',
                                   -- 'click_to_purchase_rate', 'roas' 등
  avg_value NUMERIC,               -- 이 속성값의 지표 평균
  median_value NUMERIC,            -- 이 속성값의 지표 중위값
  sample_count INTEGER NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'low',  -- 'high'(N>=30) / 'medium'(N>=10) / 'low'(N<10)
  lift_vs_average NUMERIC,         -- 전체 평균 대비 lift%
                                   -- = (속성평균 - 전체평균) / 전체평균 × 100

  -- 메타
  category TEXT,                   -- 업종별 ('beauty', 'fashion', 'food' 등)
                                   -- NULL이면 전체(ALL) 패턴
  source TEXT NOT NULL DEFAULT 'internal',  -- 'internal'(우리 데이터) / 'motion'(글로벌, 추후)
  calculated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 중복 방지 (같은 속성+값+지표+카테고리 조합은 upsert)
  UNIQUE(attribute, value, metric, category, source)
);

-- ── 인덱스 전략 ──
-- 처방 API에서 특정 속성의 성과 패턴을 조회하는 쿼리 최적화
CREATE INDEX idx_pp_attr_value ON prescription_patterns(attribute, value);
-- 특정 지표 기준 조회 (예: CTR 관련 패턴만)
CREATE INDEX idx_pp_metric ON prescription_patterns(metric);
-- 카테고리 필터링 (업종별 패턴 조회)
CREATE INDEX idx_pp_category ON prescription_patterns(category);
-- 복합 인덱스: 처방 API의 주요 쿼리 패턴 (속성+카테고리+신뢰도)
CREATE INDEX idx_pp_lookup ON prescription_patterns(attribute, category, confidence);

-- ── RLS 정책 ──
-- prescription_patterns는 읽기 전용 집계 테이블 (개인 데이터 아님)
-- service_role만 INSERT/UPDATE, authenticated 사용자는 SELECT만
ALTER TABLE prescription_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prescription_patterns_select" ON prescription_patterns
  FOR SELECT TO authenticated USING (true);
```

#### 카테고리 fallback 로직

```
1. 소재의 category 확인 (creative.category)
2. prescription_patterns에서 해당 category의 패턴 조회
3. 해당 카테고리의 sample_count < 10인 경우:
   → category IS NULL (전체 ALL 패턴)로 fallback
4. ALL 패턴도 없으면:
   → 축2 데이터 없이 축1(레퍼런스 원론)만으로 처방 생성
```

### 1.2 기존 테이블 참조 관계 (수정 없음)

#### creative_media (분석 결과 소스)

| 컬럼 | 타입 | 용도 |
|------|------|------|
| `id` | UUID | PK |
| `creative_id` | UUID | FK → creatives |
| `media_url` | TEXT | 원본 이미지 URL |
| `storage_url` | TEXT | GCS 저장 URL (우선 사용) |
| `ad_copy` | TEXT | 광고 카피 원문 |
| `media_type` | TEXT | 'IMAGE', 'VIDEO', 'CAROUSEL' |
| `analysis_json` | JSONB | **5축 분석 결과** (핵심) |
| `saliency_url` | TEXT | DeepGaze 히트맵/JSON URL |
| `video_analysis` | JSONB | 영상 시선 분석 결과 |
| `embedding` | vector(3072) | 이미지 임베딩 (유사소재 검색용) |
| `text_embedding` | vector(3072) | 카피 텍스트 임베딩 |

**analysis_json 구조** (deepgaze-gemini 크론 출력):

```json
{
  "hook_strength": {
    "score": 0.75,
    "reason": "제품 클로즈업으로 즉시 주목",
    "hook_type": "benefit"
  },
  "attention_flow": {
    "score": 0.6,
    "pattern": "좌상단 → 중앙 → CTA",
    "cta_reached": true
  },
  "message_clarity": {
    "score": 0.8,
    "core_message": "50% 할인 이벤트",
    "complexity": "low"
  },
  "visual_impact": {
    "score": 0.7,
    "dominant_element": "제품 이미지",
    "contrast": "high"
  },
  "cta_effectiveness": {
    "score": 0.5,
    "cta_text": "자세히 보기",
    "visibility": "medium"
  },
  "overall_score": 0.67,
  "strengths": ["시선 흐름이 자연스럽게 CTA까지 도달"],
  "weaknesses": ["CTA 문구가 모호함"],
  "format": "image",
  "style": "professional",
  "deepgaze_context": {
    "cta_attention_score": 0.12,
    "dominant_region": "center",
    "top_fixation": { "x": 0.45, "y": 0.3, "ratio": 0.18 }
  }
}
```

#### creative_saliency (시선 데이터)

| 컬럼 | 타입 | 용도 |
|------|------|------|
| `ad_id` | TEXT | 광고 ID |
| `account_id` | TEXT | 계정 ID |
| `target_type` | TEXT | 'image' / 'video' |
| `cta_attention_score` | NUMERIC | CTA 주목도 (0~1) |
| `cognitive_load` | NUMERIC | 인지 부하 (0~1) |
| `top_fixations` | JSONB | 주요 시선 고정점 배열 |
| `attention_map_url` | TEXT | 히트맵 이미지 URL |
| `analyzed_at` | TIMESTAMPTZ | 분석 시각 |

#### daily_ad_insights (성과 지표)

| 주요 컬럼 | 용도 |
|-----------|------|
| `ad_id`, `account_id`, `date_start` | 식별 |
| `impressions`, `clicks`, `spend` | 기본 지표 |
| `website_purchase_value`, `purchases` | 전환 지표 |
| `video_p3s`, `video_view`, `thruplay` | 영상 지표 |
| `reactions`, `comments`, `shares`, `saves` | 참여 지표 |
| `initiate_checkout` | 결제 시작 |

#### 임베딩 유사소재 검색

> **참고**: Plan에서 `ad_creative_embeddings` 테이블을 언급하지만, 실제 코드베이스에서는 `creative_media.embedding` (vector(3072)) 컬럼에 임베딩이 저장되어 있음. 유사소재 검색은 `creative_media.embedding` 기반 코사인 유사도로 수행한다.

검색 방법: 대상 소재의 embedding과 다른 소재의 embedding 간 코사인 유사도 계산. `creative-analyzer.ts`의 `cosineSimilarity()` 함수 패턴 활용.

### 1.3 TypeScript 타입 정의

```typescript
// ── src/types/prescription.ts (신규 파일) ──

/** 처방 API 요청 */
export interface PrescriptionRequest {
  creative_media_id: string;
}

/** 처방 API 응답 (전체) */
export interface PrescriptionResponse {
  creative_media_id: string;
  ad_id: string;
  account_id: string;
  /** 소재 카테고리 분류 */
  ad_category: AdCategory;
  /** 고객 여정 4단계 요약 */
  customer_journey_summary: CustomerJourneySummary;
  /** 약점 분석 (하위 30% 축) */
  weakness_analysis: WeaknessAnalysis[];
  /** Top 3 처방 (impact 순 정렬) */
  top3_prescriptions: Prescription[];
  /** 처방 생성 메타 정보 */
  meta: PrescriptionMeta;
}

/** 소재 카테고리 분류 (Gemini 출력) */
export interface AdCategory {
  format: string;        // 포맷 (이미지/카드뉴스/리뷰형 등)
  hook_tactic: string;   // 훅 유형 (문제제기/호기심/혜택 등)
  messaging: string;     // 메시징 앵글
  audience: string;      // 추정 타겟
}

/** 고객 여정 4단계 요약 */
export interface CustomerJourneySummary {
  /** 감각 단계: 보고 + 듣고 → 3초시청률, 첫 인상 */
  sensation: string;
  /** 사고 단계: 느끼고 + 판단 → 참여(좋아요/댓글/공유) */
  thinking: string;
  /** 행동(클릭) 단계: CTR, 결제시작율 */
  action_click: string;
  /** 행동(구매) 단계: 구매전환율, ROAS */
  action_purchase: string;
}

/** 약점 분석 항목 */
export interface WeaknessAnalysis {
  /** 5축 분류 */
  axis: "visual" | "text" | "psychology" | "quality" | "hook";
  /** 속성 경로 (예: 'text.cta_text') */
  attribute: string;
  /** 속성 한글명 */
  attribute_label: string;
  /** 현재 백분위 (0~100) */
  current_percentile: number;
  /** 문제 설명 (한국어, 구체적) */
  issue: string;
  /** 벤치마크 상위권 대비 */
  benchmark_comparison: string;
  /** 영향받는 성과 그룹 */
  affects_groups: ("foundation" | "engagement" | "conversion")[];
}

/** 개별 처방 */
export interface Prescription {
  rank: 1 | 2 | 3;
  /** 처방 제목 (한 줄, 한국어) */
  title: string;
  /** 구체적 실행 액션 (한국어, 실전적) */
  action: string;
  /** 고객 여정 단계 매핑 */
  journey_stage: "감각" | "사고" | "행동(클릭)" | "행동(구매)";
  /** 기대 개선 효과 (정량적) */
  expected_impact: string;
  /** 축1 근거 (레퍼런스 원론) */
  evidence_axis1: string;
  /** 축2 근거 (내부 데이터 패턴) */
  evidence_axis2: string;
  /** 실행 난이도 */
  difficulty: "쉬움" | "보통" | "어려움";
  /** 난이도 부연 설명 */
  difficulty_reason: string;
}

/** 처방 메타 정보 */
export interface PrescriptionMeta {
  /** Gemini 모델 */
  model: string;
  /** 응답 시간 (ms) */
  latency_ms: number;
  /** 축2 패턴 사용 여부 */
  axis2_used: boolean;
  /** 사용된 패턴 수 */
  patterns_count: number;
  /** 카테고리 fallback 여부 */
  category_fallback: boolean;
  /** 유사 벤치마크 소재 수 */
  similar_count: number;
}

/** prescription_patterns DB 행 타입 */
export interface PrescriptionPattern {
  id: string;
  attribute: string;
  value: string;
  axis: string;
  metric: string;
  avg_value: number | null;
  median_value: number | null;
  sample_count: number;
  confidence: "high" | "medium" | "low";
  lift_vs_average: number | null;
  category: string | null;
  source: "internal" | "motion";
  calculated_at: string;
}

/** 처방 API 에러 응답 */
export interface PrescriptionError {
  error: string;
  code: PrescriptionErrorCode;
  details?: string;
}

export type PrescriptionErrorCode =
  | "UNAUTHORIZED"           // 인증 실패
  | "FORBIDDEN"              // 권한 없음 (계정 소유권)
  | "CREATIVE_NOT_FOUND"     // 소재 없음
  | "ANALYSIS_NOT_READY"     // 5축 분석 미완료
  | "PATTERNS_EMPTY"         // prescription_patterns 비어있음
  | "GEMINI_TIMEOUT"         // Gemini API 15초 초과
  | "GEMINI_ERROR"           // Gemini API 호출 실패
  | "PARSE_ERROR"            // Gemini 응답 JSON 파싱 실패
  | "INTERNAL_ERROR";        // 내부 서버 에러
```

---

## 2. API 설계

### 2.1 POST /api/protractor/prescription

#### 기본 정보

| 항목 | 값 |
|------|-----|
| Method | `POST` |
| Path | `/api/protractor/prescription` |
| 인증 | Firebase Auth (requireProtractorAccess 패턴) |
| 권한 | `student`, `member`, `admin` |
| 계정 검증 | `verifyAccountOwnership` (ADR-001) |
| 타임아웃 | 15초 (Gemini 호출 포함) |

#### 요청

```typescript
// Content-Type: application/json
{
  "creative_media_id": "uuid-of-creative-media-row"
}
```

#### 응답 (200 OK)

```json
{
  "creative_media_id": "abc-123",
  "ad_id": "23841234567890",
  "account_id": "act_123456789",
  "ad_category": {
    "format": "제품 클로즈업 이미지",
    "hook_tactic": "혜택 직접 제시",
    "messaging": "가격 할인 앵글",
    "audience": "뷰티 관심 여성 25-35"
  },
  "customer_journey_summary": {
    "sensation": "제품 이미지의 색감이 좋아 시선을 끌지만, 첫 0.5초 내 핵심 메시지 전달이 약합니다. 3초시청률 하위 40%.",
    "thinking": "할인율은 명시되어 있으나 사회적 증거(리뷰, 판매량)가 부재하여 신뢰 형성이 어렵습니다.",
    "action_click": "CTA 문구 '자세히 보기'가 클릭 동기를 유발하지 못합니다. 구체적 혜택이 CTA에 반영되지 않음.",
    "action_purchase": "LP와의 메시지 일관성은 양호하나, 긴급성 요소가 없어 구매 결정 지연 가능성이 높습니다."
  },
  "weakness_analysis": [
    {
      "axis": "text",
      "attribute": "text.cta_text",
      "attribute_label": "CTA 문구",
      "current_percentile": 22,
      "issue": "CTA 문구 '자세히 보기'가 구체적 혜택을 전달하지 못해 클릭 동기 부여 실패",
      "benchmark_comparison": "상위 20% 소재는 구체적 혜택 명시형 CTA 사용 (예: '50% 할인 확인하기')",
      "affects_groups": ["conversion"]
    },
    {
      "axis": "psychology",
      "attribute": "psychology.urgency",
      "attribute_label": "긴급성",
      "current_percentile": 15,
      "issue": "한정 시간/수량 등 긴급성 요소가 전혀 없어 구매 결정 지연",
      "benchmark_comparison": "상위 20% 소재의 72%가 긴급성 요소를 1개 이상 포함",
      "affects_groups": ["conversion"]
    }
  ],
  "top3_prescriptions": [
    {
      "rank": 1,
      "title": "CTA 문구를 혜택 구체화형으로 변경",
      "action": "'자세히 보기' → '50% 할인 지금 확인하기'로 변경하세요. 소재 하단 CTA 영역에 할인율과 행동 동사를 함께 넣으세요.",
      "journey_stage": "행동(클릭)",
      "expected_impact": "CTR +0.5~0.8%p (축2 패턴 기반 lift: +34%)",
      "evidence_axis1": "Meta 공식 가이드: 구체적 혜택 CTA가 모호한 CTA 대비 CTR 28% 높음 (Neurons 연구)",
      "evidence_axis2": "내부 데이터: CTA 유형='혜택명시'의 avg_ctr 2.8% vs 전체 평균 2.1% (N=45, 신뢰도 high)",
      "difficulty": "쉬움",
      "difficulty_reason": "텍스트만 수정, 이미지 재제작 불필요"
    },
    {
      "rank": 2,
      "title": "한정 시간 오퍼 긴급성 추가",
      "action": "소재 상단에 '오늘까지' 또는 '선착순 100명' 배지를 추가하세요. 빨간색(#F75D5D) 배경에 흰색 텍스트 권장.",
      "journey_stage": "행동(구매)",
      "expected_impact": "결제시작율 +0.3~0.5%p",
      "evidence_axis1": "Vidmob 연구: 긴급성 요소가 있는 소재의 전환율이 평균 18% 높음",
      "evidence_axis2": "내부 데이터: urgency='timer'의 avg_click_to_checkout_rate 3.2% vs 전체 평균 2.6% (N=32, 신뢰도 high)",
      "difficulty": "쉬움",
      "difficulty_reason": "텍스트/배지 오버레이만 추가"
    },
    {
      "rank": 3,
      "title": "사회적 증거(리뷰 수) 추가",
      "action": "소재 중하단에 '구매 후기 2,847건' 또는 별점 4.8/5 표시를 추가하세요. 실제 데이터 기반 수치만 사용.",
      "journey_stage": "사고",
      "expected_impact": "참여율 +15~25% (댓글/공유 증가)",
      "evidence_axis1": "Meta Best Practice: 사회적 증거가 있는 소재의 참여율이 30% 높음",
      "evidence_axis2": "내부 데이터: social_proof='리뷰수'의 avg_engagement_per_10k 85.3 vs 전체 평균 62.1 (N=28, 신뢰도 medium)",
      "difficulty": "보통",
      "difficulty_reason": "이미지 편집 필요 (텍스트 + 별점 아이콘 배치)"
    }
  ],
  "meta": {
    "model": "gemini-3-pro-preview",
    "latency_ms": 4230,
    "axis2_used": true,
    "patterns_count": 12,
    "category_fallback": false,
    "similar_count": 3
  }
}
```

#### 에러 응답

| HTTP Status | code | 상황 | 메시지 (한국어) |
|:-----------:|------|------|----------------|
| 401 | `UNAUTHORIZED` | 미인증 | "인증이 필요합니다." |
| 403 | `FORBIDDEN` | 계정 소유권 없음 | "해당 광고계정에 접근 권한이 없습니다." |
| 404 | `CREATIVE_NOT_FOUND` | 소재 없음 | "소재를 찾을 수 없습니다." |
| 422 | `ANALYSIS_NOT_READY` | 5축 분석 미완료 | "이 소재는 아직 AI 분석이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요." |
| 500 | `PATTERNS_EMPTY` | 패턴 테이블 비어있음 | "처방 기준 데이터가 준비 중입니다." |
| 504 | `GEMINI_TIMEOUT` | 15초 초과 | "AI 처방 생성에 시간이 걸리고 있습니다. 잠시 후 다시 시도해 주세요." |
| 502 | `GEMINI_ERROR` | Gemini API 실패 | "AI 서비스에 일시적 문제가 있습니다. 잠시 후 다시 시도해 주세요." |
| 500 | `PARSE_ERROR` | JSON 파싱 실패 | "처방 결과 생성 중 오류가 발생했습니다." |
| 500 | `INTERNAL_ERROR` | 기타 서버 에러 | "서버 오류가 발생했습니다." |

#### 처리 흐름 (7단계)

```
요청: POST /api/protractor/prescription { creative_media_id }
  │
  ├─ [인증/권한] requireProtractorAccess() + verifyAccountOwnership()
  │
  ├─ STEP 1: 5축 분석 결과 조회
  │    └─ creative_media WHERE id = creative_media_id
  │    └─ JOIN creatives (ad_id, account_id, category)
  │    └─ analysis_json이 NULL이면 → 422 ANALYSIS_NOT_READY
  │
  ├─ STEP 2: 약점 축 식별
  │    └─ analysis_json에서 5축 각 속성 score 추출
  │    └─ 전체 소재 대비 백분위 계산 (동적 계산 — 아래 상세)
  │    └─ 하위 30% 이하인 축/속성 감지
  │    └─ ATTRIBUTE_AXIS_MAP으로 약점 속성 → affectsGroups 매핑
  │
  ├─ STEP 3: 시선 데이터 조회
  │    └─ creative_saliency WHERE ad_id = {ad_id} AND account_id = {account_id}
  │    └─ cta_attention_score, cognitive_load, top_fixations
  │    └─ 없으면 analysis_json.deepgaze_context fallback
  │
  ├─ STEP 4: prescription_patterns 패턴 조회 (축2)
  │    └─ 약점 속성의 attribute + value로 매칭
  │    └─ 카테고리 fallback 로직 적용
  │    └─ confidence='low' 제외 (medium 이상만)
  │    └─ 패턴 0건이면 axis2_used=false로 설정
  │
  ├─ STEP 5: 유사 벤치마크 소재 검색 (Top 3)
  │    └─ creative_media.embedding 기반 코사인 유사도
  │    └─ 동일 account_id 제외 (타 계정 벤치마크만)
  │    └─ 유사도 상위 3건의 5축 결과 + 성과 지표 조회
  │    └─ 성과가 좋은 유사소재의 속성 diff 계산
  │
  ├─ STEP 6: Gemini 프롬프트 구성 + 호출
  │    └─ 시스템 프롬프트 (역할, 톤, 절대 금지 규칙)
  │    └─ 축1: prescription-prompt-guide (고정 텍스트)
  │    └─ 축2: prescription_patterns 패턴 데이터 (동적)
  │    └─ 입력 데이터: analysis_json + 시선 + 성과 + 유사소재
  │    └─ 소재 이미지 멀티모달 입력
  │    └─ 출력: JSON structured output
  │    └─ timeout 15초, 실패 시 1회 retry (2초 대기)
  │
  └─ STEP 7: impact 순 정렬 + 응답 반환
       └─ top3_prescriptions를 expected_impact 기반 정렬
       └─ PrescriptionResponse 구성 후 반환
```

#### STEP 2 백분위 계산 상세

`score_percentiles` 테이블이 현재 코드베이스에 존재하지 않으므로, 동적 백분위 계산을 수행한다.

```typescript
// 5축 각 속성의 score를 전체 분석 완료 소재 대비 백분위로 환산
// 1. creative_media에서 analysis_json NOT NULL인 전체 소재의 해당 속성 score 조회
// 2. 정렬 후 현재 소재의 위치 = 백분위
// 3. 캐시: 1시간 TTL (메모리 또는 Redis)

async function calculatePercentile(
  svc: SupabaseClient,
  attribute: string,    // 예: 'hook_strength.score'
  currentScore: number,
): Promise<number> {
  // 전체 소재의 해당 속성 score 배열 조회 (1시간 캐시)
  // percentile = (currentScore보다 낮은 소재 수 / 전체 소재 수) × 100
}
```

#### STEP 5 유사소재 검색 상세

```typescript
// creative_media.embedding 기반 코사인 유사도 검색
// creative-analyzer.ts의 cosineSimilarity() 함수 재사용
//
// 검색 조건:
//   - 동일 account_id 제외 (타 계정 벤치마크)
//   - embedding NOT NULL
//   - analysis_json NOT NULL (5축 분석 완료)
//   - 유사도 >= 0.5 (너무 다른 소재 제외)
//
// 정렬: 유사도 DESC → 상위 3건 반환
// 각 건에 대해: 5축 score + daily_ad_insights 성과 JOIN
```

### 2.2 패턴 추출 스크립트

#### 파일: `scripts/extract-prescription-patterns.mjs`

```
실행: node scripts/extract-prescription-patterns.mjs [--category beauty] [--dry-run]
크론: 매주 화요일 04:00 UTC (Cloud Scheduler, collect-benchmarks 후)
소요: ~30초 (SQL 집계만, Gemini 호출 없음)
```

#### 추출 로직

```sql
-- 1단계: analysis_json에서 5축 속성값 추출 + 성과 지표 JOIN

WITH attribute_values AS (
  SELECT
    cm.id AS media_id,
    c.ad_id,
    c.account_id,
    c.category,
    -- Hook 축
    cm.analysis_json->'hook_strength'->>'hook_type' AS "hook.hook_type",
    cm.analysis_json->'visual_impact'->>'contrast' AS "visual.color_scheme",
    cm.analysis_json->'visual_impact'->>'dominant_element' AS "visual.product_visibility",
    cm.analysis_json->'message_clarity'->>'complexity' AS "text.readability",
    cm.analysis_json->'cta_effectiveness'->>'cta_text' AS "text.cta_text",
    cm.analysis_json->'cta_effectiveness'->>'visibility' AS "text.cta_visibility",
    cm.analysis_json->>'style' AS "hook.visual_style",
    -- Score 값
    (cm.analysis_json->'hook_strength'->>'score')::numeric AS hook_score,
    (cm.analysis_json->'visual_impact'->>'score')::numeric AS visual_score,
    (cm.analysis_json->'message_clarity'->>'score')::numeric AS text_score,
    (cm.analysis_json->'cta_effectiveness'->>'score')::numeric AS cta_score,
    (cm.analysis_json->>'overall_score')::numeric AS overall_score
  FROM creative_media cm
  JOIN creatives c ON cm.creative_id = c.id
  WHERE cm.analysis_json IS NOT NULL
    AND c.is_active = true
),

-- 2단계: 성과 데이터 (최근 30일 집계)
ad_performance AS (
  SELECT
    ad_id,
    account_id,
    -- METRIC_GROUPS 기준 지표 계산
    SUM(clicks)::numeric / NULLIF(SUM(impressions), 0) * 100 AS ctr,
    SUM(video_p3s)::numeric / NULLIF(SUM(impressions), 0) * 100 AS video_p3s_rate,
    SUM(reactions + comments + shares + saves)::numeric / NULLIF(SUM(impressions), 0) * 10000 AS engagement_per_10k,
    SUM(purchases)::numeric / NULLIF(SUM(clicks), 0) * 100 AS click_to_purchase_rate,
    SUM(initiate_checkout)::numeric / NULLIF(SUM(clicks), 0) * 100 AS click_to_checkout_rate,
    SUM(website_purchase_value)::numeric / NULLIF(SUM(spend), 0) AS roas
  FROM daily_ad_insights
  WHERE date_start >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY ad_id, account_id
)

-- 3단계: 속성별 성과 집계 → prescription_patterns UPSERT
-- (각 attribute+value+metric 조합에 대해)
SELECT
  attribute,
  value,
  metric,
  AVG(metric_value) AS avg_value,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY metric_value) AS median_value,
  COUNT(*) AS sample_count,
  CASE
    WHEN COUNT(*) >= 30 THEN 'high'
    WHEN COUNT(*) >= 10 THEN 'medium'
    ELSE 'low'
  END AS confidence,
  (AVG(metric_value) - overall_avg) / NULLIF(overall_avg, 0) * 100 AS lift_vs_average,
  category
FROM unpivoted_data
GROUP BY attribute, value, metric, category;
```

#### UPSERT 전략

```javascript
// ON CONFLICT (attribute, value, metric, category, source) DO UPDATE
// 기존 행 덮어쓰기 (주 1회 갱신이므로 이전 데이터 대체)
// calculated_at = NOW()

const upsertQuery = `
  INSERT INTO prescription_patterns
    (attribute, value, axis, metric, avg_value, median_value,
     sample_count, confidence, lift_vs_average, category, source, calculated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'internal', NOW())
  ON CONFLICT (attribute, value, metric, category, source)
  DO UPDATE SET
    axis = EXCLUDED.axis,
    avg_value = EXCLUDED.avg_value,
    median_value = EXCLUDED.median_value,
    sample_count = EXCLUDED.sample_count,
    confidence = EXCLUDED.confidence,
    lift_vs_average = EXCLUDED.lift_vs_average,
    calculated_at = NOW()
`;
```

#### analysis_json → ATTRIBUTE_AXIS_MAP 매핑 규칙

analysis_json의 구조가 ATTRIBUTE_AXIS_MAP의 attribute와 직접 대응하지 않으므로 매핑 테이블 필요:

| ATTRIBUTE_AXIS_MAP.attribute | analysis_json 경로 | 추출 방법 |
|-----|-----|-----|
| `hook.hook_type` | `hook_strength.hook_type` | 직접 추출 |
| `hook.visual_style` | `style` | 최상위 필드 |
| `hook.composition` | `attention_flow.pattern` | 패턴 분류 필요 |
| `visual.color_scheme` | `visual_impact.contrast` | contrast를 프록시로 사용 |
| `visual.product_visibility` | `visual_impact.dominant_element` | 카테고리화 필요 |
| `text.headline` | `message_clarity.core_message` | 유형 분류 필요 |
| `text.cta_text` | `cta_effectiveness.cta_text` | CTA 유형 분류 |
| `text.readability` | `message_clarity.complexity` | 직접 매핑 (high/medium/low) |
| `psychology.emotion` | 별도 추출 필요 | Gemini 분석 확장 시 추가 |
| `psychology.social_proof` | 별도 추출 필요 | 향후 analysis_json에 추가 |
| `psychology.urgency` | 별도 추출 필요 | 향후 analysis_json에 추가 |
| `psychology.authority` | 별도 추출 필요 | 향후 analysis_json에 추가 |
| `quality.production_quality` | `overall_score` | 종합 점수를 프록시로 사용 |
| `quality.brand_consistency` | 별도 추출 필요 | LP 일관성 점수 매핑 |

> **참고**: 현재 analysis_json에 psychology 축 세부 속성(emotion, social_proof, urgency, authority)이 직접 포함되어 있지 않음. MVP에서는 존재하는 속성(hook_type, style, contrast, complexity, cta_text, overall_score 등)만으로 패턴을 추출하고, 5축 배치 분석 프롬프트 확장 시 psychology 세부 속성을 추가하는 것을 권장.

---

## 3. 컴포넌트 구조

### 3.1 처방 탭 UI

기존 `creative-analysis.tsx`의 탭 구조에 "처방" 탭을 추가한다.

#### 파일 구조

```
src/app/(main)/protractor/creatives/
├── creative-analysis.tsx           ← 기존 파일 (탭 추가 — 최소 수정)
├── prescription-tab.tsx            ← 신규: 처방 탭 전체 컨테이너
├── prescription-card.tsx           ← 신규: Top 3 처방 카드
├── weakness-panel.tsx              ← 신규: 약점 축 시각화
├── journey-map.tsx                 ← 신규: 고객 여정 4단계 요약
└── prescription-button.tsx         ← 신규: 처방 생성 버튼

src/hooks/
└── use-prescription.ts             ← 신규: 처방 API 호출 훅
```

#### creative-analysis.tsx 변경 (최소 수정)

```tsx
// 기존 탭 목록에 "처방" 추가
<Tabs defaultValue="individual" className="space-y-6">
  <TabsList className="bg-gray-100">
    <TabsTrigger value="individual">개별 소재</TabsTrigger>
    <TabsTrigger value="portfolio">포트폴리오</TabsTrigger>
    <TabsTrigger value="competitor">경쟁사 비교</TabsTrigger>
    <TabsTrigger value="prescription">처방</TabsTrigger>  {/* 신규 */}
  </TabsList>

  {/* ... 기존 탭 내용 ... */}

  <TabsContent value="prescription">
    <PrescriptionTab
      accountId={selectedAccountId}
      intelligenceData={intelligenceData}
    />
  </TabsContent>
</Tabs>
```

#### PrescriptionTab (prescription-tab.tsx)

```
┌─────────────────────────────────────────────────────────┐
│ 처방 탭 전체 컨테이너                                      │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ 소재 선택 영역                                         │ │
│ │ [소재 목록 (analysis_json이 있는 것만)] [정렬: 점수/ROAS]│ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ─── 선택된 소재가 있을 때 ───                               │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ 소재 미리보기                                          │ │
│ │ [이미지] [5축 레이더 차트] [처방 생성 버튼]               │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ─── 처방 결과가 있을 때 ───                                │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ JourneyMap — 고객 여정 4단계 요약                       │ │
│ │ [감각] → [사고] → [행동(클릭)] → [행동(구매)]            │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ WeaknessPanel — 약점 축 시각화                         │ │
│ │ [5축 바 차트, 하위 30% 빨간 하이라이트]                  │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ PrescriptionCard × 3 (Top 3 처방)                     │ │
│ │ [#1] [#2] [#3]                                        │ │
│ └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

#### PrescriptionCard (prescription-card.tsx)

```
┌──────────────────────────────────────────────────┐
│ #1  CTA 문구를 혜택 구체화형으로 변경               │
│                                                   │
│ ┌─────────────────────────────────────────────┐   │
│ │ 📋 실행 방법                                  │   │
│ │ '자세히 보기' → '50% 할인 지금 확인하기'로     │   │
│ │ 변경하세요.                                    │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ 여정 단계: 행동(클릭)         난이도: 🟢 쉬움       │
│                                                   │
│ 기대 효과: CTR +0.5~0.8%p                         │
│                                                   │
│ ┌─── 근거 ────────────────────────────────────┐   │
│ │ 축1: Meta 가이드 — 구체적 혜택 CTA가 28% 높음│   │
│ │ 축2: 내부 — CTA '혜택명시' avg_ctr 2.8%     │   │
│ └─────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

**디자인 규칙**:
- rank 1: 좌측 세로 바 `#F75D5D` (Primary)
- rank 2: 좌측 세로 바 `#F59E0B` (Amber)
- rank 3: 좌측 세로 바 `#6B7280` (Gray)
- 배경: `bg-white`, 테두리: `border border-gray-200 rounded-xl`
- 난이도 표시: 쉬움=`text-emerald-600`, 보통=`text-amber-600`, 어려움=`text-red-600`
- 폰트: Pretendard

#### WeaknessPanel (weakness-panel.tsx)

5축 각각의 score를 수평 바 차트로 표시하고, 하위 30% 축을 빨간 하이라이트.

```
┌──────────────────────────────────────────────┐
│ 약점 분석                                      │
│                                               │
│ hook     ████████████████████░░  80%  🟢      │
│ visual   ██████████████████░░░░  72%  🟢      │
│ text     ████████░░░░░░░░░░░░░  35%  🔴 약점  │
│ psych    ██████░░░░░░░░░░░░░░░  28%  🔴 약점  │
│ quality  ███████████████████░░░  76%  🟢      │
│                                               │
│ ⚠ text, psychology 축이 하위 30%입니다.        │
│   이 축의 개선이 성과에 가장 큰 영향을 줍니다.   │
└──────────────────────────────────────────────┘
```

- 하위 30% 바: `bg-red-500`
- 나머지 바: `bg-emerald-500`
- 배경: `bg-white`, `rounded-xl`, `p-6`
- "약점" 뱃지: `bg-red-100 text-red-700 text-xs rounded-full px-2 py-0.5`

#### JourneyMap (journey-map.tsx)

고객 여정 4단계를 수평 화살표 플로우로 시각화.

```
┌─────────────────────────────────────────────────────────────┐
│ 고객 여정 분석                                                │
│                                                              │
│  [감각]  →  [사고]  →  [행동(클릭)]  →  [행동(구매)]           │
│   보고+듣고   느끼고+판단   클릭하고        구매하고              │
│                                                              │
│ ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐              │
│ │ 제품    │  │ 할인율  │  │ CTA가  │  │ LP와의  │              │
│ │ 이미지  │  │ 명시   │  │ 모호함  │  │ 일관성  │              │
│ │ 색감   │  │ 되어   │  │ → 개선  │  │ 양호   │              │
│ │ 양호   │  │ 있으나  │  │ 필요   │  │        │              │
│ │        │  │ 신뢰↓  │  │        │  │        │              │
│ └────────┘  └────────┘  └────────┘  └────────┘              │
└─────────────────────────────────────────────────────────────┘
```

- 각 단계 카드: `bg-gray-50 rounded-lg p-4`
- 문제 있는 단계: 상단 보더 `border-t-2 border-red-400`
- 양호한 단계: 상단 보더 `border-t-2 border-emerald-400`
- 화살표: `→` 텍스트 또는 lucide-react ChevronRight 아이콘

#### PrescriptionButton (prescription-button.tsx)

```
┌───────────────────────────────────────┐
│  🔬 처방 생성하기                       │  ← 기본 상태
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│  ⏳ AI가 분석 중입니다... (5/15초)       │  ← 로딩 상태
│  ████████████░░░░░░░░ 진행 바          │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│  ✅ 처방 완료 · 다시 생성               │  ← 완료 상태
└───────────────────────────────────────┘
```

- 기본: `bg-[#F75D5D] hover:bg-[#E54949] text-white font-semibold rounded-lg px-6 py-3`
- 로딩: `bg-gray-100 text-gray-600 cursor-not-allowed` + 프로그레스 바
- 완료: `bg-emerald-50 text-emerald-700 border border-emerald-200`
- "다시 생성" 링크: `text-[#F75D5D] underline text-sm`

### 3.2 상태 관리

#### usePrescription Hook (`src/hooks/use-prescription.ts`)

```typescript
import { useState, useCallback, useRef } from "react";
import type { PrescriptionResponse, PrescriptionError } from "@/types/prescription";

interface UsePrescriptionReturn {
  /** 처방 결과 */
  data: PrescriptionResponse | null;
  /** 로딩 중 여부 */
  isLoading: boolean;
  /** 에러 정보 */
  error: PrescriptionError | null;
  /** 처방 생성 실행 */
  generate: (creativeMediaId: string) => Promise<void>;
  /** 결과 초기화 */
  reset: () => void;
  /** 경과 시간 (ms, 로딩 중 실시간 업데이트용) */
  elapsedMs: number;
}

export function usePrescription(): UsePrescriptionReturn {
  // ... 구현
}
```

#### 클라이언트 캐시 전략

```typescript
// 동일 소재에 대한 재요청 방지
// Map<creative_media_id, PrescriptionResponse>
// 캐시 TTL: 세션 동안 유지 (페이지 이탈 시 초기화)
// "다시 생성" 버튼 클릭 시 캐시 무효화 후 재요청
const prescriptionCache = useRef(new Map<string, PrescriptionResponse>());
```

### 3.3 반응형 레이아웃

| 뷰포트 | 레이아웃 |
|--------|---------|
| 데스크탑 (≥1024px) | 소재 목록 좌측 + 처방 결과 우측 (2컬럼) |
| 태블릿 (768~1023px) | 소재 목록 상단 + 처방 결과 하단 (1컬럼) |
| 모바일 (≤767px) | 소재 목록 (가로 스크롤) + 처방 결과 세로 스택 |

처방 카드 3장:
- 데스크탑: 가로 3열
- 태블릿: 가로 2열 + 1열
- 모바일: 세로 1열 스택

---

## 4. Gemini 프롬프트 설계

### 4.1 프롬프트 구조

처방 생성 Gemini 호출은 단일 `generateContent` 요청으로 구성된다.

#### 파일: `src/lib/protractor/prescription-prompt.ts` (신규)

```
프롬프트 구조:
┌────────────────────────────────────────────────────┐
│ 1. 시스템 프롬프트 (역할, 톤, 절대 금지 규칙)         │
│ 2. 축1: 처방 가이드 고정 텍스트                       │
│ 3. 축2: prescription_patterns 동적 데이터             │
│ 4. 입력 데이터 (5축 + 시선 + 성과 + 유사소재)         │
│ 5. 출력 JSON 스키마                                  │
│ 6. 소재 이미지 (inline_data — 멀티모달)               │
└────────────────────────────────────────────────────┘
```

#### 시스템 프롬프트

```typescript
const SYSTEM_PROMPT = `당신은 메타(Meta) 광고 최적화 전문가입니다.
자사몰 운영자(수강생)에게 1:1 코칭하는 선생님 역할을 합니다.

톤: 실전적, 구체적, 따뜻하지만 날카로운 분석. 학술적/추상적 표현 금지.
목표: 수강생이 바로 실행할 수 있는 구체적 처방 3가지를 제시합니다.

## 절대 금지 규칙 (위반 시 응답 무효)
1. CTA 버튼 추가를 처방하지 마세요. CTA 버튼은 Meta가 자동으로 제공하는 것입니다.
2. 세이프티존 밖 배치를 처방하지 마세요. 모바일 피드에서 잘려서 안 보입니다.
3. 타겟팅 변경을 처방하지 마세요. 이 시스템은 소재 개선만 다룹니다.
4. "더 좋게 하세요", "개선하세요" 같은 추상적 처방을 하지 마세요.
   반드시 "A를 B로 바꾸세요"처럼 구체적 액션을 제시하세요.
5. 입력 데이터에 없는 수치를 인용하지 마세요. 근거 없는 숫자 사용 금지.
6. 영어로 응답하지 마세요. 모든 텍스트는 한국어로 작성하세요.

## 고객 여정 4단계
모든 처방은 반드시 아래 4단계 중 하나와 매핑되어야 합니다:
- 감각: 보고+듣고 → 3초시청률, 첫 인상 (hook, visual, quality 축)
- 사고: 느끼고+판단 → 참여(좋아요/댓글/공유) (psychology, text 축)
- 행동(클릭): CTR, 결제시작율 → (text/CTA, psychology/urgency 축)
- 행동(구매): 구매전환율, ROAS → (LP 일관성, quality 축)`;
```

#### 축1 삽입 위치 (고정 텍스트)

```typescript
// docs/prescription-prompt-guide.md 파일 내용을 프롬프트에 삽입
// 이 파일은 Neurons, Vidmob, Meta 가이드, Motion Bootcamp 등
// 외부 레퍼런스 기반 처방 원론을 정리한 텍스트
//
// 형식:
// ## 축1: 레퍼런스 기반 처방 가이드
//
// ### Hook 개선
// - 문제제기형 훅: 첫 프레임에 고객의 문제를 직접 언급...
// - 호기심형 훅: "이것만 알면" 패턴...
//
// ### CTA 최적화
// - 혜택 명시형: 구체적 숫자(할인율, 무료배송)를 CTA에 포함...
// - 긴급성 부여: "오늘까지", "선착순" 등...
//
// ### 시각 요소
// - 제품 클로즈업: 첫 0.5초 내 제품 인식 가능해야...
// - 대비: 배경과 제품 간 색상 대비 높일 것...
// ...

const AXIS1_GUIDE = await loadPrescriptionGuide();
// 파일 경로: docs/prescription-prompt-guide.md
```

#### 축2 삽입 위치 (동적 데이터)

```typescript
// prescription_patterns에서 조회한 패턴을 텍스트로 변환
function formatAxis2Patterns(patterns: PrescriptionPattern[]): string {
  if (patterns.length === 0) return "축2 데이터 없음 (축1 레퍼런스만으로 처방 생성)";

  let text = "## 축2: 내부 데이터 기반 성과 패턴\n\n";

  // 속성별 그룹핑
  const grouped = groupBy(patterns, p => p.attribute);

  for (const [attr, pats] of Object.entries(grouped)) {
    text += `### ${attr}\n`;
    for (const p of pats) {
      text += `- ${p.value}: ${p.metric} 평균 ${p.avg_value?.toFixed(2)} `;
      text += `(전체 대비 ${p.lift_vs_average?.toFixed(1)}%, `;
      text += `N=${p.sample_count}, 신뢰도=${p.confidence})\n`;
    }
    text += "\n";
  }

  return text;
}
```

#### 입력 데이터 템플릿

```typescript
function buildInputData(params: {
  analysisJson: Record<string, unknown>;
  saliencyData: SaliencyData | null;
  performance: AdPerformance;
  benchmarkDiff: BenchmarkDiff;
  similarCreatives: SimilarCreative[];
  adCopy: string | null;
  category: string | null;
}): string {
  return `## 분석 대상 소재 정보

### 5축 AI 분석 결과
${JSON.stringify(params.analysisJson, null, 2)}

### DeepGaze 시선 데이터
${params.saliencyData
  ? `CTA 주목도: ${((params.saliencyData.cta_attention_score ?? 0) * 100).toFixed(1)}%
인지 부하: ${params.saliencyData.cognitive_load?.toFixed(2) ?? "N/A"}
주요 시선 고정점: ${JSON.stringify(params.saliencyData.top_fixations?.slice(0, 5) ?? [])}`
  : "시선 데이터 없음"}

### 성과 지표 (최근 30일)
CTR: ${params.performance.ctr?.toFixed(2) ?? "N/A"}%
ROAS: ${params.performance.roas?.toFixed(2) ?? "N/A"}
3초시청률: ${params.performance.video_p3s_rate?.toFixed(2) ?? "N/A"}%
참여합계/만노출: ${params.performance.engagement_per_10k?.toFixed(1) ?? "N/A"}
결제시작율: ${params.performance.click_to_checkout_rate?.toFixed(2) ?? "N/A"}%
구매전환율: ${params.performance.click_to_purchase_rate?.toFixed(2) ?? "N/A"}%

### 벤치마크 대비 차이
${Object.entries(params.benchmarkDiff)
  .map(([k, v]) => `${k}: ${v > 0 ? "+" : ""}${v.toFixed(1)}%`)
  .join("\n")}

### 광고 카피
${params.adCopy ?? "(카피 없음)"}

### 유사 벤치마크 소재 Top 3
${params.similarCreatives.length > 0
  ? params.similarCreatives.map((sc, i) =>
      `[${i+1}] 유사도: ${(sc.similarity * 100).toFixed(0)}%, ` +
      `CTR: ${sc.ctr?.toFixed(2)}%, ROAS: ${sc.roas?.toFixed(2)}, ` +
      `5축 요약: hook=${sc.hook_score?.toFixed(2)}, ` +
      `visual=${sc.visual_score?.toFixed(2)}, ` +
      `text=${sc.text_score?.toFixed(2)}`
    ).join("\n")
  : "유사 소재 데이터 없음"}

### 소재 카테고리
${params.category ?? "(미분류)"}`;
}
```

#### 출력 JSON 스키마 (structured output)

```typescript
const OUTPUT_SCHEMA = `## 출력 형식 (순수 JSON만 반환, 마크다운 코드블록 금지)

{
  "ad_category": {
    "format": "string — 소재 포맷 설명",
    "hook_tactic": "string — 훅 전략 유형",
    "messaging": "string — 메시징 앵글",
    "audience": "string — 추정 타겟"
  },
  "customer_journey_summary": {
    "sensation": "string — 감각 단계(보고+듣고) 분석 (2~3문장)",
    "thinking": "string — 사고 단계(느끼고+판단) 분석 (2~3문장)",
    "action_click": "string — 행동(클릭) 분석 (2~3문장)",
    "action_purchase": "string — 행동(구매) 분석 (2~3문장)"
  },
  "weakness_analysis": [
    {
      "axis": "5축 중 하나 (visual|text|psychology|quality|hook)",
      "attribute": "속성 경로 (예: text.cta_text)",
      "attribute_label": "속성 한글명",
      "current_percentile": "number (0~100)",
      "issue": "string — 문제 설명 (구체적, 한국어)",
      "benchmark_comparison": "string — 상위권 대비 설명"
    }
  ],
  "top3_prescriptions": [
    {
      "rank": "number (1~3)",
      "title": "string — 처방 제목 (한 줄)",
      "action": "string — 구체적 실행 방법 (2~3문장)",
      "journey_stage": "감각|사고|행동(클릭)|행동(구매)",
      "expected_impact": "string — 정량적 기대 효과",
      "evidence_axis1": "string — 축1 레퍼런스 근거",
      "evidence_axis2": "string — 축2 내부 데이터 근거",
      "difficulty": "쉬움|보통|어려움",
      "difficulty_reason": "string — 난이도 이유"
    }
  ]
}`;
```

### 4.2 절대 금지 규칙 (프롬프트에 명시)

| 규칙 | 이유 | 프롬프트 내 위치 |
|------|------|-----------------|
| CTA 버튼 추가 처방 금지 | Meta가 제공하는 기능이므로 소재 레벨에서 추가 불가 | 시스템 프롬프트 |
| 세이프티존 밖 배치 처방 금지 | 모바일 피드에서 잘림 | 시스템 프롬프트 |
| 타겟팅 변경 처방 금지 | 소재 개선만 다루는 시스템 | 시스템 프롬프트 |
| 추상적 처방 금지 | "더 좋게 하세요"는 실행 불가 | 시스템 프롬프트 |
| 입력 데이터에 없는 수치 인용 금지 | 환각(Hallucination) 방지 | 시스템 프롬프트 |
| 영어 응답 금지 | 한국어 UI 필수 규칙 | 시스템 프롬프트 |

### 4.3 Gemini API 호출 설정

```typescript
// 모델: gemini-3-pro-preview (기존 FLASH_MODEL과 동일)
// 이미지 포함 멀티모달 호출
const PRESCRIPTION_MODEL = "gemini-3-pro-preview";
const PRESCRIPTION_TIMEOUT_MS = 15_000;
const PRESCRIPTION_MAX_RETRY = 1;
const PRESCRIPTION_RETRY_DELAY_MS = 2_000;

// generationConfig
const GENERATION_CONFIG = {
  temperature: 0.3,       // 창의성 약간 허용 (0.1은 너무 보수적)
  maxOutputTokens: 4096,  // 처방 JSON이 길 수 있음
  responseMimeType: "application/json",  // JSON 강제 출력
};
```

### 4.4 프롬프트 비용 추정

Plan의 비용 테스트 결과 기반:

| 항목 | 토큰 | 비용 |
|------|------|------|
| 시스템 프롬프트 | ~800 tokens | |
| 축1 가이드 | ~2,000 tokens | |
| 축2 패턴 | ~500 tokens | |
| 입력 데이터 | ~1,500 tokens | |
| 이미지 | ~258 tokens (이미지) | |
| **Input 합계** | ~5,058 tokens | $0.006 |
| Output (JSON) | ~1,500 tokens | $0.015 |
| **건당 합계** | | **~$0.013** |

---

## 5. 에러 처리

### 5.1 에러 처리 흐름

```
Gemini API 호출
  ├─ 정상 응답 → JSON 파싱 시도
  │    ├─ 파싱 성공 → 스키마 검증
  │    │    ├─ 검증 성공 → 응답 반환
  │    │    └─ 검증 실패 → PARSE_ERROR (필수 필드 누락)
  │    └─ 파싱 실패 → 1회 retry
  │         ├─ retry 성공 → 재파싱
  │         └─ retry 실패 → PARSE_ERROR
  ├─ 429 (Rate Limit) → 2초 대기 후 1회 retry
  │    ├─ retry 성공 → 정상 처리
  │    └─ retry 실패 → GEMINI_ERROR
  ├─ 500/503 (서버 에러) → 2초 대기 후 1회 retry
  │    ├─ retry 성공 → 정상 처리
  │    └─ retry 실패 → GEMINI_ERROR
  └─ Timeout (15초) → GEMINI_TIMEOUT (retry 없이 즉시 반환)
```

### 5.2 에러별 상세 처리

| 에러 상황 | 코드 | HTTP | 사용자 메시지 | 처리 |
|-----------|------|:----:|-------------|------|
| 인증 실패 | `UNAUTHORIZED` | 401 | "인증이 필요합니다." | requireProtractorAccess() 실패 |
| 계정 소유권 없음 | `FORBIDDEN` | 403 | "해당 광고계정에 접근 권한이 없습니다." | verifyAccountOwnership() 실패 |
| 소재 없음 | `CREATIVE_NOT_FOUND` | 404 | "소재를 찾을 수 없습니다." | creative_media 조회 0건 |
| 5축 미분석 | `ANALYSIS_NOT_READY` | 422 | "이 소재는 아직 AI 분석이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요." | analysis_json IS NULL |
| 패턴 테이블 비어있음 | `PATTERNS_EMPTY` | 500 | "처방 기준 데이터가 준비 중입니다." | prescription_patterns 0행. 축1만으로 처방 생성 시도, 그마저 실패 시 반환 |
| Gemini 15초 초과 | `GEMINI_TIMEOUT` | 504 | "AI 처방 생성에 시간이 걸리고 있습니다. 잠시 후 다시 시도해 주세요." | AbortController timeout |
| Gemini API 실패 | `GEMINI_ERROR` | 502 | "AI 서비스에 일시적 문제가 있습니다. 잠시 후 다시 시도해 주세요." | 429/500/503 retry 후에도 실패 |
| JSON 파싱 실패 | `PARSE_ERROR` | 500 | "처방 결과 생성 중 오류가 발생했습니다." | Gemini 응답이 valid JSON이 아니거나 필수 필드 누락 |
| 기타 내부 에러 | `INTERNAL_ERROR` | 500 | "서버 오류가 발생했습니다." | 예상치 못한 예외 |

### 5.3 Graceful Degradation

```
시선 데이터 없음 (creative_saliency 미존재)
  → analysis_json.deepgaze_context fallback
  → 그것도 없으면 시선 데이터 없이 처방 생성 (품질 약간 저하)

prescription_patterns 비어있음
  → 축2 없이 축1(레퍼런스 원론)만으로 처방 생성
  → meta.axis2_used = false

유사 벤치마크 소재 없음 (embedding 없거나 유사도 0.5 미만)
  → 유사소재 섹션 생략하고 처방 생성
  → meta.similar_count = 0

카테고리 패턴 부족 (N < 10)
  → 전체(ALL) 패턴으로 fallback
  → meta.category_fallback = true
```

### 5.4 JSON 응답 검증

```typescript
function validatePrescriptionOutput(data: unknown): data is GeminiPrescriptionOutput {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;

  // 필수 필드 존재 확인
  if (!d.ad_category || !d.customer_journey_summary ||
      !d.weakness_analysis || !d.top3_prescriptions) return false;

  // top3_prescriptions 배열 검증
  if (!Array.isArray(d.top3_prescriptions) || d.top3_prescriptions.length === 0) return false;

  // 각 처방의 필수 필드 검증
  for (const p of d.top3_prescriptions) {
    if (!p.rank || !p.title || !p.action || !p.journey_stage ||
        !p.expected_impact || !p.difficulty) return false;
  }

  // customer_journey_summary 4단계 검증
  const journey = d.customer_journey_summary as Record<string, unknown>;
  if (!journey.sensation || !journey.thinking ||
      !journey.action_click || !journey.action_purchase) return false;

  return true;
}
```

---

## 6. 구현 순서

### STEP 1: prescription_patterns 테이블 생성 (0.5일)

- [ ] Cloud SQL에 테이블 + 인덱스 + RLS 정책 생성
- [ ] `src/types/prescription.ts` 타입 파일 생성
- [ ] 5축 배치와 병렬 가능 (의존성 없음)

**산출물**: SQL migration, TypeScript 타입 파일

### STEP 2: 패턴 추출 스크립트 (1일)

- [ ] `scripts/extract-prescription-patterns.mjs` 생성
- [ ] analysis_json → ATTRIBUTE_AXIS_MAP 매핑 로직 구현
- [ ] daily_ad_insights JOIN → 성과 집계
- [ ] lift_vs_average 계산
- [ ] 카테고리별 분리 + ALL 패턴 생성
- [ ] upsert 전략 구현
- [ ] `--dry-run` 모드 (DB 쓰기 없이 결과만 출력)
- [ ] 1회 실행 후 데이터 검증 (최소 100행 이상)

**의존**: STEP 1 + 5축 배치 완료
**산출물**: 스크립트 파일, 초기 데이터 적재 확인

### STEP 3: 처방 생성 API (1.5일)

- [ ] `src/app/api/protractor/prescription/route.ts` 생성
- [ ] `src/lib/protractor/prescription-prompt.ts` 생성 (프롬프트 빌드)
- [ ] `src/lib/protractor/prescription-engine.ts` 생성 (7단계 로직)
- [ ] `docs/prescription-prompt-guide.md` 축1 가이드 작성
- [ ] 인증/권한 (requireProtractorAccess + verifyAccountOwnership)
- [ ] 5축 결과 조회 + 약점 식별
- [ ] 시선 데이터 조회 (creative_saliency + deepgaze_context fallback)
- [ ] prescription_patterns 패턴 조회 (카테고리 fallback)
- [ ] 유사소재 검색 (creative_media.embedding 코사인 유사도)
- [ ] Gemini 멀티모달 호출 (이미지 + 텍스트)
- [ ] JSON 파싱 + 검증
- [ ] 에러 처리 (timeout, retry, graceful degradation)
- [ ] 응답 구성 + meta 정보

**의존**: STEP 1 + STEP 2
**산출물**: API route, 엔진 모듈, 프롬프트 모듈, 축1 가이드

### STEP 4: 처방 UI (1.5일)

- [ ] `src/hooks/use-prescription.ts` 생성
- [ ] `prescription-tab.tsx` 생성 (탭 컨테이너)
- [ ] `prescription-card.tsx` 생성 (Top 3 카드)
- [ ] `weakness-panel.tsx` 생성 (약점 시각화)
- [ ] `journey-map.tsx` 생성 (고객 여정 4단계)
- [ ] `prescription-button.tsx` 생성 (생성 버튼 + 로딩)
- [ ] `creative-analysis.tsx` 탭 추가 (최소 수정)
- [ ] 클라이언트 캐시 구현
- [ ] 반응형 레이아웃 (데스크탑 + 모바일)
- [ ] 디자인 시스템 적용 (#F75D5D, Pretendard, 라이트 모드)

**의존**: STEP 3 (API 필요)
**산출물**: 6개 컴포넌트 파일, 1개 훅 파일, creative-analysis.tsx 수정

### STEP 5: 패턴 추출 크론 등록 (0.5일)

- [ ] Cloud Scheduler 등록 (화요일 04:00 UTC, collect-benchmarks 후)
- [ ] `scripts/extract-prescription-patterns.mjs` 실행 엔드포인트 (옵션)
- [ ] 실행 1회 검증 + 로그 확인
- [ ] 실행 실패 시 슬랙 알림 (기존 크론 알림 패턴)

**의존**: STEP 2 (스크립트 검증 완료)
**산출물**: Cloud Scheduler 설정, 검증 로그

---

## 부록 A: 고객 여정 ↔ 5축 ↔ 성과 그룹 매핑 테이블

| 여정 단계 | 성과 그룹 (METRIC_GROUPS) | 관련 5축 | ATTRIBUTE_AXIS_MAP.affectsGroups |
|-----------|:------------------------:|---------|--------------------------------|
| **감각** (보고+듣고) | foundation (3초시청률, ThruPlay율, 지속비율) | hook, visual, quality | hook→foundation, visual→foundation, quality→foundation |
| **사고** (느끼고+판단) | engagement (좋아요, 댓글, 공유, 저장) | psychology, text | psychology.emotion→engagement, text.headline→engagement |
| **행동(클릭)** | conversion (CTR, 결제시작율) | text (CTA), psychology (urgency) | text.cta_text→conversion, psychology.urgency→conversion |
| **행동(구매)** | conversion (구매전환율, ROAS) | quality (LP일관성), psychology (social_proof) | quality.brand_consistency→conversion, psychology.social_proof→conversion |

## 부록 B: 파일 소유 경계 (팀원 충돌 방지)

| 역할 | 소유 파일 |
|------|----------|
| **backend-dev** | `src/app/api/protractor/prescription/route.ts`, `src/lib/protractor/prescription-engine.ts`, `src/lib/protractor/prescription-prompt.ts`, `scripts/extract-prescription-patterns.mjs`, `src/types/prescription.ts`, `docs/prescription-prompt-guide.md` |
| **frontend-dev** | `src/app/(main)/protractor/creatives/prescription-tab.tsx`, `prescription-card.tsx`, `weakness-panel.tsx`, `journey-map.tsx`, `prescription-button.tsx`, `src/hooks/use-prescription.ts` |
| **공유 (순서 조율 필요)** | `src/app/(main)/protractor/creatives/creative-analysis.tsx` (탭 추가만 — frontend-dev 작업 후반에 1회 수정) |

## 부록 C: account_id 필터링 체크리스트 (ADR-001)

- [x] DB: prescription_patterns는 집계 테이블이므로 account_id 불필요 (개인 데이터 아님)
- [x] API: `POST /api/protractor/prescription`에서 creative_media → creatives JOIN으로 account_id 확인
- [x] API: `verifyAccountOwnership()`으로 계정 소유권 검증
- [x] 프론트: 기존 AccountSelector 연동 (creative-analysis.tsx 패턴 유지)
- [x] 유사소재 검색: 동일 account_id 제외 (타 계정 벤치마크만 참조)
