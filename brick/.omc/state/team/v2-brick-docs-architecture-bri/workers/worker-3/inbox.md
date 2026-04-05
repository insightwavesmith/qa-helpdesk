## REQUIRED: Task Lifecycle Commands
You MUST run these commands. Do NOT skip any step.

1. Claim your task:
   omc team api claim-task --input '{"team_name":"v2-brick-docs-architecture-bri","task_id":"3","worker":"worker-3"}' --json
   Save the claim_token from the response.
2. Do the work described below.
3. On completion (use claim_token from step 1):
   omc team api transition-task-status --input '{"team_name":"v2-brick-docs-architecture-bri","task_id":"3","from":"in_progress","to":"completed","claim_token":"<claim_token>"}' --json
4. On failure (use claim_token from step 1):
   omc team api transition-task-status --input '{"team_name":"v2-brick-docs-architecture-bri","task_id":"3","from":"in_progress","to":"failed","claim_token":"<claim_token>"}' --json
5. ACK/progress replies are not a stop signal. Keep executing your assigned or next feasible work until the task is actually complete or failed, then transition and exit.

## Task Assignment
Task ID: 3
Worker: worker-3
Subject: Worker 3: 브릭 엔진 v2 아키텍처 리뷰. brick/docs/architecture-brick-engine-v2.md 읽고 검토해라. 

브릭 엔진 v2 아키텍처 리뷰. brick/docs/architecture-brick-engine-v2.md 읽고 검토해라. 1) 모듈 분리 적절한가 2) ArtifactManager 설계 맞는가 3) 확장성 빠진 것 없는가 4) 구현 Phase 순서 맞는가 5) 놓친 구조 문제. 결과를 brick/docs/architecture-review-omc.md에 작성

REMINDER: You MUST run transition-task-status before exiting. Do NOT write done.json or edit task files directly.