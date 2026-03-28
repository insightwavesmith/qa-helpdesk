import { describe, it, expect } from 'vitest'
import { checkBrokerHealth, getBrokerWarning } from '../lib/broker-health'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('broker-health', () => {
  // BH-1: DB 없음 → not_installed
  it('DB 파일 없음 → not_installed', async () => {
    const status = await checkBrokerHealth('/nonexistent/peers.db', 'http://localhost:19999/health')
    expect(status).toBe('not_installed')
  })

  // BH-2: DB 있지만 health 실패 → dead
  it('DB 있고 health 응답 실패 → dead', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'bh-test-'))
    const dbPath = join(tmpDir, 'peers.db')
    writeFileSync(dbPath, '', 'utf-8') // 더미 파일

    const status = await checkBrokerHealth(dbPath, 'http://127.0.0.1:19999/health')
    expect(status).toBe('dead')

    rmSync(tmpDir, { recursive: true })
  })

  // BH-3: dead 상태 → 경고 메시지 포함
  it('dead 상태 → 경고 메시지에 broker 포함', () => {
    const warning = getBrokerWarning('dead')
    expect(warning).toBeDefined()
    expect(warning).toContain('broker')
  })

  // BH-4: alive/not_installed → 경고 없음
  it('alive/not_installed → 경고 메시지 undefined', () => {
    expect(getBrokerWarning('alive')).toBeUndefined()
    expect(getBrokerWarning('not_installed')).toBeUndefined()
  })
})
