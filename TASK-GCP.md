# TASK: GCP Cloud Run 이관 체크리스트

## 현재 상태
- GCP 프로젝트: modified-shape-477110-h8 (bscamp)
- gcloud 로그인: smith.kim@inwv.co ✅
- API 활성화: Cloud Run, Cloud Scheduler, Artifact Registry, Cloud Build ✅

## Phase 1: collect-daily 이관 (최우선) ✅

### 1-1. Docker 이미지 준비
- [x] Dockerfile 작성 (Node.js 22 + 3-stage standalone 빌드)
- [x] .dockerignore 작성 (node_modules, .next, .git, docs, services 등)
- [x] 환경변수 목록 정리 (/tmp/bscamp-cloudrun-env.yaml)
- [x] Cloud Build 원격 빌드 (로컬 Docker 미설치 → --source . 사용)

### 1-2. Artifact Registry
- [x] 리포지토리 생성: bscamp (asia-northeast3)
- [x] Cloud Build로 이미지 빌드 + push (gcloud run deploy --source)

### 1-3. Cloud Run 서비스 생성
- [x] bscamp-cron 서비스 배포 (1GB, 3600초, asia-northeast3, concurrency=10, max=3)
- [x] 환경변수 설정 (env-vars-file로 직접 설정)
- [x] 테스트: Batch 1 (10계정) 수집 성공
- [x] 전체 38계정 테스트 진행 중

### 1-4. Cloud Scheduler 크론 설정
- [x] collect-daily 크론: 매일 18:00 UTC (03:00 KST), 1800초 attempt deadline
- [x] 배치 분할 불필요 (Cloud Run 3600초 타임아웃으로 한 번에 처리)

## Phase 2: 나머지 크론 이관 ✅ (crawl-lps 제외)

**동일한 bscamp-cron 서비스 사용** (Next.js 앱에 모든 API 라우트 포함)

### 2-1. collect-benchmarks ✅
- [x] 동일 Cloud Run 서비스 (bscamp-cron)
- [x] Cloud Scheduler: bscamp-collect-benchmarks, 매주 월 17:00 UTC

### 2-2. collect-mixpanel ✅
- [x] 동일 Cloud Run 서비스
- [x] Scheduler: bscamp-collect-mixpanel, 매일 18:30 UTC
- [x] 테스트 통과 (38계정 처리 확인)

### 2-3. crawl-lps ✅
- [x] Playwright는 Railway 서비스가 처리 (crawlV2 → Railway 호출)
- [x] Cloud Run은 API 라우트만 제공 (Railway로 위임)
- [x] Scheduler: bscamp-crawl-lps, 매시간

### 2-4. analyze-competitors ✅
- [x] Cloud Scheduler: bscamp-analyze-competitors, 매 6시간

### 2-5. embed-creatives ✅
- [x] Cloud Scheduler: bscamp-embed-creatives, 매일 22:00 UTC

### 2-6. 추가 크론 (vercel.json 전체 이관) ✅
- [x] sync-notion: 매일 19:00 UTC
- [x] cleanup-deleted: 매일 19:05 UTC
- [x] organic-benchmark: 매주 월 18:00 UTC
- [x] collect-content: 매일 20:00 UTC
- [x] collect-youtube: 매일 21:00 UTC
- [x] precompute: 매일 19:30 UTC
- [x] track-performance: 매일 23:00 UTC
- [x] analyze-lp-saliency: 매일 23:30 UTC
- [x] collect-clicks: 매일 19:10 UTC

## Phase 3: 분석 파이프라인 이관 ✅

**Cloud Run Jobs** (bscamp-scripts 이미지) + **Cloud Scheduler** 연동

### 3-1. analyze-five-axis ✅
- [x] Cloud Run Job: bscamp-analyze-five-axis (2GB, 3600초)
- [x] Scheduler: bscamp-job-five-axis, 매일 01:00 UTC
- [x] 테스트: dry-run 성공 확인
- [x] 프로덕션 args 전환: --dry-run 제거, --limit 50

### 3-2. DeepGaze 시선 분석 — Railway 유지
- [x] Python + PyTorch + CLIP 의존 → Railway 유지
- [x] API 라우트(analyze-lp-saliency)가 Railway 호출 → Cloud Scheduler에서 트리거
- [ ] 향후 Cloud Run GPU 서비스로 이관 가능

### 3-3. 후처리 스크립트 ✅
- [x] compute-score-percentiles → Cloud Run Job + Scheduler 02:00 UTC
- [x] compute-fatigue-risk → Cloud Run Job + Scheduler 02:30 UTC
- [x] compute-andromeda-similarity → Cloud Run Job + Scheduler 03:00 UTC
- [x] analyze-creative-lp-alignment → Cloud Run Job + Scheduler 03:30 UTC (env.mjs 이관)
- [x] analyze-lps-v2 → Cloud Run Job + Scheduler 04:00 UTC

### 수정사항
- scripts/lib/env.mjs: .env.local 없으면 process.env 폴백
- scripts/analyze-creative-lp-alignment.mjs: getSupabaseConfig() 사용으로 전환
- Dockerfile.scripts: 배치 스크립트 전용 경량 이미지

## Phase 4: Railway → Cloud Run URL 이관 ✅

### 완료 (2026-03-24)
- [x] `RAILWAY_CRAWLER_URL` 기본값 → Cloud Run URL (`bscamp-crawler-906295665279.asia-northeast3.run.app`)
- [x] `CREATIVE_PIPELINE_URL` 기본값 → Cloud Run URL (`creative-pipeline-906295665279.asia-northeast3.run.app`)
- [x] creative-saliency, video-saliency, analyze-lp-saliency 3파일에 기본값 추가 (commit 4e3673e)

### Railway 서비스 현황
- **bscamp-crawler**: GCP Cloud Run으로 이관 완료. Railway 중단 가능.
- **creative-pipeline**: GCP Cloud Run으로 이관 완료. Railway 중단 가능.

## Phase 5: Vercel 의존 제거 ✅

### 5-1. Vercel 크론 정리 ✅
- [x] vercel.json crons 배열 제거 (18개 → 0개)
- [x] 모든 크론은 Cloud Scheduler에서 관리

### 5-2. maxDuration 제거 ✅ (2026-03-24)
- [x] 33개 API route에서 `export const maxDuration` 삭제 (commit 4292148)
- [x] `vercel.json` → `{}` 빈 객체로 정리
- [x] `questions/new/page.tsx` maxDuration도 삭제

## Phase 6: Storage→GCS 이관 ✅ (2026-03-24)

### 6-1. Wave 1: 서버 사이드 (4파일) ✅
- [x] `/api/upload/route.ts` — POST+DELETE 핸들러
- [x] `contents.ts` — resolveImagePlaceholders()
- [x] `lp-media-downloader.ts` — uploadBufferToStorage()
- [x] `crawl-lps/route.ts` — uploadToStorage() + uploadHtmlToStorage()

### 6-2. Wave 2: 클라이언트 (10파일) ✅
- [x] 10파일 `uploadFile()` from `@/lib/upload-client` 교체

### 6-3. Wave 3: URL 교체 (3파일) ✅
- [x] `newsletter-row-templates.ts` — BANNER_BASE_URL dual-write
- [x] `email-template-utils.ts` — BANNER_BASE_URL dual-write
- [x] `email-default-template.ts` — BANNER_BASE dual-write

### 6-4. Wave 4: 빌드 검증 ✅
- [x] tsc + lint + build 통과

## Phase 7: 이벤트 체인 + Cloud Scheduler ✅ (2026-03-24)

### 7-1. 이벤트 체인 구현 ✅
- [x] `pipeline-chain.ts` — fire-and-forget triggerNext() 유틸
- [x] `collect-daily` → process-media 체인 트리거
- [x] `process-media` → embed+saliency 병렬 트리거

### 7-2. Cloud Scheduler 등록 ✅
- [x] collect-daily?chain=true (매일 03:00 KST)
- [x] embed-creatives (매일 20:00 KST, 백업)
- [x] creative-saliency (매일 20:30 KST, 백업, 신규)
- [x] video-saliency (매일 21:00 KST, 백업, 신규)

### 7-3. Cloud SQL 호환 fix ✅
- [x] creative-saliency: creatives!inner → 2-step query (commit 9bcd934)
- [x] video-saliency: creatives!inner → 2-step query (commit 9bcd934)

### 7-4. 배치 실행 결과
- creative-saliency: 1000카드 처리, 894건 동기화 + 2804건 bulk sync
- embed-creatives: 100건 처리
- video-saliency: 157건 처리

## Phase 8: Destructive Detector ✅ (2026-03-24)
- [x] PreToolUse hook 8패턴 차단 (commit dd72d45)
- [x] CLAUDE.md 규칙 9번 추가

---

## 남은 작업 (다음 세션)

### P0 (즉시)
- [ ] GCS 버킷 `bscamp-storage` public read 설정
- [ ] 뉴스레터 배너 PNG GCS 복사
- [ ] `USE_CLOUD_SQL=true` Cloud Run 환경변수 설정
- [ ] Railway 2개 서비스 중단 (crawler + creative-pipeline)

### P1 (이번 주)
- [ ] embed-creatives 전량 처리 (~400건 미처리)
- [ ] video-saliency stderr maxBuffer 오류 해결
- [ ] creative-saliency 미처리분 반복 실행
- [ ] 5축분석 배치 (analyze-creatives) 크론 등록

### P2 (다음 주)
- [ ] Supabase Auth → Firebase Auth 전환
- [ ] Supabase DB → Cloud SQL 전환
- [ ] Vercel → Cloud Run 프론트 전환

## 주의사항
- Supabase DB는 아직 유지 (Cloud SQL 전환 전)
- 리전: asia-northeast3 (서울)
- Cloud Run 최신 리비전: bscamp-cron-00019-b7j
- 기존 Vercel 즉시 끄지 마 — Cloud Run 프론트 안정 확인 후 전환
