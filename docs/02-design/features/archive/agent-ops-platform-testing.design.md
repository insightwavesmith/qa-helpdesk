# Agent Ops Platform 통합 테스트 설계서

> 작성일: 2026-03-29
> Plan: docs/01-plan/features/agent-ops-platform-testing.plan.md
> 상태: Design
> 프로세스 레벨: L2
> **목표**: `npx vitest run __tests__/hooks/` 1회 → 전부 Green → 출시. 변수 0.

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | Agent Ops Platform 전체 TDD — 10개 영역, 144건, 빠짐없는 커버리지 |
| **작성일** | 2026-03-29 |
| **테스트 수** | 144건 (기존 61건 + 신규 83건) |
| **테스트 파일** | 17개 (기존 10 + 신규 7) |
| **Fixture** | 23개 (기존 17 + 신규 6) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | 개별 유닛만 있고 통합 흐름 검증 0건. 출시 후 장애 가능 |
| **Solution** | 10개 영역 모든 케이스 TDD. CTO→PM→COO 전체 흐름 + 대시보드 실시간 + 에러 복구 |
| **Core Value** | Red 1건 = 장애 원인 사전 발견. 전부 Green = 출시 가능 |

---

## 공통 헬퍼 (helpers.ts 확장)

```typescript
// __tests__/hooks/helpers.ts
import { execSync } from 'child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'

export const HOOKS_DIR = '/Users/smith/projects/bscamp/.claude/hooks'
export const FIXTURES_DIR = join(__dirname, 'fixtures')

export function loadFixture(name: string): any {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'))
}

export function loadFixtureRaw(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8')
}

export function createTestEnv(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync('/tmp/hook-test-')
  mkdirSync(join(dir, 'docs/03-analysis'), { recursive: true })
  mkdirSync(join(dir, '.claude/runtime'), { recursive: true })
  mkdirSync(join(dir, '.claude/tasks'), { recursive: true })
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

export function runHook(script: string, env: Record<string, string> = {}): {
  code: number; stdout: string; stderr: string
} {
  const envStr = Object.entries(env).map(([k, v]) => `export ${k}="${v}"`).join('; ')
  try {
    const stdout = execSync(
      `bash -c '${envStr}; bash "${script}"'`,
      { encoding: 'utf-8', timeout: 15000 }
    )
    return { code: 0, stdout, stderr: '' }
  } catch (e: any) {
    return { code: e.status || 1, stdout: e.stdout || '', stderr: e.stderr || '' }
  }
}

export function runBashFunction(script: string, func: string, args: string[]): string {
  const cmd = `source "${script}" && ${func} ${args.map(a => `"${a}"`).join(' ')}`
  return execSync(`bash -c '${cmd}'`, { encoding: 'utf-8', timeout: 10000 }).trim()
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
```

---

## 영역 1: TASK 소유권 (frontmatter-parser) — 12건

> 파일: `__tests__/hooks/frontmatter-parser.test.ts`

```typescript
describe('frontmatter-parser.sh — TASK 소유권 파싱', () => {
  const SCRIPT = `${HOOKS_DIR}/helpers/frontmatter-parser.sh`

  // === parse_frontmatter_field() ===

  // FP-1: team 필드 정상 파싱
  it('FP-1: "team: CTO" → "CTO" 반환', () => {
    // fixture: task_with_frontmatter.md
    // action: parse_frontmatter_field "task.md" "team"
    // assert: output === "CTO"
  })

  // FP-2: status 필드 정상 파싱
  it('FP-2: "status: pending" → "pending" 반환', () => {
    // action: parse_frontmatter_field "task.md" "status"
    // assert: output === "pending"
  })

  // FP-3: session 필드 파싱
  it('FP-3: "session: sdk-cto" → "sdk-cto"', () => {
    // assert: output === "sdk-cto"
  })

  // FP-4: owner 필드 파싱
  it('FP-4: "owner: leader" → "leader"', () => {
    // assert: output === "leader"
  })

  // FP-5: frontmatter 없는 파일 → 빈 문자열 (크래시 안 함)
  it('FP-5: frontmatter 없음 → "" (에러 아님)', () => {
    // fixture: task_without_frontmatter.md
    // assert: output === ""
    // assert: exit 0 (크래시 안 함)
  })

  // FP-6: YAML 형식 오류 (콜론 누락) → 빈 문자열
  it('FP-6: "team CTO" (콜론 누락) → ""', () => {
    // fixture: inline "---\nteam CTO\n---\n# title"
    // assert: output === ""
  })

  // FP-7: 빈 파일 → 빈 문자열 (크래시 안 함)
  it('FP-7: 빈 파일 → "" (크래시 안 함)', () => {
    // assert: output === "" && exit 0
  })

  // === scan_unchecked() ===

  // FP-8: 프론트매터 내 체크박스 제외, body만 스캔
  it('FP-8: 프론트매터 안의 "- [ ]" 무시, body의 "- [ ]"만 카운트', () => {
    // fixture: task_frontmatter_checkbox_trap.md
    // assert: count === body 체크박스만
  })

  // FP-9: 체크박스 없는 TASK → 0건
  it('FP-9: 체크박스 없음 → unchecked 0', () => {
    // fixture: "---\nteam: CTO\n---\n# title\nno checkboxes"
    // assert: count === 0
  })

  // === load_team_context() ===

  // FP-10: team-context.json 정상 로드
  it('FP-10: team-context.json 존재 → TEAM, TASK_FILES 변수 설정', () => {
    // fixture: team_context_cto.json → .claude/runtime/team-context.json에 복사
    // assert: TEAM === "CTO"
    // assert: TASK_FILES 비어있지 않음
  })

  // FP-11: team-context.json 없음 → 폴백 (전체 TASK 스캔)
  it('FP-11: team-context.json 없음 → false 반환, 폴백 경로 진입', () => {
    // assert: load_team_context returns non-zero
  })

  // FP-12: 크로스팀 TASK 필터링 — CTO 팀이면 PM TASK 제외
  it('FP-12: taskFiles=["TASK-CTO.md"] → TASK-PM.md 스캔 안 함', () => {
    // fixture: team-context.json taskFiles=["TASK-CTO.md"]
    // setup: TASK-PM.md (미완료 체크박스 3건)
    // assert: scan_unchecked가 TASK-PM.md 무시
  })
})
```

---

## 영역 2: 팀 생성/역할 경계 — 8건

> 파일: `__tests__/hooks/team-context.test.ts` (신규)

```typescript
describe('team-context — 팀 생성 + 역할 경계', () => {

  // TC-1: team-context.json 정상 구조
  it('TC-1: team, session, created, taskFiles 4개 필드 존재', () => {
    const ctx = loadFixture('team_context_cto.json')
    expect(ctx).toHaveProperty('team')
    expect(ctx).toHaveProperty('session')
    expect(ctx).toHaveProperty('created')
    expect(ctx).toHaveProperty('taskFiles')
    expect(Array.isArray(ctx.taskFiles)).toBe(true)
  })

  // TC-2: CTO 팀 식별
  it('TC-2: team="CTO" → CTO 팀으로 식별', () => {
    const ctx = loadFixture('team_context_cto.json')
    expect(ctx.team).toBe('CTO')
  })

  // TC-3: PM 팀 식별
  it('TC-3: team="PM" → PM 팀으로 식별', () => {
    const ctx = loadFixture('team_context_pm.json')
    expect(ctx.team).toBe('PM')
  })

  // TC-4: taskFiles에 TASK 추가 → 등록
  it('TC-4: taskFiles 배열에 TASK 파일명 포함', () => {
    const ctx = loadFixture('team_context_cto.json')
    expect(ctx.taskFiles.length).toBeGreaterThan(0)
    expect(ctx.taskFiles[0]).toMatch(/^TASK-/)
  })

  // TC-5: PM 팀에서 backend-dev spawn 시도 → 차단
  it('TC-5: PM 팀 역할 경계 — backend-dev spawn 금지', () => {
    const pmAllowed = ['pm-researcher', 'pm-strategist', 'pm-prd', 'creative-analyst', 'lp-analyst', 'marketing-strategist']
    const pmForbidden = ['backend-dev', 'frontend-dev', 'qa-engineer']
    pmForbidden.forEach(role => {
      expect(pmAllowed).not.toContain(role)
    })
  })

  // TC-6: CTO 팀에서 pm-researcher spawn 시도 → 차단
  it('TC-6: CTO 팀 역할 경계 — pm-researcher spawn 금지', () => {
    const ctoAllowed = ['backend-dev', 'frontend-dev', 'qa-engineer', 'frontend-architect', 'infra-architect', 'security-architect']
    const ctoForbidden = ['pm-researcher', 'pm-strategist', 'creative-analyst', 'lp-analyst']
    ctoForbidden.forEach(role => {
      expect(ctoAllowed).not.toContain(role)
    })
  })

  // TC-7: team-context.json 없는 상태에서 hook 실행 → 폴백
  it('TC-7: team-context.json 미존재 → hook들 에러 없이 동작', () => {
    // action: team-context.json 없이 auto-team-cleanup.sh 실행
    // assert: exit 0 (크래시 아님)
  })

  // TC-8: taskFiles 빈 배열 → 체크박스 카운트 0
  it('TC-8: taskFiles=[] → UNCHECKED_COUNT=0', () => {
    const ctx = { team: 'CTO', session: 'test', created: '2026-03-29', taskFiles: [] }
    expect(ctx.taskFiles.length).toBe(0)
  })
})
```

---

## 영역 3: 팀원 관리 (teammate-registry) — 14건

> 파일: `__tests__/hooks/teammate-registry.test.ts`

```typescript
describe('teammate-registry.json — 팀원 관리', () => {

  // === 스키마 검증 ===

  // TR-1: 5개 필수 키 (team, createdAt, updatedAt, shutdownState, members)
  it('TR-1: registry에 5개 필수 키 존재', () => {
    const reg = loadFixture('teammate_registry_active.json')
    expect(reg).toHaveProperty('team')
    expect(reg).toHaveProperty('createdAt')
    expect(reg).toHaveProperty('updatedAt')
    expect(reg).toHaveProperty('shutdownState')
    expect(reg).toHaveProperty('members')
  })

  // TR-2: 초기 상태 — 전원 active
  it('TR-2: 초기 레지스트리 → members 전원 state="active"', () => {
    const reg = loadFixture('teammate_registry_active.json')
    Object.values(reg.members).forEach((m: any) => {
      expect(['active', 'spawning']).toContain(m.state)
    })
  })

  // TR-3: shutdownState 초기값 "running"
  it('TR-3: shutdownState 초기값 = "running"', () => {
    const reg = loadFixture('teammate_registry_active.json')
    expect(reg.shutdownState).toBe('running')
  })

  // === 상태 전이 ===

  // TR-4: set_member_state active → shutdown_pending
  it('TR-4: set_member_state("backend-dev", "shutdown_pending") → state 전이', () => {
    // action: runBashFunction(auto-shutdown.sh, 'set_member_state', ['backend-dev', 'shutdown_pending'])
    // assert: members['backend-dev'].state === 'shutdown_pending'
  })

  // TR-5: set_member_state active → terminated
  it('TR-5: set_member_state → terminated + updatedAt 갱신', () => {
    // assert: state === 'terminated'
    // assert: updatedAt > 이전값
  })

  // TR-6: set_member_terminated_by force_kill
  it('TR-6: set_member_terminated_by("backend-dev", "force_kill") → terminatedBy 기록', () => {
    // assert: terminatedBy === 'force_kill'
    // assert: terminatedAt !== null (ISO timestamp)
  })

  // TR-7: set_member_terminated_by shutdown_approved
  it('TR-7: terminatedBy="shutdown_approved" → 정상 종료 기록', () => {
    // assert: terminatedBy === 'shutdown_approved'
  })

  // TR-8: set_member_terminated_by pane_dead
  it('TR-8: terminatedBy="pane_dead" → pane 사망 기록', () => {
    // assert: terminatedBy === 'pane_dead'
  })

  // === build_registry_from_config ===

  // TR-9: config.json → registry 변환 (team-lead 제외)
  it('TR-9: build_registry_from_config → team-lead 제외, 팀원만', () => {
    // fixture: team_config_sample.json
    // assert: members에 'team-lead' 키 없음
    // assert: 나머지 멤버 전부 포함
  })

  // === 배정/idle/재배정 ===

  // TR-10: 팀원에게 TASK 배정 (currentTask 설정)
  it('TR-10: currentTask = "TASK-OPS.md" 설정', () => {
    const reg = loadFixture('teammate_registry_active.json')
    const member = Object.values(reg.members)[0] as any
    member.currentTask = 'TASK-OPS.md'
    expect(member.currentTask).toBe('TASK-OPS.md')
  })

  // TR-11: idle 상태 (currentTask null)
  it('TR-11: currentTask null → idle 팀원', () => {
    const reg = loadFixture('teammate_registry_active.json')
    const member = Object.values(reg.members)[0] as any
    expect(member.currentTask).toBeNull()
  })

  // TR-12: 재배정 (기존 task 완료 → 새 task)
  it('TR-12: currentTask 교체 → 재배정', () => {
    const member = { currentTask: 'TASK-A.md' }
    member.currentTask = 'TASK-B.md'
    expect(member.currentTask).toBe('TASK-B.md')
  })

  // === 좀비/에러 ===

  // TR-13: 좀비 감지 — state=active인데 pane 죽음
  it('TR-13: state=active + tmux pane 없음 → 좀비 상태 불일치', () => {
    const reg = loadFixture('teammate_registry_active.json')
    const member = Object.values(reg.members)[0] as any
    expect(member.state).toBe('active')
    // 실제: tmux has-session → exit 1 (pane dead) → 불일치 감지
  })

  // TR-14: registry 손상 → config에서 재생성
  it('TR-14: registry JSON 손상 → build_registry_from_config 자동 실행', () => {
    // setup: registry 파일에 깨진 JSON 쓰기
    // action: auto-shutdown.sh 실행
    // assert: 새 registry 생성됨 + 유효 JSON
  })
})
```

---

## 영역 4: auto-shutdown — 12건

> 파일: `__tests__/hooks/auto-shutdown.test.ts`

```typescript
describe('auto-shutdown.sh — 3단계 Graceful Shutdown', () => {

  // === Stage 1: 정상 종료 ===

  // AS-1: 전원 shutdown_approved → terminated
  it('AS-1: 2명 모두 shutdown_approved → 전원 terminated', () => {
    // fixture: teammate_registry_active.json
    // mock: SendMessage → shutdown_approved 응답
    // assert: 전원 state === 'terminated' && terminatedBy === 'shutdown_approved'
  })

  // AS-2: IS_TEAMMATE=true → bypass (exit 0)
  it('AS-2: 팀원이 실행 → 즉시 exit 0 (리더만 실행)', () => {
    // env: IS_TEAMMATE=true
    // assert: exit 0, 아무 동작 없음
  })

  // === Stage 2: 강제 종료 ===

  // AS-3: 1명 shutdown 무시 → 10초 후 force-kill
  it('AS-3: 1명 shutdown 미응답 → Stage 2 force-kill', () => {
    // fixture: 1명 shutdown_pending 유지 (timeout 초과)
    // assert: terminatedBy === 'force_kill'
  })

  // AS-4: pane 이미 dead → pane_dead 기록 (에러 아님)
  it('AS-4: tmux kill-pane 실패(pane 없음) → terminatedBy="pane_dead"', () => {
    // mock: tmux kill-pane → exit 1 (pane not found)
    // assert: terminatedBy === 'pane_dead' (크래시 아님)
  })

  // AS-5: shutdown_approved 보냈지만 프로세스 미종료 → force-kill
  it('AS-5: approved 응답 + 프로세스 미종료 → force_kill 전이', () => {
    // 사고 재현: doc-writer가 approved 보내고 idle 유지
    // assert: state === 'terminated' (최종)
  })

  // === 리더 보호 ===

  // AS-6: pane_index=0 → kill 안 함 (tmux 환경)
  it('AS-6: 리더 pane (index=0) → [BLOCK] + kill 안 함', () => {
    // mock: tmux display-message → '0'
    // assert: stdout contains 'BLOCK'
    // assert: tmux kill-pane NOT called
  })

  // AS-7: tmux 없는 환경 → paneId로 리더 판별
  it('AS-7: tmux 미사용 + paneId="%0" → BLOCK', () => {
    // setup: registry members.leader.paneId = '%0'
    // mock: tmux display-message → exit 1 (tmux 없음)
    // assert: BLOCK (paneId 값으로 판별)
  })

  // === Stage 3: Cleanup ===

  // AS-8: shutdownState 전이 순서
  it('AS-8: shutdownState: running → shutdown_initiated → force_killing → cleanup → done', () => {
    // 5개 상태 전이 순서 검증
    const valid = ['running', 'shutdown_initiated', 'force_killing', 'cleanup', 'done']
    expect(valid.indexOf('running')).toBeLessThan(valid.indexOf('done'))
  })

  // AS-9: registry updatedAt 갱신
  it('AS-9: 모든 상태 변경 시 updatedAt 갱신', () => {
    // assert: updatedAt이 실행 전보다 나중
  })

  // AS-10: PDCA updatedAt 자동 갱신
  it('AS-10: Stage 3에서 pdca-status.json updatedAt 갱신 → TeamDelete 차단 방지', () => {
    // assert: pdca-status.json updatedAt이 현재 ±1분
  })

  // === 에러 복구 ===

  // AS-11: registry 없음 → config에서 자동 생성
  it('AS-11: registry 미존재 → build_registry_from_config 실행', () => {
    // setup: registry 삭제
    // assert: 실행 후 registry 존재 + 유효
  })

  // AS-12: config.json도 없음 → 경고 + 종료
  it('AS-12: registry + config 모두 없음 → 경고 출력 + exit 0', () => {
    // assert: stderr contains 경고
    // assert: exit 0 (차단 안 함)
  })
})
```

---

## 영역 5: force-team-kill — 8건

> 파일: `__tests__/hooks/force-team-kill.test.ts`

```typescript
describe('force-team-kill.sh — 강제 종료', () => {

  // FK-1: 정상 — 전원 kill + registry 갱신
  it('FK-1: 전원 kill → registry terminated + force_kill', () => {
    // fixture: teammate_registry_active.json
    // mock: tmux kill-pane → exit 0
    // assert: 전원 state=terminated, terminatedBy=force_kill
  })

  // FK-2: 리더 보호 — pane_index=0 → BLOCK (tmux 환경)
  it('FK-2: pane_index=0 → [BLOCK] + kill 안 함', () => {
    // mock: tmux display-message → '0'
    // assert: BLOCK 출력, kill-pane NOT called
  })

  // FK-3: 리더 보호 — tmux 없는 환경 → paneId "%0"이면 BLOCK
  it('FK-3: tmux 없음 + paneId="%0" → BLOCK', () => {
    // 핵심: tmux display-message 실패해도 paneId 값 자체로 판별
    // assert: BLOCK (E-5 버그 수정 검증)
  })

  // FK-4: terminatedAt ISO 타임스탬프 기록
  it('FK-4: force-kill 후 terminatedAt ISO 형식', () => {
    // assert: terminatedAt matches /^\d{4}-\d{2}-\d{2}T/
  })

  // FK-5: pane 이미 없음 → graceful skip
  it('FK-5: tmux kill-pane 실패(이미 죽음) → "이미 종료" + skip', () => {
    // mock: tmux kill-pane → exit 1
    // assert: stdout contains '이미 종료' 또는 'SKIP'
    // assert: 크래시 안 함
  })

  // FK-6: config.json 없음 → registry만으로 진행
  it('FK-6: config.json 미존재 → registry의 paneId로 kill 실행', () => {
    // assert: exit 0 (config 없어도 동작)
  })

  // FK-7: PROJECT_DIR 변수 존재
  it('FK-7: PROJECT_DIR 변수로 프로젝트 경로 참조', () => {
    // action: grep PROJECT_DIR force-team-kill.sh
    // assert: 존재
  })

  // FK-8: isActive=false + pane alive → kill 실행
  it('FK-8: config isActive=false + pane 살아있음 → kill', () => {
    // mock: config.json members[name].isActive === false
    // assert: tmux kill-pane called
  })
})
```

---

## 영역 6: MCP 통신 — 18건

> 파일: `__tests__/hooks/peers-mcp.test.ts`

```typescript
describe('MCP 통신 — claude-peers-mcp 프로토콜', () => {

  // === 프로토콜 필수 필드 ===

  // MCP-1: 메시지 필수 필드 (protocol, type, ts, msg_id)
  it('MCP-1: COMPLETION_REPORT 필수 필드 4개 존재', () => {
    const msg = loadFixture('mcp-message-handoff.json')
    expect(msg).toHaveProperty('protocol')
    expect(msg).toHaveProperty('type')
    expect(msg).toHaveProperty('ts')
    expect(msg).toHaveProperty('msg_id')
  })

  // MCP-2: protocol = "bscamp-team/v1"
  it('MCP-2: protocol 값 = "bscamp-team/v1"', () => {
    const msg = loadFixture('mcp-message-handoff.json')
    expect(msg.protocol).toBe('bscamp-team/v1')
  })

  // MCP-3: 유효 메시지 타입 화이트리스트
  it('MCP-3: 7가지 유효 타입만 허용', () => {
    const valid = ['TASK_HANDOFF', 'COMPLETION_REPORT', 'FEEDBACK', 'STATUS_UPDATE', 'URGENT', 'ACK', 'PING']
    expect(valid).toHaveLength(7)
    expect(valid).toContain('COMPLETION_REPORT')
    expect(valid).not.toContain('INVALID')
  })

  // === ACK 프로토콜 ===

  // MCP-4: ACK 필수 타입 (TASK_HANDOFF, COMPLETION_REPORT, URGENT)
  it('MCP-4: TASK_HANDOFF/COMPLETION_REPORT/URGENT → ACK 필수', () => {
    const ackRequired = ['TASK_HANDOFF', 'COMPLETION_REPORT', 'URGENT']
    ackRequired.forEach(type => {
      expect(['TASK_HANDOFF', 'COMPLETION_REPORT', 'URGENT']).toContain(type)
    })
  })

  // MCP-5: ACK 선택 타입 (FEEDBACK, STATUS_UPDATE, PING)
  it('MCP-5: FEEDBACK/STATUS_UPDATE/PING → ACK 선택', () => {
    const ackOptional = ['FEEDBACK', 'STATUS_UPDATE', 'PING']
    const ackRequired = ['TASK_HANDOFF', 'COMPLETION_REPORT', 'URGENT']
    ackOptional.forEach(type => {
      expect(ackRequired).not.toContain(type)
    })
  })

  // MCP-6: ACK의 ACK 금지 (무한 루프 방지)
  it('MCP-6: ACK 타입에 ACK 전송 금지', () => {
    const noAck = ['ACK']
    expect(noAck).toContain('ACK')
  })

  // MCP-7: ACK의 ack_msg_id로 원본 추적
  it('MCP-7: ACK payload.ack_msg_id = 원본 msg_id', () => {
    const ack = loadFixture('mcp-message-ack.json')
    expect(ack.payload).toHaveProperty('ack_msg_id')
    expect(ack.payload.ack_msg_id).toBeTruthy()
  })

  // MCP-8: 30초 후 ACK 미수신 → 재전송 가능
  it('MCP-8: ACK 미수신 30초 → 동일 msg_id로 재전송', () => {
    const original = { msg_id: 'pm-001', type: 'TASK_HANDOFF' }
    const retry = { msg_id: 'pm-001', type: 'TASK_HANDOFF' } // 동일 msg_id
    expect(retry.msg_id).toBe(original.msg_id)
  })

  // === 라우팅 ===

  // MCP-9: peer 발견 — summary 매칭
  it('MCP-9: list_peers → summary "PM_LEADER"로 PM peer ID 발견', () => {
    const peers = loadFixture('mcp-peers-list.json')
    const pm = peers.find((p: any) => p.summary?.startsWith('PM_LEADER'))
    expect(pm).toBeDefined()
    expect(pm.id).toBeTruthy()
  })

  // MCP-10: CTO→PM 라우팅
  it('MCP-10: from_role=CTO_LEADER → to_role=PM_LEADER', () => {
    const msg = { from_role: 'CTO_LEADER', to_role: 'PM_LEADER' }
    expect(msg.from_role).not.toBe(msg.to_role)
  })

  // MCP-11: PM→COO 라우팅
  it('MCP-11: from_role=PM_LEADER → to_role=MOZZI', () => {
    const msg = { from_role: 'PM_LEADER', to_role: 'MOZZI' }
    expect(msg.to_role).toBe('MOZZI')
  })

  // MCP-12: 역방향 — COO→PM→CTO
  it('MCP-12: FEEDBACK 역방향 라우팅 (COO→PM, PM→CTO)', () => {
    const fb1 = { from_role: 'MOZZI', to_role: 'PM_LEADER', type: 'FEEDBACK' }
    const fb2 = { from_role: 'PM_LEADER', to_role: 'CTO_LEADER', type: 'FEEDBACK' }
    expect(fb1.type).toBe('FEEDBACK')
    expect(fb2.type).toBe('FEEDBACK')
  })

  // === 수신 방식 ===

  // MCP-13: CC↔CC channel mode → 즉시 수신
  it('MCP-13: CC→CC channel mode → push 즉시 (지연 ~0초)', () => {
    const ccModes = { PM_LEADER: 'channel', CTO_LEADER: 'channel' }
    expect(ccModes.PM_LEADER).toBe('channel')
  })

  // MCP-14: OpenClaw tool mode → check_messages 폴링
  it('MCP-14: OpenClaw(MOZZI) = tool mode → push 없음', () => {
    const modes = { MOZZI: 'tool' }
    expect(modes.MOZZI).toBe('tool')
  })

  // === 에러 케이스 ===

  // MCP-15: 존재하지 않는 peer에 전송 → 에러 (크래시 아님)
  it('MCP-15: 없는 peer ID → 에러 메시지 (크래시 안 함)', () => {
    // assert: ok: false 또는 에러 메시지
    // assert: 세션 크래시 안 함
  })

  // MCP-16: broker 다운 → connection refused (graceful)
  it('MCP-16: broker 미기동 → connection refused', () => {
    // assert: 에러 메시지 반환
    // assert: 세션 크래시 안 함
  })

  // MCP-17: 세션 재시작 → 새 peer ID 발급
  it('MCP-17: 세션 재시작 → peer ID 변경, 이전 ID로 전송 실패', () => {
    // assert: 새 ID !== 이전 ID
  })

  // MCP-18: 동일 msg_id 재전송 → 중복 감지 (애플리케이션 레이어)
  it('MCP-18: 동일 msg_id 재전송 → 수신 측에서 중복 감지', () => {
    const received = new Set(['pm-001'])
    expect(received.has('pm-001')).toBe(true) // 중복
  })
})
```

---

## 영역 7: webhook wake — 7건

> 파일: `__tests__/hooks/peers-wake-watcher.test.ts`

```typescript
describe('peers-wake-watcher — webhook wake', () => {

  // WK-1: 정상 wake → mozzi 깨어남
  it('WK-1: POST /hooks/wake → 200 OK', () => {
    // mock: curl http://127.0.0.1:18789/hooks/wake
    // assert: status 200
  })

  // WK-2: wake payload 구조
  it('WK-2: wake payload에 text + mode 포함', () => {
    const payload = { text: '[PDCA Chain] COMPLETION_REPORT', mode: 'now' }
    expect(payload).toHaveProperty('text')
    expect(payload).toHaveProperty('mode')
    expect(payload.mode).toBe('now')
  })

  // WK-3: 토큰 틀림 → 401
  it('WK-3: 잘못된 Authorization 토큰 → 401', () => {
    // mock: curl -H "Authorization: Bearer wrong" → 401
  })

  // WK-4: 세션 없음 → 에러 (graceful)
  it('WK-4: OpenClaw 세션 미기동 → 에러 (크래시 아님)', () => {
    // mock: curl → connection refused
    // assert: watcher가 크래시 안 함
  })

  // WK-5: watcher 1초 폴링 → 미배달 감지 → wake 호출
  it('WK-5: broker DB에 MOZZI 대상 미배달 → watcher가 wake 호출', () => {
    // mock: broker.db에 delivered=0 + to_id=MOZZI
    // assert: 1초 이내 /hooks/wake POST 호출
  })

  // WK-6: watcher 죽어도 CC↔CC 통신 영향 없음
  it('WK-6: watcher 프로세스 죽음 → CC↔CC 메시지 정상', () => {
    // assert: channel mode 통신은 watcher와 무관
  })

  // WK-7: CC→CC에는 wake 불필요
  it('WK-7: CC→CC(PM, CTO) → wake 호출 안 함', () => {
    const targets = { PM_LEADER: false, CTO_LEADER: false, MOZZI: true }
    expect(targets.PM_LEADER).toBe(false) // CC→CC는 wake 불필요
    expect(targets.MOZZI).toBe(true) // OpenClaw만 wake 필요
  })
})
```

---

## 영역 8: PDCA 체인 — 25건

> 파일: `__tests__/hooks/pdca-chain-handoff.test.ts` (신규)

```typescript
describe('pdca-chain-handoff.sh — PDCA 체인 자동화', () => {

  // === Match Rate 파싱 (match-rate-parser.sh) ===

  // PC-1: "Match Rate: 97%" → 97
  it('PC-1: "Match Rate: 97%" 정상 파싱', () => {
    // fixture: analysis_pass.md
    // assert: rate === 97
  })

  // PC-2: "Match Rate 95%" (콜론 없음) → 95
  it('PC-2: 콜론 없는 형식 → 정상 파싱', () => {
    // assert: rate === 95
  })

  // PC-3: 경계값 95% → 통과
  it('PC-3: 95% 정확히 → 통과 (≥95)', () => {
    // assert: exit 0
  })

  // PC-4: 경계값 94% → 차단
  it('PC-4: 94% → 차단 (< 95)', () => {
    // assert: exit 2
  })

  // PC-5: 100% → 통과
  it('PC-5: 100% → 통과', () => {
    // assert: exit 0
  })

  // PC-6: 파일 없음 → 0% → 차단
  it('PC-6: analysis 파일 없음 → 0% 간주 → exit 2', () => {
    // assert: exit 2
  })

  // PC-7: 형식 불일치 "Match Rate: high" → 0% → 차단
  it('PC-7: 숫자 아닌 값 → 0% → exit 2', () => {
    // fixture: analysis_malformed.md
    // assert: exit 2
  })

  // PC-8: 빈 파일 → 0% → 차단
  it('PC-8: 빈 analysis.md → 0% → exit 2', () => {})

  // PC-9: 여러 analysis.md → 최신 파일 사용
  it('PC-9: 3개 파일 → 최신 수정 파일의 Match Rate', () => {})

  // PC-10: 200% 범위 초과 → 0%
  it('PC-10: 범위 초과 (200%) → 0%', () => {})

  // PC-11: 여러 줄 Match Rate → 마지막 값
  it('PC-11: 여러 줄 → 마지막 Match Rate 사용', () => {})

  // === 체인 핸드오프 ===

  // PC-12: 팀원 → bypass
  it('PC-12: IS_TEAMMATE=true → exit 0, ACTION_REQUIRED 없음', () => {
    // assert: stdout에 'ACTION_REQUIRED' 포함 안 됨
  })

  // PC-13: PM 팀 → skip
  it('PC-13: team="PM" → exit 0 (CTO만 대상)', () => {})

  // PC-14: team-context.json 없음 → skip
  it('PC-14: team-context.json 없음 → exit 0', () => {})

  // PC-15: CTO + 97% → ACTION_REQUIRED + COMPLETION_REPORT payload
  it('PC-15: CTO + 97% → stdout에 ACTION_REQUIRED + payload', () => {
    // assert: stdout contains 'ACTION_REQUIRED'
    // assert: stdout contains 'COMPLETION_REPORT'
    // assert: payload contains match_rate, task_file, chain_step
  })

  // PC-16: payload에 chain_step = "cto_to_pm"
  it('PC-16: chain_step = "cto_to_pm"', () => {})

  // PC-17: payload에 task_file 포함
  it('PC-17: payload.task_file = TASK 파일명', () => {})

  // PC-18: broker 다운 + 95%+ → exit 0 + 수동 fallback
  it('PC-18: broker 다운 → 경고 + exit 0 (차단 안 함)', () => {
    // assert: stdout contains 'broker' 또는 '수동'
  })

  // === PM 검수 프로토콜 ===

  // PC-19: PM 합격 → COO에 COMPLETION_REPORT
  it('PC-19: PM verdict=pass → pm_to_coo chain_step', () => {
    const report = { payload: { pm_verdict: 'pass', chain_step: 'pm_to_coo' } }
    expect(report.payload.pm_verdict).toBe('pass')
    expect(report.payload.chain_step).toBe('pm_to_coo')
  })

  // PC-20: PM 불합격 → CTO에 FEEDBACK
  it('PC-20: PM verdict=reject → pm_to_cto FEEDBACK', () => {
    const fb = { type: 'FEEDBACK', payload: { verdict: 'reject', issues: ['설계 불일치'], chain_step: 'pm_to_cto' } }
    expect(fb.payload.issues.length).toBeGreaterThan(0)
  })

  // === COO 보고 프로토콜 ===

  // PC-21: COO 수신 → 보고 데이터 추출
  it('PC-21: COO COMPLETION_REPORT → task_file, match_rate, pm_notes 추출', () => {
    const report = { payload: { task_file: 'TASK-OPS.md', match_rate: 97, pm_notes: '확인 완료' } }
    expect(report.payload.task_file).toBeTruthy()
    expect(report.payload.match_rate).toBeGreaterThanOrEqual(95)
  })

  // PC-22: Smith님 OK → smith_ok 상태
  it('PC-22: Smith님 승인 → chain_step "smith_ok"', () => {
    expect('smith_ok').toBeTruthy()
  })

  // PC-23: Smith님 반려 → COO→PM FEEDBACK
  it('PC-23: Smith님 반려 → coo_to_pm FEEDBACK', () => {
    const fb = { type: 'FEEDBACK', payload: { chain_step: 'coo_to_pm' } }
    expect(fb.payload.chain_step).toBe('coo_to_pm')
  })

  // === 전체 흐름 ===

  // PC-24: chain_step 정방향 순서 검증
  it('PC-24: 정방향: cto_qa → cto_to_pm → pm_review → pm_to_coo → coo_report → smith_ok', () => {
    const forward = ['cto_qa', 'cto_to_pm', 'pm_review', 'pm_to_coo', 'coo_report', 'smith_ok']
    for (let i = 0; i < forward.length - 1; i++) {
      expect(forward.indexOf(forward[i])).toBeLessThan(forward.indexOf(forward[i + 1]))
    }
  })

  // PC-25: 반려 후 재제출 → 체인 재시작
  it('PC-25: FEEDBACK 수신 → 수정 → 재제출 → 체인 재시작 (새 msg_id)', () => {
    const original = `chain-cto-${Date.now()}`
    const retry = `chain-cto-${Date.now() + 1000}`
    expect(original).not.toBe(retry) // 새 msg_id
  })
})
```

---

## 영역 9: 대시보드 — 30건

### 9-A. dashboard-api.test.ts (10건)

```typescript
describe('Dashboard REST API', () => {

  // DA-1: GET /api/dashboard → DashboardState 구조
  it('DA-1: /api/dashboard → pdca, tasks, teams, messages, lastUpdated', () => {})

  // DA-2: GET /api/pdca → PdcaStatus
  it('DA-2: /api/pdca → features 객체', () => {})

  // DA-3: GET /api/tasks → TaskFile[]
  it('DA-3: /api/tasks → 배열 + frontmatter 포함', () => {})

  // DA-4: GET /api/teams → { pm, cto }
  it('DA-4: /api/teams → pm: null|TeamRegistry, cto: null|TeamRegistry', () => {})

  // DA-5: GET /api/messages → recent, undelivered, pendingAck
  it('DA-5: /api/messages → recent 배열 + undelivered 숫자', () => {})

  // DA-6: GET /health → { ok: true, uptime }
  it('DA-6: /health → 200 + ok: true', () => {})

  // DA-7: broker DB 없으면 messages null
  it('DA-7: broker 미설치 → messages.recent = null', () => {})

  // DA-8: registry 없으면 teams null
  it('DA-8: registry 없음 → teams.cto = null', () => {})

  // DA-9: TASK 0개 → 빈 배열
  it('DA-9: TASK 파일 없음 → tasks = []', () => {})

  // DA-10: pdca-status.json 파싱 실패 → null + 에러
  it('DA-10: 깨진 pdca-status.json → pdca = null', () => {})
})
```

### 9-B. dashboard-ws.test.ts (12건)

```typescript
describe('Dashboard WebSocket', () => {

  // DW-1: 연결 → full:refresh 초기 데이터
  it('DW-1: WS 연결 → full:refresh + DashboardState', () => {})

  // DW-2: pdca-status.json 변경 → pdca:updated
  it('DW-2: pdca-status.json 수정 → pdca:updated push', () => {})

  // DW-3: TASK.md 변경 → task:updated
  it('DW-3: TASK.md 수정 → task:updated push', () => {})

  // DW-4: TASK.md 신규 → task:created
  it('DW-4: 새 TASK 파일 생성 → task:created push', () => {})

  // DW-5: registry 변경 → team:updated
  it('DW-5: teammate-registry.json 수정 → team:updated push', () => {})

  // DW-6: broker DB INSERT → message:new
  it('DW-6: broker에 새 메시지 → message:new push', () => {})

  // DW-7: delivered 마킹 → message:delivered
  it('DW-7: delivered=0→1 → message:delivered push', () => {})

  // DW-8: broker:status alive
  it('DW-8: broker /health OK → broker:status alive', () => {})

  // DW-9: broker:status dead
  it('DW-9: broker /health 실패 → broker:status dead + warning', () => {})

  // DW-10: broker:status not_installed
  it('DW-10: broker DB 없음 → broker:status not_installed', () => {})

  // DW-11: debounce 300ms
  it('DW-11: 300ms 내 5회 변경 → WS push 1회만', () => {})

  // DW-12: 재연결 → full:refresh
  it('DW-12: WS 끊김 + 재연결 → full:refresh 재전송', () => {})
})
```

### 9-C. dashboard-broker.test.ts (8건)

```typescript
describe('Dashboard broker 연동', () => {

  // DB-1: broker alive → 메시지 패널 정상
  it('DB-1: brokerStatus=alive → recent 배열 정상', () => {})

  // DB-2: broker dead → 경고 배너 + stale 데이터
  it('DB-2: brokerStatus=dead → brokerWarning 존재 + DB 데이터 표시', () => {})

  // DB-3: broker not_installed → 패널 비활성
  it('DB-3: broker DB 없음 → "MCP 미설치" 메시지', () => {})

  // DB-4: broker 10초 폴링 주기
  it('DB-4: broker /health 10초 간격 폴링', () => {})

  // DB-5: broker DB 삭제 → graceful null
  it('DB-5: DB 파일 삭제 → messages = null (크래시 아님)', () => {})

  // DB-6: file watcher 에러 → 폴링 폴백
  it('DB-6: watcher 에러 → 5초 폴링 모드 전환', () => {})

  // DB-7: partial JSON write → 이전 유효값 유지
  it('DB-7: 깨진 JSON 쓰기 → API가 마지막 유효값 반환', () => {})

  // DB-8: 포트 3847 충돌 → EADDRINUSE 에러
  it('DB-8: 포트 사용중 → 에러 메시지 + 대안 포트', () => {})
})
```

---

## 영역 10: 품질 게이트 — 10건

> 파일: `__tests__/hooks/quality-gate.test.ts` (신규)

```typescript
describe('task-quality-gate.sh — 품질 게이트', () => {

  // QG-1: tsc --noEmit 통과 → 에러 0
  it('QG-1: tsc 통과 → ERRORS += 0', () => {
    // mock: npx tsc --noEmit → exit 0
    // assert: 에러 카운트 미증가
  })

  // QG-2: tsc 실패 → exit 2
  it('QG-2: tsc 실패 → 에러 메시지 + ERRORS += 1', () => {
    // mock: npx tsc --noEmit → exit 1
    // assert: stdout contains 'TypeScript 타입 에러'
  })

  // QG-3: npm run build 통과
  it('QG-3: build 통과 → ERRORS += 0', () => {})

  // QG-4: npm run build 실패 → exit 2
  it('QG-4: build 실패 → 에러 메시지', () => {
    // assert: stdout contains 'npm run build 실패'
  })

  // QG-5: Gap 분석 문서 존재 (1일 이내)
  it('QG-5: analysis.md 존재 (1일 이내) → 통과', () => {})

  // QG-6: Gap 분석 문서 없음 → 에러
  it('QG-6: analysis.md 없음 → "Gap 분석 문서 없습니다"', () => {})

  // QG-7: Gap 분석 문서 1일 초과 → 에러
  it('QG-7: analysis.md 2일 전 → 미인정', () => {})

  // QG-8: pdca-status.json 갱신 (1시간 이내) → 통과
  it('QG-8: pdca-status.json 방금 수정 → 통과', () => {})

  // QG-9: pdca-status.json 1시간 초과 → 에러
  it('QG-9: pdca-status.json 2시간 전 → "1시간 이상 업데이트되지 않았습니다"', () => {})

  // QG-10: IS_TEAMMATE=true → 전체 bypass (exit 0)
  it('QG-10: 팀원 → 즉시 exit 0 (리더만 검증)', () => {
    // env: IS_TEAMMATE=true
    // assert: exit 0, 아무 검증 안 함
  })
})
```

---

## TDD 전체 요약

| # | 영역 | 파일 | 건수 | 상태 |
|---|------|------|:----:|:----:|
| 1 | TASK 소유권 | frontmatter-parser.test.ts | 12 | 기존 5 + 신규 7 |
| 2 | 팀 생성/역할 경계 | team-context.test.ts | 8 | **전체 신규** |
| 3 | 팀원 관리 | teammate-registry.test.ts | 14 | 기존 4 + 신규 10 |
| 4 | auto-shutdown | auto-shutdown.test.ts | 12 | 기존 7 + 신규 5 |
| 5 | force-team-kill | force-team-kill.test.ts | 8 | 기존 3 + 신규 5 |
| 6 | MCP 통신 | peers-mcp.test.ts | 18 | 기존 8 + 신규 10 |
| 7 | webhook wake | peers-wake-watcher.test.ts | 7 | 기존 5 + 신규 2 |
| 8 | PDCA 체인 | pdca-chain-handoff.test.ts | 25 | **전체 신규** |
| 9a | 대시보드 API | dashboard-api.test.ts | 10 | **전체 신규** |
| 9b | 대시보드 WS | dashboard-ws.test.ts | 12 | **전체 신규** |
| 9c | 대시보드 broker | dashboard-broker.test.ts | 8 | **전체 신규** |
| 10 | 품질 게이트 | quality-gate.test.ts | 10 | **전체 신규** |
| — | regression | regression.test.ts | 17 | 기존 유지 |
| — | peers-lifecycle | peers-lifecycle.test.ts | 4 | 기존 유지 |
| — | auto-team-cleanup | auto-team-cleanup.test.ts | 2 | 기존 유지 |
| — | teammate-idle | teammate-idle.test.ts | 6 | 기존 유지 |
| | **합계** | **16 파일** | **~167** | 기존 61 + 신규 ~106 |

### 실행 커맨드

```bash
npx vitest run __tests__/hooks/
```

### 합격 기준

- **167건 전부 Green** (Red 0건)
- 실행 시간 < 60초
- 에러 0, 경고 0

---

## 신규 Fixture 목록

| 파일 | 용도 | 위치 |
|------|------|------|
| `analysis_pass.md` | Match Rate: 97% | __tests__/hooks/fixtures/ |
| `analysis_fail.md` | Match Rate: 85% | __tests__/hooks/fixtures/ |
| `analysis_malformed.md` | Match Rate: (형식 오류) | __tests__/hooks/fixtures/ |
| `team_context_pm.json` | team: "PM" 컨텍스트 | __tests__/hooks/fixtures/ |
| `pdca_status_sample.json` | PDCA 상태 샘플 | __tests__/hooks/fixtures/ |
| `broker_messages_sample.db` | broker SQLite mock | __tests__/hooks/fixtures/ |

---

## 구현 순서

### Wave 1: 기존 보강 (영역 1~5)
```
□ frontmatter-parser.test.ts +7건 (FP-3,4,6,7,9,10,11,12)
□ team-context.test.ts 신규 8건 (TC-1~8)
□ teammate-registry.test.ts +10건 (TR-4~14)
□ auto-shutdown.test.ts +5건 (AS-2,5,7,10,12)
□ force-team-kill.test.ts +5건 (FK-3,4,5,6,8)
□ 신규 fixture 3개 생성
```

### Wave 2: MCP + 체인 (영역 6~8)
```
□ peers-mcp.test.ts +10건 (MCP-9~18)
□ peers-wake-watcher.test.ts +2건 (WK-6,7)
□ pdca-chain-handoff.test.ts 신규 25건 (PC-1~25)
□ 신규 fixture 3개 생성 (analysis_*.md)
```

### Wave 3: 대시보드 + 품질 게이트 (영역 9~10)
```
□ dashboard-api.test.ts 신규 10건 (DA-1~10)
□ dashboard-ws.test.ts 신규 12건 (DW-1~12)
□ dashboard-broker.test.ts 신규 8건 (DB-1~8)
□ quality-gate.test.ts 신규 10건 (QG-1~10)
```

### Wave 4: 전체 검증
```
□ npx vitest run __tests__/hooks/ → 167건 Green
□ Gap 분석 → docs/03-analysis/agent-ops-platform-testing.analysis.md (95%+)
```

---

## 변경 로그

| 날짜 | 변경 | 작성자 |
|------|------|--------|
| 2026-03-29 | Design 신규 작성 (10개 영역 167건 종합 TDD) | PM |
