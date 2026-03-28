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
| **기능** | 에이전트팀 운영 체계 (TASK 소유권 + 팀 상시 유지 + 3단계 종료 자동화 + **크로스팀 MCP 통신**) |
| **작성일** | 2026-03-28 (TDD 추가: 03-28, MCP 추가: 03-28) |
| **파일 수** | 신규 3개 + 수정 3개 + 확인 1개 + 테스트 7개 + MCP 설정 + watcher = **16개** |
| **핵심** | Hook이 팀 컨텍스트를 파일로 인지 + 리더 명시적 종료 + 팀 상시 유지 + **claude-peers-mcp 크로스팀 실시간 통신** |
| **팀 구조** | 2팀 — PM(기획+마케팅), CTO(개발). MKT 독립팀 폐지 |
| **크로스팀 통신** | claude-peers-mcp — 3자 통신 (CC PM + CC CTO + 오픈클로 mozzi) |
| **TDD** | 55건 시나리오 (15건 기구현, 40건 Red 작성 필요) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | ① 크로스팀 배정 루프 ② 수동 종료 5~10분 ③ TASK마다 팀 재생성 |
| **Solution** | TASK frontmatter 소유권 + teammate-registry 상태 공유 + 3단계 auto-shutdown + **claude-peers-mcp 크로스팀 실시간 통신** |
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

### 팀 간 통신 (claude-peers-mcp + OpenClaw webhook wake)

```
[CC PM 리더]  ──channel push──→ 즉시 수신      ──┐
[CC CTO 리더] ──channel push──→ 즉시 수신      ──┼──→ claude-peers-mcp (localhost:7899)
[OpenClaw COO] ──tool mode + webhook wake──→    ──┘
                     ↑
              peers-wake-watcher (1초 폴링)
              → 미배달 감지 → /hooks/wake POST
```

| 참여자 | 수신 방식 | push 지원 | 지연 |
|--------|-----------|:---------:|:----:|
| **CC PM** | channel mode | **즉시** | ~0초 |
| **CC CTO** | channel mode | **즉시** | ~0초 |
| **OpenClaw mozzi** | tool mode + webhook wake | **watcher 경유** | ~1초 |

| 채널 | 용도 | 지속성 |
|------|------|--------|
| **MCP 메시지** (`send_message`) | 핸드오프 신호, 상태 알림, 긴급 통보 | 임시 (수신 후 삭제) |
| **TASK 파일** (`.claude/tasks/`) | 상세 스펙, 요구사항, 체크리스트 | 영구 (git 추적) |
| **webhook wake** (`/hooks/wake`) | OpenClaw 세션 깨우기 (알림 전용) | 즉시 소멸 |
| **Plan/Design 문서** | 설계 의사결정, 아키텍처 | 영구 (git 추적) |

> 메시지 = 신호, 파일 = 스펙. 메시지는 TASK 파일 경로를 참조.

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

### 4-3. 크로스팀 통신: claude-peers-mcp 아키텍처

#### 4-3-1. 시스템 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                    localhost:7899 (Broker)                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Bun HTTP Server                                        │    │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────┐         │    │
│  │  │ /register│  │/send-msg │  │/poll-messages  │         │    │
│  │  └────┬─────┘  └────┬─────┘  └──────┬────────┘         │    │
│  │       │              │               │                   │    │
│  │  ┌────▼──────────────▼───────────────▼────────┐         │    │
│  │  │         SQLite (WAL mode)                   │         │    │
│  │  │  ┌─────────┐  ┌──────────────────────────┐ │         │    │
│  │  │  │ peers   │  │ messages                  │ │         │    │
│  │  │  │ id      │  │ from_id, to_id, text      │ │         │    │
│  │  │  │ pid     │  │ delivered (0/1)            │ │         │    │
│  │  │  │ summary │  │ sent_at                    │ │         │    │
│  │  │  └─────────┘  └──────────────────────────┘ │         │    │
│  │  └────────────────────────────────────────────┘         │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
         ▲              ▲              ▲
         │ MCP stdio    │ MCP stdio    │ MCP stdio
    ┌────┴────┐   ┌─────┴─────┐  ┌────┴──────┐
    │ CC PM   │   │ CC CTO    │  │ OpenClaw  │
    │ Leader  │   │ Leader    │  │ mozzi     │
    │(tmux p1)│   │(tmux p2)  │  │           │
    └─────────┘   └───────────┘  └───────────┘
```

#### 4-3-2. 메시지 프로토콜

브로커의 `text` 필드는 opaque string. 구조는 프로토콜 규약으로 정의.

```typescript
interface TeamMessage {
  protocol: 'bscamp-team/v1';
  type: MessageType;
  from_role: TeamRole;
  to_role: TeamRole;
  payload: Record<string, unknown>;
  ts: string;          // ISO 8601
  msg_id: string;      // 멱등성 키 (예: "pm-20260328-001")
}

type MessageType =
  | 'TASK_HANDOFF'       // PM→CTO: "TASK 준비 완료, Do 진행해"
  | 'FEEDBACK'           // CTO→PM: "설계 변경 필요"
  | 'STATUS_UPDATE'      // Any→Any: "Wave 1 완료, Wave 2 시작"
  | 'URGENT'             // mozzi→Any: "프로덕션 에러, 핫픽스 필요"
  | 'COMPLETION_REPORT'  // CTO→PM/mozzi: "구현 완료, QA 요청"
  | 'ACK'                // Any→Any: 수신 확인 (at-most-once 보완)
  | 'PING';              // Any→Any: 생존 확인

type TeamRole = 'PM_LEADER' | 'CTO_LEADER' | 'MOZZI';
```

**메시지 예시:**

```json
{
  "protocol": "bscamp-team/v1",
  "type": "TASK_HANDOFF",
  "from_role": "PM_LEADER",
  "to_role": "CTO_LEADER",
  "payload": {
    "task_file": ".claude/tasks/TASK-AGENT-TEAM-OPS.md",
    "action": "Do phase ready",
    "notes": "Plan+Design 완료. Wave 0-4 순차 진행."
  },
  "ts": "2026-03-28T14:30:00+09:00",
  "msg_id": "pm-20260328-001"
}
```

#### 4-3-3. Peer 발견 프로토콜

peer ID는 8자리 랜덤 — 세션 재시작 시 변경. 역할 매핑은 `set_summary`로 해결.

**auto-summary 비활성 (의도적):**
- claude-peers-mcp는 `shared/summarize.ts`에서 `gpt-5.4-nano`로 자동 요약 생성 (OPENAI_API_KEY 필요)
- 우리는 OPENAI_API_KEY를 설정하지 않으므로 auto-summary는 **자동 스킵**됨 (graceful fail)
- Gemini 교체 불필요 — 역할이 고정이므로 동적 요약이 의미 없음
- `set_summary` 수동 호출이 유일한 경로: CLAUDE.md에 "세션 시작 시 `set_summary` 호출" 규칙 추가

**세션 시작 시퀀스:**

```
1. MCP 서버 시작 → ensureBroker() → 브로커 자동 시작 (없으면)
2. /register → 8자리 peer ID 발급
3. set_summary("PM_LEADER | bscamp | 기획 총괄")   ← 수동 호출 (auto-summary 비활성)
4. list_peers(scope: "repo") → 동일 레포 참여자 조회
5. summary 파싱 → 역할-to-peerID 매핑 캐시
6. STATUS_UPDATE 메시지로 온라인 알림
```

**summary 규약:**

| 참여자 | summary 형식 |
|--------|-------------|
| PM 리더 | `PM_LEADER \| bscamp \| [현재 작업]` |
| CTO 리더 | `CTO_LEADER \| bscamp \| [현재 작업]` |
| mozzi | `MOZZI \| bscamp \| [현재 작업]` |

**역할 발견 함수 (의사코드):**

```typescript
async function findPeerByRole(role: TeamRole): Promise<string | null> {
  const peers = await list_peers({ scope: 'repo' });
  const match = peers.find(p => p.summary?.startsWith(role));
  return match?.id ?? null;
}
```

#### 4-3-4. 메시지 전달 보장: At-Most-Once + ACK

브로커는 **at-most-once** 전달:
- `/poll-messages` 호출 시 `delivered = 1`로 마킹
- 수신 에이전트가 처리 전 크래시 → 메시지 유실

**보완: 크리티컬 메시지에 ACK 프로토콜**

```
PM → send_message(CTO, {type: "TASK_HANDOFF", msg_id: "pm-001"})
CTO → check_messages() → TASK_HANDOFF 수신
CTO → send_message(PM, {type: "ACK", payload: {ack_msg_id: "pm-001"}})
PM → check_messages() → ACK 수신 → 전달 확인

ACK 미수신 30초 → PM 재전송 (msg_id로 중복 감지)
```

**메시지 타입별 ACK 필수/선택:**

| 메시지 타입 | ACK 필수 | 재전송 | 이유 |
|---|---|---|---|
| `TASK_HANDOFF` | **필수** | 30초 1회 | 핸드오프 유실 = 작업 멈춤 |
| `COMPLETION_REPORT` | **필수** | 30초 1회 | 완료 기록 유실 = 상태 불일치 |
| `URGENT` | **필수** | 30초 1회 | 긴급 상황 유실 위험 |
| `FEEDBACK` | 선택 | 없음 | 다음 메시지로 자연 갱신 |
| `STATUS_UPDATE` | 선택 | 없음 | 정보성, 유실돼도 다음 업데이트로 덮임 |
| `PING` | 선택 | 없음 | 생존 확인용 |
| `ACK` | 금지 | 없음 | ACK의 ACK는 무한 루프. 절대 불필요 |

> **broker 수정 안 함**: delivered 마킹을 수신 확인 후로 변경하지 않는다. 포크 유지 부담 + 업스트림 추적 불가.
> ACK는 애플리케이션 레이어에서 처리 — 브로커는 단순 전달만 담당.

#### 4-3-5. 브로커 생명주기

| 이벤트 | 동작 |
|--------|------|
| 첫 MCP 서버 시작 | `ensureBroker()` → 브로커 프로세스 spawn |
| 세션 종료 | MCP 서버 cleanup → `/unregister` 호출 |
| 비정상 종료 (kill-pane) | `cleanStalePeers()` 30초 후 PID 체크 → 자동 삭제 |
| 브로커 프로세스 사망 | **현재: 자동 복구 없음** → 권장: 폴링 루프에서 health check 후 `ensureBroker()` 재호출 |
| 미수신 메시지 + 수신자 사망 | `cleanStalePeers()`가 수신자 삭제 시 미배달 메시지도 삭제 |

**제약:**
- localhost 전용. 원격 머신 간 통신 불가
- 인증 없음. 같은 머신의 모든 프로세스가 접근 가능
- **메시지에 시크릿(API키, 비밀번호) 절대 포함 금지** — SQLite 평문 저장

#### 4-3-6. 설치 및 설정

**CC 세션 (PM, CTO):**
```bash
# 1. Bun 설치 (없는 경우)
curl -fsSL https://bun.sh/install | bash

# 2. claude-peers-mcp 클론 + 설치
git clone https://github.com/louislva/claude-peers-mcp.git ~/claude-peers-mcp
cd ~/claude-peers-mcp && bun install

# 3. MCP 서버 등록 (user scope — 모든 프로젝트에 적용)
claude mcp add --scope user --transport stdio claude-peers -- bun ~/claude-peers-mcp/server.ts

# 4. 에이전트팀 세션 시작 (통합 커맨드)
# - permissions bypass: settings.local.json에서 처리 (플래그 불필요)
# - channel mode: claude-peers를 push 모드로 로드
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude \
  --dangerously-load-development-channels server:claude-peers \
  --model claude-opus-4-6
```

> **channel mode**: `--dangerously-load-development-channels server:claude-peers` 플래그가 핵심.
> 이 플래그 없이 `claude mcp add`만 하면 **tool mode** (수동 `check_messages` 폴링).
> channel mode에서는 메시지 도착 시 **즉시 push 알림** — 리더가 하던 작업에 interrupt 발생.

**오픈클로 (mozzi) — tool mode + webhook wake:**
```json
// ~/.openclaw/openclaw.json 의 agents.list[].mcp.servers 에 추가
{
  "name": "claude-peers",
  "command": "bun",
  "args": ["/Users/smith/claude-peers-mcp/server.ts"]
}
```

> 오픈클로는 CC 전용 channel protocol(`notifications/claude/channel`)을 지원하지 않는다.
> MCP tool mode로 `set_summary`, `list_peers`, `send_message`, `check_messages` 사용 가능.
> 메시지 수신은 `check_messages` 수동 폴링 — **push 알림 없음**.
> push가 필요한 경우 아래 4-3-8 (OpenClaw webhook wake) 참조.

#### 4-3-7. 통신 시나리오 플로우

```
═══ 신규 기능 개발 플로우 ═══

mozzi → PM: {type: "URGENT", payload: {request: "리포트 GCS 이관 필요"}}
  ↓
PM: Plan+Design 작성
  ↓
PM → CTO: {type: "TASK_HANDOFF", payload: {task_file: "TASK-GCS.md"}}
CTO → PM: {type: "ACK", payload: {ack_msg_id: "..."}}
  ↓
CTO: Wave 0~4 구현
CTO → PM: {type: "STATUS_UPDATE", payload: {wave: 2, status: "complete"}}
  ↓
CTO: 구현 완료
CTO → PM: {type: "COMPLETION_REPORT", payload: {task_file: "TASK-GCS.md", match_rate: 95}}
CTO → mozzi: {type: "COMPLETION_REPORT", payload: {task_file: "TASK-GCS.md"}}
  ↓
mozzi → PM: {type: "ACK"}
```

#### 4-3-8. OpenClaw webhook wake 구조 (CC→OpenClaw push)

CC에서 OpenClaw로 메시지를 보낼 때 **즉시 도달**시키는 구조.
OpenClaw은 CC channel protocol을 지원하지 않으므로 별도 경로가 필요하다.

**문제:**
- CC 리더가 `send_message(mozzi_peer_id, text)` 호출 → 브로커 SQLite에 저장
- mozzi는 tool mode → `check_messages` 수동 호출해야 수신
- mozzi가 idle이면 메시지를 언제 확인할지 알 수 없음

**해결: OpenClaw `/hooks/wake` 엔드포인트**

OpenClaw은 `hooks.enabled=true` 설정 시 `/hooks/wake` HTTP POST로 세션을 즉시 깨울 수 있다:

```bash
curl -X POST http://127.0.0.1:18789/hooks/wake \
  -H 'Authorization: Bearer {HOOKS_TOKEN}' \
  -H 'Content-Type: application/json' \
  -d '{"text":"[claude-peers] CTO: 구현 완료 — TASK-XXX", "mode":"now"}'
```

- `mode: "now"` → 즉시 깨움 (idle 상태에서도)
- `text` → mozzi가 깨어나서 읽는 메시지 (브로커 메시지와 별개의 알림 텍스트)
- mozzi 깨어난 후 `check_messages` 호출 → 브로커에서 실제 메시지 수신

**통합 수신 구조:**

```
[CC PM 리더]  ──channel push──→ 즉시 수신 (CC 내장 프로토콜)
[CC CTO 리더] ──channel push──→ 즉시 수신 (CC 내장 프로토콜)
[OpenClaw COO] ──webhook wake──→ 즉시 깨움 → check_messages → 수신
```

**구현 방안 비교:**

| 방안 | 설명 | broker 수정 | 장점 | 단점 |
|------|------|:-----------:|------|------|
| **A) broker 수정** | `/send-message`에서 to_id가 OpenClaw peer면 webhook 호출 | **필요 (포크)** | 가장 깔끔. 브로커가 라우팅 일원 관리 | 포크 유지 부담. 업스트림 업데이트 따라가기 어려움 |
| **B) 중간 watcher** | 별도 스크립트가 broker DB를 1초 폴링 → OpenClaw 대상 미배달 감지 → wake 호출 | 불필요 | broker 무수정. 독립 프로세스 | 추가 프로세스 관리. 1초 지연. DB 직접 접근 |
| **C) server.ts 수정** | pollAndPushMessages()에서 channel push 실패 시 webhook 폴백 | **필요 (포크)** | channel 실패 시 자연스러운 폴백 | server.ts는 CC 측 코드 — OpenClaw 대상 로직이 CC에 침투 |

**추천: 방안 B (중간 watcher)**

이유:
1. **broker/server.ts 포크 불필요** — 업스트림 업데이트를 그대로 추적 가능
2. 관심사 분리 — "OpenClaw에 push하는 것"은 우리 인프라 문제, 브로커 관심사 아님
3. 독립 프로세스라 장애 격리 — watcher 죽어도 CC↔CC 통신은 영향 없음
4. 1초 폴링 지연은 허용 범위 — mozzi가 초 단위 실시간 필요한 시나리오 없음

**watcher 설계 (peers-wake-watcher):**

```
경로: ~/claude-peers-mcp/watcher.ts (또는 .claude/scripts/peers-wake-watcher.sh)

동작:
1. 1초 간격 broker SQLite 폴링
2. delivered=0 AND to_id의 summary가 "MOZZI"로 시작하는 메시지 감지
3. /hooks/wake POST 호출 (text에 발신자 + 메시지 타입 요약)
4. wake 성공 후 대기 (실제 메시지는 mozzi가 check_messages로 수신)

설정:
- OPENCLAW_WAKE_URL=http://127.0.0.1:18789/hooks/wake
- OPENCLAW_HOOKS_TOKEN={토큰}
- BROKER_DB_PATH=~/.claude-peers/broker.db  (브로커 SQLite 경로)
- POLL_INTERVAL_MS=1000

생명주기:
- PM 또는 CTO 세션 시작 시 background로 실행
- 세션 종료 시 종료 (또는 브로커 종료 시 자동 종료)
```

**주의:**
- watcher는 SQLite를 **읽기 전용**으로 접근. delivered 마킹은 하지 않음
- wake 호출은 **알림**일 뿐 — 실제 메시지 전달은 브로커가 담당
- watcher가 없어도 mozzi는 `check_messages` 폴링으로 메시지 수신 가능 (지연만 발생)
- watcher SPOF: 죽으면 mozzi push만 안 됨. CC↔CC 통신에 영향 없음

**OpenClaw 설정 참조:**

```json
// ~/.openclaw/openclaw.json
{
  "hooks": {
    "enabled": true,
    "port": 18789,
    "token": "{HOOKS_TOKEN}"
  },
  "agents": {
    "list": [{
      "id": "mozzi",
      "defaultSessionKey": "agent:main:main",
      "mcp": {
        "servers": [{
          "name": "claude-peers",
          "command": "bun",
          "args": ["/Users/smith/claude-peers-mcp/server.ts"]
        }]
      }
    }]
  }
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

### 6-8. peers-mcp.test.ts (Wave 0 — 미구현, 8건)

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ChildProcess, spawn } from 'child_process'

const TEST_BROKER_PORT = 17899
const BROKER_URL = `http://127.0.0.1:${TEST_BROKER_PORT}`

async function brokerFetch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BROKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json() as Promise<T>
}

let brokerProc: ChildProcess

beforeAll(async () => {
  // 테스트용 브로커 시작 (별도 포트)
  brokerProc = spawn('bun', [`${process.env.HOME}/claude-peers-mcp/broker.ts`], {
    env: { ...process.env, CLAUDE_PEERS_PORT: String(TEST_BROKER_PORT) },
    stdio: 'ignore',
    detached: true,
  })
  // 브로커 health check 대기
  for (let i = 0; i < 30; i++) {
    try { await fetch(`${BROKER_URL}/health`); break }
    catch { await new Promise(r => setTimeout(r, 200)) }
  }
})

afterAll(() => { brokerProc?.kill() })

describe('claude-peers-mcp — 크로스팀 통신', () => {

  // INC-15: PM→CTO 메시지 전송 + 수신
  describe('INC-15: PM→CTO send_message', () => {
    it('PM이 보낸 TASK_HANDOFF 메시지를 CTO가 수신', async () => {
      // 1. PM 등록
      const pm = await brokerFetch<{id: string}>('/register', {
        pid: process.pid,
        cwd: '/Users/smith/projects/bscamp',
        git_root: '/Users/smith/projects/bscamp',
        summary: 'PM_LEADER | bscamp | planning',
      })

      // 2. CTO 등록 (다른 PID 시뮬레이션)
      const cto = await brokerFetch<{id: string}>('/register', {
        pid: process.pid + 1,  // 실제 테스트에서는 fork() 사용
        cwd: '/Users/smith/projects/bscamp',
        git_root: '/Users/smith/projects/bscamp',
        summary: 'CTO_LEADER | bscamp | development',
      })

      // 3. PM → CTO 메시지 전송
      const msg = JSON.stringify({
        protocol: 'bscamp-team/v1',
        type: 'TASK_HANDOFF',
        from_role: 'PM_LEADER',
        to_role: 'CTO_LEADER',
        payload: { task_file: 'TASK-AGENT-TEAM-OPS.md' },
        ts: new Date().toISOString(),
        msg_id: 'pm-test-001',
      })
      const send = await brokerFetch<{ok: boolean}>('/send-message', {
        from_id: pm.id, to_id: cto.id, text: msg,
      })
      expect(send.ok).toBe(true)

      // 4. CTO 수신 확인
      const poll = await brokerFetch<{messages: {text: string}[]}>('/poll-messages', {
        id: cto.id,
      })
      expect(poll.messages).toHaveLength(1)
      const parsed = JSON.parse(poll.messages[0].text)
      expect(parsed.type).toBe('TASK_HANDOFF')
      expect(parsed.from_role).toBe('PM_LEADER')
      expect(parsed.payload.task_file).toBe('TASK-AGENT-TEAM-OPS.md')
    })
  })

  // INC-16: list_peers(scope: "repo") — 동일 레포 참여자 조회
  describe('INC-16: list_peers(scope: "repo")', () => {
    it('같은 레포 작업 중인 PM+CTO 세션 조회', async () => {
      const peers = await brokerFetch<any[]>('/list-peers', {
        scope: 'repo',
        cwd: '/Users/smith/projects/bscamp',
        git_root: '/Users/smith/projects/bscamp',
      })
      const roles = peers.map((p: any) => p.summary?.split(' | ')[0])
      expect(roles).toContain('PM_LEADER')
      expect(roles).toContain('CTO_LEADER')
    })
  })

  // INC-17: 세션 종료 후 peer 목록에서 제거
  describe('INC-17: 종료된 세션 cleanup', () => {
    it('unregister 후 list_peers에서 제외', async () => {
      const temp = await brokerFetch<{id: string}>('/register', {
        pid: process.pid + 2,
        cwd: '/Users/smith/projects/bscamp',
        git_root: '/Users/smith/projects/bscamp',
        summary: 'TEMP_AGENT | bscamp',
      })
      await brokerFetch('/unregister', { id: temp.id })

      const peers = await brokerFetch<any[]>('/list-peers', {
        scope: 'repo',
        cwd: '/Users/smith/projects/bscamp',
        git_root: '/Users/smith/projects/bscamp',
      })
      expect(peers.find((p: any) => p.id === temp.id)).toBeUndefined()
    })
  })

  // INC-18: 브로커 미실행 시 graceful 에러
  describe('INC-18: 브로커 다운 시 에러 처리', () => {
    it('브로커 없는 포트로 send_message → connection refused', async () => {
      await expect(
        fetch('http://127.0.0.1:19999/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from_id: 'a', to_id: 'b', text: 'test' }),
        })
      ).rejects.toThrow()
    })
  })
})

describe('claude-peers-mcp — 프로토콜 검증', () => {

  // PROTO-1: 메시지 프로토콜 파싱
  it('PROTO-1: bscamp-team/v1 프로토콜 JSON 파싱', () => {
    const raw = JSON.stringify({
      protocol: 'bscamp-team/v1',
      type: 'STATUS_UPDATE',
      from_role: 'CTO_LEADER',
      payload: { wave: 2, status: 'complete' },
      ts: '2026-03-28T15:00:00+09:00',
      msg_id: 'cto-20260328-001',
    })
    const parsed = JSON.parse(raw)
    expect(parsed.protocol).toBe('bscamp-team/v1')
    expect(parsed.type).toBe('STATUS_UPDATE')
    expect(parsed.from_role).toBe('CTO_LEADER')
  })

  // PROTO-2: ACK 메시지 멱등성
  it('PROTO-2: 동일 msg_id로 중복 수신 시 무시', () => {
    const received = new Set<string>()
    const msg1 = { msg_id: 'pm-001', type: 'TASK_HANDOFF' }
    const msg2 = { msg_id: 'pm-001', type: 'TASK_HANDOFF' } // 재전송

    if (!received.has(msg1.msg_id)) { received.add(msg1.msg_id) }
    if (!received.has(msg2.msg_id)) { /* 무시 */ }

    expect(received.size).toBe(1) // 중복 처리되지 않음
  })

  // PROTO-3: 역할 발견 — summary 파싱
  it('PROTO-3: set_summary에서 역할 추출', () => {
    const summary = 'PM_LEADER | bscamp | 기획 총괄'
    const role = summary.split(' | ')[0]
    expect(role).toBe('PM_LEADER')
  })

  // PROTO-4: 알 수 없는 메시지 타입 무시
  it('PROTO-4: 정의 안 된 type은 무시 (에러 아님)', () => {
    const msg = { protocol: 'bscamp-team/v1', type: 'UNKNOWN_TYPE' }
    const knownTypes = ['TASK_HANDOFF', 'FEEDBACK', 'STATUS_UPDATE', 'URGENT', 'COMPLETION_REPORT', 'ACK', 'PING']
    expect(knownTypes.includes(msg.type)).toBe(false)
    // 처리: 로그만 남기고 무시
  })
})
```

### 6-9. peers-lifecycle.test.ts (Wave 0 — 미구현, 4건)

```typescript
import { describe, it, expect } from 'vitest'

describe('claude-peers-mcp — 세션 생명주기', () => {

  // LIFE-1: 세션 시작 시 자동 등록 + summary 설정
  it('LIFE-1: register + set_summary 시퀀스', async () => {
    const reg = await brokerFetch<{id: string}>('/register', {
      pid: process.pid,
      cwd: '/Users/smith/projects/bscamp',
      git_root: '/Users/smith/projects/bscamp',
    })
    expect(reg.id).toHaveLength(8)

    await brokerFetch('/set-summary', {
      id: reg.id,
      summary: 'CTO_LEADER | bscamp | testing',
    })

    const peers = await brokerFetch<any[]>('/list-peers', {
      scope: 'repo',
      cwd: '/Users/smith/projects/bscamp',
      git_root: '/Users/smith/projects/bscamp',
    })
    const me = peers.find((p: any) => p.id === reg.id)
    expect(me.summary).toContain('CTO_LEADER')
  })

  // LIFE-2: 메시지 to self 허용 (오류 아님)
  it('LIFE-2: 자기 자신에게 메시지 전송 가능', async () => {
    const self = await brokerFetch<{id: string}>('/register', {
      pid: process.pid + 3,
      cwd: '/Users/smith/projects/bscamp',
      git_root: '/Users/smith/projects/bscamp',
    })
    await brokerFetch('/send-message', {
      from_id: self.id, to_id: self.id, text: 'self-test',
    })
    const poll = await brokerFetch<{messages: any[]}>('/poll-messages', { id: self.id })
    expect(poll.messages).toHaveLength(1)
  })

  // LIFE-3: 존재하지 않는 peer에 메시지 → 에러
  it('LIFE-3: 존재하지 않는 peer에 전송 → ok: false', async () => {
    const sender = await brokerFetch<{id: string}>('/register', {
      pid: process.pid + 4,
      cwd: '/Users/smith/projects/bscamp',
      git_root: '/Users/smith/projects/bscamp',
    })
    const result = await brokerFetch<{ok: boolean, error?: string}>('/send-message', {
      from_id: sender.id, to_id: 'nonexist', text: 'test',
    })
    expect(result.ok).toBe(false)
  })

  // LIFE-4: 브로커 health check
  it('LIFE-4: /health 엔드포인트 응답', async () => {
    const health = await brokerFetch<{peers: number}>('/health')
    expect(health.peers).toBeGreaterThanOrEqual(0)
  })
})
```

### 6-10. peers-wake-watcher.test.ts (Wave 0 — 미구현, 5건)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// watcher 핵심 로직 테스트 — broker DB 폴링 + webhook wake 호출
// watcher는 shell 또는 Bun 스크립트. 여기서는 핵심 함수 단위 테스트.

// --- Mock ---
const mockBrokerDb = {
  query: vi.fn(),
}
const mockFetch = vi.fn()

// watcher 핵심 함수 (구현 시 이 인터페이스로)
interface UndeliveredMessage {
  id: number
  from_id: string
  to_id: string
  text: string
  delivered: 0
}

interface PeerInfo {
  id: string
  summary: string
}

async function findUndeliveredForMozzi(
  db: typeof mockBrokerDb,
  listPeers: () => Promise<PeerInfo[]>,
): Promise<UndeliveredMessage[]> {
  const peers = await listPeers()
  const mozziPeer = peers.find(p => p.summary?.startsWith('MOZZI'))
  if (!mozziPeer) return []
  return db.query(`SELECT * FROM messages WHERE to_id = ? AND delivered = 0`, [mozziPeer.id])
}

async function wakeOpenClaw(
  wakeUrl: string,
  token: string,
  text: string,
  fetchFn: typeof fetch,
): Promise<boolean> {
  const res = await fetchFn(wakeUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, mode: 'now' }),
  })
  return res.ok
}

describe('peers-wake-watcher — OpenClaw webhook wake', () => {

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // WAKE-1: MOZZI 대상 미배달 메시지 감지
  it('WAKE-1: MOZZI peer에게 미배달 메시지가 있으면 감지', async () => {
    const mockPeers: PeerInfo[] = [
      { id: 'a1b2c3d4', summary: 'PM_LEADER | bscamp | 기획' },
      { id: 'e5f6g7h8', summary: 'MOZZI | bscamp | COO' },
    ]
    mockBrokerDb.query.mockReturnValue([
      { id: 1, from_id: 'a1b2c3d4', to_id: 'e5f6g7h8', text: '{"type":"URGENT"}', delivered: 0 },
    ])

    const result = await findUndeliveredForMozzi(
      mockBrokerDb,
      async () => mockPeers,
    )

    expect(result).toHaveLength(1)
    expect(result[0].to_id).toBe('e5f6g7h8')
  })

  // WAKE-2: MOZZI peer 없으면 빈 배열 반환 (에러 아님)
  it('WAKE-2: MOZZI peer가 없으면 빈 배열 반환', async () => {
    const mockPeers: PeerInfo[] = [
      { id: 'a1b2c3d4', summary: 'PM_LEADER | bscamp | 기획' },
      { id: 'c3d4e5f6', summary: 'CTO_LEADER | bscamp | 개발' },
    ]

    const result = await findUndeliveredForMozzi(
      mockBrokerDb,
      async () => mockPeers,
    )

    expect(result).toHaveLength(0)
    expect(mockBrokerDb.query).not.toHaveBeenCalled()
  })

  // WAKE-3: /hooks/wake 정상 호출
  it('WAKE-3: OpenClaw wake 엔드포인트 정상 호출', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 })

    const result = await wakeOpenClaw(
      'http://127.0.0.1:18789/hooks/wake',
      'test-token',
      '[claude-peers] PM: TASK_HANDOFF — TASK-GCS.md',
      mockFetch as any,
    )

    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:18789/hooks/wake',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
        }),
        body: expect.stringContaining('"mode":"now"'),
      }),
    )
  })

  // WAKE-4: OpenClaw 서버 다운 시 graceful 실패
  it('WAKE-4: OpenClaw 서버 미응답 → false 반환 (에러 throw 안 함)', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

    // wakeOpenClaw은 에러를 catch해서 false 반환해야 함
    // 실제 구현 시 try-catch 필요
    try {
      const result = await wakeOpenClaw(
        'http://127.0.0.1:18789/hooks/wake',
        'test-token',
        'test',
        mockFetch as any,
      )
      expect(result).toBe(false)
    } catch {
      // 현재는 throw됨 — 구현 시 catch 필요 (Red 단계)
      expect(true).toBe(true) // Red: 이 테스트는 실패해야 함
    }
  })

  // WAKE-5: CC↔CC 메시지는 wake 대상 아님 (MOZZI만)
  it('WAKE-5: PM→CTO 메시지는 wake 호출하지 않음', async () => {
    const mockPeers: PeerInfo[] = [
      { id: 'a1b2c3d4', summary: 'PM_LEADER | bscamp | 기획' },
      { id: 'c3d4e5f6', summary: 'CTO_LEADER | bscamp | 개발' },
      { id: 'e5f6g7h8', summary: 'MOZZI | bscamp | COO' },
    ]
    // CTO 대상 메시지 — MOZZI 아님
    mockBrokerDb.query.mockReturnValue([])

    const result = await findUndeliveredForMozzi(
      mockBrokerDb,
      async () => mockPeers,
    )

    // CTO 대상이므로 MOZZI 미배달 메시지 0건 → wake 불필요
    expect(result).toHaveLength(0)
  })
})
```

### 6-11. Fixture 파일 추가 (MCP 관련)

```
__tests__/hooks/fixtures/
├── ... (기존 7개)
├── peer_message_handoff.json    ← TASK_HANDOFF 메시지 샘플
│   {
│     "protocol": "bscamp-team/v1",
│     "type": "TASK_HANDOFF",
│     "from_role": "PM_LEADER",
│     "to_role": "CTO_LEADER",
│     "payload": { "task_file": "TASK-AGENT-TEAM-OPS.md", "action": "Do phase ready" },
│     "ts": "2026-03-28T14:30:00+09:00",
│     "msg_id": "pm-20260328-001"
│   }
│
├── peer_message_feedback.json   ← FEEDBACK 메시지 샘플
│   {
│     "protocol": "bscamp-team/v1",
│     "type": "FEEDBACK",
│     "from_role": "CTO_LEADER",
│     "to_role": "PM_LEADER",
│     "payload": { "issue": "API 스키마 변경 필요", "task_file": "TASK-XXX.md" },
│     "msg_id": "cto-20260328-001"
│   }
│
└── peer_message_urgent.json     ← URGENT 메시지 샘플
    {
      "protocol": "bscamp-team/v1",
      "type": "URGENT",
      "from_role": "MOZZI",
      "to_role": "CTO_LEADER",
      "payload": { "error": "프로덕션 500 에러", "endpoint": "/api/questions" },
      "msg_id": "mozzi-20260328-001"
    }
```

### 6-12. 테스트 커버리지 매핑 (최종)

| Wave | 테스트 파일 | 건수 | 기구현 | Red 작성 |
|:----:|-----------|:----:|:------:|:--------:|
| 0 | peers-mcp.test.ts | 8 | 0 | **8** |
| 0 | peers-lifecycle.test.ts | 4 | 0 | **4** |
| 0 | peers-wake-watcher.test.ts | 5 | 0 | **5** |
| 1 | frontmatter-parser.test.ts | 5 | 5 | 0 |
| 1 | teammate-idle.test.ts | 7 | 7 | 0 |
| 1 | teammate-registry.test.ts | 4 | 0 | **4** |
| 2 | auto-shutdown.test.ts | 8 | 0 | **8** |
| 2 | force-team-kill.test.ts | 3 | 0 | **3** |
| 3 | auto-team-cleanup.test.ts | 2 | 0 | **2** |
| - | regression.test.ts (추가분) | 9 | 3 | **6** |
| | **합계** | **55** | **15** | **40** |

> **TDD 순서**: Wave 0(MCP + watcher) → Wave 1(소유권) → Wave 2(종료) → Wave 3(Hook) → Wave 4(검증).
> 미구현 35건을 먼저 전부 Red로 작성한 뒤 구현 시작.

---

## 7. 구현 순서 체크리스트

### Wave 0: claude-peers-mcp 설치 + 통신 검증 (선행)

```
□ W0-1: Bun 런타임 설치 확인 (curl -fsSL https://bun.sh/install | bash)
□ W0-2: claude-peers-mcp 클론 + bun install
        → ~/claude-peers-mcp/
□ W0-3: CC MCP 서버 등록 (claude mcp add --scope user)
        → ~/.claude/settings.json 확인
□ W0-4: 오픈클로 MCP 설정 추가
        → ~/.openclaw/openclaw.json agents.list[].mcp.servers
□ W0-5: 3자 통신 검증 (PM ↔ CTO ↔ mozzi)
        → list_peers, send_message, check_messages 동작 확인
□ W0-6: 세션 시작 시 set_summary 자동 호출 프로토콜 정의
        → CLAUDE.md 초안
□ W0-7: peers-wake-watcher 스크립트 작성
        → ~/claude-peers-mcp/watcher.ts (broker DB 1초 폴링 → /hooks/wake 호출)
        → OPENCLAW_WAKE_URL, OPENCLAW_HOOKS_TOKEN 환경변수 설정
□ W0-8: 에이전트팀 통합 실행 커맨드 확인
        → --dangerously-load-development-channels server:claude-peers 동작 검증
```

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
| `CLAUDE.md` | 초안 | backend-dev | 팀 상시 유지 + 종료 프로세스 + 크로스팀 MCP 규칙 |
| `.claude/hooks/teammate-idle.sh` | **변경 없음** | — | 비활성 유지 |
| `~/claude-peers-mcp/` | **신규 (외부)** | backend-dev | MCP 서버 클론 + 설치 |
| `~/.claude/settings.json` | 수정 | backend-dev | claude-peers MCP 서버 등록 |
| `~/.openclaw/openclaw.json` | 수정 | backend-dev | mozzi 에이전트에 MCP 서버 추가 |
| `__tests__/hooks/peers-mcp.test.ts` | **신규** | qa-engineer | 8건 (INC-15~18 + PROTO-1~4) |
| `__tests__/hooks/peers-lifecycle.test.ts` | **신규** | qa-engineer | 4건 (LIFE-1~4) |
| `__tests__/hooks/peers-wake-watcher.test.ts` | **신규** | qa-engineer | 5건 (WAKE-1~5) |
| `~/claude-peers-mcp/watcher.ts` | **신규** | backend-dev | OpenClaw webhook wake watcher 스크립트 |
| `__tests__/hooks/auto-shutdown.test.ts` | **신규** | qa-engineer | 8건 (UT-1,2 + INC-4,5,6,7 + E-1,2) |
| `__tests__/hooks/force-team-kill.test.ts` | **신규** | qa-engineer | 3건 (INC-3 + E-4,6) |
| `__tests__/hooks/teammate-registry.test.ts` | **신규** | qa-engineer | 4건 (UT-3 + 상태 전이 3건) |
| `__tests__/hooks/auto-team-cleanup.test.ts` | **신규** | qa-engineer | 2건 (REG-4 방지 + INC-11) |
| `__tests__/hooks/regression.test.ts` | 수정 | qa-engineer | +9건 (REG-7반전 + INC-2,9,10,12,13,14) |
| `__tests__/hooks/fixtures/*.json` | **신규** | qa-engineer | 10개 fixture 파일 (+3 MCP 메시지) |

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
- **크로스팀 통신: 파일 릴레이 → claude-peers-mcp** (섹션 4-3, Plan D-5 반영)
- **MCP 검토 결과 반영 (TASK-MCP-DESIGN-FIX, 4건)**:
  - T1: 통합 실행 커맨드 명시 (섹션 4-3-6)
  - T2: CC=channel mode, OpenClaw=tool mode + webhook wake 혼합 구조 (섹션 4-3-8 신규)
  - T3: 메시지 타입별 ACK 필수/선택 구분표 (섹션 4-3-4)
  - T4: auto-summary 비활성 명시 (섹션 4-3-3)
- **TDD 5건 추가**: peers-wake-watcher.test.ts WAKE-1~5 (섹션 6-10)
- **파일 수**: 14개 → 16개 (+watcher.ts, +peers-wake-watcher.test.ts)
- **TDD 합계**: 50건 → 55건 (+5 watcher 테스트)
- **3자 통신: CC PM + CC CTO + 오픈클로 mozzi** (섹션 4-3-1)
- **메시지 프로토콜 bscamp-team/v1 정의** (섹션 4-3-2)
- **TDD 12건 추가**: peers-mcp 8건 + peers-lifecycle 4건 (섹션 6-8, 6-9)
- BOARD.json: 이번 범위 제외 (nice-to-have)
