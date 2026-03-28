# Hook + TASK 소유권 기술 구현 기획서

> **CTO 관점 기술적 구현 방안** — PM 프로세스 기획서(`task-ownership-process.plan.md`)의 기술 pair
> 작성일: 2026-03-28
> PDCA 레벨: L1 (src/ 미수정, .claude/ hooks + settings 정비)
> 상태: Plan

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | Hook + TASK 소유권 기술 구현 |
| **작성일** | 2026-03-28 |
| **예상 소요** | Wave 1~3, 총 3단계 |
| **핵심 문제** | Hook 스크립트가 팀/세션 컨텍스트 없이 전체 TASK를 스캔 → 크로스팀 배정 + 무한 루프 |
| **핵심 해결** | YAML 프론트매터 + team-context.json + Hook 등록 정비 |
| **PDCA 레벨** | L1 (src/ 미수정) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | teammate-idle.sh가 팀 구분 없이 TASK-*.md 전체 스캔 → 다른 팀 TASK를 배정 → 무한 루프 |
| **Solution** | TASK 프론트매터로 소유권 명시 + team-context.json으로 런타임 필터링 |
| **Function UX Effect** | 팀원이 자기 팀 TASK만 수신, 리더가 크로스팀 충돌 무시 가능 |
| **Core Value** | 다팀 병렬 운영 안정화 — 동시 3팀 운영 시 토큰/시간 낭비 제거 |

---

## 1. TASK 파일 YAML 프론트매터 구조

### 1-1. 스키마 정의

```yaml
---
team: CTO-1              # 필수. TeamCreate 시 지정한 팀명
session: sdk-cto          # 선택. tmux 세션명 (다중 세션 구분용)
created: 2026-03-28       # 필수. TASK 생성일
status: in-progress       # 필수. pending | in-progress | completed | archived
owner: leader             # 필수. TASK 소유자 (보통 leader)
pdcaFeature: cto-resume   # 선택. docs/.pdca-status.json의 기능명 역참조
assignees:                # 선택. 팀원별 담당 태스크
  - role: backend-dev
    tasks: [T1, T2, T3]
  - role: frontend-dev
    tasks: [T13, T14]
  - role: qa-engineer
    tasks: [T20]
---
```

### 1-2. 필드 정의

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `team` | string | Y | — | 팀 식별자. TeamCreate 이름과 일치 |
| `session` | string | N | — | tmux 세션명 |
| `created` | date (YYYY-MM-DD) | Y | — | TASK 생성일 |
| `status` | enum | Y | `pending` | `pending` / `in-progress` / `completed` / `archived` |
| `owner` | string | Y | `leader` | TASK 소유자 |
| `pdcaFeature` | string | N | — | PDCA 기능명 역참조 |
| `assignees` | array | N | `[]` | 팀원 역할 + 담당 태스크 ID 배열 |

### 1-3. Bash 파싱 로직

프론트매터는 `---` 로 감싸진 첫 번째 블록. awk로 추출:

```bash
# 프론트매터 추출 함수
parse_frontmatter() {
    local file="$1"
    local key="$2"
    awk '/^---$/{n++; next} n==1{print}' "$file" | grep "^${key}:" | sed "s/^${key}: *//"
}

# 사용 예
TEAM=$(parse_frontmatter "TASK-CTO-RESUME.md" "team")
STATUS=$(parse_frontmatter "TASK-CTO-RESUME.md" "status")
```

**주의**: 프론트매터 `---` 블록 내부의 `- [ ]` 패턴은 체크박스로 오인하지 않도록, 체크박스 스캔 시 프론트매터 영역을 제외해야 한다:

```bash
# 프론트매터 이후 영역에서만 체크박스 스캔
scan_checkboxes() {
    local file="$1"
    awk '/^---$/{n++; next} n>=2{print NR": "$0}' "$file" | grep '^\- \[ \]'
}
```

### 1-4. 기존 TASK 파일 마이그레이션

현재 `.claude/tasks/`에 남아있는 TASK 파일에 프론트매터를 추가한다.

| 파일 | team | status | 비고 |
|------|------|--------|------|
| TASK-CTO-RESUME.md | CTO-1 | in-progress | |
| TASK-CTO-CLEAN.md | CTO-1 | in-progress | |
| TASK-PM-RESUME.md | PM-1 | pending | 선행 조건 미충족 |
| TASK-MKT-RESUME.md | MKT-1 | pending | |
| TASK-LP-MEDIA-DOWNLOAD.md | unassigned | pending | 팀 미배정 |
| TASK-COLLECTION-GAPS.md | unassigned | pending | 팀 미배정 |
| TASK-COLLECT-AND-EMBED.md | unassigned | pending | 팀 미배정 |
| TASK-DEEPGAZE-GEMINI-PIPELINE.md | unassigned | pending | 팀 미배정 |
| TASK-GCS-STORAGE-MIGRATION.md | unassigned | pending | 팀 미배정 |

**규칙**: `team: unassigned`인 TASK는 어떤 팀의 teammate-idle에도 배정되지 않는다.

---

## 2. .claude/runtime/team-context.json 생성/참조

### 2-1. JSON 스키마

```json
{
  "team": "CTO-1",
  "session": "sdk-cto",
  "created": "2026-03-28T10:00:00+09:00",
  "taskFiles": [
    "TASK-CTO-RESUME.md",
    "TASK-CTO-CLEAN.md"
  ],
  "teammates": [
    { "role": "backend-dev", "paneIndex": 1 },
    { "role": "frontend-dev", "paneIndex": 2 },
    { "role": "qa-engineer", "paneIndex": 3 }
  ]
}
```

### 2-2. 생명주기

| 시점 | 행위 | 담당 |
|------|------|------|
| **TeamCreate 직후** | 리더가 team-context.json 생성 (Write tool) | 리더 |
| **팀원 spawn 시** | teammates 배열에 role + paneIndex 추가 | 리더 |
| **TASK 배정 시** | taskFiles 배열에 TASK 파일명 추가 | 리더 |
| **TeamDelete 직전** | validate-pdca-before-teamdelete.sh가 파일 삭제 | Hook 자동 |

### 2-3. Hook 참조 방법

모든 hook이 공통으로 사용하는 컨텍스트 로딩 패턴:

```bash
CONTEXT_FILE="$PROJECT_DIR/.claude/runtime/team-context.json"

load_team_context() {
    if [ ! -f "$CONTEXT_FILE" ]; then
        # 하위 호환: 파일 없으면 빈 값 (전체 스캔 폴백)
        TEAM_NAME=""
        TASK_FILES=""
        return 1
    fi

    # jq 파싱 실패 시 빈 값 폴백
    TEAM_NAME=$(jq -r '.team // empty' "$CONTEXT_FILE" 2>/dev/null) || TEAM_NAME=""
    TASK_FILES=$(jq -r '.taskFiles[]? // empty' "$CONTEXT_FILE" 2>/dev/null) || TASK_FILES=""
    return 0
}
```

### 2-4. 동시성

- 세션 당 활성 팀은 1개 (single team-context.json)
- 다중 팀은 별도 tmux 세션에서 운영 → 각 세션이 자체 Claude Code 인스턴스
- 동일 프로젝트 디렉토리에서 2개 팀이 동시 실행될 경우: **team-context.json이 덮어쓰기됨** → 이 경우 BOARD.json으로 팀별 소유권 판단 (2차 폴백)
- 실무적으로 Smith님은 tmux 세션 1개에서 1팀 운영하므로 충돌 가능성 낮음

---

## 3. Hook 31개 전수 정리

### 3-1. 분류 기준

| 분류 | 의미 |
|------|------|
| ✅ 유지 | 등록됨 + 현행 유지 |
| 🔧 개선 | 등록됨 + 로직 수정 필요 |
| ➕ 신규 등록 | 파일 있으나 미등록 → 등록 |
| ❌ 삭제 | 중복/비활성 → 파일 삭제 |
| ⏸️ 보류 | 파일 유지, 등록 안 함 |
| 🔨 헬퍼 | Hook이 아닌 source용 라이브러리 |

### 3-2. 전수 분류표

| # | 파일명 | 현재 이벤트 | 등록 상태 | 분류 | 조치 사유 |
|---|--------|------------|-----------|------|-----------|
| 1 | `pre-read-context.sh` | PreToolUse(Bash) | settings.json ✅ | ✅ 유지 | 세션 시작 가이드 |
| 2 | `validate-task.sh` | PreToolUse(Bash) | settings.json ✅ | ✅ 유지 | TASK 포맷 검증 |
| 3 | `validate-qa.sh` | PreToolUse(Bash) | 양쪽 ✅ | ✅ 유지 | 커밋 전 tsc 체크 |
| 4 | `validate-pdca.sh` | PreToolUse(Bash) | settings.json ✅ | ✅ 유지 | PDCA 문서 존재/신선도 |
| 5 | `destructive-detector.sh` | PreToolUse(Bash) | 양쪽 ✅ | ✅ 유지 | 위험 명령 차단 |
| 6 | `validate-design.sh` | PreToolUse(Bash+Edit) | 양쪽 ✅ | 🔧 개선 | **Bash에서 제거** — Edit\|Write만으로 충분. Bash에 등록되면 매 git commit마다 실행되어 불필요한 지연 |
| 7 | `enforce-qa-before-merge.sh` | PreToolUse(Bash) | 양쪽 ✅ | ✅ 유지 | main merge 전 QA 강제 |
| 8 | `pdca-single-source.sh` | PreToolUse(Bash) | settings.json ✅ | ✅ 유지 | PDCA 3곳 동기화 |
| 9 | `validate-delegate.sh` | PreToolUse(Edit\|Write) | 양쪽 ✅ | ✅ 유지 | 리더 코드 작성 차단 |
| 10 | `validate-plan.sh` | PreToolUse(Edit\|Write) | 양쪽 ✅ | ✅ 유지 | Plan 없이 코딩 차단 |
| 11 | `enforce-plan-before-do.sh` | PreToolUse(Edit\|Write) | 양쪽 ✅ | ✅ 유지 | Plan→Design→Do 순서 |
| 12 | `validate-before-delegate.sh` | PreToolUse(Task) | 양쪽 ✅ | ✅ 유지 | 위임 전 구조 확인 |
| 13 | `enforce-teamcreate.sh` | PreToolUse(Agent) | settings.local ✅ | ✅ 유지 | Agent 단독 spawn 차단 |
| 14 | `validate-pdca-before-teamdelete.sh` | PreToolUse(TeamDelete) | settings.json ✅ | 🔧 개선 | **team-context.json 삭제 로직 추가** |
| 15 | `notify-openclaw.sh` | Stop | 양쪽 ✅ | ❌ 삭제 | 비활성 (always exit 0). TaskCompleted에도 중복 등록(settings.local) |
| 16 | `task-completed.sh` | TaskCompleted | 양쪽 ✅ | 🔧 개선 | **BOARD.json 갱신 로직 추가** |
| 17 | `task-quality-gate.sh` | TaskCompleted | 양쪽 ✅ | ✅ 유지 | tsc+build 검증 |
| 18 | `pdca-update.sh` | TaskCompleted | settings.json ✅ | ✅ 유지 | PDCA 자동 갱신. **settings.local에 누락 → 추가 필요** |
| 19 | `notify-completion.sh` | TaskCompleted | 양쪽 ✅ | ✅ 유지 | 전체 완료 알림 |
| 20 | `pdca-sync-monitor.sh` | TaskCompleted | 양쪽 ✅ | ✅ 유지 | PDCA 동기화 모니터 |
| 21 | `auto-team-cleanup.sh` | TaskCompleted | settings.json ✅ | ✅ 유지 | 전체 완료 시 TeamDelete 안내. **settings.local에 누락 → 추가 필요** |
| 22 | `teammate-idle.sh` | TeammateIdle | settings.local ✅ (settings.json은 빈 배열) | 🔧 개선 | **소유권 필터링 로직 구현** (핵심 변경) |
| 23 | `agent-slack-notify.sh` | 미등록 | ❌ | ⏸️ 보류 | Slack 연동 미구현 |
| 24 | `agent-state-sync.sh` | 미등록 | ❌ | ⏸️ 보류 | team-context.json과 역할 중복 가능 → 추후 평가 |
| 25 | `detect-process-level.sh` | 미등록 (헬퍼) | ❌ | 🔨 헬퍼 | source용. 다른 hook에서 L0~L3 판단 시 사용 |
| 26 | `force-team-kill.sh` | 미등록 | ❌ | ⏸️ 보류 | 수동 긴급 종료 스크립트 (hook 아님) |
| 27 | `gap-analysis.sh` | 미등록 | ❌ | ➕ 신규 등록 | **TaskCompleted에 등록** — TASK 항목 vs staged 파일 매칭 |
| 28 | `notify-hook.sh` | 미등록 (비활성) | ❌ | ❌ 삭제 | always exit 0. notify-completion과 중복 |
| 29 | `notify-task-completed.sh` | 미등록 | ❌ | ❌ 삭제 | task-completed.sh와 중복 |
| 30 | `protect-stage.sh` | 미등록 | ❌ | ⏸️ 보류 | /tmp/agent-stage-* 보호. 현재 이 패턴 미사용 |
| 31 | `is-teammate.sh` | 헬퍼 | — | 🔨 헬퍼 | 11개 hook이 source. 삭제 금지 |

### 3-3. 정비 집계

| 분류 | 건수 | 상세 |
|------|------|------|
| ✅ 유지 | 15 | 변경 없이 현행 유지 |
| 🔧 개선 | 4 | validate-design(중복 제거), validate-pdca-before-teamdelete(정리 추가), task-completed(BOARD 갱신), teammate-idle(소유권) |
| ➕ 신규 등록 | 1 | gap-analysis → TaskCompleted |
| ❌ 삭제 | 3 | notify-openclaw, notify-hook, notify-task-completed |
| ⏸️ 보류 | 4 | agent-slack-notify, agent-state-sync, force-team-kill, protect-stage |
| 🔨 헬퍼 | 2 | is-teammate, detect-process-level |
| **합계** | **29** | 31 - 삭제 3 + 헬퍼 2 = 파일 29개 유지 |

### 3-4. settings.json vs settings.local.json 충돌 분석

**현재 문제**: 두 파일에 같은 이벤트의 hook이 다르게 등록되어 있다. settings.local.json이 override하므로 settings.json의 일부 hook이 무시된다.

| 이벤트 | settings.json에만 있는 것 | settings.local.json에만 있는 것 |
|--------|--------------------------|-------------------------------|
| PreToolUse(Bash) | pre-read-context, validate-task, validate-pdca, pdca-single-source | (없음) |
| TaskCompleted | pdca-update, auto-team-cleanup | notify-openclaw (비활성인데 등록됨) |
| PreToolUse(Agent) | (없음) | enforce-teamcreate |

**결론**: settings.local.json이 override하므로, settings.json에만 있는 hook(pre-read-context, validate-task 등)은 **실제로 실행되지 않는다**. 이것이 숨겨진 버그.

---

## 4. teammate-idle.sh 소유권 로직 구현

### 4-1. 개선된 알고리즘

```
1. team-context.json 로드 시도
   ├─ 성공 → taskFiles 배열에서 자기 팀 TASK 파일 목록 획득
   └─ 실패 → TASK 프론트매터에서 team 필드 파싱 (2차 폴백)
              └─ 프론트매터도 없으면 → 전체 스캔 (3차 폴백, 레거시 호환)

2. 필터된 TASK 파일에서 미완료 체크박스 스캔
   - 프론트매터 --- 블록 내부는 제외 (오탐 방지)
   - status: completed/archived인 TASK는 스킵

3. 미완료 항목 존재 → exit 2 (계속 작업)
   미완료 0건 → exit 0 (idle 허용, 종료 가능)
```

### 4-2. 구현 코드

```bash
#!/bin/bash
# teammate-idle.sh — 팀원 idle 시 자기 팀 TASK만 배정
# TeammateIdle hook: exit 0 = idle 허용, exit 2 = 피드백 + 계속 작업
# v6 (2026-03-28): 소유권 필터링 도입

PROJECT_DIR="/Users/smith/projects/bscamp"
TASKS_DIR="$PROJECT_DIR/.claude/tasks"
CONTEXT_FILE="$PROJECT_DIR/.claude/runtime/team-context.json"

# --- 프론트매터 파싱 헬퍼 ---
parse_frontmatter_field() {
    local file="$1" key="$2"
    awk '/^---$/{n++; next} n==1{print}' "$file" | grep "^${key}:" | sed "s/^${key}: *//"
}

# 프론트매터 이후 영역에서만 체크박스 스캔
scan_unchecked() {
    local file="$1"
    awk '/^---$/{n++; next} n>=2 || n==0{print NR": "$0}' "$file" | grep '^[0-9]*: *- \[ \]'
}

# --- 1단계: 자기 팀 TASK 파일 목록 결정 ---
FILTERED_FILES=""

if [ -f "$CONTEXT_FILE" ]; then
    # 방법 A: team-context.json에서 taskFiles 추출
    TASK_LIST=$(jq -r '.taskFiles[]?' "$CONTEXT_FILE" 2>/dev/null)
    if [ -n "$TASK_LIST" ]; then
        while IFS= read -r fname; do
            [ -f "$TASKS_DIR/$fname" ] && FILTERED_FILES="$FILTERED_FILES $TASKS_DIR/$fname"
        done <<< "$TASK_LIST"
    fi
fi

if [ -z "$FILTERED_FILES" ]; then
    # 방법 B: TASK 프론트매터에서 team 필드로 필터링
    CURRENT_TEAM=""
    if [ -f "$CONTEXT_FILE" ]; then
        CURRENT_TEAM=$(jq -r '.team // empty' "$CONTEXT_FILE" 2>/dev/null)
    fi

    for f in "$TASKS_DIR"/TASK-*.md; do
        [ -f "$f" ] || continue
        TASK_TEAM=$(parse_frontmatter_field "$f" "team")
        TASK_STATUS=$(parse_frontmatter_field "$f" "status")

        # completed/archived는 스킵
        [ "$TASK_STATUS" = "completed" ] || [ "$TASK_STATUS" = "archived" ] && continue
        # unassigned는 스킵
        [ "$TASK_TEAM" = "unassigned" ] && continue

        if [ -z "$CURRENT_TEAM" ]; then
            # 팀 컨텍스트 완전 부재 → 전체 스캔 (레거시 호환)
            FILTERED_FILES="$FILTERED_FILES $f"
        elif [ "$TASK_TEAM" = "$CURRENT_TEAM" ] || [ -z "$TASK_TEAM" ]; then
            # 같은 팀이거나 프론트매터 없는 레거시 TASK
            FILTERED_FILES="$FILTERED_FILES $f"
        fi
    done
fi

# --- 2단계: 필터된 TASK에서 미완료 체크박스 스캔 ---
UNCHECKED=""
for f in $FILTERED_FILES; do
    [ -f "$f" ] || continue
    ITEMS=$(scan_unchecked "$f")
    if [ -n "$ITEMS" ]; then
        BASENAME=$(basename "$f")
        FIRST=$(echo "$ITEMS" | head -1 | sed 's/^[0-9]*: *//' | sed 's/^- \[ \] //')
        UNCHECKED="${UNCHECKED}\n[${BASENAME}] ${FIRST}"
    fi
done

UNCHECKED_COUNT=$(echo -e "$UNCHECKED" | grep -c '\S' 2>/dev/null || echo "0")

if [ "$UNCHECKED_COUNT" -gt 0 ]; then
    NEXT=$(echo -e "$UNCHECKED" | grep '\S' | head -1)
    echo "자기 팀 미완료 TASK ${UNCHECKED_COUNT}건. 다음: ${NEXT}"
    exit 2
fi

# --- 3단계: 모든 TASK 완료 → idle 허용 ---
echo "자기 팀 TASK 모두 완료. Leader에게 보고 후 종료하세요."
exit 0
```

### 4-3. 엣지 케이스 처리

| 케이스 | 처리 | exit code |
|--------|------|-----------|
| team-context.json 없음 | 프론트매터 파싱 → 전체 스캔 폴백 | — |
| team-context.json 손상 (invalid JSON) | jq 실패 → 빈 값 → 프론트매터 폴백 | — |
| TASK에 프론트매터 없음 (레거시) | team=빈값 → 모든 팀에 포함 | — |
| team: unassigned | 어떤 팀에도 배정 안 됨 | 스캔 제외 |
| status: completed/archived | 체크박스 무관하게 스킵 | 스캔 제외 |
| 프론트매터 내 `- [ ]` 패턴 | awk로 --- 블록 외부만 스캔 | 무시됨 |
| taskFiles에 삭제된 파일 | `[ -f "$f" ]` 체크로 안전 스킵 | 무시됨 |

---

## 5. settings.local.json hook 등록 정리

### 5-1. 핵심 원칙

**settings.local.json이 settings.json을 override한다.** 따라서:

1. settings.local.json에 **모든** 필요 hook을 등록 (single source of truth)
2. settings.json의 hooks 섹션은 settings.local.json이 없는 환경의 폴백으로만 유지
3. 이벤트별 hook 순서 = 실행 순서 (빠른 체크 → 느린 체크)

### 5-2. 최종 settings.local.json 구조

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "agentTeamDisplay": "tmux",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/destructive-detector.sh",
            "timeout": 5000
          },
          {
            "type": "command",
            "command": "bash .claude/hooks/validate-qa.sh",
            "timeout": 10000
          },
          {
            "type": "command",
            "command": "bash .claude/hooks/validate-pdca.sh",
            "timeout": 15000
          },
          {
            "type": "command",
            "command": "bash .claude/hooks/validate-task.sh",
            "timeout": 15000
          },
          {
            "type": "command",
            "command": "bash .claude/hooks/enforce-qa-before-merge.sh",
            "timeout": 120000
          },
          {
            "type": "command",
            "command": "bash .claude/hooks/pdca-single-source.sh",
            "timeout": 10000
          },
          {
            "type": "command",
            "command": "bash .claude/hooks/pre-read-context.sh",
            "timeout": 10000
          }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/validate-delegate.sh",
            "timeout": 5000
          },
          {
            "type": "command",
            "command": "bash .claude/hooks/validate-plan.sh",
            "timeout": 10000
          },
          {
            "type": "command",
            "command": "bash .claude/hooks/enforce-plan-before-do.sh",
            "timeout": 10000
          },
          {
            "type": "command",
            "command": "bash .claude/hooks/validate-design.sh",
            "timeout": 15000
          }
        ]
      },
      {
        "matcher": "Agent",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/enforce-teamcreate.sh",
            "timeout": 5000
          }
        ]
      },
      {
        "matcher": "Task",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/validate-before-delegate.sh",
            "timeout": 10000
          }
        ]
      },
      {
        "matcher": "TeamDelete",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/validate-pdca-before-teamdelete.sh",
            "timeout": 10000
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": []
      }
    ],
    "TaskCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/task-completed.sh",
            "timeout": 10000
          },
          {
            "type": "command",
            "command": "bash .claude/hooks/task-quality-gate.sh",
            "timeout": 120000
          },
          {
            "type": "command",
            "command": "bash .claude/hooks/gap-analysis.sh",
            "timeout": 15000
          },
          {
            "type": "command",
            "command": "bash .claude/hooks/pdca-update.sh",
            "timeout": 30000
          },
          {
            "type": "command",
            "command": "bash .claude/hooks/pdca-sync-monitor.sh",
            "timeout": 30000
          },
          {
            "type": "command",
            "command": "bash .claude/hooks/auto-team-cleanup.sh",
            "timeout": 5000
          },
          {
            "type": "command",
            "command": "bash .claude/hooks/notify-completion.sh",
            "timeout": 10000
          }
        ]
      }
    ],
    "TeammateIdle": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/teammate-idle.sh",
            "timeout": 10000
          }
        ]
      }
    ]
  },
  "permissionMode": "bypassPermissions"
}
```

### 5-3. 변경 사항 요약

| 변경 | 이벤트 | 상세 |
|------|--------|------|
| **제거** | PreToolUse(Bash) | `validate-design.sh` — Edit\|Write에만 유지 |
| **제거** | Stop | `notify-openclaw.sh` — 비활성 (always exit 0) |
| **제거** | TaskCompleted | `notify-openclaw.sh` — 비활성 중복 등록 |
| **추가** | PreToolUse(Bash) | `validate-pdca.sh`, `validate-task.sh`, `pdca-single-source.sh`, `pre-read-context.sh` — settings.json에만 있어서 실제 미실행 중이던 것 |
| **추가** | TaskCompleted | `gap-analysis.sh` — TASK 항목 vs staged 파일 매칭 |
| **추가** | TaskCompleted | `pdca-update.sh`, `auto-team-cleanup.sh` — settings.json에만 있어서 미실행 중이던 것 |
| **개선** | TeammateIdle | `teammate-idle.sh` — 소유권 필터링 로직 적용 |

### 5-4. Hook 실행 순서 원칙

```
PreToolUse(Bash) 실행 순서:
  1. destructive-detector (5s)  ← 빠른 차단 우선
  2. validate-qa (10s)          ← tsc 체크
  3. validate-pdca (15s)        ← PDCA 상태 확인
  4. validate-task (15s)        ← TASK 포맷 가이드
  5. enforce-qa-before-merge (120s) ← 커밋/푸시 시만 동작
  6. pdca-single-source (10s)   ← 커밋 시 동기화
  7. pre-read-context (10s)     ← 세션 1회 가이드
```

위험 차단 → 빠른 검증 → 느린 검증 → 비차단 가이드 순서.

---

## 6. 구현 파일 목록

### Wave 1: 기반 구조

| ID | 작업 | 파일 | 산출물 |
|----|------|------|--------|
| W1-1 | 기존 TASK 9개에 프론트매터 추가 | `.claude/tasks/TASK-*.md` | 프론트매터 추가된 9개 파일 |
| W1-2 | BOARD.json 초기 생성 | `.claude/tasks/BOARD.json` | 팀별 TASK 매핑 JSON |
| W1-3 | 중복/비활성 hook 파일 삭제 | `.claude/hooks/` | notify-hook.sh, notify-task-completed.sh, notify-openclaw.sh 삭제 |

### Wave 2: Hook 개선

| ID | 작업 | 파일 | 산출물 |
|----|------|------|--------|
| W2-1 | teammate-idle.sh 소유권 로직 구현 | `.claude/hooks/teammate-idle.sh` | 섹션 4 코드 적용 |
| W2-2 | task-completed.sh에 BOARD.json 갱신 추가 | `.claude/hooks/task-completed.sh` | completedCount/totalCount 자동 갱신 |
| W2-3 | validate-pdca-before-teamdelete.sh에 team-context.json 삭제 추가 | `.claude/hooks/validate-pdca-before-teamdelete.sh` | TeamDelete 시 자동 정리 |
| W2-4 | settings.local.json 통합 정비 | `.claude/settings.local.json` | 섹션 5 구조 적용 |

### Wave 3: 검증

| ID | 작업 | 파일 | 산출물 |
|----|------|------|--------|
| W3-1 | 다팀 시뮬레이션 테스트 | 수동 | CTO + PM TASK 공존 시 idle 동작 확인 |
| W3-2 | CLAUDE.md에 TASK 프론트매터 규칙 추가 | `CLAUDE.md` | 프론트매터 필수 규칙 섹션 |
| W3-3 | Gap 분석 | `docs/03-analysis/` | hook-task-ownership.analysis.md |

---

## 7. TDD 테스트 시나리오

PM 기획서의 UT-1~6, E-1~7을 기술 관점에서 구체화:

### Happy Path

| ID | 대상 | 입력 | 기대 결과 |
|----|------|------|-----------|
| UT-1 | teammate-idle.sh (팀 필터) | team-context: CTO-1, taskFiles: [TASK-CTO-RESUME.md]. TASK-PM-RESUME.md에 미완료 존재 | CTO TASK만 스캔. PM 무시 |
| UT-2 | teammate-idle.sh (하위 호환) | team-context.json 없음. TASK-*.md 3개 | 전체 3개 스캔 |
| UT-3 | teammate-idle.sh (전부 완료) | team-context CTO-1. 등록된 TASK 모두 체크 완료 | exit 0 |
| UT-4 | task-completed.sh (BOARD 갱신) | TASK-CTO-RESUME.md 체크박스 1개 완료 | BOARD.json CTO-1.completedCount +1 |
| UT-5 | parse_frontmatter_field | team: CTO-1 포함 TASK | "CTO-1" 반환 |

### Edge Cases

| ID | 시나리오 | 기대 동작 |
|----|----------|-----------|
| E-1 | team-context.json 손상 (invalid JSON) | jq 실패 → 프론트매터 폴백 → 전체 스캔 |
| E-2 | TASK에 프론트매터 없음 (레거시) | team=빈값 → 모든 팀에 포함 |
| E-3 | BOARD.json의 TASK 파일 삭제됨 | 누락 경고, 갱신 시 제거 |
| E-4 | 프론트매터 내 `- [ ]` | scan_unchecked의 awk가 --- 블록 이후만 스캔 → 오탐 없음 |
| E-5 | team: unassigned | teammate-idle에서 완전 제외 |
| E-6 | status: completed인 TASK에 미완료 체크박스 | status 기준으로 스킵 → 스캔 안 함 |

### Mock 데이터 경로

```
__tests__/hooks/fixtures/
├── team_context_cto.json       # CTO-1 컨텍스트
├── team_context_invalid.json   # 손상된 JSON
├── board_multi_team.json       # 다팀 보드
├── task_with_frontmatter.md    # 프론트매터 있는 TASK
└── task_legacy.md              # 프론트매터 없는 레거시
```

---

## 8. 성공 기준

| 기준 | 측정 방법 | 목표 |
|------|-----------|------|
| 크로스팀 배정 | teammate-idle 로그에서 다른 팀 TASK 배정 횟수 | **0건** |
| idle 루프 | 팀원 idle → 30초 내 종료 또는 자기 팀 TASK 배정 | **100%** |
| Hook 등록 일치 | settings.local.json 등록 vs 실제 필요 hook | **100%** |
| TASK 프론트매터 커버리지 | 프론트매터 보유 TASK / 전체 TASK | **100%** |
| settings 충돌 | settings.json에만 있어서 미실행 중인 hook | **0건** |

---

## 9. 리스크

| 리스크 | 확률 | 영향 | 대응 |
|--------|------|------|------|
| 프론트매터 파싱 오류 (awk 엣지케이스) | 낮음 | 중간 | 3차 폴백: 전체 스캔 (기존 동작 유지) |
| 리더가 team-context.json 생성 누락 | 중간 | 높음 | validate-before-delegate.sh에서 경고 추가 |
| settings.local.json 수동 편집 실수 | 중간 | 높음 | 정비 후 커밋. 이후 수정은 PR 리뷰 |
| BOARD.json 동시 쓰기 충돌 | 낮음 | 중간 | 세션당 1팀 운영이므로 실무적 충돌 없음 |

---

## 10. 제외 범위

- Slack 알림 연동 (agent-slack-notify.sh) — 별도 기능
- 크로스팀 TASK 위임 프로토콜 — 별도 설계
- Hook HTTP 전환 (command → HTTP type) — 현재 command 유지
- tmux 세션 자동 감지 — team-context.json 수동 생성 유지
- src/ 코드 변경 — 이 기획서는 L1 (.claude/ 내부만 수정)

---

## 부록: PM 기획서와의 관계

| PM 기획서 (프로세스) | CTO 기획서 (기술) |
|---------------------|------------------|
| 문제 정의 + 근본 원인 | 구현 알고리즘 + 코드 |
| YAML 스키마 정의 | Bash 파싱 함수 구현 |
| Hook 정리 방향 | Hook 31개 전수 분류표 + settings.json 충돌 분석 |
| 구현 Wave 계획 | 파일 단위 변경 목록 |
| TDD 시나리오 (what) | TDD 구체화 (how, mock data) |
| BOARD.json 개념 | BOARD.json 갱신 로직 |

두 문서는 pair로 읽어야 완전한 그림이 나온다.
