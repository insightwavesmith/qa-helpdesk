# Design: 브릭 엔진 임계 훅 5종

> 작성일: 2026-04-05
> 작성자: PM
> 레벨: L2-기능
> TASK: docs/tasks/TASK-brick-dashboard-ux-improve.md (TASK 1)

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| 기능 | 브릭 엔진 PDCA 워크플로우 품질 보장 훅 5종 |
| 핵심 | 리더 직접 코딩 차단, Plan 없이 Do 차단, 품질 게이트, Gap 분석, 완료 알림 |
| 트리거 | Claude Code hooks (PreToolUse, TaskCompleted) |
| 기존 구현 | `.claude/hooks/`에 5개 모두 존재 — 본 설계는 정규화 + 브릭 엔진 맥락 강화 |
| TDD | BH-001 ~ BH-045 (45건) |

---

## 기존 설계 참조

| 문서 | 관계 | 충돌 |
|------|------|------|
| brick-architecture.design.md | 엔진 아키텍처 — 훅이 보호하는 대상 | 없음 |
| brick-p0-agent-abstraction.design.md | Gate 시스템 — 훅은 Gate와 별도 레이어 | 없음 |
| brick-p1-operations.design.md | reject_reason — gap-analysis.sh가 활용 | 없음 |

---

## 0. 훅 시스템 아키텍처

### 0.1 실행 환경

```
Claude Code CLI
  └── settings.json → hooks 등록
       ├── PreToolUse (도구 실행 전 검사)
       │    ├── matcher: "Bash" → 커밋/빌드 전 검증
       │    └── matcher: "Edit|Write" → 코드 편집 전 검증
       └── TaskCompleted (작업 완료 후 실행)
            └── 품질 게이트 + 알림 → 자동 실행
```

### 0.2 공통 규약

| 규약 | 값 |
|------|-----|
| exit 0 | 허용 (allow) |
| exit 2 | 차단 (block) — 사용자에게 이유 표시 |
| 입력 | stdin으로 JSON (`{ tool_input: { command, file_path, ... } }`) |
| 팀원 우회 | `IS_TEAMMATE=true` 환경변수 시 exit 0 (구현 작업 허용) |
| 프로세스 레벨 | `detect-process-level.sh` → L0/L1/L2/L3 판단 |
| 로깅 | `helpers/hook-output.sh` → `.bkit/runtime/hook-logs/` |
| 차단 기록 | `helpers/block-logger.sh` → `.bkit/runtime/block-log.json` |

### 0.3 훅 vs 게이트 (역할 분리)

| | 훅 (Shell) | 게이트 (Python) |
|---|---|---|
| **실행 환경** | Claude Code CLI (로컬) | 브릭 엔진 (서버) |
| **트리거** | 도구 호출 전/후 | 블록 완료 시 |
| **대상** | 개발자/에이전트 행동 | 워크플로우 블록 전이 |
| **차단 방법** | exit 2 (도구 실행 취소) | GateResult.passed=False |
| **예시** | "리더가 src/ 수정 금지" | "match_rate < 90 → 재시도" |

---

## 1. validate-delegate.sh — 리더 직접 편집 차단

### 1.1 목적

리더(pane .0)가 `src/`, 엔진 코드 등 구현 파일을 직접 편집하면 차단.
CLAUDE.md "리더 직접 코드 수정 금지" 규칙 강제.

### 1.2 트리거

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "bash .bkit/hooks/validate-delegate.sh",
        "timeout": 5000
      }
    ]
  }
}
```

### 1.3 입력/출력

**입력** (stdin JSON):
```json
{
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "/Users/smith/projects/bscamp/brick/brick/engine/executor.py",
    "old_string": "...",
    "new_string": "..."
  }
}
```

**출력**:
- exit 0: 편집 허용
- exit 2: 차단 + stderr에 이유 출력

### 1.4 판정 로직

```
1. tmux 세션이 아니면 → exit 0 (비팀 환경 통과)
2. IS_TEAMMATE=true → exit 0 (팀원 통과)
3. tmux pane_index 확인
   - pane > 0 (팀원 pane):
     - .claude/, migration, .env 파일 → exit 2 (보안 파일 차단)
     - 그 외 → exit 0
   - pane = 0 (리더 pane):
     - 허용 목록 확인:
       docs/, TASK*, CLAUDE*, .claude/settings*,
       .bkit/state|logs/, *.md, package.json, tsconfig.json
     - 허용 목록에 있으면 → exit 0
     - 없으면 → exit 2 ("리더는 구현 파일 직접 편집 금지")
```

### 1.5 리더 허용 목록 (Allowlist)

| 패턴 | 이유 |
|------|------|
| `docs/` | Plan/Design 문서 |
| `TASK*`, `CLAUDE*` | 작업 정의, 규칙 |
| `.claude/settings*` | 훅 설정 |
| `.bkit/state\|logs/` | 상태 파일 |
| `*.md` | 문서 |
| `package.json`, `tsconfig.json` | 프로젝트 설정 |

**나머지 모든 경로** → 차단. 특히 `brick/brick/`, `src/`, `dashboard/src/`.

### 1.6 보안 파일 (팀원도 차단)

| 패턴 | 이유 |
|------|------|
| `.claude/` | 에이전트 설정 |
| `migration` | DB 마이그레이션 |
| `.env` | 비밀 |

이 파일들은 `helpers/approval-handler.sh` 통해 승인 요청 → 300초 TTL 승인 후에만 편집 가능.

### 1.7 성공/실패 기준

| 상황 | 결과 |
|------|------|
| 리더가 executor.py 편집 시도 | exit 2 차단 |
| 리더가 docs/plan.md 편집 | exit 0 허용 |
| 팀원이 executor.py 편집 | exit 0 허용 |
| 팀원이 .claude/settings.json 편집 | exit 2 차단 (승인 필요) |
| 비tmux 환경에서 편집 | exit 0 허용 |

---

## 2. validate-plan.sh — Plan 없이 Do 차단

### 2.1 목적

L2/L3 작업에서 Plan/Design 문서 없이 구현 파일(`src/`, `brick/brick/`) 수정 시도 시 차단.
CLAUDE.md "코딩 전 Plan/Design 필수" 규칙 강제.

### 2.2 트리거

```json
{
  "matcher": "Edit|Write",
  "command": "bash .bkit/hooks/validate-plan.sh",
  "timeout": 10000
}
```

### 2.3 입력/출력

**입력** (stdin JSON): Edit/Write 도구 입력 (file_path 포함)

**출력**: exit 0 (허용) / exit 2 (차단)

### 2.4 판정 로직

```
1. IS_TEAMMATE=true → exit 0
2. detect-process-level.sh → $PROCESS_LEVEL
3. L0/L1 → exit 0 (Plan/Design 스킵 가능)
4. 대상 파일이 docs/, *.md, .bkit/ → exit 0 (문서 자체는 편집 가능)
5. 대상 파일이 src/ 또는 brick/brick/ (구현 파일):
   a. TASK*.md 존재 확인 → 없으면 exit 2 "TASK 문서 필요"
   b. docs/01-plan/features/*.plan.md 존재 확인 → 없으면 exit 2 "Plan 문서 필요"
   c. docs/02-design/features/*.design.md 존재 확인 → 없으면 exit 2 "Design 문서 필요"
   d. .pdca-status.json 존재 + 최근 수정 확인
6. 전부 통과 → exit 0
```

### 2.5 문서 존재 판단

```bash
# Plan 문서: 가장 최근 수정된 것 기준
PLAN=$(find docs/01-plan/features/ -name "*.plan.md" -mmin -1440 | head -1)
# 24시간(1440분) 이내 수정된 Plan이 있어야 함

# Design 문서: 동일
DESIGN=$(find docs/02-design/features/ -name "*.design.md" -mmin -1440 | head -1)
```

### 2.6 프로세스 레벨별 동작

| 레벨 | Plan 필요 | Design 필요 | 체크 대상 |
|------|-----------|-------------|----------|
| L0 | ❌ | ❌ | 스킵 |
| L1 | ❌ | 상황별 | Design만 |
| L2 | ✅ | ✅ | Plan + Design |
| L3 | ✅ | ✅ | Plan + Design + ADR |

### 2.7 성공/실패 기준

| 상황 | 결과 |
|------|------|
| L2에서 Plan 없이 executor.py 편집 | exit 2 "Plan 문서 필요" |
| L2에서 Plan+Design 있고 executor.py 편집 | exit 0 |
| L0에서 Plan 없이 executor.py 편집 | exit 0 (핫픽스) |
| L3에서 ADR 없이 auth/ 편집 | exit 2 "ADR 필요" |

---

## 3. task-quality-gate.sh — 품질 게이트

### 3.1 목적

작업 완료 시 tsc + build + 산출물 존재를 자동 검증.
CLAUDE.md "tsc/build 통과 필수" 규칙 강제.

### 3.2 트리거

```json
{
  "event": "TaskCompleted",
  "command": "bash .bkit/hooks/task-quality-gate.sh",
  "timeout": 120000
}
```

### 3.3 판정 로직

```
1. IS_TEAMMATE=true → exit 0 (팀원 완료는 리더가 검증)
2. detect-process-level.sh → $PROCESS_LEVEL

L0 (fix/hotfix):
   → exit 0 (긴급 수정 — 품질 게이트 스킵)

L1 (경량):
   → docs/ 또는 .claude/tasks/ 에 60분 이내 수정 파일 존재 확인
   → 없으면 경고 (exit 0 — 차단은 안 함)

L2/L3 (표준/풀):
   a. npx tsc --noEmit → 실패 시 에러 카운트 증가
   b. npm run build → 실패 시 에러 카운트 증가
   c. docs/03-analysis/*.analysis.md 존재 확인 → 1일 이내 수정
   d. .pdca-status.json 존재 + 1시간 이내 수정
   e. 에러 카운트 > 0 → exit 2 + 에러 목록 출력
   f. 전부 통과 → exit 0
```

### 3.4 검증 항목 상세

| 항목 | L0 | L1 | L2 | L3 |
|------|-----|-----|-----|-----|
| tsc --noEmit | ❌ | ❌ | ✅ | ✅ |
| npm run build | ❌ | ❌ | ✅ | ✅ |
| 산출물 존재 | ❌ | ⚠️ 경고만 | ✅ | ✅ |
| analysis.md | ❌ | ❌ | ✅ | ✅ |
| pdca-status.json | ❌ | ❌ | ✅ | ✅ |
| pytest (brick) | ❌ | ❌ | ❌ | ✅ |

### 3.5 로그 출력

```
task-quality-gate: L2 검증 시작
  [1/4] tsc --noEmit ... ✓ (0 errors)
  [2/4] npm run build ... ✓
  [3/4] analysis.md ... ✓ (brick-p1-ops.analysis.md)
  [4/4] pdca-status.json ... ✓ (수정: 5분 전)
task-quality-gate: 전부 통과 → exit 0
```

상세 로그: `.bkit/runtime/hook-logs/task-quality-gate-{YYYYMMDD-HHMMSS}.log`

### 3.6 성공/실패 기준

| 상황 | 결과 |
|------|------|
| L2 tsc 에러 3건 | exit 2 "tsc: 3 errors" |
| L2 build 성공 + analysis.md 없음 | exit 2 "분석 문서 미생성" |
| L0 hotfix 완료 | exit 0 (스킵) |
| L3 tsc+build 통과 + pytest 실패 | exit 2 "pytest: 2 failures" |

---

## 4. gap-analysis.sh — Design vs 구현 자동 비교

### 4.1 목적

커밋 시 TASK 문서에 명시된 파일이 실제로 staged 되었는지 검증.
"Design에 있는데 구현에 없음" Gap 자동 감지.

### 4.2 트리거

```json
{
  "matcher": "Bash",
  "command": "bash .bkit/hooks/gap-analysis.sh",
  "timeout": 15000
}
```

`git commit` 명령 감지 시에만 실행.

### 4.3 판정 로직

```
1. IS_TEAMMATE=true → exit 0
2. Bash 명령이 git commit이 아니면 → exit 0
3. 커밋 메시지가 docs:/chore:/style:/ci: → exit 0 (문서/스타일 커밋 면제)
4. 가장 최근 수정된 TASK*.md 찾기
5. TASK에서 섹션 헤더 추출 (T[0-9]+, A[0-9]+, B[0-9]+, Part [A-Z] 등)
6. 각 섹션에서 .ts/.tsx/.py 파일명 추출
7. git diff --cached --name-only로 staged 파일 목록 확인
8. TASK에 명시된 파일이 staged에 없으면 → 누락 목록에 추가
9. 누락 > 0 → exit 2 + 누락 목록 출력
10. 전부 매칭 → exit 0
```

### 4.4 Gap 감지 방법

```bash
# TASK 문서에서 파일 참조 추출
grep -oE '[a-zA-Z0-9/_-]+\.(ts|tsx|py|yaml)' "$TASK_FILE" | sort -u > /tmp/task-files.txt

# staged 파일 목록
git diff --cached --name-only > /tmp/staged-files.txt

# 차집합 = Gap
comm -23 /tmp/task-files.txt /tmp/staged-files.txt > /tmp/gap-files.txt
```

### 4.5 커밋 면제 패턴

| 패턴 | 이유 |
|------|------|
| `docs:` | 문서 전용 커밋 |
| `chore:` | 잡무 |
| `style:` | 스타일링 |
| `ci:` | CI/CD |
| `test:` | 테스트 전용 |

### 4.6 성공/실패 기준

| 상황 | 결과 |
|------|------|
| TASK에 executor.py 명시, staged에 있음 | exit 0 |
| TASK에 executor.py 명시, staged에 없음 | exit 2 "누락: executor.py" |
| docs: 커밋 | exit 0 (면제) |
| TASK 파일 없음 | exit 0 (TASK 없으면 검증 스킵) |

---

## 5. notify-completion.sh — 완료 시 Slack 알림

### 5.1 목적

블록/작업 완료 시 Slack DM으로 모찌(COO)에게 자동 알림.
PDCA 체인 핸드오프의 시작점.

### 5.2 트리거

```json
{
  "event": "TaskCompleted",
  "command": "bash .bkit/hooks/notify-completion.sh",
  "timeout": 10000
}
```

### 5.3 판정 로직

```
1. tmux 세션이 아니면 → exit 0 (알림 불필요)
2. tmux 세션명이 ^sdk- 패턴이 아니면 → exit 0
3. tmux pane 출력에서 태스크 완료 라인 파싱:
   "N tasks (N done, 0 in progress, 0 open)"
4. 전체 완료 감지 시:
   a. SLACK_BOT_TOKEN 확인 → 없으면 로그만 남기고 exit 0
   b. Slack API 호출:
      POST https://slack.com/api/chat.postMessage
      channel: U06BP49UEJD (Smith님 DM)
      text: "✅ {세션명} 작업 완료\n`tmux attach -t {세션명}`"
5. 항상 exit 0 (알림은 non-blocking)
```

### 5.4 Slack 메시지 형식

```json
{
  "channel": "U06BP49UEJD",
  "text": "✅ sdk-cto 작업 완료\n세션: `tmux attach -t sdk-cto`\n시간: 2026-04-05 15:30:22"
}
```

### 5.5 브릭 엔진 확장: 블록 완료 알림

현재 구현은 tmux 세션 기준이지만, 브릭 엔진 맥락에서는 블록 단위 알림이 필요:

```bash
# 브릭 엔진 블록 완료 시 추가 알림
if [ -n "$BRICK_EXECUTION_ID" ] && [ -n "$BRICK_BLOCK_ID" ]; then
  curl -s -X POST "https://slack.com/api/chat.postMessage" \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"channel\": \"D09V1NX98SK\",
      \"text\": \"🧱 블록 완료: $BRICK_BLOCK_ID\\n워크플로우: $BRICK_EXECUTION_ID\"
    }"
fi
```

환경변수 `BRICK_EXECUTION_ID`, `BRICK_BLOCK_ID`는 ClaudeLocalAdapter가 주입 (P0 설계 참조).

### 5.6 알림 레벨

| 수신자 | 채널 | 조건 |
|--------|------|------|
| Smith님 | `U06BP49UEJD` (DM) | 전체 워크플로우 완료 |
| 모찌(COO) | `D09V1NX98SK` (DM) | 블록 완료 |
| #brick-alerts | 채널 | Gate 실패, 에러 |

### 5.7 성공/실패 기준

| 상황 | 결과 |
|------|------|
| 작업 완료 + SLACK_BOT_TOKEN 있음 | Slack DM 전송 + exit 0 |
| 작업 완료 + 토큰 없음 | 로그만 남기고 exit 0 |
| 부분 완료 (3/5 done) | 알림 안 함 + exit 0 |
| tmux 세션이 아닌 환경 | exit 0 (스킵) |

---

## 6. settings.json 등록 구조

### 6.1 현재 등록 상태

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "bash .bkit/hooks/validate-delegate.sh", "timeout": 5000 },
          { "type": "command", "command": "bash .bkit/hooks/validate-plan.sh", "timeout": 10000 }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash .bkit/hooks/gap-analysis.sh", "timeout": 15000 }
        ]
      }
    ],
    "TaskCompleted": [
      { "type": "command", "command": "bash .bkit/hooks/task-quality-gate.sh", "timeout": 120000 },
      { "type": "command", "command": "bash .bkit/hooks/notify-completion.sh", "timeout": 10000 }
    ]
  }
}
```

### 6.2 실행 순서

**PreToolUse:Edit|Write** (순차 실행):
1. enforce-agent-teams.sh (5s)
2. **validate-delegate.sh** (5s) ← 리더 차단
3. **validate-plan.sh** (10s) ← Plan 확인
4. validate-design.sh (15s)

**TaskCompleted** (순차 실행):
1. task-completed.sh (10s)
2. **task-quality-gate.sh** (120s) ← 품질 게이트
3. **gap-analysis.sh** (15s) ← Gap 분석
4. pdca-update.sh (30s)
5. filter-completion-dm.sh (5s)
6. **notify-completion.sh** (10s) ← Slack 알림
7. deploy-trigger.sh (10s)
8. pdca-chain-handoff.sh (15s)

---

## 7. 구현 방법 지침

### 7.1 공통 패턴 (모든 훅)

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. 안전 장치
trap 'exit 0' ERR  # 에러 시 허용 (safe-fail)

# 2. 헬퍼 로드
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$HOOK_DIR/helpers/hook-output.sh"
hook_init "$(basename "$0" .sh)"

# 3. 팀원 우회
[ "${IS_TEAMMATE:-}" = "true" ] && exit 0

# 4. 프로세스 레벨
source "$HOOK_DIR/helpers/detect-process-level.sh"

# 5. stdin 파싱 (PreToolUse만)
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('tool_input', {}).get('file_path', ''))
" 2>/dev/null || echo "")

# 6. 검증 로직
# ...

# 7. 결과 출력
hook_result "PASS" "검증 통과"
exit 0
```

### 7.2 파일 위치

| 파일 | 경로 |
|------|------|
| 훅 스크립트 | `.bkit/hooks/{name}.sh` |
| 헬퍼 | `.bkit/hooks/helpers/{name}.sh` |
| 로그 | `.bkit/runtime/hook-logs/{name}-{timestamp}.log` |
| 차단 기록 | `.bkit/runtime/block-log.json` |
| 설정 | `.claude/settings.json` |

### 7.3 에러 처리

- `trap 'exit 0' ERR` — 훅 자체 에러로 작업 차단하지 않음 (safe-fail)
- 차단 시에만 exit 2 + stderr 메시지
- 모든 차단은 `helpers/block-logger.sh`로 기록

---

## 8. TDD 케이스

### validate-delegate.sh (BH-001~010)

| ID | 테스트 | 입력 | 기대 |
|----|--------|------|------|
| BH-001 | 리더가 src/ 편집 → 차단 | pane=0, file=brick/brick/engine/executor.py | exit 2 |
| BH-002 | 리더가 docs/ 편집 → 허용 | pane=0, file=docs/plan.md | exit 0 |
| BH-003 | 리더가 CLAUDE.md 편집 → 허용 | pane=0, file=CLAUDE.md | exit 0 |
| BH-004 | 팀원이 src/ 편집 → 허용 | pane=1, file=brick/brick/engine/executor.py | exit 0 |
| BH-005 | 팀원이 .claude/ 편집 → 차단 | pane=1, file=.claude/settings.json | exit 2 |
| BH-006 | 팀원이 migration 편집 → 승인 요청 | pane=1, file=migration/001.sql | approval-handler 호출 |
| BH-007 | 비tmux 환경 → 허용 | TMUX 없음 | exit 0 |
| BH-008 | IS_TEAMMATE=true → 허용 | IS_TEAMMATE=true | exit 0 |
| BH-009 | 리더가 package.json 편집 → 허용 | pane=0, file=package.json | exit 0 |
| BH-010 | 리더가 dashboard/src/ 편집 → 차단 | pane=0, file=dashboard/src/pages/index.tsx | exit 2 |

### validate-plan.sh (BH-011~020)

| ID | 테스트 | 입력 | 기대 |
|----|--------|------|------|
| BH-011 | L2 + Plan 없이 src/ 편집 → 차단 | L2, no plan.md | exit 2 |
| BH-012 | L2 + Plan 있고 Design 없이 → 차단 | L2, plan.md 있음, design.md 없음 | exit 2 |
| BH-013 | L2 + Plan+Design 있고 편집 → 허용 | L2, 둘 다 있음 | exit 0 |
| BH-014 | L0 + Plan 없이 편집 → 허용 | L0 | exit 0 |
| BH-015 | L1 + Design 없이 편집 → 상황별 | L1 | Design만 체크 |
| BH-016 | docs/ 파일 편집 → 항상 허용 | file=docs/anything.md | exit 0 |
| BH-017 | TASK 파일 없으면 → 차단 | no TASK*.md | exit 2 |
| BH-018 | 24시간 지난 Plan → 최신 Plan 필요 | plan.md mtime > 24h | exit 2 |
| BH-019 | L3 + ADR 없으면 → 차단 | L3, no ADR | exit 2 |
| BH-020 | IS_TEAMMATE=true → 허용 | IS_TEAMMATE=true | exit 0 |

### task-quality-gate.sh (BH-021~030)

| ID | 테스트 | 입력 | 기대 |
|----|--------|------|------|
| BH-021 | L2 tsc 통과 + build 통과 → 허용 | tsc 0 err, build ok | exit 0 |
| BH-022 | L2 tsc 실패 → 차단 | tsc 3 errors | exit 2 |
| BH-023 | L2 build 실패 → 차단 | build failed | exit 2 |
| BH-024 | L0 → 스킵 | L0 | exit 0 |
| BH-025 | L1 산출물 없음 → 경고만 | L1, no docs/ changes | exit 0 (warn) |
| BH-026 | L2 analysis.md 없음 → 차단 | no analysis.md | exit 2 |
| BH-027 | L2 pdca-status.json 오래됨 → 차단 | mtime > 1h | exit 2 |
| BH-028 | IS_TEAMMATE=true → 허용 | IS_TEAMMATE=true | exit 0 |
| BH-029 | L3 pytest 실패 → 차단 | pytest 2 failures | exit 2 |
| BH-030 | 로그 파일 생성 확인 | 실행 후 | hook-logs/ 파일 존재 |

### gap-analysis.sh (BH-031~040)

| ID | 테스트 | 입력 | 기대 |
|----|--------|------|------|
| BH-031 | TASK 파일 참조 = staged 파일 → 허용 | 완전 매칭 | exit 0 |
| BH-032 | TASK에 executor.py 명시, staged에 없음 → 차단 | 불일치 | exit 2 |
| BH-033 | docs: 커밋 → 면제 | msg="docs: plan 작성" | exit 0 |
| BH-034 | chore: 커밋 → 면제 | msg="chore: 정리" | exit 0 |
| BH-035 | TASK 파일 없음 → 스킵 | no TASK*.md | exit 0 |
| BH-036 | git commit 아닌 Bash 명령 → 스킵 | "npm run build" | exit 0 |
| BH-037 | IS_TEAMMATE=true → 허용 | IS_TEAMMATE=true | exit 0 |
| BH-038 | 여러 섹션 파일 전부 staged → 허용 | 복수 파일 매칭 | exit 0 |
| BH-039 | 부분 누락 → 차단 + 누락 목록 | 2/5 누락 | exit 2 + 목록 |
| BH-040 | Slack 알림 전송 확인 | 차단 시 | Slack DM 전송 |

### notify-completion.sh (BH-041~045)

| ID | 테스트 | 입력 | 기대 |
|----|--------|------|------|
| BH-041 | 전체 완료 + 토큰 있음 → Slack DM | 5/5 done, SLACK_BOT_TOKEN | Slack 전송 |
| BH-042 | 전체 완료 + 토큰 없음 → 로그만 | 5/5 done, no token | 로그 기록 |
| BH-043 | 부분 완료 → 알림 안 함 | 3/5 done | exit 0, 알림 없음 |
| BH-044 | 비tmux → 스킵 | TMUX 없음 | exit 0 |
| BH-045 | 브릭 블록 완료 → 블록 알림 | BRICK_BLOCK_ID 설정 | 블록 DM 전송 |

---

## 9. 불변식

| ID | 불변식 | 검증 |
|----|--------|------|
| INV-H1 | 훅 자체 에러로 작업 차단 안 됨 | trap 'exit 0' ERR 적용 |
| INV-H2 | 리더는 구현 파일 직접 편집 불가 | validate-delegate 차단 |
| INV-H3 | L2/L3 Plan 없이 코딩 불가 | validate-plan 차단 |
| INV-H4 | 품질 게이트 우회 불가 | task-quality-gate exit 2 |
| INV-H5 | Slack 토큰 마스킹 | stderr에서 xoxb-/sk- 필터 |
| INV-H6 | exit 0/2만 사용 | 다른 exit code 금지 |
