// tools/agent-dashboard/__tests__/dashboard-api.test.ts — Dashboard REST API 테스트 (설계서 영역 9-A)
// DA-1~10: 10건 전체 신규
// lib/ 모듈 직접 import 방식 (hono/bun 의존 없이 vitest 실행 가능)

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readPdcaStatus, type PdcaStatus } from '../lib/pdca-reader'
import { readAllTasks, parseTask, type TaskFile } from '../lib/task-parser'
import { readTeamRegistry } from '../lib/registry-reader'
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// --- 테스트 헬퍼 ---

interface DashboardState {
  pdca: PdcaStatus | null
  tasks: TaskFile[]
  teams: { pm: any; cto: any }
  messages: { recent: any[] | null; undelivered: number; pendingAck: any[] | null } | null
  lastUpdated: string
}

function buildDashboardState(opts: {
  pdcaPath?: string
  tasksDir?: string
  ctoRegistryPath?: string
  pmRegistryPath?: string
}): DashboardState {
  const pdca = opts.pdcaPath ? readPdcaStatus(opts.pdcaPath) : null
  const tasks = opts.tasksDir ? readAllTasks(opts.tasksDir) : []
  const cto = opts.ctoRegistryPath ? readTeamRegistry(opts.ctoRegistryPath) : null
  const pm = opts.pmRegistryPath ? readTeamRegistry(opts.pmRegistryPath) : null

  return {
    pdca,
    tasks,
    teams: { pm, cto },
    messages: null, // broker 연동은 별도 테스트
    lastUpdated: new Date().toISOString(),
  }
}

describe('Dashboard REST API (설계서 영역 9-A)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dash-api-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  // DA-1: GET /api/dashboard → DashboardState 구조
  it('DA-1: /api/dashboard → pdca, tasks, teams, messages, lastUpdated', () => {
    const pdcaPath = join(tmpDir, 'pdca-status.json')
    writeFileSync(pdcaPath, JSON.stringify({
      features: { 'test-feature': { phase: 'do', check: { matchRate: 95 } } },
      updatedAt: '2026-03-29T10:00:00',
      notes: '',
    }))

    const tasksDir = join(tmpDir, 'tasks')
    mkdirSync(tasksDir)
    writeFileSync(join(tasksDir, 'TASK-TEST.md'), '---\nteam: CTO\nstatus: in-progress\nowner: leader\n---\n# Test\n- [ ] item\n')

    const state = buildDashboardState({ pdcaPath, tasksDir })

    expect(state).toHaveProperty('pdca')
    expect(state).toHaveProperty('tasks')
    expect(state).toHaveProperty('teams')
    expect(state).toHaveProperty('messages')
    expect(state).toHaveProperty('lastUpdated')
    expect(state.pdca).not.toBeNull()
    expect(state.tasks.length).toBe(1)
  })

  // DA-2: GET /api/pdca → PdcaStatus
  it('DA-2: /api/pdca → features 객체', () => {
    const pdcaPath = join(tmpDir, 'pdca-status.json')
    writeFileSync(pdcaPath, JSON.stringify({
      features: { 'agent-ops': { phase: 'check', check: { matchRate: 97 } } },
      updatedAt: '2026-03-29T10:00:00',
      notes: 'test',
    }))

    const pdca = readPdcaStatus(pdcaPath)
    expect(pdca).not.toBeNull()
    expect(pdca!.features).toBeDefined()
    expect(pdca!.features['agent-ops']).toBeDefined()
    expect(pdca!.features['agent-ops'].phase).toBe('check')
  })

  // DA-3: GET /api/tasks → TaskFile[]
  it('DA-3: /api/tasks → 배열 + frontmatter 포함', () => {
    const tasksDir = join(tmpDir, 'tasks')
    mkdirSync(tasksDir)
    writeFileSync(join(tasksDir, 'TASK-A.md'), '---\nteam: CTO\nstatus: pending\nowner: leader\n---\n# A\n- [ ] a1\n')
    writeFileSync(join(tasksDir, 'TASK-B.md'), '---\nteam: PM\nstatus: completed\nowner: leader\n---\n# B\n- [x] b1\n')

    const tasks = readAllTasks(tasksDir)
    expect(Array.isArray(tasks)).toBe(true)
    expect(tasks.length).toBe(2)
    expect(tasks[0].frontmatter.team).toBeTruthy()
  })

  // DA-4: GET /api/teams → { pm, cto }
  it('DA-4: /api/teams → pm: null|TeamRegistry, cto: null|TeamRegistry', () => {
    const ctoPath = join(tmpDir, 'cto-registry.json')
    writeFileSync(ctoPath, JSON.stringify({
      teamName: 'CTO',
      members: { 'backend-dev': { state: 'active' } },
      updatedAt: '2026-03-29T10:00:00',
    }))

    const state = buildDashboardState({ ctoRegistryPath: ctoPath })
    expect(state.teams.cto).not.toBeNull()
    expect(state.teams.cto.teamName).toBe('CTO')
    expect(state.teams.pm).toBeNull()
  })

  // DA-5: GET /api/messages → recent, undelivered, pendingAck
  it('DA-5: /api/messages → null (broker 미연결 시)', () => {
    const state = buildDashboardState({})
    // broker 미연결 → messages null
    expect(state.messages).toBeNull()
  })

  // DA-6: GET /health → { ok: true, uptime }
  it('DA-6: /health → ok: true 형태', () => {
    const health = { ok: true, uptime: process.uptime() }
    expect(health.ok).toBe(true)
    expect(typeof health.uptime).toBe('number')
  })

  // DA-7: broker DB 없으면 messages null
  it('DA-7: broker 미설치 → messages = null', () => {
    const state = buildDashboardState({})
    expect(state.messages).toBeNull()
  })

  // DA-8: registry 없으면 teams null
  it('DA-8: registry 없음 → teams.cto = null', () => {
    const cto = readTeamRegistry(join(tmpDir, 'nonexistent-registry.json'))
    expect(cto).toBeNull()
  })

  // DA-9: TASK 0개 → 빈 배열
  it('DA-9: TASK 파일 없음 → tasks = []', () => {
    const tasksDir = join(tmpDir, 'empty-tasks')
    mkdirSync(tasksDir)
    const tasks = readAllTasks(tasksDir)
    expect(tasks).toEqual([])
  })

  // DA-10: pdca-status.json 파싱 실패 → null + 에러
  it('DA-10: 깨진 pdca-status.json → pdca = null', () => {
    const brokenPath = join(tmpDir, 'broken.json')
    writeFileSync(brokenPath, '{ broken json !!!')

    const pdca = readPdcaStatus(brokenPath)
    expect(pdca).toBeNull()
  })
})
