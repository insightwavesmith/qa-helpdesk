# TASK: Railway L2 시선 예측 서비스 추가 + 초기 배치 실행

## 고객 관점
소재 분석 파이프라인이 L1(태깅)+L3(벤치마크)+L4(점수)만 있고, L2(시선 예측)가 빠져있다.
L2도 Railway에서 자동으로 돌아가야 하고, 초기 데이터 835건 배치 분석도 실행해야 한다.

## 현재 구조
- `services/creative-pipeline/` — L1+L3+L4 Railway 서비스 이미 완성 (커밋 `ceb54b0`, main merge 완료)
- `scripts/saliency-predict.py` — L2 시선 예측 로컬 스크립트 (DeepGaze IIE, PyTorch)
- Railway에 아직 서비스 생성/배포 안 됨 (코드만 있음)

## 요구사항

### 1. L2 시선 예측을 creative-pipeline에 추가
`services/creative-pipeline/` 에 Python 기반 L2 추가:

```
services/creative-pipeline/
├── saliency/
│   ├── predict.py        # L2: DeepGaze IIE 시선 예측
│   └── requirements.txt  # PyTorch + DeepGaze 의존성
```

- `POST /saliency` 엔드포인트 추가 (server.js에서 Python subprocess 호출 or 별도 Python 서버)
- 옵션 A: Python Flask 별도 서비스로 분리 (`services/creative-saliency/`)
- 옵션 B: Node server.js에서 child_process로 Python 호출
- **판단해서 더 나은 쪽 선택** (Docker 이미지 크기, 메모리, 배포 편의성 고려)

### 2. Dockerfile 수정
- PyTorch CPU 버전 포함 (GPU 불필요, Railway는 CPU만)
- `torch` + `torchvision` + `deepgaze_pytorch` 등 설치
- 이미지 크기 최소화 (PyTorch CPU-only wheel 사용)

### 3. `/pipeline` 엔드포인트 확장
현재: L1→L3→L4 순차
변경: L1→L2→L3→L4 순차 (L2는 IMAGE만 대상, 느려도 OK)

### 4. 초기 배치 실행
Railway 배포 완료 후, `/pipeline` 호출로 기존 835건 초기 배치 실행.
- 혹은 Railway 배포 전에 로컬에서 먼저 실행해도 됨
- L1 분석 → L2 시선 예측 → L3 벤치마크 → L4 점수 순서

### 5. Railway 실제 배포
- Railway CLI 또는 대시보드로 서비스 생성
- 환경변수 설정: `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `API_SECRET`
- Vercel에 `CREATIVE_PIPELINE_URL`, `CREATIVE_PIPELINE_SECRET` 환경변수 추가

## 참고
- 기존 LP 크롤러: `/Users/smith/projects/bscamp-crawler/` (Railway 배포 구조 참고)
- L2 로컬 스크립트: `scripts/saliency-predict.py` (로직 참고)
- L2 의존성: `scripts/requirements-saliency.txt`
- 현재 creative-pipeline 코드: `services/creative-pipeline/`

## 제약
- `src/` 코드는 최소 수정 (collect-daily 연동 부분 이미 완료)
- DeepGaze IIE 모델은 첫 실행 시 자동 다운로드됨 (캐시 설정 필요)
- Railway 무료 플랜 제한 고려 (메모리 512MB~8GB)
- PyTorch CPU 이미지 크기 주의 (slim 빌드)

## 완료 조건
- [ ] L2 시선 예측 서비스 코드 완성
- [ ] Dockerfile에 Python + PyTorch 포함
- [ ] `/pipeline`에 L2 포함
- [ ] tsc + build 통과
- [ ] Railway 배포 (서비스 생성 + 환경변수 + 배포 확인)
- [ ] 초기 배치 835건 실행 (or 실행 시작)
- [ ] 커밋 + push
