# embed-creatives Cloud Run Job 전환 — Gap 분석

> 작성: 2026-03-30
> 설계서: docs/02-design/features/embed-creatives-job.design.md
> Plan: docs/01-plan/features/embed-creatives-job.plan.md
> 레벨: L2

## Match Rate: 95%

## 설계 vs 구현 매칭

| # | 설계 항목 | 구현 상태 | 일치 |
|---|----------|----------|------|
| 1 | scripts/lib/gemini-embed.mjs (inline_data + backoff) | ✅ 구현 완료 (~77줄) | ✅ |
| 2 | scripts/embed-creatives-job.mjs (Phase A + B + lock) | ✅ 구현 완료 (~217줄) | ✅ |
| 3 | src/lib/trigger-job.ts (메타데이터 토큰 + Jobs API) | ✅ 구현 완료 (~37줄) | ✅ |
| 4 | route.ts Phase 4-5 제거 | ✅ 제거 완료 | ✅ |
| 5 | route.ts chain=true Job 트리거 | ✅ 추가 완료 | ✅ |
| 6 | Advisory lock (pg_try_advisory_lock) | ✅ 구현 완료 | ✅ |
| 7 | 배치 루프 (50개 × N회, MAX_ITERATIONS=100) | ✅ 구현 완료 | ✅ |
| 8 | 진행률 로깅 포맷 | ✅ 설계서 3.4 포맷 일치 | ✅ |
| 9 | 429 exponential backoff (2s→4s→8s) | ✅ 구현 완료 | ✅ |
| 10 | TDD T1~T10 시나리오 | ✅ 12 테스트 전체 Green | ✅ |
| 11 | Cloud Run Job 배포 (gcloud 명령) | ⏳ 배포 후 실행 (문서화 완료) | 설계 범위 외 |
| 12 | Cloud Scheduler 전환 | ⏳ 배포 후 실행 (문서화 완료) | 설계 범위 외 |

## 검증 결과

- tsc --noEmit: 에러 0개
- npm run build: 성공
- vitest: 12/12 passed
- eslint src/: 변경 파일 에러 0개 (기존 ChainStatusBadge.tsx에 1건 — 이번 피처 무관)

## 미구현 항목 (의도적 제외)

| 항목 | 사유 |
|------|------|
| Cloud Run Job 배포 | 코드 구현 후 gcloud 명령으로 별도 실행 (인프라 작업) |
| Cloud Scheduler 전환 | 배포 + Job 수동 테스트 후 진행 |
| IAM 권한 바인딩 | 인프라 작업으로 별도 실행 |

## 결론

코드 구현 범위(S1, S2, S5) 100% 완료. 인프라 범위(S3, S4)는 배포 후 gcloud 명령어로 실행 예정.
설계서 명령어가 design.md 섹션 5~6에 문서화되어 있음.
