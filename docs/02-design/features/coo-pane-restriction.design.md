# COO tmux 팀원 pane 직접 접근 차단 (coo-pane-restriction) Design

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
