import { describe, it, expect } from 'vitest'
import { readTeamRegistry } from '../lib/registry-reader'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// 실제 레지스트리 경로
const REAL_REGISTRY = '/Users/smith/projects/bscamp/.claude/runtime/teammate-registry.json'

// 테스트용 fixture
const MOCK_REGISTRY = {
  teamName: 'CTO',
  members: {
    'backend-dev': { state: 'active', name: 'backend-dev', role: 'backend-dev', model: 'claude-opus-4-6', paneId: '%10' },
    'frontend-dev': { state: 'active', name: 'frontend-dev', role: 'frontend-dev', model: 'claude-opus-4-6', paneId: '%11' },
    'qa-engineer': { state: 'terminated', name: 'qa-engineer', role: 'qa-engineer', model: 'claude-sonnet-4-6', paneId: '%12', terminatedAt: '2026-03-28T20:00:00' },
  },
  updatedAt: '2026-03-28T20:05:00',
}

describe('registry-reader', () => {
  // RR-1: 정상 파싱
  it('teammate-registry.json 파싱 → 팀 이름 + 멤버 포함', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'rr-test-'))
    const regPath = join(tmpDir, 'registry.json')
    writeFileSync(regPath, JSON.stringify(MOCK_REGISTRY), 'utf-8')

    const registry = readTeamRegistry(regPath)
    expect(registry).not.toBeNull()
    expect(registry.teamName).toBe('CTO')
    expect(registry.members).toBeDefined()
    expect(Object.keys(registry.members)).toHaveLength(3)
    expect(registry.members['backend-dev'].state).toBe('active')
    expect(registry.members['qa-engineer'].state).toBe('terminated')

    rmSync(tmpDir, { recursive: true })
  })

  // RR-2: 파일 없음
  it('registry 파일 없음 → null (크래시 아님)', () => {
    const registry = readTeamRegistry('/nonexistent/registry.json')
    expect(registry).toBeNull()
  })

  // RR-3: 상태별 카운트
  it('active/terminated 상태별 카운트 정확', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'rr-count-'))
    const regPath = join(tmpDir, 'registry.json')
    writeFileSync(regPath, JSON.stringify(MOCK_REGISTRY), 'utf-8')

    const registry = readTeamRegistry(regPath)
    const members = Object.values(registry.members) as any[]
    const activeCount = members.filter((m: any) => m.state === 'active').length
    const terminatedCount = members.filter((m: any) => m.state === 'terminated').length
    expect(activeCount).toBe(2)
    expect(terminatedCount).toBe(1)

    rmSync(tmpDir, { recursive: true })
  })
})
