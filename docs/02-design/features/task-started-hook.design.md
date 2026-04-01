# TaskStarted Hook Design

> 작성일: 2026-04-01
> 프로세스 레벨: L2-기능
> Plan: docs/01-plan/features/task-started-hook.plan.md

---

## 1. 아키텍처

```
TaskCreated 이벤트 (Claude Code 내장)
    │
    ├─→ notify-task-started.sh (Slack 3중 전송)
    │     ├── 채널 (C0AN7ATS4DD)
    │     ├── Smith님 DM (D09V1NX98SK)
    │     └── COO webhook (localhost:18789)
    │
    └─→ task-started-db-update.sh (DB 상태 업데이트)
          └── .bkit/runtime/task-state-{feature}.json → in_progress
```

---

## 2. notify-task-started.sh 상세

### 2.1 이벤트 수신

```bash
INPUT=$(cat 2>/dev/null || true)
# JSON 필드: task_id, task_subject, task_description, teammate_name, team_name
```

### 2.2 TASK 정보 추출

`python3`로 stdin JSON 파싱 (notify-completion.sh 동일 패턴):
- `TASK_SUBJECT`: `task_subject` 필드. 없으면 "TASK 시작"
- `TEAMMATE_NAME`: `teammate_name` 필드. 없으면 "unknown"
- `TEAM_NAME`: `team_name` 필드. 없으면 tmux session name

### 2.3 메시지 포맷

```
🚀 [TaskStarted] {TEAM_NAME}: {TASK_SUBJECT} | 담당: {TEAMMATE_NAME}
```

L0 긴급 시:
```
🚨 [긴급 TaskStarted] {TEAM_NAME}: {TASK_SUBJECT} | 담당: {TEAMMATE_NAME}
```

### 2.4 3중 전송

`notify-completion.sh`의 `send_slack()`, `send_webhook()` 패턴 동일 적용:
- `SLACK_CHANNEL="C0AN7ATS4DD"`
- `SMITH_DM="D09V1NX98SK"`
- `WEBHOOK_URL="${COO_WEBHOOK_URL:-http://localhost:18789}"`
- `SLACK_BOT_TOKEN` 환경변수 필수
- 각 전송 독립 실행 (하나 실패해도 나머지 진행)
- 실패 시 `.bkit/runtime/error-log.json`에 기록

### 2.5 DRY_RUN 지원

```bash
DRY_RUN=true              # 전체 dry run
DRY_RUN_CHANNEL_FAIL=true # 채널 실패 시뮬레이션
DRY_RUN_DM_FAIL=true      # DM 실패 시뮬레이션
DRY_RUN_WEBHOOK_FAIL=true # webhook 실패 시뮬레이션
```

### 2.6 EXIT trap (block-logger)

```bash
# Block logger: 차단(exit 2) 시 자동 기록
_bl_trap() { local e=$?; [ "$e" = "2" ] && source "$(dirname "$0")/helpers/block-logger.sh" 2>/dev/null && log_block "차단" "notify-task-started" "${COMMAND:-unknown}" 2>/dev/null; exit $e; }
trap _bl_trap EXIT
```

### 2.7 종료 코드

항상 `exit 0` — 알림 실패가 작업을 차단하면 안 됨.

---

## 3. task-started-db-update.sh 상세

### 3.1 동작

1. stdin JSON에서 `task_subject` 추출
2. `task_subject`에서 feature 이름 추론 (TASK_NAME 환경변수 우선)
3. `.bkit/runtime/task-state-{feature}.json` 파일 업데이트:
   - `status: "in_progress"`
   - `started_at: {ISO 8601}`
   - `teammate: {teammate_name}`
4. `.bkit/state/pdca-status.json` 업데이트:
   - 해당 feature의 `phase: "do"`, `doStartedAt: {ISO 8601}`

### 3.2 JSON 업데이트 방식

`python3` 인라인 스크립트로 JSON 읽기/쓰기 (jq 미설치 환경 대응):

```bash
python3 -c "
import json, sys, os
from datetime import datetime, timezone

state_file = sys.argv[1]
feature = sys.argv[2]
teammate = sys.argv[3]

data = {}
if os.path.exists(state_file):
    with open(state_file) as f:
        data = json.load(f)

data['status'] = 'in_progress'
data['started_at'] = datetime.now(timezone.utc).isoformat()
data['teammate'] = teammate

with open(state_file, 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
" "$STATE_FILE" "$FEATURE" "$TEAMMATE"
```

### 3.3 EXIT trap + 종료 코드

block-logger EXIT trap 포함. 항상 `exit 0`.

---

## 4. settings.local.json 변경

현재 `TaskCreated` 이벤트 없음. 추가:

```json
"TaskCreated": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "bash /Users/smith/projects/bscamp/.bkit/hooks/notify-task-started.sh",
        "timeout": 10000
      },
      {
        "type": "command",
        "command": "bash /Users/smith/projects/bscamp/.bkit/hooks/task-started-db-update.sh",
        "timeout": 5000
      }
    ]
  }
]
```

**삽입 위치**: `TaskCompleted` 배열 앞 (알파벳 순서).

---

## 5. TDD 케이스 (Gap 100% 기준)

### Slack 전송

| ID | 테스트 | 예상 결과 |
|----|--------|----------|
| TS-01 | DRY_RUN=true로 notify-task-started.sh 실행, stdin에 유효 JSON | stdout에 `[DRY_RUN]` 3줄 (channel, DM, webhook) |
| TS-02 | DRY_RUN=true + DRY_RUN_CHANNEL_FAIL=true | channel:failed, dm:ok, webhook:ok |
| TS-03 | DRY_RUN=true + DRY_RUN_DM_FAIL=true | channel:ok, dm:failed, webhook:ok |
| TS-04 | DRY_RUN=true + DRY_RUN_WEBHOOK_FAIL=true | channel:ok, dm:ok, webhook:failed |
| TS-05 | SLACK_BOT_TOKEN 없이 실행 | 3개 모두 skipped, exit 0 |
| TS-06 | stdin JSON에 task_subject 없음 | 메시지에 "TASK 시작" 기본값 |
| TS-07 | TASK_LEVEL=L0 환경변수 | 메시지에 "🚨 [긴급 TaskStarted]" 접두사 |
| TS-08 | stdin JSON에 teammate_name 있음 | 메시지에 "담당: {name}" 포함 |

### DB 업데이트

| ID | 테스트 | 예상 결과 |
|----|--------|----------|
| TS-09 | task-started-db-update.sh 실행, TASK_NAME=test-feature | `.bkit/runtime/task-state-test-feature.json` 생성, status=in_progress |
| TS-10 | 기존 task-state JSON 있을 때 실행 | status 덮어쓰기, started_at 갱신 |
| TS-11 | teammate_name 포함 JSON 입력 | teammate 필드 기록 |
| TS-12 | pdca-status.json 업데이트 확인 | phase=do, doStartedAt 기록 |

### settings.local.json 등록

| ID | 테스트 | 예상 결과 |
|----|--------|----------|
| TS-13 | settings.local.json에 TaskCreated 키 존재 | hooks 배열에 2개 hook 등록 |
| TS-14 | TaskCreated hook 순서 | notify-task-started → task-started-db-update |

### 통합

| ID | 테스트 | 예상 결과 |
|----|--------|----------|
| TS-15 | hook이 exit 0 반환 | 어떤 상황에서도 exit 0 (작업 차단 금지) |
| TS-16 | block-logger EXIT trap 존재 | 스크립트에 `_bl_trap` 함수 + `trap _bl_trap EXIT` 패턴 |
