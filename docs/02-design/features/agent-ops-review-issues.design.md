# Agent Ops Review Issues 설계서

> 작성일: 2026-03-29
> 프로세스 레벨: L2
> Plan: `docs/01-plan/features/agent-ops-review-issues.plan.md`
> Match Rate 기준: **90%**

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | Agent Ops Review Issues 3건 구현 |
| **작성일** | 2026-03-29 |
| **범위** | pdca-chain-handoff.sh v2 (curl 직접 전송 + 위험도 게이트) + session-resume-check.sh (신규) |
| **산출물** | 스크립트 2개 + TDD 35건 + fixtures 5개 |

| 관점 | 내용 |
|------|------|
| **Problem** | Hook→MCP 수동 fallback, 위험도 무관 일괄 처리, 세션 복구 수동 |
| **Solution** | curl로 broker 직접 전송 + L0~L3 게이트 분기 + SessionStart 자동 감지 |
| **Core Value** | Smith님 TASK→배포 파이프라인에서 수동 개입 지점 2개 제거 |

---

## 0. 아키텍처 변경 요약

```
[BEFORE]
TaskCompleted → pdca-chain-handoff.sh
  → Match Rate 95%+ → stdout "ACTION_REQUIRED"
  → 리더가 수동으로 send_message MCP 호출    ← 병목

[AFTER]
TaskCompleted → pdca-chain-handoff.sh v2
  → Match Rate 95%+ → detect_level
  → L0/L1: curl → broker /send-message → COO 직접 (PM 스킵)
  → L2:    curl → broker /send-message → PM (30분 타임아웃)
  → L2 고위험 / L3: curl → broker /send-message → PM (수동 필수)
  → broker 다운: 기존 ACTION_REQUIRED fallback 유지

[NEW]
SessionStart → session-resume-check.sh
  → pdca-status.json 미완료 피처 감지
  → teammate-registry.json 좀비 팀원 감지
  → 정보 제공 (차단 안 함)
```

---

## 1. 데이터 모델

### 1-1. Broker HTTP API (기존 — 변경 없음)

```
POST /list-peers   → { scope, cwd, git_root } → [{ id, pid, summary, ... }]
POST /send-message → { from_id, to_id, text }  → { ok: boolean }
GET  /health       → { peers: number }
```

### 1-2. COMPLETION_REPORT payload v2 (필드 추가)

```typescript
interface CompletionReportV2 {
  protocol: 'bscamp-team/v1';
  type: 'COMPLETION_REPORT';
  from_role: 'CTO_LEADER';
  to_role: 'PM_LEADER' | 'MOZZI';  // L0/L1은 MOZZI 직접
  payload: {
    task_file: string;
    match_rate: number;
    analysis_file: string;
    commit_hash: string;
    changed_files: number;
    summary: string;
    chain_step: 'cto_to_pm' | 'cto_to_coo';  // NEW: COO 직접 전송 경로
    process_level: 'L0' | 'L1' | 'L2' | 'L3';  // NEW
    risk_flags: string[];  // NEW: ['auth', 'migration'] 등
    auto_approve_after_minutes?: number;  // NEW: L2 일반만 30
    requires_manual_review?: boolean;  // NEW: L2 고위험 + L3
  };
  ts: string;
  msg_id: string;
}
```

### 1-3. 위험도 분기 테이블

| 레벨 | 고위험 패턴 | to_role | auto_approve | manual_review | 비고 |
|------|-----------|---------|:------------:|:-------------:|------|
| L0 | - | MOZZI | - | false | PM 스킵, COO 직접 |
| L1 | - | MOZZI | - | false | PM 스킵, COO 직접 |
| L2 | 없음 | PM_LEADER | 30분 | false | 타임아웃 자동 승인 |
| L2 | 있음 | PM_LEADER | - | true | PM 수동 필수 |
| L3 | - | PM_LEADER | - | true | PM + Smith님 승인 |

### 1-4. 고위험 패턴 (L2에서 수동 승인 트리거)

```bash
HIGH_RISK_PATTERN="(auth|middleware\.ts|migration|\.sql|payment|\.env|firebase|supabase)"
```

git diff에서 변경 파일 목록을 이 패턴으로 매칭. 1건 이상 매칭 → `requires_manual_review: true`.

---

## 2. 구현 코드

### 2-1. pdca-chain-handoff.sh v2 (전체)

```bash
#!/bin/bash
# pdca-chain-handoff.sh v2 — Match Rate 게이트 + 위험도 분기 + curl 직접 전송
# TaskCompleted hook 체인의 마지막 (8번째)
set -uo pipefail

# ── 1. 팀원 bypass ──
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"
cd "$PROJECT_DIR" || exit 0

# ── 2. CTO 팀만 대상 ──
CONTEXT_FILE="$PROJECT_DIR/.claude/runtime/team-context.json"
if [ ! -f "$CONTEXT_FILE" ]; then
    exit 0
fi
TEAM=$(jq -r '.team // empty' "$CONTEXT_FILE" 2>/dev/null)
# CTO, CTO-1, CTO-2 등 CTO 접두사 매칭
[[ "$TEAM" != CTO* ]] && exit 0

# ── 3. Match Rate 파싱 ──
source "$(dirname "$0")/helpers/match-rate-parser.sh"
RATE=$(parse_match_rate "$PROJECT_DIR/docs/03-analysis")
if [ -z "$RATE" ] || [ "$RATE" -lt 0 ] 2>/dev/null; then
    RATE=0
fi

# ── 4. 95% 미만 → 차단 ──
THRESHOLD=95
if [ "$RATE" -lt "$THRESHOLD" ]; then
    echo "PDCA 체인 차단: Match Rate ${RATE}% (기준: ${THRESHOLD}%+)"
    echo "Gap 분석 문서의 Match Rate를 ${THRESHOLD}% 이상으로 달성한 후 재시도하세요."
    exit 2
fi

# ── 5. 위험도 판단 (detect-process-level.sh) ──
source "$(dirname "$0")/detect-process-level.sh"
# staged 파일 기반 레벨 판단
CHANGED_FILES=$(git diff HEAD~1 --name-only 2>/dev/null || echo "")
HAS_SRC=$(echo "$CHANGED_FILES" | grep -c "^src/" || true)

# L3 패턴 매칭
HIGH_RISK_PATTERN="(auth|middleware\.ts|migration|\.sql|payment|\.env|firebase|supabase)"
RISK_COUNT=$(echo "$CHANGED_FILES" | grep -cE "$HIGH_RISK_PATTERN" || true)
RISK_FLAGS=$(echo "$CHANGED_FILES" | grep -oE "$HIGH_RISK_PATTERN" | sort -u | tr '\n' ',' | sed 's/,$//')

if [ "$HAS_SRC" -eq 0 ]; then
    PROCESS_LEVEL="L1"
elif [ "$RISK_COUNT" -gt 0 ]; then
    PROCESS_LEVEL="L3"
else
    PROCESS_LEVEL="L2"
fi

# ── 6. 분기 결정 ──
case "$PROCESS_LEVEL" in
    L0|L1)
        TO_ROLE="MOZZI"
        CHAIN_STEP="cto_to_coo"
        AUTO_APPROVE=""
        MANUAL_REVIEW="false"
        ;;
    L2)
        TO_ROLE="PM_LEADER"
        CHAIN_STEP="cto_to_pm"
        if [ "$RISK_COUNT" -gt 0 ]; then
            AUTO_APPROVE=""
            MANUAL_REVIEW="true"
        else
            AUTO_APPROVE='"auto_approve_after_minutes": 30,'
            MANUAL_REVIEW="false"
        fi
        ;;
    L3)
        TO_ROLE="PM_LEADER"
        CHAIN_STEP="cto_to_pm"
        AUTO_APPROVE=""
        MANUAL_REVIEW="true"
        ;;
    *)
        TO_ROLE="PM_LEADER"
        CHAIN_STEP="cto_to_pm"
        AUTO_APPROVE=""
        MANUAL_REVIEW="false"
        ;;
esac

# ── 7. Payload 구성 ──
LAST_COMMIT=$(git log --oneline -1 2>/dev/null | cut -d' ' -f1)
CHANGED_COUNT=$(echo "$CHANGED_FILES" | grep -c '.' || true)
ANALYSIS_FILE=$(ls -t "$PROJECT_DIR/docs/03-analysis/"*.analysis.md 2>/dev/null | head -1)
TASK_FILE=$(jq -r '.taskFiles[0] // empty' "$CONTEXT_FILE" 2>/dev/null)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
MSG_ID="chain-cto-$(date +%s)-$$"

PAYLOAD=$(cat <<EOFPAYLOAD
{
  "protocol": "bscamp-team/v1",
  "type": "COMPLETION_REPORT",
  "from_role": "CTO_LEADER",
  "to_role": "${TO_ROLE}",
  "payload": {
    "task_file": "${TASK_FILE}",
    "match_rate": ${RATE},
    "analysis_file": "${ANALYSIS_FILE}",
    "commit_hash": "${LAST_COMMIT}",
    "changed_files": ${CHANGED_COUNT},
    "summary": "개발 완료. Match Rate ${RATE}%. Level ${PROCESS_LEVEL}.",
    "chain_step": "${CHAIN_STEP}",
    "process_level": "${PROCESS_LEVEL}",
    "risk_flags": [$(echo "$RISK_FLAGS" | sed 's/[^,]*/"&"/g')],
    ${AUTO_APPROVE}
    "requires_manual_review": ${MANUAL_REVIEW}
  },
  "ts": "${TIMESTAMP}",
  "msg_id": "${MSG_ID}"
}
EOFPAYLOAD
)

# ── 8. Broker 전송 (curl 직접) ──
BROKER_URL="http://localhost:7899"

# 8-1. Health check
if ! curl -sf "${BROKER_URL}/health" >/dev/null 2>&1; then
    echo "⚠ broker 미기동. 수동 핸드오프 필요."
    echo "Match Rate ${RATE}% 통과 (${PROCESS_LEVEL}). ${TO_ROLE}에게 직접 전달하세요."
    echo "ACTION_REQUIRED: send_message(${TO_ROLE}, COMPLETION_REPORT)"
    echo "PAYLOAD: ${PAYLOAD}"
    exit 0
fi

# 8-2. Peer 검색 (summary에서 역할 매칭)
PEERS_JSON=$(curl -sf -X POST "${BROKER_URL}/list-peers" \
    -H 'Content-Type: application/json' \
    -d "{\"scope\":\"repo\",\"cwd\":\"${PROJECT_DIR}\",\"git_root\":\"${PROJECT_DIR}\"}" \
    2>/dev/null || echo "[]")

TARGET_ID=$(echo "$PEERS_JSON" | jq -r "[.[] | select(.summary | test(\"${TO_ROLE}\"))][0].id // empty" 2>/dev/null)
MY_ID=$(echo "$PEERS_JSON" | jq -r "[.[] | select(.summary | test(\"CTO\"))][0].id // empty" 2>/dev/null)

if [ -z "$TARGET_ID" ]; then
    echo "⚠ ${TO_ROLE} peer 미발견. 수동 핸드오프 필요."
    echo "ACTION_REQUIRED: send_message(${TO_ROLE}, COMPLETION_REPORT)"
    echo "PAYLOAD: ${PAYLOAD}"
    exit 0
fi

if [ -z "$MY_ID" ]; then
    echo "⚠ 자기 peer ID 미발견. 수동 핸드오프 필요."
    echo "ACTION_REQUIRED: send_message(${TO_ROLE}, COMPLETION_REPORT)"
    echo "PAYLOAD: ${PAYLOAD}"
    exit 0
fi

# 8-3. 메시지 전송
ESCAPED_PAYLOAD=$(echo "$PAYLOAD" | jq -c '.' 2>/dev/null | sed 's/"/\\"/g')
SEND_RESULT=$(curl -sf -X POST "${BROKER_URL}/send-message" \
    -H 'Content-Type: application/json' \
    -d "{\"from_id\":\"${MY_ID}\",\"to_id\":\"${TARGET_ID}\",\"text\":$(echo "$PAYLOAD" | jq -c '.')}" \
    2>/dev/null || echo '{"ok":false}')

SEND_OK=$(echo "$SEND_RESULT" | jq -r '.ok // false' 2>/dev/null)

if [ "$SEND_OK" = "true" ]; then
    echo "✅ PDCA 체인 자동 전송 완료"
    echo "  Match Rate: ${RATE}%"
    echo "  Level: ${PROCESS_LEVEL}"
    echo "  대상: ${TO_ROLE} (peer: ${TARGET_ID})"
    echo "  chain_step: ${CHAIN_STEP}"
    [ "$MANUAL_REVIEW" = "true" ] && echo "  ⚠ 수동 검수 필수 (고위험/L3)"
    [ -n "$AUTO_APPROVE" ] && echo "  ⏱ 30분 타임아웃 자동 승인"
else
    echo "⚠ 메시지 전송 실패. 수동 핸드오프 필요."
    echo "ACTION_REQUIRED: send_message(${TO_ROLE}, COMPLETION_REPORT)"
    echo "PAYLOAD: ${PAYLOAD}"
fi

exit 0
```

### 2-2. session-resume-check.sh (신규)

```bash
#!/bin/bash
# session-resume-check.sh — 세션 시작 시 미완료 TASK 자동 감지
# 정보 제공만 (차단 안 함, 항상 exit 0)
set -uo pipefail

PROJECT_DIR="/Users/smith/projects/bscamp"

PDCA_FILE="$PROJECT_DIR/.bkit/state/pdca-status.json"
REGISTRY="$PROJECT_DIR/.claude/runtime/teammate-registry.json"
BOARD="$PROJECT_DIR/.claude/tasks/BOARD.json"

FOUND_ISSUES=0

# ── 1. 미완료 피처 감지 ──
if [ -f "$PDCA_FILE" ]; then
    INCOMPLETE=$(jq -r '
        .features // {} | to_entries[] |
        select(.value.currentState != null and .value.currentState != "completed") |
        "  - \(.key): \(.value.currentState // "unknown") (phase: \(.value.phase // "?"))"
    ' "$PDCA_FILE" 2>/dev/null)

    if [ -n "$INCOMPLETE" ]; then
        echo "⚠ 미완료 피처 감지:"
        echo "$INCOMPLETE"
        echo ""
        FOUND_ISSUES=1
    fi
fi

# ── 2. 좀비 팀원 감지 ──
if [ -f "$REGISTRY" ]; then
    SHUTDOWN_STATE=$(jq -r '.shutdownState // "unknown"' "$REGISTRY" 2>/dev/null)

    if [ "$SHUTDOWN_STATE" = "running" ]; then
        ACTIVE_MEMBERS=$(jq -r '
            .members // {} | to_entries[] |
            select(.value.state == "active") |
            "  - \(.key): state=\(.value.state), task=\(.value.currentTask // "none")"
        ' "$REGISTRY" 2>/dev/null)

        if [ -n "$ACTIVE_MEMBERS" ]; then
            echo "⚠ 이전 세션 팀원 잔존 (registry 정리 필요):"
            echo "$ACTIVE_MEMBERS"
            echo "  → teammate-registry.json의 members를 비우거나 state를 terminated로 변경하세요."
            echo ""
            FOUND_ISSUES=1
        fi
    fi
fi

# ── 3. 미할당 TASK 감지 ──
if [ -d "$PROJECT_DIR/.claude/tasks" ]; then
    UNASSIGNED=0
    for TASK_FILE in "$PROJECT_DIR/.claude/tasks"/TASK-*.md; do
        [ -f "$TASK_FILE" ] || continue
        STATUS=$(awk '/^---$/{f=!f;next}f' "$TASK_FILE" | grep -E "^status:" | head -1 | awk '{print $2}')
        if [ "$STATUS" = "pending" ] || [ -z "$STATUS" ]; then
            UNASSIGNED=$((UNASSIGNED + 1))
        fi
    done

    if [ "$UNASSIGNED" -gt 0 ]; then
        echo "⚠ 미착수 TASK ${UNASSIGNED}건 감지"
        echo "  → .claude/tasks/ 폴더에서 status: pending인 TASK를 확인하세요."
        echo ""
        FOUND_ISSUES=1
    fi
fi

# ── 4. pdca-status 마지막 업데이트 시간 ──
if [ -f "$PDCA_FILE" ]; then
    LAST_UPDATE=$(jq -r '.updatedAt // empty' "$PDCA_FILE" 2>/dev/null)
    if [ -n "$LAST_UPDATE" ]; then
        # macOS stat
        FILE_EPOCH=$(stat -f %m "$PDCA_FILE" 2>/dev/null || echo 0)
        NOW_EPOCH=$(date +%s)
        AGE_HOURS=$(( (NOW_EPOCH - FILE_EPOCH) / 3600 ))
        if [ "$AGE_HOURS" -gt 24 ]; then
            echo "⚠ pdca-status.json 마지막 수정: ${AGE_HOURS}시간 전"
            echo "  → 오래된 상태일 수 있습니다. 현재 진행 상황을 확인하세요."
            echo ""
            FOUND_ISSUES=1
        fi
    fi
fi

# ── 5. 요약 ──
if [ "$FOUND_ISSUES" -eq 0 ]; then
    echo "✅ 이전 세션 잔여 이슈 없음. 깨끗한 상태입니다."
fi

exit 0
```

---

## 3. Hook 등록

### 3-1. settings.local.json 변경

**pdca-chain-handoff.sh**: 기존 위치 유지 (TaskCompleted 8번째). 코드만 교체.

**session-resume-check.sh**: 신규 등록 불필요.
- CC에 `SessionStart` hook event가 없음
- 대신 **CLAUDE.md에 규칙으로 추가** → 리더가 세션 시작 시 수동 실행

### 3-2. CLAUDE.md 추가 규칙

```markdown
## 세션 시작 복구 프로토콜 (2026-03-29 추가)
세션 시작 시 반드시 실행:
\`\`\`bash
bash .claude/hooks/session-resume-check.sh
\`\`\`
미완료 TASK/좀비 팀원이 감지되면 해당 항목부터 이어서 진행.
```

---

## 4. 에러 처리

| 상황 | 동작 | exit code |
|------|------|:---------:|
| IS_TEAMMATE=true | 즉시 통과 | 0 |
| team-context.json 없음 | 비대상 → 통과 | 0 |
| team != CTO* | 비대상 → 통과 | 0 |
| Match Rate < 95% | 차단 + 안내 메시지 | 2 |
| Match Rate >= 95%, broker 살아있음, peer 발견 | curl 자동 전송 | 0 |
| broker 다운 | ACTION_REQUIRED fallback | 0 |
| 대상 peer 미발견 | ACTION_REQUIRED fallback | 0 |
| 자기 peer ID 미발견 | ACTION_REQUIRED fallback | 0 |
| /send-message 실패 (ok:false) | ACTION_REQUIRED fallback | 0 |
| jq 미설치 | 빈 값 → fallback 경로 | 0 |
| session-resume-check: pdca 파일 없음 | "깨끗한 상태" 출력 | 0 |
| session-resume-check: jq 파싱 실패 | 해당 섹션 스킵 | 0 |

---

## 5. 구현 순서

### Wave 1: 핵심 스크립트 (의존성 없음)

- [ ] W1-1: pdca-chain-handoff.sh v2 작성 (기존 파일 교체)
- [ ] W1-2: session-resume-check.sh 신규 작성
- [ ] W1-3: TDD 작성 + 실행 (35건: RV-1~RV-23, SR-1~SR-12)

### Wave 2: 설정 + 규칙

- [ ] W2-1: CLAUDE.md에 세션 복구 프로토콜 규칙 추가

### Wave 3: 통합 검증

- [ ] W3-1: 기존 PC-1~PC-25 테스트 호환성 확인 (깨지면 수정)
- [ ] W3-2: 전체 `npx vitest run __tests__/hooks/` → 0 fail
- [ ] W3-3: Gap 분석 → `docs/03-analysis/agent-ops-review-issues.analysis.md`

---

## 6. TDD 테스트 설계

### 6-1. pdca-chain-handoff-v2.test.ts (23건)

기존 PC-1~PC-25와 **별도 파일**. v2 전용 테스트.
기존 테스트는 v2 교체 후 **호환성 확인용으로 유지** (Wave 3).

#### 위험도 게이트 테스트 (RV-1 ~ RV-7)

```typescript
describe('위험도 게이트 분기', () => {
  // RV-1: src/ 변경 없음 → L1 → to_role=MOZZI, chain_step=cto_to_coo
  it('RV-1: 변경 파일에 src/ 없음 → L1 → COO 직접', () => {
    // git diff HEAD~1 --name-only = "docs/plan.md\n.claude/hooks/test.sh"
    // → PROCESS_LEVEL=L1, TO_ROLE=MOZZI
    const env = createTestEnv();
    // analysis_pass.md (97%)
    writeAnalysisFile(env.tmpDir, 97);
    // team-context CTO
    writeTeamContext(env.tmpDir, 'CTO');
    // git mock: no src/ files
    const hookPath = prepareChainHandoffV2(env, { changedFiles: ['docs/plan.md'] });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('cto_to_coo');
    expect(result.stdout).toContain('MOZZI');
  });

  // RV-2: src/app/page.tsx 변경 → L2 일반 → PM + 타임아웃 30분
  it('RV-2: src/ 변경(일반) → L2 → PM + auto_approve 30분', () => {
    const env = createTestEnv();
    writeAnalysisFile(env.tmpDir, 96);
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/app/page.tsx', 'src/components/Button.tsx']
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('PM_LEADER');
    expect(result.stdout).toContain('auto_approve_after_minutes');
    expect(result.stdout).toContain('30분 타임아웃');
  });

  // RV-3: src/lib/auth.ts 변경 → L2 고위험 → PM 수동 필수
  it('RV-3: auth 파일 변경 → 고위험 → PM 수동 검수 필수', () => {
    const env = createTestEnv();
    writeAnalysisFile(env.tmpDir, 98);
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/lib/auth.ts', 'src/app/login/page.tsx']
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('PM_LEADER');
    expect(result.stdout).toContain('수동 검수 필수');
    expect(result.stdout).not.toContain('auto_approve');
  });

  // RV-4: migration 파일 → L3 → PM 수동 필수
  it('RV-4: migration 파일 변경 → L3 → PM 수동 필수', () => {
    const env = createTestEnv();
    writeAnalysisFile(env.tmpDir, 95);
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/lib/migration/001.sql']
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('requires_manual_review');
  });

  // RV-5: .env 변경 → 고위험 플래그
  it('RV-5: .env 변경 → risk_flags에 .env 포함', () => {
    const env = createTestEnv();
    writeAnalysisFile(env.tmpDir, 97);
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/app/page.tsx', '.env.local']
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('.env');
  });

  // RV-6: payment 키워드 → 고위험
  it('RV-6: payment 관련 파일 → 고위험 플래그', () => {
    const env = createTestEnv();
    writeAnalysisFile(env.tmpDir, 96);
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/lib/payment/stripe.ts']
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('수동 검수 필수');
  });

  // RV-7: supabase 변경 → 고위험
  it('RV-7: supabase 파일 변경 → 고위험', () => {
    const env = createTestEnv();
    writeAnalysisFile(env.tmpDir, 97);
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/lib/supabase/server.ts']
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('수동 검수 필수');
  });
});
```

#### curl 직접 전송 테스트 (RV-8 ~ RV-15)

```typescript
describe('curl 직접 전송', () => {
  // RV-8: broker 살아있고 peer 모두 발견 → 자동 전송 성공
  it('RV-8: broker + peers OK → "자동 전송 완료" 메시지', () => {
    // mock broker: /health → 200, /list-peers → [{id:"pm1",summary:"PM_LEADER..."},{id:"cto1",summary:"CTO..."}]
    // /send-message → {ok:true}
    const env = createTestEnv();
    writeAnalysisFile(env.tmpDir, 97);
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('자동 전송 완료');
    expect(result.exitCode).toBe(0);
  });

  // RV-9: broker 다운 → ACTION_REQUIRED fallback
  it('RV-9: broker 다운 → ACTION_REQUIRED + PAYLOAD 출력', () => {
    const env = createTestEnv();
    writeAnalysisFile(env.tmpDir, 97);
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('ACTION_REQUIRED');
    expect(result.stdout).toContain('broker 미기동');
    expect(result.exitCode).toBe(0);
  });

  // RV-10: PM_LEADER peer 없음 → ACTION_REQUIRED fallback
  it('RV-10: 대상 peer 미발견 → ACTION_REQUIRED', () => {
    const env = createTestEnv();
    writeAnalysisFile(env.tmpDir, 97);
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: [{ id: 'cto1', summary: 'CTO_LEADER | bscamp' }], sendOk: true }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('peer 미발견');
    expect(result.stdout).toContain('ACTION_REQUIRED');
  });

  // RV-11: 자기 peer ID 없음 → ACTION_REQUIRED fallback
  it('RV-11: 자기 CTO peer 미발견 → ACTION_REQUIRED', () => {
    const env = createTestEnv();
    writeAnalysisFile(env.tmpDir, 97);
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: [{ id: 'pm1', summary: 'PM_LEADER | bscamp' }], sendOk: true }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('자기 peer ID 미발견');
  });

  // RV-12: /send-message → ok:false → ACTION_REQUIRED fallback
  it('RV-12: send-message 실패 → ACTION_REQUIRED', () => {
    const env = createTestEnv();
    writeAnalysisFile(env.tmpDir, 97);
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: false }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('전송 실패');
    expect(result.stdout).toContain('ACTION_REQUIRED');
  });

  // RV-13: L1 + broker OK → MOZZI peer 검색 (PM_LEADER 아님)
  it('RV-13: L1 → MOZZI peer 검색', () => {
    const env = createTestEnv();
    writeAnalysisFile(env.tmpDir, 97);
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['docs/plan.md'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('MOZZI');
    expect(result.stdout).toContain('자동 전송 완료');
  });

  // RV-14: payload JSON 유효성 (jq -c 파싱 가능)
  it('RV-14: PAYLOAD가 유효한 JSON', () => {
    const env = createTestEnv();
    writeAnalysisFile(env.tmpDir, 96);
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: false }  // fallback → stdout에 PAYLOAD 출력
    });
    const result = runHook(hookPath, {});
    const payloadMatch = result.stdout.match(/PAYLOAD: ({[\s\S]*})/);
    expect(payloadMatch).not.toBeNull();
    expect(() => JSON.parse(payloadMatch![1])).not.toThrow();
  });

  // RV-15: msg_id 유일성 (PID 포함)
  it('RV-15: msg_id에 타임스탬프 + PID 포함', () => {
    const env = createTestEnv();
    writeAnalysisFile(env.tmpDir, 97);
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toMatch(/chain-cto-\d+-\d+/);
  });
});
```

#### 기존 호환성 테스트 (RV-16 ~ RV-20)

```typescript
describe('기존 동작 호환', () => {
  // RV-16: IS_TEAMMATE=true → 즉시 exit 0
  it('RV-16: 팀원 → 즉시 bypass', () => {
    const env = createTestEnv();
    const hookPath = prepareChainHandoffV2(env, {});
    const result = runHook(hookPath, { IS_TEAMMATE: 'true' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('ACTION_REQUIRED');
  });

  // RV-17: team=PM → exit 0
  it('RV-17: PM 팀 → 비대상 통과', () => {
    const env = createTestEnv();
    writeTeamContext(env.tmpDir, 'PM');
    const hookPath = prepareChainHandoffV2(env, {});
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
  });

  // RV-18: team-context.json 없음 → exit 0
  it('RV-18: team-context 없음 → 비대상 통과', () => {
    const env = createTestEnv();
    const hookPath = prepareChainHandoffV2(env, {});
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
  });

  // RV-19: Match Rate 94% → exit 2 차단
  it('RV-19: Match Rate 94% → exit 2', () => {
    const env = createTestEnv();
    writeAnalysisFile(env.tmpDir, 94);
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {});
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('차단');
  });

  // RV-20: Match Rate 95% 경계값 → 통과
  it('RV-20: Match Rate 95% 경계 → 통과', () => {
    const env = createTestEnv();
    writeAnalysisFile(env.tmpDir, 95);
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('95%');
  });
});
```

#### CTO-2 접두사 매칭 (RV-21 ~ RV-23)

```typescript
describe('CTO 팀 변형 매칭', () => {
  // RV-21: team="CTO-1" → 대상
  it('RV-21: CTO-1 팀 → 대상으로 처리', () => {
    const env = createTestEnv();
    writeAnalysisFile(env.tmpDir, 97);
    writeTeamContext(env.tmpDir, 'CTO-1');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('97%');
  });

  // RV-22: team="CTO-2" → 대상
  it('RV-22: CTO-2 팀 → 대상으로 처리', () => {
    const env = createTestEnv();
    writeAnalysisFile(env.tmpDir, 96);
    writeTeamContext(env.tmpDir, 'CTO-2');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['docs/readme.md'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
  });

  // RV-23: team="MKT" → 비대상
  it('RV-23: MKT 팀 → 비대상', () => {
    const env = createTestEnv();
    writeTeamContext(env.tmpDir, 'MKT');
    const hookPath = prepareChainHandoffV2(env, {});
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });
});
```

### 6-2. session-resume-check.test.ts (12건)

```typescript
describe('session-resume-check.sh — 세션 복구 감지', () => {
  // ── 미완료 피처 감지 ──

  // SR-1: implementing 상태 피처 1건 → 감지 + 피처명 출력
  it('SR-1: implementing 피처 → "미완료 피처 감지" + 피처명', () => {
    const env = createTestEnv();
    writePdcaStatus(env.tmpDir, {
      features: {
        'agent-ops-dashboard': { currentState: 'implementing', phase: 'do' },
        'pdca-chain': { currentState: 'completed', phase: 'report' }
      }
    });
    const hookPath = prepareSessionResumeCheck(env);
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('미완료 피처 감지');
    expect(result.stdout).toContain('agent-ops-dashboard');
    expect(result.stdout).not.toContain('pdca-chain');
    expect(result.exitCode).toBe(0);
  });

  // SR-2: 모든 피처 completed → "깨끗한 상태"
  it('SR-2: 전부 completed → "깨끗한 상태"', () => {
    const env = createTestEnv();
    writePdcaStatus(env.tmpDir, {
      features: {
        'feature-a': { currentState: 'completed', phase: 'report' }
      }
    });
    writeEmptyRegistry(env.tmpDir);
    const hookPath = prepareSessionResumeCheck(env);
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('깨끗한 상태');
  });

  // SR-3: pdca-status.json 없음 → 에러 없이 통과
  it('SR-3: pdca-status.json 없음 → 에러 안 남', () => {
    const env = createTestEnv();
    const hookPath = prepareSessionResumeCheck(env);
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
  });

  // SR-4: designing 상태도 미완료로 감지
  it('SR-4: designing 상태 → 미완료 감지', () => {
    const env = createTestEnv();
    writePdcaStatus(env.tmpDir, {
      features: {
        'new-feature': { currentState: 'designing', phase: 'design' }
      }
    });
    const hookPath = prepareSessionResumeCheck(env);
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('미완료 피처 감지');
    expect(result.stdout).toContain('designing');
  });

  // ── 좀비 팀원 감지 ──

  // SR-5: shutdownState=running + active members → 좀비 감지
  it('SR-5: active 멤버 잔존 → "좀비 팀원" 경고', () => {
    const env = createTestEnv();
    writePdcaStatus(env.tmpDir, { features: {} });
    writeRegistry(env.tmpDir, {
      team: 'CTO', shutdownState: 'running',
      members: {
        'backend-dev': { state: 'active', currentTask: 'TASK-X.md' }
      }
    });
    const hookPath = prepareSessionResumeCheck(env);
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('이전 세션 팀원 잔존');
    expect(result.stdout).toContain('backend-dev');
  });

  // SR-6: shutdownState=done → 좀비 아님
  it('SR-6: shutdownState=done → 좀비 경고 없음', () => {
    const env = createTestEnv();
    writePdcaStatus(env.tmpDir, { features: {} });
    writeRegistry(env.tmpDir, {
      team: 'CTO', shutdownState: 'done',
      members: { 'backend-dev': { state: 'terminated' } }
    });
    const hookPath = prepareSessionResumeCheck(env);
    const result = runHook(hookPath, {});
    expect(result.stdout).not.toContain('팀원 잔존');
  });

  // SR-7: registry 없음 → 에러 없이 통과
  it('SR-7: teammate-registry.json 없음 → 에러 안 남', () => {
    const env = createTestEnv();
    writePdcaStatus(env.tmpDir, { features: {} });
    const hookPath = prepareSessionResumeCheck(env);
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
  });

  // SR-8: members 비어있음 → 좀비 없음
  it('SR-8: members 빈 객체 → 좀비 없음', () => {
    const env = createTestEnv();
    writePdcaStatus(env.tmpDir, { features: {} });
    writeRegistry(env.tmpDir, {
      team: 'CTO', shutdownState: 'running', members: {}
    });
    const hookPath = prepareSessionResumeCheck(env);
    const result = runHook(hookPath, {});
    expect(result.stdout).not.toContain('팀원 잔존');
  });

  // ── 미착수 TASK 감지 ──

  // SR-9: pending TASK 2건 → "미착수 TASK 2건"
  it('SR-9: pending TASK 2건 → 미착수 감지', () => {
    const env = createTestEnv();
    writePdcaStatus(env.tmpDir, { features: {} });
    writeTaskFile(env.tmpDir, 'TASK-A.md', 'pending');
    writeTaskFile(env.tmpDir, 'TASK-B.md', 'pending');
    writeTaskFile(env.tmpDir, 'TASK-C.md', 'completed');
    const hookPath = prepareSessionResumeCheck(env);
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('미착수 TASK 2건');
  });

  // SR-10: 모든 TASK completed → 미착수 경고 없음
  it('SR-10: 전부 completed → 미착수 없음', () => {
    const env = createTestEnv();
    writePdcaStatus(env.tmpDir, { features: {} });
    writeTaskFile(env.tmpDir, 'TASK-DONE.md', 'completed');
    const hookPath = prepareSessionResumeCheck(env);
    const result = runHook(hookPath, {});
    expect(result.stdout).not.toContain('미착수');
  });

  // ── 복합 시나리오 ──

  // SR-11: 미완료 피처 + 좀비 + 미착수 동시 → 3개 모두 출력
  it('SR-11: 3가지 이슈 동시 → 전부 출력', () => {
    const env = createTestEnv();
    writePdcaStatus(env.tmpDir, {
      features: { 'wip': { currentState: 'implementing', phase: 'do' } }
    });
    writeRegistry(env.tmpDir, {
      team: 'CTO', shutdownState: 'running',
      members: { 'fe-dev': { state: 'active', currentTask: null } }
    });
    writeTaskFile(env.tmpDir, 'TASK-NEW.md', 'pending');
    const hookPath = prepareSessionResumeCheck(env);
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('미완료 피처');
    expect(result.stdout).toContain('팀원 잔존');
    expect(result.stdout).toContain('미착수 TASK');
    expect(result.exitCode).toBe(0);
  });

  // SR-12: 항상 exit 0 (차단 안 함)
  it('SR-12: 어떤 상황이든 exit 0 (정보 제공만)', () => {
    const env = createTestEnv();
    // 일부러 malformed JSON
    const pdcaPath = join(env.tmpDir, '.bkit', 'state', 'pdca-status.json');
    mkdirSync(dirname(pdcaPath), { recursive: true });
    writeFileSync(pdcaPath, '{ broken json');
    const hookPath = prepareSessionResumeCheck(env);
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
  });
});
```

### 6-3. 테스트 헬퍼 함수 (helpers.ts에 추가)

```typescript
/** analysis 파일에 Match Rate 기록 */
export function writeAnalysisFile(tmpDir: string, rate: number): void {
  const dir = join(tmpDir, 'docs', '03-analysis');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'test.analysis.md'), `# Gap 분석\n## Match Rate: ${rate}%\n`);
}

/** team-context.json 생성 */
export function writeTeamContext(tmpDir: string, team: string): void {
  const dir = join(tmpDir, '.claude', 'runtime');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'team-context.json'), JSON.stringify({
    team, session: 'test', created: new Date().toISOString(),
    taskFiles: ['TASK-TEST.md'], teammates: []
  }));
}

/** pdca-status.json 생성 */
export function writePdcaStatus(tmpDir: string, data: Record<string, unknown>): void {
  const dir = join(tmpDir, '.bkit', 'state');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'pdca-status.json'), JSON.stringify({
    ...data, updatedAt: new Date().toISOString()
  }));
}

/** TASK 파일 생성 (frontmatter 포함) */
export function writeTaskFile(tmpDir: string, name: string, status: string): void {
  const dir = join(tmpDir, '.claude', 'tasks');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), `---\nteam: CTO\nstatus: ${status}\n---\n# ${name}\n`);
}

/** registry 생성 */
export function writeRegistry(tmpDir: string, data: Record<string, unknown>): void {
  const dir = join(tmpDir, '.claude', 'runtime');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'teammate-registry.json'), JSON.stringify({
    ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  }));
}

/** 빈 registry (좀비 없음) */
export function writeEmptyRegistry(tmpDir: string): void {
  writeRegistry(tmpDir, { team: 'CTO', shutdownState: 'done', members: {} });
}

/**
 * pdca-chain-handoff.sh v2 준비.
 * git diff를 mock하기 위해 스크립트 내부의 git 명령을 치환.
 * broker curl을 mock하기 위해 가짜 curl wrapper 생성.
 */
export function prepareChainHandoffV2(
  env: ReturnType<typeof createTestEnv>,
  opts: {
    changedFiles?: string[];
    mockBroker?: {
      health: boolean;
      peers?: Array<{ id: string; summary: string }>;
      sendOk?: boolean;
    };
  }
): string {
  const originalPath = join(process.cwd(), '.claude/hooks/pdca-chain-handoff.sh');
  let content = readFileSync(originalPath, 'utf-8');

  // PROJECT_DIR 치환
  content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);

  // git diff mock
  const files = (opts.changedFiles || []).join('\\n');
  content = content.replace(
    /git diff HEAD~1 --name-only 2>\/dev\/null/g,
    `echo -e "${files}"`
  );

  // git log mock
  content = content.replace(
    /git log --oneline -1 2>\/dev\/null/,
    'echo "abc1234 test commit"'
  );

  // broker curl mock
  if (opts.mockBroker) {
    const mockScript = createMockCurl(env.tmpDir, opts.mockBroker);
    content = content.replace(/curl /g, `${mockScript} `);
  }

  const destPath = join(env.hooksDir, 'pdca-chain-handoff.sh');
  writeFileSync(destPath, content, { mode: 0o755 });

  // helpers 복사
  const helpersDir = join(env.hooksDir, 'helpers');
  mkdirSync(helpersDir, { recursive: true });
  copyFileSync(
    join(process.cwd(), '.claude/hooks/helpers/match-rate-parser.sh'),
    join(helpersDir, 'match-rate-parser.sh')
  );

  // is-teammate.sh 복사
  copyFileSync(
    join(process.cwd(), '.claude/hooks/is-teammate.sh'),
    join(env.hooksDir, 'is-teammate.sh')
  );

  // detect-process-level.sh 복사 + PROJECT_DIR 패치
  let detectContent = readFileSync(
    join(process.cwd(), '.claude/hooks/detect-process-level.sh'), 'utf-8'
  );
  detectContent = detectContent.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);
  writeFileSync(join(env.hooksDir, 'detect-process-level.sh'), detectContent, { mode: 0o755 });

  return destPath;
}

/** session-resume-check.sh 준비 */
export function prepareSessionResumeCheck(
  env: ReturnType<typeof createTestEnv>
): string {
  const originalPath = join(process.cwd(), '.claude/hooks/session-resume-check.sh');
  let content = readFileSync(originalPath, 'utf-8');
  content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);
  const destPath = join(env.hooksDir, 'session-resume-check.sh');
  writeFileSync(destPath, content, { mode: 0o755 });
  return destPath;
}

/**
 * mock curl 스크립트 생성.
 * URL 파라미터에 따라 다른 응답 반환.
 */
function createMockCurl(tmpDir: string, broker: {
  health: boolean;
  peers?: Array<{ id: string; summary: string }>;
  sendOk?: boolean;
}): string {
  const peersJson = JSON.stringify(broker.peers || []);
  const sendResult = JSON.stringify({ ok: broker.sendOk ?? false });

  const script = `#!/bin/bash
# mock-curl: broker 응답 시뮬레이션
ARGS="$*"

# health check
if echo "$ARGS" | grep -q "/health"; then
    ${broker.health ? 'echo \'{"peers":2}\'; exit 0' : 'exit 22'}
fi

# list-peers
if echo "$ARGS" | grep -q "/list-peers"; then
    echo '${peersJson.replace(/'/g, "'\\''")}'
    exit 0
fi

# send-message
if echo "$ARGS" | grep -q "/send-message"; then
    echo '${sendResult.replace(/'/g, "'\\''")}'
    exit 0
fi

# 기타: 그대로 통과
exit 0
`;

  const mockPath = join(tmpDir, 'mock-curl.sh');
  writeFileSync(mockPath, script, { mode: 0o755 });
  return mockPath;
}
```

### 6-4. 신규 fixtures (5개)

| 파일 | 내용 |
|------|------|
| `fixtures/broker_peers_full.json` | CTO + PM + MOZZI 3자 peer 목록 |
| `fixtures/broker_peers_cto_only.json` | CTO만 있는 peer 목록 |
| `fixtures/broker_send_ok.json` | `{ "ok": true }` |
| `fixtures/broker_send_fail.json` | `{ "ok": false, "error": "peer not found" }` |
| `fixtures/pdca_status_incomplete.json` | implementing 피처 2건 + completed 1건 |

---

## 7. 커버리지 매트릭스

| 테스트 영역 | 테스트 ID | 수 | 커버 |
|------------|-----------|:--:|------|
| 위험도 게이트 L0/L1 | RV-1 | 1 | PM 스킵 → COO 직접 |
| 위험도 게이트 L2 일반 | RV-2 | 1 | PM + 30분 타임아웃 |
| 위험도 게이트 L2 고위험 | RV-3,5,6,7 | 4 | auth/env/payment/supabase |
| 위험도 게이트 L3 | RV-4 | 1 | migration → PM 수동 |
| curl 성공 | RV-8,13 | 2 | PM/MOZZI 각각 |
| curl fallback | RV-9,10,11,12 | 4 | broker/peer/self/send 실패 |
| payload 검증 | RV-14,15 | 2 | JSON 유효성 + msg_id |
| 기존 호환 | RV-16~20 | 5 | teammate/team/context/rate |
| CTO 변형 | RV-21~23 | 3 | CTO-1/CTO-2/MKT |
| 세션 복구: 피처 | SR-1~4 | 4 | implementing/completed/없음/designing |
| 세션 복구: 좀비 | SR-5~8 | 4 | active/done/없음/빈members |
| 세션 복구: TASK | SR-9~10 | 2 | pending/completed |
| 세션 복구: 복합 | SR-11~12 | 2 | 3이슈 동시/malformed |
| **합계** | | **35** | |

---

## 파일 경계

### backend-dev
```
.claude/hooks/pdca-chain-handoff.sh (교체 — v2)
.claude/hooks/session-resume-check.sh (신규)
__tests__/hooks/pdca-chain-handoff-v2.test.ts (신규)
__tests__/hooks/session-resume-check.test.ts (신규)
__tests__/hooks/helpers.ts (헬퍼 함수 추가)
__tests__/hooks/fixtures/broker_peers_full.json (신규)
__tests__/hooks/fixtures/broker_peers_cto_only.json (신규)
__tests__/hooks/fixtures/broker_send_ok.json (신규)
__tests__/hooks/fixtures/broker_send_fail.json (신규)
__tests__/hooks/fixtures/pdca_status_incomplete.json (신규)
```

### leader
```
CLAUDE.md (수정 — 세션 복구 프로토콜 추가)
```

### qa-engineer
```
docs/03-analysis/agent-ops-review-issues.analysis.md (신규)
```

---

## 하지 말 것

- src/ 코드 수정 (hooks/scripts만)
- broker 코드(upstream) 수정 — curl로 기존 API 사용
- relay server 신규 구축
- 기존 pdca-chain-handoff.test.ts (PC-1~25) 삭제 — 호환성 확인용 유지
- settings.local.json의 hook 순서 변경
- is-teammate.sh 수정 (별도 TASK로 분리)
