# Creative Intelligence 파이프라인 Railway 배포 — Plan

## 배경
광고 소재 분석 파이프라인(요소 태깅 L1 → 벤치마크 L3 → 점수+제안 L4)이 로컬 수동 실행 상태.
새 광고 수집(collect-daily) 완료 후 자동으로 분석이 돌아가야 한다.

## 범위
1. `services/creative-pipeline/` 독립 Express 서비스 생성
2. 기존 3개 스크립트 로직을 모듈화하여 포팅
3. `collect-daily` cron에서 파이프라인 호출 연동

## 범위 밖
- L2(시선 예측) — PyTorch 필요, Railway 미배포
- 기존 `src/` 소스 대폭 변경

## 성공 기준
- `POST /pipeline` 호출 시 L1→L3→L4 순차 실행 성공
- `GET /health` 헬스체크 응답
- `X-API-SECRET` 인증 동작
- collect-daily 완료 후 파이프라인 자동 트리거
- tsc + build 통과

## 관련 파일
- `scripts/analyze-creatives.mjs` (L1)
- `scripts/compute-benchmarks.mjs` (L3)
- `scripts/score-creatives.mjs` (L4)
- `src/app/api/cron/collect-daily/route.ts`
- `/Users/smith/projects/bscamp-crawler/server.js` (참고: 인증 패턴)

## 의존성
- Gemini API (2.5 Pro)
- Supabase (REST API)
- Railway 배포 환경

## 리스크
- Gemini API rate limit (500ms/1s 딜레이로 대응)
- Railway 서비스 cold start (health endpoint로 모니터링)
