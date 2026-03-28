# 5축 분석 스키마 확정 + 프롬프트 재설계 설계서

> 작성일: 2026-03-22
> TASK: T2 (architecture-v3-execution-plan.md)
> 의존성: T1 ✅ (DB 스키마 v3 완료, 커밋 6f70f83)
> 관련 Plan: docs/01-plan/features/architecture-v3-execution-plan.md T2 섹션
> 관련 Plan: docs/01-plan/features/five-axis-analysis-batch.plan.md (배치 처리)

---

## 1. 데이터 모델

### 1.1 analysis_json 스키마 (v3 확정)

**대상 테이블**: `creative_media.analysis_json` (JSONB)
**보조 저장**: `ad_creative_embeddings.video_analysis` (creative_media 미존재 시 폴백)

#### IMAGE 타입 (5축)

```json
{
  "model": "gemini-2.5-pro",
  "type": "IMAGE",
  "summary": "소재 한줄 요약 (한국어)",
  "visual": {
    "format": "image",
    "hook_type": "question|shock|benefit|problem|curiosity|comparison|testimonial|none",
    "visual_style": "professional|ugc|minimal|bold|lifestyle|graphic",
    "composition": "center|thirds|full_bleed|text_overlay|split",
    "product_visibility": { "position": "center|side|background|none", "size_pct": 30 },
    "human_element": { "face": true, "body": "upper|full|none", "expression": "smile|neutral|surprise|none", "count": 0 },
    "color": { "dominant": "#hex", "palette": ["#hex"], "tone": "warm|cool|neutral", "contrast": "high|medium|low" },
    "text_overlay_ratio": 15,
    "brand": { "logo_visible": false, "logo_position": "top-left|top-right|bottom|none" }
  },
  "text": {
    "headline_type": "benefit|discount|question|comparison|testimonial|stat|none",
    "key_message": "핵심 메시지 (한국어)",
    "cta_text": "CTA 문구",
    "overlay_texts": ["텍스트1", "텍스트2"],
    "social_proof": { "review_shown": false, "before_after": false, "testimonial": false, "numbers": null }
  },
  "psychology": {
    "emotion": "trust|excitement|fear|empathy|curiosity|joy|urgency|none",
    "psychological_trigger": "social_proof|scarcity|authority|reciprocity|commitment|liking|none",
    "offer_type": "discount|bundle|free_shipping|free_trial|gift|none",
    "urgency": "timer|limited|seasonal|none",
    "social_proof_type": "review_count|star_rating|user_count|expert|celebrity|none"
  },
  "quality": {
    "production_quality": "professional|semi|ugc|low",
    "readability": "high|medium|low",
    "creative_fatigue_risk": null,
    "most_similar_ad_id": null,
    "similarity_score": null
  },
  "attention": {
    "top_fixations": [
      { "x": 0.5, "y": 0.3, "weight": 0.9, "label": "제품" }
    ],
    "cta_attention_score": 0.7,
    "cognitive_load": "low|medium|high"
  },
  "audio": null,
  "structure": null,
  "scores": null
}
```

#### VIDEO 타입 (5축 + audio/structure 확장)

IMAGE 스키마 + 아래 축 추가/변경:

```json
{
  "type": "VIDEO",
  "visual": {
    "...IMAGE 동일...",
    "scene_timeline": [
      { "sec": "0-3", "type": "hook|problem|demo|result|cta|brand", "desc": "설명" }
    ],
    "motion_pattern": "static|slow|fast|mixed",
    "scene_transition_speed": "slow|medium|fast"
  },
  "audio": {
    "narration_text": "전사 텍스트 (한국어)",
    "bgm_genre": "pop|calm|exciting|dramatic|none",
    "sound_effects": "효과음 설명",
    "audio_emotion": "upbeat|calm|urgent|dramatic|neutral",
    "audio_type": "narration|bgm|sfx|silent|mixed"
  },
  "structure": {
    "scenes": [
      { "sec": "0-3", "type": "hook|demo|result|cta|brand", "desc": "설명" }
    ],
    "pacing": "fast|medium|slow",
    "hook_type": "question|shock|benefit|problem|curiosity",
    "ending_cta_type": "button|text|overlay|swipe-up|none"
  }
}
```

### 1.2 scores 구조 (post-processing)

`scores`는 Gemini 분석이 아닌 **후처리 배치**로 계산:

```json
{
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

**계산 방식**:

| 단계 | 설명 |
|------|------|
| 1. Gemini 절대값 | attention.cta_attention_score, quality.readability 등에서 추출 |
| 2. 카테고리 분류 | creatives → ad_accounts → profiles.category |
| 3. 백분위 계산 | 같은 카테고리 내 percentile_cont |
| 4. overall | visual_impact 30% + message_clarity 25% + cta_effectiveness 25% + social_proof_score 20% |

**최소 샘플**: 50건/카테고리 이상이어야 유의미. 부족 시 전체(ALL) 대비.

### 1.3 fatigue_risk 계산 (T2-B)

**계산 주체**: 스크립트 후처리 (Gemini X, 임베딩 코사인 유사도)

| 항목 | 정의 |
|------|------|
| 비교 범위 | 같은 account_id 내 활성 소재 (is_active=true) |
| 비교 벡터 | creative_media.embedding 또는 ad_creative_embeddings.embedding_3072 (3072D) |
| 임계값 | high: ≥0.85, medium: ≥0.70, low: <0.70 |
| 출력 위치 | analysis_json.quality.creative_fatigue_risk |
| 추가 출력 | quality.most_similar_ad_id + quality.similarity_score |

기존 `creative-analyzer.ts`의 `cosineSimilarity()`, `getRisk()` 함수 재사용.

### 1.4 기존 스키마 → v3 스키마 변경 매핑

| 현재 (scripts/analyze-five-axis.mjs) | v3 (본 설계서) | 변경 내용 |
|--------------------------------------|---------------|----------|
| visual.style | visual.visual_style | 이름 변경 |
| visual.layout.text_pct | visual.text_overlay_ratio | 위치 이동 |
| visual.layout.whitespace_pct | 삭제 | 불필요 |
| visual.layout.complexity | 삭제 | quality.readability로 대체 |
| text.hook.type | visual.hook_type | 위치 이동 (시각적 속성) |
| text.hook.text | text.key_message와 통합 | — |
| — (없음) | psychology (전체) | **신규 축** |
| — (없음) | quality (전체) | **신규 축** |
| attention | attention | 유지 |
| audio | audio | 유지 (VIDEO만) |
| structure | structure | 유지 (VIDEO만) |

---

## 2. API/스크립트 설계

### 2.1 analyze-five-axis.mjs 3모드 지원

| 모드 | CLI 옵션 | 프롬프트 | 대상 | 용도 |
|------|---------|---------|------|------|
| `free` | `--mode free` | enum 없이 자유 기술 | 100건 층화 샘플 | T2-A Step 1 |
| `cluster` | `--mode cluster` | — (별도 호출) | Step 1 결과 파일 | T2-A Step 2 |
| `final` | `--mode final` (기본값) | 확정 enum 포함 | 전체 소재 | 최종 배치 |

#### free 모드 프롬프트 (enum 없음)

```
이 광고 소재 이미지를 분석해서 아래 항목을 자유롭게 기술하라.
- 시각적 후킹 방식: (제약 없이 자유 기술)
- 비주얼 스타일: (제약 없이 자유 기술)
- 감정 유발: (제약 없이 자유 기술)
- 심리 트리거: (제약 없이 자유 기술)
- 오퍼 유형: (제약 없이 자유 기술)
- 제작 품질: (제약 없이 자유 기술)
[...나머지 속성]
```

#### final 모드 프롬프트 (enum 강제)

위 1.1의 JSON 스키마 그대로 프롬프트에 삽입. `|`로 구분된 enum 값 중 하나만 선택하도록 강제.

#### cluster 모드 (별도 Gemini 호출)

```
아래 100건의 자유 태깅 결과를 분석하여, 각 속성별 5-8개 대표 카테고리로 클러스터링하라.
각 카테고리의 이름, 설명, 해당 건수를 출력하라.

[100건 JSON 배열]
```

결과 → `scripts/output/five-axis-clusters.json`에 저장 → Smith님 리뷰 후 확정.

### 2.2 compute-score-percentiles.mjs (신규)

```
Usage:
  node scripts/compute-score-percentiles.mjs
  node scripts/compute-score-percentiles.mjs --category 뷰티
  node scripts/compute-score-percentiles.mjs --dry-run
```

**동작**:
1. creative_media에서 analysis_json NOT NULL인 행 전체 조회
2. creatives → ad_accounts → profiles.category 조인으로 카테고리 분류
3. 카테고리별 scores 계산:
   - visual_impact = attention.cta_attention_score × 100
   - message_clarity = text 축 충실도 (key_message 존재 + cta_text 존재 → 점수화)
   - cta_effectiveness = attention.cta_attention_score × 100
   - social_proof_score = psychology.social_proof_type != "none" 여부
   - overall = 가중 평균
4. 카테고리 내 percentile_cont 계산
5. analysis_json.scores 업데이트 (PATCH)

### 2.3 fatigue-risk 계산 통합

analyze-five-axis.mjs 배치 완료 후 별도 단계로 실행:

```
node scripts/compute-fatigue-risk.mjs
```

**동작**:
1. account_id별 활성 소재의 embedding_3072 로드
2. pairwise 코사인 유사도 계산 (기존 creative-analyzer.ts 로직 이식)
3. 가장 유사한 소재 찾기 → analysis_json.quality 업데이트

---

## 3. 컴포넌트 구조

T2는 **스크립트 중심**이라 프론트엔드 컴포넌트 변경 없음.

### 3.1 파일 변경 목록

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `scripts/analyze-five-axis.mjs` | **대폭 수정** (462줄→~600줄) | 3모드 지원, v3 프롬프트, psychology/quality 축 추가 |
| `scripts/compute-score-percentiles.mjs` | **신규** (~200줄) | 카테고리별 백분위 계산 |
| `scripts/compute-fatigue-risk.mjs` | **신규** (~150줄) | 임베딩 유사도 기반 피로도 계산 |
| `scripts/output/` | **디렉토리 신규** | free 모드 결과, cluster 결과 저장 |

### 3.2 기존 서비스 영향

| 기존 파일 | 영향 |
|----------|------|
| L1 (creative_element_analysis) | **무영향** — 테이블/크론 유지, deprecated 마킹만 |
| L2 (creative_saliency) | **무영향** — DeepGaze 별개 |
| L4 (creative_intelligence_scores) | **무영향** — 기존 점수 유지 |
| creative-analyzer.ts | **무영향** — 함수 참조만, 수정 없음 |
| embed-creatives 크론 | **무영향** — 임베딩 별개 |
| 프론트엔드 | **무영향** — analysis_json 표시 UI는 T2 범위 밖 |

---

## 4. 에러 처리

| 상황 | 처리 |
|------|------|
| Gemini 429 (Rate Limit) | exponential backoff 재시도 (4초→8초→16초), 최대 3회 |
| Gemini 500/503 | 동일 재시도 |
| 이미지 다운로드 실패 | 스킵 + 에러 로그, 다음 건 진행 |
| JSON 파싱 실패 | 마크다운 제거 → regex 추출 → 실패 시 스킵 |
| DB 저장 실패 | 에러 로그 + 계속 진행 (전체 중단 방지) |
| embedding_3072 없음 (fatigue) | fatigue_risk = null로 설정 |
| 카테고리 50건 미만 (scores) | 전체(ALL) 대비 백분위 계산 |

---

## 5. 구현 순서 (체크리스트)

### Phase 1: 프롬프트 재설계 + free 모드 (Day 1)

- [ ] `scripts/analyze-five-axis.mjs` — `--mode` CLI 옵션 추가
- [ ] IMAGE_PROMPT_V3 작성 (v3 스키마, enum 포함)
- [ ] IMAGE_PROMPT_FREE 작성 (자유 기술, enum 없음)
- [ ] VIDEO_PROMPT_V3 작성 (v3 스키마 + audio/structure)
- [ ] VIDEO_PROMPT_FREE 작성 (자유 기술)
- [ ] `--mode free --limit 100 --stratified` 층화 샘플링 로직
- [ ] 결과 → `scripts/output/five-axis-free-{timestamp}.json` 저장

### Phase 2: cluster 모드 + 확정 (Day 2, Smith님 리뷰 필요)

- [ ] `--mode cluster` 모드: free 결과 파일 로드 → Gemini 클러스터링 호출
- [ ] 결과 → `scripts/output/five-axis-clusters.json`
- [ ] **Smith님 리뷰 → enum 값 확정** (이 단계에서 대기)
- [ ] 확정된 enum을 IMAGE_PROMPT_V3/VIDEO_PROMPT_V3에 반영

### Phase 3: 전체 배치 (Day 2-3)

- [ ] `--mode final` (기본값): 확정 enum 포함 프롬프트로 전체 배치
- [ ] 이미지 ~2,709건 × 4초 = ~3시간
- [ ] 영상 ~225건 × 8초 = ~30분
- [ ] 성공률 90%+ 확인

### Phase 4: 후처리 — fatigue_risk (Day 3)

- [ ] `scripts/compute-fatigue-risk.mjs` 작성
- [ ] account_id별 pairwise 유사도 계산
- [ ] analysis_json.quality.creative_fatigue_risk 업데이트
- [ ] analysis_json.quality.most_similar_ad_id + similarity_score 저장

### Phase 5: 후처리 — scores 백분위 (Day 3)

- [ ] `scripts/compute-score-percentiles.mjs` 작성
- [ ] 카테고리 분류 로직 (profiles.category 기반)
- [ ] overall 가중 평균 + 카테고리별 percentile 계산
- [ ] analysis_json.scores 업데이트
- [ ] 검증: 고성과 소재 percentile > 70, 저성과 < 30

### Phase 6: 빌드 검증

- [ ] `npx tsc --noEmit --quiet` 통과
- [ ] `npm run build` 통과
- [ ] 샘플 검증: 10건 analysis_json 수동 확인

---

## 6. 층화 샘플링 로직 (T2-A Step 1)

```
ROAS 분포 기반 100건 층화 샘플링:
  - 상위 20% (고성과): 34건
  - 중위 60% (평균): 33건
  - 하위 20% (저성과): 33건

SQL:
WITH ranked AS (
  SELECT cm.id, cm.storage_url, cm.media_type, cm.ad_copy,
         c.ad_id, c.account_id,
         COALESCE(cp.roas, 0) AS roas,
         NTILE(5) OVER (ORDER BY COALESCE(cp.roas, 0) DESC) AS quintile
  FROM creative_media cm
  JOIN creatives c ON c.id = cm.creative_id
  LEFT JOIN creative_performance cp ON cp.creative_id = c.id
  WHERE cm.storage_url IS NOT NULL
    AND cm.is_active = true
)
SELECT * FROM ranked
WHERE quintile = 1 ORDER BY RANDOM() LIMIT 34  -- 상위 20%
UNION ALL
SELECT * FROM ranked
WHERE quintile IN (2,3,4) ORDER BY RANDOM() LIMIT 33  -- 중위 60%
UNION ALL
SELECT * FROM ranked
WHERE quintile = 5 ORDER BY RANDOM() LIMIT 33;  -- 하위 20%
```

---

## 7. 현재 스키마 vs v3 스키마 차이 요약

| 속성 | 현재 L1 (analyze.mjs) | v3 (본 설계서) | 비고 |
|------|---------------------|---------------|------|
| hook_type | text.hook.type (6종) | visual.hook_type (8종) | 위치+선택지 변경 |
| visual_style | visual.style (5종) | visual.visual_style (6종) | 이름+선택지 변경 |
| composition | 없음 | visual.composition (5종) | 신규 |
| product_visibility | visual.product_visibility | 동일 | 유지 |
| human_element | visual.human_presence | visual.human_element | 이름 변경 |
| color | visual.color | 동일 | 유지 |
| text_overlay_ratio | visual.layout.text_pct | visual.text_overlay_ratio | 위치 이동 |
| headline_type | 없음 | text.headline_type (7종) | 신규 |
| key_message | text.key_message | 동일 | 유지 |
| cta_text | text.cta_text | 동일 | 유지 |
| emotion | 없음 | psychology.emotion (8종) | **신규 축** |
| psychological_trigger | 없음 | psychology.psychological_trigger (7종) | **신규 축** |
| offer_type | 없음 | psychology.offer_type (6종) | **신규 축** |
| urgency | 없음 | psychology.urgency (4종) | **신규 축** |
| production_quality | 없음 | quality.production_quality (4종) | **신규 축** |
| readability | 없음 | quality.readability (3종) | **신규 축** |
| fatigue_risk | creative-analyzer.ts 별도 | quality.creative_fatigue_risk | 통합 |
| scores | 없음 | scores (후처리 계산) | **신규** |
| attention | attention | 유지 | 유지 |

---

> 설계서 작성 완료. 이 문서가 확정되면 구현 시작 가능.
