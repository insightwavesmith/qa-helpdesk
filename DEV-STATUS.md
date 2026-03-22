# DEV-STATUS — 2026-03-22 최종

## 현재 상태 요약

| 항목 | 값 |
|------|-----|
| 마지막 완료 TASK | 체크리스트 78/84 완료 (93%) |
| 전체 Match Rate | 93% (84항목 중 78 완료, 6 BLOCKED) |
| 남은 항목 | 6건 — 전부 외부 의존 (Mixpanel/Meta/HW) |
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

## 챕터별 진행률 (84항목)

| 챕터 | Match Rate | 완료 | 미구현 |
|------|-----------|:----:|:-----:|
| 1. 전체 아키텍처 (12) | 83% | 10 | 2 |
| 2. 수집 (17) | 82% | 14 | 3 |
| 3. 저장 (14) | 100% | 14 | 0 |
| 4. LP 분석 (17) | 94% | 16 | 1 |
| 5. 소재 분석 (16) | 100% | 16 | 0 |
| 6. 순환 학습 (8) | 100% | 8 | 0 |
| **합계** | **93%** | **78** | **6** |

---

## BLOCKED 항목 (6건 — 전부 외부 의존)

| # | 항목 | 사유 | 해소 방법 |
|---|------|------|----------|
| 1 | Mixpanel 클릭 수집 (ch1) | $mp_click Autocapture 비활성 | Mixpanel 대시보드 설정 |
| 2 | Mixpanel 클릭 수집 (ch2) | 동일 | 동일 |
| 3 | 벤치마크→콘텐츠 풀 자동추가 (ch2) | 벤치마크 분석 배치 미가동 | STEP 4 이후 배치 실행 |
| 4 | 비회원 ad_accounts (ch2) | 33개 계정 토큰 미발급 | Meta BM 토큰 발급 |
| 5 | Mixpanel 클릭 수집 (ch4) | 동일 | 동일 |
| 6 | M4 Max 로컬 (ch1) | HW 전환 | Railway+Vercel 정상 가동 중 |

---

## 이번 세션 신규 구현 (64→78, +14건)

| 항목 | 구현물 | 유형 |
|------|--------|------|
| benchmark/ Storage 경로 | collect-benchmarks STEP 4 | route 확장 |
| competitor/ Storage 경로 | competitor-storage.ts + analyze-competitors | 신규 + route 확장 |
| LP HTML 다운로드 | crawl-lps fetchHtmlContent() | route 확장 |
| Gemini DOM 구조화 | analyze-lps-v2.mjs buildDomStructurePrompt() | 스크립트 확장 |
| 3축 교차 매트릭스 | compute-lp-cross-matrix.mjs (365줄) | 신규 스크립트 |
| 시선 행동 추론 (3층) | compute-lp-behavior-inference.mjs (355줄) | 신규 스크립트 |
| 영상 프레임별 DeepGaze | predict_video_frames.py (453줄) | 신규 스크립트 |
| Benchmark 콘텐츠 수집 | collect-benchmarks 이미지 다운 | route 확장 |
| 벤치마크 콘텐츠 비교 | 5축 파이프라인 연결 가능 | 구조 완성 |
| 데이터화 | compute-change-insights.mjs (415줄) | 신규 스크립트 |
| 제안→결과 추적 | compute-suggestion-tracking.mjs | 신규 스크립트 |
| 수강생 제안 활용 | generate-suggestion-bank.mjs | 신규 스크립트 |
| 역할 정리 | dual write 안정화 완료 | 결정 |
| DeepGaze LP 시선 | predict_lp.py + cron | 신규 (이전 커밋) |

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

## Railway 서비스 상태

| 서비스 | 상태 | 비고 |
|--------|:----:|------|
| creative-pipeline | ✅ | L1+L2+L3+L4 파이프라인 |
| saliency (predict.py) | ✅ | DeepGaze IIE, 2,784건 |
| bscamp-crawler | ✅ | Playwright, 공유 브라우저 |
| mozzi-reports | ✅ | Express 정적 서버 |
