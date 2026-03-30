# embed-creatives Cloud Run Job 전환 Plan

> 작성: 2026-03-30
> 레벨: L2 (src/ 수정 + 인프라 변경)

## 배경
- embed-creatives 크론이 Cloud Run Service 540초 제한으로 504 타임아웃 발생
- `embedMissingCreatives(50)` 호출이 1회뿐 — 배치 루프 없음
- 미임베딩 409건 적체 중 (3,166/3,575 = 88.6%)
- Cloud Scheduler 독립 스케줄 code:13 오류 지속

## 범위
- **S1**: embed-creatives 전체를 Cloud Run Job 스크립트로 전환 (`scripts/embed-creatives-job.mjs`)
- **S2**: 배치 루프 구현 (50개씩 × N회, 전체 처리 완료까지 반복)
- **S3**: Cloud Scheduler → Job 트리거로 변경
- **S4**: 체인 트리거 호환 (HTTP 엔드포인트 → Job 실행 프록시)
- **S5**: TDD 핵심 시나리오 작성

## 범위 외
- Phase 1-3 (Meta API 수집 + upsert) 로직 변경 — 현행 유지
- Gemini 모델 변경 / 임베딩 차원 변경
- 기존 Cloud Run Jobs의 code:7 오류 수정 (IAM 별건)
- `ad_creative_embeddings` 레거시 테이블 정리

## 성공 기준
1. Job 실행으로 409건 미임베딩 전량 처리 완료
2. 540초 이상 실행 가능 (타임아웃 없음)
3. 배치 진행률 로깅 (Cloud Logging에서 확인 가능)
4. Scheduler가 Job을 정상 트리거 (code:13 해소)
5. 체인 트리거(process-media → embed-creatives)가 Job 실행으로 연결
6. `npm run build` 성공
