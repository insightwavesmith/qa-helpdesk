# Andromeda 호환 신호 + 유사도 60% 계산 설계서

> 작성일: 2026-03-22
> TASK: T8 (architecture-v3-execution-plan.md)
> 의존성: T2 ✅ (analysis_json 스키마)

---

## 1. 데이터 모델

### 1.1 andromeda_signals 축 스키마

analysis_json에 추가:
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
    },
    "similar_creatives": []
  }
}
```

fingerprint는 하이픈 구분 토큰 (Jaccard 유사도 계산용).

### 1.2 유사도 계산

**4축 가중 Jaccard 유사도:**

| 축 | 가중치 | 이유 |
|----|--------|------|
| visual_fingerprint | 40% | Andromeda 시각 비중 최대 |
| text_fingerprint | 30% | 카피 구조 시맨틱 핵심 |
| audio_fingerprint | 15% | 영상 전용 (이미지는 제외) |
| structure_fingerprint | 15% | 전체 구조 패턴 |

**임계값:**
- ≥ 0.60: 같은 광고 경험 가능성 → 다양성 경고
- ≥ 0.80: 거의 동일 → 강력 경고
- < 0.60: 안전

---

## 2. API 설계

### 2.1 analyze-five-axis.mjs 프롬프트 변경

VIDEO_PROMPT_V3 + IMAGE_PROMPT_V3 모두에 andromeda_signals 추가:

```json
"andromeda_signals": {
  "visual_fingerprint": "하이픈으로 연결된 시각 요소 키워드 (예: mom-child-beauty-demo)",
  "text_fingerprint": "하이픈으로 연결된 카피 구조 키워드 (예: problem-solution-result)",
  "audio_fingerprint": "하이픈으로 연결된 오디오 키워드 (예: narration-upbeat). 이미지면 null",
  "structure_fingerprint": "하이픈으로 연결된 구조 키워드 (예: hook-demo-cta)",
  "pda": {
    "persona": "타겟 페르소나 키워드 (예: young_mom, office_worker)",
    "desire": "욕구 키워드 (예: beauty, health, saving)",
    "awareness": "인식 수준: unaware|problem_aware|solution_aware|product_aware|most_aware"
  }
}
```

### 2.2 compute-andromeda-similarity.mjs (신규)

```
Usage: node scripts/compute-andromeda-similarity.mjs [--limit N] [--dry-run] [--account-id UUID]

동작:
1. creative_media에서 andromeda_signals가 있는 소재 조회
2. 같은 account_id 내 활성 소재 간 pairwise 비교
3. 4축 가중 Jaccard 유사도 계산
4. 유사도 ≥ 0.60인 쌍 → similar_creatives 배열에 추가
5. analysis_json.andromeda_signals.similar_creatives UPDATE
```

---

## 3. 컴포넌트 구조

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `scripts/analyze-five-axis.mjs` | **수정** | IMAGE/VIDEO 프롬프트에 andromeda_signals 추가 |
| `scripts/compute-andromeda-similarity.mjs` | **신규** | 4축 가중 Jaccard 유사도 계산 |

---

## 4. 에러 처리

| 상황 | 처리 |
|------|------|
| andromeda_signals 없음 | 유사도 계산 스킵 |
| fingerprint null | 해당 축 가중치 0 (나머지 재분배) |
| 계정 내 소재 1건 | 비교 대상 없음 → 스킵 |

---

## 5. 구현 순서

- [ ] IMAGE_PROMPT_V3, VIDEO_PROMPT_V3에 andromeda_signals 추가
- [ ] IMAGE_PROMPT_FREE, VIDEO_PROMPT_FREE에 자유 기술 필드 추가
- [ ] compute-andromeda-similarity.mjs 신규 생성
- [ ] fingerprintSimilarity() Jaccard 구현
- [ ] andromedaSimilarity() 4축 가중 계산
- [ ] similar_creatives 배열 저장
- [ ] `npx tsc --noEmit` + `npm run build` 통과

---

> 설계서 작성 완료.
