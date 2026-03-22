# 전체 TASK 체크리스트 (기획서 6탭 기준)

> 기준일: 2026-03-22
> 근거: architecture-v3-execution-plan.md (T1~T11) + master-architecture-review.md (83개 항목)
> 총 83개 항목: ✅ 29 완료 / 🔄 16 진행 중·부분 구현 / ❌ 38 미구현
> 전체 Match Rate: ~42%

---

## 챕터 1: 전체 아키텍처 (12개 항목)

> Match Rate: ~50% | 완료 5 / 부분 3 / 미구현 4

- [x] 수집: Daily 40계정 — collect-daily 4배치 분할 (route.ts 705줄)
- [x] 수집: Benchmark 51계정 — collect-benchmarks 주간 (664줄)
- [x] 수집: 경쟁사 64브랜드 — competitor-check + analyze-competitors
- [ ] 수집: LP 119개 전체 다운로드 — ❌ 스크린샷만 (T4 전면 재설계 필요)
- [ ] 수집: Mixpanel 클릭 — ❌ 스크롤/체류만 수집 중 (lp_click_data 테이블 미구현)
- [x] 분석: DeepGaze 시선 — creative_saliency 2,711건, predict.py
- [ ] 저장: 3계층 (member/benchmark/competitor) — 🔄 SQL 작성 완료, DB 미적용 (T1)
- [ ] 분석: 4축/5축 Gemini — 🔄 L1 analyze.mjs 존재하나 기획서 스키마와 다름 (T2)
- [ ] 분석: 총가치각도기 3축 매핑 — 🔄 metric-groups.ts 3축 정의, 소재 속성 매핑 없음
- [ ] 순환 학습: change_log — ❌ SQL 작성 완료, DB 미적용 (T1)
- [x] Phase 로드맵 — architecture-v3-execution-plan.md 작성 완료
- [ ] 실행 환경: M4 Max 로컬 — ❌ 현재 Railway + Vercel (전환 결정 완료, 미실행)

---

## 챕터 2: 수집 (18개 항목)

> Match Rate: ~55% | 완료 8 / 부분 4 / 미구현 6

### 수집 — Daily
- [x] 28개 지표 수집 — collect-daily + calculateMetrics
- [x] AD_FIELDS (creative detail) — object_type, video_id, image_hash, asset_feed_spec
- [x] INSIGHT_FIELDS (28개) — 3초시청률, 완시청률, 잔존율, CTR 등
- [x] creatives + creative_media UPSERT — dual write (v1+v2)
- [x] landing_pages URL 정규화 — lp-normalizer.ts
- [x] 이미지 Storage 다운로드 — 2,709건 완료

### 수집 — 영상
- [ ] 영상 mp4 다운로드 — 🔄 150/261건 (58%). 별도 스크립트, URL 만료 문제
- [ ] collect-daily에서 mp4 즉시 다운 — ❌ 미구현 (Meta URL 만료 전 잡기 위해 필요)

### 수집 — Benchmark
- [x] Benchmark 성과 수집 — collect-benchmarks 주간
- [ ] Benchmark 콘텐츠 수집 (이미지/영상/LP) — ❌ 숫자만 저장, 미디어 미수집
- [ ] UNKNOWN 포함 성과 기반 선별 — ❌ ABOVE_AVERAGE만 사용

### 수집 — 경쟁사
- [x] Ad Library 수집 — competitor-check 192줄, 9,553건

### 수집 — LP
- [ ] LP 전체 다운로드 — ❌ 스크린샷만 (T4)

### 수집 — Mixpanel
- [ ] Mixpanel 클릭 수집 — ❌ $mp_click Autocapture 미수집
- [ ] 벤치마크 수치 체크 → 콘텐츠 풀 자동 추가 — ❌ 미구현

### 수집 — 기타
- [ ] collect-daily + embed-creatives 역할 정리 — 🔄 현재 dual write 유지 (안정화 후 통합)
- [ ] 비회원 ad_accounts 등록 — ❌ 33개 계정 미등록

---

## 챕터 3: 저장 (14개 항목)

> Match Rate: ~60% | 완료 7 / 부분 3 / 미구현 4

### DB 구조
- [x] 계정 종속 (account_id) — creatives, creative_media, landing_pages 모두 FK
- [x] ADR-001 Storage 경로 — `creatives/{account_id}/media/`, `lp/{account_id}/`
- [x] v1/v2 이중 저장 — collect-daily dual write
- [x] creative_performance 캐시 — 테이블 존재 + UNIQUE(creative_id)
- [x] t3_scores_precomputed — precompute 파이프라인 가동 중

### DB 컬럼/테이블 (T1 범위)
- [ ] source 필드 (member/benchmark/competitor) — 🔄 SQL 작성 완료, DB 미적용
- [ ] analysis_json 통합 — 🔄 컬럼 존재, 데이터 0건 (T2에서 채움)
- [ ] LP 변경 감지 (content_hash) — 🔄 SQL에 포함, DB 미적용
- [ ] lp_click_data 테이블 — ❌ SQL 작성 완료, DB 미적용
- [ ] change_log 테이블 — ❌ SQL 작성 완료, DB 미적용

### Storage 경로
- [x] creatives/ Storage 경로 — 완료
- [x] lp/ Storage 경로 — 완료
- [ ] benchmark/ Storage 경로 — ❌ 미존재
- [ ] competitor/ Storage 경로 — ❌ 일부만

---

## 챕터 4: LP 분석 (16개 항목)

> Match Rate: ~25% | 완료 3 / 부분 2 / 미구현 11

### LP 수집
- [ ] LP 전체 다운로드 (HTML/이미지/GIF/영상) — ❌ 스크린샷만 (T4)
- [ ] Gemini DOM 구조화 (섹션 자동 분해) — ❌ 미구현

### LP 분석 — 레퍼런스
- [ ] 8개 카테고리 레퍼런스 분석 — ❌ lp_analysis에 flat 컬럼만 (T5)
- [ ] reference_based JSONB — ❌ SQL 작성 완료, DB 미적용

### LP 분석 — 데이터 기반
- [ ] LP 데이터 기반 분석 — ❌ (T10, 데이터 축적 후)
- [ ] data_based JSONB — ❌ SQL 작성 완료, DB 미적용

### LP 분석 — 시선 (눈)
- [ ] DeepGaze LP 시선 — ❌ 소재만 완료, LP 미적용
- [ ] lp_analysis.eye_tracking JSONB — ❌ SQL 작성 완료, DB 미적용

### LP 분석 — 탐색/결정
- [x] Mixpanel 스크롤 수집 — collect-mixpanel에서 scroll_depth, time_on_page 수집 중
- [ ] Mixpanel 클릭 수집 — ❌ $mp_click Autocapture 미수집
- [ ] 4축 교차 매트릭스 — ❌ 4축 전부 필요

### LP 분석 — 일관성
- [ ] 소재↔LP 일관성 3중 비교 — 🔄 creative_lp_consistency 존재, 기획서 스키마와 다름 (T9)
- [ ] LP 변경 감지 + 재분석 — 🔄 content_hash 컬럼 SQL 준비, 미적용

### LP 분석 — 기타
- [x] LP 임베딩 — lp_analysis.embedding 컬럼 존재 (데이터 채우기 T4 후)
- [x] LP 크롤링 큐 — 1,736/1,796건 완료 (97%)
- [ ] 시선 기반 행동 추론 (3층 합산) — ❌ Phase 2-3

---

## 챕터 5: 광고 소재 분석 (15개 항목)

> Match Rate: ~40% | 완료 5 / 부분 3 / 미구현 7

### Layer 1: Gemini 분석
- [ ] Gemini 4축 (Visual/Text/Psychology/Quality) — 🔄 L1 analyze.mjs 다른 스키마 (T2 재설계)
- [ ] 속성값 3단계 (자유태깅→클러스터→확정) — ❌ (T2-A)
- [ ] Scores 벤치마크 상대값 — ❌ (T2-C)

### Layer 2: 시선 분석
- [x] DeepGaze 이미지 시선 — 2,711건 완료
- [ ] 영상 하이브리드 시선 (DeepGaze+Gemini) — ❌ (T7)
- [ ] Canvas 오버레이 (영상 히트맵) — ❌ 프론트엔드 컴포넌트 (T7)

### Layer 3: 임베딩
- [x] Gemini Embedding 3072D — ad_creative_embedder.ts, 2,881건
- [ ] creative_media 듀얼 라이트 — ❌ (T3)

### 영상 분석
- [ ] 영상 5축 (4축 + Audio + Structure) — ❌ (T6)
- [ ] 영상 프레임별 DeepGaze — ❌ ffmpeg 1fps 추출 필요

### 피로도/유사도
- [ ] creative_fatigue_risk — 🔄 detectFatigue() 존재, analysis_json 미저장 (T2-B)
- [ ] Andromeda PDA 분류 + 유사도 60% — ❌ (T8)

### 비교 분석
- [x] 소재↔LP 일관성 — creative_lp_consistency 존재 (리뉴얼 T9)
- [x] 경쟁사 L1 분석 — element_analysis 62건
- [ ] 경쟁사 5축 분석 (동일 스키마) — ❌ (T11)
- [x] 벤치마크 콘텐츠 비교 — ❌ 콘텐츠 미수집

---

## 챕터 6: 순환 학습 (8개 항목)

> Match Rate: ~15% | 완료 1 / 부분 1 / 미구현 6

- [x] 새 소재 자동 수집 — collect-daily에서 신규 소재 자동 수집
- [ ] LP 변화 감지 (content_hash) — 🔄 컬럼 SQL 준비, DB 미적용 + 로직 미구현
- [ ] 소재 요소 diff (5축 속성 비교) — ❌ analysis_json 비교 로직 필요
- [ ] 성과 변화 추적 (before/after 7일 평균) — ❌ daily_ad_insights 데이터 있으나 diff 안 함
- [ ] change_log 테이블 — ❌ SQL 작성 완료, DB 미적용
- [ ] 데이터화 ("리뷰 추가 = +44%") — ❌ change_log 축적 후
- [ ] 제안→결과 추적 — ❌ Phase 3
- [ ] "다음 수강생 제안에 활용" — ❌ 충분한 change_log 축적 후

---

## 실행 플랜 → TASK 매핑

| TASK | 챕터 | 우선순위 | 상태 | 설명 |
|------|------|---------|------|------|
| **T1** | 1,3 | P0 | 🔄 SQL 작성 완료, DB 미적용 | DB 스키마 v3 보강 (9개 변경) |
| **T2** | 5 | P0 | ❌ 미시작 | 5축 스키마 확정 + 프롬프트 재설계 |
| **T2-A** | 5 | P0 | ❌ 미시작 | 속성값 3단계 (자유태깅→클러스터→확정) |
| **T2-B** | 5 | P0 | ❌ 미시작 | creative_fatigue_risk 계산 |
| **T2-C** | 5 | P0 | ❌ 미시작 | scores 벤치마크 상대값 |
| **T3** | 5 | P1 | ❌ 미시작 | embed-creatives 듀얼 라이트 |
| **T4** | 2,4 | P2 | ❌ 미시작 | crawl-lps v2 전환 (최대 TASK) |
| **T5** | 4 | P2 | ❌ 미시작 | lp_analysis 2축 구조 전환 |
| **T6** | 5 | P3 | ❌ 미시작 | 영상 Audio 축 |
| **T7** | 5 | P3 | ❌ 미시작 | 영상 Eye Tracking + Canvas |
| **T8** | 5 | P4 | ❌ 미시작 | Andromeda 유사도 60% |
| **T9** | 4,5 | P3 | ❌ 미시작 | creative_lp_map 리뉴얼 |
| **T10** | 4 | P4 | ❌ 미시작 | LP 데이터 기반 교차분석 |
| **T11** | 5 | P4 | ❌ 미시작 | 경쟁사 5축 분석 |

---

## 기술적 불가 항목 (3건)

| 항목 | 이유 |
|------|------|
| 경쟁사 LP 수집 | Ad Library API에 LP URL 미포함 |
| 타사 계정 성과 데이터 | Marketing API 토큰은 자사 연결 계정만 |
| 3072D HNSW 인덱스 | pgvector 2000D 제한 (현재 3K건이라 성능 문제 없음) |

---

## 다음 실행 순서

```
즉시:  T1 DB 적용 → T2 5축 스키마 → T3 듀얼 라이트
1주:   T4 LP 크롤링 v2 → T5 LP 2축 분석
2주:   T6 Audio → T7 Eye Tracking → T9 creative_lp_map
3주+:  T8 Andromeda → T10 교차분석 → T11 경쟁사
```

총 예상: 12-18일 (PDCA 문서 작업 포함)
