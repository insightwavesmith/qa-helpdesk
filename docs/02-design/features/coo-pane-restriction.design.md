# Hook 강제 + COO Pane 제한 (coo-pane-restriction) Design

> 작성일: 2026-04-01
> 프로세스 레벨: L2
> 작성자: PM팀
> Plan: `docs/01-plan/features/coo-pane-restriction.plan.md`

---

## 1. 아키텍처

### 1.1 hook 위치

```
PreToolUse:Bash 체인 (실행 순서):
  ① destructive-detector.sh     ← 위험 명령 차단 (rm -rf, force push 등)
  ② pane-access-guard.sh        ← [신규] 팀원 pane 직접 접근 차단
  ③ validate-qa.sh              ← QA 전 merge 차단
  ④ validate-pdca.sh            ← PDCA 준수
  ⑤ validate-task.sh            ← TASK 유효성
  ⑥ enforce-qa-before-merge.sh  ← QA 없이 merge 차단
  ⑦ validate-deploy-authority.sh ← 배포 권한
  ⑧ postmortem-review-gate.sh   ← 회고 필독
```

destructive-detector 바로 뒤에 배치. 파괴적 명령 차단이 우선, 역할 경계 차단이 그 다음.

### 1.2 판정 흐름

```
[Bash 명령 입력]
    │
    ▼
tool_name == "Bash"?
    ├── 아니오 → exit 0 (무관)
    │
    ▼ 예
command에 "tmux send-keys" 포함?
    ├── 아니오 → exit 0 (무관)
    │
    ▼ 예
-t 옵션에서 타겟 파싱: <session>.<pane>
    │
    ▼
pane >= 1? (팀원 pane인가?)
    ├── 아니오 (pane 0 or 파싱 실패) → exit 0 (리더 pane 접근 허용)
    │
    ▼ 예 (팀원 pane)
호출자 = 해당 팀 리더(pane 0)인가?
    ├── 예 → exit 0 (자기 팀 팀원 접근 허용)
    │
    ▼ 아니오
차단 (exit 2) + 리다이렉트 안내
    "팀원 pane 직접 접근 금지 — 리더({session}.0)로 전달하세요"
```

### 1.3 호출자 판별 방법

```bash
# 현재 프로세스가 위치한 tmux 세션/pane
CALLER_SESSION=$(tmux display-message -p '#{session_name}' 2>/dev/null)
CALLER_PANE=$(tmux display-message -p '#{pane_index}' 2>/dev/null)

# 호출자가 타겟 세션의 pane 0이면 → 자기 팀 리더
# 조건: CALLER_SESSION == TARGET_SESSION && CALLER_PANE == 0
```

---

## 2. pane-access-guard.sh 상세 설계

### 2.1 입력 파싱

```bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tool = data.get('tool_name', '')
    if tool != 'Bash':
        sys.exit(0)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)
```

destructive-detector.sh와 동일한 파싱 패턴. tool_name이 Bash가 아니면 즉시 exit 0.

### 2.2 타겟 파싱 정규식

```bash
# tmux send-keys 명령에서 -t 옵션의 타겟 추출
# 지원 형태:
#   tmux send-keys -t sdk-cto.1 "command"
#   tmux send-keys -t sdk-cto:0.2 "command"    (window:pane 형태)
#   tmux send-keys -t "sdk-cto.1" "command"    (따옴표)
#   tmux send-keys "text" -t sdk-cto.1          (-t 위치 변형)

# 패턴: send-keys 이후 -t 옵션 뒤의 세션명.pane번호
TARGET=$(echo "$COMMAND" | grep -oE 'send-keys?\s+.*-t\s+["\x27]?([a-zA-Z0-9_-]+)(:[0-9]+)?\.([0-9]+)' | grep -oE '[a-zA-Z0-9_-]+(:[0-9]+)?\.([0-9]+)$')

# 또는 -t가 send-keys 앞에 올 수도 있음
if [ -z "$TARGET" ]; then
    TARGET=$(echo "$COMMAND" | grep -oE -- '-t\s+["\x27]?([a-zA-Z0-9_-]+)(:[0-9]+)?\.([0-9]+)' | grep -oE '[a-zA-Z0-9_-]+(:[0-9]+)?\.([0-9]+)$')
fi
```

### 2.3 타겟 분해

```bash
# sdk-cto.2 → SESSION=sdk-cto, PANE=2
# sdk-cto:0.2 → SESSION=sdk-cto, PANE=2
TARGET_SESSION=$(echo "$TARGET" | sed -E 's/(:[0-9]+)?\.[0-9]+$//')
TARGET_PANE=$(echo "$TARGET" | grep -oE '\.[0-9]+$' | tr -d '.')
```

### 2.4 판정 로직

```bash
# 팀원 pane이 아니면 허용
if [ -z "$TARGET_PANE" ] || [ "$TARGET_PANE" -eq 0 ] 2>/dev/null; then
    exit 0
fi

# 팀원 pane (>= 1) → 호출자가 해당 팀 리더인지 확인
CALLER_SESSION=$(tmux display-message -p '#{session_name}' 2>/dev/null)
CALLER_PANE=$(tmux display-message -p '#{pane_index}' 2>/dev/null)

# 호출자 = 타겟 세션의 리더(pane 0)이면 허용
if [ "$CALLER_SESSION" = "$TARGET_SESSION" ] && [ "$CALLER_PANE" = "0" ]; then
    exit 0
fi

# 그 외 → 차단
echo "[pane-access-guard] 차단: 팀원 pane 직접 접근 금지 (A0-7)" >&2
echo "   명령어: $COMMAND" >&2
echo "   대상: ${TARGET_SESSION}.${TARGET_PANE} (팀원)" >&2
echo "   리더 pane으로 전달하세요: ${TARGET_SESSION}.0" >&2
exit 2
```

### 2.5 V3 PID 역추적 연동

```bash
# hook 시작부에 V3 자동 등록 (기존 패턴)
source "$(dirname "$0")/helpers/hook-self-register.sh" 2>/dev/null
auto_register_peer 2>/dev/null
```

### 2.6 비-tmux 환경 처리

```bash
# tmux 환경이 아니면 이 hook은 의미 없음 → 허용
if [ -z "$TMUX" ]; then
    exit 0
fi
```

---

## 3. settings.local.json 등록

### 3.1 변경 내용

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash .bkit/hooks/destructive-detector.sh", "timeout": 5000 },
          { "type": "command", "command": "bash .bkit/hooks/pane-access-guard.sh", "timeout": 5000 },
          // ... 기존 hook 유지
        ]
      }
    ]
  }
}
```

destructive-detector.sh 바로 다음에 추가. timeout 5000ms (tmux 명령 파싱만 하므로 충분).

---

## 4. 문서 업데이트

### 4.1 TEAM-ABSOLUTE-PRINCIPLES.md — A0-7 추가

```markdown
### [A0-7] 팀원 pane 직접 접근 금지
- 모찌(COO)는 `tmux send-keys` 대상이 반드시 리더 pane(`sdk-*.0`)만 허용
- 팀원 pane(`sdk-*.1`, `sdk-*.2` 등) 직접 접근 → hook이 자동 차단
- 차단 시 → 리더 pane(`.0`)으로 리다이렉트 안내
- 범용: 모든 비리더가 타 팀 팀원 pane에 직접 접근하는 것도 차단
- **리더만 자기 팀 팀원에 send-keys 가능**
```

### 4.2 TEAM-PLAYBOOK.md Ch.3 hook 목록

hook 번호 40번으로 추가:
```
 40  │ pane-access-guard.sh            │ 팀원 pane 직접 접근 차단 (A0-7)        │ PreToolUse:Bash
```

### 4.3 TEAM-PLAYBOOK.md Ch.3 빈 구멍

6번째 빈 구멍으로 추가 (해결됨 마킹):
```
6. **COO 팀원 pane 직접 접근**: COO가 리더를 우회하여 팀원에 직접 send-keys → pane-access-guard.sh로 해결
```

### 4.4 TEAM-PLAYBOOK.md Ch.7 A0-7 추가

A0-6 다음에 A0-7 섹션 추가.

---

## 5. 엣지 케이스

### 5.1 send-keys 변형 구문

| 구문 | 매칭 | 비고 |
|------|------|------|
| `tmux send-keys -t sdk-cto.1 "text"` | ✅ | 기본 형태 |
| `tmux send-keys -t sdk-cto:0.1 "text"` | ✅ | window:pane 형태 |
| `tmux send-keys -t "sdk-cto.1" "text"` | ✅ | 따옴표 |
| `tmux send-keys "text" -t sdk-cto.1` | ✅ | -t 뒤에 위치 |
| `tmux send-key -t sdk-cto.1 "text"` | ✅ | 단수형 (send-key) |
| `tmux send-keys -t sdk-cto "text"` | ✅ 허용 | pane 미지정 = 기본(0) |
| `tmux send-keys -t sdk-cto.0 "text"` | ✅ 허용 | 리더 pane |
| `TMUX_TARGET=sdk-cto.1; tmux send-keys -t $TMUX_TARGET` | ❌ 미감지 | 변수 간접 참조 — 제한사항 |

### 5.2 비-tmux 실행

- `$TMUX` 미존재 → exit 0 (비-tmux 환경에서는 팀 구조가 없으므로 차단 불필요)

### 5.3 tmux 명령 아닌 경우

- command에 `tmux send-keys`가 없으면 즉시 exit 0
- 다른 tmux 명령 (list-panes, display-message 등) → 무관, 허용

### 5.4 리더가 타 팀 팀원에 접근

```
sdk-cto 리더(pane 0) → tmux send-keys -t sdk-pm.1
```

CALLER_SESSION(sdk-cto) ≠ TARGET_SESSION(sdk-pm) → 차단. 타 팀 팀원 접근 불가.
리더 간 통신은 claude-peers를 사용해야 함.

---

## 6. TDD 케이스

### 6.1 기본 차단 케이스 (C-01 ~ C-05)

| ID | 시나리오 | 입력 | 호출자 | 예상 결과 |
|----|---------|------|--------|----------|
| **C-01** | COO가 CTO 팀원 pane 접근 | `tmux send-keys -t sdk-cto.1 "ls"` | sdk-pm.0 (또는 비-팀 세션) | exit 2, "팀원 pane 직접 접근 금지" |
| **C-02** | COO가 CTO 팀원 pane 2 접근 | `tmux send-keys -t sdk-cto.2 "ls"` | 비-팀 세션 | exit 2 |
| **C-03** | COO가 PM 팀원 pane 접근 | `tmux send-keys -t sdk-pm.1 "ls"` | 비-팀 세션 | exit 2 |
| **C-04** | PM 리더가 CTO 팀원 접근 | `tmux send-keys -t sdk-cto.1 "ls"` | sdk-pm.0 | exit 2, 타 팀 접근 차단 |
| **C-05** | CTO 팀원이 다른 팀원 접근 | `tmux send-keys -t sdk-cto.2 "ls"` | sdk-cto.1 | exit 2, 팀원→팀원 차단 |

### 6.2 허용 케이스 (C-06 ~ C-10)

| ID | 시나리오 | 입력 | 호출자 | 예상 결과 |
|----|---------|------|--------|----------|
| **C-06** | COO가 CTO 리더 pane 접근 | `tmux send-keys -t sdk-cto.0 "ls"` | 비-팀 세션 | exit 0 (리더 pane 허용) |
| **C-07** | CTO 리더가 자기 팀원 접근 | `tmux send-keys -t sdk-cto.1 "ls"` | sdk-cto.0 | exit 0 (자기 팀 허용) |
| **C-08** | CTO 리더가 자기 팀원 pane 3 접근 | `tmux send-keys -t sdk-cto.3 "text"` | sdk-cto.0 | exit 0 (자기 팀 허용) |
| **C-09** | pane 미지정 접근 | `tmux send-keys -t sdk-cto "ls"` | 비-팀 세션 | exit 0 (pane 미지정 = 기본 pane) |
| **C-10** | tmux 아닌 명령 | `echo "hello"` | 아무나 | exit 0 (무관) |

### 6.3 변형 구문 케이스 (C-11 ~ C-15)

| ID | 시나리오 | 입력 | 호출자 | 예상 결과 |
|----|---------|------|--------|----------|
| **C-11** | window:pane 형태 | `tmux send-keys -t sdk-cto:0.2 "text"` | 비-팀 세션 | exit 2 (pane 2 = 팀원) |
| **C-12** | 따옴표 타겟 | `tmux send-keys -t "sdk-cto.1" "text"` | 비-팀 세션 | exit 2 |
| **C-13** | -t 뒤 위치 | `tmux send-keys "text" -t sdk-cto.1` | 비-팀 세션 | exit 2 |
| **C-14** | send-key 단수형 | `tmux send-key -t sdk-cto.1 "text"` | 비-팀 세션 | exit 2 |
| **C-15** | 비-tmux 환경 | `tmux send-keys -t sdk-cto.1 "text"` | $TMUX 미존재 | exit 0 (비-tmux 허용) |

### 6.4 리다이렉트 안내 케이스 (C-16 ~ C-18)

| ID | 시나리오 | 검증 포인트 |
|----|---------|------------|
| **C-16** | 차단 시 stderr에 리더 pane 안내 | stderr 출력에 `sdk-cto.0` 포함 |
| **C-17** | 차단 시 stderr에 원칙 번호 안내 | stderr 출력에 `A0-7` 포함 |
| **C-18** | 차단 시 원래 명령어 표시 | stderr 출력에 원본 command 포함 |

### 6.5 비-Bash tool 케이스 (C-19 ~ C-20)

| ID | 시나리오 | 입력 tool_name | 예상 결과 |
|----|---------|---------------|----------|
| **C-19** | Edit tool 입력 | Edit | exit 0 (Bash만 검사) |
| **C-20** | Write tool 입력 | Write | exit 0 (Bash만 검사) |

---

## 7. 구현 파일 전체 구조 (의사 코드)

```bash
#!/bin/bash
# pane-access-guard.sh — 팀원 pane 직접 접근 차단 (A0-7)
# PreToolUse hook for Bash tool
# exit 0 = 허용, exit 2 = 차단
#
# 원칙: 팀의 리더(pane 0)만 해당 팀 팀원(pane 1+)에 send-keys 가능
# COO, 타 팀 리더, 팀원 → 타 팀/자기 팀 팀원 pane 직접 접근 금지

# V3 PID 역추적
source "$(dirname "$0")/helpers/hook-self-register.sh" 2>/dev/null
auto_register_peer 2>/dev/null

# 비-tmux 환경 → 무관
[ -z "$TMUX" ] && exit 0

# 입력 파싱 (Bash tool command만)
INPUT=$(cat)
COMMAND=$(python3 파싱...)
[ -z "$COMMAND" ] && exit 0

# tmux send-keys 명령인가?
echo "$COMMAND" | grep -qE 'tmux\s+send-keys?' || exit 0

# 타겟 파싱: -t <session>.<pane>
TARGET=... (정규식 추출)
TARGET_SESSION=... (세션명)
TARGET_PANE=... (pane 번호)

# 리더 pane(0)이거나 pane 미지정 → 허용
[ -z "$TARGET_PANE" ] || [ "$TARGET_PANE" -eq 0 ] && exit 0

# 팀원 pane → 호출자 확인
CALLER_SESSION=$(tmux display-message -p '#{session_name}')
CALLER_PANE=$(tmux display-message -p '#{pane_index}')

# 자기 팀 리더 → 허용
[ "$CALLER_SESSION" = "$TARGET_SESSION" ] && [ "$CALLER_PANE" = "0" ] && exit 0

# 그 외 → 차단
echo "[pane-access-guard] 차단: 팀원 pane 직접 접근 금지 (A0-7)" >&2
echo "   명령어: $COMMAND" >&2
echo "   대상: ${TARGET_SESSION}.${TARGET_PANE} (팀원)" >&2
echo "   리더 pane으로 전달하세요: ${TARGET_SESSION}.0" >&2
exit 2
```

---

## 8. 변경 영향 범위

| 파일 | 변경 유형 | 영향 |
|------|----------|------|
| `.bkit/hooks/pane-access-guard.sh` | 신규 | PreToolUse:Bash에 추가 |
| `.claude/settings.local.json` | 수정 | PreToolUse:Bash 배열에 1건 추가 |
| `TEAM-ABSOLUTE-PRINCIPLES.md` | 수정 | A0-7 원칙 추가 (외부 문서) |
| `docs/TEAM-PLAYBOOK.md` | 수정 | Ch.3 hook 목록 + Ch.7 A0-7 |

src/ 수정 없음. 서비스 코드 영향 0.

---

## 9. 항목 2: spawn.sh 강제 (enforce-spawn.sh)

### 9.1 입력 파싱

```bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tool = data.get('tool_name', '')
    if tool != 'Bash':
        sys.exit(0)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)
```

### 9.2 감지 패턴

```bash
# claude 바이너리 직접 실행 감지 (spawn.sh 경유 아닌 경우)
# 허용: spawn.sh, claude-peers, claude --version, claude-code
# 차단: claude --resume, claude -p, bare claude 실행

# spawn.sh 경유면 허용
echo "$COMMAND" | grep -qE 'spawn\.sh' && exit 0

# claude 유틸리티 명령 허용
echo "$COMMAND" | grep -qE 'claude-peers|claude-code|claude\s+--version|claude\s+--help' && exit 0

# bare claude 실행 감지
if echo "$COMMAND" | grep -qE '(^|\s|/)(claude)\s+(--resume|-p\s|--print|-c\s|--continue)'; then
    echo "[enforce-spawn] 차단: claude 직접 실행 감지 (A0-8)" >&2
    echo "   명령어: $COMMAND" >&2
    echo "   spawn.sh를 사용하세요: bash .bkit/hooks/spawn.sh" >&2
    exit 2
fi
```

### 9.3 비-tmux / 비-팀 환경 처리

```bash
# 팀 환경이 아니면 이 hook은 의미 없음 → 허용
[ -z "$TMUX" ] && exit 0
[ -z "$CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" ] && exit 0
```

---

## 10. 항목 3: kill 차단 (prevent-tmux-kill.sh)

### 10.1 감지 패턴

```bash
# tmux kill-session / kill-pane / kill-server 감지
if echo "$COMMAND" | grep -qE 'tmux\s+kill-(session|pane|server)'; then
    KILL_TYPE=$(echo "$COMMAND" | grep -oE 'kill-(session|pane|server)')
    echo "[prevent-tmux-kill] 차단: tmux $KILL_TYPE 감지 (A0-4)" >&2
    echo "   명령어: $COMMAND" >&2
    echo "   /exit 명령으로 정상 종료하세요. tmux kill은 registry 정리를 누락합니다." >&2
    exit 2
fi
```

### 10.2 예외 없음

- Smith님이 직접 터미널에서 실행하는 것은 hook 대상 아님 (에이전트 hook만 적용)
- 에이전트가 실행하는 모든 tmux kill 명령은 무조건 차단

---

## 11. 항목 4: coo_approved 게이팅 (validate-coo-approval.sh)

### 11.1 트리거 조건

```bash
# spawn.sh 호출 시 TASK 파일이 인자로 전달됨
# 패턴: spawn.sh ... TASK-*.md 또는 환경변수 TASK_FILE
if echo "$COMMAND" | grep -qE 'spawn\.sh'; then
    # TASK 파일 경로 추출
    TASK_FILE=$(echo "$COMMAND" | grep -oE 'TASK-[A-Z0-9_-]+\.md' | head -1)
fi
```

### 11.2 TASK 파일 검증

```bash
TASK_DIR="/Users/smith/.openclaw/workspace/tasks"

if [ -n "$TASK_FILE" ]; then
    TASK_PATH="$TASK_DIR/$TASK_FILE"
    if [ ! -f "$TASK_PATH" ]; then
        echo "[validate-coo-approval] 차단: TASK 파일 미존재" >&2
        echo "   파일: $TASK_PATH" >&2
        exit 2
    fi

    # coo_approved: true 확인 (frontmatter 또는 본문)
    if ! grep -qE 'coo_approved:\s*true' "$TASK_PATH"; then
        echo "[validate-coo-approval] 차단: Smith님 승인 필요 (A0-1)" >&2
        echo "   TASK: $TASK_FILE" >&2
        echo "   coo_approved: true가 없습니다. T 단계를 완료하세요." >&2
        exit 2
    fi
fi
```

### 11.3 fail-open vs fail-closed

- TASK_FILE 파싱 실패 (spawn.sh 아닌 다른 명령) → exit 0 (무관)
- TASK_FILE은 있지만 파일 미존재 → exit 2 (fail-closed)
- TASK_FILE + 파일 존재 + coo_approved 없음 → exit 2 (차단)

---

## 12. 항목 5: 레벨/담당팀 게이팅 (validate-task-fields.sh)

### 12.1 필수 필드

```bash
# 레벨 확인: L0, L1, L2, L3 중 하나
if ! grep -qE '(^|\s)(L[0-3])(\s|$|,|기능|버그)' "$TASK_PATH"; then
    echo "[validate-task-fields] 차단: 레벨 미기입" >&2
    echo "   TASK: $TASK_FILE" >&2
    echo "   L0~L3 중 하나를 명시하세요." >&2
    exit 2
fi

# 담당팀 확인: sdk-cto, sdk-pm 등
if ! grep -qE '담당.*sdk-|sdk-(cto|pm)' "$TASK_PATH"; then
    echo "[validate-task-fields] 차단: 담당팀 미기입" >&2
    echo "   TASK: $TASK_FILE" >&2
    echo "   담당팀을 명시하세요 (예: sdk-cto, sdk-pm)." >&2
    exit 2
fi
```

### 12.2 트리거

항목 4와 동일 — `spawn.sh` 호출 시 TASK 파일 검증.
항목 4 통과 후 항목 5 실행 (체인 순서).

---

## 13. 항목 6: DM 차단 (filter-completion-dm.sh)

### 13.1 hook 이벤트

TaskCompleted hook (PostToolUse나 TaskCompleted 이벤트).

### 13.2 판별 로직

```bash
#!/bin/bash
# filter-completion-dm.sh — 팀원 TaskCompleted DM 차단 (A0-3)
# TaskCompleted hook
# exit 0 = 허용, exit 2 = 차단

source "$(dirname "$0")/helpers/hook-self-register.sh" 2>/dev/null
auto_register_peer 2>/dev/null

# 비-tmux → 허용
[ -z "$TMUX" ] && exit 0

# 팀 환경 아니면 → 허용
[ -z "$CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" ] && exit 0

CALLER_PANE=$(tmux display-message -p '#{pane_index}' 2>/dev/null)

# 리더(pane 0) → 허용
[ "$CALLER_PANE" = "0" ] && exit 0

# 팀원(pane 1+) → DM 전송 차단
INPUT=$(cat)
# TaskCompleted 이벤트에서 Smith님 DM 패턴 감지
# notify-completion.sh가 webhook/DM을 보내는데, 팀원이 트리거하면 차단
echo "[filter-completion-dm] 차단: 팀원 완료 DM 금지 (A0-3)" >&2
echo "   pane: $CALLER_PANE (팀원)" >&2
echo "   완료 보고는 리더(pane 0)만 할 수 있습니다." >&2
exit 2
```

### 13.3 주의

- 팀원의 TaskCompleted 자체를 차단하는 것이 아님
- 팀원이 TaskCompleted → notify-completion.sh 체인으로 DM이 나가는 것을 차단
- filter-completion-dm.sh를 notify-completion.sh 앞에 배치

---

## 14. 항목 7: 슬랙 알림 필터 (validate-slack-payload.sh)

### 14.1 감지 패턴

```bash
# curl + hooks.slack.com 패턴
if ! echo "$COMMAND" | grep -qE 'curl.*hooks\.slack\.com'; then
    exit 0  # 슬랙 전송 아님 → 무관
fi
```

### 14.2 payload 검증

```bash
# -d 또는 --data 옵션에서 JSON payload 추출
PAYLOAD=$(echo "$COMMAND" | grep -oE "(-d|--data)\s+'[^']*'" | sed "s/^-d\s*'//;s/^--data\s*'//;s/'$//")

if [ -z "$PAYLOAD" ]; then
    # --data-raw, --data-binary 등 변형
    PAYLOAD=$(echo "$COMMAND" | grep -oE "(-d|--data[-a-z]*)\s+\"[^\"]*\"" | sed 's/^-d\s*"//;s/^--data[-a-z]*\s*"//;s/"$//')
fi

# TASK_NAME 필드 확인
if ! echo "$PAYLOAD" | grep -qE '(TASK[-_]NAME|TASK-[A-Z0-9_-]+)'; then
    echo "[validate-slack-payload] 차단: TASK_NAME 누락 (A0-2)" >&2
    echo "   슬랙 알림에 TASK_NAME을 포함하세요." >&2
    exit 2
fi

# 팀명 필드 확인
if ! echo "$PAYLOAD" | grep -qE '(team|팀|sdk-)'; then
    echo "[validate-slack-payload] 차단: 팀명 누락 (A0-2)" >&2
    echo "   슬랙 알림에 팀명을 포함하세요." >&2
    exit 2
fi
```

---

## 15. L0/L1 핫픽스 프로세스 수정

### 15.1 변경 내용

기존: L0/L1은 "CTO 직행" (리더가 직접 코드 수정)
변경: "CTO 리더가 조사 + 범위 정의 → 팀원 구현"

| 레벨 | 기존 프로세스 | 신규 프로세스 |
|------|-------------|-------------|
| **L0** | CTO 직행 (리더 직접 수정) | CTO 리더 조사(범위 정의) → 팀원 구현 → 배포 |
| **L1** | CTO 직행 (리더 직접 수정) | CTO 리더 조사 → 팀원 구현 → QA → 배포 |

### 15.2 문서 수정 대상

**TEAM-ABSOLUTE-PRINCIPLES.md:**
```markdown
## 프로세스 레벨 수정

| 레벨 | 케이스 | PDCA 단계 | hook 강제 |
|------|--------|-----------|---------|
| **L0** | 프로덕션 장애 | **CA** | CTO 리더 조사(범위 정의) → 팀원 구현 → 배포 |
| **L1** | 버그 원인 명확 | **DCA** | CTO 리더 조사 → 팀원 구현 → QA → 배포 |
| **L2 버그** | 버그 원인 불명 | **DCA** | CTO 조사+수정. Design 스킵 |
| **L2 기능** | 요구사항 명확 | **PDCA** | PM Design → CTO 구현 |
| **L3** | 요구사항 불명확/구조 변경 | **PDCA** | PM Plan+Design → CTO 구현 |
```

### 15.3 원칙: 리더 = 판단, 팀원 = 실행

L0/L1에서도 delegate 원칙 유지:
- 리더: 장애 원인 조사, 수정 범위 정의, 팀원에 구현 지시
- 팀원: 실제 코드 수정, 테스트, PR
- L0라도 리더가 직접 src/ 수정 금지 (validate-delegate.sh 그대로 적용)

---

## 16. 확장 TDD 케이스 (항목 2~7)

### 16.1 항목 2: enforce-spawn.sh (C-21 ~ C-28)

| ID | 시나리오 | 입력 | 환경 | 예상 결과 |
|----|---------|------|------|----------|
| **C-21** | bare claude --resume 실행 | `claude --resume abc123` | TMUX+TEAMS | exit 2, "spawn.sh 사용" |
| **C-22** | bare claude -p 실행 | `claude -p "hello"` | TMUX+TEAMS | exit 2 |
| **C-23** | spawn.sh 경유 실행 | `bash .bkit/hooks/spawn.sh ...` | TMUX+TEAMS | exit 0 |
| **C-24** | claude-peers 명령 | `claude-peers list` | TMUX+TEAMS | exit 0 (유틸리티 허용) |
| **C-25** | claude --version | `claude --version` | TMUX+TEAMS | exit 0 (유틸리티 허용) |
| **C-26** | 비-tmux 환경 | `claude --resume abc123` | TMUX 없음 | exit 0 (비-팀 환경) |
| **C-27** | 비-TEAMS 환경 | `claude --resume abc123` | TMUX 있음, TEAMS 없음 | exit 0 (비-팀 환경) |
| **C-28** | claude --continue | `claude --continue` | TMUX+TEAMS | exit 2 |

### 16.2 항목 3: prevent-tmux-kill.sh (C-29 ~ C-35)

| ID | 시나리오 | 입력 | 예상 결과 |
|----|---------|------|----------|
| **C-29** | tmux kill-session | `tmux kill-session -t sdk-cto` | exit 2, "/exit 사용" |
| **C-30** | tmux kill-pane | `tmux kill-pane -t sdk-cto.1` | exit 2 |
| **C-31** | tmux kill-server | `tmux kill-server` | exit 2 |
| **C-32** | tmux list-panes (무관) | `tmux list-panes` | exit 0 |
| **C-33** | tmux send-keys (무관) | `tmux send-keys -t sdk-cto.0 "ls"` | exit 0 |
| **C-34** | 비-tmux 명령 | `echo "hello"` | exit 0 |
| **C-35** | 비-tmux 환경 | `tmux kill-session -t sdk-cto` | exit 0 (비-팀 환경) |

### 16.3 항목 4: validate-coo-approval.sh (C-36 ~ C-42)

| ID | 시나리오 | TASK 파일 상태 | 예상 결과 |
|----|---------|--------------|----------|
| **C-36** | coo_approved: true 있음 | 승인됨 | exit 0 |
| **C-37** | coo_approved: false | 미승인 | exit 2, "Smith님 승인 필요" |
| **C-38** | coo_approved 필드 없음 | 누락 | exit 2 |
| **C-39** | TASK 파일 미존재 | 파일 없음 | exit 2, "TASK 파일 미존재" |
| **C-40** | spawn.sh 아닌 명령 | 무관 | exit 0 (트리거 아님) |
| **C-41** | 비-tmux 환경 | 무관 | exit 0 |
| **C-42** | coo_approved: true (공백 변형) | `coo_approved:  true` | exit 0 (유연 파싱) |

### 16.4 항목 5: validate-task-fields.sh (C-43 ~ C-49)

| ID | 시나리오 | TASK 파일 상태 | 예상 결과 |
|----|---------|--------------|----------|
| **C-43** | 레벨 + 담당팀 모두 존재 | L2 + sdk-cto | exit 0 |
| **C-44** | 레벨 누락 | 담당팀만 존재 | exit 2, "레벨 미기입" |
| **C-45** | 담당팀 누락 | 레벨만 존재 | exit 2, "담당팀 미기입" |
| **C-46** | 둘 다 누락 | 빈 TASK | exit 2 |
| **C-47** | L0 레벨 | L0 + sdk-cto | exit 0 |
| **C-48** | L3 레벨 | L3 + sdk-pm | exit 0 |
| **C-49** | spawn.sh 아닌 명령 | 무관 | exit 0 (트리거 아님) |

### 16.5 항목 6: filter-completion-dm.sh (C-50 ~ C-55)

| ID | 시나리오 | 호출자 | 예상 결과 |
|----|---------|--------|----------|
| **C-50** | 리더(pane 0) 완료 보고 | pane 0 | exit 0 |
| **C-51** | 팀원(pane 1) 완료 보고 | pane 1 | exit 2, "리더만 가능" |
| **C-52** | 팀원(pane 2) 완료 보고 | pane 2 | exit 2 |
| **C-53** | 비-tmux 환경 | 없음 | exit 0 |
| **C-54** | 비-TEAMS 환경 | pane 1 | exit 0 (팀 구조 없음) |
| **C-55** | 차단 시 stderr 안내 | pane 1 | stderr에 "리더(pane 0)" 포함 |

### 16.6 항목 7: validate-slack-payload.sh (C-56 ~ C-63)

| ID | 시나리오 | payload | 예상 결과 |
|----|---------|---------|----------|
| **C-56** | TASK_NAME + 팀명 포함 | `{"TASK_NAME":"TASK-001","team":"sdk-cto"}` | exit 0 |
| **C-57** | TASK_NAME 누락 | `{"team":"sdk-cto"}` | exit 2, "TASK_NAME 누락" |
| **C-58** | 팀명 누락 | `{"TASK_NAME":"TASK-001"}` | exit 2, "팀명 누락" |
| **C-59** | 둘 다 누락 | `{"text":"hello"}` | exit 2 |
| **C-60** | 슬랙 아닌 curl | `curl https://api.example.com` | exit 0 (무관) |
| **C-61** | 비-curl 명령 | `echo "hello"` | exit 0 (무관) |
| **C-62** | TASK- 패턴으로 TASK_NAME 충족 | `{"text":"TASK-COO completed","team":"sdk-cto"}` | exit 0 |
| **C-63** | sdk- 패턴으로 팀명 충족 | `{"TASK_NAME":"TASK-001","text":"sdk-pm completed"}` | exit 0 |

---

## 17. 변경 영향 범위 (확장)

| 파일 | 변경 유형 | 영향 |
|------|----------|------|
| `.bkit/hooks/pane-access-guard.sh` | 신규 | 항목 1 |
| `.bkit/hooks/enforce-spawn.sh` | 신규 | 항목 2 |
| `.bkit/hooks/prevent-tmux-kill.sh` | 신규 | 항목 3 |
| `.bkit/hooks/validate-coo-approval.sh` | 신규 | 항목 4 |
| `.bkit/hooks/validate-task-fields.sh` | 신규 | 항목 5 |
| `.bkit/hooks/filter-completion-dm.sh` | 신규 | 항목 6 |
| `.bkit/hooks/validate-slack-payload.sh` | 신규 | 항목 7 |
| `.claude/settings.local.json` | 수정 | 7개 hook 등록 |
| `TEAM-ABSOLUTE-PRINCIPLES.md` | 수정 | A0-7, A0-8 + L0/L1 프로세스 수정 |
| `docs/TEAM-PLAYBOOK.md` | 수정 | hook 목록 + 원칙 카탈로그 + L0/L1 프로세스 |
| `__tests__/hooks/hook-enforcement.test.ts` | 신규 | 전체 TDD 케이스 |

src/ 수정 없음. 서비스 코드 영향 0.
