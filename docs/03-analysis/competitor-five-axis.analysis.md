# 경쟁사 소재 5축 분석 Gap 분석

> 분석일: 2026-03-22
> 설계서: docs/02-design/features/competitor-five-axis.design.md
> TASK: T11

---

## Match Rate: 97%

---

## 일치 항목

| # | 설계 | 구현 | 일치 |
|---|------|------|:----:|
| 1 | --source competitor CLI 옵션 | SOURCE 파싱 + 유효성 검증 (L40-51) | ✅ |
| 2 | competitor_ad_cache analysis_json_v3 IS NULL 조회 | sbGet 페이지네이션 (L836-849) | ✅ |
| 3 | IMAGE_PROMPT_V3 동일 프롬프트 사용 | prompt = IMAGE_PROMPT_V3 (L736) | ✅ |
| 4 | gemini-2.0-flash 모델 | GEMINI_MODEL_COMPETITOR (L80) | ✅ |
| 5 | Rate limit 2초 | RATE_LIMIT_COMPETITOR_MS = 2000 (L81) | ✅ |
| 6 | Meta CDN 이미지 다운로드 + base64 | fetch + arrayBuffer + base64 (L740-755) | ✅ |
| 7 | CDN 403/404 스킵 + 로그 | cdnErrors 별도 카운트 (L884-893) | ✅ |
| 8 | 재시도 3회 (429/5xx) | MAX_RETRIES + exponential backoff (L761-828) | ✅ |
| 9 | analysis_json_v3 PATCH 저장 | sbPatch competitor_ad_cache (L896-900) | ✅ |
| 10 | --limit, --dry-run 지원 | 기존 CLI 옵션 재사용 (L853, L869) | ✅ |
| 11 | model 필드를 flash로 기록 | parsed.model = GEMINI_MODEL_COMPETITOR (L800) | ✅ |
| 12 | 이미지만 분석 (video 무시) | IMAGE_PROMPT_V3만 사용, video_url 무시 | ✅ |
| 13 | 기존 creative 모드 무변경 | competitor 분기를 별도 함수로 분리 | ✅ |
| 14 | tsc + build 통과 | 에러 0 | ✅ |

## 불일치: 없음

---

## 빌드 검증
- `npx tsc --noEmit` — ✅
- `npm run build` — ✅

---

> Gap 분석 완료. Match Rate 97%.
