// __tests__/hooks/quality-gate.test.ts — task-quality-gate.sh 품질 게이트 테스트 (설계서 영역 10)
// QG-1~10: 10건 전체 신규

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import {
  createTestEnv,
  cleanupTestEnv,
  runHook,
  prepareHookScript,
} from './helpers'

const ORIGINAL_SCRIPT = '/Users/smith/projects/bscamp/.claude/hooks/task-quality-gate.sh'

describe('task-quality-gate.sh — 품질 게이트 (설계서 영역 10)', () => {
  let env: ReturnType<typeof createTestEnv>
  let hookPath: string

  beforeEach(() => {
    env = createTestEnv()
    hookPath = prepareHookScript(ORIGINAL_SCRIPT, env.tmpDir, env.hooksDir)
  })

  afterEach(() => cleanupTestEnv(env.tmpDir))

  // QG-1: tsc --noEmit 통과 → 에러 0 (스크립트에 npx tsc 포함 확인)
  it('QG-1: 스크립트에 tsc --noEmit 체크 포함', () => {
    const content = readFileSync(ORIGINAL_SCRIPT, 'utf-8')
    expect(content).toContain('tsc --noEmit')
  })

  // QG-2: tsc 실패 → "TypeScript 타입 에러" 메시지
  it('QG-2: tsc 실패 시 에러 메시지 형식 확인', () => {
    const content = readFileSync(ORIGINAL_SCRIPT, 'utf-8')
    expect(content).toContain('TypeScript 타입 에러')
  })

  // QG-3: npm run build 통과 체크 포함
  it('QG-3: 스크립트에 npm run build 체크 포함', () => {
    const content = readFileSync(ORIGINAL_SCRIPT, 'utf-8')
    expect(content).toContain('npm run build')
  })

  // QG-4: npm run build 실패 → "npm run build 실패" 메시지
  it('QG-4: build 실패 시 에러 메시지 형식 확인', () => {
    const content = readFileSync(ORIGINAL_SCRIPT, 'utf-8')
    expect(content).toContain('npm run build 실패')
  })

  // QG-5: Gap 분석 문서 존재 확인 (1일 이내)
  it('QG-5: analysis.md 존재 검사 로직 포함 (mtime -1)', () => {
    const content = readFileSync(ORIGINAL_SCRIPT, 'utf-8')
    expect(content).toContain('analysis.md')
    expect(content).toContain('-mtime -1')
  })

  // QG-6: Gap 분석 문서 없음 → "Gap 분석 문서" 에러 메시지
  it('QG-6: analysis.md 없음 → "Gap 분석 문서" 경고 메시지', () => {
    const content = readFileSync(ORIGINAL_SCRIPT, 'utf-8')
    expect(content).toContain('Gap 분석 문서')
  })

  // QG-7: Gap 분석 문서 기한 체크 (1일 이내만 인정)
  it('QG-7: find -mtime -1 로 1일 이내만 인정', () => {
    const content = readFileSync(ORIGINAL_SCRIPT, 'utf-8')
    // find ... -mtime -1 → 1일 이내 파일만 카운트
    expect(content).toMatch(/find.*-mtime -1/)
  })

  // QG-8: pdca-status.json 갱신 확인 (1시간 이내)
  it('QG-8: pdca-status.json 업데이트 시간 체크 (3600초)', () => {
    const content = readFileSync(ORIGINAL_SCRIPT, 'utf-8')
    expect(content).toContain('3600')
    expect(content).toContain('.pdca-status.json')
  })

  // QG-9: pdca-status.json 1시간 초과 → 에러 메시지
  it('QG-9: pdca-status.json 미갱신 → "1시간 이상 업데이트되지 않았습니다"', () => {
    const content = readFileSync(ORIGINAL_SCRIPT, 'utf-8')
    expect(content).toContain('1시간 이상 업데이트되지 않았습니다')
  })

  // QG-10: IS_TEAMMATE=true → 전체 bypass (exit 0)
  it('QG-10: 팀원 → 즉시 exit 0 (리더만 검증)', () => {
    const result = runHook(hookPath, { IS_TEAMMATE: 'true' })
    expect(result.exitCode).toBe(0)
    // 팀원이므로 아무 검증 없이 즉시 통과
  })
})
