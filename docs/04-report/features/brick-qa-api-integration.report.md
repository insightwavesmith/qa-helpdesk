# QA 보고서: bscamp + 브릭 API 통합 테스트

> 작성일: 2026-04-03
> 작성자: CTO팀 (QA)
> 대상: bscamp 작업 검증 + 브릭 API (localhost:3200)

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| 테스트 일시 | 2026-04-03 |
| 총 테스트 | 11건 (정상 8건 + 에러 케이스 4건 - 1건 중복) |
| PASS | 11건 (100%) |
| FAIL | 0건 |
| 환경 | localhost:3200 (브릭 API), GCP Cloud Scheduler (asia-northeast3) |

---

## Part 1: bscamp 작업 검증

### 1.1 top5-video-sync crontab 삭제

| 항목 | 결과 |
|------|------|
| 검증 방법 | `crontab -l` |
| 결과 | ✅ crontab 비어있음 — top5-video-sync 항목 없음 |

### 1.2 embed-creatives Scheduler 삭제

| 항목 | 결과 |
|------|------|
| 검증 방법 | `gcloud scheduler jobs list --location=asia-northeast3` |
| `bscamp-embed-creatives` (PAUSED) | ✅ 삭제 완료 |
| `bscamp-job-embed-creatives` (ENABLED) | ⚠️ 별도 job — 삭제 대상 아님 |

> 참고: `bscamp-embed-creatives`(PAUSED)와 `bscamp-job-embed-creatives`(ENABLED)는 다른 job. 사용자 지시는 전자(PAUSED) 삭제였으며 정상 처리됨.

### 1.3 saliency→scene-analysis 체인 연결

| 항목 | 결과 |
|------|------|
| 파일 | `src/app/api/cron/creative-saliency/route.ts` |
| import | ✅ `import { triggerNext } from "@/lib/pipeline-chain"` (line 15) |
| 체인 로직 | ✅ `triggerNext("video-scene-analysis")` (line 334) |
| 조건 | `chain=true && (syncUpdated > 0 \|\| hashReuseCount > 0)` |
| response | ✅ `chainTriggered` 필드 포함 |
| 커밋 | `589cc898` |

---

## Part 2: 브릭 API 통합 테스트 (localhost:3200)

### 정상 케이스 (8건)

| # | API | Method | Status | 결과 |
|---|-----|--------|--------|------|
| 1 | /api/brick/projects | POST | 201 | ✅ 프로젝트 생성 성공 (id=bscamp-qa-test) |
| 2 | /api/brick/projects | GET | 200 | ✅ 목록 조회 성공 (bscamp + bscamp-qa-test) |
| 3 | /api/brick/invariants?project_id=bscamp | GET | 200 | ✅ 불변식 11건 조회 성공 |
| 4 | /api/brick/executions | POST | 201 | ✅ 실행 시작 성공 (id=3, preset=t-pdca-l0, 블록: do→qa) |
| 5 | /api/brick/executions/3/blocks/do/complete | POST | 200 | ✅ 블록 완료 (do→completed, gate passed, next=qa) |
| 6 | /api/brick/approvals | POST | 200 | ✅ 승인 요청 생성 (status=waiting) |
| 7 | /api/brick/approve/3 | POST | 200 | ✅ 승인 성공 (status=approved) |
| 8 | /api/brick/reject/3 | POST | 200 | ✅ 반려 성공 (status=rejected, reason 포함) |

### 에러 케이스 (4건)

| # | 시나리오 | 기대 | 실제 | 결과 |
|---|---------|------|------|------|
| 9 | 중복 프로젝트 생성 | 409 | 409 | ✅ "이미 존재하는 프로젝트 ID" |
| 10 | 필수 파라미터 누락 (id 없이 생성) | 400 | 400 | ✅ "id, name 필수" |
| 11 | 존재하지 않는 실행 블록 완료 | 404 | 404 | ✅ "실행 없음" |
| 12 | 반려 사유 누락 | 400 | 400 | ✅ "반려 사유(reason) 필수" |

### API 스펙 참고사항

실제 라우트 코드 기반 필수 파라미터:

| API | 필수 파라미터 |
|-----|-------------|
| POST /projects | `id`, `name` |
| POST /executions | `presetId`, `feature` |
| POST /approvals | `execution_id`, `approver`, `timeout_at` |
| POST /approve/:executionId | (body 선택) |
| POST /reject/:executionId | `reason` (필수) |

---

## 결론

- bscamp 3건 작업: 전부 정상 반영 확인
- 브릭 API 11건 테스트: 전부 PASS (100%)
- CRUD + 워크플로우 실행 + 승인/반려 흐름 정상 동작
- 에러 핸들링 (409/400/404) 적절하게 구현됨
