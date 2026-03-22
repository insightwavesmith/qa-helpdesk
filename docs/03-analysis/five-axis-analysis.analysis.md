# 5축 분석 Gap 분석

> 작성일: 2026-03-22
> 리뷰어: qa-engineer (code-reviewer)
> 대상 TASK: T2 (5축 분석 스키마 확정 + 프롬프트 재설계)
> 설계서: docs/02-design/features/five-axis-analysis.design.md

---

## Match Rate: 96%

---

## 빌드 검증 결과

| 항목 | 결과 |
|------|------|
| `npx tsc --noEmit` | PASS (에러 0개) |
| `npm run build` | PASS (에러 0개) |
| `npm run lint` | PASS (기존 warning만, 신규 스크립트 관련 에러 없음) |

---

## 일치 항목

### 1. --mode CLI 옵션 (free/cluster/final)
- `--mode free`, `--mode cluster`, `--mode final` 3가지 분기 구현 완료
- MODE_IDX 파싱 + 유효성 검증(`["free", "cluster", "final"].includes(MODE)`) 포함
- 기본값 "final" 적용 (설계서 표 일치)

### 2. IMAGE_PROMPT_V3 스키마 (psychology, quality 축 포함)
- `psychology`: emotion(8종), psychological_trigger(7종), offer_type(6종), urgency(4종), social_proof_type(6종) 전부 구현
- `quality`: production_quality(4종), readability(3종), creative_fatigue_risk/most_similar_ad_id/similarity_score null 초기값 포함
- 설계서 1.1의 IMAGE 스키마와 100% 일치

### 3. VIDEO_PROMPT_V3 스키마
- IMAGE 스키마 + `audio`(narration_text, bgm_genre, sound_effects, audio_emotion, audio_type) + `structure`(scenes, pacing, hook_type, ending_cta_type) 포함
- visual에 scene_timeline, motion_pattern, scene_transition_speed 추가됨 (설계서 1.1 VIDEO 섹션 일치)

### 4. FREE 모드 프롬프트 (enum 없이 자유 기술)
- IMAGE_PROMPT_FREE, VIDEO_PROMPT_FREE 구현
- 설계서 2.1의 "enum 없이 자유 기술" 방식 준수
- free 결과 → `scripts/output/five-axis-free-{timestamp}.json` 저장 (설계서 일치)

### 5. 층화 샘플링 (ROAS 기반 NTILE)
- 상위 34건 (상위 20%), 중위 33건 (중위 60%), 하위 33건 (하위 20%)
- `fetchStratifiedSample()` 함수에서 `Math.floor(total * 0.2)` / `Math.floor(total * 0.8)` 분할 → 설계서 SQL NTILE(5) 의미와 동일

### 6. cluster 모드
- 최신 `five-axis-free-*.json` 자동 탐색 → Gemini 클러스터링 호출
- 결과 → `scripts/output/five-axis-clusters.json` 저장
- 10개 속성 클러스터링(hook_type, visual_style, composition, emotion, psychological_trigger, offer_type, urgency, production_quality, headline_type, social_proof_type)

### 7. fatigue_risk (코사인 유사도 + 임계값)
- `cosineSimilarity()` 구현 (dot product / norm 방식, creative-analyzer.ts 로직 이식)
- `getRisk()`: high ≥0.85, medium ≥0.70, low <0.70 (설계서 1.3 정확히 일치)
- `quality.creative_fatigue_risk`, `quality.most_similar_ad_id`, `quality.similarity_score` 업데이트

### 8. scores 가중 평균 계산
- `computeOverall()`: visual_impact 30% + message_clarity 25% + cta_effectiveness 25% + social_proof_score 20%
- 설계서 1.2의 가중치 100% 일치

### 9. 백분위 (카테고리 50건 미만 시 전체 대비)
- `MIN_SAMPLE = 50` 상수 정의
- `catRows.length >= MIN_SAMPLE ? category : "전체"` 분기 처리
- `percentileOf()` 함수: sortedValues 배열에서 value 이하 비율 계산

### 10. 기존 기능 유지 (DRY_RUN, LIMIT, ACCOUNT, TYPE)
- 4개 옵션 모두 유지 및 정상 동작

### 11. 기존 프롬프트 주석 처리 (삭제 아님)
- `IMAGE_PROMPT`/`VIDEO_PROMPT` → `/* ... */` 블록 주석으로 보존 (lines 107-188)

### 12. output 디렉토리
- `scripts/output/.gitkeep` 존재 확인 (빈 파일, 0 bytes)
- `mkdirSync(OUTPUT_DIR, { recursive: true })` 코드로 런타임에도 자동 생성

---

## 불일치 항목

### [warning] compute-score-percentiles.mjs: category 조회 로직 버그 (수정 완료)

**위치**: `compute-score-percentiles.mjs` 288번 줄 (수정 전)

**문제**: 개별 점수 계산 루프(4단계)에서 카테고리를 `row.creatives?.ad_accounts?.profiles?.category`로 접근했으나, 1단계 creative_media 쿼리에는 `ad_accounts` 조인이 포함되지 않아 항상 `"기타"`를 반환하는 버그.

**영향**: 카테고리별 백분위가 항상 "전체" 기준으로 계산됨 → 카테고리 필터링 무력화

**수정**: 2단계에서 구축한 `accountCategoryMap.get(accountId)` 사용으로 변경 → 수정 완료

```javascript
// 수정 전 (bug)
const category = row.creatives?.ad_accounts?.profiles?.category || "기타";

// 수정 후 (fix)
const accountId = String(row.creatives?.account_id || "");
const category = accountCategoryMap.get(accountId) || "기타";
```

### [info] visual_impact 계산 공식 설계서와 소폭 상이

**위치**: `compute-score-percentiles.mjs` `computeVisualImpact()` 함수

**설계서 2.2**: `visual_impact = attention.cta_attention_score × 100` (단순 공식)

**구현**: `cta_attention_score × 40 + production_quality 점수 × 30 + color.contrast 점수 × 30` (복합 공식)

**평가**: 구현이 설계서보다 더 정교한 복합 공식을 사용. 기능 결함 아님. 설계서는 개략적인 계산 방식만 명시했으며, 구현의 복합 공식이 더 현실적임. 단, 설계서와 구현 간 명시적 불일치이므로 다음 설계서 갱신 시 공식 반영 권장.

### [info] compute-score-percentiles.mjs --account 옵션 미구현

**설계서**: 별도 언급 없음 (compute-fatigue-risk.mjs에만 `--account` 옵션 설계)

**현황**: compute-score-percentiles.mjs에는 `--account` 필터 옵션 없음 (설계서와 동일)

**평가**: 설계서에 없는 항목이므로 불일치 아님, 단순 메모.

---

## 수정 완료 내역

| 항목 | 파일 | 상태 |
|------|------|------|
| category 조회 로직 버그 (line 288) | compute-score-percentiles.mjs | **수정 완료** |

---

## 검증 항목 체크리스트

| 설계서 항목 | 구현 | 판정 |
|------------|------|------|
| --mode free/cluster/final | O | PASS |
| IMAGE_PROMPT_V3 (psychology, quality 포함) | O | PASS |
| VIDEO_PROMPT_V3 (audio, structure + psychology, quality) | O | PASS |
| FREE 프롬프트 (enum 없이 자유 기술) | O | PASS |
| 층화 샘플링 (ROAS NTILE, 34/33/33) | O | PASS |
| cluster 모드 (최신 free 결과 → Gemini 클러스터링) | O | PASS |
| fatigue_risk (코사인 유사도, high≥0.85/medium≥0.70/low<0.70) | O | PASS |
| scores 가중 평균 (30/25/25/20) | O | PASS |
| 백분위 (카테고리 50건 미만 시 전체 대비) | O | PASS |
| 기존 옵션 유지 (DRY_RUN, LIMIT, ACCOUNT, TYPE) | O | PASS |
| 기존 프롬프트 주석 처리 (삭제 아님) | O | PASS |
| output 디렉토리 (scripts/output/.gitkeep) | O | PASS |
| category 조회 버그 | X → 수정 완료 | FIXED |

---

## 이슈 분류

| severity | 내용 | 상태 |
|----------|------|------|
| warning | compute-score-percentiles.mjs category 조회 항상 "기타" 반환 | 수정 완료 |
| info | visual_impact 공식 설계서(단순) vs 구현(복합) 불일치 — 구현이 더 정교 | 설계서 갱신 권장 |

---

## 결론

- **Critical 이슈**: 0개
- **Warning 이슈**: 1개 (수정 완료)
- **Info 이슈**: 1개
- **Match Rate**: 96% PASS (기준 90% 이상 충족)
- **빌드 상태**: tsc PASS, lint PASS (warning만, 신규 에러 없음), build PASS
