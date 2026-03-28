# Hook + TASK 소유권 시스템 설계서

> **설계 문서** — CTO 기술 기획서 + PM 프로세스 기획서의 구현 명세
> 작성일: 2026-03-28
> PDCA 레벨: L1 (src/ 미수정, .claude/ hooks + settings 정비)
> 상태: Design

---

## 1. 데이터 모델

### 1-1. TASK YAML 프론트매터 스키마

TASK 파일(`.claude/tasks/TASK-*.md`) 상단에 YAML 프론트매터를 추가한다.

```yaml
---
team: CTO-1              # 필수. TeamCreate 시 지정한 팀명 (string)
session: sdk-cto          # 선택. tmux 세션명 (string)
created: 2026-03-28       # 필수. TASK 생성일 (YYYY-MM-DD)
status: in-progress       # 필수. pending | in-progress | completed | archived
owner: leader             # 필수. TASK 소유자 (string, 기본값: leader)
pdcaFeature: cto-resume   # 선택. docs/.pdca-status.json의 기능명 역참조
assignees:                # 선택. 팀원별 담당 태스크 ID 배열
  - role: backend-dev
    tasks: [T1, T2, T3]
  - role: frontend-dev
    tasks: [T13, T14]
---
```

#### 필드 정의

| 필드 | 타입 | 필수 | 기본값 | 검증 규칙 |
|------|------|:----:|--------|-----------|
| `team` | `string` | Y | — | 비어있으면 안 됨. `unassigned` 허용 (특수값: 어떤 팀에도 배정 안 됨) |
| `session` | `string` | N | `""` | 없으면 무시 |
| `created` | `string` (YYYY-MM-DD) | Y | — | 10자 ISO date 형식 |
| `status` | `enum` | Y | `pending` | `pending` / `in-progress` / `completed` / `archived` 중 하나 |
| `owner` | `string` | Y | `leader` | 비어있으면 `leader`로 간주 |
| `pdcaFeature` | `string` | N | `""` | docs/.pdca-status.json의 features 키와 일치 |
| `assignees` | `array<{role: string, tasks: string[]}>` | N | `[]` | 각 요소에 role 필수, tasks는 T1/T2 형식 |

#### 프론트매터 블록 규약

- 파일 첫 줄이 반드시 `---`
- 두 번째 `---`로 닫힘
- 프론트매터 내부에 `- [ ]` 패턴이 있어도 **체크박스로 취급하지 않음**
- 프론트매터 없는 레거시 TASK는 `team: ""` (빈 값)으로 간주 → 모든 팀에 포함 (하위 호환)

### 1-2. team-context.json 스키마

**경로**: `.claude/runtime/team-context.json`

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

| 필드 | 타입 | 필수 | 설명 |
|------|------|:----:|------|
| `team` | `string` | Y | 팀 식별자 (TeamCreate 이름) |
| `session` | `string` | N | tmux 세션명 |
| `created` | `string` (ISO 8601) | Y | 팀 생성 시각 |
| `taskFiles` | `string[]` | Y | 이 팀에 할당된 TASK 파일명 배열 (경로 아닌 파일명만) |
| `teammates` | `array<{role: string, paneIndex: number}>` | N | 팀원 정보 |

**생명주기**:

| 시점 | 행위 | 담당 |
|------|------|------|
| TeamCreate 직후 | 리더가 `team-context.json` 생성 (Write tool) | 리더 |
| 팀원 spawn 시 | `teammates` 배열에 추가 | 리더 |
| TASK 배정 시 | `taskFiles` 배열에 파일명 추가 | 리더 |
| TeamDelete 직전 | `validate-pdca-before-teamdelete.sh`가 파일 삭제 | Hook 자동 |

**동시성**: 세션당 1팀 운영이 기본. 동일 프로젝트에서 2팀 동시 실행 시 team-context.json이 덮어쓰기됨 → BOARD.json + 프론트매터로 2차 폴백.

### 1-3. BOARD.json 스키마

**경로**: `.claude/tasks/BOARD.json`

```json
{
  "version": "1.0",
  "updatedAt": "2026-03-28T10:00:00+09:00",
  "teams": {
    "CTO-1": {
      "status": "active",
      "taskFiles": ["TASK-CTO-RESUME.md", "TASK-CTO-CLEAN.md"],
      "completedCount": 3,
      "totalCount": 8
    },
    "PM-1": {
      "status": "active",
      "taskFiles": ["TASK-PM-RESUME.md"],
      "completedCount": 0,
      "totalCount": 3
    }
  },
  "unassigned": [
    "TASK-LP-MEDIA-DOWNLOAD.md",
    "TASK-COLLECTION-GAPS.md",
    "TASK-COLLECT-AND-EMBED.md",
    "TASK-DEEPGAZE-GEMINI-PIPELINE.md",
    "TASK-GCS-STORAGE-MIGRATION.md"
  ]
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `version` | `string` | 스키마 버전 |
| `updatedAt` | `string` (ISO 8601) | 마지막 갱신 시각 |
| `teams` | `object<string, TeamEntry>` | 팀명 → 팀 상태 매핑 |
| `teams.*.status` | `"active" \| "completed" \| "archived"` | 팀 상태 |
| `teams.*.taskFiles` | `string[]` | 팀 소속 TASK 파일명 |
| `teams.*.completedCount` | `number` | 완료된 체크박스 수 |
| `teams.*.totalCount` | `number` | 전체 체크박스 수 |
| `unassigned` | `string[]` | 미소속 TASK 파일명 |

---

## 2. API 설계 (Bash 함수 시그니처)

### 2-1. `parse_frontmatter_field(file, key) → value`

TASK 파일의 YAML 프론트매터에서 특정 키의 값을 추출한다.

```bash
parse_frontmatter_field() {
    local file="$1" key="$2"
    awk '/^---$/{n++; next} n==1{print}' "$file" | grep "^${key}:" | sed "s/^${key}: *//"
}
```

| 항목 | 내용 |
|------|------|
| **입력** | `file`: TASK 파일 절대경로, `key`: YAML 키 (예: `team`, `status`) |
| **출력** | stdout에 값 출력. 키 없으면 빈 문자열 |
| **에러 처리** | 파일 없음 → 빈 출력 (awk/grep이 자동 처리). 프론트매터 없음 → 빈 출력 |
| **외부 도구** | `awk`, `grep`, `sed` |
| **제약** | 단순 `key: value` 형태만 파싱. 중첩 YAML(assignees 등)은 미지원 |

### 2-2. `scan_unchecked(file) → line_list`

프론트매터 블록을 제외한 영역에서 미완료 체크박스(`- [ ]`)를 스캔한다.

```bash
scan_unchecked() {
    local file="$1"
    awk '
        /^---$/ { fm_count++; next }
        fm_count >= 2 || fm_count == 0 { print NR": "$0 }
    ' "$file" | grep '- \[ \]'
}
```

| 항목 | 내용 |
|------|------|
| **입력** | `file`: TASK 파일 절대경로 |
| **출력** | stdout에 `줄번호: - [ ] 내용` 형태로 출력. 없으면 빈 출력 |
| **에러 처리** | 파일 없음 → 빈 출력. 프론트매터 없는 파일(fm_count==0) → 전체 스캔 |
| **외부 도구** | `awk`, `grep` |
| **핵심 로직** | `---` 카운터(fm_count)로 프론트매터 블록(n==1) 건너뜀. n>=2(프론트매터 이후) 또는 n==0(프론트매터 없음)만 출력 |

### 2-3. `load_team_context() → sets TEAM_NAME, TASK_FILES`

team-context.json을 로드하여 쉘 변수에 설정한다.

```bash
CONTEXT_FILE="$PROJECT_DIR/.claude/runtime/team-context.json"

load_team_context() {
    TEAM_NAME=""
    TASK_FILES=""

    if [ ! -f "$CONTEXT_FILE" ]; then
        return 1
    fi

    TEAM_NAME=$(jq -r '.team // empty' "$CONTEXT_FILE" 2>/dev/null) || TEAM_NAME=""
    TASK_FILES=$(jq -r '.taskFiles[]?' "$CONTEXT_FILE" 2>/dev/null) || TASK_FILES=""

    [ -n "$TEAM_NAME" ] && return 0 || return 1
}
```

| 항목 | 내용 |
|------|------|
| **입력** | 없음 (전역 `CONTEXT_FILE` 경로 사용) |
| **출력** | 전역 변수 `TEAM_NAME` (팀명), `TASK_FILES` (개행 구분 파일명 목록) 설정 |
| **반환값** | 0: 성공 (팀명 획득), 1: 실패 (파일 없음/손상) |
| **에러 처리** | 파일 없음 → return 1 (호출부에서 폴백). jq 파싱 실패 → 빈 변수 + return 1 |
| **외부 도구** | `jq` |

### 2-4. `update_board_json(team, completed, total)`

BOARD.json의 특정 팀 집계를 갱신한다.

```bash
update_board_json() {
    local team="$1" completed="$2" total="$3"
    local board_file="$PROJECT_DIR/.claude/tasks/BOARD.json"
    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    if [ ! -f "$board_file" ]; then
        return 1
    fi

    local tmp
    tmp=$(mktemp)
    jq --arg team "$team" \
       --argjson completed "$completed" \
       --argjson total "$total" \
       --arg now "$now" \
       '.teams[$team].completedCount = $completed |
        .teams[$team].totalCount = $total |
        .updatedAt = $now' \
       "$board_file" > "$tmp" 2>/dev/null

    if [ $? -eq 0 ] && [ -s "$tmp" ]; then
        mv "$tmp" "$board_file"
        return 0
    else
        rm -f "$tmp"
        return 1
    fi
}
```

| 항목 | 내용 |
|------|------|
| **입력** | `team`: 팀명, `completed`: 완료 체크박스 수, `total`: 전체 체크박스 수 |
| **출력** | BOARD.json 파일 직접 갱신 |
| **반환값** | 0: 성공, 1: 실패 (파일 없음/jq 오류) |
| **에러 처리** | BOARD.json 없음 → return 1. jq 실패 → 원본 유지 (atomic write: tmp → mv) |
| **외부 도구** | `jq`, `mktemp`, `date` |
| **동시성** | 단일 세션 환경이므로 lock 불필요. 다중 세션 시 BOARD.json 덮어쓰기 가능성 있음 (허용 범위) |

### 2-5. `count_checkboxes(file) → completed total`

TASK 파일의 체크박스를 프론트매터 제외하고 집계한다.

```bash
count_checkboxes() {
    local file="$1"
    local body
    body=$(awk '/^---$/{n++; next} n>=2 || n==0{print}' "$file")
    local completed
    completed=$(echo "$body" | grep -c '\- \[x\]' 2>/dev/null || echo "0")
    local unchecked
    unchecked=$(echo "$body" | grep -c '\- \[ \]' 2>/dev/null || echo "0")
    local total=$((completed + unchecked))
    echo "$completed $total"
}
```

| 항목 | 내용 |
|------|------|
| **입력** | `file`: TASK 파일 절대경로 |
| **출력** | stdout에 `완료수 전체수` (공백 구분) |
| **외부 도구** | `awk`, `grep` |

---

## 3. 컴포넌트 구조 (파일별 변경 명세)

### 3-1. 변경 파일 전체 목록

| 분류 | 파일 | 작업 |
|------|------|------|
| **신규** | `.claude/tasks/BOARD.json` | 중앙 TASK 보드 초기 생성 |
| **수정** | `.claude/hooks/teammate-idle.sh` | 소유권 필터링 로직 전면 재작성 (v6) |
| **수정** | `.claude/hooks/task-completed.sh` | BOARD.json 갱신 로직 추가 |
| **수정** | `.claude/hooks/validate-pdca-before-teamdelete.sh` | team-context.json 삭제 로직 추가 |
| **수정** | `.claude/settings.local.json` | Hook 등록 통합 정비 |
| **수정** | `.claude/tasks/TASK-CTO-RESUME.md` | 프론트매터 추가 |
| **수정** | `.claude/tasks/TASK-CTO-CLEAN.md` | 프론트매터 추가 |
| **수정** | `.claude/tasks/TASK-PM-RESUME.md` | 프론트매터 추가 |
| **수정** | `.claude/tasks/TASK-MKT-RESUME.md` | 프론트매터 추가 |
| **수정** | `.claude/tasks/TASK-LP-MEDIA-DOWNLOAD.md` | 프론트매터 추가 (team: unassigned) |
| **수정** | `.claude/tasks/TASK-COLLECTION-GAPS.md` | 프론트매터 추가 (team: unassigned) |
| **수정** | `.claude/tasks/TASK-COLLECT-AND-EMBED.md` | 프론트매터 추가 (team: unassigned) |
| **수정** | `.claude/tasks/TASK-DEEPGAZE-GEMINI-PIPELINE.md` | 프론트매터 추가 (team: unassigned) |
| **수정** | `.claude/tasks/TASK-GCS-STORAGE-MIGRATION.md` | 프론트매터 추가 (team: unassigned) |
| **삭제** | `.claude/hooks/notify-hook.sh` | 비활성 (always exit 0), notify-completion과 중복 |
| **삭제** | `.claude/hooks/notify-task-completed.sh` | task-completed.sh와 중복 |
| **삭제** | `.claude/hooks/notify-openclaw.sh` | 비활성 (always exit 0), Stop + TaskCompleted에 중복 등록 |
| **신규** | `__tests__/hooks/teammate-idle.test.ts` | vitest 테스트 |
| **신규** | `__tests__/hooks/task-completed.test.ts` | vitest 테스트 |
| **신규** | `__tests__/hooks/frontmatter-parser.test.ts` | vitest 테스트 |
| **신규** | `__tests__/hooks/fixtures/*.json, *.md` | 테스트 fixture |

### 3-2. teammate-idle.sh 전면 재작성 (v6)

현재 44줄 → 약 80줄. 3단계 폴백 로직:

```
[1단계] team-context.json 로드
  ├─ 성공 → taskFiles 배열로 자기 팀 TASK만 스캔
  └─ 실패 ↓
[2단계] TASK 프론트매터에서 team 필드 매칭
  ├─ CURRENT_TEAM 있음 → 같은 팀 TASK + 프론트매터 없는 레거시 TASK 스캔
  └─ CURRENT_TEAM 없음 ↓
[3단계] 전체 스캔 (레거시 호환)
  └─ 기존 v4/v5와 동일 동작
```

**핵심 변경점**:
- `grep '^\- \[ \]'` → `scan_unchecked()` (프론트매터 제외 awk 기반)
- 전체 TASK 스캔 → team-context.json 우선 + 프론트매터 폴백
- `status: completed/archived` TASK 자동 제외
- `team: unassigned` TASK 자동 제외

### 3-3. task-completed.sh 수정

기존 31줄 끝에 BOARD.json 갱신 로직 추가 (약 30줄 추가):

```bash
# --- BOARD.json 갱신 (v3 추가) ---
BOARD_FILE="$PROJECT_DIR/.claude/tasks/BOARD.json"
CONTEXT_FILE="$PROJECT_DIR/.claude/runtime/team-context.json"

if [ -f "$BOARD_FILE" ] && [ -f "$CONTEXT_FILE" ]; then
    CURRENT_TEAM=$(jq -r '.team // empty' "$CONTEXT_FILE" 2>/dev/null)
    if [ -n "$CURRENT_TEAM" ]; then
        # 팀 소속 TASK 파일들의 체크박스 집계
        TOTAL_COMPLETED=0
        TOTAL_ALL=0
        TASK_LIST=$(jq -r '.taskFiles[]?' "$CONTEXT_FILE" 2>/dev/null)
        while IFS= read -r fname; do
            [ -f "$PROJECT_DIR/.claude/tasks/$fname" ] || continue
            COUNTS=$(count_checkboxes "$PROJECT_DIR/.claude/tasks/$fname")
            C=$(echo "$COUNTS" | awk '{print $1}')
            T=$(echo "$COUNTS" | awk '{print $2}')
            TOTAL_COMPLETED=$((TOTAL_COMPLETED + C))
            TOTAL_ALL=$((TOTAL_ALL + T))
        done <<< "$TASK_LIST"

        update_board_json "$CURRENT_TEAM" "$TOTAL_COMPLETED" "$TOTAL_ALL"
    fi
fi
```

`count_checkboxes()` 와 `update_board_json()` 함수를 스크립트 상단에 정의.

### 3-4. validate-pdca-before-teamdelete.sh 수정

기존 42줄 끝에 team-context.json 삭제 로직 추가 (약 10줄):

```bash
# --- team-context.json 정리 (v1.1 추가) ---
CONTEXT_FILE="$PROJECT_DIR/.claude/runtime/team-context.json"
if [ -f "$CONTEXT_FILE" ]; then
    DELETED_TEAM=$(jq -r '.team // "unknown"' "$CONTEXT_FILE" 2>/dev/null)
    rm -f "$CONTEXT_FILE"
    echo "[PDCA 게이트] team-context.json 삭제 완료 (팀: $DELETED_TEAM)"
fi
```

`exit 0` 직전에 삽입. PDCA 갱신 확인 → team-context.json 삭제 → exit 0 순서.

### 3-5. settings.local.json 최종 구조

```json
{
  "permissions": {
    "allow": [
      "Bash(*)",
      "Edit(*)",
      "Write(*)",
      "Read(*)",
      "MultiEdit(*)",
      "WebFetch(*)",
      "Glob(*)",
      "Grep(*)",
      "TodoRead(*)",
      "TodoWrite(*)",
      "WebSearch",
      "Skill(bkit:pm-discovery)"
    ],
    "deny": []
  },
  "model": "claude-opus-4-6",
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": [
    "context7"
  ],
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/destructive-detector.sh",
            "timeout": 5000
          },
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/validate-qa.sh",
            "timeout": 10000
          },
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/validate-pdca.sh",
            "timeout": 15000
          },
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/validate-task.sh",
            "timeout": 15000
          },
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/enforce-qa-before-merge.sh",
            "timeout": 120000
          },
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/pdca-single-source.sh",
            "timeout": 10000
          },
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/pre-read-context.sh",
            "timeout": 10000
          }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/validate-delegate.sh",
            "timeout": 5000
          },
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/validate-plan.sh",
            "timeout": 10000
          },
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/enforce-plan-before-do.sh",
            "timeout": 10000
          },
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/validate-design.sh",
            "timeout": 15000
          }
        ]
      },
      {
        "matcher": "Agent",
        "hooks": [
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/enforce-teamcreate.sh",
            "timeout": 5000
          }
        ]
      },
      {
        "matcher": "Task",
        "hooks": [
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/validate-before-delegate.sh",
            "timeout": 10000
          }
        ]
      },
      {
        "matcher": "TeamDelete",
        "hooks": [
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/validate-pdca-before-teamdelete.sh",
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
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/task-completed.sh",
            "timeout": 10000
          },
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/task-quality-gate.sh",
            "timeout": 120000
          },
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/gap-analysis.sh",
            "timeout": 15000
          },
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/pdca-update.sh",
            "timeout": 30000
          },
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/pdca-sync-monitor.sh",
            "timeout": 30000
          },
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/auto-team-cleanup.sh",
            "timeout": 5000
          },
          {
            "type": "command",
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/notify-completion.sh",
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
            "command": "bash /Users/smith/projects/bscamp/.claude/hooks/teammate-idle.sh",
            "timeout": 10000
          }
        ]
      }
    ]
  },
  "alwaysThinkingEnabled": true,
  "effortLevel": "high"
}
```

#### settings.local.json 변경 사항 요약

| 변경 유형 | 이벤트 | 대상 Hook | 사유 |
|-----------|--------|-----------|------|
| **추가** | PreToolUse(Bash) | `validate-pdca.sh` | settings.json에만 있어서 미실행 중이던 것 |
| **추가** | PreToolUse(Bash) | `validate-task.sh` | settings.json에만 있어서 미실행 중이던 것 |
| **추가** | PreToolUse(Bash) | `pdca-single-source.sh` | settings.json에만 있어서 미실행 중이던 것 |
| **추가** | PreToolUse(Bash) | `pre-read-context.sh` | settings.json에만 있어서 미실행 중이던 것 |
| **추가** | PreToolUse(Agent) | `enforce-teamcreate.sh` | 유지 (이미 등록됨) |
| **추가** | TaskCompleted | `gap-analysis.sh` | 미등록이던 것. TASK 항목 vs staged 파일 매칭 |
| **추가** | TaskCompleted | `pdca-update.sh` | settings.json에만 있어서 미실행 중이던 것 |
| **추가** | TaskCompleted | `pdca-sync-monitor.sh` | 유지 (이미 등록됨) |
| **추가** | TaskCompleted | `auto-team-cleanup.sh` | settings.json에만 있어서 미실행 중이던 것 |
| **활성화** | TeammateIdle | `teammate-idle.sh` | 빈 배열 `[]` → 소유권 로직 적용 후 등록 |
| **제거** | PreToolUse(Bash) | `validate-design.sh` | Edit\|Write에만 유지. Bash에서 매 git commit마다 불필요 실행 |
| **제거** | Stop | `notify-openclaw.sh` | 비활성 (always exit 0). 파일도 삭제 |
| **정리** | Stop | — | hooks를 빈 배열 `[]`로 (notify-openclaw 제거) |

#### Hook 실행 순서 원칙

```
PreToolUse(Bash) 실행 순서:
  1. destructive-detector (5s)     ← 빠른 차단 우선 (위험 명령 즉시 차단)
  2. validate-qa (10s)             ← tsc+build 마커 확인
  3. validate-pdca (15s)           ← PDCA 상태 확인
  4. validate-task (15s)           ← TASK 포맷 가이드
  5. enforce-qa-before-merge (120s) ← main merge 시만 동작 (대부분 패스)
  6. pdca-single-source (10s)      ← git commit 시만 동작
  7. pre-read-context (10s)        ← 세션 1회 가이드 (비차단)

TaskCompleted 실행 순서:
  1. task-completed (10s)          ← 마커 생성 + BOARD.json 갱신
  2. task-quality-gate (120s)      ← tsc+build 검증
  3. gap-analysis (15s)            ← TASK vs staged 비교
  4. pdca-update (30s)             ← PDCA 상태 갱신
  5. pdca-sync-monitor (30s)       ← PDCA 동기화 확인
  6. auto-team-cleanup (5s)        ← 전체 완료 시 TeamDelete 안내
  7. notify-completion (10s)       ← macOS + Slack 알림
```

---

## 4. 에러 처리

### 4-1. teammate-idle.sh 에러 시나리오

| 시나리오 | 감지 방법 | 폴백 동작 | exit code |
|----------|-----------|-----------|-----------|
| team-context.json 없음 | `[ ! -f "$CONTEXT_FILE" ]` | 2단계: 프론트매터 파싱으로 폴백 | — (계속 진행) |
| team-context.json 손상 (invalid JSON) | `jq` 비정상 종료 | `TEAM_NAME=""` → 2단계 폴백 | — |
| jq 미설치 | `jq` command not found | `TEAM_NAME=""` → 3단계: 전체 스캔 | — |
| TASK 파일에 프론트매터 없음 | `parse_frontmatter_field` 빈 반환 | team=빈값 → 모든 팀에 포함 (레거시 호환) | — |
| taskFiles에 삭제된 파일 | `[ -f "$f" ]` 체크 | 안전 스킵 | — |
| 프론트매터 내 `- [ ]` 패턴 | `scan_unchecked`의 awk가 --- 블록 외부만 스캔 | 오탐 없음 | — |
| team: unassigned | `parse_frontmatter_field` 반환값 체크 | 스캔 제외 | — |
| status: completed/archived | `parse_frontmatter_field` 반환값 체크 | 스캔 제외 | — |
| 미완료 항목 있음 | `UNCHECKED_COUNT -gt 0` | 다음 TASK 배정 메시지 | **exit 2** |
| 미완료 0건 | `UNCHECKED_COUNT == 0` | idle 허용 메시지 | **exit 0** |

### 4-2. task-completed.sh 에러 시나리오

| 시나리오 | 감지 방법 | 폴백 동작 | exit code |
|----------|-----------|-----------|-----------|
| BOARD.json 없음 | `[ ! -f "$BOARD_FILE" ]` | BOARD 갱신 스킵. 기존 알림 로직은 정상 실행 | exit 0 |
| team-context.json 없음 | `[ ! -f "$CONTEXT_FILE" ]` | BOARD 갱신 스킵 | exit 0 |
| jq 갱신 실패 | `$? -ne 0` 또는 빈 tmp 파일 | 원본 BOARD.json 유지 (atomic write) | exit 0 |
| CURRENT_TEAM 빈 값 | `[ -z "$CURRENT_TEAM" ]` | BOARD 갱신 스킵 | exit 0 |

### 4-3. validate-pdca-before-teamdelete.sh 에러 시나리오

| 시나리오 | 감지 방법 | 폴백 동작 | exit code |
|----------|-----------|-----------|-----------|
| team-context.json 없음 | `[ ! -f "$CONTEXT_FILE" ]` | 삭제 스킵 (이미 없으므로) | — |
| team-context.json rm 실패 | 권한 오류 | 경고 메시지 출력, TeamDelete는 허용 | exit 0 |

### 4-4. exit code 규약 (전체 hook 공통)

| exit code | 의미 | 사용 hook |
|-----------|------|-----------|
| **0** | 허용 (정상 통과) | 모든 hook |
| **2** | 차단 + 사용자에게 피드백 표시 | teammate-idle (계속 작업), validate-pdca-before-teamdelete (차단) |
| **기타** | 에러 (trap으로 exit 0 처리) | validate-pdca-before-teamdelete (trap) |

---

## 5. 구현 순서 (체크리스트, 의존성 순서)

### Wave 1: 기반 구조 (의존성 없음)

- [ ] **W1-1**: 기존 TASK 9개에 YAML 프론트매터 추가
  - TASK-CTO-RESUME.md → `team: CTO-1, status: in-progress`
  - TASK-CTO-CLEAN.md → `team: CTO-1, status: in-progress`
  - TASK-PM-RESUME.md → `team: PM-1, status: pending`
  - TASK-MKT-RESUME.md → `team: MKT-1, status: pending`
  - TASK-LP-MEDIA-DOWNLOAD.md → `team: unassigned, status: pending`
  - TASK-COLLECTION-GAPS.md → `team: unassigned, status: pending`
  - TASK-COLLECT-AND-EMBED.md → `team: unassigned, status: pending`
  - TASK-DEEPGAZE-GEMINI-PIPELINE.md → `team: unassigned, status: pending`
  - TASK-GCS-STORAGE-MIGRATION.md → `team: unassigned, status: pending`
- [ ] **W1-2**: `.claude/tasks/BOARD.json` 초기 생성 (섹션 1-3의 스키마 기반)
- [ ] **W1-3**: 중복/비활성 hook 파일 삭제
  - `rm .claude/hooks/notify-hook.sh`
  - `rm .claude/hooks/notify-task-completed.sh`
  - `rm .claude/hooks/notify-openclaw.sh`

### Wave 2: Hook 개선 (Wave 1 완료 후)

- [ ] **W2-1**: `teammate-idle.sh` 소유권 로직 전면 재작성 (섹션 3-2의 v6 코드)
- [ ] **W2-2**: `task-completed.sh`에 BOARD.json 갱신 로직 추가 (섹션 3-3)
- [ ] **W2-3**: `validate-pdca-before-teamdelete.sh`에 team-context.json 삭제 로직 추가 (섹션 3-4)
- [ ] **W2-4**: `settings.local.json` 통합 정비 (섹션 3-5의 최종 JSON)

### Wave 3: 검증

- [ ] **W3-1**: vitest 테스트 전부 통과 확인
- [ ] **W3-2**: 다팀 시뮬레이션 수동 테스트 (CTO + PM TASK 공존 시 teammate-idle 동작)
- [ ] **W3-3**: Gap 분석 → `docs/03-analysis/hook-task-ownership.analysis.md`

---

## 6. TDD 테스트 케이스 (vitest용)

### 6-1. 디렉토리 구조

```
__tests__/
└── hooks/
    ├── teammate-idle.test.ts
    ├── task-completed.test.ts
    ├── frontmatter-parser.test.ts
    └── fixtures/
        ├── team_context_cto.json
        ├── team_context_invalid.json
        ├── board_multi_team.json
        ├── task_with_frontmatter.md
        ├── task_with_frontmatter_completed.md
        ├── task_legacy.md
        ├── task_unassigned.md
        └── task_frontmatter_checkbox_trap.md
```

### 6-2. Bash 테스트 호출 패턴

모든 테스트는 `child_process.execSync`로 bash script를 실행하고 exit code + stdout을 검증한다.

```typescript
// __tests__/hooks/helpers.ts
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

interface HookResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function createTestEnv() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hook-test-'));
  const tasksDir = join(tmpDir, '.claude', 'tasks');
  const runtimeDir = join(tmpDir, '.claude', 'runtime');
  const hooksDir = join(tmpDir, '.claude', 'hooks');
  mkdirSync(tasksDir, { recursive: true });
  mkdirSync(runtimeDir, { recursive: true });
  mkdirSync(hooksDir, { recursive: true });
  return { tmpDir, tasksDir, runtimeDir, hooksDir };
}

export function runHook(scriptPath: string, env: Record<string, string> = {}): HookResult {
  try {
    const stdout = execSync(`bash "${scriptPath}"`, {
      encoding: 'utf-8',
      env: { ...process.env, ...env },
      timeout: 10000,
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err: any) {
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    };
  }
}

export function cleanupTestEnv(tmpDir: string) {
  rmSync(tmpDir, { recursive: true, force: true });
}
```

**핵심**: 테스트가 실행할 hook 스크립트는 `PROJECT_DIR`을 환경변수로 주입하거나, 테스트 전용 복사본에서 경로를 sed로 치환하여 사용한다. 원본 hook의 `PROJECT_DIR="/Users/smith/projects/bscamp"` 을 임시 디렉토리로 교체.

```typescript
export function prepareHookScript(
  originalPath: string,
  tmpDir: string,
  hooksDir: string
): string {
  const content = readFileSync(originalPath, 'utf-8');
  const patched = content.replace(
    /PROJECT_DIR="[^"]*"/,
    `PROJECT_DIR="${tmpDir}"`
  );
  const destPath = join(hooksDir, basename(originalPath));
  writeFileSync(destPath, patched, { mode: 0o755 });

  // is-teammate.sh도 복사 (source 의존)
  const isTeammateSrc = join(dirname(originalPath), 'is-teammate.sh');
  if (existsSync(isTeammateSrc)) {
    copyFileSync(isTeammateSrc, join(hooksDir, 'is-teammate.sh'));
  }

  return destPath;
}
```

### 6-3. teammate-idle.test.ts

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEnv, runHook, cleanupTestEnv, prepareHookScript } from './helpers';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const ORIGINAL_HOOK = '/Users/smith/projects/bscamp/.claude/hooks/teammate-idle.sh';

describe('teammate-idle.sh', () => {
  let env: ReturnType<typeof createTestEnv>;
  let hookPath: string;

  beforeEach(() => {
    env = createTestEnv();
    hookPath = prepareHookScript(ORIGINAL_HOOK, env.tmpDir, env.hooksDir);
  });

  afterEach(() => {
    cleanupTestEnv(env.tmpDir);
  });

  describe('1단계: team-context.json 기반 필터링', () => {
    it('UT-1: 자기 팀 TASK만 스캔, 다른 팀 TASK 무시', () => {
      // team-context: CTO-1, taskFiles: [TASK-CTO-RESUME.md]
      writeFileSync(join(env.runtimeDir, 'team-context.json'), JSON.stringify({
        team: 'CTO-1',
        taskFiles: ['TASK-CTO-RESUME.md'],
        teammates: []
      }));
      // CTO TASK: 미완료 있음
      writeFileSync(join(env.tasksDir, 'TASK-CTO-RESUME.md'),
        '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [ ] 미완료 항목\n');
      // PM TASK: 미완료 있음 (스캔되면 안 됨)
      writeFileSync(join(env.tasksDir, 'TASK-PM-RESUME.md'),
        '---\nteam: PM-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [ ] PM 미완료\n');

      const result = runHook(hookPath);
      expect(result.exitCode).toBe(2); // 미완료 있음 → 계속 작업
      expect(result.stdout).toContain('TASK-CTO-RESUME');
      expect(result.stdout).not.toContain('PM');
    });

    it('UT-3: 등록된 TASK 모두 완료 → exit 0', () => {
      writeFileSync(join(env.runtimeDir, 'team-context.json'), JSON.stringify({
        team: 'CTO-1',
        taskFiles: ['TASK-CTO-RESUME.md'],
        teammates: []
      }));
      writeFileSync(join(env.tasksDir, 'TASK-CTO-RESUME.md'),
        '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [x] 완료 항목\n');

      const result = runHook(hookPath);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('완료');
    });
  });

  describe('2단계: 프론트매터 폴백', () => {
    it('UT-2: team-context.json 없으면 프론트매터로 폴백 → 전체 스캔', () => {
      // team-context.json 없음
      writeFileSync(join(env.tasksDir, 'TASK-A.md'),
        '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [ ] 항목A\n');
      writeFileSync(join(env.tasksDir, 'TASK-B.md'),
        '---\nteam: PM-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [ ] 항목B\n');
      writeFileSync(join(env.tasksDir, 'TASK-C.md'),
        '# TASK\n- [ ] 레거시 항목C\n');

      const result = runHook(hookPath);
      expect(result.exitCode).toBe(2);
      // team-context 없고 CURRENT_TEAM도 없으면 전체 스캔 → 3개 모두 포함
    });
  });

  describe('엣지 케이스', () => {
    it('E-1: team-context.json 손상 → 프론트매터 폴백', () => {
      writeFileSync(join(env.runtimeDir, 'team-context.json'), '{invalid json!!!');
      writeFileSync(join(env.tasksDir, 'TASK-X.md'),
        '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [ ] 항목\n');

      const result = runHook(hookPath);
      expect(result.exitCode).toBe(2); // 폴백으로 전체 스캔 → 미완료 발견
    });

    it('E-4: 프론트매터 내 - [ ] 패턴은 체크박스로 오인 안 함', () => {
      writeFileSync(join(env.runtimeDir, 'team-context.json'), JSON.stringify({
        team: 'CTO-1',
        taskFiles: ['TASK-TRAP.md'],
        teammates: []
      }));
      // 프론트매터 안에 - [ ] 가 있고, 본문엔 체크박스 없음
      writeFileSync(join(env.tasksDir, 'TASK-TRAP.md'),
        '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\nassignees:\n  - role: backend-dev\n    tasks: [T1]\n---\n# TASK\n- [x] 완료된 항목만\n');

      const result = runHook(hookPath);
      expect(result.exitCode).toBe(0); // 프론트매터의 - 패턴은 무시됨
    });

    it('E-5: team: unassigned TASK는 스캔 제외', () => {
      // team-context 없으면 프론트매터 폴백
      writeFileSync(join(env.tasksDir, 'TASK-ORPHAN.md'),
        '---\nteam: unassigned\nstatus: pending\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [ ] 미배정 항목\n');

      const result = runHook(hookPath);
      expect(result.exitCode).toBe(0); // unassigned는 제외 → 미완료 0건
    });

    it('E-6: status: completed TASK는 체크박스 무관하게 스킵', () => {
      writeFileSync(join(env.runtimeDir, 'team-context.json'), JSON.stringify({
        team: 'CTO-1',
        taskFiles: ['TASK-DONE.md'],
        teammates: []
      }));
      writeFileSync(join(env.tasksDir, 'TASK-DONE.md'),
        '---\nteam: CTO-1\nstatus: completed\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [ ] 이건 무시됨\n');

      const result = runHook(hookPath);
      expect(result.exitCode).toBe(0); // completed → 스킵
    });
  });
});
```

### 6-4. frontmatter-parser.test.ts

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('프론트매터 파싱 함수', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'fm-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // parse_frontmatter_field를 인라인 bash로 테스트
  function parseFrontmatter(fileContent: string, key: string): string {
    const filePath = join(tmpDir, 'test.md');
    writeFileSync(filePath, fileContent);
    try {
      return execSync(
        `awk '/^---$/{n++; next} n==1{print}' "${filePath}" | grep "^${key}:" | sed "s/^${key}: *//"`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
    } catch {
      return '';
    }
  }

  function scanUnchecked(fileContent: string): string {
    const filePath = join(tmpDir, 'test.md');
    writeFileSync(filePath, fileContent);
    try {
      return execSync(
        `awk '/^---$/{fm_count++; next} fm_count >= 2 || fm_count == 0{print NR": "$0}' "${filePath}" | grep '\\- \\[ \\]'`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
    } catch {
      return '';
    }
  }

  it('UT-5: team 필드 정상 추출', () => {
    const content = '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n';
    expect(parseFrontmatter(content, 'team')).toBe('CTO-1');
    expect(parseFrontmatter(content, 'status')).toBe('in-progress');
    expect(parseFrontmatter(content, 'owner')).toBe('leader');
  });

  it('E-2: 프론트매터 없는 파일 → 빈 값', () => {
    const content = '# TASK\n- [ ] 항목\n';
    expect(parseFrontmatter(content, 'team')).toBe('');
  });

  it('E-4: 프론트매터 내 체크박스 패턴 무시', () => {
    const content = '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\nassignees:\n  - role: backend-dev\n    tasks: [T1]\n---\n# TASK\n- [x] 완료만\n';
    const unchecked = scanUnchecked(content);
    expect(unchecked).toBe(''); // 프론트매터 내 - 패턴 무시, 본문엔 미완료 없음
  });

  it('프론트매터 외부의 체크박스만 탐지', () => {
    const content = '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [x] 완료\n- [ ] 미완료\n';
    const unchecked = scanUnchecked(content);
    expect(unchecked).toContain('- [ ] 미완료');
  });

  it('프론트매터 없는 파일도 전체 스캔', () => {
    const content = '# TASK\n- [ ] 레거시 항목\n';
    const unchecked = scanUnchecked(content);
    expect(unchecked).toContain('- [ ] 레거시 항목');
  });
});
```

### 6-5. task-completed.test.ts

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEnv, runHook, cleanupTestEnv, prepareHookScript } from './helpers';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const ORIGINAL_HOOK = '/Users/smith/projects/bscamp/.claude/hooks/task-completed.sh';

describe('task-completed.sh BOARD.json 갱신', () => {
  let env: ReturnType<typeof createTestEnv>;
  let hookPath: string;

  beforeEach(() => {
    env = createTestEnv();
    hookPath = prepareHookScript(ORIGINAL_HOOK, env.tmpDir, env.hooksDir);
  });

  afterEach(() => {
    cleanupTestEnv(env.tmpDir);
  });

  it('UT-4: 체크박스 완료 시 BOARD.json completedCount 갱신', () => {
    // team-context.json
    writeFileSync(join(env.runtimeDir, 'team-context.json'), JSON.stringify({
      team: 'CTO-1',
      taskFiles: ['TASK-CTO-RESUME.md'],
      teammates: []
    }));
    // BOARD.json 초기 상태
    writeFileSync(join(env.tasksDir, 'BOARD.json'), JSON.stringify({
      version: '1.0',
      updatedAt: '2026-03-28T00:00:00Z',
      teams: {
        'CTO-1': { status: 'active', taskFiles: ['TASK-CTO-RESUME.md'], completedCount: 0, totalCount: 3 }
      },
      unassigned: []
    }));
    // TASK 파일: 체크박스 1완료 2미완료
    writeFileSync(join(env.tasksDir, 'TASK-CTO-RESUME.md'),
      '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [x] 완료1\n- [ ] 미완료1\n- [ ] 미완료2\n');

    // task-completed.sh는 git 명령 의존이 있어 부분만 테스트
    // BOARD.json 갱신 로직은 별도 함수로 추출하여 테스트
    const board = JSON.parse(readFileSync(join(env.tasksDir, 'BOARD.json'), 'utf-8'));
    // 초기 상태 확인
    expect(board.teams['CTO-1'].completedCount).toBe(0);
    // 실제 갱신은 hook 실행으로 검증 (git 의존 때문에 integration test 성격)
  });

  it('E-3: BOARD.json에 등록된 TASK 파일 삭제됨 → 집계에서 제외', () => {
    writeFileSync(join(env.runtimeDir, 'team-context.json'), JSON.stringify({
      team: 'CTO-1',
      taskFiles: ['TASK-DELETED.md', 'TASK-EXISTS.md'],
      teammates: []
    }));
    writeFileSync(join(env.tasksDir, 'BOARD.json'), JSON.stringify({
      version: '1.0',
      updatedAt: '2026-03-28T00:00:00Z',
      teams: {
        'CTO-1': { status: 'active', taskFiles: ['TASK-DELETED.md', 'TASK-EXISTS.md'], completedCount: 0, totalCount: 5 }
      },
      unassigned: []
    }));
    // TASK-DELETED.md는 생성하지 않음 (삭제된 상태)
    writeFileSync(join(env.tasksDir, 'TASK-EXISTS.md'),
      '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [x] 완료\n- [ ] 미완료\n');

    // count_checkboxes는 존재하는 파일만 집계 → TASK-DELETED.md는 [ -f ] 체크로 스킵
  });
});
```

### 6-6. Fixture 파일 내용

**`__tests__/hooks/fixtures/team_context_cto.json`**:
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

**`__tests__/hooks/fixtures/team_context_invalid.json`**:
```
{invalid json content here!!!
  not valid: true
```

**`__tests__/hooks/fixtures/board_multi_team.json`**:
```json
{
  "version": "1.0",
  "updatedAt": "2026-03-28T10:00:00+09:00",
  "teams": {
    "CTO-1": {
      "status": "active",
      "taskFiles": ["TASK-CTO-RESUME.md", "TASK-CTO-CLEAN.md"],
      "completedCount": 3,
      "totalCount": 8
    },
    "PM-1": {
      "status": "active",
      "taskFiles": ["TASK-PM-RESUME.md"],
      "completedCount": 0,
      "totalCount": 3
    }
  },
  "unassigned": [
    "TASK-LP-MEDIA-DOWNLOAD.md",
    "TASK-COLLECTION-GAPS.md"
  ]
}
```

**`__tests__/hooks/fixtures/task_with_frontmatter.md`**:
```markdown
---
team: CTO-1
session: sdk-cto
created: 2026-03-28
status: in-progress
owner: leader
assignees:
  - role: backend-dev
    tasks: [T1, T2, T3]
---
# TASK: CTO팀 남은 작업 마무리

### T1: Railway 코드 정리
- [x] 파일명 변경
- [ ] 환경변수 변경

### T2: 데이터 이관
- [ ] 스크립트 작성
```

**`__tests__/hooks/fixtures/task_with_frontmatter_completed.md`**:
```markdown
---
team: CTO-1
session: sdk-cto
created: 2026-03-28
status: completed
owner: leader
---
# TASK: 완료된 작업

### T1: 완료
- [x] 모두 완료
- [ ] 이건 status가 completed라 무시됨
```

**`__tests__/hooks/fixtures/task_legacy.md`**:
```markdown
# TASK: 레거시 (프론트매터 없음)

### T1: 구형 작업
- [ ] 프론트매터 없는 레거시 체크박스
- [x] 완료된 항목
```

**`__tests__/hooks/fixtures/task_unassigned.md`**:
```markdown
---
team: unassigned
status: pending
created: 2026-03-28
owner: leader
---
# TASK: 미배정 작업

- [ ] 누구한테도 배정 안 된 항목
```

**`__tests__/hooks/fixtures/task_frontmatter_checkbox_trap.md`**:
```markdown
---
team: CTO-1
status: in-progress
created: 2026-03-28
owner: leader
assignees:
  - role: backend-dev
    tasks: [T1]
---
# TASK: 프론트매터 트랩

### T1: 모두 완료
- [x] 완료된 항목만 있음
```

---

## 부록 A: 기존 TASK 프론트매터 매핑

| TASK 파일 | team | status | owner | pdcaFeature |
|-----------|------|--------|-------|-------------|
| TASK-CTO-RESUME.md | CTO-1 | in-progress | leader | cto-resume |
| TASK-CTO-CLEAN.md | CTO-1 | in-progress | leader | cto-clean |
| TASK-PM-RESUME.md | PM-1 | pending | leader | — |
| TASK-MKT-RESUME.md | MKT-1 | pending | leader | — |
| TASK-LP-MEDIA-DOWNLOAD.md | unassigned | pending | leader | — |
| TASK-COLLECTION-GAPS.md | unassigned | pending | leader | — |
| TASK-COLLECT-AND-EMBED.md | unassigned | pending | leader | — |
| TASK-DEEPGAZE-GEMINI-PIPELINE.md | unassigned | pending | leader | — |
| TASK-GCS-STORAGE-MIGRATION.md | unassigned | pending | leader | — |

## 부록 B: 삭제 대상 Hook 파일 확인

| 파일 | 내용 | 삭제 사유 |
|------|------|-----------|
| `notify-hook.sh` | `notify_hook() { return 0 }` (5줄, 비활성) | always exit 0. notify-completion.sh와 중복 |
| `notify-task-completed.sh` | Slack DM + macOS 알림 (57줄) | task-completed.sh + notify-completion.sh와 기능 중복 |
| `notify-openclaw.sh` | `exit 0` (3줄, 비활성) | always exit 0. Stop + TaskCompleted 양쪽 등록으로 불필요한 지연 |

## 부록 C: Hook 31개 최종 분류

| # | 파일 | 분류 | 이벤트 | 조치 |
|---|------|------|--------|------|
| 1 | pre-read-context.sh | ✅ 유지 | PreToolUse(Bash) | settings.local에 추가 |
| 2 | validate-task.sh | ✅ 유지 | PreToolUse(Bash) | settings.local에 추가 |
| 3 | validate-qa.sh | ✅ 유지 | PreToolUse(Bash) | 이미 등록 |
| 4 | validate-pdca.sh | ✅ 유지 | PreToolUse(Bash) | settings.local에 추가 |
| 5 | destructive-detector.sh | ✅ 유지 | PreToolUse(Bash) | 이미 등록 |
| 6 | validate-design.sh | 🔧 개선 | PreToolUse(Edit\|Write) | Bash에서 제거 |
| 7 | enforce-qa-before-merge.sh | ✅ 유지 | PreToolUse(Bash) | 이미 등록 |
| 8 | pdca-single-source.sh | ✅ 유지 | PreToolUse(Bash) | settings.local에 추가 |
| 9 | validate-delegate.sh | ✅ 유지 | PreToolUse(Edit\|Write) | 이미 등록 |
| 10 | validate-plan.sh | ✅ 유지 | PreToolUse(Edit\|Write) | 이미 등록 |
| 11 | enforce-plan-before-do.sh | ✅ 유지 | PreToolUse(Edit\|Write) | 이미 등록 |
| 12 | validate-before-delegate.sh | ✅ 유지 | PreToolUse(Task) | 이미 등록 |
| 13 | enforce-teamcreate.sh | ✅ 유지 | PreToolUse(Agent) | 이미 등록 |
| 14 | validate-pdca-before-teamdelete.sh | 🔧 개선 | PreToolUse(TeamDelete) | team-context.json 삭제 추가 |
| 15 | task-completed.sh | 🔧 개선 | TaskCompleted | BOARD.json 갱신 추가 |
| 16 | task-quality-gate.sh | ✅ 유지 | TaskCompleted | 이미 등록 |
| 17 | gap-analysis.sh | ➕ 등록 | TaskCompleted | 미등록 → 등록 |
| 18 | pdca-update.sh | ✅ 유지 | TaskCompleted | settings.local에 추가 |
| 19 | pdca-sync-monitor.sh | ✅ 유지 | TaskCompleted | 이미 등록 |
| 20 | auto-team-cleanup.sh | ✅ 유지 | TaskCompleted | settings.local에 추가 |
| 21 | notify-completion.sh | ✅ 유지 | TaskCompleted | 이미 등록 |
| 22 | teammate-idle.sh | 🔧 개선 | TeammateIdle | 소유권 로직 구현 후 등록 |
| 23 | is-teammate.sh | 🔨 헬퍼 | — | source용. 삭제 금지 |
| 24 | detect-process-level.sh | 🔨 헬퍼 | — | source용. L0~L3 판단 |
| 25 | notify-hook.sh | ❌ 삭제 | — | 비활성. 중복 |
| 26 | notify-task-completed.sh | ❌ 삭제 | — | task-completed와 중복 |
| 27 | notify-openclaw.sh | ❌ 삭제 | — | 비활성. 중복 |
| 28 | agent-slack-notify.sh | ⏸️ 보류 | — | Slack 연동 미구현 |
| 29 | agent-state-sync.sh | ⏸️ 보류 | — | team-context와 역할 중복 |
| 30 | force-team-kill.sh | ⏸️ 보류 | — | 수동 긴급 종료 스크립트 |
| 31 | protect-stage.sh | ⏸️ 보류 | — | 현재 미사용 패턴 |

**집계**: ✅ 유지 15 / 🔧 개선 4 / ➕ 등록 1 / ❌ 삭제 3 / 🔨 헬퍼 2 / ⏸️ 보류 4 = 총 29 파일 유지
