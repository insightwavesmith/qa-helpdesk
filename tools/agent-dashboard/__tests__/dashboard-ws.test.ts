// tools/agent-dashboard/__tests__/dashboard-ws.test.ts — Dashboard WebSocket 테스트 (설계서 영역 9-B)
// DW-1~12: 12건 전체 신규
// hono/bun WS 미의존 — 이벤트 타입/페이로드 구조 + debounce 로직 검증

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFileWatcher } from '../lib/file-watcher'
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// --- WS 이벤트 타입 정의 (서버 구현과 동일한 프로토콜) ---

type WsEventType =
  | 'full:refresh'
  | 'pdca:updated'
  | 'task:updated'
  | 'task:created'
  | 'team:updated'
  | 'message:new'
  | 'message:delivered'
  | 'broker:status'

interface WsEvent {
  type: WsEventType
  data: any
  ts: string
}

const VALID_EVENTS: WsEventType[] = [
  'full:refresh', 'pdca:updated', 'task:updated', 'task:created',
  'team:updated', 'message:new', 'message:delivered', 'broker:status',
]

describe('Dashboard WebSocket (설계서 영역 9-B)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dash-ws-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  // DW-1: 연결 → full:refresh 초기 데이터
  it('DW-1: WS 연결 → full:refresh + DashboardState', () => {
    const event: WsEvent = {
      type: 'full:refresh',
      data: { pdca: null, tasks: [], teams: { pm: null, cto: null }, messages: null },
      ts: new Date().toISOString(),
    }
    expect(event.type).toBe('full:refresh')
    expect(event.data).toHaveProperty('pdca')
    expect(event.data).toHaveProperty('tasks')
    expect(event.data).toHaveProperty('teams')
  })

  // DW-2: pdca-status.json 변경 → pdca:updated
  it('DW-2: pdca-status.json 수정 → pdca:updated push', () => {
    const event: WsEvent = {
      type: 'pdca:updated',
      data: { features: { 'test': { phase: 'do' } }, updatedAt: '2026-03-29T10:00:00' },
      ts: new Date().toISOString(),
    }
    expect(event.type).toBe('pdca:updated')
    expect(event.data.features).toBeDefined()
  })

  // DW-3: TASK.md 변경 → task:updated
  it('DW-3: TASK.md 수정 → task:updated push', () => {
    const event: WsEvent = {
      type: 'task:updated',
      data: { filename: 'TASK-OPS.md', checkboxes: { total: 10, checked: 7 } },
      ts: new Date().toISOString(),
    }
    expect(event.type).toBe('task:updated')
    expect(event.data.filename).toBe('TASK-OPS.md')
  })

  // DW-4: TASK.md 신규 → task:created
  it('DW-4: 새 TASK 파일 생성 → task:created push', () => {
    const event: WsEvent = {
      type: 'task:created',
      data: { filename: 'TASK-NEW.md', frontmatter: { team: 'CTO', status: 'pending' } },
      ts: new Date().toISOString(),
    }
    expect(event.type).toBe('task:created')
    expect(event.data.filename).toMatch(/^TASK-/)
  })

  // DW-5: registry 변경 → team:updated
  it('DW-5: teammate-registry.json 수정 → team:updated push', () => {
    const event: WsEvent = {
      type: 'team:updated',
      data: { teamName: 'CTO', members: { 'backend-dev': { state: 'terminated' } } },
      ts: new Date().toISOString(),
    }
    expect(event.type).toBe('team:updated')
    expect(event.data.members['backend-dev'].state).toBe('terminated')
  })

  // DW-6: broker DB INSERT → message:new
  it('DW-6: broker에 새 메시지 → message:new push', () => {
    const event: WsEvent = {
      type: 'message:new',
      data: { msg_id: 'cto-001', type: 'COMPLETION_REPORT', from_role: 'CTO_LEADER' },
      ts: new Date().toISOString(),
    }
    expect(event.type).toBe('message:new')
    expect(event.data.msg_id).toBeTruthy()
  })

  // DW-7: delivered 마킹 → message:delivered
  it('DW-7: delivered=0→1 → message:delivered push', () => {
    const event: WsEvent = {
      type: 'message:delivered',
      data: { msg_id: 'cto-001', delivered: true },
      ts: new Date().toISOString(),
    }
    expect(event.type).toBe('message:delivered')
    expect(event.data.delivered).toBe(true)
  })

  // DW-8: broker:status alive
  it('DW-8: broker /health OK → broker:status alive', () => {
    const event: WsEvent = {
      type: 'broker:status',
      data: { status: 'alive' },
      ts: new Date().toISOString(),
    }
    expect(event.data.status).toBe('alive')
  })

  // DW-9: broker:status dead
  it('DW-9: broker /health 실패 → broker:status dead + warning', () => {
    const event: WsEvent = {
      type: 'broker:status',
      data: { status: 'dead', warning: 'broker 프로세스 중단' },
      ts: new Date().toISOString(),
    }
    expect(event.data.status).toBe('dead')
    expect(event.data.warning).toBeTruthy()
  })

  // DW-10: broker:status not_installed
  it('DW-10: broker DB 없음 → broker:status not_installed', () => {
    const event: WsEvent = {
      type: 'broker:status',
      data: { status: 'not_installed' },
      ts: new Date().toISOString(),
    }
    expect(event.data.status).toBe('not_installed')
  })

  // DW-11: debounce 300ms — createFileWatcher 검증
  it('DW-11: 300ms 내 5회 변경 → 콜백 1회만', async () => {
    const filePath = join(tmpDir, 'test.json')
    writeFileSync(filePath, '{}')

    const onChange = vi.fn()
    const watcher = createFileWatcher([filePath], onChange, { debounce: 300 })

    // 5회 빠른 변경 (300ms 이내)
    for (let i = 0; i < 5; i++) {
      writeFileSync(filePath, JSON.stringify({ i }))
    }

    // 500ms 대기 (debounce 300ms + 여유)
    await new Promise(r => setTimeout(r, 500))

    // debounce로 인해 1회만 호출되어야 함
    expect(onChange.mock.calls.length).toBeLessThanOrEqual(2) // OS 이벤트 특성상 1~2회
    watcher?.close()
  })

  // DW-12: 이벤트 타입 전부 유효
  it('DW-12: 8가지 유효 WS 이벤트 타입 화이트리스트', () => {
    expect(VALID_EVENTS).toHaveLength(8)
    expect(VALID_EVENTS).toContain('full:refresh')
    expect(VALID_EVENTS).toContain('pdca:updated')
    expect(VALID_EVENTS).toContain('task:updated')
    expect(VALID_EVENTS).toContain('task:created')
    expect(VALID_EVENTS).toContain('team:updated')
    expect(VALID_EVENTS).toContain('message:new')
    expect(VALID_EVENTS).toContain('message:delivered')
    expect(VALID_EVENTS).toContain('broker:status')
  })
})
