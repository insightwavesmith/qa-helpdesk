# Architecture v3 PDCA 상태 요약

> 기준일: 2026-03-22
> 근거: architecture-v3-execution-plan.md + full-task-checklist.md + master-architecture-review.md + .pdca-status.json
> 전체 Match Rate: ~46% (83개 항목 중 34 완료 / 12 부분 / 37 미구현)

---

## 전체 현황 (T1~T11)

| TASK | 우선순위 | Plan | Design | Do | Check | Act | 상태 |
|------|---------|:----:|:------:|:--:|:-----:|:---:|------|
| **T1** DB 스키마 보강 | P0 | ✅ | — | ✅ | ✅ | — | **완료** |
| **T2** 5축 스키마+프롬프트 | P0 | ✅ | ❌ | ❌ | ❌ | ❌ | **미시작** |
| **T2-A** 속성값 3단계 | P0 | ✅ | ❌ | ❌ | ❌ | ❌ | **미시작** |
| **T2-B** fatigue_risk 계산 | P0 | ✅ | ❌ | ❌ | ❌ | ❌ | **미시작** |
| **T2-C** scores 벤치마크 상대값 | P0 | ✅ | ❌ | ❌ | ❌ | ❌ | **미시작** |
| **T3** embed-creatives 듀얼 라이트 | P1 | ✅ | ❌ | ❌ | ❌ | ❌ | **미시작** |
| **T4** crawl-lps v2 전환 | P2 | ✅ | ❌ | ❌ | ❌ | ❌ | **미시작** |
| **T5** lp_analysis 2축 구조 | P2 | ✅ | ❌ | ❌ | ❌ | ❌ | **미시작** |
| **T6** 영상 Audio 축 | P3 | ✅ | ❌ | ❌ | ❌ | ❌ | **미시작** |
| **T7** 영상 Eye Tracking+Canvas | P3 | ✅ | ❌ | ❌ | ❌ | ❌ | **미시작** |
| **T8** Andromeda 유사도 60% | P4 | ✅ | ❌ | ❌ | ❌ | ❌ | **미시작** |
| **T9** creative_lp_map 리뉴얼 | P3 | ✅ | ❌ | ❌ | ❌ | ❌ | **미시작** |
| **T10** LP 데이터 기반 교차분석 | P4 | ✅ | ❌ | ❌ | ❌ | ❌ | **미시작** |
| **T11** 경쟁사 5축 분석 | P4 | ✅ | ❌ | ❌ | ❌ | ❌ | **미시작** |

> **Plan 열 ✅**: architecture-v3-execution-plan.md에 구현 내용/변경 파일/완료 조건이 기술되어 있음.
> **Design 열 ❌**: 별도 `docs/02-design/features/{기능}.design.md` 문서 미작성. PDCA 규칙상 Design 없이 코딩 시작 불가.

---

## T1: DB 스키마 보강 — ✅ 완료

### PDCA 상세

| 단계 | 상태 | 상세 |
|------|------|------|
| **Plan** | ✅ | `docs/01-plan/features/p0-db-schema-v3.plan.md` + execution-plan T1 섹션 |
| **Design** | — | DB 마이그레이션이라 별도 Design 불요 (SQL이 곧 설계) |
| **Do** | ✅ 2026-03-22 | 마이그레이션 9개 섹션 Supabase 적용. 신규 컬럼 14개 + 테이블 2개 + CHECK 제약. source 3,096건 `bscamp→member` 전환. RPC 재정의. 커밋 `6f70f83` |
| **Check** | ✅ | matchRate 100%. tsc+build 통과. `.pdca-status.json` 완료 기록 |
| **Act** | — | 수정 불요 |

### 산출물
- SQL: `supabase/migrations/20260322_v3_schema_additions.sql`
- 코드: collect-daily/migrate-to-v2 변경
- 상태: `.pdca-status.json` → `p0-db-schema-v3: completed`

---

## T2: 5축 분석 스키마 확정 + 프롬프트 재설계 — ❌ 미시작

### PDCA 상세

| 단계 | 상태 | 필요 작업 |
|------|------|----------|
| **Plan** | ✅ | execution-plan T2 섹션에 3단계(T2-A/B/C) 상세 기술 |
| **Design** | ❌ **차단** | `docs/02-design/features/five-axis-analysis.design.md` 작성 필요 (확정 스키마 + 속성 선택지 + 점수 기준 명세) |
| **Do** | ❌ 대기 | Design 확정 후 실행. 예상 6~8시간 |
| **Check** | ❌ | — |
| **Act** | ❌ | — |

### 의존성
- T1 ✅ (analysis_json, analyzed_at 컬럼 존재)
- 후속: T6, T7, T8, T11 모두 T2에 의존

### 핵심 Gap
- 현재 L1 스키마(hook/product/color/text/composition) ↔ 기획서 v3 스키마(visual/text/psychology/quality) **완전히 다름**
- T2-A: 100건 층화 샘플링 → 자유 태깅 → Gemini 클러스터링 → Smith님 리뷰 확정
- T2-B: creative_fatigue_risk — 임베딩 코사인 유사도 기반 (≥0.85=high)
- T2-C: scores 백분위 계산 — 카테고리별 percentile_cont

### 관련 파일
- 수정 대상: `scripts/analyze-five-axis.mjs`
- 신규: `scripts/compute-score-percentiles.mjs`
- 기존 참고: `docs/01-plan/features/five-axis-analysis-batch.plan.md` (배치 실행 계획)

---

## T3: embed-creatives v2 듀얼 라이트 — ❌ 미시작

### PDCA 상세

| 단계 | 상태 | 필요 작업 |
|------|------|----------|
| **Plan** | ✅ | execution-plan T3 섹션 |
| **Design** | ❌ **차단** | Design 문서 작성 필요 |
| **Do** | ❌ 대기 | Design 후 실행. 예상 3시간 |
| **Check** | ❌ | — |
| **Act** | ❌ | — |

### 의존성
- 없음 (T1과 병렬 가능. T1은 이미 완료)

### 핵심 Gap
- ad_creative_embeddings에만 임베딩 저장 → creative_media에도 듀얼 라이트 필요
- search_similar_creatives_v2() RPC가 creative_media.embedding 참조 → 현재 NULL

### 관련 파일
- `src/lib/ad-creative-embedder.ts` (수정)
- `src/app/api/cron/embed-creatives/route.ts` (수정)

---

## T4: crawl-lps v2 전환 — ❌ 미시작

### PDCA 상세

| 단계 | 상태 | 필요 작업 |
|------|------|----------|
| **Plan** | ✅ | execution-plan T4 섹션 (Phase A/B/C 3단계) |
| **Design** | ❌ **차단** | Design 문서 작성 필요 |
| **Do** | ❌ 대기 | **최대 TASK** — 예상 3~5일 |
| **Check** | ❌ | — |
| **Act** | ❌ | — |

### 의존성
- T1 ✅ (landing_pages.content_hash/last_crawled_at/is_active)

### 핵심 Gap
- 현재: ad_id 기반 크롤링 → 같은 LP 10번 중복 크롤링
- 목표: landing_pages(lp_id) 기준, 듀얼 뷰포트, 섹션 캡처, ADR-001 경로
- 기존 db-restructure-phase1 (implementing 상태)과 범위 겹침 확인 필요

### 관련 파일
- `src/app/api/cron/crawl-lps/route.ts` (전면 재작성)
- `src/lib/railway-crawler.ts` (확장)
- Railway Playwright 서비스 (Docker 확장)
- `scripts/migrate-lp-screenshots-v2.mjs` (신규)

---

## T5: lp_analysis 2축 구조 전환 — ❌ 미시작

### PDCA 상세

| 단계 | 상태 | 필요 작업 |
|------|------|----------|
| **Plan** | ✅ | execution-plan T5 섹션 |
| **Design** | ❌ **차단** | `lp-analysis-v2.design.md` 작성 필요 |
| **Do** | ❌ 대기 | 예상 1일 |
| **Check** | ❌ | — |
| **Act** | ❌ | — |

### 의존성
- T4 (크롤링 데이터 + lp_snapshots 존재)

### 핵심 Gap
- 현재: flat columns (hero_type, cta_type 등)
- 목표: reference_based JSONB (8개 카테고리) + data_based JSONB

### 관련 파일
- `scripts/analyze-lps-v2.mjs` (신규)

---

## T6: 영상 Audio 축 — ❌ 미시작

### PDCA 상세

| 단계 | 상태 | 필요 작업 |
|------|------|----------|
| **Plan** | ✅ | execution-plan T6 섹션 |
| **Design** | ❌ **차단** | T2 Design에 포함 가능 (audio 축 스키마) |
| **Do** | ❌ 대기 | 예상 4시간 |
| **Check** | ❌ | — |
| **Act** | ❌ | — |

### 의존성
- T2 (analysis_json 스키마 확정)

### 관련 파일
- `scripts/analyze-five-axis.mjs` (수정 — 영상 프롬프트에 audio 축 추가)

---

## T7: 영상 Eye Tracking + Canvas — ❌ 미시작

### PDCA 상세

| 단계 | 상태 | 필요 작업 |
|------|------|----------|
| **Plan** | ✅ | execution-plan T7 섹션 |
| **Design** | ❌ **차단** | 프론트엔드 Canvas 컴포넌트 설계 필요 |
| **Do** | ❌ 대기 | 예상 1일 |
| **Check** | ❌ | — |
| **Act** | ❌ | — |

### 의존성
- T2 (analysis_json 스키마)

### 관련 파일
- `scripts/analyze-five-axis.mjs` (수정)
- `src/components/video-heatmap-overlay.tsx` (신규)

---

## T8: Andromeda 유사도 60% — ❌ 미시작

### PDCA 상세

| 단계 | 상태 | 필요 작업 |
|------|------|----------|
| **Plan** | ✅ | execution-plan T8 섹션 (유사도 계산 방식 보완 포함) |
| **Design** | ❌ **차단** | 4축 가중 유사도 계산 명세 Design 필요 |
| **Do** | ❌ 대기 | 예상 6시간 |
| **Check** | ❌ | — |
| **Act** | ❌ | — |

### 의존성
- T2 (analysis_json 스키마)

### 관련 파일
- `scripts/analyze-five-axis.mjs` (수정)
- `scripts/compute-andromeda-similarity.mjs` (신규)

---

## T9: creative_lp_map 리뉴얼 — ❌ 미시작

### PDCA 상세

| 단계 | 상태 | 필요 작업 |
|------|------|----------|
| **Plan** | ✅ | execution-plan T9 섹션 |
| **Design** | ❌ **차단** | 4가지 alignment 점수 + issues 스키마 Design 필요 |
| **Do** | ❌ 대기 | 예상 4시간 |
| **Check** | ❌ | — |
| **Act** | ❌ | — |

### 의존성
- T5 (lp_analysis 2축 분석 완료)
- T2 (analysis_json 존재)

### 관련 파일
- `scripts/analyze-creative-lp-alignment.mjs` (신규)

---

## T10: LP 데이터 기반 교차분석 — ❌ 미시작

### PDCA 상세

| 단계 | 상태 | 필요 작업 |
|------|------|----------|
| **Plan** | ✅ | execution-plan T10 섹션 (LP 전환율 데이터 획득 방법 보완 포함) |
| **Design** | ❌ **차단** | data_based JSONB + element_correlation 명세 Design 필요 |
| **Do** | ❌ 대기 | 예상 2일 |
| **Check** | ❌ | — |
| **Act** | ❌ | — |

### 의존성
- T5 (lp_analysis.reference_based 존재)
- 최소 30+ LP × 30일 성과 데이터

### 리스크
- creatives.lp_id NULL 비율이 높으면 T4 완료 후에만 의미 있음
- 통계 유의미성: clicks ≥ 100건 필터 적용

### 관련 파일
- `scripts/compute-lp-data-analysis.mjs` (신규)

---

## T11: 경쟁사 5축 분석 — ❌ 미시작

### PDCA 상세

| 단계 | 상태 | 필요 작업 |
|------|------|----------|
| **Plan** | ✅ | execution-plan T11 섹션 |
| **Design** | ❌ **차단** | competitor_ad_cache.analysis_json_v3 + 배치 실행 명세 Design 필요 |
| **Do** | ❌ 대기 | 예상 1일 (배치 5시간) |
| **Check** | ❌ | — |
| **Act** | ❌ | — |

### 의존성
- T2 (analysis_json 스키마 확정 + 프롬프트)

### 리스크
- Meta CDN URL 만료: 예상 성공률 70~80%
- competitor_ad_cache 9,553건 × ~2초/건 = ~5시간 배치

### 관련 파일
- `scripts/analyze-five-axis.mjs` (수정 — `--source competitor` 모드)
- SQL: `competitor_ad_cache.analysis_json_v3` 컬럼 추가

---

## 챕터별 Match Rate 현황

| 챕터 | 항목 수 | 완료 | 부분 | 미구현 | Match Rate |
|------|--------|------|------|--------|-----------|
| 1. 전체 아키텍처 | 12 | 7 | 2 | 3 | ~58% |
| 2. 수집 | 18 | 8 | 4 | 6 | ~55% |
| 3. 저장 | 14 | 10 | 1 | 3 | ~79% |
| 4. LP 분석 | 16 | 3 | 2 | 11 | ~25% |
| 5. 광고 소재 분석 | 15 | 5 | 3 | 7 | ~40% |
| 6. 순환 학습 | 8 | 2 | 1 | 5 | ~25% |
| **전체** | **83** | **34** | **12** | **37** | **~46%** |

---

## 의존관계 다이어그램 (현재 상태 반영)

```
✅ T1 (DB 컬럼) ──────────────────────────────────────────┐
   │                                                       │
   ├── ❌ T2 (5축 스키마 + 프롬프트) ← 차단: Design 없음    │
   │     │  ├─ T2-A: 속성값 3단계                          │
   │     │  ├─ T2-B: fatigue_risk                          │
   │     │  └─ T2-C: scores 벤치마크 상대값                 │
   │     ├── ❌ T6 (영상 Audio)                             │
   │     ├── ❌ T7 (영상 Eye Tracking + Canvas)             │
   │     ├── ❌ T8 (Andromeda 유사도 60%)                   │
   │     └── ❌ T11 (경쟁사 5축 분석)                       │
   │                                                       │
   ├── ❌ T3 (embed-creatives 듀얼 라이트) ← 차단: Design   │
   │                                                       │
   └── ❌ T4 (crawl-lps v2) ← 차단: Design                 │
         ├── ❌ T5 (lp_analysis 2축)                        │
         │     └── ❌ T9 (creative_lp_map 리뉴얼) ←────────┘
         │           └── ❌ T10 (LP 교차분석)
         └── (LP 스크린샷 마이그레이션)
```

---

## 핵심 차단 요인

### 1. Design 문서 전무 (T2~T11)
- Plan은 `architecture-v3-execution-plan.md`에 전부 기술됨
- **그러나 PDCA 규칙상 별도 Design 문서(`docs/02-design/features/`)가 없으면 코딩 시작 불가**
- 즉시 필요: T2 Design (후속 5개 TASK의 전제 조건)

### 2. T2가 Critical Path
- T2 완료 없이 T6/T7/T8/T11 시작 불가
- T2 자체가 3단계(자유 태깅 → 클러스터링 → Smith님 리뷰) 필요 — **Smith님 확인 절차 포함**

### 3. T4가 최대 규모
- 예상 3~5일 (Railway 서비스 확장 + 크론 재설계 + 마이그레이션)
- T5/T9/T10이 모두 T4에 의존

---

## 다음 실행 순서 (권장)

```
즉시 (Day 1):
  └─ T2 Design 문서 작성 (five-axis-analysis.design.md)
  └─ T3 Design 문서 작성 (embed-creatives-dual-write.design.md)

Day 2-3:
  └─ T2-A: 100건 층화 샘플링 + 자유 태깅 실행
  └─ T3: embed-creatives 듀얼 라이트 구현 (T2와 병렬)

Day 3-4:
  └─ T2-A Step 2: Gemini 클러스터링
  └─ T2-A Step 3: Smith님 리뷰 → 확정
  └─ T4 Design 문서 작성

Day 4-6:
  └─ T2 Step 4-6: 전체 배치 + fatigue_risk + 백분위
  └─ T4: crawl-lps v2 구현 시작

Week 2:
  └─ T4 완료 → T5 → T9
  └─ T6 + T7 (T2 완료 후 병렬 가능)

Week 3+:
  └─ T8 → T10 → T11 (데이터 축적 필요)
```

---

## 기술적 불가 항목 (3건 — 변경 없음)

| 항목 | 이유 |
|------|------|
| 경쟁사 LP 수집 | Ad Library API에 LP URL 미포함 |
| 타사 계정 성과 데이터 | Marketing API 토큰은 자사 연결 계정만 |
| 3072D HNSW 인덱스 | pgvector 2000D 제한 (현재 3K건이라 문제 없음) |

---

> 작성: 2026-03-22 | 근거: architecture-v3-execution-plan.md (T1~T11) + full-task-checklist.md (83항목) + master-architecture-review.md (Gap 분석) + .pdca-status.json (완료 추적)
