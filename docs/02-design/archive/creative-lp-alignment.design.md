# creative_lp_map 리뉴얼 설계서

> 작성일: 2026-03-22
> TASK: T9 (architecture-v3-execution-plan.md)
> 의존성: T5 ✅ (lp_analysis.reference_based 존재), T2 ✅ (analysis_json 존재)

---

## 1. 데이터 모델

### 1.1 creative_lp_map 신규 컬럼 (T1에서 추가됨)

```sql
message_alignment float    -- 메시지 일관성 (0-100)
cta_alignment float        -- CTA 일관성 (0-100)
offer_alignment float      -- 오퍼 일관성 (0-100)
overall_score float        -- 종합 점수 (가중 평균)
issues jsonb               -- 불일치 이슈 목록
```

기존 컬럼 (visual_score, semantic_score 등) 유지 — deprecated.

### 1.2 issues JSONB 구조

```json
[
  {
    "type": "message_mismatch",
    "severity": "high",
    "description": "광고: 무료 체험 / LP: 구매만",
    "action": "LP에 무료 체험 배너 추가"
  }
]
```

type: message_mismatch | visual_inconsistency | cta_mismatch | offer_mismatch
severity: high | medium | low

---

## 2. API 설계

### 2.1 analyze-creative-lp-alignment.mjs (신규)

```
Usage: node scripts/analyze-creative-lp-alignment.mjs [--limit N] [--dry-run]

동작:
1. creative_lp_map에서 overall_score IS NULL인 행 조회
   - JOIN creative_media (analysis_json)
   - JOIN lp_analysis (reference_based)
2. 각 매핑에 대해:
   a. creative_media.analysis_json + lp_analysis.reference_based를 Gemini에 전달
   b. 4가지 alignment 점수 + issues 생성
   c. overall_score = message*0.35 + cta*0.25 + offer*0.25 + visual*0.15
   d. creative_lp_map UPDATE
3. Rate limiting: 4초 간격
```

### 2.2 Gemini 프롬프트

```
아래 광고 소재 분석 결과와 랜딩 페이지 분석 결과를 비교하여 일관성을 평가하세요.

[광고 소재 분석]
{creative_media.analysis_json (visual, text, psychology 축)}

[랜딩 페이지 분석]
{lp_analysis.reference_based (8 카테고리)}

다음 JSON으로 일관성 점수와 이슈를 반환하세요:

{
  "message_alignment": 78,
  "visual_consistency": 85,
  "cta_alignment": 45,
  "offer_alignment": 50,
  "issues": [
    {
      "type": "message_mismatch|visual_inconsistency|cta_mismatch|offer_mismatch",
      "severity": "high|medium|low",
      "description": "구체적 불일치 내용 (한국어)",
      "action": "개선 제안 (한국어)"
    }
  ]
}
```

---

## 3. 컴포넌트 구조

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `scripts/analyze-creative-lp-alignment.mjs` | **신규** | Gemini 기반 소재↔LP 일관성 분석 |

---

## 4. 에러 처리

| 상황 | 처리 |
|------|------|
| analysis_json 없음 | 스킵 (5축 분석 필요) |
| reference_based 없음 | 스킵 (LP 분석 필요) |
| Gemini 실패 | 재시도 3회, 실패 시 스킵 |
| creative_lp_map 0건 | 즉시 종료 |

---

## 5. 구현 순서

- [ ] sbGet/sbPatch REST 헬퍼
- [ ] creative_lp_map + creative_media + lp_analysis JOIN 조회
- [ ] Gemini 2.5 Pro 일관성 분석 프롬프트
- [ ] 4가지 alignment 점수 + issues 저장
- [ ] overall_score 가중 평균 계산
- [ ] `npx tsc --noEmit` + `npm run build` 통과

---

> 설계서 작성 완료.
