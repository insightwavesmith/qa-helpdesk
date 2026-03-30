# 크론 전체 구조 헬스체크

> 작성: 2026-03-30
> 기준: Cloud Scheduler 23개 항목 + 코드 엔드포인트 27개 + Cloud Run Jobs 7개

---

## 1. 수집 파이프라인 체인 구조

### 체인 연결도

```
Cloud Scheduler (매일 18:00 KST)
    │
    ▼
collect-daily?chain=true          ← chain=true 파라미터 O (확인됨)
    │ (results.length > 0 일 때)
    ▼
process-media?chain=true          ← triggerNext 호출 O
    │ (uploaded > 0 OR processed > 0 OR dedup > 0 일 때)
    ├──► embed-creatives           ← 병렬 트리거
    ├──► creative-saliency         ← 병렬 트리거
    └──► video-saliency            ← 병렬 트리거 (터미널 노드)
```

### 체인 메커니즘 (`src/lib/pipeline-chain.ts`)

| 항목 | 값 |
|------|-----|
| 트리거 방식 | HTTP GET + `Authorization: Bearer {CRON_SECRET}` |
| 대상 URL | `bscamp-cron-906295665279.asia-northeast3.run.app/api/cron/{endpoint}?chain=true` |
| 호출 방식 | Fire-and-forget (AbortSignal 2초 — 연결 확인만, 완료 대기 X) |
| 안전장치 | `CRON_SECRET` 미설정 시 스킵 (로컬 개발 안전) |

### 체인 진단 결과: **정상**

- Cloud Scheduler에서 `?chain=true` 붙여서 호출: **O** (확인됨)
- `collect-daily` → `process-media` 체인 연결: **O**
- `process-media` → 3개 분석 병렬 트리거: **O**
- 3개 분석(embed/creative-saliency/video-saliency)는 터미널 노드 (추가 체인 없음): **O**

### 백업 독립 스케줄 (체인 실패 대비)

체인 말단 3개 엔드포인트는 **독립 스케줄도 등록**되어 있어 체인 실패 시에도 실행됨:

| 엔드포인트 | 체인 트리거 | 독립 스케줄 | 비고 |
|-----------|------------|------------|------|
| embed-creatives | process-media에서 | 매일 11:00 UTC (20:00 KST) | 백업 |
| creative-saliency | process-media에서 | 매일 11:30 UTC (20:30 KST) | 백업 |
| video-saliency | process-media에서 | 매일 12:00 UTC (21:00 KST) | 백업 |

---

## 2. collect-daily 배치 분석

### 구조

`runCollectDaily(date, batch, accountId, backfill)` — 공통 함수를 4개 배치 엔드포인트가 공유.

| 엔드포인트 | batch | 계정 범위 | 체인 | Cloud Scheduler |
|-----------|-------|----------|------|-----------------|
| `/api/cron/collect-daily` | 전체 | 모든 계정 (일괄) | **O** (→ process-media) | **등록됨** (18:00 KST, chain=true) |
| `/api/cron/collect-daily-1` | 1 | 계정 1~20 | X | 미등록 |
| `/api/cron/collect-daily-2` | 2 | 계정 21~40 | X | 미등록 |
| `/api/cron/collect-daily-3` | 3 | 계정 41~60 | X | 미등록 |
| `/api/cron/collect-daily-4` | 4 | 계정 61+ | X | 미등록 |

### 진단

- **중복 없음**: collect-daily (전체 일괄)와 collect-daily-1~4 (배치 분할)은 역할이 다름
- **실제 사용**: Cloud Scheduler는 `collect-daily` (전체)만 호출. 1~4는 수동 디버깅/backfill 용도
- **체인 주의**: 배치 1~4는 체인 미연결 — 수동 배치 실행 시 process-media 별도 호출 필요
- **필요성**: 계정 90개 기준, 배치 분할 엔드포인트는 부하 분산/디버깅에 유용. 유지 권장

---

## 3. 전체 크론 엔드포인트 목록

### A. Cloud Scheduler → HTTP 엔드포인트 (bscamp-cron 서비스)

| # | Scheduler ID | 엔드포인트 | 역할 | 스케줄 (KST) | 마지막 시도 | 상태 |
|---|-------------|-----------|------|-------------|------------|------|
| 1 | bscamp-collect-daily | `/cron/collect-daily?chain=true` | Meta 광고 일일 성과 수집 + 체인 시작 | 매일 18:00 | 03-29 18:00 | **정상** |
| 2 | bscamp-collect-mixpanel | `/cron/collect-mixpanel` | Mixpanel 매출/구매 수집 | 매일 18:30 | 03-29 18:30 | **정상** |
| 3 | bscamp-cleanup-deleted | `/cron/cleanup-deleted` | 30일 지난 삭제 콘텐츠 영구 삭제 | 매일 19:05 | 03-29 19:05 | **정상** |
| 4 | bscamp-collect-clicks | `/cron/collect-clicks` | Mixpanel 클릭 이벤트 → lp_click_data | 매일 19:10 | 03-29 19:10 | **정상** |
| 5 | bscamp-precompute | `/cron/precompute` | T3 점수/학생 성과/진단 캐시 사전연산 | 매일 19:30 | 03-29 19:30 | **정상** |
| 6 | bscamp-collect-content | `/cron/collect-content` | RSS/HTML/YouTube 콘텐츠 크롤링 | 매일 20:00 | 03-29 20:00 | **정상** |
| 7 | bscamp-embed-creatives | `/cron/embed-creatives` | Gemini 임베딩 생성 (3072D) | 매일 20:00 | 03-29 20:05 | **오류 (code:13)** |
| 8 | bscamp-creative-saliency | `/cron/creative-saliency` | 이미지 DeepGaze 시선 분석 | 매일 20:30 | 03-29 20:37 | **정상** |
| 9 | bscamp-collect-youtube | `/cron/collect-youtube` | YouTube 전용 콘텐츠 수집 | 매일 21:00 | 03-29 21:00 | **정상** |
| 10 | bscamp-video-saliency | `/cron/video-saliency` | 영상 DeepGaze 시선 분석 | 매일 21:00 | 03-29 21:03 | **정상** |
| 11 | bscamp-track-performance | `/cron/track-performance` | change_log 전후 성과 비교 | 매일 23:00 | 03-29 23:00 | **정상** |
| 12 | bscamp-analyze-lp-saliency | `/cron/analyze-lp-saliency` | LP 스크린샷 시선 분석 | 매일 23:30 | 03-29 23:30 | **정상** |
| 13 | bscamp-crawl-lps | `/cron/crawl-lps` | LP 스크린샷 크롤링 (10건/회) | 매시간 | 03-30 11:00 | **정상** |
| 14 | bscamp-analyze-competitors | `/cron/analyze-competitors` | 경쟁사 광고 Gemini 분석 | 6시간마다 | 03-29 06:00 | **정상** |
| 15 | bscamp-collect-benchmarks | `/cron/collect-benchmarks` | 주간 벤치마크 수집/계산 | 월요일 17:00 | 03-23 18:04 | **정상** |
| 16 | bscamp-organic-benchmark | `/cron/organic-benchmark` | 네이버 블로그 벤치마크 | 월요일 18:00 | 03-23 18:00 | **정상** |

### B. Cloud Scheduler → Cloud Run Jobs

| # | Scheduler ID | Cloud Run Job | 역할 | 스케줄 (KST) | 마지막 시도 | Scheduler 상태 |
|---|-------------|--------------|------|-------------|------------|---------------|
| 17 | bscamp-job-score-percentiles | bscamp-score-percentiles | 점수 백분위 계산 | 매일 02:00 | 03-30 02:00 | **code:7** |
| 18 | bscamp-job-fatigue-risk | bscamp-fatigue-risk | 소재 피로도 위험 감지 | 매일 02:30 | 03-30 02:30 | **code:7** |
| 19 | bscamp-job-andromeda | bscamp-andromeda-similarity | 소재 유사도 분석 | 매일 03:00 | 03-30 03:00 | **code:7** |
| 20 | bscamp-job-lp-alignment | bscamp-lp-alignment | 소재↔LP 일관성 분석 | 매일 03:30 | 03-30 03:30 | **code:7** |
| 21 | bscamp-job-analyze-lps | bscamp-analyze-lps | LP AI 분석 | 매일 04:00 | 03-30 04:00 | **code:7** |
| 22 | bscamp-job-five-axis | bscamp-analyze-five-axis | 5축 분석 | 매일 01:00 | - | **PAUSED** |

### C. 외부 서비스 (bscamp-cron 아님)

| # | Scheduler ID | 서비스 | 역할 | 스케줄 (KST) | 마지막 시도 | 상태 |
|---|-------------|--------|------|-------------|------------|------|
| 23 | collect-sales-summary-daily | dashboard-api | 매출 요약 수집 | 매일 01:30 | 03-30 01:34 | **정상** |

### D. 코드에 존재하지만 Cloud Scheduler 미등록

| 엔드포인트 | 역할 | 코드 내 주석 스케줄 | 상태 |
|-----------|------|-------------------|------|
| `/cron/collect-daily-1~4` | 배치별 수집 (수동 디버깅용) | - | 의도적 미등록 |
| `/cron/discover-accounts` | Meta 계정 자동 발견 | 주간 월요일 | **미등록 (등록 필요)** |
| `/cron/competitor-check` | 경쟁사 새 광고 감지 | 매일 09:00, 21:00 | **미등록** |
| `/cron/publish-scheduled` | 예약 콘텐츠 발행 | 15분마다 | **미등록** |
| `/cron/sync-notion` | Notion DB 동기화 | 매일 13:00 KST | **미등록** |
| `/cron/video-scene-analysis` | 영상 씬별 Gemini 분석 | - | 미등록 (수동 실행) |
| `/cron/health` | 크론 상태 헬스체크 | - | 미등록 (수동 호출) |
| `/cron/backfill-ai-answers` | AI 답변 백필 (POST) | - | 미등록 (일회성) |

---

## 4. 문제점 및 조치 권고

### 긴급 (즉시 조치)

| # | 문제 | 영향 | 권고 |
|---|------|------|------|
| **P1** | `embed-creatives` Scheduler 상태 code:13 (INTERNAL) | 독립 스케줄 임베딩 실패 중. 체인 트리거로만 동작 | 로그 확인 후 원인 파악. Gemini API 키/할당량 확인 |
| **P2** | Cloud Run Jobs 5개 Scheduler 상태 code:7 | score-percentiles, fatigue-risk, andromeda, lp-alignment, analyze-lps 모두 Scheduler 에서 트리거 오류 | IAM 권한 확인: `modified-shape-477110-h8@appspot.gserviceaccount.com`에 `roles/run.invoker` 필요 |
| **P3** | `discover-accounts` Cloud Scheduler 미등록 | 새 광고 계정 자동 발견 안 됨 (수동 실행만 가능) | 월요일 08:00 KST 주간 스케줄 등록 |

### 중요 (1주 내 조치)

| # | 문제 | 영향 | 권고 |
|---|------|------|------|
| **P4** | `competitor-check` Scheduler 미등록 | 경쟁사 새 광고 감지 안 됨 → analyze-competitors가 큐 없이 공회전 | 09:00, 21:00 KST 등록 |
| **P5** | `publish-scheduled` Scheduler 미등록 | 예약 콘텐츠 자동 발행 불가 | 15분 간격 등록 (`*/15 * * * *`) |
| **P6** | `sync-notion` Scheduler 미등록 | Notion 동기화 안 됨 | 매일 13:00 KST 등록 |
| **P7** | `bscamp-job-five-axis` PAUSED 상태 | 5축 분석 Cloud Run Job 중단됨 | 의도적이면 OK. 아니면 재개 필요 |

### 참고

| # | 항목 | 설명 |
|---|------|------|
| **I1** | Cloud Run 서비스 URL 2가지 형식 혼재 | `a4vkex7yiq-du.a.run.app` (레거시)와 `906295665279.asia-northeast3.run.app` (신규) — **동일 서비스로 라우팅되므로 문제 없음** |
| **I2** | 고아 Cloud Run 서비스 | `collect-daily`, `collect-benchmarks` 독립 서비스 존재 — `bscamp-cron`으로 통합됨. 미사용이면 삭제 가능 |
| **I3** | `backfill-ai-answers` POST only | GET 미지원. 수동 백필 전용으로 적절 |

---

## 5. 일일 실행 타임라인 (KST)

```
시간     작업
──────   ─────────────────────────────────────────
01:00    [PAUSED] bscamp-job-five-axis (5축 분석)
01:30    collect-sales-summary-daily (매출 요약)
02:00    bscamp-job-score-percentiles (백분위) ⚠️ code:7
02:30    bscamp-job-fatigue-risk (피로도) ⚠️ code:7
03:00    bscamp-job-andromeda (유사도) ⚠️ code:7
03:30    bscamp-job-lp-alignment (LP 일관성) ⚠️ code:7
04:00    bscamp-job-analyze-lps (LP 분석) ⚠️ code:7
──────   ─────── 수집 체인 시작 ───────
18:00    collect-daily?chain=true (Meta 수집)
           └─► process-media (체인)
                 ├─► embed-creatives (체인)
                 ├─► creative-saliency (체인)
                 └─► video-saliency (체인)
18:30    collect-mixpanel (Mixpanel 매출)
19:05    cleanup-deleted (삭제 정리)
19:10    collect-clicks (클릭 이벤트)
19:30    precompute (사전연산)
──────   ─────── 독립 분석 (체인 백업) ───────
20:00    embed-creatives (백업) ⚠️ code:13
         collect-content (RSS/YouTube)
20:30    creative-saliency (백업)
21:00    video-saliency (백업)
         collect-youtube (YouTube)
23:00    track-performance (성과 추적)
23:30    analyze-lp-saliency (LP 시선)
──────   ─────── 매시간 ───────
*/1h     crawl-lps (LP 크롤링)
*/6h     analyze-competitors (경쟁사 분석)
──────   ─────── 주간 (월요일) ───────
월 17:00  collect-benchmarks (벤치마크)
월 18:00  organic-benchmark (네이버 벤치마크)
```

---

## 6. cron_runs 로깅 커버리지

### DB 감사 추적 현황 (startCronRun/completeCronRun 사용 여부)

28개 엔드포인트 중 **9개만** `cron_runs` 테이블에 실행 기록을 남김.

| 상태 | 엔드포인트 | cron_name |
|------|-----------|-----------|
| ✅ 로깅 O | collect-daily (1~4 포함) | `collect-daily` / `collect-daily-{N}` |
| ✅ 로깅 O | collect-mixpanel | `collect-mixpanel` |
| ✅ 로깅 O | collect-benchmarks | `collect-benchmarks` |
| ✅ 로깅 O | collect-content | `collect-content` |
| ✅ 로깅 O | collect-clicks | `collect-clicks` |
| ✅ 로깅 O | collect-youtube | `collect-youtube` |
| ✅ 로깅 O | process-media | `process-media` |
| ✅ 로깅 O | discover-accounts | `discover-accounts` |
| ✅ 로깅 O | sync-notion | `sync-notion` |
| ❌ 로깅 X | embed-creatives | — |
| ❌ 로깅 X | creative-saliency | — |
| ❌ 로깅 X | video-saliency | — |
| ❌ 로깅 X | video-scene-analysis | — |
| ❌ 로깅 X | analyze-lp-saliency | — |
| ❌ 로깅 X | crawl-lps | — |
| ❌ 로깅 X | precompute | — |
| ❌ 로깅 X | track-performance | — |
| ❌ 로깅 X | cleanup-deleted | — |
| ❌ 로깅 X | analyze-competitors | — |
| ❌ 로깅 X | competitor-check | — |
| ❌ 로깅 X | publish-scheduled | — |
| ❌ 로깅 X | organic-benchmark | — |
| ❌ 로깅 X | backfill-ai-answers | — |
| ❌ 로깅 X | health | — (모니터링 전용) |

**커버리지: 9/28 (32%)** — 로깅 없는 19개는 장애 시 Cloud Scheduler 로그만으로 추적해야 함.

### health 엔드포인트 모니터링 범위

`/api/cron/health`가 체크하는 크론은 **3개뿐**:
- `collect-daily` (25시간 이내)
- `collect-mixpanel` (25시간 이내)
- `collect-benchmarks` (168시간/7일 이내)

**나머지 25개는 health 모니터링 사각지대.** process-media, embed-creatives 등 체인 핵심 단계도 미모니터.

### 스키마 갭

- `completeCronRun()`이 `details` JSONB 컬럼에 쓰지만, `00030_cron_runs.sql` migration에 해당 컬럼 **없음**
- `database.ts` 타입에도 미정의 → `as any` 캐스트로 우회 중
- 실행 시 에러는 안 나지만(Supabase가 unknown column 무시), details 데이터가 **실제로 저장 안 될 수 있음**

---

## 7. 체인 트리거 코드 검증

### triggerNext 호출 위치 (코드 확인됨)

| 파일 | 라인 | 호출 |
|------|------|------|
| `collect-daily/route.ts` | L533 | `triggerNext("process-media")` — results.length > 0 && chain=true |
| `process-media/route.ts` | L197 | `triggerNext(["embed-creatives", "creative-saliency", "video-saliency"])` — 병렬 |
| `video-scene-analysis/route.ts` | L658 | 호출 없음 (터미널 노드, 주석으로 명시) |

### 검증 결과

| 항목 | 상태 | 비고 |
|------|------|------|
| collect-daily → process-media 연결 | ✅ 정상 | chain=true + results > 0 조건 |
| process-media → 3개 병렬 트리거 | ✅ 정상 | uploaded/processed/dedup > 0 조건 |
| fire-and-forget 2초 AbortSignal | ✅ 정상 | 다운스트림 완료 대기 안 함 |
| CRON_SECRET 없으면 스킵 | ✅ 정상 | 개발환경 안전장치 |
| collect-daily-4에서 체인 트리거 | ❌ 없음 | 주석은 "post-processing" 언급하나 코드 미구현. **의도적** (배치 엔드포인트는 수동용) |

---

## 8. 종합 점수

| 영역 | 점수 | 설명 |
|------|------|------|
| 체인 구조 | **A** | collect-daily → process-media → 3개 병렬. 설계대로 동작. 백업 스케줄도 있음 |
| collect-daily 배치 | **A** | 중복 없음. 전체(Scheduler용) + 배치(수동용) 역할 분리 명확 |
| Scheduler 등록 | **C** | 코드 28개 중 Scheduler 등록 23개. discover-accounts 등 5개 미등록 |
| 실행 상태 | **C** | Cloud Run Jobs 5개 code:7, embed-creatives code:13 |
| 로깅/모니터링 | **D** | cron_runs 커버리지 32%. health 모니터링 3개만. 장애 추적 사각지대 큼 |
| 스키마 정합성 | **B** | details 컬럼 갭 1건. 치명적이진 않으나 데이터 유실 가능 |

**총평: B- (구조는 탄탄하나 모니터링/등록 사각지대 존재)**
