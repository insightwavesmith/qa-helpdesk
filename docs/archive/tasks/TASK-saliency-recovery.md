# TASK: L2 Saliency 배치 멈춤 복구 + 미디어 Storage 자사만 진행

## 증상 1: L2 시선 예측 배치 멈춤
- `creative_saliency` 테이블: 1,045건에서 진전 없음
- 배치 트리거 프로세스 3개 살아있지만 (PID 26451, 32379, 39624) 진행 안 됨
- Railway creative-pipeline 서버 문제 추정

### 확인할 것
1. Railway creative-pipeline (sparkling-compassion) 서비스 상태 확인
2. `/saliency` 엔드포인트 직접 호출해서 응답 확인: `curl https://creative-pipeline-production.up.railway.app/health`
3. Railway 로그 확인 — OOM, 크래시 여부
4. 필요하면 Railway 재배포 또는 코드 수정

### 완료 조건
- saliency 배치가 다시 진행되어야 함 (1,045 → 증가)
- 배치 트리거 스크립트가 정상 동작 확인

## 증상 2: 미디어 Storage 자사만 먼저 저장
- 현재: `ad_creative_embeddings` 3,096건 중 174건만 storage_url 있음 (6%)
- 경쟁사 소재: Meta CDN URL 만료돼서 다운로드 불가 → **스킵**
- **자사 소재만 먼저** Supabase Storage에 저장 진행

### 확인할 것
1. `persist-media` 스크립트에서 자사/경쟁사 구분 로직 확인
2. 자사 소재만 필터링해서 배치 돌리기
3. 경쟁사는 나중에 검색 시점 캐싱으로 처리 (별도 TASK)

### 완료 조건
- 자사 소재 storage_url 비율 대폭 증가
- 경쟁사 소재는 건드리지 않음

## 참고
- Railway creative-pipeline: `sparkling-compassion`, Service ID `99d09062-df98-44d2-8746-5a9f1d881531`
- Railway API_SECRET: `creative-pipeline-2026`
- Railway domain: `creative-pipeline-production.up.railway.app`
- Supabase project: `symvlrsmkjlztoopbnht`
- persist-media 스크립트: `scripts/persist-media.mjs`
- saliency 트리거: `scripts/trigger-saliency-batch.mjs`
