# TASK: Creative Intelligence 파이프라인 Railway 배포

## 고객 관점
새 광고 소재가 수집될 때마다 자동으로 분석(요소 태깅 + 벤치마크 + 점수)이 돌아가야 한다.
지금은 로컬에서 수동 실행 → Railway 서버에서 자동 실행으로 전환.

## 현재 구조
- LP 크롤러: `bscamp-crawler` Railway 프로젝트에 이미 배포됨 (Express + Playwright)
- 분석 스크립트 3개: `scripts/analyze-creatives.mjs`, `scripts/compute-benchmarks.mjs`, `scripts/score-creatives.mjs`
- 전부 Node.js, 외부 의존성 = Gemini API + Supabase만

## 요구사항

### 1. Express 서버 (새 Railway 서비스)
`services/creative-pipeline/` 디렉토리에 별도 서비스로 구성:

```
services/creative-pipeline/
├── Dockerfile
├── package.json
├── server.js          # Express 엔트리포인트
├── analyze.mjs        # L1: 소재 요소 태깅 (Gemini 2.5 Pro)
├── benchmark.mjs      # L3: 요소별 성과 벤치마크
└── score.mjs          # L4: 종합 점수 + 제안
```

### 2. API 엔드포인트
- `POST /analyze` — 소재 요소 태깅 실행 (옵션: `{ limit, accountId }`)
- `POST /benchmark` — 벤치마크 계산 실행
- `POST /score` — 종합 점수 + 제안 생성
- `POST /pipeline` — L1→L3→L4 전체 파이프라인 순차 실행
- `GET /health` — 헬스체크

### 3. 인증
- `X-API-SECRET` 헤더 (bscamp-crawler와 동일 방식)

### 4. collect-daily 연동
- `src/app/api/admin/collect-daily/route.ts` 수정
- 새 광고 수집 완료 후 → Railway `/pipeline` 호출 추가
- 환경변수: `CREATIVE_PIPELINE_URL`, `CREATIVE_PIPELINE_SECRET`

### 5. 환경변수 (Railway에 설정)
- `GEMINI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `API_SECRET`

### 6. Dockerfile
- `node:20-slim` 기반
- 무거운 의존성 없음 (Playwright 불필요)

## 참고
- 기존 LP 크롤러 구조 참고: `/Users/smith/projects/bscamp-crawler/`
- 현재 스크립트: `scripts/analyze-creatives.mjs` (L1), `scripts/compute-benchmarks.mjs` (L3), `scripts/score-creatives.mjs` (L4)
- 스크립트에서 .env.local 로딩 부분 → 환경변수 직접 참조로 변경

## 제약
- 기존 `src/` 코드는 collect-daily 연동 부분만 수정
- 기존 스크립트 로직 그대로 가져오되, .env.local 파싱 → `process.env` 직접 사용으로 변경
- L2(시선 예측)는 PyTorch 필요해서 Railway에 안 올림 (로컬 전용)
- `feat/creative-pipeline` 브랜치에서 작업

## 완료 조건
- [ ] `services/creative-pipeline/` 서비스 코드 완성
- [ ] Dockerfile + package.json
- [ ] collect-daily에서 파이프라인 호출 코드 추가
- [ ] tsc + build 통과
- [ ] 커밋 (feat: Creative Intelligence 파이프라인 Railway 서비스)
