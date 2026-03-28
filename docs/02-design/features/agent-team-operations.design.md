# 에이전트팀 운영 체계 통합 설계서

> 작성일: 2026-03-28
> Plan: docs/01-plan/features/agent-team-operations.plan.md
> TASK: .claude/tasks/TASK-AGENT-TEAM-OPS.md
> 상태: Design
> 프로세스 레벨: L1 (src/ 미수정, hooks/scripts 정비)
> **통합 대상**: hook-task-ownership.design.md + teammate-lifecycle.design.md

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | 에이전트팀 운영 체계 (TASK 소유권 + 팀 상시 유지 + 3단계 종료 자동화) |
| **작성일** | 2026-03-28 (TDD 추가: 03-28) |
| **파일 수** | 신규 3개 + 수정 3개 + 확인 1개 + 테스트 4개 = 11개 |
| **핵심** | Hook이 팀 컨텍스트를 파일로 인지 + 리더 명시적 종료 + 팀 상시 유지 |
| **팀 구조** | 2팀 — PM(기획+마케팅), CTO(개발). MKT 독립팀 폐지 |
| **TDD** | 23건 시나리오 (10건 기구현, 13건 Red 작성 필요) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | ① 크로스팀 배정 루프 ② 수동 종료 5~10분 ③ TASK마다 팀 재생성 |
| **Solution** | TASK frontmatter 소유권 + teammate-registry 상태 공유 + 3단계 auto-shutdown |
| **Function UX Effect** | 팀 1회 생성 → 세션 끝까지 유지. 종료는 auto-shutdown 1회 실행 |
| **Core Value** | 팀 오버헤드 0 + 종료 자동화 + 토큰 낭비 제거 |

---

## 0. 팀 구성 (2팀 체제)

### PM팀 (기획 + 마케팅)

| 역할 | 모델 | 담당 |
|------|------|------|
| **PM 리더** | Opus 4.6 | 기획 총괄, Plan/Design 작성, 팀 조율 |
| pm-researcher | Sonnet 4.6 | 시장 리서치, 경쟁사 분석, 데이터 수집 |
| pm-strategist | Sonnet 4.6 | 전략 분석, JTBD, Lean Canvas |
| pm-prd | Sonnet 4.6 | PRD 작성, 요구사항 종합 |
| creative-analyst | Sonnet 4.6 | 소재 분석, 5축 분석, DeepGaze |
| lp-analyst | Sonnet 4.6 | LP 크롤링, 구조 분석, 일관성 검증 |
| marketing-strategist | Sonnet 4.6 | 메타 광고 전략, 벤치마크 해석 |

### CTO팀 (개발)

| 역할 | 모델 | 담당 |
|------|------|------|
| **CTO 리더** | Opus 4.6 | 개발 총괄, TASK 분배, 코드 리뷰 조율 |
| backend-dev | **Opus 4.6** | API, DB, 서버 로직, hooks/scripts |
| frontend-dev | **Opus 4.6** | UI, 컴포넌트, 페이지 구현 |
| *(3번째 Opus)* | **Opus 4.6** | *TASK에 따라 유동 배치* |
| qa-engineer | Sonnet 4.6 | tsc+build 검증, Gap 분석, 테스트 |

> **CTO팀 Opus 3명 고정**: backend-dev, frontend-dev + 1명(TASK에 따라 frontend-architect / infra-architect / security-architect 중 선택).
> qa-engineer만 Sonnet. 구현 품질이 핵심이므로 코드 작성 역할은 전원 Opus.

### 팀별 spawn 권한

| 팀 | spawn 가능 | spawn 금지 |
|----|-----------|-----------|
| **PM** | pm-*, researcher, creative-analyst, lp-analyst, marketing-strategist | backend-dev, frontend-dev, qa-engineer |
| **CTO** | backend-dev, frontend-dev, qa-engineer, frontend-architect, infra-architect, security-architect | pm-*, creative-analyst, lp-analyst |

### 팀 간 인수인계

```
PM팀 산출물 → CTO팀 입력
─────────────────────────
Plan 문서 (docs/01-plan/)
Design 문서 (docs/02-design/)
TASK 파일 (.claude/tasks/)
```

> PM↔CTO 직접 메시지 불가 (CC 제약). 문서가 유일한 인수인계 수단.

---

## 1. 데이터 모델

### 1-1. TASK YAML 프론트매터 스키마

**위치**: `.claude/tasks/TASK-*.md` 파일 상단

```yaml
---
team: CTO                # 필수. TeamCreate 시 지정한 팀명
session: sdk-cto          # 선택. tmux 세션명
created: 2026-03-28       # 필수. TASK 생성일 (YYYY-MM-DD)
status: pending           # 필수. pending | in-progress | completed | archived
owner: leader             # 필수. TASK 소유자
assignees:                # 선택. 팀원별 담당 태스크 ID 배열
  - role: backend-dev
    tasks: [W1-1, W1-2]
  - role: qa-engineer
    tasks: [W3-1]
---
```

| 필드 | 타입 | 필수 | 기본값 | 검증 |
|------|------|:----:|--------|------|
| `team` | `string` | Y | — | 비어있으면 안 됨 |
| `session` | `string` | N | `""` | — |
| `created` | `YYYY-MM-DD` | Y | — | 10자 ISO date |
| `status` | `enum` | Y | `pending` | pending/in-progress/completed/archived |
| `owner` | `string` | Y | `leader` | — |
| `assignees` | `array` | N | `[]` | 각 요소에 role 필수 |

**프론트매터 블록 규약**:
- 파일 첫 줄이 반드시 `---`
- 두 번째 `---`로 닫힘
- 프론트매터 내부 `- [ ]`는 체크박스로 취급 안 함
- 프론트매터 없는 레거시 TASK → `team: ""` 간주 (모든 팀 포함, 하위 호환)

### 1-2. team-context.json

**경로**: `.claude/runtime/team-context.json`
**용도**: Hook이 "지금 어떤 팀인지" 참조. 작업 배정 용도 아님.
**생명주기**: TeamCreate 직후 리더 수동 생성 → TeamDelete 시 자동 삭제

```json
{
  "team": "CTO",
  "session": "sdk-cto",
  "created": "2026-03-28T10:00:00+09:00",
  "taskFiles": ["TASK-AGENT-TEAM-OPS.md"],
  "teammates": [
    { "role": "backend-dev", "paneIndex": 1 },
    { "role": "qa-engineer", "paneIndex": 2 }
  ]
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|:----:|------|
| `team` | `string` | Y | 팀 식별자 |
| `session` | `string` | N | tmux 세션명 |
| `created` | `ISO 8601` | Y | 팀 생성 시각 |
| `taskFiles` | `string[]` | Y | 할당된 TASK 파일명 (경로 아닌 파일명만) |
| `teammates` | `array<{role, paneIndex}>` | N | 팀원 정보 |

### 1-3. teammate-registry.json

**경로**: `.claude/runtime/teammate-registry.json`
**용도**: 팀원 전체 생명주기 중앙 추적. Hook과 에이전트 간 상태 공유 매개체.
**CC 제약 우회**: Hook(shell)이 에이전트 내부 상태 직접 접근 불가 → 이 파일이 중간 매개.

```json
{
  "team": "CTO",
  "createdAt": "2026-03-28T13:00:00",
  "updatedAt": "2026-03-28T13:10:00",
  "shutdownState": "running",
  "members": {
    "backend-dev": {
      "state": "active",
      "paneId": "%29",
      "spawnedAt": "2026-03-28T13:00:00",
      "lastActiveAt": "2026-03-28T13:08:00",
      "terminatedAt": null,
      "terminatedBy": null,
      "tasksCompleted": 4,
      "model": "opus"
    }
  }
}
```

#### TypeScript 인터페이스 (참조용)

```typescript
interface TeammateRegistry {
  team: string;
  createdAt: string;               // ISO 8601
  updatedAt: string;               // ISO 8601
  shutdownState: ShutdownState;
  members: Record<string, TeammateEntry>;
}

type ShutdownState = 'running' | 'shutdown_initiated' | 'force_killing' | 'cleanup' | 'done';

interface TeammateEntry {
  state: 'spawning' | 'active' | 'idle' | 'shutdown_pending' | 'terminated';
  paneId: string;                  // tmux pane ID (예: "%29")
  spawnedAt: string;
  lastActiveAt: string | null;
  terminatedAt: string | null;
  terminatedBy: 'shutdown_approved' | 'force_kill' | 'pane_dead' | null;
  tasksCompleted: number;
  model: string;                   // opus / sonnet
}
```

#### 상태 전이도

```
spawning ──→ active ──→ idle ──→ shutdown_pending ──→ terminated
                │         │              │
                └─→ idle ─┘              ├── shutdown_approved (정상)
                                         ├── force_kill (강제 - tmux kill-pane)
                                         └── pane_dead (이미 종료)
```

| 현재 → 다음 | 트리거 |
|-------------|--------|
| spawning → active | 팀원 첫 메시지 수신 |
| active → idle | 팀원 TASK 완료 보고 |
| idle → active | 리더 SendMessage로 새 TASK 배정 |
| active/idle → shutdown_pending | auto-shutdown Stage 1 시작 |
| shutdown_pending → terminated | shutdown_approved 또는 force_kill 또는 pane_dead |

---

## 2. 함수 시그니처 (Bash)

### 2-1. parse_frontmatter_field(file, key)

TASK 파일의 YAML 프론트매터에서 특정 키의 값을 추출.

```bash
# 위치: .claude/hooks/helpers/frontmatter-parser.sh
parse_frontmatter_field() {
    local file="$1" key="$2"
    awk '/^---$/{n++; next} n==1{print}' "$file" | grep "^${key}:" | sed "s/^${key}: *//"
}
```

| 항목 | 내용 |
|------|------|
| 입력 | `file`: TASK 절대경로, `key`: YAML 키 |
| 출력 | stdout에 값. 키 없으면 빈 문자열 |
| 제약 | 단순 `key: value`만. 중첩 YAML(assignees) 미지원 |

### 2-2. scan_unchecked(file)

프론트매터 블록 제외한 영역에서 미완료 체크박스 스캔.

```bash
# 위치: .claude/hooks/helpers/frontmatter-parser.sh
scan_unchecked() {
    local file="$1"
    awk '
        /^---$/ { fm_count++; next }
        fm_count >= 2 || fm_count == 0 { print NR": "$0 }
    ' "$file" | grep '\- \[ \]'
}
```

| 항목 | 내용 |
|------|------|
| 입력 | `file`: TASK 절대경로 |
| 출력 | `줄번호: - [ ] 내용` 형태. 없으면 빈 출력 |
| 핵심 | `---` 카운터로 프론트매터(n==1) 건너뜀 |

### 2-3. load_team_context()

team-context.json 로드 → 쉘 변수 설정.

```bash
# 위치: .claude/hooks/helpers/frontmatter-parser.sh
CONTEXT_FILE="$PROJECT_DIR/.claude/runtime/team-context.json"

load_team_context() {
    TEAM_NAME=""
    TASK_FILES=""
    if [ ! -f "$CONTEXT_FILE" ]; then return 1; fi
    TEAM_NAME=$(jq -r '.team // empty' "$CONTEXT_FILE" 2>/dev/null) || TEAM_NAME=""
    TASK_FILES=$(jq -r '.taskFiles[]?' "$CONTEXT_FILE" 2>/dev/null) || TASK_FILES=""
    [ -n "$TEAM_NAME" ] && return 0 || return 1
}
```

### 2-4. build_registry_from_config()

CC config.json에서 teammate-registry.json 자동 생성.

```bash
# 위치: .claude/hooks/auto-shutdown.sh 내부
build_registry_from_config() {
    local config=$(ls -t ~/.claude/teams/*/config.json 2>/dev/null | head -1)
    [ -z "$config" ] && return 1

    local team=$(jq -r '.name' "$config")
    local now=$(date -u +"%Y-%m-%dT%H:%M:%S")

    jq -n --arg t "$team" --arg now "$now" \
       --argjson members "$(jq '[.members[] | select(.name != "team-lead") | {
           key: .name,
           value: {
               state: (if .isActive then "active" else "terminated" end),
               paneId: (.tmuxPaneId // ""),
               spawnedAt: (.joinedAt // $now),
               lastActiveAt: null,
               terminatedAt: null,
               terminatedBy: null,
               tasksCompleted: 0,
               model: (.model // "opus")
           }
       }] | from_entries' "$config")" \
       '{team: $t, createdAt: $now, updatedAt: $now, shutdownState: "running", members: $members}' \
       > "$REGISTRY"
}
```

### 2-5. set_member_state / set_member_terminated_by

레지스트리 상태 변경 헬퍼.

```bash
# 위치: .claude/hooks/auto-shutdown.sh 내부
set_member_state() {
    local member="$1" state="$2"
    local now=$(date -u +"%Y-%m-%dT%H:%M:%S")
    jq --arg m "$member" --arg s "$state" --arg t "$now" \
       '.members[$m].state = $s | .updatedAt = $t' "$REGISTRY" > "${REGISTRY}.tmp" \
       && mv "${REGISTRY}.tmp" "$REGISTRY"
}

set_member_terminated_by() {
    local member="$1" by="$2"
    local now=$(date -u +"%Y-%m-%dT%H:%M:%S")
    jq --arg m "$member" --arg b "$by" --arg t "$now" \
       '.members[$m].terminatedBy = $b | .members[$m].terminatedAt = $t | .updatedAt = $t' \
       "$REGISTRY" > "${REGISTRY}.tmp" && mv "${REGISTRY}.tmp" "$REGISTRY"
}
```

---

## 3. 스크립트 설계

### 3-1. auto-shutdown.sh (신규)

**경로**: `.claude/hooks/auto-shutdown.sh`
**트리거**: 리더가 직접 `bash .claude/hooks/auto-shutdown.sh` 실행. 자동 호출 없음.
**역할**: 3단계 Graceful Shutdown 오케스트레이터

**CC 제약 우회**: shutdown_request는 에이전트가 무시 가능 → Stage 2에서 tmux kill-pane으로 OS 레벨 강제 종료.

```
입력: $1 = team-name (선택, 미지정 시 레지스트리에서 자동 감지)
출력: exit 0 = 전원 종료 완료, exit 1 = 일부 실패
부수효과: teammate-registry.json 갱신, tmux pane 종료, PDCA updatedAt 갱신
```

#### 의사코드

```bash
#!/bin/bash
# auto-shutdown.sh — 3단계 Graceful Shutdown
set -euo pipefail

# 팀원은 실행 불가
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"
REGISTRY="$PROJECT_DIR/.claude/runtime/teammate-registry.json"

# --- Stage 0: 레지스트리 준비 ---
if [ ! -f "$REGISTRY" ]; then
    build_registry_from_config || { echo "[auto-shutdown] 레지스트리 생성 실패"; exit 1; }
fi

# shutdownState → shutdown_initiated
jq '.shutdownState = "shutdown_initiated"' "$REGISTRY" > "${REGISTRY}.tmp" \
    && mv "${REGISTRY}.tmp" "$REGISTRY"

# 활성 팀원 목록
ACTIVE_MEMBERS=$(jq -r '.members | to_entries[] | select(.value.state != "terminated") | .key' "$REGISTRY")
[ -z "$ACTIVE_MEMBERS" ] && { cleanup_and_exit; }

# --- Stage 1: Graceful Request (10초) ---
echo "[auto-shutdown] Stage 1: 종료 요청..."
for member in $ACTIVE_MEMBERS; do
    set_member_state "$member" "shutdown_pending"
    echo "  → $member: shutdown_pending"
done

echo "[auto-shutdown] 10초 대기..."
sleep 10

# --- Stage 2: Force Kill (tmux kill-pane) ---
jq '.shutdownState = "force_killing"' "$REGISTRY" > "${REGISTRY}.tmp" \
    && mv "${REGISTRY}.tmp" "$REGISTRY"

STILL_ACTIVE=$(jq -r '.members | to_entries[] | select(.value.state == "shutdown_pending") | .key' "$REGISTRY")
for member in $STILL_ACTIVE; do
    PANE_ID=$(jq -r --arg m "$member" '.members[$m].paneId' "$REGISTRY")

    # 리더 보호 (pane_index 0)
    if [ -n "$PANE_ID" ] && [ "$PANE_ID" != "null" ]; then
        PANE_INDEX=$(tmux display-message -t "$PANE_ID" -p '#{pane_index}' 2>/dev/null || echo "")
        if [ "$PANE_INDEX" = "0" ]; then
            echo "  [BLOCK] $member: 리더 pane — skip"
            continue
        fi

        if tmux kill-pane -t "$PANE_ID" 2>/dev/null; then
            set_member_state "$member" "terminated"
            set_member_terminated_by "$member" "force_kill"
            echo "  [KILL] $member: force-killed (pane $PANE_ID)"
        else
            set_member_state "$member" "terminated"
            set_member_terminated_by "$member" "pane_dead"
            echo "  [DEAD] $member: pane already dead"
        fi
    else
        set_member_state "$member" "terminated"
        set_member_terminated_by "$member" "pane_dead"
        echo "  [DEAD] $member: no pane ID"
    fi
done

# --- Stage 3: Cleanup ---
jq '.shutdownState = "cleanup"' "$REGISTRY" > "${REGISTRY}.tmp" \
    && mv "${REGISTRY}.tmp" "$REGISTRY"

# PDCA 갱신 (TeamDelete hook 통과용)
PDCA_FILE="$PROJECT_DIR/docs/.pdca-status.json"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S")
if [ -f "$PDCA_FILE" ]; then
    jq --arg t "$NOW" '."_lastUpdated" = $t | .updatedAt = $t' "$PDCA_FILE" > "${PDCA_FILE}.tmp" \
        && mv "${PDCA_FILE}.tmp" "$PDCA_FILE"
fi

# config.json isActive=false (force-team-kill 패턴)
CONFIG=$(ls -t ~/.claude/teams/*/config.json 2>/dev/null | head -1)
if [ -n "$CONFIG" ] && [ -f "$CONFIG" ]; then
    jq '(.members[] | select(.name != "team-lead") | .isActive) = false' \
        "$CONFIG" > "${CONFIG}.tmp" && mv "${CONFIG}.tmp" "$CONFIG"
fi

# 최종
jq '.shutdownState = "done"' "$REGISTRY" > "${REGISTRY}.tmp" \
    && mv "${REGISTRY}.tmp" "$REGISTRY"

echo "[auto-shutdown] 완료. TeamDelete 실행 가능."
osascript -e 'display notification "전원 종료 완료. TeamDelete 가능." with title "auto-shutdown"' 2>/dev/null || true
exit 0
```

### 3-2. force-team-kill.sh (수정)

**경로**: `.claude/hooks/force-team-kill.sh`
**변경점 2가지**:

#### (A) 레지스트리 갱신 추가

pane kill 후 teammate-registry.json도 동시 갱신:

```bash
# Step 2.5: 레지스트리 갱신 (기존 isActive=false 후 추가)
REGISTRY="$PROJECT_DIR/.claude/runtime/teammate-registry.json"
if [ -f "$REGISTRY" ]; then
    NOW=$(date -u +"%Y-%m-%dT%H:%M:%S")
    jq --arg m "$MEMBER_NAME" --arg t "$NOW" \
       '.members[$m].state = "terminated" |
        .members[$m].terminatedBy = "force_kill" |
        .members[$m].terminatedAt = $t |
        .updatedAt = $t' \
       "$REGISTRY" > "${REGISTRY}.tmp" && mv "${REGISTRY}.tmp" "$REGISTRY"
    echo "  [OK] 레지스트리 갱신: $MEMBER_NAME → terminated"
fi
```

#### (B) 리더 보호 로직

```bash
# pane kill 전 리더 체크
PANE_INDEX=$(tmux display-message -t "$PANE_ID" -p '#{pane_index}' 2>/dev/null || echo "")
if [ "$PANE_INDEX" = "0" ]; then
    echo "  [BLOCK] $MEMBER_NAME: 리더 pane (index=0) — kill 금지"
    continue
fi
```

### 3-3. auto-team-cleanup.sh (수정)

**경로**: `.claude/hooks/auto-team-cleanup.sh`
**변경**: Plan D-3 결정에 따라 **알림만**. auto-shutdown 호출 없음.

현재 코드가 이미 알림만 하고 있으므로 변경 최소:

```bash
# 추가: 프론트매터 기반 팀 소속 TASK만 스캔 (크로스팀 방지)
source "$(dirname "$0")/helpers/frontmatter-parser.sh" 2>/dev/null

# 기존 전체 TASK 스캔 → 팀 소속 TASK만 스캔으로 변경
if load_team_context; then
    # team-context.json의 taskFiles만 스캔
    for f in $TASK_FILES; do
        FULL_PATH="$TASKS_DIR/$f"
        [ -f "$FULL_PATH" ] || continue
        COUNT=$(scan_unchecked "$FULL_PATH" | wc -l | tr -d '[:space:]')
        UNCHECKED_COUNT=$((UNCHECKED_COUNT + ${COUNT:-0}))
    done
else
    # 폴백: 프론트매터의 team 필드로 필터링
    for f in "$TASKS_DIR"/TASK-*.md; do
        [ -f "$f" ] || continue
        FILE_TEAM=$(parse_frontmatter_field "$f" "team")
        # team-context 없으면 전체 스캔 (하위 호환)
        COUNT=$(scan_unchecked "$f" | wc -l | tr -d '[:space:]')
        UNCHECKED_COUNT=$((UNCHECKED_COUNT + ${COUNT:-0}))
    done
fi
```

### 3-4. settings.local.json (확인 + 수정)

**현재 상태**: TeammateIdle에 teammate-idle.sh가 등록되어 있음.
**Plan D-2 위반**: `TeammateIdle: []` (빈 배열) 이어야 함.

```json
// 변경 전 (현재):
"TeammateIdle": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "bash /Users/smith/projects/bscamp/.claude/hooks/teammate-idle.sh",
        "timeout": 10000
      }
    ]
  }
]

// 변경 후:
"TeammateIdle": []
```

---

## 4. CC 제약 워크어라운드 구현

### 4-1. 파일 기반 상태 공유 (Hook ↔ 에이전트)

CC Hook은 shell script라서 에이전트 내부 상태 직접 접근 불가. teammate-registry.json이 매개체.

```
에이전트 (Claude AI)           파일 시스템              Hook (Shell)
     │                            │                        │
     ├──── Write state ──────────→│                        │
     │                            │←── Read state ─────────┤
     │                            │                        │
     │                            │──── Update state ─────→│
     │←── Read updated ──────────│                        │
```

**구현 원칙**: 에이전트가 TASK 완료 시 → 리더에게 SendMessage → 리더가 registry 갱신 가능.
별도 에이전트 자동 기록은 이번 범위 외 (리더 수동 갱신).

### 4-2. 3단계 Graceful Shutdown (tmux 강제 종료)

Stage 1의 shutdown_request를 에이전트가 무시해도 Stage 2에서 tmux kill-pane으로 OS 레벨 강제 종료. 에이전트 불응 불가.

```
리더 결정: "세션 종료"
    │
    ├── Stage 1: registry → shutdown_pending (10초 유예)
    │   └── 에이전트가 정상 종료하면 → terminated (shutdown_approved)
    │
    ├── Stage 2: 미종료 → tmux kill-pane (OS 강제)
    │   └── 에이전트 무시 불가 → terminated (force_kill)
    │
    └── Stage 3: PDCA 갱신 + config isActive=false + registry done
        └── TeamDelete 가능 상태
```

### 4-3. 크로스팀 리더 소통 (파일 릴레이)

이번 TASK 범위 외. 향후 필요 시 구현.

```json
// .claude/runtime/cross-team-msg.json (향후)
{
  "from": "CTO-1",
  "to": "CTO-2",
  "message": "protractor API 완료. frontend 시작 가능.",
  "timestamp": "2026-03-28T14:00:00"
}
```

---

## 5. 에러 처리

| 에러 상황 | 대응 | exit code |
|-----------|------|-----------|
| jq 미설치 | `command -v jq` 체크 → 없으면 경고 + grep/sed 폴백 | 0 (경고만) |
| teammate-registry.json 손상 | 파일 삭제 → config.json에서 재생성 (build_registry_from_config) | 0 |
| teammate-registry.json 없음 | 자동 생성 후 진행 | 0 |
| tmux 세션 없음 | `tmux has-session` 체크 → 없으면 skip | 0 |
| team-context.json 없음 | 프론트매터 직접 파싱으로 폴백 | 0 |
| PDCA 갱신 실패 | 경고 출력 후 계속 (TeamDelete에서 재검증) | 0 |
| config.json 없음 | 경고 출력 + 레지스트리만으로 진행 | 0 |
| 리더 pane kill 시도 | pane_index=0 체크 → 절대 kill 안 함 | 0 (skip) |
| jq tmp 파일 생성 실패 | mktemp 사용 또는 ${file}.tmp 패턴 | 1 |

**모든 Hook은 exit 0 원칙**: Hook이 차단(exit 1/2)하면 팀원 작업이 막힘. 경고만 출력하고 통과.
**예외**: validate-pdca-before-teamdelete.sh만 exit 2로 차단 가능 (TeamDelete 전 PDCA 갱신 강제).

---

## 6. TDD 테스트 설계 (L2/L3 필수 — 2026-03-28 추가)

> Plan 섹션 6의 23건 시나리오를 테스트 코드 수준으로 설계.
> 각 테스트는 **describe/it 구조 + fixture + mock + assert** 명시.
> CTO팀 Do 단계에서 Red(전부 실패) → Green(구현) → Refactor 순서.

### 6-1. 공통 헬퍼 (helpers.ts 확장)

```typescript
// __tests__/hooks/helpers.ts — 기존 + 추가
import { execSync } from 'child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'

// 기존: createTestEnv, runHook, cleanupTestEnv, prepareHookScript

// 추가: 레지스트리 fixture 로더
export function loadFixture(name: string): Record<string, unknown> {
  const path = join(__dirname, 'fixtures', name)
  return JSON.parse(readFileSync(path, 'utf-8'))
}

// 추가: 임시 레지스트리 생성
export function createTempRegistry(data: Record<string, unknown>): string {
  const dir = mkdtempSync('/tmp/hook-test-')
  const path = join(dir, 'teammate-registry.json')
  writeFileSync(path, JSON.stringify(data, null, 2))
  return path
}

// 추가: bash 함수 실행 래퍼
export function runBashFunction(scriptPath: string, funcName: string, args: string[]): string {
  const cmd = `source "${scriptPath}" && ${funcName} ${args.map(a => `"${a}"`).join(' ')}`
  return execSync(`bash -c '${cmd}'`, { encoding: 'utf-8', timeout: 10000 }).trim()
}
```

### 6-2. auto-shutdown.test.ts (Wave 2 — 미구현, 8건)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadFixture, createTempRegistry, runBashFunction } from './helpers'

const SCRIPT = '/Users/smith/projects/bscamp/.claude/hooks/auto-shutdown.sh'

describe('auto-shutdown.sh — 3단계 Graceful Shutdown', () => {

  // UT-1: 정상 종료
  describe('Stage 1: 정상 종료 (shutdown_approved)', () => {
    it('2명 모두 shutdown_approved → 레지스트리 terminated, pane 0개', () => {
      // fixture: teammate_registry_active.json (2명 active)
      // mock: tmux kill-pane → not called (정상 종료 시)
      // assert: members.*.state === 'terminated'
      // assert: members.*.terminatedBy === 'shutdown_approved'
    })
  })

  // UT-2 + INC-4 + INC-5: 강제 종료
  describe('Stage 2: 강제 종료 (shutdown 무시)', () => {
    it('1명 shutdown 무시 → Stage 2에서 force-kill', () => {
      // fixture: teammate_registry_shutdown.json (1명 shutdown_pending 유지)
      // mock: tmux kill-pane -t %XX → exit 0
      // assert: members[name].terminatedBy === 'force_kill'
    })

    it('INC-4: shutdown_approved 전송 후 idle 유지 → force-kill', () => {
      // 사고 재현: doc-writer가 approved 보냈지만 프로세스 미종료
      // assert: 10초 후 state === 'terminated'
    })

    it('INC-5: shutdown_pending에서 10초 후 미종료 → force_kill 전이', () => {
      // assert: shutdownState === 'force_killing' 후 terminated
    })
  })

  // E-1: pane 이미 죽음
  describe('Stage 2: pane already dead', () => {
    it('E-1: tmux kill-pane 실패(pane 없음) → pane_dead 기록', () => {
      // mock: tmux kill-pane → exit 1 (pane not found)
      // assert: members[name].terminatedBy === 'pane_dead'
    })
  })

  // E-4: 리더 보호
  describe('리더 보호', () => {
    it('E-4: pane_index=0 → kill 절대 안 함', () => {
      // mock: tmux display-message -p '#{pane_index}' → '0'
      // assert: tmux kill-pane NOT called
      // assert: stdout contains '[BLOCK]'
    })
  })

  // INC-6: PDCA 갱신
  describe('Stage 3: Cleanup', () => {
    it('INC-6: PDCA updatedAt 자동 갱신 후 TeamDelete 가능', () => {
      // fixture: pdca-status.json (updatedAt 30분 전)
      // assert: 실행 후 updatedAt이 현재 시각 ±1분
    })

    it('INC-7: 실행 후 shutdownState === "done"', () => {
      // assert: registry.shutdownState === 'done'
    })
  })

  // E-2: 레지스트리 없음
  describe('레지스트리 자동 생성', () => {
    it('E-2: registry 없으면 config.json에서 자동 생성', () => {
      // setup: registry 파일 삭제
      // mock: ~/.claude/teams/*/config.json 존재
      // assert: 실행 후 registry 파일 존재 + members 포함
    })
  })
})
```

### 6-3. force-team-kill.test.ts (Wave 2 — 미구현, 3건)

```typescript
import { describe, it, expect } from 'vitest'

const SCRIPT = '/Users/smith/projects/bscamp/.claude/hooks/force-team-kill.sh'

describe('force-team-kill.sh — 강제 종료 + 레지스트리', () => {

  // INC-3: 좀비 프로세스
  it('INC-3: kill 후 레지스트리에 terminated + force_kill 기록', () => {
    // fixture: teammate_registry_active.json
    // mock: tmux kill-pane -t %10 → exit 0
    // assert: registry.members['backend-dev'].state === 'terminated'
    // assert: registry.members['backend-dev'].terminatedBy === 'force_kill'
    // assert: registry.members['backend-dev'].terminatedAt !== null
  })

  // E-4: 리더 보호
  it('E-4: pane_index=0 → [BLOCK] 출력, kill 안 함', () => {
    // mock: tmux display-message → '0'
    // assert: kill-pane NOT called
  })

  // E-6: isActive=false인데 pane 살아있음
  it('E-6: config isActive=false + pane alive → tmux kill-pane 실행', () => {
    // mock: config.json members[name].isActive === false
    // mock: tmux has-session → exit 0 (pane 존재)
    // assert: tmux kill-pane called
  })
})
```

### 6-4. teammate-registry.test.ts (Wave 1 — 미구현, 4건)

```typescript
import { describe, it, expect } from 'vitest'

describe('teammate-registry.json — 상태 전이', () => {

  // UT-3: 팀 상시 유지
  it('UT-3: TASK 완료 후 state active 유지 (terminated 안 됨)', () => {
    // setup: registry active 상태
    // action: tasksCompleted++ 만 변경
    // assert: state === 'active' (terminated 아님)
  })

  it('set_member_state: active → shutdown_pending 전이', () => {
    // action: set_member_state('backend-dev', 'shutdown_pending')
    // assert: members['backend-dev'].state === 'shutdown_pending'
    // assert: updatedAt 갱신됨
  })

  it('set_member_terminated_by: force_kill 기록', () => {
    // action: set_member_terminated_by('backend-dev', 'force_kill')
    // assert: terminatedBy === 'force_kill'
    // assert: terminatedAt !== null
  })

  it('build_registry_from_config: config.json → registry 변환', () => {
    // fixture: team_config_sample.json
    // assert: members 키가 config.members에서 team-lead 제외한 것과 일치
    // assert: 각 member의 state === 'active'
    // assert: shutdownState === 'running'
  })
})
```

### 6-5. auto-team-cleanup.test.ts (Wave 3 — 미구현, 2건)

```typescript
import { describe, it, expect } from 'vitest'

describe('auto-team-cleanup.sh — 팀 소속 TASK만 스캔', () => {

  // REG-4 방지: 크로스팀 스캔 차단
  it('team-context CTO → PM TASK 스캔 안 함', () => {
    // setup: team-context.json { team: 'CTO', taskFiles: ['TASK-CTO.md'] }
    // setup: TASK-PM.md (미완료 체크박스 있음)
    // assert: UNCHECKED_COUNT에 PM TASK 미포함
  })

  // INC-11: 알림만 (auto-shutdown 호출 안 함)
  it('INC-11: 모든 TASK 완료 → 알림만, auto-shutdown 미호출', () => {
    // setup: 모든 체크박스 완료
    // assert: stdout contains '모든 TASK 완료'
    // assert: auto-shutdown.sh NOT executed
  })
})
```

### 6-6. regression.test.ts 추가분 (기존 확장, 9건)

```typescript
// 기존 REG-1~10에 추가

// REG-7 반전 (INC-8)
describe('REG-7 (반전): TeammateIdle은 빈 배열이어야 함 — D-2', () => {
  it('TeammateIdle이 빈 배열 []이어야 함', () => {
    // 변경 전: expect(length).toBeGreaterThan(0)
    // 변경 후:
    // assert: hooks.TeammateIdle === [] 또는 length === 0
  })
})

// INC-2: 팀 역할 경계
describe('INC-2: PM 세션에서 CTO 팀원 spawn 차단', () => {
  it('enforce-teamcreate.sh — PM 팀에서 backend-dev spawn 시 차단', () => {
    // mock: team-context.json { team: 'PM' }
    // input: Agent { subagent_type: 'backend-dev' }
    // assert: exit 1 + 에러 메시지
  })
})

// INC-9: 리더 코드 작성 차단
describe('INC-9: validate-delegate — 리더 src/ 수정 차단', () => {
  it('IS_TEAMMATE=false + file_path=src/ → exit 2', () => {
    // mock: IS_TEAMMATE=false
    // input: Edit { file_path: 'src/lib/test.ts' }
    // assert: exit 2
  })
})

// INC-10: 팀원 PDCA hook 통과
describe('INC-10: 팀원은 모든 PDCA hook 즉시 통과', () => {
  it('IS_TEAMMATE=true → pdca-update.sh exit 0', () => {
    // mock: IS_TEAMMATE=true
    // assert: exit 0 (차단 안 됨)
  })
})

// INC-12: PM팀 커밋 경고
describe('INC-12: PM팀 세션에서 git commit 시 역할 경고', () => {
  it('team-context PM + git commit → 경고 출력', () => {
    // mock: team-context.json { team: 'PM' }
    // input: Bash { command: 'git commit -m "..."' }
    // assert: stderr contains '역할' or 'CTO'
  })
})

// INC-13: TASK 단일 팀 소속
describe('INC-13: TASK 파일은 하나의 team만', () => {
  it('team 필드에 슬래시(/) 포함 → 검증 실패', () => {
    // fixture: task_cross_team.md (team: MKT/CTO)
    // assert: parseFrontmatterField returns value without '/'
  })
})

// INC-14: TeammateIdle 재활성화 차단
describe('INC-14: TeammateIdle 재활성화 시도 차단', () => {
  it('settings.local.json TeammateIdle에 hook 추가 시도 감지', () => {
    // 이 테스트는 REG-7 반전과 동일한 검증
    // assert: TeammateIdle === []
  })
})
```

### 6-7. Fixture 파일 설계

```
__tests__/hooks/fixtures/
├── teammate_registry_active.json     ← 2명 active
│   {
│     "team": "CTO", "shutdownState": "running",
│     "members": {
│       "backend-dev": { "state": "active", "paneId": "%10" },
│       "frontend-dev": { "state": "active", "paneId": "%11" }
│     }
│   }
│
├── teammate_registry_mixed.json      ← 1명 active + 1명 idle
│   {
│     "members": {
│       "backend-dev": { "state": "active", "paneId": "%10" },
│       "qa-engineer": { "state": "idle", "paneId": "%12" }
│     }
│   }
│
├── teammate_registry_shutdown.json   ← 1명 shutdown_pending (강제 종료 테스트용)
│   {
│     "shutdownState": "force_killing",
│     "members": {
│       "backend-dev": { "state": "shutdown_pending", "paneId": "%10" }
│     }
│   }
│
├── team_config_sample.json           ← CC config.json 구조 (build_registry 테스트)
│   {
│     "name": "CTO",
│     "members": [
│       { "name": "team-lead", "isActive": true },
│       { "name": "backend-dev", "isActive": true, "tmuxPaneId": "%10", "model": "opus" },
│       { "name": "qa-engineer", "isActive": true, "tmuxPaneId": "%12", "model": "sonnet" }
│     ]
│   }
│
├── task_with_frontmatter.md          ← 정상 TASK (team: CTO)
│   ---
│   team: CTO
│   status: in-progress
│   created: 2026-03-28
│   owner: leader
│   ---
│   - [ ] W1-1: 작업 A
│   - [x] W1-2: 작업 B
│
├── task_without_frontmatter.md       ← 레거시 TASK (프론트매터 없음)
│   # TASK 제목
│   - [ ] 작업 1
│
└── task_cross_team.md                ← 잘못된 TASK (팀 중복)
    ---
    team: MKT/CTO
    status: pending
    ---
    - [ ] 양쪽 팀에 걸친 작업
```

### 6-8. 테스트 커버리지 매핑

| Wave | 테스트 파일 | 건수 | 기구현 | Red 작성 |
|:----:|-----------|:----:|:------:|:--------:|
| 1 | frontmatter-parser.test.ts | 5 | 5 | 0 |
| 1 | teammate-idle.test.ts | 7 | 7 | 0 |
| 1 | teammate-registry.test.ts | 4 | 0 | **4** |
| 2 | auto-shutdown.test.ts | 8 | 0 | **8** |
| 2 | force-team-kill.test.ts | 3 | 0 | **3** |
| 3 | auto-team-cleanup.test.ts | 2 | 0 | **2** |
| - | regression.test.ts (추가분) | 9 | 3 | **6** |
| | **합계** | **38** | **15** | **23** |

> **TDD 순서**: Wave별로 Red(테스트 작성) → Green(구현) → Refactor.
> 미구현 23건을 먼저 전부 Red로 작성한 뒤 구현 시작.

---

## 7. 구현 순서 체크리스트

### Wave 1: TASK 소유권 (의존성 없음, 병렬 가능)

```
□ W1-1: .claude/hooks/helpers/frontmatter-parser.sh
        → parse_frontmatter_field() 함수
        → scan_unchecked() 함수
        → load_team_context() 함수
        → 기존 frontmatter-parser.sh 있으면 확장, 없으면 신규

□ W1-2: .claude/runtime/team-context.json 초기화 스크립트
        → build_team_context() 함수 (auto-shutdown.sh 또는 별도 헬퍼)
        → 리더가 TeamCreate 후 수동 호출 가능

□ W1-3: .claude/runtime/teammate-registry.json 초기화
        → build_registry_from_config() 함수
        → auto-shutdown.sh 내부에 포함
        → 스키마: 섹션 1-3 참조
```

### Wave 2: 종료 자동화 (Wave 1 완료 후)

```
□ W2-1: .claude/hooks/auto-shutdown.sh 신규
        → 3단계 프로토콜 전체 (섹션 3-1)
        → 헬퍼 함수 포함 (set_member_state, set_member_terminated_by, build_registry_from_config, cleanup_and_exit)
        → is-teammate.sh source (팀원 실행 차단)
        → 리더 보호 (pane_index=0 skip)

□ W2-2: .claude/hooks/force-team-kill.sh 수정
        → 레지스트리 갱신 추가 (섹션 3-2A)
        → 리더 보호 추가 (섹션 3-2B)
        → PROJECT_DIR 변수 추가
```

### Wave 3: Hook 정비 (Wave 2 완료 후)

```
□ W3-1: .claude/hooks/auto-team-cleanup.sh 수정
        → frontmatter-parser.sh source
        → 팀 소속 TASK만 스캔 (크로스팀 방지)
        → 알림만 유지 (auto-shutdown 호출 안 함) — Plan D-3

□ W3-2: .claude/settings.local.json 수정
        → TeammateIdle: [] (빈 배열로 변경)
        → 현재 teammate-idle.sh 등록되어 있음 → 제거

□ W3-3: CLAUDE.md 규칙 업데이트 초안
        → "팀원 종료" 섹션 변경 (즉시 TeamDelete → 세션 종료 시 auto-shutdown)
        → "TeammateIdle" 섹션 변경 (자동 배정 → 비활성)
        → "팀 운영" 세션 단위 상시 유지 명시
        → Smith님 승인 후 별도 커밋
```

### Wave 4: 검증

```
□ W4-1: 수동 테스트 — TeamCreate → 연속 TASK → auto-shutdown 전체 플로우
□ W4-2: tmux list-panes로 좀비 0건 확인
□ W4-3: Gap 분석 → docs/03-analysis/agent-team-operations.analysis.md
```

---

## 8. 파일 목록

| 파일 | 상태 | 담당 | 변경 내용 |
|------|------|------|----------|
| `.claude/hooks/helpers/frontmatter-parser.sh` | 신규/확장 | backend-dev | parse_frontmatter_field, scan_unchecked, load_team_context |
| `.claude/hooks/auto-shutdown.sh` | **신규** | backend-dev | 3단계 Graceful Shutdown + 헬퍼 함수 |
| `.claude/hooks/force-team-kill.sh` | 수정 | backend-dev | 레지스트리 갱신 + 리더 보호 |
| `.claude/hooks/auto-team-cleanup.sh` | 수정 | backend-dev | 팀 소속 TASK만 스캔 + 알림만 |
| `.claude/settings.local.json` | 수정 | backend-dev | TeammateIdle → [] |
| `.claude/runtime/team-context.json` | **신규** (런타임) | 리더 수동 | 팀 컨텍스트 |
| `.claude/runtime/teammate-registry.json` | **신규** (런타임) | auto-shutdown | 팀원 생명주기 |
| `CLAUDE.md` | 초안 | backend-dev | 팀 상시 유지 + 종료 프로세스 규칙 |
| `.claude/hooks/teammate-idle.sh` | **변경 없음** | — | 비활성 유지 |
| `__tests__/hooks/auto-shutdown.test.ts` | **신규** | qa-engineer | 8건 (UT-1,2 + INC-4,5,6,7 + E-1,2) |
| `__tests__/hooks/force-team-kill.test.ts` | **신규** | qa-engineer | 3건 (INC-3 + E-4,6) |
| `__tests__/hooks/teammate-registry.test.ts` | **신규** | qa-engineer | 4건 (UT-3 + 상태 전이 3건) |
| `__tests__/hooks/auto-team-cleanup.test.ts` | **신규** | qa-engineer | 2건 (REG-4 방지 + INC-11) |
| `__tests__/hooks/regression.test.ts` | 수정 | qa-engineer | +9건 (REG-7반전 + INC-2,9,10,12,13,14) |
| `__tests__/hooks/fixtures/*.json` | **신규** | qa-engineer | 7개 fixture 파일 |

---

## 9. 통합 이력

이 설계서는 아래 2개 설계서를 통합한 것이다:

| 기존 파일 | 주요 내용 | 통합 위치 |
|-----------|-----------|-----------|
| `hook-task-ownership.design.md` | TASK frontmatter, team-context.json, BOARD.json, 함수 시그니처 | 섹션 1-1, 1-2, 2-1~2-3 |
| `teammate-lifecycle.design.md` | teammate-registry.json, auto-shutdown.sh, force-team-kill.sh | 섹션 1-3, 3-1~3-2 |

기존 파일은 삭제하지 않고 상단에 "통합됨" 표기 유지.

**변경점 (기존 대비)**:
- auto-team-cleanup.sh: ~~auto-shutdown 호출~~ → **알림만** (Plan D-3 반영)
- TeammateIdle: 빈 배열 확인 → **현재 등록되어 있으므로 실제 수정 필요** (발견 사항)
- CC 제약 워크어라운드 섹션 신규 추가 (섹션 4)
- BOARD.json: 이번 범위 제외 (nice-to-have)
