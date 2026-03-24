# TASK: Railway → GCP Cloud Run 전환 + Railway 정리

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## 현재 상태
Railway에 2개 서비스가 아직 살아있는데, GCP Cloud Run에 동일 서비스가 이미 배포돼있다.
비용 이중 지출 중. Railway를 끄고 GCP로 완전 전환한다.

## Railway 서비스 현황
1. **bscamp-crawler** (Playwright LP 크롤러) — Railway: bscamp-crawler-production.up.railway.app
2. **creative-pipeline** (DeepGaze 시선분석) — Railway: creative-pipeline-production.up.railway.app

## GCP Cloud Run 대응
1. **bscamp-crawler** — https://bscamp-crawler-906295665279.asia-northeast3.run.app (health OK 확인됨)
2. **creative-pipeline** — https://creative-pipeline-906295665279.asia-northeast3.run.app (health OK 확인됨)

## 작업 순서

### Step 1: 코드에서 Railway URL 참조 찾기
- `RAILWAY_CRAWLER_URL` → src/lib/railway-crawler.ts에서 사용
- `CREATIVE_PIPELINE_URL` → creative-saliency, collect-daily, analyze-lp-saliency 크론에서 사용
- 전체 코드베이스에서 `railway` 키워드 검색해서 누락 없는지 확인

### Step 2: 환경변수 변경
- Vercel 환경변수:
  - `RAILWAY_CRAWLER_URL` → GCP Cloud Run URL로 변경
  - `CREATIVE_PIPELINE_URL` → GCP Cloud Run URL로 변경
- GCP Cloud Run 서비스 환경변수에서도 동일하게 참조하는 곳 변경
- .env.local도 동일하게 변경

### Step 3: GCP Cloud Run 서비스 동작 확인
- bscamp-crawler: /health 엔드포인트 확인, /crawl 테스트 (1건 LP)
- creative-pipeline: /health 확인, /saliency 테스트 (1건 이미지)
- 실제 크론 1회 수동 트리거해서 정상 작동 확인

### Step 4: Railway 서비스 중지
- 코드+크론이 전부 GCP URL을 바라보는 것 확인 후
- Railway 대시보드에서 서비스 중지 (삭제는 아직 하지 마라, 1주일 모니터링 후 삭제)

### Step 5: 커밋
- 환경변수 변경 관련 코드 변경사항 커밋+푸시

## 주의사항
- Railway 서비스를 끄기 전에 반드시 GCP에서 동일 기능 동작 확인
- DeepGaze(/saliency)가 GCP Cloud Run에서 PyTorch 로딩 잘 되는지 확인 필수
- browserConnected 상태도 GCP 크롤러에서 확인 (Playwright headless)
