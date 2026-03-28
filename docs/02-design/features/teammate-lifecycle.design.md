# 팀원 생명주기 관리 설계서

> **통합 예정 → `agent-team-operations.design.md`로 통합. 이 파일은 이력 보존용.**

> 작성일: 2026-03-28
> Plan: docs/01-plan/features/teammate-lifecycle.plan.md
> 상태: ~~Design~~ → Archived (통합 예정)

---

## 1. 데이터 모델

### 1-1. teammate-registry.json 스키마

**경로**: `.claude/runtime/teammate-registry.json`

```typescript
interface TeammateRegistry {
  team: string;                    // TeamCreate 시 지정한 팀 이름
  createdAt: string;               // ISO 8601
  updatedAt: string;               // ISO 8601
  shutdownState: ShutdownState;    // 전체 팀 종료 상태
  members: Record<string, TeammateEntry>;
}

type ShutdownState = 'running' | 'shutdown_initiated' | 'force_killing' | 'cleanup' | 'done';

interface TeammateEntry {
  state: 'spawning' | 'active' | 'idle' | 'shutdown_pending' | 'terminated';
  paneId: string;                  // tmux pane ID (예: "%29")
  spawnedAt: string;               // ISO 8601
  lastActiveAt: string | null;     // 마지막 활동 시각
  terminatedAt: string | null;     // 종료 시각
  terminatedBy: 'shutdown_approved' | 'force_kill' | 'pane_dead' | null;
  tasksCompleted: number;          // 완료한 TASK 수
  model: string;                   // 사용 모델 (opus/sonnet)
}
```

### 1-2. 상태 전이도

```
spawning ──→ active ──→ idle ──→ shutdown_pending ──→ terminated
                │         │              │
                └─→ idle ─┘              │
                                         ├── shutdown_approved (정상)
                                         ├── force_kill (강제)
                                         └── pane_dead (이미 종료)
```

**전이 트리거**:
| 현재 → 다음 | 트리거 |
|-------------|--------|
| spawning → active | 팀원 첫 메시지 수신 |
| active → idle | TeammateIdle 이벤트 |
| idle → active | SendMessage 수신 |
| idle → shutdown_pending | auto-shutdown Stage 1 시작 |
| active → shutdown_pending | auto-shutdown Stage 1 시작 |
| shutdown_pending → terminated | shutdown_approved 또는 force_kill |

---

## 2. auto-shutdown.sh 설계

**경로**: `.claude/hooks/auto-shutdown.sh`
**이벤트**: 리더가 직접 호출 (bash 명령) 또는 auto-team-cleanup.sh에서 호출
**역할**: 3단계 Graceful Shutdown 오케스트레이터

### 2-1. 입력/출력

```
입력:
  $1 = team-name (선택, 미지정 시 .claude/runtime/teammate-registry.json에서 자동 감지)

출력:
  exit 0 = 전원 종료 완료
  exit 1 = 일부 종료 실패 (에러)

부수효과:
  - teammate-registry.json 갱신
  - tmux pane 종료
  - docs/.pdca-status.json updatedAt 갱신
```

### 2-2. 로직 (의사코드)

```bash
#!/bin/bash
# auto-shutdown.sh — 3단계 Graceful Shutdown

# 팀원은 이 스크립트 실행 불가
source is-teammate.sh
[ "$IS_TEAMMATE" = "true" ] && exit 0

REGISTRY=".claude/runtime/teammate-registry.json"

# --- Stage 0: 레지스트리 로드 ---
# 레지스트리 없으면 config.json에서 팀원 목록 추출하여 생성
if [ ! -f "$REGISTRY" ]; then
    build_registry_from_config  # config.json → registry 변환
fi

# shutdownState를 "shutdown_initiated"로 갱신
jq '.shutdownState = "shutdown_initiated"' "$REGISTRY" > tmp && mv tmp "$REGISTRY"

# 활성 팀원 목록 (state != "terminated")
ACTIVE_MEMBERS=$(jq -r '.members | to_entries[] | select(.value.state != "terminated") | .key' "$REGISTRY")

[ -z "$ACTIVE_MEMBERS" ] && cleanup_and_exit  # 이미 전원 종료

# --- Stage 1: Graceful Shutdown (10초 타임아웃) ---
for member in $ACTIVE_MEMBERS; do
    set_member_state "$member" "shutdown_pending"
    # 리더가 SendMessage로 shutdown_request 보내야 함 → 이건 스크립트에서 직접 불가
    # 대신: 팀원 상태를 shutdown_pending으로 마킹
    #       → teammate-idle.sh가 이 상태를 감지하고 exit 0으로 종료 유도
done

echo "[auto-shutdown] Stage 1: ${#ACTIVE_MEMBERS[@]}명에게 종료 요청. 10초 대기..."
sleep 10

# --- Stage 2: Force Kill (미종료 팀원) ---
jq '.shutdownState = "force_killing"' "$REGISTRY" > tmp && mv tmp "$REGISTRY"

STILL_ACTIVE=$(jq -r '.members | to_entries[] | select(.value.state == "shutdown_pending") | .key' "$REGISTRY")

for member in $STILL_ACTIVE; do
    PANE_ID=$(jq -r --arg m "$member" '.members[$m].paneId' "$REGISTRY")

    if [ -n "$PANE_ID" ] && tmux kill-pane -t "$PANE_ID" 2>/dev/null; then
        set_member_state "$member" "terminated"
        set_member_terminated_by "$member" "force_kill"
        echo "[auto-shutdown] Stage 2: $member force-killed (pane $PANE_ID)"
    else
        set_member_state "$member" "terminated"
        set_member_terminated_by "$member" "pane_dead"
        echo "[auto-shutdown] Stage 2: $member pane already dead"
    fi
done

# --- Stage 3: Cleanup ---
jq '.shutdownState = "cleanup"' "$REGISTRY" > tmp && mv tmp "$REGISTRY"

# PDCA 상태 갱신 (TeamDelete hook 통과용)
PDCA_FILE="docs/.pdca-status.json"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S")
jq --arg t "$NOW" '."_lastUpdated" = $t | .updatedAt = $t' "$PDCA_FILE" > tmp && mv tmp "$PDCA_FILE"

# 최종 상태
jq '.shutdownState = "done"' "$REGISTRY" > tmp && mv tmp "$REGISTRY"

echo "[auto-shutdown] 완료. 전원 종료됨. TeamDelete 실행 가능."
# macOS 알림
osascript -e 'display notification "전원 종료 완료. TeamDelete 가능." with title "auto-shutdown"' 2>/dev/null || true

exit 0
```

### 2-3. 헬퍼 함수

```bash
set_member_state() {
    local member="$1" state="$2"
    jq --arg m "$member" --arg s "$state" \
       '.members[$m].state = $s' "$REGISTRY" > tmp && mv tmp "$REGISTRY"
}

set_member_terminated_by() {
    local member="$1" by="$2"
    local now=$(date -u +"%Y-%m-%dT%H:%M:%S")
    jq --arg m "$member" --arg b "$by" --arg t "$now" \
       '.members[$m].terminatedBy = $b | .members[$m].terminatedAt = $t' \
       "$REGISTRY" > tmp && mv tmp "$REGISTRY"
}

build_registry_from_config() {
    local config=$(ls -t ~/.claude/teams/*/config.json 2>/dev/null | head -1)
    [ -z "$config" ] && return

    local team=$(jq -r '.name' "$config")
    local now=$(date -u +"%Y-%m-%dT%H:%M:%S")

    jq -n --arg t "$team" --arg now "$now" \
       --argjson members "$(jq '[.members[] | select(.name != "team-lead") | {
           key: .name,
           value: {
               state: "active",
               paneId: .tmuxPaneId,
               spawnedAt: (.joinedAt | tostring),
               lastActiveAt: null,
               terminatedAt: null,
               terminatedBy: null,
               tasksCompleted: 0,
               model: .model
           }
       }] | from_entries' "$config")" \
       '{team: $t, createdAt: $now, updatedAt: $now, shutdownState: "running", members: $members}' \
       > "$REGISTRY"
}

cleanup_and_exit() {
    jq '.shutdownState = "done"' "$REGISTRY" > tmp && mv tmp "$REGISTRY"
    echo "[auto-shutdown] 활성 팀원 없음. 정리 완료."
    exit 0
}
```

---

## 3. teammate-idle.sh — 비활성 유지

**TeammateIdle hook은 비활성(빈 배열) 상태를 유지한다.**

작업 배정은 리더가 SendMessage로 직접 수행하며, 종료는 auto-shutdown.sh가 담당한다.
teammate-idle.sh 수정 불필요. settings.local.json의 `"TeammateIdle": []`도 변경 없음.

**이유**:
1. Hook 기반 자동 배정은 크로스팀 TASK 충돌의 근본 원인 (2026-03-25 사고)
2. 비활성화로 문제가 완전히 해결된 상태
3. 팀원은 idle 시 자연스럽게 SendMessage를 대기 — Claude Code의 네이티브 동작

---

## 4. auto-team-cleanup.sh 개선

### 4-1. 변경 내용

```bash
# 기존: 알림만 하고 exit 0
# 개선: auto-shutdown.sh 자동 호출

if [ "$UNCHECKED_COUNT" -eq 0 ]; then
    echo "✅ 모든 TASK 완료. 자동 종료 시작..."

    # auto-shutdown.sh 호출 (백그라운드, 리더 차단 방지)
    bash "$(dirname "$0")/auto-shutdown.sh" &

    # macOS 알림
    osascript -e 'display notification "모든 TASK 완료 — 자동 종료 시작" with title "auto-shutdown"' 2>/dev/null || true

    exit 0
fi
```

---

## 5. force-team-kill.sh 개선

### 5-1. 레지스트리 갱신 추가

기존 로직은 유지하되, pane kill 후 레지스트리도 함께 갱신:

```bash
# 기존: isActive=false만 변경
# 추가: teammate-registry.json도 갱신

REGISTRY="$PROJECT_DIR/.claude/runtime/teammate-registry.json"

if [ -f "$REGISTRY" ]; then
    NOW=$(date -u +"%Y-%m-%dT%H:%M:%S")
    jq --arg m "$MEMBER_NAME" --arg t "$NOW" \
       '.members[$m].state = "terminated" | .members[$m].terminatedBy = "force_kill" | .members[$m].terminatedAt = $t' \
       "$REGISTRY" > "${REGISTRY}.tmp" && mv "${REGISTRY}.tmp" "$REGISTRY"
fi
```

### 5-2. 리더 보호

```bash
# pane_index 0 (리더)은 절대 kill하지 않음
LEADER_PANE=$(tmux display-message -p '#{pane_index}' 2>/dev/null)
if [ "$LEADER_PANE" = "0" ] && [ "$PANE_ID" = "$(tmux display-message -p '#{pane_id}' 2>/dev/null)" ]; then
    echo "  [BLOCK] 리더 pane은 kill 불가"
    continue
fi
```

---

## 6. settings.local.json 변경

### 6-1. TeammateIdle 비활성 유지

```json
"TeammateIdle": []
```

> 변경 없음. 현재 비활성 상태가 올바른 설정. 작업 배정은 리더 SendMessage로 수행.

### 6-2. TaskCompleted에 auto-shutdown은 등록하지 않음

auto-shutdown은 auto-team-cleanup.sh 내부에서 호출. 별도 등록 불필요.

---

## 7. 구현 순서 체크리스트

### Wave 1: 핵심 (파일 3개)

```
□ W1-1: .claude/runtime/teammate-registry.json 생성 로직
        → auto-shutdown.sh의 build_registry_from_config() 함수
□ W1-2: .claude/hooks/auto-shutdown.sh 신규 작성
        → 3단계 프로토콜 전체
        → 헬퍼 함수 포함
□ W1-3: .claude/hooks/force-team-kill.sh 개선
        → 레지스트리 갱신 추가
        → 리더 보호 로직 추가
```

### Wave 2: 통합 (파일 3개)

```
□ W2-1: .claude/hooks/auto-team-cleanup.sh 개선
        → auto-shutdown.sh 호출 추가
□ W2-2: .claude/settings.local.json 확인
        → TeammateIdle 비활성(빈 배열) 유지 확인
```

### Wave 3: 검증

```
□ W3-1: 수동 테스트 — 팀 생성 → 작업 → auto-shutdown 전체 플로우
□ W3-2: tmux list-panes로 좀비 0건 확인
□ W3-3: Gap 분석 문서 작성
```

---

## 8. 에러 처리

| 에러 | 대응 |
|------|------|
| jq 미설치 | `command -v jq` 체크, 없으면 grep/sed 폴백 |
| teammate-registry.json 손상 | 파일 삭제 → config.json에서 재생성 |
| tmux 세션 없음 | `tmux has-session` 체크, 없으면 skip |
| PDCA 갱신 실패 | 경고 출력 후 계속 (TeamDelete에서 재검증) |
| 동시 2팀 종료 | 각 팀 별도 레지스트리 (파일명에 팀명 포함 가능) |

---

## 9. 파일 목록

| 파일 | 상태 | 변경 내용 |
|------|------|----------|
| `.claude/hooks/auto-shutdown.sh` | **신규** | 3단계 Graceful Shutdown 오케스트레이터 |
| `.claude/hooks/force-team-kill.sh` | 수정 | 레지스트리 갱신 + 리더 보호 |
| `.claude/hooks/auto-team-cleanup.sh` | 수정 | auto-shutdown 호출 추가 |
| `.claude/hooks/teammate-idle.sh` | **변경 없음** | 비활성 유지 (작업 배정은 SendMessage) |
| `.claude/settings.local.json` | 확인만 | TeammateIdle 비활성(빈 배열) 유지 확인 |
| `.claude/runtime/teammate-registry.json` | **신규** (런타임 생성) | 팀원 상태 레지스트리 |
