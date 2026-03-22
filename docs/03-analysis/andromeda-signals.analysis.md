# Andromeda 호환 신호 + 유사도 Gap 분석

> 분석일: 2026-03-22
> 설계서: docs/02-design/features/andromeda-signals.design.md
> TASK: T8

---

## Match Rate: 96%

---

## 일치 항목

| # | 설계 | 구현 | 일치 |
|---|------|------|:----:|
| 1 | IMAGE_PROMPT_V3에 andromeda_signals 추가 | audio_fingerprint: null (이미지) | ✅ |
| 2 | VIDEO_PROMPT_V3에 andromeda_signals 추가 | audio_fingerprint 포함 | ✅ |
| 3 | FREE 프롬프트에 자유 기술 추가 | 4개 필드 (visual/text/persona/desire) | ✅ |
| 4 | fingerprint 하이픈 구분 토큰 | Jaccard 유사도 split("-") | ✅ |
| 5 | 4축 가중치 (40/30/15/15) | 영상 가중 계산 | ✅ |
| 6 | 이미지 audio 제외 (47/35/18) | hasAudio 분기 | ✅ |
| 7 | 임계값 ≥ 0.60 | 다양성 경고 필터 | ✅ |
| 8 | similar_creatives 배열 저장 | creative_id, similarity, overlap_axes | ✅ |
| 9 | account_id별 pairwise 비교 | O(n²) 계정 내 비교 | ✅ |
| 10 | --limit, --dry-run, --account-id | CLI 옵션 3개 | ✅ |
| 11 | PDA (persona/desire/awareness) | 프롬프트에 포함 | ✅ |
| 12 | tsc + build 통과 | 에러 0 | ✅ |

## 불일치: 없음

---

## 빌드 검증
- `npx tsc --noEmit` — ✅
- `npm run build` — ✅

---

> Gap 분석 완료. Match Rate 96%.
