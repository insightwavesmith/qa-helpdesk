# TASK: Railway → GCP Cloud Run 이관 (2개 서비스)

## 배경
Railway에 남아있는 2개 서비스를 GCP Cloud Run으로 이관. 현재 GCP Scheduler → GCP Cloud Run → Railway로 한 다리 거치는 구조 → 직접 GCP에서 실행되도록.

## 이관 대상

### 1. bscamp-crawler (Playwright LP 크롤러)
- **현재**: `https://bscamp-crawler-production.up.railway.app`
- **기능**: Playwright로 LP 크롤링 — 스크린샷, CTA 스크린샷, OG이미지, 텍스트(headline/description/price) 추출
- **엔드포인트**: `POST /crawl` (단건), `POST /crawl/batch` (배치)
- **소스**: `src/lib/railway-crawler.ts`에서 호출
- **이관 방법**: 
  - Playwright Docker 이미지 사용 (`mcr.microsoft.com/playwright` 또는 커스텀)
  - Cloud Run Service로 배포 (항상 대기 필요하면 min-instances=1)
  - 환경변수 `RAILWAY_CRAWLER_URL` → 새 Cloud Run URL로 변경

### 2. creative-pipeline (DeepGaze + AI 분석)
- **현재**: `https://creative-pipeline-production.up.railway.app`
- **기능**: 
  - DeepGaze III 시선 분석 (PyTorch 모델)
  - LP saliency 분석
  - 기타 AI 파이프라인
- **엔드포인트**: `POST /lp-saliency` 등
- **소스**: `src/app/api/cron/analyze-lp-saliency/route.ts`에서 호출
- **이관 방법**:
  - PyTorch + DeepGaze 모델 → Docker 컨테이너 빌드
  - Cloud Run Service로 배포 (GPU 필요 시 Cloud Run GPU 사용)
  - CPU만으로 가능하면 일반 Cloud Run
  - 환경변수 `CREATIVE_PIPELINE_URL` → 새 Cloud Run URL로 변경

## 순서

### Phase 1: Playwright 크롤러 (쉬움)
1. Railway 크롤러 소스 코드 확인 (어디 있는지 찾기)
2. Dockerfile 작성 (Playwright + Node.js)
3. Cloud Run 배포: `gcloud run deploy bscamp-crawler --region=asia-northeast3 --project=modified-shape-477110-h8`
4. 헬스체크 확인
5. bscamp 코드에서 `RAILWAY_CRAWLER_URL` → 새 URL 변경
6. Vercel/Cloud Run 환경변수 업데이트
7. 테스트: LP 크롤링 1건 수동 실행

### Phase 2: DeepGaze 파이프라인 (주의 필요)
1. Railway creative-pipeline 소스 코드 확인
2. PyTorch + DeepGaze 모델 Dockerfile 작성
3. 모델 파일 → GCS에 저장하고 시작 시 로드 (또는 이미지에 포함)
4. Cloud Run 배포 (메모리 4Gi+ 필요할 수 있음)
5. 헬스체크 + lp-saliency 엔드포인트 테스트
6. bscamp 코드에서 `CREATIVE_PIPELINE_URL` → 새 URL 변경
7. Vercel/Cloud Run 환경변수 업데이트
8. 테스트: 시선 분석 1건 수동 실행

### Phase 3: Railway 삭제
1. Railway 서비스 중지 (바로 삭제 X, 1주일 관찰)
2. 1주일 후 문제 없으면 Railway 프로젝트 삭제

## 인증 정보
- GCP 프로젝트: modified-shape-477110-h8
- 리전: asia-northeast3
- Railway 소스 위치: 확인 필요 (GitHub repo 또는 Railway 프로젝트 내)
- `CREATIVE_PIPELINE_SECRET`: Vercel env에 있음
- `RAILWAY_API_SECRET`: 123455

## 주의
- DeepGaze PyTorch 모델은 메모리 많이 씀 → Cloud Run 메모리 4Gi 이상 설정
- Playwright 크롤러는 헤드리스 브라우저 → Cloud Run 메모리 2Gi 이상
- 이관 후 기존 Railway 서비스 바로 죽이지 말고 1주일 관찰
