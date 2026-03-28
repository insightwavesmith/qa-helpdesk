import { describe, it, expect } from 'vitest'
import { readPdcaStatus } from '../lib/pdca-reader'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// 실제 프로젝트의 pdca-status.json 경로
const REAL_PDCA_PATH = '/Users/smith/projects/bscamp/docs/.pdca-status.json'

describe('pdca-reader', () => {
  // PR-1: 정상 파싱 → features 포함
  it('pdca-status.json 정상 파싱 → PdcaStatus 타입', () => {
    const status = readPdcaStatus(REAL_PDCA_PATH)
    // 실제 파일이 있어야 통과
    expect(status).not.toBeNull()
    expect(status!.features).toBeDefined()
    expect(typeof status!.features).toBe('object')
    // 실제 피처 중 하나 확인
    expect(status!.features['agent-ops-dashboard']).toBeDefined()
    expect(status!.updatedAt).toBeDefined()
  })

  // PR-2: 파일 없음 → null
  it('파일 없음 → null 반환 (크래시 아님)', () => {
    const status = readPdcaStatus('/nonexistent/path/pdca-status.json')
    expect(status).toBeNull()
  })

  // PR-3: 잘못된 JSON → null
  it('잘못된 JSON → null', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'pdca-test-'))
    const invalidPath = join(tmpDir, 'invalid.json')
    writeFileSync(invalidPath, '{ this is not valid json !!!', 'utf-8')

    const status = readPdcaStatus(invalidPath)
    expect(status).toBeNull()

    // 정리
    rmSync(tmpDir, { recursive: true })
  })

  // PR-4: matchRate 숫자/null 검증
  it('matchRate가 숫자면 그대로, null이면 null', () => {
    const status = readPdcaStatus(REAL_PDCA_PATH)
    expect(status).not.toBeNull()

    // slack-notification: matchRate가 null
    const slack = status!.features['slack-notification']
    expect(slack.check.matchRate).toBeNull()

    // agent-team-operations: matchRate가 95 (숫자)
    const ops = status!.features['agent-team-operations']
    expect(ops.check.matchRate).toBe(95)
    expect(typeof ops.check.matchRate).toBe('number')
  })
})
