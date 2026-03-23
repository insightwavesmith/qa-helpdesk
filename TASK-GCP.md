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

## Phase 4: Railway 상태 정리

### Railway 서비스 현황
- **bscamp-crawler** (Playwright 크롤러): Cloud Run crawl-lps 라우트가 Railway 호출 → Railway 유지
- **creative-pipeline** (DeepGaze 시선분석): analyze-lp-saliency 라우트가 Railway 호출 → Railway 유지

### 결론
Railway 서비스 2개는 당분간 유지 (Python/Playwright 의존):
- 크롤러: Playwright 환경 (mcr.microsoft.com/playwright 기반)
- DeepGaze: Python + PyTorch + CLIP

향후 Cloud Run GPU 서비스 or Cloud Run Playwright 이미지로 이관 가능.

## Phase 5: Vercel 크론 정리 ✅

- [x] vercel.json crons 배열 제거 (18개 → 0개)
- [x] Vercel = 프론트엔드 + 가벼운 API만
- [x] 모든 크론은 Cloud Scheduler에서 관리

## 주의사항
- Supabase DB는 유지 (이관 안 함)
- 리전: asia-northeast3 (서울)
- 환경변수는 Secret Manager 사용 권장
- 기존 Vercel/Railway 즉시 끄지 마 — Cloud Run 안정 확인 후 전환
