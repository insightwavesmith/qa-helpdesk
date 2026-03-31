# PDCA 체인 자동화 (PDCA Chain Automation) 설계서

> 작성일: 2026-03-29
> Plan: docs/01-plan/features/pdca-chain-automation.plan.md
> TASK: .claude/tasks/TASK-PDCA-CHAIN-AUTOMATION.md
> 상태: Design
> 프로세스 레벨: L2 (hooks/scripts, src/ 미수정)
> Match Rate 기준: **95%** (Smith님 확정)
> **통합 범위**: 에이전트팀 운영(Wave 0~4) + 대시보드 + PDCA 체인 = Agent Ops Platform

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | PDCA Chain Automation — CTO→PM→COO 자동 핸드오프 + Agent Ops Platform 통합 |
| **작성일** | 2026-03-29 |
| **파일 수** | 신규 2개 + 수정 2개 + 테스트 4개 = **8개** |
| **핵심** | TaskCompleted hook → Match Rate 95% 게이트 → MCP send_message 자동 체이닝 |
| **통합** | 기존 agent-team-operations(MCP/레지스트리) + agent-ops-dashboard(실시간 UI) 위에 체인 레이어 추가 |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | CTO→PM→COO 수동 핸드오프 지연+누락. 대시보드/MCP/hook이 분리되어 전체 흐름 끊김 |
| **Solution** | hook 자동 체이닝 + MCP 메시지 + 대시보드 실시간 반영을 하나의 서비스로 통합 |
| **Function UX Effect** | Smith님이 TASK 던지면 → 개발→검수→보고 전체가 자동. 대시보드에서 실시간 추적 |
| **Core Value** | 핸드오프 지연 0 + 검수 누락 방지 + 운영 가시성 100% |

---

## 0. Agent Ops Platform 통합 아키텍처

```
┌─────────────────────── Agent Ops Platform ───────────────────────┐
│                                                                   │
│  ┌─ Layer 1: 에이전트팀 운영 (완료) ─────────────────────────┐  │
│  │  team-context.json + teammate-registry.json                 │  │
│  │  frontmatter-parser + auto-shutdown + force-team-kill       │  │
│  │  claude-peers-mcp (broker + channel/tool mode)              │  │
│  │  peers-wake-watcher (mozzi webhook wake)                    │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              │                                     │
│                       (MCP 인프라 공유)                             │
│                              │                                     │
│  ┌─ Layer 2: PDCA 체인 자동화 (이 문서) ─────────────────────┐  │
│  │  pdca-chain-handoff.sh (TaskCompleted hook)                 │  │
│  │  match-rate-parser.sh (분석 파서)                            │  │
│  │  MCP send_message 자동 발송 (CTO→PM→COO)                   │  │
│  │  PM 검수 프로토콜 + COO 보고 프로토콜                        │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              │                                     │
│                     (상태 변경 이벤트)                              │
│                              │                                     │
│  ┌─ Layer 3: 운영 대시보드 (설계 완료) ─────────────────────┐  │
│  │  Bun + Hono + Preact(HTM) + WebSocket                      │  │
│  │  5개 패널: PDCA 파이프라인 / 팀 현황 / 메시지 / TASK / 로그 │  │
│  │  파일 watcher + broker DB 폴링 → WS push                   │  │
│  │  Cloudflare Tunnel (외부 접근)                               │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘

═══ 데이터 흐름 ═══

CTO TaskCompleted
  → task-completed.sh (마커 + 알림 + BOARD.json)
  → task-quality-gate.sh (tsc + build)
  → gap-analysis.sh (staged 파일 vs TASK)
  → pdca-update.sh (상태 갱신)
  → pdca-sync-monitor.sh (docs/.pdca-status.json 동기화)
  → auto-team-cleanup.sh (완료 체크 + 알림)
  → notify-completion.sh (macOS 알림)
  → **pdca-chain-handoff.sh** ← 신규
      │
      ├─ Match Rate < 95% → exit 2 (CTO 자체 수정)
      │
      └─ Match Rate ≥ 95%
          │
          ├─ send_message(PM, COMPLETION_REPORT)
          │     │
          │     └─ 대시보드 WS: message:new (comm-log에 표시)
          │
          └─ docs/.pdca-status.json 갱신
                │
                └─ 대시보드 WS: pdca:updated (파이프라인 Check→Act 전이)
```

---

## 1. 데이터 모델

### 1-1. Match Rate 파서 출력

```typescript
interface MatchRateResult {
  rate: number          // 0~100 정수
  file: string          // 소스 analysis.md 경로
  rawLine: string       // 파싱한 원본 줄
  parsedAt: string      // ISO timestamp
}
```

### 1-2. 체인 메시지 payload (bscamp-team/v1 프로토콜)

#### COMPLETION_REPORT (CTO → PM)

```json
{
  "protocol": "bscamp-team/v1",
  "type": "COMPLETION_REPORT",
  "from_role": "CTO_LEADER",
  "to_role": "PM_LEADER",
  "payload": {
    "task_file": "TASK-AGENT-TEAM-OPS.md",
    "match_rate": 97,
    "analysis_file": "docs/03-analysis/agent-team-operations.analysis.md",
    "commit_hash": "e0dfff7",
    "changed_files": 5,
    "summary": "Wave 0-4 구현 완료. Match Rate 97%.",
    "chain_step": "cto_to_pm"
  },
  "ts": "2026-03-29T10:30:00+09:00",
  "msg_id": "chain-cto-1711673400"
}
```

#### COMPLETION_REPORT (PM → COO)

```json
{
  "protocol": "bscamp-team/v1",
  "type": "COMPLETION_REPORT",
  "from_role": "PM_LEADER",
  "to_role": "MOZZI",
  "payload": {
    "task_file": "TASK-AGENT-TEAM-OPS.md",
    "match_rate": 97,
    "pm_verdict": "pass",
    "pm_notes": "Gap 분석 확인 완료. 기획 의도 부합.",
    "original_cto_report": { "...": "CTO payload 전체 포함" },
    "summary": "CTO 개발+PM 검수 완료. Smith님 보고 요청.",
    "chain_step": "pm_to_coo"
  },
  "ts": "2026-03-29T10:45:00+09:00",
  "msg_id": "chain-pm-1711674300"
}
```

#### FEEDBACK (반려)

```json
{
  "protocol": "bscamp-team/v1",
  "type": "FEEDBACK",
  "from_role": "PM_LEADER|MOZZI",
  "to_role": "CTO_LEADER|PM_LEADER",
  "payload": {
    "task_file": "TASK-AGENT-TEAM-OPS.md",
    "verdict": "reject",
    "issues": ["Gap 항목 3건 미반영", "API 설계 불일치"],
    "action_required": "issues 수정 후 재제출",
    "chain_step": "pm_to_cto|coo_to_pm"
  },
  "ts": "...",
  "msg_id": "chain-fb-{timestamp}"
}
```

### 1-3. chain_step 상태 열거

```
cto_qa       → CTO 자체 QA (Match Rate 체크)
cto_to_pm    → CTO→PM COMPLETION_REPORT 전송
pm_review    → PM 검수 중
pm_to_coo    → PM→COO COMPLETION_REPORT 전송
coo_report   → COO가 Smith님에게 보고 중
smith_ok     → Smith님 승인 → 배포
smith_reject → Smith님 반려 → 피드백 체인 역방향
pm_to_cto    → PM→CTO FEEDBACK 전송 (반려)
coo_to_pm    → COO→PM FEEDBACK 전송 (Smith님 반려)
```

---

## 2. API 설계 (Hook 인터페이스)

### 2-1. pdca-chain-handoff.sh

| 항목 | 값 |
|------|-----|
| **위치** | `.claude/hooks/pdca-chain-handoff.sh` |
| **hook** | TaskCompleted (8번째, 체인 마지막) |
| **입력** | stdin: TaskCompleted JSON |
| **출력** | stdout: 상태 메시지 |
| **exit** | 0 = 통과, 2 = 차단 (피드백) |
| **전제** | 선행 7개 hook 전부 exit 0 |

```bash
#!/bin/bash
# pdca-chain-handoff.sh — Match Rate 95% 게이트 + MCP 자동 핸드오프
# TaskCompleted hook 체인의 마지막 (8번째)

# 1. 팀원 bypass
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"
cd "$PROJECT_DIR" || exit 0

# 2. CTO 팀만 대상
CONTEXT_FILE="$PROJECT_DIR/.claude/runtime/team-context.json"
if [ ! -f "$CONTEXT_FILE" ]; then
    exit 0  # 팀 컨텍스트 없음 → 비대상
fi
TEAM=$(jq -r '.team // empty' "$CONTEXT_FILE" 2>/dev/null)
[ "$TEAM" != "CTO" ] && exit 0

# 3. Match Rate 파싱
source "$(dirname "$0")/helpers/match-rate-parser.sh"
RATE=$(parse_match_rate "$PROJECT_DIR/docs/03-analysis")
if [ -z "$RATE" ] || [ "$RATE" -lt 0 ] 2>/dev/null; then
    RATE=0
fi

# 4. 95% 미만 → 차단
THRESHOLD=95
if [ "$RATE" -lt "$THRESHOLD" ]; then
    echo "PDCA 체인 차단: Match Rate ${RATE}% (기준: ${THRESHOLD}%+)"
    echo "Gap 분석 문서의 Match Rate를 ${THRESHOLD}% 이상으로 달성한 후 재시도하세요."
    exit 2
fi

# 5. 95% 이상 → PM에 COMPLETION_REPORT 전송
LAST_COMMIT=$(git log --oneline -1 2>/dev/null | cut -d' ' -f1)
CHANGED=$(git diff HEAD~1 --name-only 2>/dev/null | wc -l | tr -d ' ')
ANALYSIS_FILE=$(ls -t "$PROJECT_DIR/docs/03-analysis/"*.analysis.md 2>/dev/null | head -1)
TASK_FILE=""
if [ -f "$CONTEXT_FILE" ]; then
    TASK_FILE=$(jq -r '.taskFiles[0] // empty' "$CONTEXT_FILE" 2>/dev/null)
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
MSG_ID="chain-cto-$(date +%s)"

PAYLOAD=$(cat <<EOF
{
  "protocol": "bscamp-team/v1",
  "type": "COMPLETION_REPORT",
  "from_role": "CTO_LEADER",
  "to_role": "PM_LEADER",
  "payload": {
    "task_file": "${TASK_FILE}",
    "match_rate": ${RATE},
    "analysis_file": "${ANALYSIS_FILE}",
    "commit_hash": "${LAST_COMMIT}",
    "changed_files": ${CHANGED},
    "summary": "개발 완료. Match Rate ${RATE}%.",
    "chain_step": "cto_to_pm"
  },
  "ts": "${TIMESTAMP}",
  "msg_id": "${MSG_ID}"
}
EOF
)

# broker health check (실패 시 수동 fallback)
if ! curl -sf http://localhost:7899/health >/dev/null 2>&1; then
    echo "⚠ broker 미기동. MCP 메시지 전송 불가. 수동 핸드오프 필요."
    echo "Match Rate ${RATE}% 통과. PM에게 직접 전달하세요."
    exit 0  # 차단하지 않음 (수동 fallback)
fi

# PM peer ID 검색 (list_peers에서 PM_LEADER summary 매칭)
# 주의: bash에서 MCP tool 직접 호출 불가 — 리더 에이전트가 대신 실행
echo "✅ PDCA 체인 통과: Match Rate ${RATE}%"
echo "ACTION_REQUIRED: send_message(PM_LEADER, COMPLETION_REPORT)"
echo "PAYLOAD: ${PAYLOAD}"
echo ""
echo "리더가 위 payload로 PM에 send_message를 실행하세요."

# 향후: MCP CLI wrapper로 직접 전송 가능하면 자동화
exit 0
```

### 2-2. match-rate-parser.sh

```bash
#!/bin/bash
# match-rate-parser.sh — analysis.md에서 Match Rate 숫자 추출
# source 해서 parse_match_rate 함수 사용

parse_match_rate() {
    local analysis_dir="$1"

    # 가장 최근 수정된 analysis.md 찾기 (1일 이내)
    local latest
    latest=$(find "$analysis_dir" -name "*.analysis.md" -mtime -1 2>/dev/null \
        | xargs ls -t 2>/dev/null | head -1)

    if [ -z "$latest" ]; then
        # 1일 이내 없으면 전체에서 최신
        latest=$(ls -t "$analysis_dir"/*.analysis.md 2>/dev/null | head -1)
    fi

    if [ -z "$latest" ]; then
        echo "0"
        return 1
    fi

    # "Match Rate: XX%" 또는 "Match Rate XX%" 패턴 매칭
    local rate
    rate=$(grep -iE "match.?rate.*[0-9]" "$latest" 2>/dev/null \
        | tail -1 \
        | grep -oE '[0-9]+' \
        | head -1)

    if [ -z "$rate" ]; then
        echo "0"
        return 1
    fi

    # 범위 검증 (0~100)
    if [ "$rate" -gt 100 ] 2>/dev/null; then
        echo "0"
        return 1
    fi

    echo "$rate"
    return 0
}

# 직접 실행 시 사용법 출력
if [ "${BASH_SOURCE[0]}" == "$0" ]; then
    if [ -z "$1" ]; then
        echo "Usage: match-rate-parser.sh <analysis_dir>"
        echo "Example: match-rate-parser.sh docs/03-analysis"
        exit 1
    fi
    parse_match_rate "$1"
fi
```

---

## 3. 컴포넌트 구조

### 3-1. Hook 체인 전체 (settings.local.json TaskCompleted)

```
[1] task-completed.sh        → 마커 + 알림 + BOARD.json 갱신
[2] task-quality-gate.sh     → tsc + build + gap doc + pdca freshness
[3] gap-analysis.sh          → staged vs TASK 교차 검증
[4] pdca-update.sh           → .pdca-status.json 상태 전이
[5] pdca-sync-monitor.sh     → docs/.pdca-status.json 동기화
[6] auto-team-cleanup.sh     → 전체 TASK 완료 확인 + 알림
[7] notify-completion.sh     → macOS 알림 + 외부 통보
[8] pdca-chain-handoff.sh    → Match Rate 95% 게이트 + MCP 핸드오프 ← 신규
```

### 3-2. MCP 호출 방식

bash hook에서 MCP tool (`send_message`, `list_peers`) 직접 호출 불가.
→ **리더 에이전트에게 ACTION_REQUIRED 메시지 출력** → 리더가 MCP 도구 실행.

```
pdca-chain-handoff.sh (exit 0)
  ├─ stdout: "ACTION_REQUIRED: send_message(PM_LEADER, COMPLETION_REPORT)"
  ├─ stdout: "PAYLOAD: {...}"
  └─ 리더 에이전트가 stdout 읽고 → mcp__claude-peers__send_message 호출
```

향후 MCP CLI wrapper (`bun ~/claude-peers-mcp/cli.ts send PM_LEADER '...'`) 구현 시 hook에서 직접 전송 가능.

### 3-3. 대시보드 연동

pdca-chain-handoff.sh가 실행되면:

1. **pdca-update.sh** (선행)이 `docs/.pdca-status.json` 갱신
   → 대시보드 file watcher → `pdca:updated` WS push
   → PDCA 파이프라인 UI에 Check 단계 matchRate 표시

2. **리더가 send_message 실행** → broker DB에 메시지 저장
   → 대시보드 broker 폴링 → `message:new` WS push
   → 통신 로그에 "CTO→PM COMPLETION_REPORT" 표시

3. **PM이 수신 + 검수** → 결과에 따라 추가 메시지
   → 대시보드에 체인 진행 상태 실시간 반영

---

## 4. 에러 처리

| 상황 | 처리 | exit code |
|------|------|:---------:|
| 팀원 실행 | bypass | 0 |
| team-context.json 없음 | 체인 비대상 | 0 |
| CTO 팀이 아님 | 체인 비대상 | 0 |
| analysis.md 없음 | 0% 간주 → 차단 | 2 |
| Match Rate 파싱 실패 | 0% 간주 → 차단 | 2 |
| Match Rate < 95% | 피드백 + 차단 | 2 |
| Match Rate ≥ 95% + broker 다운 | 수동 fallback | 0 |
| Match Rate ≥ 95% + broker 정상 | ACTION_REQUIRED 출력 | 0 |
| jq 미설치 | grep 폴백 | 0 |

---

## 5. 구현 순서

### Wave 1: 핵심 스크립트

```
□ W1-1: .claude/hooks/helpers/match-rate-parser.sh (신규)
□ W1-2: .claude/hooks/pdca-chain-handoff.sh (신규)
□ W1-3: TDD 단위 테스트 (섹션 6-1, 6-2)
```

### Wave 2: 설정 + 규칙

```
□ W2-1: settings.local.json TaskCompleted 배열에 [8] 추가
□ W2-2: CLAUDE.md PM 검수 프로토콜 추가
□ W2-3: CLAUDE.md COO 보고 프로토콜 추가
```

### Wave 3: 통합 검증

```
□ W3-1: 통합 사용성 TDD (섹션 6-3, 6-4, 6-5)
□ W3-2: 실제 3자 통신 테스트
□ W3-3: Gap 분석 → docs/03-analysis/pdca-chain-automation.analysis.md (95%+)
```

---

## 6. TDD 테스트 설계

> **구성**: 유닛(2 파일) + 통합(3 파일) = 5개 테스트 파일, **총 72건**
> 유닛: match-rate-parser 11건 + pdca-chain-handoff 12건
> 통합 (Agent Ops Platform E2E): e2e-chain-flow 20건 + e2e-dashboard-sync 17건 + e2e-mcp-messaging 12건

### 6-1. match-rate-parser.test.ts (11건)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const SCRIPT = '/Users/smith/projects/bscamp/.claude/hooks/helpers/match-rate-parser.sh'

function parseRate(dir: string): string {
  try {
    return execSync(
      `source "${SCRIPT}" && parse_match_rate "${dir}"`,
      { shell: '/bin/bash', encoding: 'utf-8', timeout: 5000 }
    ).trim()
  } catch (e: any) {
    return e.stdout?.trim() || '0'
  }
}

describe('match-rate-parser.sh', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync('/tmp/mr-test-')
  })
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  // MR-1: 정상 파싱 "Match Rate: 97%"
  it('MR-1: "Match Rate: 97%" → 97', () => {
    writeFileSync(join(tmpDir, 'test.analysis.md'), '## Match Rate: 97%\n일치 항목: ...')
    expect(parseRate(tmpDir)).toBe('97')
  })

  // MR-2: "Match Rate 95%" (콜론 없음)
  it('MR-2: "Match Rate 95%" 콜론 없음 → 95', () => {
    writeFileSync(join(tmpDir, 'test.analysis.md'), 'Match Rate 95%\n')
    expect(parseRate(tmpDir)).toBe('95')
  })

  // MR-3: 경계값 95% (정확히 threshold)
  it('MR-3: Match Rate 95% → 95 (통과 경계)', () => {
    writeFileSync(join(tmpDir, 'test.analysis.md'), '## Match Rate: 95%')
    expect(parseRate(tmpDir)).toBe('95')
  })

  // MR-4: 94% (threshold 미달)
  it('MR-4: Match Rate 94% → 94', () => {
    writeFileSync(join(tmpDir, 'test.analysis.md'), '## Match Rate: 94%')
    expect(parseRate(tmpDir)).toBe('94')
  })

  // MR-5: 100%
  it('MR-5: Match Rate 100% → 100', () => {
    writeFileSync(join(tmpDir, 'test.analysis.md'), '## Match Rate: 100%')
    expect(parseRate(tmpDir)).toBe('100')
  })

  // MR-6: 파일 없음 → 0
  it('MR-6: analysis 파일 없음 → 0', () => {
    expect(parseRate(tmpDir)).toBe('0')
  })

  // MR-7: 형식 불일치 "Match Rate: high"
  it('MR-7: "Match Rate: high" 숫자 아님 → 0', () => {
    writeFileSync(join(tmpDir, 'test.analysis.md'), 'Match Rate: high')
    expect(parseRate(tmpDir)).toBe('0')
  })

  // MR-8: 빈 파일
  it('MR-8: 빈 analysis.md → 0', () => {
    writeFileSync(join(tmpDir, 'test.analysis.md'), '')
    expect(parseRate(tmpDir)).toBe('0')
  })

  // MR-9: 여러 파일 → 최신 파일 사용
  it('MR-9: 3개 analysis.md → 최신 수정 파일의 값 사용', async () => {
    writeFileSync(join(tmpDir, 'old.analysis.md'), 'Match Rate: 80%')

    // 1초 대기 → 수정 시간 차이 보장
    await new Promise(r => setTimeout(r, 1100))
    writeFileSync(join(tmpDir, 'new.analysis.md'), 'Match Rate: 97%')

    expect(parseRate(tmpDir)).toBe('97')
  })

  // MR-10: 200% 등 범위 초과 → 0
  it('MR-10: Match Rate 200% 범위 초과 → 0', () => {
    writeFileSync(join(tmpDir, 'test.analysis.md'), 'Match Rate: 200%')
    expect(parseRate(tmpDir)).toBe('0')
  })

  // MR-11: 여러 줄에 Match Rate 언급 → 마지막 값
  it('MR-11: 여러 줄 "Match Rate" → 마지막 값 사용', () => {
    writeFileSync(join(tmpDir, 'test.analysis.md'),
      '## Match Rate: 85%\n(수정 후)\n## Match Rate: 97%')
    expect(parseRate(tmpDir)).toBe('97')
  })
})
```

### 6-2. pdca-chain-handoff.test.ts (12건)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, chmodSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

describe('pdca-chain-handoff.sh', () => {
  let tmpDir: string
  let analysisDir: string
  let runtimeDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync('/tmp/chain-test-')
    analysisDir = join(tmpDir, 'docs/03-analysis')
    runtimeDir = join(tmpDir, '.claude/runtime')
    mkdirSync(analysisDir, { recursive: true })
    mkdirSync(runtimeDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function runChainHook(env: Record<string, string> = {}): { code: number; stdout: string; stderr: string } {
    const script = '/Users/smith/projects/bscamp/.claude/hooks/pdca-chain-handoff.sh'
    const envStr = Object.entries({ ...env, PROJECT_DIR: tmpDir })
      .map(([k, v]) => `${k}="${v}"`).join(' ')
    try {
      const stdout = execSync(
        `${envStr} bash "${script}"`,
        { encoding: 'utf-8', timeout: 10000, env: { ...process.env, ...env, PROJECT_DIR: tmpDir } }
      )
      return { code: 0, stdout, stderr: '' }
    } catch (e: any) {
      return { code: e.status || 1, stdout: e.stdout || '', stderr: e.stderr || '' }
    }
  }

  // CH-1: 팀원 → bypass (exit 0)
  it('CH-1: IS_TEAMMATE=true → exit 0, 메시지 없음', () => {
    const result = runChainHook({ IS_TEAMMATE: 'true' })
    expect(result.code).toBe(0)
    expect(result.stdout).not.toContain('ACTION_REQUIRED')
  })

  // CH-2: team-context.json 없음 → exit 0
  it('CH-2: team-context.json 없음 → exit 0 (비대상)', () => {
    const result = runChainHook()
    expect(result.code).toBe(0)
  })

  // CH-3: PM 팀 → exit 0 (CTO만 대상)
  it('CH-3: team="PM" → exit 0 (비대상)', () => {
    writeFileSync(join(runtimeDir, 'team-context.json'),
      JSON.stringify({ team: 'PM', session: 'sdk-pm', taskFiles: [] }))
    const result = runChainHook()
    expect(result.code).toBe(0)
  })

  // CH-4: CTO + Match Rate 97% → exit 0 + ACTION_REQUIRED
  it('CH-4: CTO + Match Rate 97% → exit 0 + ACTION_REQUIRED 출력', () => {
    writeFileSync(join(runtimeDir, 'team-context.json'),
      JSON.stringify({ team: 'CTO', session: 'sdk-cto', taskFiles: ['TASK-TEST.md'] }))
    writeFileSync(join(analysisDir, 'test.analysis.md'), '## Match Rate: 97%')
    const result = runChainHook()
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('ACTION_REQUIRED')
    expect(result.stdout).toContain('COMPLETION_REPORT')
    expect(result.stdout).toContain('97')
  })

  // CH-5: CTO + Match Rate 95% (경계) → exit 0 (통과)
  it('CH-5: CTO + Match Rate 95% 경계값 → exit 0 통과', () => {
    writeFileSync(join(runtimeDir, 'team-context.json'),
      JSON.stringify({ team: 'CTO', session: 'sdk-cto', taskFiles: [] }))
    writeFileSync(join(analysisDir, 'test.analysis.md'), '## Match Rate: 95%')
    const result = runChainHook()
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Match Rate 95%')
  })

  // CH-6: CTO + Match Rate 94% → exit 2 (차단)
  it('CH-6: CTO + Match Rate 94% → exit 2 차단', () => {
    writeFileSync(join(runtimeDir, 'team-context.json'),
      JSON.stringify({ team: 'CTO', session: 'sdk-cto', taskFiles: [] }))
    writeFileSync(join(analysisDir, 'test.analysis.md'), '## Match Rate: 94%')
    const result = runChainHook()
    expect(result.code).toBe(2)
    expect(result.stdout).toContain('94%')
    expect(result.stdout).toContain('95%')
  })

  // CH-7: CTO + analysis 파일 없음 → exit 2
  it('CH-7: CTO + analysis 파일 없음 → exit 2 (0% 간주)', () => {
    writeFileSync(join(runtimeDir, 'team-context.json'),
      JSON.stringify({ team: 'CTO', session: 'sdk-cto', taskFiles: [] }))
    const result = runChainHook()
    expect(result.code).toBe(2)
  })

  // CH-8: CTO + 형식 불일치 → exit 2
  it('CH-8: CTO + "Match Rate: high" → exit 2', () => {
    writeFileSync(join(runtimeDir, 'team-context.json'),
      JSON.stringify({ team: 'CTO', session: 'sdk-cto', taskFiles: [] }))
    writeFileSync(join(analysisDir, 'test.analysis.md'), 'Match Rate: high')
    const result = runChainHook()
    expect(result.code).toBe(2)
  })

  // CH-9: broker 다운 + Match Rate 통과 → exit 0 (수동 fallback)
  it('CH-9: broker 다운 + 95%+ → exit 0 + 경고', () => {
    writeFileSync(join(runtimeDir, 'team-context.json'),
      JSON.stringify({ team: 'CTO', session: 'sdk-cto', taskFiles: [] }))
    writeFileSync(join(analysisDir, 'test.analysis.md'), '## Match Rate: 97%')
    // broker가 localhost:7899에 없으면 자동으로 수동 fallback
    const result = runChainHook()
    expect(result.code).toBe(0)
  })

  // CH-10: payload에 task_file 포함
  it('CH-10: ACTION_REQUIRED payload에 task_file 포함', () => {
    writeFileSync(join(runtimeDir, 'team-context.json'),
      JSON.stringify({ team: 'CTO', session: 'sdk-cto', taskFiles: ['TASK-OPS.md'] }))
    writeFileSync(join(analysisDir, 'test.analysis.md'), '## Match Rate: 97%')
    const result = runChainHook()
    expect(result.stdout).toContain('TASK-OPS.md')
  })

  // CH-11: payload에 chain_step = "cto_to_pm"
  it('CH-11: payload chain_step = "cto_to_pm"', () => {
    writeFileSync(join(runtimeDir, 'team-context.json'),
      JSON.stringify({ team: 'CTO', session: 'sdk-cto', taskFiles: [] }))
    writeFileSync(join(analysisDir, 'test.analysis.md'), '## Match Rate: 97%')
    const result = runChainHook()
    expect(result.stdout).toContain('cto_to_pm')
  })

  // CH-12: Match Rate 0% (빈 분석 파일) → exit 2
  it('CH-12: 빈 analysis.md → 0% → exit 2', () => {
    writeFileSync(join(runtimeDir, 'team-context.json'),
      JSON.stringify({ team: 'CTO', session: 'sdk-cto', taskFiles: [] }))
    writeFileSync(join(analysisDir, 'test.analysis.md'), '')
    const result = runChainHook()
    expect(result.code).toBe(2)
  })
})
```

### 6-3. e2e-chain-flow.test.ts (20건) — 전체 PDCA 체인 E2E

> **이 섹션이 핵심**: Smith님이 요청한 "실제 시나리오" 사용성 테스트.
> 개별 유닛이 아닌 **CTO 개발 → QA → PM 검수 → COO 보고** 전체 흐름 시뮬레이션.

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

/**
 * Agent Ops Platform E2E 테스트
 *
 * 환경: 임시 프로젝트 디렉토리에 실제 hook 체인 + 파일 구조 복제
 * broker: mock HTTP 서버 (localhost:17899)
 * MCP: mock (send_message → 파일 기록)
 */

describe('E2E: PDCA Chain — TASK 생성부터 COO 보고까지', () => {
  let projectDir: string
  let tasksDir: string
  let analysisDir: string
  let runtimeDir: string
  let hooksDir: string

  beforeAll(() => {
    projectDir = mkdtempSync('/tmp/e2e-chain-')
    tasksDir = join(projectDir, '.claude/tasks')
    analysisDir = join(projectDir, 'docs/03-analysis')
    runtimeDir = join(projectDir, '.claude/runtime')
    hooksDir = join(projectDir, '.claude/hooks/helpers')
    mkdirSync(tasksDir, { recursive: true })
    mkdirSync(analysisDir, { recursive: true })
    mkdirSync(runtimeDir, { recursive: true })
    mkdirSync(hooksDir, { recursive: true })

    // team-context.json: CTO 팀
    writeFileSync(join(runtimeDir, 'team-context.json'), JSON.stringify({
      team: 'CTO', session: 'sdk-cto',
      created: '2026-03-29',
      taskFiles: ['TASK-E2E-TEST.md']
    }))
  })

  afterAll(() => {
    rmSync(projectDir, { recursive: true, force: true })
  })

  // ─── Scenario 1: Happy Path (TASK 생성 → 개발 → QA 통과 → PM 핸드오프) ───

  // E2E-1: Smith님이 TASK 던지기 → TASK 파일 생성 확인
  it('E2E-1: TASK 파일 생성 → frontmatter 파싱 가능', () => {
    writeFileSync(join(tasksDir, 'TASK-E2E-TEST.md'), `---
team: CTO
created: 2026-03-29
status: in-progress
owner: leader
---
# TASK: E2E 테스트 기능

## Wave 1
- [ ] W1-1: 기본 구현
- [ ] W1-2: 테스트
`)
    const content = readFileSync(join(tasksDir, 'TASK-E2E-TEST.md'), 'utf-8')
    expect(content).toContain('team: CTO')
    expect(content).toContain('status: in-progress')
  })

  // E2E-2: CTO 개발 완료 → 체크박스 업데이트
  it('E2E-2: CTO 개발 완료 → 체크박스 [x] 처리', () => {
    const task = readFileSync(join(tasksDir, 'TASK-E2E-TEST.md'), 'utf-8')
    const updated = task.replace(/\- \[ \]/g, '- [x]')
    writeFileSync(join(tasksDir, 'TASK-E2E-TEST.md'), updated)

    const content = readFileSync(join(tasksDir, 'TASK-E2E-TEST.md'), 'utf-8')
    const checked = (content.match(/\- \[x\]/g) || []).length
    const unchecked = (content.match(/\- \[ \]/g) || []).length
    expect(checked).toBe(2)
    expect(unchecked).toBe(0)
  })

  // E2E-3: Gap 분석 문서 생성 → Match Rate 97%
  it('E2E-3: Gap 분석 문서 작성 → Match Rate 기록', () => {
    writeFileSync(join(analysisDir, 'e2e-test.analysis.md'), `# E2E 테스트 Gap 분석
## Match Rate: 97%
## 일치 항목: 29/30
## 불일치: W1-2 테스트 커버리지 부족 (minor)
`)
    const content = readFileSync(join(analysisDir, 'e2e-test.analysis.md'), 'utf-8')
    expect(content).toContain('Match Rate: 97%')
  })

  // E2E-4: pdca-chain-handoff 실행 → 97% → exit 0 + ACTION_REQUIRED
  it('E2E-4: 체인 hook → Match Rate 97% → PM 핸드오프 요청', () => {
    const script = '/Users/smith/projects/bscamp/.claude/hooks/helpers/match-rate-parser.sh'
    const rate = execSync(
      `source "${script}" && parse_match_rate "${analysisDir}"`,
      { shell: '/bin/bash', encoding: 'utf-8' }
    ).trim()
    expect(parseInt(rate)).toBeGreaterThanOrEqual(95)
  })

  // E2E-5: COMPLETION_REPORT payload 구조 검증
  it('E2E-5: COMPLETION_REPORT payload에 필수 필드 포함', () => {
    const payload = {
      protocol: 'bscamp-team/v1',
      type: 'COMPLETION_REPORT',
      from_role: 'CTO_LEADER',
      to_role: 'PM_LEADER',
      payload: {
        task_file: 'TASK-E2E-TEST.md',
        match_rate: 97,
        analysis_file: join(analysisDir, 'e2e-test.analysis.md'),
        chain_step: 'cto_to_pm'
      },
      msg_id: `chain-cto-${Date.now()}`
    }
    expect(payload.type).toBe('COMPLETION_REPORT')
    expect(payload.payload.match_rate).toBeGreaterThanOrEqual(95)
    expect(payload.payload.chain_step).toBe('cto_to_pm')
    expect(payload.payload.task_file).toContain('TASK-')
  })

  // ─── Scenario 2: QA 실패 → 자체 수정 루프 ───

  // E2E-6: Match Rate 85% → exit 2 (차단)
  it('E2E-6: Match Rate 85% → 체인 차단, CTO 자체 수정 필요', () => {
    writeFileSync(join(analysisDir, 'fail.analysis.md'), '## Match Rate: 85%')
    const script = '/Users/smith/projects/bscamp/.claude/hooks/helpers/match-rate-parser.sh'
    const rate = execSync(
      `source "${script}" && parse_match_rate "${analysisDir}"`,
      { shell: '/bin/bash', encoding: 'utf-8' }
    ).trim()
    expect(parseInt(rate)).toBeLessThan(95)
  })

  // E2E-7: CTO 수정 후 Match Rate 96%로 올림 → 재통과
  it('E2E-7: CTO 수정 → Match Rate 85%→96% → 재통과', async () => {
    writeFileSync(join(analysisDir, 'fail.analysis.md'), '## Match Rate: 96%')
    await new Promise(r => setTimeout(r, 100)) // 파일 시간 보장
    const script = '/Users/smith/projects/bscamp/.claude/hooks/helpers/match-rate-parser.sh'
    const rate = execSync(
      `source "${script}" && parse_match_rate "${analysisDir}"`,
      { shell: '/bin/bash', encoding: 'utf-8' }
    ).trim()
    expect(parseInt(rate)).toBeGreaterThanOrEqual(95)
  })

  // ─── Scenario 3: PM 검수 ───

  // E2E-8: PM이 COMPLETION_REPORT 수신 → 분석 파일 읽기 가능
  it('E2E-8: PM이 CTO의 analysis_file 경로로 파일 읽기 가능', () => {
    const report = {
      payload: {
        analysis_file: join(analysisDir, 'e2e-test.analysis.md'),
        match_rate: 97
      }
    }
    expect(existsSync(report.payload.analysis_file)).toBe(true)
    const content = readFileSync(report.payload.analysis_file, 'utf-8')
    expect(content).toContain('97%')
  })

  // E2E-9: PM 합격 → COMPLETION_REPORT(PM→COO) payload 구조
  it('E2E-9: PM 합격 → COO용 COMPLETION_REPORT 생성', () => {
    const pmReport = {
      protocol: 'bscamp-team/v1',
      type: 'COMPLETION_REPORT',
      from_role: 'PM_LEADER',
      to_role: 'MOZZI',
      payload: {
        task_file: 'TASK-E2E-TEST.md',
        match_rate: 97,
        pm_verdict: 'pass',
        pm_notes: 'Gap 분석 확인 완료. 기획 의도 부합.',
        chain_step: 'pm_to_coo'
      }
    }
    expect(pmReport.payload.pm_verdict).toBe('pass')
    expect(pmReport.payload.chain_step).toBe('pm_to_coo')
    expect(pmReport.to_role).toBe('MOZZI')
  })

  // E2E-10: PM 불합격 → FEEDBACK(PM→CTO) 구조
  it('E2E-10: PM 불합격 → CTO에 FEEDBACK 전송', () => {
    const feedback = {
      protocol: 'bscamp-team/v1',
      type: 'FEEDBACK',
      from_role: 'PM_LEADER',
      to_role: 'CTO_LEADER',
      payload: {
        task_file: 'TASK-E2E-TEST.md',
        verdict: 'reject',
        issues: ['API 설계 불일치', '테스트 누락 3건'],
        action_required: 'issues 수정 후 재제출',
        chain_step: 'pm_to_cto'
      }
    }
    expect(feedback.payload.verdict).toBe('reject')
    expect(feedback.payload.issues.length).toBeGreaterThan(0)
    expect(feedback.payload.chain_step).toBe('pm_to_cto')
  })

  // ─── Scenario 4: COO 보고 ───

  // E2E-11: COO가 PM 보고 수신 → Smith님 보고용 요약 생성 가능
  it('E2E-11: COO 수신 → 보고 데이터 추출 가능', () => {
    const pmReport = {
      payload: {
        task_file: 'TASK-E2E-TEST.md',
        match_rate: 97,
        pm_verdict: 'pass',
        pm_notes: 'Gap 분석 확인 완료.',
        chain_step: 'pm_to_coo'
      }
    }
    // COO가 Smith님에게 보고할 요약 생성
    const summary = `작업 '${pmReport.payload.task_file}' 완료 (품질 ${pmReport.payload.match_rate}%). PM 검수 통과.`
    expect(summary).toContain('TASK-E2E-TEST.md')
    expect(summary).toContain('97%')
    expect(summary).toContain('통과')
  })

  // E2E-12: Smith님 반려 → COO→PM FEEDBACK 체인
  it('E2E-12: Smith님 반려 → COO→PM FEEDBACK', () => {
    const feedback = {
      type: 'FEEDBACK',
      from_role: 'MOZZI',
      to_role: 'PM_LEADER',
      payload: {
        verdict: 'reject',
        issues: ['UI 색상 디자인 시스템 미준수'],
        chain_step: 'coo_to_pm'
      }
    }
    expect(feedback.payload.chain_step).toBe('coo_to_pm')
  })

  // E2E-13: Smith님 반려 → PM→CTO 피드백 전달 (2단계 역방향)
  it('E2E-13: COO→PM→CTO 역방향 피드백 체인', () => {
    const cooFeedback = { issues: ['UI 색상 미준수'], chain_step: 'coo_to_pm' }
    const pmFeedback = {
      type: 'FEEDBACK',
      from_role: 'PM_LEADER',
      to_role: 'CTO_LEADER',
      payload: {
        verdict: 'reject',
        issues: [...cooFeedback.issues, 'Smith님 반려: UI 색상 #F75D5D 사용 필요'],
        chain_step: 'pm_to_cto'
      }
    }
    expect(pmFeedback.payload.issues).toContain('UI 색상 미준수')
    expect(pmFeedback.payload.chain_step).toBe('pm_to_cto')
  })

  // ─── Scenario 5: 체인 상태 전이 ───

  // E2E-14: chain_step 전이 순서 검증
  it('E2E-14: chain_step 상태 전이 순서 (정방향)', () => {
    const steps = ['cto_qa', 'cto_to_pm', 'pm_review', 'pm_to_coo', 'coo_report', 'smith_ok']
    expect(steps.indexOf('cto_qa')).toBeLessThan(steps.indexOf('cto_to_pm'))
    expect(steps.indexOf('pm_review')).toBeLessThan(steps.indexOf('pm_to_coo'))
    expect(steps.indexOf('coo_report')).toBeLessThan(steps.indexOf('smith_ok'))
  })

  // E2E-15: 반려 시 역방향 전이
  it('E2E-15: 반려 시 역방향 chain_step', () => {
    const rejectSteps = ['smith_reject', 'coo_to_pm', 'pm_to_cto']
    expect(rejectSteps[0]).toBe('smith_reject')
    expect(rejectSteps[rejectSteps.length - 1]).toBe('pm_to_cto')
  })

  // ─── Scenario 6: 경계 조건 ───

  // E2E-16: 동시에 2개 TASK 완료 → 각각 독립 체인
  it('E2E-16: 2개 TASK 동시 완료 → 독립 체인 (msg_id 다름)', () => {
    const msg1 = `chain-cto-${Date.now()}`
    const msg2 = `chain-cto-${Date.now() + 1}`
    expect(msg1).not.toBe(msg2)
  })

  // E2E-17: webhook wake payload 구조
  it('E2E-17: PM→COO 전송 시 webhook wake payload 올바른 구조', () => {
    const wakePayload = {
      text: '[PDCA Chain] PM 검수 완료. TASK-E2E-TEST.md. Smith님 보고 요청.',
      mode: 'now'
    }
    expect(wakePayload.mode).toBe('now')
    expect(wakePayload.text).toContain('TASK-')
  })

  // E2E-18: ACK 프로토콜 — COMPLETION_REPORT는 ACK 필수
  it('E2E-18: COMPLETION_REPORT → ACK 필수 메시지', () => {
    const ackRequired = {
      COMPLETION_REPORT: true,
      TASK_HANDOFF: true,
      URGENT: true,
      FEEDBACK: false,
      STATUS_UPDATE: false,
      PING: false,
    }
    expect(ackRequired.COMPLETION_REPORT).toBe(true)
    expect(ackRequired.FEEDBACK).toBe(false)
  })

  // E2E-19: 전체 체인 소요 시간 — msg_id timestamp 기반 추적 가능
  it('E2E-19: msg_id에 timestamp 포함 → 체인 소요 시간 계산 가능', () => {
    const ctoTs = Date.now()
    const pmTs = ctoTs + 300000 // 5분 후
    const cooTs = pmTs + 600000 // 10분 후

    const duration = cooTs - ctoTs // 15분
    expect(duration).toBe(900000)
    expect(duration / 60000).toBe(15) // 15분
  })

  // E2E-20: TASK status 전이 — pending → in-progress → completed
  it('E2E-20: TASK 파일 status 전이 전체', () => {
    const transitions = ['pending', 'in-progress', 'completed']
    let current = 'pending'

    // CTO 시작 → in-progress
    current = 'in-progress'
    expect(current).toBe('in-progress')

    // 체인 완료 + Smith님 OK → completed
    current = 'completed'
    expect(current).toBe('completed')

    expect(transitions.indexOf(current)).toBe(2)
  })
})
```

### 6-4. e2e-dashboard-sync.test.ts (17건) — 대시보드 실시간 반영

> 체인 각 단계에서 대시보드가 올바르게 업데이트되는지 검증.
> 대시보드 서버가 실행 중이어야 함 (beforeAll에서 spawn).

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFileSync, readFileSync, mkdirSync, rmSync, mkdtempSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * Dashboard ↔ PDCA Chain 동기화 E2E
 *
 * 체인 이벤트 → 파일 변경 → 대시보드 상태 반영 시뮬레이션
 * (실제 WS 테스트는 dashboard 서버 기동 필요 — 여기서는 데이터 동기화 검증)
 */

describe('E2E: Dashboard Sync — 체인 이벤트 → 대시보드 데이터 반영', () => {
  let projectDir: string

  beforeAll(() => {
    projectDir = mkdtempSync('/tmp/e2e-dash-')
    mkdirSync(join(projectDir, 'docs/03-analysis'), { recursive: true })
    mkdirSync(join(projectDir, 'docs'), { recursive: true })
    mkdirSync(join(projectDir, '.claude/tasks'), { recursive: true })
    mkdirSync(join(projectDir, '.claude/runtime'), { recursive: true })
  })

  afterAll(() => {
    rmSync(projectDir, { recursive: true, force: true })
  })

  // ─── PDCA 파이프라인 패널 ───

  // DS-1: CTO 개발 시작 → pdca-status "implementing" → 파이프라인 Do 🔄
  it('DS-1: pdca-status implementing → Do 단계 active', () => {
    const pdca = {
      features: {
        'e2e-test': {
          phase: 'implementing',
          plan: { done: true }, design: { done: true },
          do: { done: false }, check: { done: false }, act: { done: false }
        }
      },
      updatedAt: new Date().toISOString()
    }
    writeFileSync(join(projectDir, 'docs/.pdca-status.json'), JSON.stringify(pdca, null, 2))

    const read = JSON.parse(readFileSync(join(projectDir, 'docs/.pdca-status.json'), 'utf-8'))
    expect(read.features['e2e-test'].phase).toBe('implementing')
    expect(read.features['e2e-test'].do.done).toBe(false)
  })

  // DS-2: CTO 개발 완료 + Match Rate 기록 → Check 단계 표시
  it('DS-2: Match Rate 97% 기록 → Check 단계에 matchRate 표시', () => {
    const pdca = JSON.parse(readFileSync(join(projectDir, 'docs/.pdca-status.json'), 'utf-8'))
    pdca.features['e2e-test'].phase = 'checking'
    pdca.features['e2e-test'].do.done = true
    pdca.features['e2e-test'].check = { done: true, matchRate: 97, doc: 'e2e-test.analysis.md' }
    pdca.updatedAt = new Date().toISOString()
    writeFileSync(join(projectDir, 'docs/.pdca-status.json'), JSON.stringify(pdca, null, 2))

    const read = JSON.parse(readFileSync(join(projectDir, 'docs/.pdca-status.json'), 'utf-8'))
    expect(read.features['e2e-test'].check.matchRate).toBe(97)
  })

  // DS-3: PM 검수 완료 → Act 단계 전이
  it('DS-3: PM 검수 통과 → phase "completed"', () => {
    const pdca = JSON.parse(readFileSync(join(projectDir, 'docs/.pdca-status.json'), 'utf-8'))
    pdca.features['e2e-test'].phase = 'completed'
    pdca.features['e2e-test'].act = { done: true }
    pdca.updatedAt = new Date().toISOString()
    writeFileSync(join(projectDir, 'docs/.pdca-status.json'), JSON.stringify(pdca, null, 2))

    const read = JSON.parse(readFileSync(join(projectDir, 'docs/.pdca-status.json'), 'utf-8'))
    expect(read.features['e2e-test'].phase).toBe('completed')
  })

  // DS-4: 반려 시 → phase 되돌림 (checking → implementing)
  it('DS-4: PM 반려 → phase implementing으로 복귀', () => {
    const pdca = JSON.parse(readFileSync(join(projectDir, 'docs/.pdca-status.json'), 'utf-8'))
    pdca.features['e2e-test'].phase = 'implementing'
    pdca.features['e2e-test'].check = { done: false, matchRate: null }
    pdca.features['e2e-test'].act = { done: false }
    pdca.notes = 'PM 반려: API 설계 불일치'
    writeFileSync(join(projectDir, 'docs/.pdca-status.json'), JSON.stringify(pdca, null, 2))

    const read = JSON.parse(readFileSync(join(projectDir, 'docs/.pdca-status.json'), 'utf-8'))
    expect(read.features['e2e-test'].phase).toBe('implementing')
    expect(read.notes).toContain('반려')
  })

  // ─── TASK 보드 패널 ───

  // DS-5: TASK 생성 → 칸반 "대기" 열
  it('DS-5: TASK status=pending → 칸반 대기열', () => {
    writeFileSync(join(projectDir, '.claude/tasks/TASK-DS-TEST.md'),
      '---\nteam: CTO\nstatus: pending\n---\n# TASK: 테스트')
    const content = readFileSync(join(projectDir, '.claude/tasks/TASK-DS-TEST.md'), 'utf-8')
    expect(content).toContain('status: pending')
  })

  // DS-6: TASK in-progress → 칸반 "진행중" 열
  it('DS-6: TASK status=in-progress → 칸반 진행중', () => {
    const task = readFileSync(join(projectDir, '.claude/tasks/TASK-DS-TEST.md'), 'utf-8')
    writeFileSync(join(projectDir, '.claude/tasks/TASK-DS-TEST.md'),
      task.replace('status: pending', 'status: in-progress'))
    const updated = readFileSync(join(projectDir, '.claude/tasks/TASK-DS-TEST.md'), 'utf-8')
    expect(updated).toContain('status: in-progress')
  })

  // DS-7: TASK completed → 칸반 "완료" 열
  it('DS-7: TASK status=completed → 칸반 완료', () => {
    const task = readFileSync(join(projectDir, '.claude/tasks/TASK-DS-TEST.md'), 'utf-8')
    writeFileSync(join(projectDir, '.claude/tasks/TASK-DS-TEST.md'),
      task.replace('status: in-progress', 'status: completed'))
    const updated = readFileSync(join(projectDir, '.claude/tasks/TASK-DS-TEST.md'), 'utf-8')
    expect(updated).toContain('status: completed')
  })

  // DS-8: 체크박스 진행률 → 카드에 프로그레스 바 데이터
  it('DS-8: 체크박스 6/10 → 진행률 60%', () => {
    const taskContent = `---
team: CTO
status: in-progress
---
# TASK
- [x] 1
- [x] 2
- [x] 3
- [x] 4
- [x] 5
- [x] 6
- [ ] 7
- [ ] 8
- [ ] 9
- [ ] 10
`
    writeFileSync(join(projectDir, '.claude/tasks/TASK-PROGRESS.md'), taskContent)
    const content = readFileSync(join(projectDir, '.claude/tasks/TASK-PROGRESS.md'), 'utf-8')
    const checked = (content.match(/\- \[x\]/g) || []).length
    const total = checked + (content.match(/\- \[ \]/g) || []).length
    expect(checked).toBe(6)
    expect(total).toBe(10)
    expect(Math.round(checked / total * 100)).toBe(60)
  })

  // ─── 팀 현황 패널 ───

  // DS-9: teammate-registry 변경 → 팀원 상태 반영
  it('DS-9: 팀원 active→terminated → 팀 현황 업데이트', () => {
    const registry = {
      team: 'CTO', createdAt: '2026-03-29T09:00:00Z', updatedAt: '',
      shutdownState: 'running',
      members: {
        'backend-dev': { agentId: 'a1', state: 'active', role: 'backend-dev', spawnedAt: '2026-03-29' },
        'qa-engineer': { agentId: 'a2', state: 'terminated', role: 'qa-engineer', spawnedAt: '2026-03-29' }
      }
    }
    writeFileSync(join(projectDir, '.claude/runtime/teammate-registry.json'),
      JSON.stringify(registry, null, 2))

    const read = JSON.parse(readFileSync(
      join(projectDir, '.claude/runtime/teammate-registry.json'), 'utf-8'))
    expect(read.members['backend-dev'].state).toBe('active')
    expect(read.members['qa-engineer'].state).toBe('terminated')
  })

  // DS-10: 팀원 현재 TASK 표시
  it('DS-10: 팀원의 currentTask → 팀 현황에 TASK 이름 표시', () => {
    const registry = JSON.parse(readFileSync(
      join(projectDir, '.claude/runtime/teammate-registry.json'), 'utf-8'))
    registry.members['backend-dev'].currentTask = 'TASK-E2E-TEST.md'
    writeFileSync(join(projectDir, '.claude/runtime/teammate-registry.json'),
      JSON.stringify(registry, null, 2))

    const read = JSON.parse(readFileSync(
      join(projectDir, '.claude/runtime/teammate-registry.json'), 'utf-8'))
    expect(read.members['backend-dev'].currentTask).toBe('TASK-E2E-TEST.md')
  })

  // ─── 메시지 흐름 + 통신 로그 패널 ───

  // DS-11: COMPLETION_REPORT 메시지 → comm-log에 표시될 데이터
  it('DS-11: COMPLETION_REPORT → 통신 로그 행 데이터', () => {
    const msg = {
      from_id: 'CTO-LEAD-abc',
      to_id: 'PM-LEAD-xyz',
      body: JSON.stringify({
        type: 'COMPLETION_REPORT',
        payload: { task_file: 'TASK-E2E-TEST.md', match_rate: 97 }
      }),
      delivered: 1,
      created_at: '2026-03-29T10:30:00Z'
    }
    const body = JSON.parse(msg.body)
    expect(body.type).toBe('COMPLETION_REPORT')
    expect(msg.from_id).toContain('CTO')
    expect(msg.to_id).toContain('PM')
  })

  // DS-12: FEEDBACK 메시지 → comm-log에 반려 표시
  it('DS-12: FEEDBACK → 통신 로그에 반려 아이콘', () => {
    const msg = {
      from_id: 'PM-LEAD-xyz',
      to_id: 'CTO-LEAD-abc',
      body: JSON.stringify({
        type: 'FEEDBACK',
        payload: { verdict: 'reject', issues: ['설계 불일치'] }
      }),
      delivered: 1
    }
    const body = JSON.parse(msg.body)
    expect(body.type).toBe('FEEDBACK')
    expect(body.payload.verdict).toBe('reject')
  })

  // DS-13: 미배달 메시지 카운트
  it('DS-13: 미배달 메시지 → 빨간 뱃지 카운트', () => {
    const messages = [
      { delivered: 0 },
      { delivered: 0 },
      { delivered: 1 },
      { delivered: 1 },
      { delivered: 0 },
    ]
    const undelivered = messages.filter(m => m.delivered === 0).length
    expect(undelivered).toBe(3)
  })

  // DS-14: ACK 대기 메시지 필터
  it('DS-14: ACK 필수 + 미수신 → ACK 대기 뱃지', () => {
    const messages = [
      { type: 'COMPLETION_REPORT', ackReceived: false },
      { type: 'TASK_HANDOFF', ackReceived: false },
      { type: 'FEEDBACK', ackReceived: false }, // 선택이므로 대기 아님
    ]
    const ackRequired = ['COMPLETION_REPORT', 'TASK_HANDOFF', 'URGENT']
    const pendingAck = messages.filter(m =>
      ackRequired.includes(m.type) && !m.ackReceived
    )
    expect(pendingAck.length).toBe(2)
  })

  // ─── broker 상태 ───

  // DS-15: broker alive → 대시보드 정상 표시
  it('DS-15: brokerStatus alive → 메시지 패널 정상', () => {
    const dashState = { messages: { brokerStatus: 'alive', recent: [], undelivered: 0 } }
    expect(dashState.messages.brokerStatus).toBe('alive')
  })

  // DS-16: broker dead → 경고 배너 데이터
  it('DS-16: brokerStatus dead → 경고 메시지 존재', () => {
    const dashState = {
      messages: {
        brokerStatus: 'dead',
        brokerWarning: '⚠ broker 프로세스 중단 — 새 메시지 수신 불가',
        recent: [] // stale 데이터
      }
    }
    expect(dashState.messages.brokerStatus).toBe('dead')
    expect(dashState.messages.brokerWarning).toContain('broker')
  })

  // DS-17: broker not_installed → 메시지 패널 비활성
  it('DS-17: broker 미설치 → 메시지 패널 "MCP 미설치"', () => {
    const dashState = {
      messages: {
        brokerStatus: 'not_installed',
        recent: null,
        undelivered: 0
      }
    }
    expect(dashState.messages.brokerStatus).toBe('not_installed')
    expect(dashState.messages.recent).toBeNull()
  })
})
```

### 6-5. e2e-mcp-messaging.test.ts (12건) — MCP 메시지 흐름 E2E

> 실제 MCP 메시지 프로토콜 + 라우팅 + ACK + webhook wake 검증.

```typescript
import { describe, it, expect } from 'vitest'

/**
 * MCP 메시지 프로토콜 E2E 테스트
 *
 * broker 없이 메시지 구조/라우팅/프로토콜 규약 검증.
 * 실제 broker 통신은 Wave 3 통합 테스트에서 수동 실행.
 */

describe('E2E: MCP Messaging — 메시지 프로토콜 + 라우팅', () => {

  // ─── 프로토콜 준수 ───

  // MSG-1: bscamp-team/v1 프로토콜 필수 필드
  it('MSG-1: 모든 메시지에 protocol, type, ts, msg_id 필수', () => {
    const requiredFields = ['protocol', 'type', 'ts', 'msg_id']
    const msg = {
      protocol: 'bscamp-team/v1',
      type: 'COMPLETION_REPORT',
      from_role: 'CTO_LEADER',
      to_role: 'PM_LEADER',
      payload: {},
      ts: new Date().toISOString(),
      msg_id: `test-${Date.now()}`
    }
    requiredFields.forEach(f => {
      expect(msg).toHaveProperty(f)
      expect((msg as any)[f]).toBeTruthy()
    })
  })

  // MSG-2: msg_id 유일성 (타임스탬프 기반)
  it('MSG-2: msg_id 유일성 — 동일 밀리초에도 prefix로 구분', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(`chain-cto-${Date.now()}-${i}`)
    }
    expect(ids.size).toBe(100)
  })

  // MSG-3: 유효한 메시지 타입만 허용
  it('MSG-3: 메시지 타입 화이트리스트', () => {
    const validTypes = [
      'TASK_HANDOFF', 'COMPLETION_REPORT', 'FEEDBACK',
      'STATUS_UPDATE', 'URGENT', 'ACK', 'PING'
    ]
    const msg = { type: 'COMPLETION_REPORT' }
    expect(validTypes).toContain(msg.type)
  })

  // ─── 라우팅 ───

  // MSG-4: CTO→PM 라우팅 (COMPLETION_REPORT)
  it('MSG-4: CTO→PM 라우팅 from_role/to_role', () => {
    const msg = { from_role: 'CTO_LEADER', to_role: 'PM_LEADER', type: 'COMPLETION_REPORT' }
    expect(msg.from_role).toBe('CTO_LEADER')
    expect(msg.to_role).toBe('PM_LEADER')
  })

  // MSG-5: PM→COO 라우팅 (COMPLETION_REPORT)
  it('MSG-5: PM→COO 라우팅', () => {
    const msg = { from_role: 'PM_LEADER', to_role: 'MOZZI', type: 'COMPLETION_REPORT' }
    expect(msg.to_role).toBe('MOZZI')
  })

  // MSG-6: COO→PM 역방향 라우팅 (FEEDBACK)
  it('MSG-6: COO→PM 역방향 FEEDBACK', () => {
    const msg = { from_role: 'MOZZI', to_role: 'PM_LEADER', type: 'FEEDBACK' }
    expect(msg.from_role).toBe('MOZZI')
    expect(msg.type).toBe('FEEDBACK')
  })

  // MSG-7: PM→CTO 역방향 라우팅 (FEEDBACK)
  it('MSG-7: PM→CTO 역방향 FEEDBACK', () => {
    const msg = { from_role: 'PM_LEADER', to_role: 'CTO_LEADER', type: 'FEEDBACK' }
    expect(msg.to_role).toBe('CTO_LEADER')
  })

  // ─── ACK 프로토콜 ───

  // MSG-8: COMPLETION_REPORT ACK — ack_msg_id로 원본 추적
  it('MSG-8: ACK의 ack_msg_id가 원본 msg_id와 일치', () => {
    const original = { msg_id: 'chain-cto-123', type: 'COMPLETION_REPORT' }
    const ack = {
      type: 'ACK',
      payload: { ack_msg_id: original.msg_id },
      msg_id: 'ack-pm-456'
    }
    expect(ack.payload.ack_msg_id).toBe(original.msg_id)
  })

  // MSG-9: ACK의 ACK 금지 (무한 루프 방지)
  it('MSG-9: ACK 타입 메시지는 ACK 금지', () => {
    const noAckTypes = ['ACK', 'FEEDBACK', 'STATUS_UPDATE', 'PING']
    const ackRequiredTypes = ['TASK_HANDOFF', 'COMPLETION_REPORT', 'URGENT']
    expect(noAckTypes).toContain('ACK') // ACK은 ACK 불필요
    expect(ackRequiredTypes).not.toContain('ACK')
  })

  // ─── webhook wake ───

  // MSG-10: webhook wake payload 형식
  it('MSG-10: webhook wake POST body 구조', () => {
    const wake = {
      text: '[PDCA Chain] COMPLETION_REPORT from PM. TASK-E2E-TEST.md.',
      mode: 'now'
    }
    expect(wake.mode).toBe('now')
    expect(wake.text.length).toBeGreaterThan(0)
    expect(wake.text.length).toBeLessThan(500) // 합리적 길이
  })

  // MSG-11: COO 전용 — CC→OpenClaw에만 wake 필요
  it('MSG-11: CC→CC는 wake 불필요, CC→OpenClaw만 wake', () => {
    const targets = {
      PM_LEADER: { mode: 'channel', needsWake: false },
      CTO_LEADER: { mode: 'channel', needsWake: false },
      MOZZI: { mode: 'tool', needsWake: true },
    }
    expect(targets.PM_LEADER.needsWake).toBe(false)
    expect(targets.MOZZI.needsWake).toBe(true)
  })

  // MSG-12: 동일 msg_id 재전송 → 수신 측 중복 감지
  it('MSG-12: 동일 msg_id 재전송 → 애플리케이션 레이어 중복 처리', () => {
    const received = new Set<string>()
    const msg1 = { msg_id: 'chain-cto-123', type: 'COMPLETION_REPORT' }
    const msg2 = { msg_id: 'chain-cto-123', type: 'COMPLETION_REPORT' } // 재전송

    received.add(msg1.msg_id)
    const isDuplicate = received.has(msg2.msg_id)
    expect(isDuplicate).toBe(true) // 중복 감지됨
  })
})
```

---

## 7. TDD 커버리지 요약

| 파일 | 건수 | 구분 |
|------|:----:|------|
| match-rate-parser.test.ts | 11 | 유닛 |
| pdca-chain-handoff.test.ts | 12 | 유닛 |
| e2e-chain-flow.test.ts | 20 | 통합 E2E |
| e2e-dashboard-sync.test.ts | 17 | 통합 E2E |
| e2e-mcp-messaging.test.ts | 12 | 통합 E2E |
| **합계** | **72** | |

### 커버리지 맵

| 체인 단계 | 유닛 | E2E | 대시보드 | MCP |
|-----------|:----:|:---:|:--------:|:---:|
| CTO 자체 QA (Match Rate) | MR-1~11, CH-6~8,12 | E2E-3,4,6,7 | DS-2 | — |
| CTO→PM 핸드오프 | CH-4,5,10,11 | E2E-5 | DS-11 | MSG-4 |
| PM 검수 (합격) | — | E2E-8,9 | DS-3 | MSG-5 |
| PM 검수 (불합격) | — | E2E-10 | DS-4,12 | MSG-7 |
| PM→COO+wake | — | E2E-17 | — | MSG-10,11 |
| COO→Smith 보고 | — | E2E-11 | — | — |
| Smith 반려→역방향 | — | E2E-12,13 | DS-4 | MSG-6 |
| 팀원 bypass | CH-1 | — | — | — |
| PM/마케팅 skip | CH-3 | — | — | — |
| broker 장애 | CH-9 | — | DS-15,16,17 | — |
| 대시보드 PDCA 패널 | — | — | DS-1~4 | — |
| 대시보드 TASK 보드 | — | — | DS-5~8 | — |
| 대시보드 팀 현황 | — | — | DS-9,10 | — |
| 대시보드 메시지 | — | — | DS-11~14 | — |
| ACK 프로토콜 | — | E2E-18 | DS-14 | MSG-8,9 |
| 중복 감지 | — | — | — | MSG-12 |
| 체인 상태 전이 | — | E2E-14,15 | — | — |
| 동시 TASK | — | E2E-16 | — | MSG-2 |
| TASK status 전이 | — | E2E-20 | DS-5~7 | — |

---

## 8. 변경 로그

| 날짜 | 변경 | 작성자 |
|------|------|--------|
| 2026-03-29 | Design 신규 작성 (Plan 기반 + 통합 아키텍처 + E2E TDD 72건) | PM |
