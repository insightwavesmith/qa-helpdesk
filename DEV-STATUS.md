# DEV-STATUS — 2026-03-22 기준

## 현재 상태 요약

| 항목 | 값 |
|------|-----|
| 마지막 완료 TASK | T1~T11 전체 완료 (커밋 `710afb4`) |
| 전체 Match Rate | ~76% (83항목 중 63 완료) |
| 다음 TASK | 5축 전체 배치 실행 (진행 중) |
| 체크리스트 | `docs/00-overview/full-task-checklist.md` |
| 실행 플랜 | `docs/01-plan/features/architecture-v3-execution-plan.md` |

---

## T1~T11 완료 현황

| TASK | Match Rate | 커밋 | 핵심 결과물 |
|------|-----------|------|------------|
| T1 | - | 6f70f83 | DB 스키마 v3 (9개 변경) |
| T2 | 96% | 97331d2 | analyze-five-axis.mjs v3 (3모드) |
| T2-A | - | 97331d2 | 속성값 free→cluster→final |
| T2-B | - | 97331d2 | compute-fatigue-risk.mjs |
| T2-C | - | 97331d2 | compute-score-percentiles.mjs |
| T3 | 97% | 97331d2 | embed-creatives 듀얼 라이트 |
| T4 | 95% | 97331d2 | crawl-lps v2 route 재작성 |
| T5 | 93% | d4505a5 | analyze-lps-v2.mjs (473줄) |
| T6 | 96% | d4505a5 | 영상 Audio 축 (mp4+썸네일) |
| T7 | 97% | d4505a5 | Eye Tracking + video-heatmap-overlay.tsx |
| T8 | 96% | d4505a5 | Andromeda 4축 가중 Jaccard |
| T9 | 95% | d4505a5 | creative_lp_map 4축 일관성 |
| T10 | 96% | d4505a5 | LP 교차분석 + 전환율 |
| T11 | 97% | d4505a5 | 경쟁사 5축 (--source competitor) |

---

## 챕터별 진행률 (83항목)

| 챕터 | Match Rate | 완료 | 부분 | 미구현 |
|------|-----------|:----:|:----:|:-----:|
| 1. 전체 아키텍처 | 83% | 10 | 0 | 2 |
| 2. 수집 | 72% | 12 | 0 | 6 |
| 3. 저장 | 86% | 12 | 0 | 2 |
| 4. LP 분석 | 81% | 12 | 1 | 3 |
| 5. 소재 분석 | 80% | 11 | 1 | 3 |
| 6. 순환 학습 | 63% | 5 | 0 | 3 |
| **합계** | **~76%** | **63** | **2** | **18** |

---

## 배치 처리 현황

| 항목 | 완료 | 전체 | 비율 |
|------|-----:|-----:|-----:|
| 소재 (creative_media) | 2,914 | 2,914 | 100% |
| 임베딩 3072 | 2,881 | 2,914 | 99% |
| LP 크롤링 | 1,796 | 1,796 | 100% |
| Saliency 히트맵 | 2,784 | 2,914 | 95.5% |
| 미디어 Storage | 2,873+ | 2,914 | 99%+ |
| 진단 캐시 | 완료 | ~400 | 100% |
| Creative Intelligence | 358 | 2,914 | 12% |
| 경쟁사 모니터 | 62 | — | — |
| 5축 분석 v3 | — | — | 배치 대기 |

---

## P1 완료 작업

1. ~~**LP 변경 감지 로직**~~ — ✅ crawl-lps에서 content_hash diff → change_log INSERT + lp_analysis.analyzed_at 리셋 + analyze-lps-v2.mjs 재분석 필터 추가
2. ~~**성과 변화 추적**~~ — ✅ track-performance 크론 신규 (before/after 7일 평균 → change_log 업데이트, 매일 23:00 UTC)
3. ~~**총가치각도기 3축 매핑**~~ — ✅ ATTRIBUTE_AXIS_MAP 15속성 매핑 (Phase 2 가중치 보정 예정)

## 남은 P1 작업 (즉시 진행 가능)

1. **5축 분석 전체 배치** — analyze-five-axis.mjs --mode final 전계정 실행 (2,933건, 진행 중)

---

## Railway 서비스 상태

| 서비스 | 상태 | 비고 |
|--------|:----:|------|
| creative-pipeline | ✅ | L1+L2+L3+L4 파이프라인 |
| saliency (predict.py) | ✅ | DeepGaze IIE, 2,784건 |
| bscamp-crawler | ✅ | Playwright, 공유 브라우저 |
| mozzi-reports | ✅ | Express 정적 서버 |
