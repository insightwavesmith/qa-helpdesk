# 전체 TASK 체크리스트 (기획서 6탭 기준)

> 기준일: 2026-03-22 (T2~T11 완료 반영)
> 근거: architecture-v3-execution-plan.md (T1~T11) + master-architecture-review.md (83개 항목)
> 총 83개 항목: ✅ 59 완료 / 🔄 4 진행 중·부분 구현 / ❌ 20 미구현
> 전체 Match Rate: ~71% (T1~T11 + LP 변경 감지 + 성과 추적 + 3축 매핑 반영)

---

## 챕터 1: 전체 아키텍처 (12개 항목)

> Match Rate: ~83% | 완료 10 / 부분 0 / 미구현 2

- [x] 수집: Daily 40계정 — collect-daily 4배치 분할 (route.ts 705줄)
- [x] 수집: Benchmark 51계정 — collect-benchmarks 주간 (664줄)
- [x] 수집: 경쟁사 64브랜드 — competitor-check + analyze-competitors
- [x] 수집: LP v2 크롤링 — ✅ T4 완료. crawl-lps v2 route 재작성, landing_pages 기준
- [ ] 수집: Mixpanel 클릭 — ❌ 스크롤/체류만 수집 중 (lp_click_data 테이블 생성됨, 클릭 수집 미구현)
- [x] 분석: DeepGaze 시선 — creative_saliency 2,784건 (95.5%)
- [x] 저장: 3계층 (member/benchmark/competitor) — ✅ T1 완료
- [x] 분석: 5축 Gemini — ✅ T2 완료. analyze-five-axis.mjs v3 (visual/text/psychology/quality/hook). 3모드(free/cluster/final)
- [x] 분석: 총가치각도기 3축 매핑 — ✅ ATTRIBUTE_AXIS_MAP 15속성 매핑 + getAttributesForGroup() (Phase 2 가중치 보정 예정)
- [x] 순환 학습: change_log — ✅ T1 완료
- [x] Phase 로드맵 — architecture-v3-execution-plan.md + T1~T11 전부 완료
- [ ] 실행 환경: M4 Max 로컬 — ❌ 현재 Railway + Vercel (전환 미실행)

---

## 챕터 2: 수집 (18개 항목)

> Match Rate: ~67% | 완료 10 / 부분 2 / 미구현 6

### 수집 — Daily
- [x] 28개 지표 수집 — collect-daily + calculateMetrics
- [x] AD_FIELDS (creative detail) — object_story_spec + asset_feed_spec LP URL fallback
- [x] INSIGHT_FIELDS (28개) — 3초시청률, 완시청률, 잔존율, CTR 등
- [x] creatives + creative_media UPSERT — ✅ T3 듀얼 라이트 완료
- [x] landing_pages URL 정규화 — lp-normalizer.ts
- [x] 이미지 Storage 다운로드 — 2,873+건 완료

### 수집 — 영상
- [ ] 영상 mp4 다운로드 — 🔄 150/261건 (58%). URL 만료 문제
- [ ] collect-daily에서 mp4 즉시 다운 — ❌ 미구현

### 수집 — Benchmark
- [x] Benchmark 성과 수집 — collect-benchmarks 주간
- [ ] Benchmark 콘텐츠 수집 (이미지/영상/LP) — ❌ 숫자만 저장
- [ ] UNKNOWN 포함 성과 기반 선별 — ❌ ABOVE_AVERAGE만 사용

### 수집 — 경쟁사
- [x] Ad Library 수집 — competitor-check 9,553건

### 수집 — LP
- [x] LP v2 크롤링 — ✅ T4 완료. mobile+desktop viewport, lp_snapshots UPSERT

### 수집 — Mixpanel
- [ ] Mixpanel 클릭 수집 — ❌ $mp_click Autocapture 미수집
- [ ] 벤치마크 수치 체크 → 콘텐츠 풀 자동 추가 — ❌ 미구현

### 수집 — 기타
- [ ] collect-daily + embed-creatives 역할 정리 — 🔄 dual write 유지 (안정화 후 통합)
- [ ] 비회원 ad_accounts 등록 — ❌ 33개 계정 미등록

---

## 챕터 3: 저장 (14개 항목)

> Match Rate: ~86% | 완료 12 / 부분 0 / 미구현 2

### DB 구조
- [x] 계정 종속 (account_id) — creatives, creative_media, landing_pages 모두 FK
- [x] ADR-001 Storage 경로 — `creatives/{account_id}/media/`, `lp/{account_id}/`
- [x] v1/v2 이중 저장 — ✅ T3 듀얼 라이트 완료
- [x] creative_performance 캐시 — 테이블 존재 + UNIQUE(creative_id)
- [x] t3_scores_precomputed — precompute 파이프라인 가동 중

### DB 컬럼/테이블 (T1 범위)
- [x] source 필드 (member/benchmark/competitor) — ✅ T1 완료, CHECK 제약
- [x] analysis_json 통합 — ✅ T2 완료, 5축 데이터 채움
- [x] LP 변경 감지 (content_hash) — ✅ T1 완료, 컬럼 적용
- [x] lp_click_data 테이블 — ✅ T1 완료
- [x] change_log 테이블 — ✅ T1 완료

### Storage 경로
- [x] creatives/ Storage 경로 — 완료
- [x] lp/ Storage 경로 — 완료
- [ ] benchmark/ Storage 경로 — ❌ 미존재
- [ ] competitor/ Storage 경로 — ❌ 일부만

---

## 챕터 4: LP 분석 (16개 항목)

> Match Rate: ~69% | 완료 10 / 부분 1 / 미구현 5

### LP 수집
- [x] LP v2 크롤링 (스크린샷) — ✅ T4 완료. mobile+desktop, lp_snapshots UPSERT
- [ ] LP 전체 다운로드 (HTML/이미지/GIF/영상) — ❌ 스크린샷만
- [ ] Gemini DOM 구조화 (섹션 자동 분해) — ❌ 미구현

### LP 분석 — 레퍼런스
- [x] 8개 카테고리 레퍼런스 분석 — ✅ T5 완료. analyze-lps-v2.mjs (473줄), Gemini 2.5 Pro
- [x] reference_based JSONB — ✅ T5 완료. lp_analysis UPSERT

### LP 분석 — 데이터 기반
- [x] LP 데이터 기반 분석 — ✅ T10 완료. compute-lp-data-analysis.mjs (423줄)
- [x] data_based JSONB — ✅ T10 완료. conversion_score 백분위

### LP 분석 — 시선 (눈)
- [ ] DeepGaze LP 시선 — ❌ 소재만 완료, LP 미적용
- [ ] lp_analysis.eye_tracking JSONB — ❌ 컬럼 존재, 데이터 미채움

### LP 분석 — 탐색/결정
- [x] Mixpanel 스크롤 수집 — collect-mixpanel에서 수집 중
- [ ] Mixpanel 클릭 수집 — ❌ $mp_click 미수집
- [ ] 4축 교차 매트릭스 — 🔄 T10에서 교차분석 구현, 클릭 축 미완

### LP 분석 — 일관성
- [x] 소재↔LP 일관성 — ✅ T9 완료. analyze-creative-lp-alignment.mjs, 4축 분석(message/visual/cta/offer)
- [x] LP 변경 감지 + 재분석 — ✅ crawl-lps content_hash diff → change_log + lp_analysis.analyzed_at 리셋 + analyze-lps-v2 재분석 필터

### LP 분석 — 기타
- [x] LP 임베딩 — lp_analysis.embedding 컬럼 존재
- [x] LP 크롤링 큐 — ✅ 1,796건 완료
- [ ] 시선 기반 행동 추론 (3층 합산) — ❌ Phase 2-3

---

## 챕터 5: 광고 소재 분석 (15개 항목)

> Match Rate: ~80% | 완료 11 / 부분 1 / 미구현 3

### Layer 1: Gemini 분석
- [x] Gemini 5축 (Visual/Text/Psychology/Quality/Hook) — ✅ T2 완료. analyze-five-axis.mjs v3 재설계
- [x] 속성값 3단계 (자유태깅→클러스터→확정) — ✅ T2-A 완료. free→cluster→final 3모드
- [x] Scores 벤치마크 상대값 — ✅ T2-C 완료. compute-score-percentiles.mjs 카테고리 백분위

### Layer 2: 시선 분석
- [x] DeepGaze 이미지 시선 — 2,784건 완료 (95.5%)
- [x] 영상 하이브리드 시선 (DeepGaze+Gemini) — ✅ T7 완료. VIDEO_PROMPT_V3 eye_tracking frames
- [x] Canvas 오버레이 (영상 히트맵) — ✅ T7 완료. video-heatmap-overlay.tsx

### Layer 3: 임베딩
- [x] Gemini Embedding 3072D — ad_creative_embedder.ts, 2,881건
- [x] creative_media 듀얼 라이트 — ✅ T3 완료. embedCreative() 5단계 추가

### 영상 분석
- [x] 영상 5축 (4축 + Audio + Structure) — ✅ T6 완료. analyzeWithGemini() videoUrl 파라미터, mp4 다운로드+썸네일 폴백
- [ ] 영상 프레임별 DeepGaze — ❌ ffmpeg 1fps 추출 필요

### 피로도/유사도
- [x] creative_fatigue_risk — ✅ T2-B 완료. compute-fatigue-risk.mjs 임베딩 코사인 유사도
- [x] Andromeda PDA 분류 + 유사도 60% — ✅ T8 완료. compute-andromeda-similarity.mjs 4축 가중 Jaccard

### 비교 분석
- [x] 소재↔LP 일관성 — ✅ T9 완료. analyze-creative-lp-alignment.mjs
- [x] 경쟁사 L1 분석 — element_analysis 62건
- [x] 경쟁사 5축 분석 — ✅ T11 완료. --source competitor 모드
- [ ] 벤치마크 콘텐츠 비교 — ❌ 콘텐츠 미수집 (챕터 2 의존)

---

## 챕터 6: 순환 학습 (8개 항목)

> Match Rate: ~50% | 완료 4 / 부분 0 / 미구현 4

- [x] 새 소재 자동 수집 — collect-daily에서 신규 소재 자동 수집
- [x] LP 변화 감지 (content_hash) — ✅ crawl-lps에서 hash diff → change_log + 재분석 트리거
- [ ] 소재 요소 diff (5축 속성 비교) — ❌ analysis_json 비교 로직 필요
- [x] 성과 변화 추적 (before/after 7일 평균) — ✅ track-performance 크론 (매일 23:00 UTC)
- [x] change_log 테이블 — ✅ T1 완료 (데이터 축적 필요)
- [ ] 데이터화 ("리뷰 추가 = +44%") — ❌ change_log 축적 후
- [ ] 제안→결과 추적 — ❌ Phase 3
- [ ] "다음 수강생 제안에 활용" — ❌ 충분한 change_log 축적 후

---

## 실행 플랜 → TASK 매핑

| TASK | 챕터 | 우선순위 | 상태 | 설명 |
|------|------|---------|------|------|
| **T1** | 1,3 | P0 | ✅ 완료 | DB 스키마 v3 보강 — 커밋 6f70f83 |
| **T2** | 5 | P0 | ✅ 완료 | 5축 분석 v3 재설계 — Gap 96% |
| **T2-A** | 5 | P0 | ✅ 완료 | 속성값 3단계 (free→cluster→final) |
| **T2-B** | 5 | P0 | ✅ 완료 | compute-fatigue-risk.mjs |
| **T2-C** | 5 | P0 | ✅ 완료 | compute-score-percentiles.mjs |
| **T3** | 5 | P1 | ✅ 완료 | embed-creatives 듀얼 라이트 — Gap 97% |
| **T4** | 2,4 | P2 | ✅ 완료 | crawl-lps v2 전환 — Gap 95% |
| **T5** | 4 | P2 | ✅ 완료 | lp_analysis 2축 구조 전환 — Gap 93% |
| **T6** | 5 | P3 | ✅ 완료 | 영상 Audio 축 — Gap 96% |
| **T7** | 5 | P3 | ✅ 완료 | 영상 Eye Tracking + Canvas — Gap 97% |
| **T8** | 5 | P4 | ✅ 완료 | Andromeda 유사도 60% — Gap 96% |
| **T9** | 4,5 | P3 | ✅ 완료 | creative_lp_map 리뉴얼 — Gap 95% |
| **T10** | 4 | P4 | ✅ 완료 | LP 교차분석 + 전환율 — Gap 96% |
| **T11** | 5 | P4 | ✅ 완료 | 경쟁사 5축 분석 — Gap 97% |

---

## 남은 작업 (우선순위 순)

### P1 — 즉시 가능
1. LP 변경 감지 로직 구현 (content_hash diff → 재분석 트리거)
2. 총가치각도기 3축 ↔ 소재 속성 매핑 (metric-groups.ts)
3. 성과 변화 추적 (before/after 7일 ROAS diff → change_log 기록)

### P2 — 데이터 의존
4. DeepGaze LP 시선 분석 (LP 스크린샷 → saliency predict)
5. 영상 프레임별 DeepGaze (ffmpeg 1fps 추출 필요)
6. collect-daily mp4 즉시 다운 (Meta URL 만료 전 잡기)

### P3 — 외부 의존
7. Mixpanel 클릭 수집 ($mp_click Autocapture 설정 필요)
8. Benchmark 콘텐츠 수집 (이미지/영상/LP)
9. 비회원 ad_accounts 등록 (33개)

### 기술적 불가 (3건)

| 항목 | 이유 |
|------|------|
| 경쟁사 LP 수집 | Ad Library API에 LP URL 미포함 |
| 타사 계정 성과 데이터 | Marketing API 토큰은 자사 연결 계정만 |
| 3072D HNSW 인덱스 | pgvector 2000D 제한 (현재 3K건이라 성능 문제 없음) |
