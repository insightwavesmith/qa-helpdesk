# Agent Process V2 — 전체 플로우 재설계

> 작성: 2026-03-30 | PM Team | TASK-AGENT-PROCESS-V2.md
> 상태: Design
> 레벨: L2
> Smith님 확정: PM 검수 단계 제거. 단순한 플로우로 시작.

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| Feature | Agent Process V2 (에이전트팀 프로세스 V2) |
| 시작일 | 2026-03-30 |
| 문제 | 7건 실전 장애 (체인 불발, 배포 불가, hook 충돌 등) |
| 근본 원인 | hook 44개, 테스트 479건이 있지만 "전체 연결"이 안 됨 |
| 해결 방향 | hook 50% 감축, 체인 직통화, 배포 명시화, 실전 테스트 도입 |

### Value Delivered

| 관점 | 내용 |
|------|------|
| Problem | 에이전트팀이 자동으로 돌아간 적 없음. 체인 불발, 배포 누락, hook 충돌 |
| Solution | hook 정리 + 체인 단순화 + 배포 규칙 명시 + 실전 TDD |
| Function UX Effect | CTO 개발 완료 → 자동 배포 → COO 보고 → Smith님 확인. 끊기는 구간 0개 |
| Core Value | 수강생 에러 노출 시간 최소화. 개발 완료부터 배포까지 자동 |

---

## 1. 현재 문제 진단

### 1.1 오늘 발견된 7개 문제 + 근본 원인

| # | 문제 | 근본 원인 | V2 해결 방안 |
|---|------|---------|------------|
| **P1** | 체인 안 탐 — peer summary 비어있음 | session start 시 summary 등록 코드 없음 | `set_summary` 자동 호출 (SessionStart hook) |
| **P2** | TeammateIdle hook이 리더 지시 방해 | hook이 리더보다 권한 높음 | **TeammateIdle 완전 제거** (hook + 스크립트) |
| **P3** | 배포를 아무도 못 함 | CLAUDE.md에 배포 단계 없음 + 리더가 배포 안 함 | L0~L3 배포 규칙 CLAUDE.md 명시 + TaskCompleted 체인에 배포 트리거 추가 |
| **P4** | 대시보드 동기화 안 됨 | TeamCreate hook에 registry 업데이트 없음 | PostToolUse/TeamCreate hook 추가 |
| **P5** | 승인 요청 알림 안 감 | pending 파일 생성만, 알림 채널 없음 | macOS 알림 + 리더 메시지 전송 |
| **P6** | TDD가 실전을 못 잡음 | 479건 전부 mock | 실전 조건 검증 테스트 추가 (Section 5) |
| **P7** | dashboard-sync 무한 커밋 | git commit+push로 state 동기화 | GCS 직접 업로드로 전환 (git 금지) |

### 1.2 구조적 문제: hook 과잉 + 연결 부재

**현재 상태:**
- hook 스크립트: 39개 (`.claude/hooks/*.sh`)
- helper 모듈: 13개 (`.claude/hooks/helpers/`)
- settings.local.json 등록: 24개 hook
- 테스트: 36개 파일, 479+ 케이스 — **전부 mock**

**문제의 본질:**
조각(hook, test)은 정교하지만 **전체를 관통하는 흐름이 없음.**
각 hook이 독립적으로 개발되어 서로 충돌하거나 빠진 연결이 있음.

---

## 2. V2 전체 플로우 설계

### 2.1 Simple Chain (Smith님 확정)

```
PM: Plan + Design
    │
    ▼ (COO에게 완료 보고)
CTO: 개발 (팀원이 코드, 리더가 관리)
    │
    ├─ L0 (fix/hotfix): push → 리더 배포 → COO 보고
    │
    └─ L2/L3: push → Gap 95%+ → 리더 배포 → COO 보고
                                     │
                                     ▼
                              COO → Smith님
```

**핵심 변경: PM 검수 단계 완전 제거.**
- 기존: CTO → PM 검수 → COO → Smith
- V2: CTO → (Gap 게이트) → 배포 → COO → Smith
- PM은 Plan+Design 단계에서만 관여

### 2.2 세션 시작 플로우

```
1. Claude Code 세션 시작
   │
   ├─ [자동] session-resume-check.sh
   │   └─ 미완료 TASK/좀비 팀원 감지 + 리포트
   │
   ├─ [자동] set_summary 호출
   │   └─ 역할 식별자 등록
   │     CTO 세션: "CTO_LEADER | bscamp | {현재 TASK}"
   │     PM 세션:  "PM_LEADER | bscamp | {현재 TASK}"
   │     COO 세션: "MOZZI | bscamp | reporting"
   │
   └─ [자동] team-context-{SESSION}.json 생성/확인
```

**P1 해결**: `set_summary`를 CLAUDE.md 세션 시작 규칙에 추가.
hook으로 강제하지 않음 — CLAUDE.md 규칙으로 리더가 직접 실행.
이유: hook으로 `set_summary`를 자동 실행하려면 MCP tool 호출이 필요한데, hook은 bash만 실행 가능. 따라서 CLAUDE.md 규칙 + 세션 체크리스트로 해결.

### 2.3 개발 + 배포 플로우

```
CTO 세션:
   │
   ├─ TeamCreate (backend-dev, frontend-dev, etc.)
   │   └─ [PostToolUse] teammate-registry.json 자동 업데이트 (P4 해결)
   │
   ├─ 팀원 개발 (리더 관리)
   │   ├─ 위험 파일 수정 시 → approval-gate → macOS 알림 (P5 해결)
   │   └─ 리더가 중간 검증 (Read로 산출물 확인)
   │
   ├─ 팀원 완료 → TeamDelete
   │
   ├─ TaskCompleted 체인 (8단계 → 6단계로 축소)
   │   1. task-completed.sh (마커)
   │   2. task-quality-gate.sh (tsc + build)
   │   3. gap-analysis.sh (L2/L3만)
   │   4. pdca-update.sh (상태 기록)
   │   5. deploy-trigger.sh (신규 — 배포 실행)     ← P3 해결
   │   6. pdca-chain-handoff-v3.sh (COO 직접 보고) ← PM 우회
   │
   └─ 배포 후 런타임 검증
       └─ health check + Cloud Run 로그 확인
```

### 2.4 L0~L3 레벨별 배포 규칙 (Smith님 확정)

| 레벨 | 트리거 | Gap 분석 | 배포 주체 | 배포 후 |
|------|--------|---------|---------|--------|
| **L0** | fix:/hotfix: 커밋 | 스킵 | **CTO 리더 즉시 배포** | COO 보고 |
| **L1** | src/ 미수정 (문서/리서치) | 스킵 | 배포 없음 | COO 보고 |
| **L2** | src/ 수정 일반 기능 | **95%+ 필수** | **CTO 리더 배포** | COO 보고 |
| **L3** | DB/Auth/인프라 | **95%+ 필수** | **CTO 리더 배포** | COO 보고 → Smith님 확인 |

**핵심**: 모든 레벨에서 **CTO 리더가 배포 담당**. 팀원은 배포 불가(기존 유지).
L0은 Gap 스킵 후 즉시 배포. L3은 COO 보고 후 Smith님 최종 확인.

### 2.5 체인 핸드오프 V3 (PM 검수 제거)

**기존 (pdca-chain-handoff.sh v3):**
```
L2/L3: CTO → PM_LEADER (COMPLETION_REPORT) → PM 검수 → COO
```

**V2 (pdca-chain-handoff-v3.sh → v4):**
```
L0/L1: CTO → MOZZI 직접 (ANALYSIS_REPORT)     ← 유지
L2/L3: CTO → MOZZI 직접 (COMPLETION_REPORT)   ← 변경: PM 우회
```

**코드 변경:**
```bash
# pdca-chain-handoff.sh v4 — L2/L3 분기 변경
case "$PROCESS_LEVEL" in
    L0|L1)
        TO_ROLE="MOZZI"
        CHAIN_STEP="cto_to_coo"
        ;;
    L2|L3)
        TO_ROLE="MOZZI"          # 변경: PM_LEADER → MOZZI
        CHAIN_STEP="cto_to_coo"  # 변경: cto_to_pm → cto_to_coo
        ;;
esac
```

### 2.6 peer summary 매칭 개선 (P1 근본 해결)

**현재 문제:** `jq select(.summary | test("MOZZI"))` — summary가 비어있으면 매칭 실패.

**V2 해결 — 이중 안전장치:**

**A. CLAUDE.md 규칙 (1차):**
```
세션 시작 즉시: set_summary("{역할} | bscamp | {TASK}")
  - CTO: "CTO_LEADER | bscamp | TASK-xxx"
  - PM:  "PM_LEADER | bscamp | TASK-xxx"
  - COO: "MOZZI | bscamp | reporting"
```

**B. Fallback — 파일 기반 라우팅 (2차):**
peer summary 매칭 실패 시, `.claude/runtime/peer-roles.json`에서 역할→peer ID 매핑:
```json
{
  "CTO_LEADER": { "session": "sdk-cto", "last_seen": "2026-03-30T12:00:00Z" },
  "PM_LEADER": { "session": "sdk-pm", "last_seen": "2026-03-30T12:00:00Z" },
  "MOZZI": { "session": "sdk-coo", "last_seen": "2026-03-30T12:00:00Z" }
}
```
hook이 세션 시작 시 자기 역할을 이 파일에 등록.
pdca-chain-handoff가 peer summary 매칭 실패 → 이 파일에서 target session 찾기 → tmux send-keys로 direct 전송.

**C. 최종 Fallback — 수동 보고 프롬프트:**
A, B 모두 실패 시: `ACTION_REQUIRED: send_message(MOZZI, ...)` 출력 (기존 유지).

---

## 3. Hook 정리 계획

### 3.1 현재 → V2 변경 매트릭스

#### PreToolUse/Bash (9개 → 7개)

| # | Hook | V2 상태 | 사유 |
|---|------|---------|------|
| 1 | destructive-detector.sh | ✅ 유지 | 안전 필수 |
| 2 | validate-qa.sh | ✅ 유지 | QA 게이트 |
| 3 | validate-pdca.sh | ✅ 유지 | PDCA 강제 |
| 4 | validate-task.sh | ✅ 유지 | TASK 유효성 |
| 5 | enforce-qa-before-merge.sh | ✅ 유지 | merge 전 QA |
| 6 | pdca-single-source.sh | ❌ **제거** | pdca-update.sh와 기능 중복 |
| 7 | pre-read-context.sh | ❌ **제거** | 컨텍스트 로딩은 CLAUDE.md 규칙으로 대체 |
| 8 | validate-deploy-authority.sh | ✅ 유지 | 팀원 배포 차단 |
| 9 | postmortem-review-gate.sh | ✅ 유지 | 포스트모템 필독 |

#### PreToolUse/Edit|Write (4개 → 3개)

| # | Hook | V2 상태 | 사유 |
|---|------|---------|------|
| 1 | validate-delegate.sh | ✅ 유지 | 리더 코드 차단 |
| 2 | validate-plan.sh | ✅ 유지 | Plan 필수 |
| 3 | enforce-plan-before-do.sh | ❌ **제거** | validate-plan.sh와 기능 중복 |
| 4 | validate-design.sh | ✅ 유지 | Design 필수 |

#### PreToolUse/Agent (1개 → 1개)

| # | Hook | V2 상태 | 사유 |
|---|------|---------|------|
| 1 | enforce-teamcreate.sh | ✅ 유지 | TeamCreate 강제 |

#### PreToolUse/TeamDelete (1개 → 1개)

| # | Hook | V2 상태 | 사유 |
|---|------|---------|------|
| 1 | validate-pdca-before-teamdelete.sh | ✅ 유지 | 상태 보존 |

#### TaskCompleted (8개 → 6개)

| # | Hook | V2 상태 | 사유 |
|---|------|---------|------|
| 1 | task-completed.sh | ✅ 유지 | 마커 필수 |
| 2 | task-quality-gate.sh | ✅ 유지 | tsc+build |
| 3 | gap-analysis.sh | ✅ 유지 | Gap 분석 |
| 4 | pdca-update.sh | ✅ 유지 | 상태 기록 |
| 5 | pdca-sync-monitor.sh | ❌ **제거** | pdca-update.sh에 통합 |
| 6 | auto-team-cleanup.sh | ❌ **제거** | TeamDelete로 수동 관리 (feedback: teamdelete_immediately) |
| 7 | notify-completion.sh | ✅ 유지 → 확장 | macOS 알림 + 승인 알림 통합 (P5 해결) |
| 8 | pdca-chain-handoff.sh | ✅ 유지 → **v4 업그레이드** | PM 우회, COO 직통 |

#### TeammateIdle (0개 — 이미 제거)

| # | Hook | V2 상태 | 사유 |
|---|------|---------|------|
| - | teammate-idle.sh | ❌ **스크립트 파일 삭제** | P2: 리더 지시와 충돌. 설정은 이미 빈 배열 |

#### 신규 추가

| # | Event | Hook | 역할 |
|---|-------|------|------|
| N1 | PostToolUse/TeamCreate | registry-update.sh | teammate-registry.json 자동 업데이트 (P4 해결) |
| N2 | TaskCompleted 5번 | deploy-trigger.sh | 배포 트리거 (리더 확인 후 실행) (P3 해결) |

### 3.2 V2 hook 총계

| 구분 | 현재 | V2 | 변화 |
|------|------|-----|------|
| PreToolUse 등록 | 16개 | 12개 | -4 |
| TaskCompleted 등록 | 8개 | 6개 | -2 |
| TeammateIdle | 0개 (빈배열) | 제거 (키 삭제) | -키 |
| 신규 | 0 | +2 | +2 |
| **총 등록** | **24개** | **20개** | **-4 (-17%)** |
| 스크립트 파일 | 39개 | 32개 | -7 (미사용 삭제) |

### 3.3 삭제 대상 스크립트 파일

| 파일 | 사유 |
|------|------|
| teammate-idle.sh | P2 해결 — 완전 제거 |
| pdca-single-source.sh | pdca-update.sh와 중복 |
| pre-read-context.sh | CLAUDE.md 규칙으로 대체 |
| enforce-plan-before-do.sh | validate-plan.sh와 중복 |
| pdca-sync-monitor.sh | pdca-update.sh에 통합 |
| pm-chain-forward.sh | PM 검수 제거로 불필요 (Smith님 확정) |
| coo-chain-report.sh | chain-handoff v4에서 COO 직통으로 통합 |

---

## 4. 신규 Hook 상세 설계

### 4.1 registry-update.sh (PostToolUse/TeamCreate)

**목적**: TeamCreate 후 teammate-registry.json 자동 업데이트 (P4 해결)

```bash
#!/bin/bash
# registry-update.sh — TeamCreate 후 registry 자동 업데이트
# PostToolUse(TeamCreate) hook

PROJECT_DIR="/Users/smith/projects/bscamp"
REGISTRY="$PROJECT_DIR/.claude/runtime/teammate-registry.json"
mkdir -p "$(dirname "$REGISTRY")" 2>/dev/null

INPUT=$(cat)
TOOL_RESULT=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    result = data.get('tool_result', {})
    print(json.dumps({
        'name': result.get('name', 'unknown'),
        'model': result.get('model', 'unknown'),
        'created_at': '$(date -u +%Y-%m-%dT%H:%M:%SZ)'
    }))
except:
    print('{}')
" 2>/dev/null)

[ "$TOOL_RESULT" = "{}" ] && exit 0

# Registry 업데이트 (없으면 생성)
if [ -f "$REGISTRY" ]; then
    MEMBER_NAME=$(echo "$TOOL_RESULT" | jq -r '.name')
    jq --argjson member "$TOOL_RESULT" \
       '.members[$member.name] = {state:"active", created:$member.created_at, model:$member.model}' \
       "$REGISTRY" > "${REGISTRY}.tmp" && mv "${REGISTRY}.tmp" "$REGISTRY"
else
    echo "$TOOL_RESULT" | jq '{shutdownState:"running", members:{(.name):{state:"active",created:.created_at,model:.model}}}' > "$REGISTRY"
fi

exit 0
```

### 4.2 deploy-trigger.sh (TaskCompleted 5번)

**목적**: Gap 통과 후 리더에게 배포 실행 안내 (P3 해결)

```bash
#!/bin/bash
# deploy-trigger.sh — Gap 통과 후 배포 안내
# TaskCompleted hook 체인 5번 (gap-analysis 후, chain-handoff 전)

source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"
cd "$PROJECT_DIR" || exit 0

# 프로세스 레벨 판단
LAST_MSG=$(git log --oneline -1 2>/dev/null || echo "")
IS_FIX=$(echo "$LAST_MSG" | grep -cE '^[a-f0-9]+ (fix|hotfix):' || true)
HAS_SRC=$(git diff HEAD~1 --name-only 2>/dev/null | grep -c "^src/" || true)

if [ "$IS_FIX" -gt 0 ]; then
    LEVEL="L0"
elif [ "$HAS_SRC" -eq 0 ]; then
    LEVEL="L1"
else
    LEVEL="L2"
fi

# L1: 배포 불필요 (문서/리서치)
[ "$LEVEL" = "L1" ] && exit 0

# L0: 즉시 배포 안내
if [ "$LEVEL" = "L0" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🚀 [L0 핫픽스] 즉시 배포 필요"
    echo "  커밋: $(git log --oneline -1)"
    echo "  명령: gcloud run deploy bscamp-cron --source . --region asia-northeast3"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    exit 0
fi

# L2/L3: Gap 통과 확인 후 배포 안내
source "$(dirname "$0")/helpers/match-rate-parser.sh" 2>/dev/null
RATE=$(parse_match_rate "$PROJECT_DIR/docs/03-analysis" 2>/dev/null || echo "0")

if [ "${RATE:-0}" -ge 95 ] 2>/dev/null; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🚀 [${LEVEL}] Gap ${RATE}% 통과 — 배포 진행"
    echo "  커밋: $(git log --oneline -1)"
    echo "  명령: gcloud run deploy bscamp-cron --source . --region asia-northeast3"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
fi

exit 0
```

### 4.3 peer summary 등록 (CLAUDE.md 규칙으로 해결)

hook이 아니라 **CLAUDE.md 세션 시작 규칙**에 추가:

```markdown
## 세션 시작 필수 액션 (V2 추가)

세션 시작 즉시 아래 실행 (순서대로):
1. `bash .claude/hooks/session-resume-check.sh` (기존)
2. `set_summary` 호출 — 역할 식별자 등록:
   - CTO 세션: "CTO_LEADER | bscamp | {TASK명}"
   - PM 세션:  "PM_LEADER | bscamp | {TASK명}"
   - COO 세션: "MOZZI | bscamp | reporting"
3. peer-roles.json에 자기 역할 기록 (fallback용)
```

### 4.4 승인 알림 개선 (P5 해결)

**현재**: approval-gate.sh가 pending 파일 생성 → 리더 모름

**V2**: notify-completion.sh를 확장하여 승인 대기 건도 알림

```bash
# notify-completion.sh에 추가할 로직
PENDING_DIR="$PROJECT_DIR/.claude/runtime/approvals/pending"
PENDING_COUNT=$(ls "$PENDING_DIR" 2>/dev/null | wc -l | tr -d ' ')

if [ "$PENDING_COUNT" -gt 0 ]; then
    osascript -e "display notification \"승인 대기 ${PENDING_COUNT}건\" with title \"bscamp 팀원 승인 요청\""
    # 리더 세션에 메시지 전송
    LEADER_PANE=$(tmux list-panes -F '#{pane_index}' 2>/dev/null | head -1)
    if [ -n "$LEADER_PANE" ]; then
        tmux send-keys -t "$LEADER_PANE" "" 2>/dev/null  # 리더 pane에 인터럽트
    fi
fi
```

### 4.5 dashboard-sync GCS 전환 (P7 재발 방지)

**현재**: dashboard-sync.sh가 git commit+push로 state 동기화 → 무한 커밋 위험

**V2**: GCS 직접 업로드 (git 금지)

```bash
# dashboard-sync.sh V2 — GCS 직접 업로드
STATE_FILE="$PROJECT_DIR/.claude/runtime/teammate-registry.json"
GCS_PATH="gs://bscamp-dashboard-state/teammate-registry.json"

# git 사용 금지 — GCS 직접
gsutil -q cp "$STATE_FILE" "$GCS_PATH" 2>/dev/null || true

# 안전장치: 이 스크립트에서 git 명령어 실행 절대 금지
# git add/commit/push 패턴 감지 시 즉시 종료
if grep -q "git \(add\|commit\|push\)" "$0"; then
    echo "ERROR: dashboard-sync에 git 명령어 감지. PM-005 재발 방지." >&2
    exit 1
fi
```

---

## 5. settings.local.json V2 설정

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/destructive-detector.sh", "timeout": 5000 },
          { "type": "command", "command": "bash .claude/hooks/validate-qa.sh", "timeout": 10000 },
          { "type": "command", "command": "bash .claude/hooks/validate-pdca.sh", "timeout": 15000 },
          { "type": "command", "command": "bash .claude/hooks/validate-task.sh", "timeout": 15000 },
          { "type": "command", "command": "bash .claude/hooks/enforce-qa-before-merge.sh", "timeout": 120000 },
          { "type": "command", "command": "bash .claude/hooks/validate-deploy-authority.sh", "timeout": 5000 },
          { "type": "command", "command": "bash .claude/hooks/postmortem-review-gate.sh", "timeout": 10000 }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/validate-delegate.sh", "timeout": 5000 },
          { "type": "command", "command": "bash .claude/hooks/validate-plan.sh", "timeout": 10000 },
          { "type": "command", "command": "bash .claude/hooks/validate-design.sh", "timeout": 15000 }
        ]
      },
      {
        "matcher": "Agent",
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/enforce-teamcreate.sh", "timeout": 5000 }
        ]
      },
      {
        "matcher": "TeamDelete",
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/validate-pdca-before-teamdelete.sh", "timeout": 10000 }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "TeamCreate",
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/registry-update.sh", "timeout": 5000 }
        ]
      }
    ],
    "TaskCompleted": [
      {
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/task-completed.sh", "timeout": 10000 },
          { "type": "command", "command": "bash .claude/hooks/task-quality-gate.sh", "timeout": 120000 },
          { "type": "command", "command": "bash .claude/hooks/gap-analysis.sh", "timeout": 15000 },
          { "type": "command", "command": "bash .claude/hooks/pdca-update.sh", "timeout": 30000 },
          { "type": "command", "command": "bash .claude/hooks/deploy-trigger.sh", "timeout": 10000 },
          { "type": "command", "command": "bash .claude/hooks/pdca-chain-handoff.sh", "timeout": 15000 }
        ]
      }
    ]
  }
}
```

**변경 요약:**
- PreToolUse/Bash: 9 → 7 (pdca-single-source, pre-read-context 제거)
- PreToolUse/Edit|Write: 4 → 3 (enforce-plan-before-do 제거)
- PostToolUse/TeamCreate: 신규 추가 (registry-update)
- TaskCompleted: 8 → 6 (pdca-sync-monitor, auto-team-cleanup 제거, deploy-trigger 추가)
- TeammateIdle: 키 자체 제거
- Stop: 키 자체 제거

---

## 6. TDD 테스트 설계

### 6.1 기존 테스트 현황 + 문제점

**현재**: 40개 파일, 497건 (495 pass, 2 fail). mock 299+회 사용.
**REALWORLD-TEST-CASES.md 14건**: 전부 실전에서 실패.

| 문제 | 예시 | 근본 원인 |
|------|------|---------|
| broker mock | `mockBroker.sendMessage → {ok:true}` | 실제 broker 연결 안 테스트. 실전: broker down → 체인 전멸 |
| summary 미검증 | peer list에서 summary 필드 안 봄 | mock이 항상 유효한 summary 반환. 실전: summary 비어서 매칭 실패 |
| 배포 미테스트 | deploy-authority 차단만 테스트 | 배포 실행 플로우 미테스트. 실전: 3번 연속 배포 안 됨 |
| 레벨 판단 mock | `IS_FIX=1` 하드코딩 | 실제 git log에서 판단하는 로직 미검증 |
| 파일 충돌 미검증 | tmpDir 격리 | 실전: 3팀 동시 team-context.json 충돌 |
| heartbeat 오탐 | binary mock (stuck=true/false) | 실전: 23분 thinking을 stuck으로 오탐 |

### 6.2 V2 TDD 케이스 목록

#### A. 단위 테스트 (mock 환경, vitest)

| # | 파일 | 테스트 | 검증 내용 |
|---|------|--------|---------|
| U1 | deploy-trigger.test.ts | L0 즉시 배포 안내 | fix: 커밋 → 배포 메시지 출력 |
| U2 | deploy-trigger.test.ts | L1 배포 스킵 | src/ 미수정 → 배포 안내 없음 |
| U3 | deploy-trigger.test.ts | L2 Gap 통과 → 배포 안내 | Match Rate 95%+ → 배포 메시지 |
| U4 | deploy-trigger.test.ts | L2 Gap 미통과 → 배포 안내 없음 | Match Rate 80% → 메시지 없음 |
| U5 | registry-update.test.ts | TeamCreate → registry 업데이트 | JSON 구조 검증, 중복 방지 |
| U6 | registry-update.test.ts | registry 없을 때 새로 생성 | 파일 미존재 → 생성 |
| U7 | chain-handoff-v4.test.ts | L2 → MOZZI 직통 (PM 우회) | TO_ROLE="MOZZI", CHAIN_STEP="cto_to_coo" |
| U8 | chain-handoff-v4.test.ts | L3 → MOZZI 직통 (PM 우회) | TO_ROLE="MOZZI" (기존: PM_LEADER) |
| U9 | chain-handoff-v4.test.ts | summary 매칭 실패 → fallback | peer-roles.json에서 target 찾기 |
| U10 | approval-notify.test.ts | pending 파일 존재 → 알림 발생 | osascript 호출 검증 |

#### B. 통합 테스트 (실전 조건 포함)

| # | 파일 | 테스트 | 검증 내용 |
|---|------|--------|---------|
| I1 | chain-e2e-v2.test.ts | 전체 체인 — CTO 완료 → COO 도달 | PM 우회 확인 |
| I2 | chain-e2e-v2.test.ts | L0 체인 — fix 커밋 → 배포 안내 → COO | Gap 스킵 + 배포 + 보고 |
| I3 | chain-e2e-v2.test.ts | peer summary 비어있을 때 → fallback 동작 | peer-roles.json fallback |
| I4 | chain-e2e-v2.test.ts | registry 업데이트 → TeamDelete → 정리 | 전체 lifecycle |

#### C. 실전 조건 테스트 (기존 479건에 없는 것)

| # | 파일 | 테스트 | 검증 내용 | P# |
|---|------|--------|---------|-----|
| R1 | realworld-v2.test.ts | set_summary 안 했을 때 체인 동작 | summary 빈 상태 → fallback 경로 | P1 |
| R2 | realworld-v2.test.ts | hook 제거 후 idle 상태 동작 | TeammateIdle 없을 때 팀원 idle → 아무 일 안 일어남 | P2 |
| R3 | realworld-v2.test.ts | L0 커밋 후 배포 안내 출력 | deploy-trigger exit 0 + 메시지 포함 | P3 |
| R4 | realworld-v2.test.ts | TeamCreate 후 registry 파일 갱신 | JSON 파일 존재 + 멤버 포함 | P4 |
| R5 | realworld-v2.test.ts | pending 파일 생성 후 알림 경로 | osascript 또는 대체 알림 호출 | P5 |
| R6 | realworld-v2.test.ts | mock broker vs 실제 broker 동작 차이 | 환경변수로 분기, 실 broker 없으면 skip | P6 |
| R7 | realworld-v2.test.ts | state 동기화에 git 명령어 없음 | dashboard-sync에 git 패턴 0건 | P7 |
| R8 | realworld-v2.test.ts | pdca-chain-handoff v4: PM_LEADER 전송 0건 | L2/L3에서 PM_LEADER로 보내는 코드 없음 | 확인 |
| R9 | realworld-v2.test.ts | deploy-trigger: 팀원에서 실행 시 exit 0 (스킵) | IS_TEAMMATE=true → 즉시 종료 | 안전 |
| R10 | realworld-v2.test.ts | 전체 hook 충돌 검사 | V2 hook 20개 동시 로드 → 에러 0건 | 안정 |

### 6.3 실전 테스트 시나리오 (Smith님 검증용)

아래 시나리오를 **실제 세션에서 순서대로 실행**하여 V2 플로우를 검증:

#### 시나리오 1: L0 핫픽스 → 즉시 배포

```
사전조건: CTO 세션 활성, set_summary 완료

1. Smith님: "이 버그 고쳐라" (fix: 커밋 대상)
2. CTO 리더: TeamCreate backend-dev → fix 지시
3. backend-dev: 수정 + 커밋 (fix: xxx)
4. CTO 리더: TeamDelete → TaskCompleted 발동
5. 검증:
   ✅ Gap 분석 스킵됨 (L0)
   ✅ deploy-trigger: "🚀 [L0 핫픽스] 즉시 배포 필요" 출력
   ✅ 리더가 gcloud run deploy 실행
   ✅ chain-handoff: MOZZI에게 ANALYSIS_REPORT 전송
   ✅ COO가 Smith님에게 보고
```

#### 시나리오 2: L2 일반 기능 → Gap → 배포

```
사전조건: PM Plan+Design 완료, CTO 세션 활성

1. CTO 리더: TeamCreate frontend-dev, backend-dev
2. 팀원 개발 + 커밋
3. CTO 리더: TeamDelete → TaskCompleted
4. 검증:
   ✅ task-quality-gate: tsc + build 통과
   ✅ gap-analysis: Match Rate 95%+
   ✅ deploy-trigger: "🚀 [L2] Gap 97% 통과 — 배포 진행" 출력
   ✅ 리더가 배포 실행
   ✅ chain-handoff: MOZZI에게 COMPLETION_REPORT (PM 우회)
   ✅ COO → Smith님 보고
```

#### 시나리오 3: 체인 연결 검증

```
사전조건: CTO + COO 세션 동시 활성

1. CTO 세션: set_summary("CTO_LEADER | bscamp | TASK-xxx")
2. COO 세션: set_summary("MOZZI | bscamp | reporting")
3. CTO: 개발 완료 → TaskCompleted
4. 검증:
   ✅ pdca-chain-handoff: broker에서 MOZZI peer 발견
   ✅ COMPLETION_REPORT 전송 성공
   ✅ COO 세션에 메시지 도착
   ✅ COO가 Smith님 보고서 생성
```

#### 시나리오 4: 체인 fallback (summary 미등록)

```
사전조건: CTO 세션만 활성, set_summary 안 함

1. CTO: 개발 완료 → TaskCompleted
2. 검증:
   ✅ peer summary 매칭 실패
   ✅ peer-roles.json fallback 시도
   ✅ 최종 실패 시: "ACTION_REQUIRED: send_message(MOZZI, ...)" 출력
   ✅ 리더가 수동으로 send_message 실행
```

#### 시나리오 5: 팀원 승인 요청 → 리더 알림

```
1. CTO: TeamCreate backend-dev
2. 검증: ✅ teammate-registry.json 업데이트됨
3. backend-dev: migration 파일 수정 시도
4. 검증:
   ✅ approval-gate: pending 파일 생성
   ✅ notify: macOS 알림 "승인 대기 1건"
   ✅ 리더가 승인 → backend-dev 작업 재개
```

---

## 7. CLAUDE.md 수정안

### 7.1 추가할 섹션: 배포 규칙 (PDCA 프로세스 레벨 시스템 하단)

```markdown
## 배포 규칙 (V2 — 2026-03-30 Smith님 확정)

**모든 배포는 CTO 리더가 실행한다.** 팀원 배포 금지 (validate-deploy-authority.sh).
PM 검수 단계 없음. Gap 통과하면 바로 배포.

| 레벨 | 배포 조건 | 배포 명령 | 배포 후 |
|------|----------|----------|--------|
| **L0** | fix/hotfix 커밋 | `gcloud run deploy` 즉시 | COO 보고 |
| **L1** | src/ 미수정 | 배포 없음 | COO 보고 |
| **L2** | Gap 95%+ | `gcloud run deploy` | COO 보고 |
| **L3** | Gap 95%+ | `gcloud run deploy` | COO 보고 → Smith님 확인 |

### 배포 후 런타임 검증 (RET-004)
배포 성공 ≠ 서비스 정상. 배포 후 반드시:
1. Cloud Run 로그 확인 (에러 0건)
2. 핵심 플로우 1회 실행 (health check)
```

### 7.2 수정할 섹션: PDCA 체인 핸드오프 프로토콜

```markdown
## PDCA 체인 핸드오프 프로토콜 (V2)

**CTO → COO → Smith님. PM 검수 없음.**
- 프로토콜: `bscamp-team/v1` (COMPLETION_REPORT / ANALYSIS_REPORT / ACK)
- chain_step: `cto_to_coo → coo_report → smith_ok`
- Match Rate < 95% → CTO 자체 수정 후 재시도
- Match Rate ≥ 95% → COO 직접 전달 (PM 우회)
- L0/L1 → Match Rate 스킵 → COO 직접
```

### 7.3 수정할 섹션: 세션 시작 필수 읽기

```markdown
## 세션 시작 필수 액션 (예외 없음)

```
1. 이 파일 (CLAUDE.md) — 규칙
2. docs/adr/ADR-002-service-context.md — 서비스 이해
3. docs/adr/ADR-001-account-ownership.md — 설계 원칙
4. docs/postmortem/index.json — 과거 사고 교훈
5. .claude/tasks/ 폴더 — 현재 TASK 확인
6. [V2 추가] set_summary 호출 — 역할 식별자 등록
   CTO: "CTO_LEADER | bscamp | {TASK명}"
   PM:  "PM_LEADER | bscamp | {TASK명}"
   COO: "MOZZI | bscamp | reporting"
7. [V2 추가] bash .claude/hooks/session-resume-check.sh
```
```

### 7.4 제거할 내용

- PDCA 체인 핸드오프에서 `pm_review` 단계 삭제
- `cto_to_pm` chain_step 참조 삭제
- "PM이 개발 후 다시 검토" 관련 문구 삭제

---

## 8. 구현 순서

| 순서 | 작업 | 의존 | 파일 |
|------|------|------|------|
| 1 | pdca-chain-handoff.sh v4 (PM 우회) | 없음 | .claude/hooks/pdca-chain-handoff.sh |
| 2 | deploy-trigger.sh 신규 | 없음 | .claude/hooks/deploy-trigger.sh |
| 3 | registry-update.sh 신규 | 없음 | .claude/hooks/registry-update.sh |
| 4 | settings.local.json V2 적용 | 1,2,3 | .claude/settings.local.json |
| 5 | 불필요 hook 스크립트 삭제 (5개) | 4 | 5개 .sh 파일 |
| 6 | CLAUDE.md 수정 | 1 | CLAUDE.md, CLAUDE-DETAIL.md |
| 7 | TDD 작성 (U1~U10, I1~I4, R1~R10) | 1,2,3 | __tests__/hooks/*.test.ts |
| 8 | 실전 시나리오 검증 | 4,6,7 | 수동 |

---

## 9. 리스크 및 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| PM 검수 제거로 품질 저하 | Gap 95%가 유일한 게이트 | Gap 분석 정확도 모니터링. 1주 후 재평가 |
| peer summary fallback 미동작 | 체인 불발 지속 | peer-roles.json + 수동 보고 3중 안전장치 |
| deploy-trigger가 의도치 않은 배포 유도 | 잘못된 배포 | hook은 안내만 출력 (실행은 리더 판단) |
| hook 제거 후 예상 못한 부작용 | 기존 워크플로우 깨짐 | 제거 대상 5개 모두 기능 중복이므로 원본이 커버 |
| settings.local.json 변경이 현재 세션에 미반영 | V2 규칙 적용 안 됨 | 새 세션 시작 필요 (Claude Code 한계) |

---

*작성: PM Team | 2026-03-30*
*검증 기준: 전체 플로우 끊김 0개, 7개 문제 전부 해결 방안 포함, TDD 실전 환경 포함, L0~L3 배포 규칙 명시*
