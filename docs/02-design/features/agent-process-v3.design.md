# Agent Process V3 — 실전 테스트 기반 최종 수정

> 작성: 2026-03-30 | PM Team | TASK-AGENT-PROCESS-V3.md
> 상태: Design
> 레벨: L2
> 근거: V2 실전 테스트 8건 실패 전부 동일 원인 — peer 식별 실패. 이번이 마지막.

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| Feature | Agent Process V3 (에이전트팀 프로세스 V3) |
| 시작일 | 2026-03-30 |
| V2 대비 | V2 인프라(broker, payload, hook) 정상 확인. 실패 원인은 peer 식별 1건으로 수렴 |
| 문제 | 8건 (근본 원인 2개: peer 식별 실패 + .claude/ 권한 프롬프트) |
| 해결 방향 | PID 역추적 자동 등록 + .bkit/runtime/ 경로 분리 + 대시보드 live 소스 전환 |

### Value Delivered

| 관점 | 내용 |
|------|------|
| Problem | set_summary 안 하면 체인 전멸. .claude/ 쓸 때마다 승인 프롬프트. 대시보드 데이터 없음 |
| Solution | PID 역추적으로 자동 등록 (set_summary 의존 제거). 런타임 경로 .bkit/으로 분리 |
| Function UX Effect | 세션 열기만 하면 첫 hook 실행 시 자동 등록. 체인 자동 발동. 프롬프트 0건 |
| Core Value | 수강생 에러 노출 0 — 개발 완료부터 보고까지 끊김 없는 자동 체인 |

---

## 1. V2 실전 테스트 진단 — 근본 원인 분석

### 1.1 A1 테스트 결과 (2026-03-30 13:22 실측)

```
Broker health:     ✅ OK (peers: 3)
L1 레벨 판정:       ✅ 정상
Payload 구성:       ✅ 정상
MOZZI 피어 매칭:    ❌ summary 빈 피어 2개 → "MOZZI" 매칭 불가
PM_LEADER 자기 매칭: ❌ 실행 세션 summary(CTO_LEADER) ≠ team-context role(PM_LEADER)
peer-roles.json:    ❌ session 값 전부 빈 문자열
MCP 직접 전송:      ✅ 성공 — 전송 경로 자체에는 문제 없음
```

### 1.2 8건 문제 → 근본 원인 2개로 수렴

| 근본 원인 | 영향 범위 | 해결하면 같이 해결되는 문제 |
|----------|----------|------------------------|
| **RC-1: peer 식별 실패** | #1 summary 미등록, #2 peer-roles 비어있음, #3 MY_ID 실패, #5 대시보드 "팀 미생성", #6 통신 로그 "? → ?" | 5건 |
| **RC-2: .claude/ 경로 권한** | #4 .claude/ 승인 프롬프트 | 1건 |
| 독립 문제 | #7 배포 누락, #8 TDD 실전 미포함 | 2건 (별도 해결) |

---

## 2. V3 핵심 설계 — PID 역추적 자동 등록

### 2.1 문제의 본질

V2는 `set_summary`를 CLAUDE.md 규칙으로 강제했지만 실전에서 안 지켜짐.
- hook은 bash만 실행 가능 → MCP tool(set_summary) 호출 불가
- 에이전트가 CLAUDE.md 규칙을 100% 따르지 않음
- peer-roles.json fallback도 빈 값으로 무효

**V3 원칙: 에이전트 행동에 의존하지 않는다. 인프라가 자동으로 해결한다.**

### 2.2 PID 역추적 알고리즘

hook이 실행될 때 자기 PID에서 부모를 거슬러 올라가면 Claude Code 프로세스(= broker 등록 peer)를 찾을 수 있다.

```
프로세스 트리:
  Claude Code (PID=28410, broker peer "dx4c3yjb")
    └─ bash (PID=38520)
        └─ pdca-chain-handoff.sh (PID=38528, $$)
```

```bash
# hook-self-register.sh — 핵심 함수
#
# PID 역추적으로 현재 hook을 실행한 Claude Code의 broker peer ID를 찾아
# peer-map.json에 자동 등록한다.
#
# 의존: broker /list-peers, team-context 파일, jq

_HSR_RUNTIME_DIR="${PROJECT_DIR:-.}/.bkit/runtime"
_HSR_PEER_MAP="$_HSR_RUNTIME_DIR/peer-map.json"
_HSR_BROKER_URL="${BROKER_URL:-http://localhost:7899}"

# PID 역추적으로 broker peer ID 찾기
# 현재 $$ → 부모 → 조부모 ... 최대 10단계 탐색
find_my_peer_id() {
    local PID=$$
    local PEERS
    PEERS=$(curl -sf -X POST "$_HSR_BROKER_URL/list-peers" \
        -H 'Content-Type: application/json' \
        -d "{\"scope\":\"repo\",\"cwd\":\"$PROJECT_DIR\",\"git_root\":\"$PROJECT_DIR\"}" \
        2>/dev/null || echo "[]")

    local I=0
    while [ "$I" -lt 10 ]; do
        local MATCH
        MATCH=$(echo "$PEERS" | jq -r ".[] | select(.pid == $PID) | .id" 2>/dev/null)
        if [ -n "$MATCH" ] && [ "$MATCH" != "null" ]; then
            echo "$MATCH"
            return 0
        fi
        PID=$(ps -o ppid= -p "$PID" 2>/dev/null | tr -d ' ')
        [ -z "$PID" ] || [ "$PID" = "1" ] || [ "$PID" = "0" ] && break
        I=$((I + 1))
    done
    return 1
}

# 현재 세션 역할을 team-context에서 추출
get_my_role() {
    local CTX_FILE
    # team-context-resolver 사용 (있으면)
    if [ -f "$PROJECT_DIR/.claude/hooks/helpers/team-context-resolver.sh" ]; then
        source "$PROJECT_DIR/.claude/hooks/helpers/team-context-resolver.sh"
        resolve_team_context 2>/dev/null
        CTX_FILE="${TEAM_CONTEXT_FILE:-}"
    fi
    [ -z "$CTX_FILE" ] && CTX_FILE="$_HSR_RUNTIME_DIR/team-context.json"
    [ ! -f "$CTX_FILE" ] && { echo ""; return 1; }

    local TEAM
    TEAM=$(jq -r '.team // empty' "$CTX_FILE" 2>/dev/null)
    case "$TEAM" in
        CTO*) echo "CTO_LEADER" ;;
        PM*)  echo "PM_LEADER" ;;
        COO*|hermes*) echo "MOZZI" ;;
        *)    [ -n "$TEAM" ] && echo "${TEAM}_LEADER" || echo "" ;;
    esac
}

# peer-map.json에 자동 등록 (멱등)
auto_register_peer() {
    local PEER_ID
    PEER_ID=$(find_my_peer_id) || return 1

    local ROLE
    ROLE=$(get_my_role)
    [ -z "$ROLE" ] && return 1

    mkdir -p "$_HSR_RUNTIME_DIR" 2>/dev/null

    local NOW
    NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local CURRENT_PID=$$
    local CC_PID
    CC_PID=$(ps -o ppid= -p $$ 2>/dev/null | tr -d ' ')

    # peer-map.json이 없으면 생성
    if [ ! -f "$_HSR_PEER_MAP" ]; then
        echo "{}" > "$_HSR_PEER_MAP"
    fi

    # 같은 역할이 이미 같은 peerId로 등록돼 있으면 스킵 (멱등)
    local EXISTING
    EXISTING=$(jq -r ".\"$ROLE\".peerId // empty" "$_HSR_PEER_MAP" 2>/dev/null)
    [ "$EXISTING" = "$PEER_ID" ] && return 0

    # 등록/업데이트
    jq --arg role "$ROLE" \
       --arg peerId "$PEER_ID" \
       --arg ts "$NOW" \
       --argjson ccPid "$CC_PID" \
       '.[$role] = {peerId: $peerId, ccPid: $ccPid, registeredAt: $ts}' \
       "$_HSR_PEER_MAP" > "${_HSR_PEER_MAP}.tmp" && \
    mv "${_HSR_PEER_MAP}.tmp" "$_HSR_PEER_MAP"

    return 0
}
```

### 2.3 동작 플로우

```
세션 시작
  │
  ├─ [기존] set_summary (CLAUDE.md 규칙 — 있으면 좋고 없어도 됨)
  │
  ├─ 첫 번째 hook 실행 (어떤 hook이든)
  │   └─ source hook-self-register.sh
  │   └─ auto_register_peer()
  │       ├─ find_my_peer_id(): $$ → 부모 PID 역추적 → broker peer 매칭
  │       ├─ get_my_role(): team-context에서 CTO/PM/MOZZI 추출
  │       └─ peer-map.json에 {ROLE: {peerId, ccPid, registeredAt}} 기록
  │
  ├─ 이후 모든 hook: peer-map.json에서 즉시 조회 (PID 역추적 스킵)
  │
  └─ chain-handoff 시:
      ├─ MY_ID:     peer-map.json[MY_ROLE].peerId  ← 확실
      ├─ TARGET_ID: peer-map.json[TARGET_ROLE].peerId  ← 대상도 hook 실행 시 등록됨
      └─ fallback: PID 역추적 재시도 → summary 매칭 → 수동 보고
```

### 2.4 V2 대비 개선

| 항목 | V2 | V3 |
|------|-----|-----|
| 자기 식별 (MY_ID) | summary 매칭 (실패율 100%) | PID 역추적 (실패율 ~0%) |
| 대상 식별 (TARGET_ID) | summary 매칭 (실패율 100%) | peer-map.json 조회 (대상 hook 실행 필수) |
| set_summary 의존 | 필수 (CLAUDE.md 규칙) | 선택 (있으면 추가 안전장치) |
| 등록 타이밍 | 세션 시작 시 에이전트가 수동 호출 | 첫 hook 실행 시 자동 (인프라 보장) |
| fallback | peer-roles.json (빈 값) | PID 역추적 → tmux 매칭 → summary → 수동 |

---

## 3. .claude/runtime/ → .bkit/runtime/ 경로 분리

### 3.1 문제

`--dangerously-skip-permissions`에서도 `.claude/` 경로 쓰기 시 승인 프롬프트 발생.
Claude Code가 `.claude/` 패턴을 보호 경로로 하드코딩하고 있음.

### 3.2 해결: 런타임 파일을 .bkit/runtime/으로 이동

`.bkit/`는 Claude Code 보호 경로가 아님 → 쓰기 시 프롬프트 0건.

#### 이동 대상

| 파일/디렉토리 | 기존 경로 | 신규 경로 |
|-------------|----------|----------|
| team-context-*.json | .claude/runtime/ | .bkit/runtime/ |
| peer-map.json (신규) | — | .bkit/runtime/ |
| peer-roles.json | .claude/runtime/ | .bkit/runtime/ |
| teammate-registry.json | .claude/runtime/ | .bkit/runtime/ |
| approvals/ | .claude/runtime/approvals/ | .bkit/runtime/approvals/ |
| hook-logs/ | .claude/runtime/hook-logs/ | .bkit/runtime/hook-logs/ |
| heartbeat.log | .claude/runtime/ | .bkit/runtime/ |
| SESSION-STATE.md | .claude/runtime/ | .bkit/runtime/ |
| last-completion-report.json | .claude/runtime/ | .bkit/runtime/ |
| chain-sent.log | .claude/runtime/ | .bkit/runtime/ |

#### 이동하지 않는 것

| 파일 | 이유 |
|------|------|
| .claude/hooks/*.sh | hook 스크립트는 읽기만 함 (쓰기 없음) |
| .claude/settings.local.json | Claude Code 설정 파일, 이 위치 고정 |
| .claude/tasks/*.md | Smith님이 수동 작성, 빈도 낮음 |

### 3.3 마이그레이션 전략

**원칙**: 기존 경로에 파일이 있으면 새 경로로 복사 후 원본 유지 (안전).

```bash
# migrate-runtime.sh — 런타임 경로 마이그레이션 (멱등)
# 모든 hook의 최상단에서 source
PROJECT_DIR="/Users/smith/projects/bscamp"
OLD_RUNTIME="$PROJECT_DIR/.claude/runtime"
NEW_RUNTIME="$PROJECT_DIR/.bkit/runtime"

if [ -d "$OLD_RUNTIME" ] && [ ! -f "$NEW_RUNTIME/.migrated" ]; then
    mkdir -p "$NEW_RUNTIME/approvals/pending" "$NEW_RUNTIME/hook-logs" 2>/dev/null

    # 파일 복사 (기존 유지)
    for F in team-context*.json peer-roles.json teammate-registry.json \
             heartbeat.log SESSION-STATE.md last-completion-report.json \
             chain-sent.log; do
        [ -f "$OLD_RUNTIME/$F" ] && cp "$OLD_RUNTIME/$F" "$NEW_RUNTIME/$F" 2>/dev/null
    done

    # approvals 복사
    cp "$OLD_RUNTIME/approvals/pending/"*.json "$NEW_RUNTIME/approvals/pending/" 2>/dev/null

    date -u +"%Y-%m-%dT%H:%M:%SZ" > "$NEW_RUNTIME/.migrated"
fi
```

### 3.4 hook 경로 변수 변경

모든 hook 스크립트에서 아래 패턴을 일괄 변경:

```bash
# 변경 전
RUNTIME_DIR="$PROJECT_DIR/.claude/runtime"

# 변경 후
RUNTIME_DIR="$PROJECT_DIR/.bkit/runtime"
```

영향 받는 파일 (grep 결과 기준):
- pdca-chain-handoff.sh
- deploy-trigger.sh
- helpers/peer-resolver.sh
- helpers/team-context-resolver.sh
- helpers/chain-messenger.sh
- helpers/approval-handler.sh
- registry-update.sh
- dashboard-sync.sh
- task-quality-gate.sh
- notify-completion.sh
- session-resume-check.sh

---

## 4. peer-resolver.sh V3 개선

### 4.1 현재 문제

peer-resolver.sh Strategy 2 (tmux PID 매칭)는 `[ -n "${TMUX:-}" ]` 체크가 있어서
TMUX 환경변수가 없으면 바로 스킵 → Strategy 3 (summary 매칭)으로 넘어감 → 실패.

### 4.2 V3: PID 역추적을 Strategy 1로 승격

```bash
# peer-resolver.sh V3 — 4단계 전략
#
# 1. peer-map.json (자동 등록 결과)          ← 신규 (가장 빠르고 확실)
# 2. PID 역추적 → broker peer 매칭           ← 기존 Strategy 2 개선
# 3. tmux 세션명 → PID 트리 → broker peer    ← 기존 유지 (TMUX 있을 때만)
# 4. broker summary 텍스트 매칭              ← 레거시 fallback

resolve_peer() {
    local ROLE="$1"
    RESOLVED_PEER_ID=""

    # Strategy 1: peer-map.json (자동 등록 결과)
    local MAP_FILE="$_PR_RUNTIME_DIR/peer-map.json"
    if [ -f "$MAP_FILE" ]; then
        local MAPPED_ID=$(jq -r ".\"$ROLE\".peerId // empty" "$MAP_FILE" 2>/dev/null)
        if [ -n "$MAPPED_ID" ]; then
            # broker에 아직 살아있는지 확인
            local PEERS=$(_fetch_peers)
            if echo "$PEERS" | jq -e ".[] | select(.id == \"$MAPPED_ID\")" >/dev/null 2>&1; then
                RESOLVED_PEER_ID="$MAPPED_ID"
                return 0
            fi
            # 등록은 있는데 broker에 없음 → stale entry 삭제
            jq "del(.\"$ROLE\")" "$MAP_FILE" > "${MAP_FILE}.tmp" && \
            mv "${MAP_FILE}.tmp" "$MAP_FILE" 2>/dev/null
        fi
    fi

    # Strategy 2: PID 역추적 (TMUX 불필요)
    # target의 PID를 알 수 없으므로 self에만 적용
    # target은 Strategy 3, 4로 fallback

    # Strategy 3: tmux 세션명 → PID 트리 → broker peer
    local PATTERN=$(_role_to_session_pattern "$ROLE")
    if [ -n "$PATTERN" ] && command -v tmux >/dev/null 2>&1; then
        # TMUX 환경변수 체크 제거 — tmux server가 있으면 시도
        local PEERS=$(_fetch_peers)
        local PANE_PIDS=$(tmux list-panes -a -F '#{session_name} #{pane_pid}' 2>/dev/null | \
            grep "^${PATTERN}" | awk '{print $2}')

        for PANE_P in $PANE_PIDS; do
            for CPID in $(pgrep -P "$PANE_P" 2>/dev/null); do
                local MATCH=$(echo "$PEERS" | jq -r "[.[] | select(.pid == $CPID)][0].id // empty" 2>/dev/null)
                [ -n "$MATCH" ] && { RESOLVED_PEER_ID="$MATCH"; return 0; }
                for GCPID in $(pgrep -P "$CPID" 2>/dev/null); do
                    MATCH=$(echo "$PEERS" | jq -r "[.[] | select(.pid == $GCPID)][0].id // empty" 2>/dev/null)
                    [ -n "$MATCH" ] && { RESOLVED_PEER_ID="$MATCH"; return 0; }
                done
            done
        done
    fi

    # Strategy 4: summary 텍스트 매칭 (레거시)
    local PEERS=$(_fetch_peers)
    RESOLVED_PEER_ID=$(echo "$PEERS" | jq -r "[.[] | select(.summary | test(\"$ROLE\"))][0].id // empty" 2>/dev/null)
    [ -n "$RESOLVED_PEER_ID" ] && return 0

    return 1
}

resolve_self() {
    RESOLVED_SELF_ID=""

    # Strategy 1: peer-map.json
    local ROLE=$(get_my_role 2>/dev/null)
    if [ -n "$ROLE" ]; then
        local MAP_FILE="$_PR_RUNTIME_DIR/peer-map.json"
        if [ -f "$MAP_FILE" ]; then
            local MAPPED_ID=$(jq -r ".\"$ROLE\".peerId // empty" "$MAP_FILE" 2>/dev/null)
            if [ -n "$MAPPED_ID" ]; then
                RESOLVED_SELF_ID="$MAPPED_ID"
                return 0
            fi
        fi
    fi

    # Strategy 2: PID 역추적 (핵심 개선)
    RESOLVED_SELF_ID=$(find_my_peer_id 2>/dev/null)
    [ -n "$RESOLVED_SELF_ID" ] && return 0

    # Strategy 3: tmux PID 매칭 (기존)
    # ... (기존 코드 유지)

    # Strategy 4: summary 매칭 (기존)
    # ... (기존 코드 유지)

    return 1
}
```

### 4.3 핵심 변경: `${TMUX:-}` 체크 제거

V2 Strategy 2 실패 원인: `[ -n "${TMUX:-}" ]` 조건.
hook은 Claude Code가 spawn한 bash 프로세스 → TMUX 환경변수 상속 안 됨.

V3: `command -v tmux >/dev/null 2>&1` 만 확인 (tmux 바이너리 존재만 확인).
tmux server가 돌고 있으면 `tmux list-panes -a`로 모든 세션 탐색 가능.

---

## 5. 대시보드 live 소스 전환

### 5.1 문제

대시보드가 `teammate-registry.json`에서 팀 상태를 읽는데:
- TeamCreate hook이 제대로 업데이트 안 함
- 결과: "팀 미생성" 표시

### 5.2 해결: broker + peer-map 병합 소스

```bash
# dashboard-state-builder.sh — 대시보드 state.json 생성
# 소스 3개를 병합하여 실시간 팀 상태 구성

PROJECT_DIR="/Users/smith/projects/bscamp"
RUNTIME_DIR="$PROJECT_DIR/.bkit/runtime"
BROKER_URL="${BROKER_URL:-http://localhost:7899}"
STATE_FILE="$RUNTIME_DIR/state.json"

# 1. broker peers (실시간)
PEERS=$(curl -sf -X POST "$BROKER_URL/list-peers" \
    -H 'Content-Type: application/json' \
    -d "{\"scope\":\"repo\",\"cwd\":\"$PROJECT_DIR\",\"git_root\":\"$PROJECT_DIR\"}" \
    2>/dev/null || echo "[]")
PEER_COUNT=$(echo "$PEERS" | jq 'length' 2>/dev/null || echo 0)

# 2. peer-map.json (역할 매핑)
PEER_MAP="$RUNTIME_DIR/peer-map.json"
ROLES_ONLINE="[]"
if [ -f "$PEER_MAP" ]; then
    ROLES_ONLINE=$(jq '[to_entries[] | {role: .key, peerId: .value.peerId, since: .value.registeredAt}]' "$PEER_MAP" 2>/dev/null || echo "[]")
fi

# 3. team-context (팀 구성)
TEAM_CONTEXTS=$(ls "$RUNTIME_DIR"/team-context-*.json 2>/dev/null)
TEAMS="[]"
for CTX in $TEAM_CONTEXTS; do
    TEAM_NAME=$(jq -r '.team // empty' "$CTX" 2>/dev/null)
    FEATURE=$(jq -r '.feature // empty' "$CTX" 2>/dev/null)
    [ -n "$TEAM_NAME" ] && TEAMS=$(echo "$TEAMS" | jq --arg t "$TEAM_NAME" --arg f "$FEATURE" '. + [{team: $t, feature: $f}]')
done

# state.json 생성
jq -n \
    --argjson peers "$PEER_COUNT" \
    --argjson roles "$ROLES_ONLINE" \
    --argjson teams "$TEAMS" \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
        peerCount: $peers,
        rolesOnline: $roles,
        activeTeams: $teams,
        updatedAt: $ts
    }' > "$STATE_FILE"
```

### 5.3 통신 로그 해석 (#6 해결)

peer-map.json에 역할 매핑이 있으므로:
- 기존: `"mk84ehqi → u7idic8b"` → 표시: `"? → ? 거절"`
- V3: peer-map.json에서 `mk84ehqi = CTO_LEADER`, `u7idic8b = MOZZI` 변환
- 표시: `"CTO_LEADER → MOZZI 전송"`

---

## 6. 배포 누락 방지 (#7)

### 6.1 현재 문제

deploy-trigger.sh가 안내 메시지만 출력. 리더가 무시하면 배포 안 됨.

### 6.2 해결: push → deploy 동기화 체크

chain-handoff 직전에 실행. 커밋이 push됐지만 배포 안 됐으면 경고.

```bash
# deploy-verify.sh — push 후 배포 여부 확인 (chain-handoff 직전)
# TaskCompleted 체인 5.5번 (deploy-trigger 후, chain-handoff 전)

source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"

# L1 (src/ 미수정) → 스킵
HAS_SRC=$(git diff HEAD~1 --name-only 2>/dev/null | grep -c "^src/" || true)
[ "$HAS_SRC" -eq 0 ] && exit 0

# 최근 push 확인
LOCAL_HEAD=$(git rev-parse HEAD 2>/dev/null)
REMOTE_HEAD=$(git rev-parse origin/main 2>/dev/null)

if [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ]; then
    # push 됨 → 배포 여부는 deploy-trigger.sh가 안내했으므로 여기선 경고만
    DEPLOY_MARKER="$PROJECT_DIR/.bkit/runtime/last-deploy-commit"
    if [ -f "$DEPLOY_MARKER" ]; then
        LAST_DEPLOY=$(cat "$DEPLOY_MARKER")
        if [ "$LAST_DEPLOY" != "$LOCAL_HEAD" ]; then
            echo ""
            echo "⚠ 경고: push 완료(${LOCAL_HEAD:0:7})했지만 배포 미실행"
            echo "  마지막 배포 커밋: ${LAST_DEPLOY:0:7}"
            echo "  실행: gcloud run deploy bscamp-web --source . --region asia-northeast3"
            echo ""
        fi
    fi
fi

exit 0
```

### 6.3 배포 완료 마커

리더가 `gcloud run deploy` 실행 후 자동으로 마커 생성:

```bash
# deploy-post.sh — 배포 성공 후 마커 기록
# PreToolUse/Bash에서 gcloud run deploy 성공 감지 시 실행

DEPLOY_MARKER="$PROJECT_DIR/.bkit/runtime/last-deploy-commit"
git rev-parse HEAD > "$DEPLOY_MARKER" 2>/dev/null
echo "✅ 배포 마커 기록: $(cat "$DEPLOY_MARKER")"
```

---

## 7. TDD 실전 테스트 (#8)

### 7.1 문제

V2 TDD 497건 전부 mock → 실전에서 summary 비어있는 상황을 못 잡음.

### 7.2 V3 추가 테스트 케이스

#### A. PID 역추적 테스트

| # | 테스트 | 검증 |
|---|--------|------|
| P1 | find_my_peer_id — 현재 프로세스에서 broker peer 찾기 | PID 역추적 → 유효한 peer ID 반환 |
| P2 | find_my_peer_id — broker 미기동 시 | return 1, 에러 없음 |
| P3 | find_my_peer_id — PID 트리에 broker peer 없을 때 | return 1, 10단계 후 종료 |
| P4 | auto_register_peer — 첫 실행 시 peer-map.json 생성 | 파일 생성 + 역할 매핑 정확 |
| P5 | auto_register_peer — 멱등성 (중복 실행) | 같은 peerId면 스킵 |
| P6 | auto_register_peer — 다른 역할 추가 | 기존 항목 유지 + 새 항목 추가 |

#### B. 경로 분리 테스트

| # | 테스트 | 검증 |
|---|--------|------|
| M1 | migrate-runtime.sh — 기존 파일 복사 | .bkit/runtime/에 모든 파일 존재 |
| M2 | migrate-runtime.sh — 멱등성 | .migrated 존재 시 스킵 |
| M3 | 모든 hook에서 RUNTIME_DIR이 .bkit/runtime/ | grep 결과 .claude/runtime 참조 0건 |

#### C. 실전 환경 통합 테스트

| # | 테스트 | 검증 | 기존 TDD에 없던 이유 |
|---|--------|------|-------------------|
| E1 | summary 빈 상태에서 chain-handoff | PID 역추적 경로로 전송 성공 | mock이 summary 항상 채움 |
| E2 | peer-map.json에 MOZZI 등록 후 chain | peer-map.json에서 즉시 조회 → 전송 성공 | peer-map.json이 V2에 없었음 |
| E3 | peer-map.json stale entry (broker에 없는 ID) | stale 삭제 → fallback 경로 | 항상 유효한 mock ID 사용 |
| E4 | .bkit/runtime/ 경로에서 hook 동작 | 모든 파일 읽기/쓰기 정상 | .claude/ 경로만 테스트 |
| E5 | deploy-trigger 후 deploy-verify 경고 | push O, 배포 X → 경고 출력 | deploy-verify가 V2에 없었음 |

---

## 8. hook 변경 매트릭스 (V2 → V3)

### 8.1 수정 대상

| 파일 | 변경 내용 | 사유 |
|------|----------|------|
| helpers/peer-resolver.sh | Strategy 1에 peer-map.json 추가, TMUX 체크 제거 | RC-1 해결 |
| helpers/team-context-resolver.sh | RUNTIME_DIR 경로 .bkit/runtime/ | RC-2 해결 |
| helpers/chain-messenger.sh | RUNTIME_DIR 경로 변경 | RC-2 해결 |
| pdca-chain-handoff.sh | source hook-self-register.sh 추가, 경로 변경 | RC-1 + RC-2 |
| deploy-trigger.sh | 경로 변경 | RC-2 |
| registry-update.sh | 경로 변경 | RC-2 |
| dashboard-sync.sh | state 소스를 broker+peer-map으로 전환 | #5 해결 |
| notify-completion.sh | 경로 변경 | RC-2 |
| task-quality-gate.sh | 경로 변경 | RC-2 |
| session-resume-check.sh | 경로 변경 | RC-2 |

### 8.2 신규 파일

| 파일 | 역할 |
|------|------|
| helpers/hook-self-register.sh | PID 역추적 + peer-map.json 자동 등록 |
| helpers/migrate-runtime.sh | .claude/runtime/ → .bkit/runtime/ 마이그레이션 |
| deploy-verify.sh | push 후 배포 여부 경고 |

### 8.3 삭제 대상

없음. V2에서 이미 정리 완료. V3는 기존 파일 수정 + 신규 3개만.

### 8.4 hook 등록 변경 (settings.local.json)

V2 설정 기반, 변경점만:

```jsonc
{
  "hooks": {
    "TaskCompleted": [
      {
        "hooks": [
          // 기존 6개 유지
          { "type": "command", "command": "bash .claude/hooks/task-completed.sh" },
          { "type": "command", "command": "bash .claude/hooks/task-quality-gate.sh" },
          { "type": "command", "command": "bash .claude/hooks/gap-analysis.sh" },
          { "type": "command", "command": "bash .claude/hooks/pdca-update.sh" },
          { "type": "command", "command": "bash .claude/hooks/deploy-trigger.sh" },
          // 신규: deploy-verify (push했지만 배포 안 됐으면 경고)
          { "type": "command", "command": "bash .claude/hooks/deploy-verify.sh", "timeout": 5000 },
          // 기존: chain-handoff (마지막)
          { "type": "command", "command": "bash .claude/hooks/pdca-chain-handoff.sh" }
        ]
      }
    ]
    // PreToolUse, PostToolUse: V2와 동일 (변경 없음)
  }
}
```

---

## 9. CLAUDE.md 수정안

### 9.1 세션 시작 규칙 — set_summary 유지하되 "필수" → "권장"으로 격하

```markdown
## 세션 시작 필수 읽기 + 액션 (예외 없음)

1. 이 파일 (CLAUDE.md) — 규칙
2. docs/adr/ADR-002-service-context.md — 서비스 이해
3. docs/adr/ADR-001-account-ownership.md — 설계 원칙
4. docs/postmortem/index.json — 과거 사고 교훈
5. .claude/tasks/ 폴더 — 현재 TASK 확인
6. [V3] set_summary 호출 (권장, 미호출 시 hook이 자동 등록):
   CTO: "CTO_LEADER | bscamp | {TASK명}"
   PM:  "PM_LEADER | bscamp | {TASK명}"
   COO: "MOZZI | bscamp | reporting"
7. [V2] bash .claude/hooks/session-resume-check.sh
```

**V2 → V3 차이**: `set_summary`가 "필수" → "권장". hook-self-register가 자동 보완.

### 9.2 배포 규칙 — V2 유지 (변경 없음)

V2에서 이미 확정. 추가 변경 불필요.

### 9.3 런타임 경로 — 신규 섹션

```markdown
## 런타임 경로 (V3)

에이전트 런타임 파일은 `.bkit/runtime/`에 저장한다 (.claude/runtime/ 아님).
hook이 자동 마이그레이션하므로 수동 작업 불필요.
- team-context: `.bkit/runtime/team-context-{session}.json`
- peer-map: `.bkit/runtime/peer-map.json` (hook 자동 등록)
- 로그: `.bkit/runtime/hook-logs/`
```

---

## 10. 구현 순서

| 순서 | 작업 | 의존 | 파일 | 영향 |
|------|------|------|------|------|
| 1 | helpers/hook-self-register.sh 신규 | 없음 | 1개 신규 | 핵심 |
| 2 | helpers/migrate-runtime.sh 신규 | 없음 | 1개 신규 | 경로 마이그레이션 |
| 3 | peer-resolver.sh V3 수정 | 1 | 1개 수정 | Strategy 추가 |
| 4 | 전 hook RUNTIME_DIR 경로 변경 | 2 | ~10개 수정 | .bkit/runtime/ |
| 5 | pdca-chain-handoff.sh에 auto_register 추가 | 1, 4 | 1개 수정 | 체인 자동 등록 |
| 6 | deploy-verify.sh 신규 | 4 | 1개 신규 | 배포 경고 |
| 7 | dashboard-sync.sh 소스 전환 | 1, 4 | 1개 수정 | 대시보드 live |
| 8 | settings.local.json 업데이트 | 6 | 1개 수정 | hook 등록 |
| 9 | CLAUDE.md 수정 | 전체 | 1개 수정 | 규칙 업데이트 |
| 10 | TDD 작성 (P1~P6, M1~M3, E1~E5) | 1~7 | ~3개 신규 | 검증 |
| 11 | 실전 테스트 | 전체 | 수동 | 최종 검증 |

**예상 변경**: 신규 3개 + 수정 ~13개 = ~16개 파일

---

## 11. 실전 테스트 시나리오 (V3 전용)

### 시나리오 1: PID 역추적 체인 (핵심 검증)

```
사전조건: CTO + COO 세션 활성. set_summary 미호출 상태.

1. CTO 세션에서 아무 hook 발동 (예: TeamCreate)
   → hook-self-register가 PID 역추적 → peer-map.json에 CTO_LEADER 등록
2. COO 세션에서 아무 hook 발동
   → peer-map.json에 MOZZI 등록
3. CTO 개발 완료 → TaskCompleted → chain-handoff
   → peer-map.json에서 MY_ID(CTO_LEADER), TARGET_ID(MOZZI) 즉시 조회
   → 전송 성공

검증:
  ✅ set_summary 안 해도 체인 발동
  ✅ peer-map.json에 2개 역할 등록
  ✅ COMPLETION_REPORT 전송 성공
  ✅ COO 세션에 메시지 도착
```

### 시나리오 2: .claude/ 프롬프트 0건 검증

```
1. CTO 세션에서 팀원 생성 → 개발 → 완료
2. 전 과정에서 .claude/ 쓰기 프롬프트 발생 횟수 측정

검증:
  ✅ .bkit/runtime/ 쓰기: 프롬프트 0건
  ✅ .claude/hooks/ 읽기: 프롬프트 0건
```

### 시나리오 3: 배포 누락 경고

```
1. CTO 개발 완료 → git push
2. 배포 안 함 (gcloud run deploy 스킵)
3. chain-handoff 전 deploy-verify 실행

검증:
  ✅ "push 완료했지만 배포 미실행" 경고 출력
  ✅ 배포 명령어 안내 포함
```

### 시나리오 4: 대시보드 live 상태

```
1. CTO + PM 세션 활성
2. dashboard-sync 실행
3. state.json 확인

검증:
  ✅ peerCount: 2+
  ✅ rolesOnline: CTO_LEADER, PM_LEADER 표시
  ✅ activeTeams: 활성 팀 표시
```

---

## 12. 리스크 및 대응

| 리스크 | 확률 | 영향 | 대응 |
|--------|------|------|------|
| PID 역추적이 Claude Code PID를 못 찾음 | 낮음 | 체인 실패 | 10단계 탐색 + 4단계 fallback |
| .bkit/runtime/ 마이그레이션 중 파일 손실 | 낮음 | 상태 유실 | 원본 .claude/runtime/ 삭제 안 함 (복사만) |
| peer-map.json 경쟁 쓰기 (동시 hook) | 중간 | JSON 깨짐 | jq atomic write (tmp → mv) |
| hook 실행 순서 비결정적 | 낮음 | 등록 전 조회 | chain-handoff에서 auto_register 직접 호출 |
| broker 미기동 시 PID 역추적 불가 | — | 전체 실패 | broker 미기동 = set_summary도 무용 → 기존과 동일 |

---

## 13. V2 → V3 차이 요약

| 항목 | V2 | V3 |
|------|-----|-----|
| peer 식별 | set_summary 의존 (CLAUDE.md 규칙) | PID 역추적 자동 등록 (인프라 보장) |
| 런타임 경로 | .claude/runtime/ (프롬프트 발생) | .bkit/runtime/ (프롬프트 0) |
| peer-map.json | 없음 (peer-roles.json 빈 값) | hook 자동 생성 (PID + role 매핑) |
| 대시보드 소스 | teammate-registry.json (stale) | broker + peer-map + team-context (live) |
| 배포 확인 | deploy-trigger.sh (안내만) | + deploy-verify.sh (경고) |
| TDD | 497건 전부 mock | + 14건 실전 조건 (PID, 경로, summary 비어있는 상태) |
| TMUX 의존 | peer-resolver TMUX 환경변수 필수 | TMUX 환경변수 불필요 (tmux 바이너리만 확인) |
| set_summary | 필수 | 권장 (없어도 hook이 자동 보완) |
| 파일 변경 | 25파일 (+697/-1497줄) | ~16파일 (정밀 수정) |

---

*작성: PM Team | 2026-03-30*
*검증 기준: 8건 전부 해결, set_summary 없이 체인 동작, .claude/ 프롬프트 0건, 대시보드 live 데이터, 배포 경고, TDD 실전 포함*
