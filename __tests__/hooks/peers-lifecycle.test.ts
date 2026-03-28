import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ChildProcess, spawn } from 'child_process'

const TEST_BROKER_PORT = 17898
const BROKER_URL = `http://127.0.0.1:${TEST_BROKER_PORT}`

async function brokerFetch<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(`${BROKER_URL}${path}`, {
    method: method ?? 'POST',
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
      CLAUDE_PEERS_DB: `/tmp/test-peers-lifecycle-${Date.now()}.db`,
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

describe('claude-peers-mcp — 세션 생명주기', () => {

  // LIFE-1: 세션 시작 시 자동 등록 + summary 설정
  it('LIFE-1: register + set_summary 시퀀스', async () => {
    // broker는 summary NOT NULL — register 시 포함 필수
    const reg = await brokerFetch<{id: string}>('/register', {
      pid: process.pid,
      cwd: '/Users/smith/projects/bscamp',
      git_root: '/Users/smith/projects/bscamp',
      summary: 'CTO_LEADER | bscamp | initial',
    })
    expect(reg.id).toHaveLength(8)

    // set_summary로 업데이트
    await brokerFetch('/set-summary', {
      id: reg.id,
      summary: 'CTO_LEADER | bscamp | testing',
    })

    const peers = await brokerFetch<any[]>('/list-peers', {
      scope: 'repo',
      cwd: '/Users/smith/projects/bscamp',
      git_root: '/Users/smith/projects/bscamp',
    })
    const me = peers.find((p: any) => p.id === reg.id)
    expect(me.summary).toContain('CTO_LEADER')
  })

  // LIFE-2: 메시지 to self 허용 (오류 아님)
  it('LIFE-2: 자기 자신에게 메시지 전송 가능', async () => {
    const self = await brokerFetch<{id: string}>('/register', {
      pid: process.pid + 3,
      cwd: '/Users/smith/projects/bscamp',
      git_root: '/Users/smith/projects/bscamp',
      summary: 'SELF_TEST | bscamp | self-message',
    })
    await brokerFetch('/send-message', {
      from_id: self.id, to_id: self.id, text: 'self-test',
    })
    const poll = await brokerFetch<{messages: any[]}>('/poll-messages', { id: self.id })
    expect(poll.messages).toHaveLength(1)
  })

  // LIFE-3: 존재하지 않는 peer에 메시지 → 에러
  it('LIFE-3: 존재하지 않는 peer에 전송 → ok: false', async () => {
    const sender = await brokerFetch<{id: string}>('/register', {
      pid: process.pid + 4,
      cwd: '/Users/smith/projects/bscamp',
      git_root: '/Users/smith/projects/bscamp',
      summary: 'SENDER_TEST | bscamp | error-test',
    })
    const result = await brokerFetch<{ok: boolean, error?: string}>('/send-message', {
      from_id: sender.id, to_id: 'nonexist', text: 'test',
    })
    expect(result.ok).toBe(false)
  })

  // LIFE-4: 브로커 health check (GET 전용)
  it('LIFE-4: /health 엔드포인트 응답', async () => {
    const health = await brokerFetch<{peers: number}>('/health', undefined, 'GET')
    expect(health.peers).toBeGreaterThanOrEqual(0)
  })
})
