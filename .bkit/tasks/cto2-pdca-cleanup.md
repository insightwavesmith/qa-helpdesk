# TASK: PDCA 전체 정리

## 목표
pdca-status.json + Plan/Design 파일 전체 정리. 필요없는 것 삭제, 진행중인 것만 남기기.

## 1. pdca-status.json 정리

### 삭제 대상 (오염 + 완료)
- `helpers` — [do] 오염 피처 (plan/design 없음)
- `completed` 상태 피처 10개 — 완료됐으면 pdca-status에서 제거 (아카이브)
  - agent-ops-dashboard, agent-team-operations, pdca-chain-automation
  - agent-ops-platform-testing, agent-ops-review-issues, video-pipeline-dedup-fix
  - chain-automation-100, acp-plugin-sdk-research, agent-ops-hardening, agent-ops-hardening-p1

### 유지 대상 (진행중)
- `slack-notification` [implementing]
- `organic-channel-distribution-phase2` [implementing]
- `video-permission-skip` [implementing]
- `lp-analysis-pipeline` [plan]
- `protractor-ux-prescription` [plan]
- `video-collection-audit` [plan]
- `agent-harness-v2` [implementing]
- `embed-creatives-job` [designing]

## 2. Plan 파일 정리 (29개 미등록)

### 삭제 대상 — 테스트/임시 파일
```
test-chain-final, test-chain-v3, test-e2e-chain, test-webhook-chain, test-webhook-v2, trace-test, chain-test-a1, chain-verified
```

### 삭제 대상 — 이미 완료된 마이그레이션
```
gcp-full-migration, supabase-removal, vercel-removal, storage-gcs-migration
```

### 삭제 대상 — 더 이상 진행 안 하는 것
```
paperclip-dashboard-adoption, dashboard-chain-timestamp, chain-context-fix
```

### pdca-status.json에 등록 (진행중인 것)
```
agent-harness-v2 → [implementing]
embed-creatives-job → [implementing] (코드 구현 완료, 배포 대기)
```

### 보류 (Smith님 확인 필요)
```
creative-analysis-v2, protractor-refactoring, protractor-data-fix
prescription-system-v2, lp-media-download, deepgaze-gemini-pipeline
collection-v3, cron-stabilization, bm-full-account-sync, agent-ops-phase2
pdca-chain-matrix, agent-dashboard, dashboard-design
video-saliency-fix-verify
```
→ 이것들은 plan 파일만 있고 상태 불명확. 삭제 말고 `docs/01-plan/features/archive/`로 이동.

## 3. runtime/ 정리
- chain-status-*.json, task-state-*.json 전부 삭제 (테스트 잔재)
- coo-ack/, smith-report/, coo-answers/ 디렉토리 초기화

## 완료 기준
- pdca-status.json: 오염 0개, 진행중 피처만 남음
- test-* 파일 전부 삭제
- 완료된 Plan/Design 파일 archive/로 이동
- runtime/ 잔재 JSON 정리

## COO 의견
COO 의견은 하나의 의견일 뿐. 참고하되 최고의 방법을 찾아라.
