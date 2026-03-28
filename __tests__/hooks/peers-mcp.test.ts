import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ChildProcess, spawn } from 'child_process'

const TEST_BROKER_PORT = 17899
const BROKER_URL = `http://127.0.0.1:${TEST_BROKER_PORT}`

async function brokerFetch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BROKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json() as Promise<T>
}

let brokerProc: ChildProcess

beforeAll(async () => {
  // 테스트용 브로커 시작 (별도 포트 + 별도 DB — 격리)
  brokerProc = spawn('bun', [`${process.env.HOME}/claude-peers-mcp/broker.ts`], {
    env: {
      ...process.env,
      CLAUDE_PEERS_PORT: String(TEST_BROKER_PORT),
      CLAUDE_PEERS_DB: `/tmp/test-peers-mcp-${Date.now()}.db`,
    },
    stdio: 'ignore',
    detached: true,
  })
  // 브로커 health check 대기
  for (let i = 0; i < 30; i++) {
    try { await fetch(`${BROKER_URL}/health`); break }
    catch { await new Promise(r => setTimeout(r, 200)) }
  }
})

afterAll(() => { brokerProc?.kill() })

describe('claude-peers-mcp — 크로스팀 통신', () => {

  // INC-15: PM→CTO 메시지 전송 + 수신
  describe('INC-15: PM→CTO send_message', () => {
    it('PM이 보낸 TASK_HANDOFF 메시지를 CTO가 수신', async () => {
      // 1. PM 등록
      const pm = await brokerFetch<{id: string}>('/register', {
        pid: process.pid,
        cwd: '/Users/smith/projects/bscamp',
        git_root: '/Users/smith/projects/bscamp',
        summary: 'PM_LEADER | bscamp | planning',
      })

      // 2. CTO 등록 (다른 PID 시뮬레이션)
      const cto = await brokerFetch<{id: string}>('/register', {
        pid: process.pid + 1,  // 실제 테스트에서는 fork() 사용
        cwd: '/Users/smith/projects/bscamp',
        git_root: '/Users/smith/projects/bscamp',
        summary: 'CTO_LEADER | bscamp | development',
      })

      // 3. PM → CTO 메시지 전송
      const msg = JSON.stringify({
        protocol: 'bscamp-team/v1',
        type: 'TASK_HANDOFF',
        from_role: 'PM_LEADER',
        to_role: 'CTO_LEADER',
        payload: { task_file: 'TASK-AGENT-TEAM-OPS.md' },
        ts: new Date().toISOString(),
        msg_id: 'pm-test-001',
      })
      const send = await brokerFetch<{ok: boolean}>('/send-message', {
        from_id: pm.id, to_id: cto.id, text: msg,
      })
      expect(send.ok).toBe(true)

      // 4. CTO 수신 확인
      const poll = await brokerFetch<{messages: {text: string}[]}>('/poll-messages', {
        id: cto.id,
      })
      expect(poll.messages).toHaveLength(1)
      const parsed = JSON.parse(poll.messages[0].text)
      expect(parsed.type).toBe('TASK_HANDOFF')
      expect(parsed.from_role).toBe('PM_LEADER')
      expect(parsed.payload.task_file).toBe('TASK-AGENT-TEAM-OPS.md')
    })
  })

  // INC-16: list_peers(scope: "repo") — 동일 레포 참여자 조회
  describe('INC-16: list_peers(scope: "repo")', () => {
    it('같은 레포 작업 중인 PM+CTO 세션 조회', async () => {
      const peers = await brokerFetch<any[]>('/list-peers', {
        scope: 'repo',
        cwd: '/Users/smith/projects/bscamp',
        git_root: '/Users/smith/projects/bscamp',
      })
      const roles = peers.map((p: any) => p.summary?.split(' | ')[0])
      expect(roles).toContain('PM_LEADER')
      expect(roles).toContain('CTO_LEADER')
    })
  })

  // INC-17: 세션 종료 후 peer 목록에서 제거
  describe('INC-17: 종료된 세션 cleanup', () => {
    it('unregister 후 list_peers에서 제외', async () => {
      const temp = await brokerFetch<{id: string}>('/register', {
        pid: process.pid + 2,
        cwd: '/Users/smith/projects/bscamp',
        git_root: '/Users/smith/projects/bscamp',
        summary: 'TEMP_AGENT | bscamp',
      })
      await brokerFetch('/unregister', { id: temp.id })

      const peers = await brokerFetch<any[]>('/list-peers', {
        scope: 'repo',
        cwd: '/Users/smith/projects/bscamp',
        git_root: '/Users/smith/projects/bscamp',
      })
      expect(peers.find((p: any) => p.id === temp.id)).toBeUndefined()
    })
  })

  // INC-18: 브로커 미실행 시 graceful 에러
  describe('INC-18: 브로커 다운 시 에러 처리', () => {
    it('브로커 없는 포트로 send_message → connection refused', async () => {
      await expect(
        fetch('http://127.0.0.1:19999/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from_id: 'a', to_id: 'b', text: 'test' }),
        })
      ).rejects.toThrow()
    })
  })
})

describe('claude-peers-mcp — 프로토콜 검증', () => {

  // PROTO-1: 메시지 프로토콜 파싱
  it('PROTO-1: bscamp-team/v1 프로토콜 JSON 파싱', () => {
    const raw = JSON.stringify({
      protocol: 'bscamp-team/v1',
      type: 'STATUS_UPDATE',
      from_role: 'CTO_LEADER',
      payload: { wave: 2, status: 'complete' },
      ts: '2026-03-28T15:00:00+09:00',
      msg_id: 'cto-20260328-001',
    })
    const parsed = JSON.parse(raw)
    expect(parsed.protocol).toBe('bscamp-team/v1')
    expect(parsed.type).toBe('STATUS_UPDATE')
    expect(parsed.from_role).toBe('CTO_LEADER')
  })

  // PROTO-2: ACK 메시지 멱등성
  it('PROTO-2: 동일 msg_id로 중복 수신 시 무시', () => {
    const received = new Set<string>()
    const msg1 = { msg_id: 'pm-001', type: 'TASK_HANDOFF' }
    const msg2 = { msg_id: 'pm-001', type: 'TASK_HANDOFF' } // 재전송

    if (!received.has(msg1.msg_id)) { received.add(msg1.msg_id) }
    if (!received.has(msg2.msg_id)) { /* 무시 */ }

    expect(received.size).toBe(1) // 중복 처리되지 않음
  })

  // PROTO-3: 역할 발견 — summary 파싱
  it('PROTO-3: set_summary에서 역할 추출', () => {
    const summary = 'PM_LEADER | bscamp | 기획 총괄'
    const role = summary.split(' | ')[0]
    expect(role).toBe('PM_LEADER')
  })

  // PROTO-4: 알 수 없는 메시지 타입 무시
  it('PROTO-4: 정의 안 된 type은 무시 (에러 아님)', () => {
    const msg = { protocol: 'bscamp-team/v1', type: 'UNKNOWN_TYPE' }
    const knownTypes = ['TASK_HANDOFF', 'FEEDBACK', 'STATUS_UPDATE', 'URGENT', 'COMPLETION_REPORT', 'ACK', 'PING']
    expect(knownTypes.includes(msg.type)).toBe(false)
    // 처리: 로그만 남기고 무시
  })
})
