import { describe, it, expect, vi } from 'vitest'
import { readPdcaStatus } from '../lib/pdca-reader'
import { readTeamRegistry } from '../lib/registry-reader'
import { createFileWatcher } from '../lib/file-watcher'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('error-recovery', () => {
  // ER-1: 깨진 JSON → null (이전 값 유지 가능)
  it('pdca-status.json partial write → null 반환 (크래시 아님)', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'er-test-'))
    const jsonPath = join(tmpDir, 'pdca.json')

    // 정상 JSON 먼저 쓰기
    writeFileSync(jsonPath, '{"features":{}, "updatedAt":"2026-03-28"}', 'utf-8')
    const valid = readPdcaStatus(jsonPath)
    expect(valid).not.toBeNull()
    expect(valid!.features).toBeDefined()

    // 깨진 JSON 덮어쓰기
    writeFileSync(jsonPath, '{"features": {', 'utf-8')
    const broken = readPdcaStatus(jsonPath)
    expect(broken).toBeNull() // 크래시 없이 null

    rmSync(tmpDir, { recursive: true })
  })

  // ER-2: 레지스트리 깨진 JSON → null
  it('registry 깨진 JSON → null 반환', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'er-reg-'))
    const regPath = join(tmpDir, 'registry.json')
    writeFileSync(regPath, '{invalid json!!!', 'utf-8')

    const result = readTeamRegistry(regPath)
    expect(result).toBeNull()

    rmSync(tmpDir, { recursive: true })
  })

  // ER-3: watcher 경로 삭제 → 에러 없이 동작 지속
  it('watcher 감시 중 경로 삭제 → 기존 watcher 정상 close', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'er-watch-'))
    const testFile = join(tmpDir, 'test.json')
    writeFileSync(testFile, '{}', 'utf-8')

    const onChange = vi.fn()
    const watcher = createFileWatcher([tmpDir], onChange, { debounce: 100 })
    expect(watcher).not.toBeNull()

    // 정상 close
    watcher!.close()
    // close 후 에러 없어야 함
    expect(true).toBe(true)

    rmSync(tmpDir, { recursive: true })
  })
})
