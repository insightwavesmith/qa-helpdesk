# 마스터플랜 감사 분석서

> 작성일: 2026-03-25
> 작성자: PM팀 (감사)
> 대상 기간: 2026-03-08 ~ 2026-03-25
> 데이터 기준: `.pdca-status.json`, `DEV-STATUS.md`, `project-status.md`, `SERVICE-VISION.md`, TASK 파일 5개, 설계 문서 166개

## Executive Summary

| 항목 | 수치 |
|------|------|
| 총 PDCA feature 수 | 67 |
| 완료 (completed/deployed) | 61 |
| 진행중 (implementing) | 3 |
| 테스트 (testing) | 1 |
| 설계중 (designing) | 2 |
| 상태 불일치 발견 | **8건** |
| 미구현 설계 (신규 기능) | **5건** |
| 문서 모순 | **11건** |
| 우선순위 조정 필요 | **6건** |

---

## 1. 상태 불일치 감사

### 1.1 완료인데 진행중/설계중으로 표기된 항목

| # | feature | `.pdca-status.json` 상태 | 실제 상태 (notes 기반) | 출처 |
|---|---------|------------------------|---------------------|------|
| 1 | `collect-daily-refactor` | **designing** | notes에 "구현 완료. collect-daily 891→451줄 경량화 + process-media 482줄 신규 + tsc+build 통과" 명기 | `.pdca-status.json` |
| 2 | `gcp-migration` | **testing** | Phase 1-5 완료, 검수 Critical 10건 수정, Preview QA 통과. Phase 6(Production) 대기 중이나 실질적으로 "Phase 6 미착수"이므로 testing은 부적절 — "completed(Phase 1-5)" + 별도 항목 "gcp-phase6" 분리가 정확 | `.pdca-status.json` |
| 3 | `cloud-run-jobs-crawl-lps` | **implementing** | tasks 5개 중 4개 완료 표시(체크마크). "LP 216건 재크롤링 실행중"이 남은 작업이나, 3/23 이후 업데이트 없음 — 완료 여부 확인 필요 | `.pdca-status.json` |

**조치 권장**: `collect-daily-refactor`를 `completed`로 즉시 갱신. `gcp-migration`은 Phase 6를 별도 feature로 분리하고 Phase 1-5를 completed 처리.

### 1.2 진행중인데 실질 완료 가능성 있는 항목

| # | feature | 상태 | 의심 근거 |
|---|---------|------|----------|
| 4 | `e2e-pipeline-neonvelo` | implementing | "소재40건+LP2건+5축분석40건+임베딩40건 완료" — 네온벨로 1개 계정은 E2E 검증 완료. 나머지 계정은 일반 배치 작업이므로 E2E "검증" 자체는 완료일 수 있음. 3/22 이후 업데이트 없음 |
| 5 | `meta-full-fields` | implementing | "백필 실행 중" — 3/24 16:10 마지막 업데이트. 백필이 완료됐을 가능성 높음 (24시간 경과) |

### 1.3 project-status.md 갱신 필요 항목 (3/14 이후 완료 44건)

`project-status.md` 최종 업데이트: **2026-03-14** — 11일간 업데이트 없음.

3/14 이후 `.pdca-status.json`에서 완료된 기능 **44건** (주요 것만 기재):

| 완료일 | feature | 핵심 내용 |
|--------|---------|----------|
| 3/18 | admin-mobile-responsive | 관리자 13페이지 반응형 |
| 3/18 | railway-l2-batch | DeepGaze Railway 배포 |
| 3/18 | creative-pipeline-railway | Express 파이프라인 |
| 3/19 | lp-mobile-crawl | 모바일 LP 크롤링 33건 |
| 3/20 | collect-daily-v2 | 정규화 UPSERT |
| 3/20 | batch-scripts-step4-7 | STEP 1-7 완료 |
| 3/22 | five-axis-analysis | 5축 분석 v3 |
| 3/22 | creative-intelligence | L4 358건 |
| 3/22 | creative-saliency | DeepGaze 2,784건 |
| 3/22 | p0-db-schema-v3 | 스키마 v3 |
| 3/22 | protractor-refactoring | Architecture v3 |
| 3/23 | gcp-cloudrun-migration | Cloud Run 이관 |
| 3/23 | db-cleanup-v1-tables | 73→60 테이블 |
| 3/23 | lp-media-download | LP 미디어 다운로드 |
| 3/23 | deepgaze-gemini-pipeline | DeepGaze→Gemini 결합 |
| 3/24 | collection-v3 | content_hash 중복 제거 |
| 3/24 | gemini-migration | Anthropic→Gemini 전환 |
| 3/24 | wave2-3-collection | CAROUSEL 1:N |
| 3/24 | pipeline-event-chain | 이벤트 체인 |
| 3/24 | vercel-removal | maxDuration 33파일 제거 |
| 3/24 | storage-gcs-migration | GCS 듀얼라이트 |

**조치 권장**: `project-status.md`를 폐기하거나 `DEV-STATUS.md`로 통합. 현재 두 문서가 동일 목적으로 존재하면서 하나만 갱신되어 혼란 발생.

또한 `project-status.md`의 "개발 대기" 항목 중 이미 완료된 것:
- "크롬 확장 배포" → chrome-extension design 문서 존재, analysis 문서도 존재 (3/13-14 개발 완료, Chrome Web Store 등록만 잔여)
- "콘텐츠분석 엔진 고도화" → five-axis-analysis로 대체/확장됨
- "알림 시스템 고도화" → slack-notification.design.md 신규 작성됨 (3/25)

### 1.4 TASK 파일 갱신 필요 항목

| # | TASK 파일 | 해당 항목 | PDCA 상태 | 불일치 |
|---|-----------|----------|----------|--------|
| 6 | `TASK-DEEPGAZE-GEMINI-PIPELINE.md` | 전체 | completed (3/23) | TASK 파일이 여전히 존재. 완료 표기 없음. 단, TASK 파일의 3번 항목(LP DeepGaze 적용)과 4번(DB saliency_data 컬럼)은 부분 구현 — notes에는 "creative-saliency 크론 + five-axis DeepGaze 주입"만 언급 |
| 7 | `TASK-LP-MEDIA-DOWNLOAD.md` | 전체 | completed (3/23) | TASK 파일 그대로 존재. 완료 표기 없음 |
| 8 | `TASK-COLLECTION-GAPS.md` | TASK 2 (5축 2,526건) | Gemini 5축 496/3,022 (16%) — DEV-STATUS | TASK 파일은 "미분석 2,526건 배치"를 요구하지만, DEV-STATUS 기준 여전히 16% 처리. 이 배치 작업이 실행됐는지 확인 필요 |
| 8b | `TASK-GCS-STORAGE-MIGRATION.md` | 전체 | storage-gcs-migration completed | TASK 파일은 "bscamp-media" 버킷 신규 생성 제안, 실제는 "bscamp-creatives" 버킷 사용. 경로 구조도 TASK 제안과 다름 |

---

## 2. 설계 있고 미구현 목록

### 2.1 Design 있으나 PDCA에 없거나 미구현 (신규 기능 — 130건 중 주요 5건)

130개 design 문서가 `.pdca-status.json`에 없지만, 대부분은 이미 구현 완료된 과거 스프린트 항목 (t1~t10, a1~a3, b1~b3, c1~c3, protractor-v5 시리즈 등). 이들은 PDCA 시스템 도입 전 작업이라 미등록된 것으로 판단.

**진짜 미구현 신규 기능 (설계 있고 구현 미착수)**:

| # | 설계 문서 | Plan 존재 | Design 존재 | PDCA 상태 | 비고 |
|---|-----------|:--------:|:-----------:|----------|------|
| 1 | **agent-dashboard** | O | O | PDCA 미등록 | Plan+Design 완성 (3/24). 구현 미착수. FR 14개 정의. src/types/agent-dashboard.ts + src/app/api/agent-dashboard/ 디렉토리가 git untracked 상태로 존재 — 부분 구현 시도 흔적 |
| 2 | **slack-notification** | - | O | PDCA 미등록 | Design 완성 (3/25). agent-dashboard의 하위 모듈. src/lib/slack-notifier.ts가 untracked |
| 3 | **orchestration-chain** | - | O | PDCA 미등록 | Design 완성 (3/25). 3팀 간 워크플로우 규약. src/lib/chain-detector.ts가 untracked |
| 4 | **gcp-full-migration** | O | O | PDCA 미등록 | Plan+Design 완성 (3/24). Phase 3-D/4/5 정의. Phase 3-D(Cloud Run 프론트) 공수 1-2일, Phase 5(Firebase Auth) 공수 2-3주 |
| 5 | **organic-channel-distribution** | O | O | **designing** | Design 완성 (3/25). 5채널 배포 프로세스. 테이블 4개 + AI 변환 엔진. 구현 미착수 |

### 2.2 TASK 미착수 항목

| # | 출처 | 항목 | 상태 |
|---|------|------|------|
| 1 | TASK-COLLECTION-GAPS | TASK 2: 5축 배치 2,526건 | 미완료 — DEV-STATUS 기준 496/3,022 (16%) |
| 2 | TASK-COLLECTION-GAPS | TASK 3: LP 미분석 132건 배치 | 확인 필요 |
| 3 | TASK-CTO-RESUME | #1: Railway 코드 정리 + OFF | 미착수 — railway-to-gcp는 URL 전환만, 코드 네이밍 변경은 안 됨 |
| 4 | TASK-CTO-RESUME | #2: USE_CLOUD_SQL 분기 제거 | 미착수 |
| 5 | TASK-CTO-RESUME | #3: agent-state-sync.sh 완성 | 부분 — .claude/hooks/agent-state-sync.sh가 untracked으로 존재 |
| 6 | DEV-STATUS "다음 할 일" | 처방 시스템 구현 | 미착수 — prescription-cost-test만 완료 (비용 측정) |
| 7 | DEV-STATUS "다음 할 일" | 크론 중복 정리 | 미착수 |
| 8 | DEV-STATUS "다음 할 일" | 환경변수 전수 점검 | 미착수 |
| 9 | DEV-STATUS "다음 할 일" | CAROUSEL 배치 backfill | wave2-3-collection은 코드 완료이나, 기존 90일분 재수집은 미실행 |

### 2.3 구현 우선순위별 정렬

| 우선순위 | 항목 | 근거 |
|---------|------|------|
| **P0** | 5축 배치 2,526건 | DEV-STATUS 1순위. 현재 16%. 서비스 핵심 가치(AI 진단)에 직접 영향 |
| **P0** | TASK-CTO-RESUME #1-2 (코드 정리) | Railway 참조 + USE_CLOUD_SQL 분기가 코드에 남아있어 혼란 유발 |
| **P1** | GCP Phase 6 (Production) | gcp-migration testing 상태. Cloud SQL 0.0.0.0/0 보안 이슈 |
| **P1** | 처방 시스템 | SERVICE-VISION 핵심 가치("뭘 고치면 되는지"). prescription-cost-test 완료 |
| **P2** | agent-dashboard | 팀 운영 효율. 설계 완성. 구현 난이도 중간 |
| **P2** | organic-channel-distribution | 장기 성장. 설계 완성이나 구현 규모 대형 |

---

## 3. 문서 간 모순/불일치

### 3.1 인프라 현황 불일치

| # | 항목 | SERVICE-VISION.md | DEV-STATUS.md | 실제 (추정) |
|---|------|-------------------|---------------|------------|
| 1 | Next.js 버전 | **14** | — (CLAUDE.md에 **15** 명시) | **15** (package.json 기준) |
| 2 | 크롤러 위치 | **GCP Cloud Run** (bscamp-crawler) | **Railway (유지)** | Railway (DEV-STATUS가 정확, 3/24 기준). 단 railway-to-gcp completed는 URL 전환만 의미 |
| 3 | GCS 버킷명 | `bscamp-storage` | `bscamp-creatives` | TASK-GCS에서는 `bscamp-media` 제안. 실제 사용 확인 필요 |
| 4 | Railway 파이프라인 | URL 목록에 `creative-pipeline-production.up.railway.app` 기재 | railway-to-gcp completed | GCP로 전환 완료 — SERVICE-VISION의 Railway URL 기재는 구식 |
| 5 | 기술스택 | "Supabase (PostgreSQL + RLS + Auth)" | Cloud SQL + Supabase Auth (분리) | DEV-STATUS가 정확. SERVICE-VISION 기술스택 섹션 갱신 필요 |

**조치 권장**: SERVICE-VISION.md의 인프라 섹션(100행~)과 기술 스택(135행~)을 3/24 기준으로 갱신. 특히 Next.js 14→15, GCS 버킷명 통일, Railway URL 제거.

### 3.2 크론 스케줄 불일치

| 문서 | 크론 수 | 비고 |
|------|------:|------|
| SERVICE-VISION.md | 12개 | 구식 — GCP 전환 전 기준 |
| project-status.md | 5개 | 매우 구식 — Vercel cron 시대 |
| DEV-STATUS.md | 21개 | 최신 — Cloud Scheduler 기반 |
| TASK-DEEPGAZE 파이프라인 순서 | 8개 | Smith님 확정 8단계 파이프라인 |

**구체적 불일치**:

| # | 크론 | SERVICE-VISION | DEV-STATUS | TASK-DEEPGAZE | 문제 |
|---|------|:-----------:|:----------:|:------------:|------|
| 6 | creative-saliency | 없음 | 분석 6개 중 포함 | 19:00 UTC (②번) | SERVICE-VISION에 누락 |
| 7 | analyze-five-axis | 없음 | 분석 6개 중 포함 | 01:00 UTC (③번) | SERVICE-VISION에 누락 |
| 8 | fatigue-risk | 없음 | 분석 6개 중 포함 | 02:00 UTC (⑤번) | SERVICE-VISION에 누락 |
| 9 | score-percentiles | 없음 | 사전계산 3개 중 포함 | 02:00 UTC (⑥번) | SERVICE-VISION에 누락 |
| 10 | lp-alignment | 없음 | — | 03:30 UTC (⑦번) | 양쪽 모두 누락 여부 확인 필요 |

SERVICE-VISION은 12개 크론만 기재하지만 실제 Cloud Scheduler는 21개. 9개 크론이 SERVICE-VISION에서 누락됨.

### 3.3 DB 스키마 불일치

| # | 항목 | 문서 기재 | 실제 (추정) |
|---|------|----------|------------|
| 11 | TASK-DEEPGAZE: `saliency_data` JSONB 컬럼 | 신규 추가 요구 | deepgaze-gemini-pipeline completed 노트에 언급 없음 — 추가됐는지 확인 필요 |
| — | TASK-DEEPGAZE: `video_saliency_frames` JSONB | 신규 추가 요구 | video-saliency feature는 completed이나 이 컬럼 존재 여부 불명 |
| — | TASK-GCS: `bscamp-media` 버킷 | 신규 생성 제안 | 실제 storage-gcs-migration은 `bscamp-creatives` 사용 |
| — | GCP Full Migration Design: `profiles.firebase_uid` TEXT | Phase 5 계획 | 미구현 (Phase 5 미착수) |

### 3.4 기타 모순

| # | 문서 A | 문서 B | 모순 내용 |
|---|--------|--------|----------|
| — | SERVICE-VISION "핵심 URL" | DEV-STATUS | Railway 크롤러/파이프라인 URL이 SERVICE-VISION에 여전히 기재. railway-to-gcp 완료 후에도 갱신 안 됨 |
| — | project-status.md "크론" | DEV-STATUS | project-status는 Vercel cron 5개 기재 (collect-daily 등). 실제는 Cloud Scheduler 21개로 전환 완료 |
| — | SERVICE-VISION "현재 상태 (3/19 업데이트)" | DEV-STATUS (3/24) | SERVICE-VISION의 진행률이 5일 지연. L2 시선 "127/2,660 (5%)"이나 DEV-STATUS는 "2,926/3,022 (97%)" |
| — | DEV-STATUS "TASK 파일 목록" | 실제 TASK 파일 | DEV-STATUS에 TASK-BATCH.md, TASK-PRESCRIPTION.md, TASK-CRON-CLEANUP.md 등 7개 기재. 실제 `.claude/tasks/`에는 5개만 존재 (DEEPGAZE, COLLECTION-GAPS, LP-MEDIA-DOWNLOAD, GCS-STORAGE-MIGRATION, CTO-RESUME) |

---

## 4. 우선순위 재정렬 제안

### 4.1 즉시 실행 (P0) — 서비스 임팩트 직접

| # | 작업 | 근거 | 예상 공수 |
|---|------|------|----------|
| 1 | **5축 배치 2,526건 실행** | 현재 16%. 서비스 핵심 가치(AI 진단)의 84%가 미생성. Cloud Run Job으로 트리거만 하면 됨 | 0.5일 (실행+모니터링) |
| 2 | **코드 정리: Railway→Cloud Run 네이밍** (TASK-CTO-RESUME #1) | 코드에 "railway" 문자열 잔존. 혼란 유발 + 기술 부채 | 0.5일 |
| 3 | **코드 정리: USE_CLOUD_SQL 분기 제거** (TASK-CTO-RESUME #2) | 불필요한 분기가 로그인 에러 원인으로 SERVICE-VISION에 언급됨 | 0.5일 |
| 4 | **PDCA 상태 정리** | collect-daily-refactor→completed, gcp-migration Phase 6 분리, e2e-pipeline/meta-full-fields 상태 확인 | 0.5일 |

### 4.2 다음 스프린트 (P1) — 인프라 안정화 + 핵심 가치

| # | 작업 | 근거 | 예상 공수 |
|---|------|------|----------|
| 5 | **GCP Phase 6: Cloud SQL 보안** | 0.0.0.0/0 허용 상태 — 보안 리스크. IP 제한 + Private VPC 필요 | 1일 |
| 6 | **처방 시스템 MVP** | Smith님 비전 핵심 ("뭘 고치면 되는지"). 비용 테스트 완료. prescription_benchmarks 테이블 + Gemini 프롬프트 | 3-5일 |
| 7 | **문서 통합 정리** | project-status.md 폐기 → DEV-STATUS.md 정본화. SERVICE-VISION.md 인프라/크론/URL 갱신 | 0.5일 |
| 8 | **CAROUSEL 90일 backfill** | wave2-3-collection 코드 완성. 기존 데이터 재수집으로 분석 커버리지 확대 | 1일 (실행+모니터링) |

### 4.3 백로그 (P2) — 확장 기능

| # | 작업 | 근거 | 예상 공수 |
|---|------|------|----------|
| 9 | **agent-dashboard 구현** | Plan+Design 완성. 팀 운영 가시성 향상. 슬랙 알림 포함 | 3-5일 |
| 10 | **GCP Full Migration Phase 3-D** | Vercel→Cloud Run 프론트 이관. Dockerfile 준비됨 | 1-2일 |
| 11 | **GCP Full Migration Phase 5** | Firebase Auth 전환. 대규모 변경 (62파일) | 2-3주 |
| 12 | **organic-channel-distribution** | 장기 성장 전략. 설계 완성이나 구현 대형 (테이블 4개 + AI 엔진) | 2-3주 |
| 13 | **크론 중복 정리** | 21개 크론 중 중복 의심. 운영 효율 | 1일 |
| 14 | **환경변수 전수 점검** | 29개 환경변수 Vercel/Cloud Run 누락 확인 | 0.5일 |

### 4.4 의존성 그래프

```
[P0] 5축 배치 ─────────────────────────────────┐
[P0] 코드 정리 (Railway/USE_CLOUD_SQL) ──┐      │
                                         ↓      ↓
[P1] GCP Phase 6 (보안) ─────────────→ [P2] GCP Phase 3-D (프론트 이관)
                                                 ↓
                                         [P2] GCP Phase 5 (Firebase Auth)
                                                 ↓
                                         [P2] GCP Phase 4 (RLS 비활성화)

[P1] 처방 시스템 ← 5축 배치 완료 필요 (데이터 기반)

[P2] agent-dashboard ← 독립 (즉시 착수 가능)
[P2] organic-channel-distribution ← 독립 (즉시 착수 가능, 단 규모 대형)
```

**핵심 의존성**:
- 처방 시스템은 5축 배치 완료 후 의미 있음 (데이터 16%로는 처방 품질 보장 불가)
- GCP Phase 5(Firebase Auth) 전에 Phase 3-D(Cloud Run 프론트) 완료 필요
- GCP Phase 4(RLS 비활성화)는 반드시 Phase 5(ANON_KEY 제거) 후 — 보안 순서 (gcp-full-migration.plan.md 명시)

---

## 5. 권장 조치 목록

### 즉시 (금주 내)

| # | 조치 | 담당 | 파일 |
|---|------|------|------|
| 1 | `collect-daily-refactor` 상태를 `completed`로 변경 | CTO팀 | `.pdca-status.json` |
| 2 | `gcp-migration`에서 Phase 6를 `gcp-phase6`로 분리, Phase 1-5를 completed 처리 | CTO팀 | `.pdca-status.json` |
| 3 | `e2e-pipeline-neonvelo`, `meta-full-fields`, `cloud-run-jobs-crawl-lps` 현재 상태 확인 후 갱신 | CTO팀 | `.pdca-status.json` |
| 4 | 5축 배치 Cloud Run Job 트리거 (2,526건) | CTO팀 | `bscamp-analyze-five-axis` Job |
| 5 | `project-status.md`를 deprecated 표기 또는 DEV-STATUS.md로 통합 | PM팀 | `project-status.md` |
| 6 | SERVICE-VISION.md 인프라/기술스택/크론 섹션 갱신 (Next.js 15, GCS 버킷명, Railway URL 제거, 크론 21개 반영) | PM팀 | `SERVICE-VISION.md` |

### 단기 (1주 내)

| # | 조치 | 담당 | 비고 |
|---|------|------|------|
| 7 | TASK-CTO-RESUME #1-2 실행 (Railway 네이밍 + USE_CLOUD_SQL 제거) | CTO팀 | 기술 부채 해소 |
| 8 | Cloud SQL 0.0.0.0/0 → IP 제한 | CTO팀 | 보안 P0 |
| 9 | 완료된 TASK 파일 아카이브 (DEEPGAZE, LP-MEDIA-DOWNLOAD) | PM팀 | 정리 |
| 10 | agent-dashboard/slack-notification/orchestration-chain을 `.pdca-status.json`에 등록 | PM팀 | PDCA 추적 누락 해소 |

### 중기 (2주 내)

| # | 조치 | 비고 |
|---|------|------|
| 11 | 처방 시스템 MVP 착수 | 5축 배치 완료 후 |
| 12 | GCP Phase 3-D (Cloud Run 프론트) 착수 | Dockerfile 준비됨 |
| 13 | CAROUSEL 90일 backfill 실행 | 코드 완성, 실행만 필요 |

---

## 부록: 상태 문서 신뢰도 평가

| 문서 | 최종 갱신 | 신뢰도 | 비고 |
|------|----------|:------:|------|
| `.pdca-status.json` | 2026-03-25 | **높음** | 67개 feature 추적. 3건 상태 불일치 외 정확 |
| `DEV-STATUS.md` | 2026-03-24 | **높음** | 가장 최신. 인프라/DB/배치 현황 정확 |
| `project-status.md` | 2026-03-14 | **낮음** | 11일 미갱신. 크론 5개 (구식). 다수 항목 outdated |
| `SERVICE-VISION.md` | 2026-03-24 부분갱신 | **중간** | 인프라 섹션(100행~)은 3/24 갱신이나 내부 모순 다수. 기술 스택(135행~)은 구식 |

**정본(Single Source of Truth) 권장**: `DEV-STATUS.md` + `.pdca-status.json` 조합. `project-status.md`는 폐기. `SERVICE-VISION.md`는 비전/방향 전용으로 유지하되 인프라 섹션 분리 또는 DEV-STATUS 링크로 대체.
