# Railway L2 시선 예측 서비스 설계서

## 1. 데이터 모델

### creative_saliency 테이블 (기존 — 변경 없음)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| ad_id | TEXT PK | 광고 소재 ID |
| account_id | TEXT | 광고 계정 ID |
| target_type | TEXT | "creative" |
| attention_map_url | TEXT | 히트맵 이미지 Storage URL |
| top_fixations | JSONB | 상위 5개 시선 고정점 [{x, y, rank, attention_pct}] |
| cta_attention_score | FLOAT | CTA 영역 주의력 점수 (0~1) |
| cognitive_load | TEXT | 인지 부하 (low/medium/high) |
| model_version | TEXT | "deepgaze-iie" |
| created_at | TIMESTAMPTZ | 생성 시각 |

## 2. API 설계

### POST /saliency
시선 예측 단독 실행.

**Request:**
```json
{
  "limit": 100,         // 선택, 기본 9999
  "accountId": "act_xxx" // 선택, 특정 계정만
}
```

**Response:**
```json
{
  "ok": true,
  "analyzed": 42,
  "errors": 1,
  "skipped": 57
}
```

**내부 동작:**
1. server.js가 `child_process.execFile('python3', ['saliency/predict.py', '--limit', N, '--account-id', id])` 호출
2. Python 스크립트가 stdout에 JSON 결과 출력
3. server.js가 JSON 파싱하여 응답

### POST /pipeline (변경)
기존: L1→L3→L4
변경: L1→L2→L3→L4

**L2 호출 조건:**
- L1 완료 후 실행
- IMAGE 소재만 대상 (L2 내부에서 필터링)
- L2 실패해도 L3→L4는 계속 진행 (L2는 optional)

## 3. 파일 구조

### 신규 파일
```
services/creative-pipeline/
├── saliency/
│   ├── predict.py         # L2 DeepGaze IIE 시선 예측 (CLI 모드)
│   └── requirements.txt   # Python 의존성
```

### 수정 파일
```
services/creative-pipeline/
├── server.js              # /saliency 엔드포인트 + /pipeline L2 추가
├── Dockerfile             # Node + Python + PyTorch CPU 멀티런타임
```

## 4. saliency/predict.py 설계

기존 `scripts/saliency-predict.py`를 서비스용으로 변환:

### 변경점
| 항목 | scripts/ 버전 | services/ 버전 |
|------|-------------|---------------|
| 환경변수 | .env.local 로드 | process.env 직접 사용 (Docker) |
| Supabase | Python SDK | REST API (requests) |
| 출력 | print 로그 | stdout JSON (server.js가 파싱) |
| CLI | --limit, --account-id | 동일 |
| 모델 캐시 | ~/.cache | /app/.cache (Docker volume) |

### 출력 형식 (stdout)
```json
{"ok": true, "analyzed": 42, "errors": 1, "skipped": 57}
```
- 로그는 stderr로 출력 (server.js에서 분리)
- 최종 결과만 stdout의 마지막 줄에 JSON으로 출력

## 5. Dockerfile 설계

```dockerfile
# Stage 1: Python 의존성 (캐시 레이어)
FROM python:3.11-slim AS python-deps
COPY saliency/requirements.txt /tmp/
RUN pip install --no-cache-dir --target=/deps -r /tmp/requirements.txt

# Stage 2: 런타임
FROM node:20-slim
# Python 설치
RUN apt-get update && apt-get install -y python3 python3-distutils --no-install-recommends && rm -rf /var/lib/apt/lists/*
# Python 패키지 복사
COPY --from=python-deps /deps /usr/local/lib/python3.11/dist-packages
ENV PYTHONPATH=/usr/local/lib/python3.11/dist-packages

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

**이미지 크기 최소화 전략:**
- PyTorch CPU-only wheel (`--extra-index-url https://download.pytorch.org/whl/cpu`)
- Multi-stage build (빌드 도구 제외)
- `--no-cache-dir` pip 옵션
- `--no-install-recommends` apt 옵션

## 6. 에러 처리

| 상황 | 처리 |
|------|------|
| Python 미설치 | /health에서 Python 버전 체크, 경고 로그 |
| 모델 다운로드 실패 | 재시도 1회, 실패 시 에러 응답 |
| 이미지 다운로드 실패 | 해당 소재 skip, errors 카운트 증가 |
| child_process 타임아웃 | 30분 타임아웃 설정 (배치 처리 고려) |
| L2 실패 시 /pipeline | L2 에러 로그 후 L3→L4 계속 진행 |

## 7. 구현 순서

- [x] T1: Plan/Design 문서 작성
- [ ] T2: `saliency/predict.py` + `requirements.txt` 작성
- [ ] T3: Dockerfile 멀티런타임 변경
- [ ] T4: server.js `/saliency` 엔드포인트 + `/pipeline` L2 추가
- [ ] T5: tsc + build 검증
- [ ] T6: Gap 분석 + .pdca-status.json 업데이트
