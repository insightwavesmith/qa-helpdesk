# creative_lp_map 리뉴얼 Gap 분석

> 분석일: 2026-03-22
> 설계서: docs/02-design/features/creative-lp-alignment.design.md
> TASK: T9

---

## Match Rate: 95%

---

## 일치 항목

| # | 설계 | 구현 | 일치 |
|---|------|------|:----:|
| 1 | analyze-creative-lp-alignment.mjs 신규 | 생성 완료 | ✅ |
| 2 | creative_lp_map overall_score IS NULL 조회 | REST API 필터 | ✅ |
| 3 | creative_media.analysis_json 조회 | visual/text/psychology 추출 | ✅ |
| 4 | lp_analysis.reference_based 조회 | REST API 조회 | ✅ |
| 5 | Gemini 2.5 Pro 일관성 프롬프트 | 소재 vs LP 비교 | ✅ |
| 6 | 4가지 alignment 점수 (0-100) | message/visual/cta/offer | ✅ |
| 7 | issues JSONB 배열 | type/severity/description/action | ✅ |
| 8 | overall_score 가중 평균 | 0.35/0.15/0.25/0.25 | ✅ |
| 9 | Rate limit 4초 | sleep(4000) | ✅ |
| 10 | 재시도 3회 (429/5xx) | exponential backoff | ✅ |
| 11 | --limit, --dry-run | CLI 옵션 | ✅ |
| 12 | tsc + build 통과 | 에러 0 | ✅ |

## 불일치: 없음

---

## 빌드 검증
- `npx tsc --noEmit` — ✅
- `npm run build` — ✅

---

> Gap 분석 완료. Match Rate 95%.
