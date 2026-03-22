# TASK: GCP Cloud Run 이관 체크리스트

## 현재 상태
- GCP 프로젝트: modified-shape-477110-h8 (bscamp)
- gcloud 로그인: smith.kim@inwv.co ✅
- API 활성화: Cloud Run, Cloud Scheduler, Artifact Registry, Cloud Build ✅

## Phase 1: collect-daily 이관 (최우선)

### 1-1. Docker 이미지 준비
- [ ] Dockerfile 작성 (Node.js 22 + bscamp 프로젝트)
- [ ] .dockerignore 작성 (node_modules, .next, .git 등)
- [ ] 환경변수 목록 정리 (META_ACCESS_TOKEN, SUPABASE_URL/KEY, GEMINI_API_KEY 등)
- [ ] 로컬 Docker 빌드 테스트

### 1-2. Artifact Registry
- [ ] 리포지토리 생성: `gcloud artifacts repositories create bscamp --repository-format=docker --location=asia-northeast3`
- [ ] Docker 이미지 태그 + push

### 1-3. Cloud Run 서비스 생성
- [ ] collect-daily 서비스 배포 (메모리 1GB, 타임아웃 3600초, 리전 asia-northeast3)
- [ ] 환경변수 설정 (Secret Manager 또는 직접)
- [ ] 테스트: 1개 계정만 수집 실행
- [ ] 전체 38계정 테스트

### 1-4. Cloud Scheduler 크론 설정
- [ ] collect-daily 크론: 매일 18:00 UTC (03:00 KST)
- [ ] 배치 분할 필요 없음 (타임아웃 60분이니까 한 번에 38계정)

## Phase 2: 나머지 크론 이관

### 2-1. collect-benchmarks
- [ ] Cloud Run 서비스 생성
- [ ] Cloud Scheduler: 매주 화 17:00 UTC (02:00 KST)

### 2-2. collect-mixpanel
- [ ] Cloud Run 서비스
- [ ] Scheduler: 매일 18:30 UTC

### 2-3. crawl-lps
- [ ] Playwright Docker 이미지 (mcr.microsoft.com/playwright 기반)
- [ ] Cloud Run 서비스 (메모리 2GB — Playwright 필요)
- [ ] Scheduler: 매시간

### 2-4. analyze-competitors
- [ ] Cloud Run 서비스
- [ ] Scheduler: 매일 14:00 UTC (23:00 KST)

### 2-5. embed-creatives
- [ ] Cloud Run 서비스
- [ ] Scheduler: 매일 22:00 UTC (07:00 KST)

## Phase 3: 분석 파이프라인 이관

### 3-1. analyze-five-axis
- [ ] Cloud Run (메모리 2GB — Gemini API 호출)

### 3-2. DeepGaze 시선 분석
- [ ] Cloud Run + GPU (또는 CPU로 느리게)
- [ ] predict.py + predict_video_frames.py 포함

### 3-3. 후처리 스크립트
- [ ] compute-fatigue-risk
- [ ] compute-score-percentiles
- [ ] compute-andromeda-similarity
- [ ] analyze-creative-lp-alignment

## Phase 4: Railway 제거
- [ ] bscamp-crawler → Cloud Run으로 대체 확인
- [ ] creative-pipeline → Cloud Run으로 대체 확인
- [ ] Railway 서비스 중지

## Phase 5: Vercel 크론 정리
- [ ] vercel.json 크론 제거 (Cloud Scheduler로 대체)
- [ ] Vercel = 프론트엔드 + 가벼운 API만

## 주의사항
- Supabase DB는 유지 (이관 안 함)
- 리전: asia-northeast3 (서울)
- 환경변수는 Secret Manager 사용 권장
- 기존 Vercel/Railway 즉시 끄지 마 — Cloud Run 안정 확인 후 전환
