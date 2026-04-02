# 처방축(소재분석) 파이프라인 As-Is 현황 보고서

> 작성일: 2026-04-02
> 작성자: PM
> 유형: As-Is 분석 + Gap 도출
> 선행: prescription-system-v2.report.md (2026-03-26)

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| 파이프라인 단계 | 수집 → 저장 → 분석 → 후처리 → 처방 → 표시 (6단계) |
| 총 스크립트 | 18개 (scripts/archive/) |
| src/lib 모듈 | 17개 (src/lib/protractor/) |
| Cron 라우트 | 13개 (처방 관련) |
| API 라우트 | 13개 (src/app/api/protractor/) |
| UI 컴포넌트 | 46개 (src/app/(main)/protractor/) |
| **자동화율** | **46%** (13/28 핵심 단계 중 cron 등록 완료) |
| **파이프라인 끊김** | **4곳** (분석→후처리→처방 구간) |

| 관점 | 내용 |
|------|------|
| **문제** | 수집→분석 파이프라인이 중간에 수동 스크립트로 끊겨 있어 "한 축으로 자연스럽게 굴러가지" 않음 |
| **원인** | 핵심 분석(5축)·후처리(점수/유사도/패턴) 단계가 cron화 안 되고 archive에 수동 실행으로 남아 있음 |
| **영향** | 신규 소재 업로드 후 처방까지 수동 개입 필요, 패턴 테이블 갱신 안 됨, LP 일관성 미연결 |
| **핵심 개선** | 5축 분석 cron화 + 후처리 4개 스크립트 자동화 + LP-처방 연결 |

---

## 1. 파이프라인 전체 흐름도

```
                          ┌─────────────────────────────────────────────┐
                          │          수집 (Cron — 자동)                  │
                          │                                             │
  Meta API ──→ collect-daily ──→ daily_ad_insights                     │
  Meta API ──→ discover-accounts ──→ ad_accounts                      │
  Meta API ──→ process-media ──→ GCS + creative_media                 │
  Motion   ──→ collect-benchmarks ──→ benchmarks                      │
                          └──────────────┬──────────────────────────────┘
                                         │
                          ┌──────────────▼──────────────────────────────┐
                          │          분석 (Cron + 수동 혼재)             │
                          │                                             │
  [Cron] embed-creatives ──→ creative_media.embedding                  │
  [Cron] creative-saliency ──→ creative_saliency (DeepGaze)           │
  [Cron] video-saliency ──→ video_saliency_frames                     │
  [Cron] video-scene-analysis ──→ creative_media.video_analysis       │
                          │                                             │
  ╔═══════════════════════╧═══════════════════════════════════════════╗ │
  ║ [수동] analyze-five-axis.mjs ──→ analysis_json (5축 Gemini)      ║ │
  ╚═══════════════════════════════════════════════════════════════════╝ │
                          └──────────────┬──────────────────────────────┘
                                         │ ← ★ 끊김 1: 수동 실행 필요
                          ┌──────────────▼──────────────────────────────┐
                          │          후처리 (전부 수동)                   │
                          │                                             │
  ╔ [수동] compute-score-percentiles.mjs ──→ analysis_json.scores    ╗ │
  ║ [수동] compute-andromeda-similarity.mjs ──→ andromeda_signals     ║ │
  ║ [수동] compute-fatigue-risk.mjs ──→ creative_fatigue_risk        ║ │
  ║ [수동] extract-prescription-patterns.mjs ──→ prescription_patterns║ │
  ╚══════════════════════════════════════════════════════════════════╝ │
                          └──────────────┬──────────────────────────────┘
                                         │ ← ★ 끊김 2: patterns 갱신 안 됨
                          ┌──────────────▼──────────────────────────────┐
                          │          처방 (Cron — 자동)                  │
                          │                                             │
  [Cron] run-prescription ──→ 13단계 엔진 ──→ analysis_json.prescription│
  [Cron] prescription-reanalysis ──→ 재분석                            │
                          └──────────────┬──────────────────────────────┘
                                         │
                          ┌──────────────▼──────────────────────────────┐
                          │          LP 분석 (단절)                      │
                          │                                             │
  [Cron] crawl-lps ──→ lp_pages                                       │
  ╔ [수동] analyze-lps-v2.mjs ──→ lp_analysis                        ╗ │
  ║ [수동] compute-lp-consistency.mjs ──→ lp_consistency              ║ │
  ╚═══════════════════════ ← ★ 끊김 3: 처방 엔진과 미연결 ════════════╝ │
                          └──────────────┬──────────────────────────────┘
                                         │
                          ┌──────────────▼──────────────────────────────┐
                          │          표시 (UI — 구현됨)                   │
                          │                                             │
  protractor 대시보드 ── 계정 개요 / 소재 분석 / 처방 / 경쟁사           │
  creative detail ── 5축 / 시선 / 씬 / 처방 / 고객여정                  │
  portfolio ── 다양성 / 벤치마크 인사이트 / 축 분포                      │
                          └─────────────────────────────────────────────┘
```

### 파이프라인 끊김 지점 요약

| # | 위치 | 원인 | 영향 |
|---|------|------|------|
| 1 | 분석 → 후처리 | analyze-five-axis.mjs 수동 | 새 소재에 analysis_json 없음 → 후처리·처방 불가 |
| 2 | 후처리 → 처방 | extract-prescription-patterns 수동 | prescription_patterns 갱신 안 됨 → 처방 축2 데이터 부재 |
| 3 | LP → 처방 | analyze-lps-v2 수동 + 처방 엔진 미연결 | LP 일관성 점수가 처방에 반영 안 됨 |
| 4 | 후처리 내부 | score/similarity/fatigue 전부 수동 | analysis_json 부분 필드 누락 → UI 빈 영역 |

---

## 2. 스크립트 역할 정리

### 2.1 수집 스크립트 (scripts/archive/)

| 스크립트 | 역할 | 입력 | 출력 | 상태 |
|----------|------|------|------|------|
| collect-daily-insights.mjs | Meta API 일별 성과 수집 | Meta Graph API | daily_ad_insights | ✅ cron 이관됨 |
| process-media.mjs | 소재 미디어 다운로드 + GCS 저장 | creatives | creative_media + GCS | ✅ cron 이관됨 |
| discover-accounts.mjs | BM 계정 탐색 | Meta Business API | ad_accounts | ⚠️ Cloud Scheduler 미등록 |

### 2.2 분석 스크립트 (scripts/archive/)

| 스크립트 | 역할 | 입력 | 출력 | 상태 |
|----------|------|------|------|------|
| analyze-five-axis.mjs | Gemini 5축 분석 배치 | creative_media (이미지/영상) | analysis_json (v3) | ⚠️ 수동 (cron 미등록) |
| embed-all.mjs | 임베딩 벡터 생성 | creative_media | creative_media.embedding | ✅ cron 이관됨 |
| analyze-engagement-axis.mjs | 참여/전환 상관 분석 | daily_ad_insights + analysis_json | 콘솔 출력 (1회성 연구) | 📊 연구용 |

### 2.3 후처리 스크립트 (scripts/archive/)

| 스크립트 | 역할 | 입력 | 출력 | 상태 |
|----------|------|------|------|------|
| compute-score-percentiles.mjs | 카테고리별 백분위 계산 | analysis_json + profiles.category | analysis_json.scores | ❌ 수동 |
| compute-andromeda-similarity.mjs | 계정 내 소재 유사도 | analysis_json.andromeda_signals | andromeda_signals.similar_creatives | ❌ 수동 |
| compute-fatigue-risk.mjs | 소재 피로도 위험 | creative_media.embedding | analysis_json.quality.creative_fatigue_risk | ❌ 수동 |
| extract-prescription-patterns.mjs | 속성별 성과 패턴 추출 | daily_ad_insights + analysis_json | prescription_patterns | ❌ 수동 |
| seed-prescription-benchmarks.mjs | Motion 벤치마크 시드 | 하드코딩 데이터 | prescription_benchmarks | ❌ 수동 (분기 1회) |
| precompute-scores.mjs | 점수 사전 계산 | analysis_json | precomputed scores | ❌ 수동 |

### 2.4 LP 관련 스크립트 (scripts/archive/)

| 스크립트 | 역할 | 입력 | 출력 | 상태 |
|----------|------|------|------|------|
| analyze-lps-v2.mjs | LP 페이지 분석 | lp_pages | lp_analysis | ❌ 수동 |
| compute-lp-consistency.mjs | 소재↔LP 일관성 점수 | analysis_json + lp_analysis | lp_consistency | ❌ 수동 |
| populate-creative-lp-map.mjs | 소재-LP 매핑 | creatives + lp_pages | creative_lp_map | ❌ 수동 |
| analyze-creative-lp-alignment.mjs | 소재-LP 정렬 분석 | creative_lp_map + analysis_json | alignment scores | ❌ 수동 |

### 2.5 기타 스크립트

| 스크립트 | 역할 | 상태 |
|----------|------|------|
| generate-suggestion-bank.mjs | 처방 제안 문구 생성 | ❌ 수동 |
| compute-change-insights.mjs | 기간별 변화 인사이트 | ❌ 수동 |

---

## 3. src/lib/protractor/ 모듈 구조

| 모듈 | 역할 | 사용처 | 상태 |
|------|------|--------|------|
| **prescription-engine.ts** | 13단계 처방 엔진 메인 | run-prescription cron | ✅ 구현 |
| **prescription-prompt.ts** | Gemini 프롬프트 구성 (4섹션) | prescription-engine | ✅ 구현 |
| **prescription-guide.ts** | 축1 레퍼런스 원론 (14속성 이상값+근거) | prescription-prompt | ✅ 구현 |
| **benchmark-lookup.ts** | 축3 Motion 벤치마크 조회 + 백분위 | prescription-engine | ✅ 구현 |
| **ear-analyzer.ts** | GEM/EAR 영향 분석 (기반→참여→전환) | prescription-engine | ✅ 구현 |
| **performance-backtracker.ts** | 성과역추적 (worst 3 → 속성 매핑) | prescription-engine | ✅ 구현 |
| **andromeda-analyzer.ts** | 4축 가중 Jaccard 유사도 | prescription-engine + API | ✅ 구현 |
| **metric-groups.ts** | 14 ATTRIBUTE_AXIS_MAP + 14 METRIC_GROUPS | 전역 참조 | ✅ 구현 |
| **t3-engine.ts** | T3 점수 엔진 (ratio 기반) | API + UI | ✅ 구현 |
| **aggregate.ts** | 데이터 집계 (계정 요약, Top5) | API + UI | ✅ 구현 |
| **meta-collector.ts** | Meta API 공통 모듈 | collect-daily cron | ✅ 구현 |
| **overlap-utils.ts** | 타겟 중복 분석 | overlap API | ✅ 구현 |
| **scene-parser.ts** | 씬 데이터 → UI 변환 | customer-journey UI | ✅ 구현 |
| **creative-type.ts** | 소재 타입 판별 | 여러 곳 | ✅ 구현 |
| **creative-image-fetcher.ts** | 소재 이미지 조회 | creative-detail | ✅ 구현 |
| **carousel-cards.ts** | 캐러셀 카드 처리 | creative-detail | ✅ 구현 |
| **mixpanel-collector.ts** | Mixpanel 이벤트 수집 | collect-mixpanel cron | ✅ 구현 |

---

## 4. Cron 라우트 현황

### 4.1 처방 파이프라인 관련 Cron

| Cron 라우트 | 역할 | 선행 | 등록 상태 |
|-------------|------|------|----------|
| collect-daily (1~4) | Meta 성과 데이터 수집 | - | ✅ Cloud Scheduler |
| process-media | 소재 미디어 → GCS | collect-daily | ✅ Cloud Scheduler |
| embed-creatives | 임베딩 벡터 생성 | process-media | ✅ Cloud Scheduler |
| creative-saliency | DeepGaze 시선 분석 (이미지) | process-media | ✅ Cloud Scheduler |
| video-saliency | DeepGaze 시선 분석 (영상) | process-media | ✅ Cloud Scheduler |
| video-scene-analysis | Gemini 씬 분석 | process-media | ✅ Cloud Scheduler |
| run-prescription | 처방 엔진 배치 | ❗ analysis_json 필요 | ✅ Cloud Scheduler |
| prescription-reanalysis | 재분석 배치 | run-prescription | ✅ Cloud Scheduler |
| crawl-lps | LP 크롤링 | - | ✅ Cloud Scheduler |
| collect-benchmarks | Motion 벤치마크 수집 | - | ✅ Cloud Scheduler |
| track-performance | 성과 추적 | collect-daily | ✅ Cloud Scheduler |
| precompute | 사전 계산 | 여러 단계 | ✅ Cloud Scheduler |
| discover-accounts | BM 계정 탐색 | - | ⚠️ 미등록 |

### 4.2 파이프라인에서 빠진 Cron (= 수동 구간)

| 필요한 Cron | 현재 상태 | 영향도 |
|-------------|----------|--------|
| **analyze-five-axis** | ❌ archive 수동 스크립트 | 🔴 Critical — 5축 없으면 전체 처방 불가 |
| **compute-score-percentiles** | ❌ archive 수동 스크립트 | 🟡 Medium — UI 백분위 빈 영역 |
| **compute-andromeda-similarity** | ❌ archive 수동 스크립트 | 🟡 Medium — 유사도 갱신 안 됨 |
| **compute-fatigue-risk** | ❌ archive 수동 스크립트 | 🟡 Medium — 피로도 경고 누락 |
| **extract-prescription-patterns** | ❌ archive 수동 스크립트 | 🔴 Critical — 축2 데이터 부재 |
| **analyze-lps-v2** | ❌ archive 수동 스크립트 | 🟠 High — LP 일관성 미반영 |

---

## 5. API 라우트 현황

| API 라우트 | HTTP | 역할 | 상태 |
|-----------|------|------|------|
| /protractor/prescription | GET | 개별 소재 처방 (13단계 엔진) | ✅ 동작 |
| /protractor/account-prescription | GET | 계정 전체 처방 | ✅ 동작 |
| /protractor/creative-detail | GET | 소재 상세 (5축+시선+씬) | ✅ 동작 |
| /protractor/axis-distribution | GET | 축 분포 차트 데이터 | ✅ 동작 |
| /protractor/account-diversity | GET | Andromeda 다양성 분석 | ✅ 동작 |
| /protractor/benchmarks | GET | 벤치마크 비교 | ✅ 동작 |
| /protractor/benchmarks/collect | POST | 벤치마크 수동 수집 | ✅ 동작 |
| /protractor/total-value | GET | T3 총가치 점수 | ✅ 동작 |
| /protractor/overlap | GET | 타겟 중복 분석 | ✅ 동작 |
| /protractor/insights | GET | 인사이트 조회 | ✅ 동작 |
| /protractor/collect-daily | POST | 수동 수집 트리거 | ✅ 동작 |
| /protractor/collect-mixpanel | POST | Mixpanel 수집 | ✅ 동작 |
| /protractor/accounts | GET | 계정 목록 | ✅ 동작 |
| /protractor/save-secret | POST | API 키 저장 | ✅ 동작 |
| ❌ /protractor/recalculate-patterns | - | 패턴 재계산 | **미구현** |

---

## 6. UI 컴포넌트 현황

### 6.1 페이지 구조

```
protractor/
├── page.tsx                  — 메인 (real-dashboard.tsx)
├── layout.tsx                — 레이아웃 (탭 네비게이션)
├── protractor-tab-nav.tsx    — 탭: 대시보드 / 소재분석 / 경쟁사
├── real-dashboard.tsx        — 실제 대시보드 (계정 요약, Top5, 벤치마크)
├── sample-dashboard.tsx      — 샘플 대시보드 (데모용)
├── creatives/
│   ├── page.tsx              — 소재 목록 (포트폴리오 + 개별 분석)
│   ├── creative-analysis.tsx — 소재 분석 메인
│   └── components/
│       ├── individual/       — 개별 소재 분석 (7개 컴포넌트)
│       │   ├── five-axis-card.tsx     — 5축 분석 카드
│       │   ├── prescription-cards.tsx — 처방 카드
│       │   ├── customer-journey.tsx   — 고객여정 (감각→사고→행동)
│       │   ├── gaze-analysis.tsx      — 시선 분석
│       │   ├── scene-detail-analysis.tsx — 씬별 상세
│       │   ├── ad-axis-card.tsx       — 광고 축 카드
│       │   └── audio-analysis.tsx     — 오디오 분석
│       └── portfolio/        — 포트폴리오 분석 (5개 컴포넌트)
│           ├── portfolio-tab-v2.tsx    — 포트폴리오 탭
│           ├── axis-distribution.tsx   — 축 분포
│           ├── diversity-alert.tsx     — 다양성 경고
│           ├── benchmark-insight.tsx   — 벤치마크 인사이트
│           └── account-prescription.tsx — 계정 처방
├── creative/[id]/
│   └── prescription-tab.tsx  — 개별 처방 탭
└── competitor/               — 경쟁사 분석 (10개 컴포넌트)
    ├── page.tsx
    └── components/           — 검색, 필터, 카드, 모니터링 등
```

### 6.2 UI 구현 상태

| 기능 | 상태 | 비고 |
|------|------|------|
| 계정 개요 (Summary Cards) | ✅ | 지출/CTR/ROAS/3초시청률/구매전환율 |
| 기간별 탭 (7일/30일/90일) | ✅ | period-tabs.tsx |
| 소재 성과 테이블 | ✅ | ad-metrics-table.tsx |
| 벤치마크 비교 | ✅ | benchmark-compare.tsx |
| 5축 분석 카드 | ✅ | five-axis-card.tsx |
| 시선 분석 (DeepGaze) | ✅ | gaze-analysis.tsx |
| 씬별 상세 분석 | ✅ | scene-detail-analysis.tsx |
| 고객여정 (감각→사고→행동) | ✅ | customer-journey.tsx |
| 오디오 분석 | ✅ | audio-analysis.tsx |
| 처방 카드 (Top3) | ✅ | prescription-cards.tsx |
| 포트폴리오 축 분포 | ✅ | axis-distribution.tsx |
| 다양성 경고 | ✅ | diversity-alert.tsx |
| 경쟁사 분석 | ✅ | competitor-dashboard.tsx |
| LP 일관성 뷰 | ❌ | UI 미구현 |
| 피로도 경고 뷰 | ❌ | UI 미구현 (데이터도 수동) |
| 패턴 인사이트 뷰 | ❌ | UI 미구현 (데이터도 수동) |

---

## 7. 처방 엔진 13단계 상세

```
STEP  1: 소재 원본 + 메타데이터 조회        → creative_media + creatives JOIN
STEP  2: 시선 데이터 조회 (DeepGaze)        → creative_saliency + video_saliency_frames
STEP  3: 성과 데이터 + 벤치마크 조회        → daily_ad_insights + benchmarks
STEP  4: prescription_patterns 조회 (축2)   → prescription_patterns (⚠️ 수동 갱신)
STEP  5: 글로벌 벤치마크 조회 (축3)         → prescription_benchmarks
STEP  6: 유사 벤치마크 소재 Top3 검색       → search_similar_creatives RPC
STEP  7: 성과역추적 (worst 3 지표 추출)     → ATTRIBUTE_AXIS_MAP 역매핑
STEP  8: EAR 영향 분석                      → foundation/engagement/conversion 병목
STEP  9: Andromeda 다양성 분석              → 4축 가중 Jaccard
STEP 10: 프롬프트 구성 (4섹션)              → 문제정의 + 증거 + 3축근거 + 참조
STEP 11: Gemini 1회 통합 호출               → gemini-3-pro-preview (90초, 2회 재시도)
STEP 12: 후처리 (백분위, 약점 교차검증)     → 최종 처방 JSON 구성
STEP 13: DB 저장                            → analysis_json.prescription 업데이트
```

### 엔진 의존성 현황

| STEP | 의존 데이터 | 자동 갱신 | 문제 |
|------|-----------|----------|------|
| 1 | analysis_json | ❌ 수동 (analyze-five-axis) | 5축 없으면 NO_ANALYSIS 에러 |
| 2 | creative_saliency | ✅ cron | 정상 |
| 3 | daily_ad_insights + benchmarks | ✅ cron | 정상 |
| 4 | prescription_patterns | ❌ 수동 (extract-patterns) | 빈 결과 → 축2 처방 없음 |
| 5 | prescription_benchmarks | ❌ 수동 (seed-benchmarks) | 분기 1회 시드 — 방치 가능 |
| 6 | embedding | ✅ cron | 정상 |
| 9 | andromeda_signals | ❌ 수동 (compute-similarity) | similar_creatives 갱신 안 됨 |

---

## 8. 3축 처방 체계 현황

| 축 | 이름 | 데이터 소스 | 갱신 주기 | 구현 상태 |
|----|------|-----------|----------|----------|
| 축1 | 레퍼런스 원론 | prescription-guide.ts (하드코딩) | 고정 | ✅ 14속성 이상값+근거 |
| 축2 | 실데이터 패턴 | prescription_patterns 테이블 | ❌ 수동 (주1회 목표) | ⚠️ 테이블 존재, 자동 갱신 안 됨 |
| 축3 | Motion 벤치마크 | prescription_benchmarks 테이블 | ❌ 수동 (분기1회 목표) | ⚠️ 시드 데이터만 (2025-Q4) |

### 14 ATTRIBUTE_AXIS_MAP

```
hook: hook_type, visual_style, composition (3개)
visual: color_dominant, visual_format (2개)
text: headline_type, cta_text, key_message (3개)
psychology: urgency, social_proof, emotional_appeal, trust_signal (4개)
quality: production_quality, readability (2개)
→ 총 14속성 × 3성과그룹(foundation/engagement/conversion) 매핑
```

---

## 9. Gap 분석

### 9.1 아키텍처 문서 vs 구현 Gap

| 설계 항목 | 문서 | 구현 | Gap |
|----------|------|------|-----|
| 6축 분석 (visual/text/audio/structure/attention/performance) | creative-analysis-framework.md | 5축 (audio/structure는 VIDEO만) | ✅ 의도적 — 이미지는 3축 |
| 5-Layer 파이프라인 (요소태깅→시선→임베딩→벤치마크→종합) | creative-analysis-framework.md | Layer 1~3 cron, Layer 4~5 수동 | ⚠️ 후반부 수동 |
| 13단계 처방 엔진 | prescription-system-v2.design.md | prescription-engine.ts | ✅ 1:1 구현 |
| 3축 처방 체계 (원론/패턴/벤치마크) | prescription-system-v2.design.md | 축1 ✅, 축2 ⚠️, 축3 ⚠️ | 축2·3 자동 갱신 미구현 |
| 성과역추적 (worst 3 → 속성 매핑) | prescription-system-v2.design.md | performance-backtracker.ts | ✅ 구현 |
| EAR 영향 분석 | prescription-system-v2.design.md | ear-analyzer.ts | ✅ 구현 |
| Andromeda 4축 유사도 | creative-analysis-framework.md | andromeda-analyzer.ts | ✅ 구현 |
| LP 일관성 분석 | creative-analysis-framework.md | compute-lp-consistency.mjs | ⚠️ 수동 + 처방 미연결 |
| recalculate-patterns API | prescription-system-v2.report.md Phase 5 | - | ❌ 미구현 |
| 패턴 추출 크론 | prescription-system-v2.report.md Phase 5 | - | ❌ 미구현 |
| 수동 검토 50건 프롬프트 튜닝 | prescription-system-v2.report.md Phase 5 | - | ❌ 미수행 |

### 9.2 파이프라인 자동화 Gap

| 단계 | 목표 | 현재 | Gap |
|------|------|------|-----|
| 수집 | 전자동 cron | ✅ collect-daily/process-media/etc | 없음 |
| 임베딩 | 전자동 cron | ✅ embed-creatives | 없음 |
| 시선 분석 | 전자동 cron | ✅ creative-saliency/video-saliency | 없음 |
| 씬 분석 | 전자동 cron | ✅ video-scene-analysis | 없음 |
| **5축 분석** | **cron 필요** | ❌ 수동 (archive) | **🔴 Critical** |
| **백분위 계산** | **cron 필요** | ❌ 수동 (archive) | **🟡 Medium** |
| **유사도 계산** | **cron 필요** | ❌ 수동 (archive) | **🟡 Medium** |
| **피로도 계산** | **cron 필요** | ❌ 수동 (archive) | **🟡 Medium** |
| **패턴 추출** | **cron 필요** | ❌ 수동 (archive) | **🔴 Critical** |
| 처방 배치 | 전자동 cron | ✅ run-prescription | 없음 |
| LP 크롤링 | 전자동 cron | ✅ crawl-lps | 없음 |
| **LP 분석** | **cron 필요** | ❌ 수동 (archive) | **🟠 High** |
| **LP 일관성** | **처방 연결 필요** | ❌ 미연결 | **🟠 High** |

### 9.3 데이터 흐름 단절 진단

```
✅ 정상 흐름:
Meta API → collect-daily → daily_ad_insights
         → process-media → creative_media → embed-creatives → embedding
                                          → creative-saliency → saliency
                                          → video-saliency → frames
                                          → video-scene-analysis → video_analysis

❌ 단절 흐름:
creative_media ──[수동]──→ analysis_json ──[수동]──→ scores
                                          ──[수동]──→ andromeda_signals
                                          ──[수동]──→ fatigue_risk
                                          ──[수동]──→ prescription_patterns
                                                              ↓
run-prescription ──────────────────────────[축2 비어 있음]──→ 처방 품질 저하

crawl-lps → lp_pages ──[수동]──→ lp_analysis ──[미연결]──→ (처방에 반영 안 됨)
```

---

## 10. 개선 우선순위

### P0 (Critical — 파이프라인 연결 필수)

| # | 개선 항목 | 이유 | 예상 작업량 |
|---|----------|------|-----------|
| 1 | **analyze-five-axis cron화** | 5축 분석이 없으면 처방 엔진 자체가 작동 불가 (NO_ANALYSIS 에러). 현재 전체 파이프라인의 최대 병목. | archive 스크립트를 cron 라우트로 이식. Gemini 호출 비용 관리(일일 한도) 고려. |
| 2 | **extract-prescription-patterns cron화** | 축2 패턴이 갱신 안 되면 처방 품질이 정체. 새 소재 속성-성과 상관관계 반영 불가. | 주 1회 cron. archive 스크립트 → API 라우트 이식. |

### P1 (High — 데이터 완결성)

| # | 개선 항목 | 이유 | 예상 작업량 |
|---|----------|------|-----------|
| 3 | **후처리 4종 cron화** (score-percentiles, andromeda-similarity, fatigue-risk, precompute-scores) | 5축 분석 후 자동 파이프라인 연결. UI 빈 영역 해소. | analyze-five-axis 완료 후 트리거되는 체인 cron. |
| 4 | **LP 분석 자동화 + 처방 연결** | LP 일관성이 처방에 반영 안 됨. 광고↔LP 불일치 감지 불가. | analyze-lps-v2 cron화 + 처방 엔진 STEP에 LP 데이터 추가. |
| 5 | **recalculate-patterns API 구현** | 관리자가 수동으로 패턴 재계산할 수 있는 인터페이스 필요. prescription-system-v2.report.md Phase 5 항목. | POST API 엔드포인트 1개. |

### P2 (Medium — UI 완결)

| # | 개선 항목 | 이유 | 예상 작업량 |
|---|----------|------|-----------|
| 6 | **LP 일관성 UI** | 소재↔LP 정렬 점수를 대시보드에서 확인 불가. | UI 컴포넌트 1개 추가. |
| 7 | **피로도 경고 UI** | creative_fatigue_risk가 있어도 UI에서 표시 안 됨. | diversity-alert에 통합 가능. |
| 8 | **패턴 인사이트 UI** | 어떤 속성이 성과에 어떻게 영향 미치는지 시각화 없음. | 새 탭 or 기존 포트폴리오 탭 확장. |

### P3 (Low — 품질 향상)

| # | 개선 항목 | 이유 |
|---|----------|------|
| 9 | 처방 프롬프트 튜닝 (50건 수동 검토) | Phase 5 대기 항목. 처방 품질 검증 미수행. |
| 10 | prescription_benchmarks 자동 수집 | 분기 1회 시드 → Motion API 연동 자동화. |
| 11 | discover-accounts Cloud Scheduler 등록 | BM 계정 자동 탐색 미등록. |

---

## 11. 비용 영향

| 단계 | 비용 모델 | 현재 비용 | cron화 시 추가 비용 |
|------|----------|----------|-------------------|
| 5축 분석 (Gemini) | ~$0.003-0.007/이미지, ~$0.015-0.035/영상 | 수동 실행 시만 | 월 ~$1.3-2.0 (전체 활성 소재) |
| 패턴 추출 | DB 연산만 | 무료 | 무료 |
| 유사도/피로도 | DB 연산만 | 무료 | 무료 |
| 처방 (Gemini) | ~$0.01-0.03/건 | 이미 cron | 변동 없음 |
| LP 분석 (Gemini) | ~$0.005/건 | 수동 | 월 ~$0.5 |

**총 추가 비용**: 월 ~$2-3 (주로 5축 분석 Gemini 호출)

---

## 12. 이상적 자동 파이프라인 (To-Be)

```
Meta API → collect-daily (매일 02:00)
         → process-media (매일 03:00)
                ↓
         ┌──────┼──────────────┐
         │      │              │
    embed  saliency   video-scene
    (04:00) (04:00)    (04:00)
         │      │              │
         └──────┼──────────────┘
                ↓
         analyze-five-axis (05:00) ← ★ 신규 cron
                ↓
         ┌──────┼──────────────┐
         │      │              │
    scores  similarity   fatigue  ← ★ 신규 cron (3개)
    (06:00) (06:00)      (06:00)
         │      │              │
         └──────┼──────────────┘
                ↓
         extract-patterns (일요일 06:00) ← ★ 신규 cron
                ↓
         run-prescription (매일 07:00) — 기존 cron
                ↓
         ┌──────┼──────────────┐
         │      │              │
    crawl-lps  analyze-lps  lp-consistency ← ★ LP 연결
    (기존)     (신규 cron)   (신규 cron)
         └──────┼──────────────┘
                ↓
         precompute (08:00) — 기존 cron
                ↓
         UI 자동 반영
```

### 실행 순서 의존성

```
collect-daily → process-media → [embed, saliency, video-scene] (병렬)
                              → analyze-five-axis (embed 완료 후)
                              → [scores, similarity, fatigue] (5축 완료 후, 병렬)
                              → extract-patterns (주 1회)
                              → run-prescription
                              → precompute
```

---

## 13. 결론

### 잘 된 것
1. **처방 엔진 13단계** — 설계서 1:1 구현, 3축 체계 반영
2. **수집·시선·씬 분석** — cron 자동화 완료
3. **UI 46개 컴포넌트** — 대시보드·소재분석·처방·경쟁사 모두 구현
4. **성과역추적 + EAR 분석** — 병목 지점 자동 진단

### 문제점
1. **5축 분석이 수동** — 파이프라인의 가장 큰 병목. 이것 하나가 전체 자동화를 막고 있음
2. **후처리 전부 수동** — 점수·유사도·피로도·패턴 4개 모두 scripts/archive/에 방치
3. **LP 단절** — 크롤링만 cron, 분석·일관성·처방 연결 전무
4. **축2 데이터 정체** — prescription_patterns 자동 갱신 안 됨 → 처방 품질 저하

### 핵심 행동
> **analyze-five-axis.mjs를 cron화하면 전체 파이프라인의 50% 이상이 자동으로 연결된다.**
> 그 다음 후처리 4종을 체인 cron으로 연결하면 "수집 → 분석 → 처방 → 표시"가 완전 자동.

---

## 관련 문서
- 처방 시스템 v2 설계: `docs/02-design/features/prescription-system-v2.design.md`
- 처방 시스템 v2 보고: `docs/04-report/features/prescription-system-v2.report.md`
- 소재 분석 아키텍처: `docs/creative-analysis-framework.md`
- 참여/전환 상관분석: `docs/analysis-engagement-axis.md`
- 지표 정의: `src/lib/protractor/metric-groups.ts`
