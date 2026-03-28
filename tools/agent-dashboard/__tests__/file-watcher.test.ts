import { describe, it, expect, vi } from 'vitest'
import { createFileWatcher } from '../lib/file-watcher'
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// sleep 유틸
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('file-watcher', () => {
  // FW-1: 파일 변경 감지 → onChange 콜백 호출
  it('파일 수정 → onChange 콜백 호출', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'fw-test-'))
    const testFile = join(tmpDir, 'test.json')
    writeFileSync(testFile, '{}', 'utf-8')

    const onChange = vi.fn()
    const watcher = createFileWatcher([tmpDir], onChange, { debounce: 100 })
    expect(watcher).not.toBeNull()

    // 파일 변경
    writeFileSync(testFile, '{"updated": true}', 'utf-8')
    await sleep(300)

    expect(onChange).toHaveBeenCalled()

    watcher!.close()
    rmSync(tmpDir, { recursive: true })
  })

  // FW-2: debounce 300ms 내 5회 변경 → 콜백 1회
  it('debounce 내 다중 변경 → 콜백 최소화', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'fw-debounce-'))
    const testFile = join(tmpDir, 'test.json')
    writeFileSync(testFile, '0', 'utf-8')

    const onChange = vi.fn()
    const watcher = createFileWatcher([tmpDir], onChange, { debounce: 300 })
    expect(watcher).not.toBeNull()

    // 빠르게 5회 변경
    for (let i = 1; i <= 5; i++) {
      writeFileSync(testFile, `${i}`, 'utf-8')
    }
    await sleep(600)

    // debounce로 인해 콜백이 5회보다 적게 호출됨
    expect(onChange.mock.calls.length).toBeLessThanOrEqual(2)
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(1)

    watcher!.close()
    rmSync(tmpDir, { recursive: true })
  })

  // FW-3: 없는 경로 → null
  it('없는 경로 → null 반환', () => {
    const onChange = vi.fn()
    const watcher = createFileWatcher(['/nonexistent/path/abc123'], onChange)
    expect(watcher).toBeNull()
  })
})
