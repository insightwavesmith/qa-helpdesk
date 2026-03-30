// __tests__/hooks/regression.test.ts
// REGRESSION TESTS — 실제 겪은 버그를 테스트로 문서화
//
// REG-1: settings에 등록된 hook 파일 실제 존재 여부 (notify-openclaw.sh 사건)
// REG-2: permissionMode가 settings.local.json 최상위에 있는지 (중첩 시 동작 안 함)
// REG-3: settings.json hooks 섹션 비어있는지 (settings.local.json과 충돌 방지)
// REG-4: teammate-idle 타 팀 TASK 배정 안 하는지 (크로스팀 오배정 사건)
// REG-5: TASK 프론트매터에 team 필드 있는지 (소유권 필터링 전제 조건)

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createTestEnv, runHook, cleanupTestEnv, prepareHookScript } from './helpers'

const PROJECT_DIR = '/Users/smith/projects/bscamp'
const SETTINGS_LOCAL = join(PROJECT_DIR, '.claude/settings.local.json')
const SETTINGS_JSON = join(PROJECT_DIR, '.claude/settings.json')
const TASKS_DIR = join(PROJECT_DIR, '.claude/tasks')
const HOOK_IDLE = join(PROJECT_DIR, '.claude/hooks/teammate-idle.sh')

/**
 * settings JSON에서 "bash /path/to/hook.sh" 패턴의 파일 경로를 추출한다.
 * inline bash one-liner (jq, grep 등)는 .sh 파일 아닌 경우 제외.
 */
function extractHookFilePaths(settingsJson: Record<string, unknown>): string[] {
  const paths: string[] = []

  function traverse(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) { obj.forEach(traverse); return }
    const o = obj as Record<string, unknown>
    if (typeof o.command === 'string') {
      // "bash /absolute/path/to/script.sh ..." 패턴
      const m = (o.command as string).match(/bash\s+(\/[^\s]+\.sh)/)
      if (m) paths.push(m[1])
    }
    Object.values(o).forEach(traverse)
  }

  traverse(settingsJson)
  return [...new Set(paths)]
}

/**
 * TASK 파일 프론트매터(--- ... ---) 내에서 지정 key의 값을 추출한다.
 * 없으면 null 반환.
 */
function parseFrontmatterField(content: string, key: string): string | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return null
  const fm = fmMatch[1]
  const lineMatch = fm.match(new RegExp(`^${key}:\\s*(\\S+)`, 'm'))
  return lineMatch ? lineMatch[1] : null
}

// ─────────────────────────────────────────
// REG-1: Hook 파일 실존 검증
// 사건: notify-openclaw.sh가 settings에 등록됐지만 파일이 없어 Stop hook 에러 발생
// ─────────────────────────────────────────
describe('REG-1: settings.local.json — 등록된 hook 파일 실존', () => {
  it('모든 "bash /path/hook.sh" 명령이 실제 파일을 가리켜야 한다', () => {
    const raw = readFileSync(SETTINGS_LOCAL, 'utf-8')
    const settings = JSON.parse(raw) as Record<string, unknown>
    const paths = extractHookFilePaths(settings)

    expect(paths.length).toBeGreaterThan(0)

    const missing: string[] = []
    for (const p of paths) {
      if (!existsSync(p)) missing.push(p)
    }

    expect(missing, `누락된 hook 파일:\n${missing.join('\n')}`).toEqual([])
  })
})

// ─────────────────────────────────────────
// REG-2: permissionMode 위치 검증
// 사건: permissionMode가 permissions 하위에 중첩되면 bypassPermissions 무효
// ─────────────────────────────────────────
describe('REG-2: settings.local.json — permissionMode 최상위 위치', () => {
  it('permissionMode가 최상위 키로 존재해야 한다', () => {
    const raw = readFileSync(SETTINGS_LOCAL, 'utf-8')
    const settings = JSON.parse(raw) as Record<string, unknown>

    expect(settings, 'permissionMode가 최상위에 없음').toHaveProperty('permissionMode')
    expect(settings.permissionMode, 'bypassPermissions가 아님').toBe('bypassPermissions')
  })

  it('permissions 하위에 permissionMode가 중복으로 들어가면 안 된다', () => {
    const raw = readFileSync(SETTINGS_LOCAL, 'utf-8')
    const settings = JSON.parse(raw) as Record<string, unknown>

    const permissions = settings.permissions as Record<string, unknown> | undefined
    if (permissions) {
      expect(permissions, 'permissions 하위에 permissionMode 중복').not.toHaveProperty('permissionMode')
    }
  })
})

// ─────────────────────────────────────────
// REG-3: settings.json hooks 빈 배열 검증
// 사건: settings.json에 hooks가 채워지면 settings.local.json과 충돌/중복 실행
// ─────────────────────────────────────────
describe('REG-3: settings.json — hooks 섹션 비어있어야 함', () => {
  it('settings.json의 모든 hook 배열이 비어있어야 한다', () => {
    const raw = readFileSync(SETTINGS_JSON, 'utf-8')
    const settings = JSON.parse(raw) as Record<string, unknown>

    if (!settings.hooks) return // hooks 섹션 없으면 통과

    const hooks = settings.hooks as Record<string, unknown[]>
    const nonEmpty: string[] = []

    for (const [event, val] of Object.entries(hooks)) {
      if (Array.isArray(val) && val.length > 0) {
        nonEmpty.push(event)
      }
    }

    expect(
      nonEmpty,
      `settings.json에 비어있지 않은 hook 이벤트: ${nonEmpty.join(', ')}\n→ settings.local.json으로 이동해야 함`
    ).toEqual([])
  })
})

// ─────────────────────────────────────────
// REG-4: teammate-idle 크로스팀 배정 버그
// 사건: team-context 없을 때 타 팀 TASK를 배정해 팀원이 엉뚱한 작업 시작
// ─────────────────────────────────────────
describe.skip('REG-4: V2 제거 teammate-idle — 타 팀 TASK 배정 금지', () => {
  let env: ReturnType<typeof createTestEnv>
  let hookPath: string

  beforeEach(() => {
    env = createTestEnv()
    hookPath = prepareHookScript(HOOK_IDLE, env.tmpDir, env.hooksDir)
  })

  afterEach(() => {
    cleanupTestEnv(env.tmpDir)
  })

  it('CTO-1 팀이 자기 TASK 완료 시 PM-1 미완료 TASK를 배정하면 안 된다', () => {
    // CTO-1 컨텍스트 설정
    writeFileSync(join(env.runtimeDir, 'team-context.json'), JSON.stringify({
      team: 'CTO-1',
      taskFiles: ['TASK-CTO-RESUME.md'],
      teammates: [],
    }))

    // CTO-1 TASK: 완료
    writeFileSync(
      join(env.tasksDir, 'TASK-CTO-RESUME.md'),
      '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [x] 모두 완료\n'
    )

    // PM-1 TASK: 미완료 — CTO-1 팀이 가져가면 안 됨
    writeFileSync(
      join(env.tasksDir, 'TASK-PM-RESUME.md'),
      '---\nteam: PM-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [ ] PM 미완료 항목\n'
    )

    const result = runHook(hookPath)

    // CTO-1 관점: 자기 팀 TASK 완료 → exit 0 (idle 허용)
    expect(result.exitCode, `PM TASK를 배정하고 exit 2 반환: ${result.stdout}`).toBe(0)
    // stdout에 PM 관련 내용 없어야 함
    expect(result.stdout).not.toContain('PM')
  })

  it('team-context 없고 CURRENT_TEAM 없을 때는 전체 스캔 (레거시 호환)', () => {
    // team-context.json 없음
    writeFileSync(
      join(env.tasksDir, 'TASK-LEGACY.md'),
      '# TASK (레거시, 프론트매터 없음)\n- [ ] 레거시 미완료\n'
    )

    const result = runHook(hookPath)
    // 레거시 TASK는 전체 스캔 대상 → 미완료 있으므로 exit 2
    expect(result.exitCode).toBe(2)
  })
})

// ─────────────────────────────────────────
// REG-5: TASK 프론트매터 team 필드 필수
// 사건: team 필드 없는 TASK가 있으면 소유권 필터가 레거시로 인식해 크로스팀 배정 발생
// ─────────────────────────────────────────
describe('REG-5: TASK 파일 — team 프론트매터 필드 필수', () => {
  it('모든 TASK-*.md에 team 필드가 있어야 한다', () => {
    const files = readdirSync(TASKS_DIR).filter(
      f => f.startsWith('TASK-') && f.endsWith('.md')
    )

    expect(files.length, 'TASK 파일이 0개').toBeGreaterThan(0)

    const missing: string[] = []
    for (const file of files) {
      const content = readFileSync(join(TASKS_DIR, file), 'utf-8')
      const team = parseFrontmatterField(content, 'team')
      if (team === null) missing.push(file)
    }

    expect(
      missing,
      `team 필드 없는 TASK 파일:\n${missing.join('\n')}\n→ 프론트매터에 team: <팀명> 추가 필요`
    ).toEqual([])
  })

  it('team 값이 unassigned인 TASK도 프론트매터 자체는 있어야 한다', () => {
    const files = readdirSync(TASKS_DIR).filter(
      f => f.startsWith('TASK-') && f.endsWith('.md')
    )

    const noFrontmatter: string[] = []
    for (const file of files) {
      const content = readFileSync(join(TASKS_DIR, file), 'utf-8')
      const hasFm = /^---\n[\s\S]*?\n---/.test(content)
      if (!hasFm) noFrontmatter.push(file)
    }

    expect(
      noFrontmatter,
      `프론트매터 자체가 없는 TASK:\n${noFrontmatter.join('\n')}`
    ).toEqual([])
  })
})

// ─────────────────────────────────────────
// REG-6: 삭제된 파일 참조 없음 검증
// 사건: notify-openclaw.sh가 삭제됐는데 settings에 남아있어 hook 에러 발생
// REG-1과 차이: REG-1은 파일 존재 여부, REG-6은 "알려진 삭제 파일이 참조 안 되는지"
// ─────────────────────────────────────────
const KNOWN_DELETED_HOOKS = [
  'notify-openclaw.sh',
  'notify-hook.sh',
]

describe('REG-6: settings.local.json — 삭제된 hook 파일 참조 금지', () => {
  it('알려진 삭제 파일이 hook command에 등록되어 있으면 안 된다', () => {
    const raw = readFileSync(SETTINGS_LOCAL, 'utf-8')
    const settings = JSON.parse(raw) as Record<string, unknown>
    const paths = extractHookFilePaths(settings)

    const referenced: string[] = []
    for (const p of paths) {
      const filename = p.split('/').pop() ?? ''
      if (KNOWN_DELETED_HOOKS.includes(filename)) {
        referenced.push(`${filename} → ${p}`)
      }
    }

    expect(
      referenced,
      `삭제된 hook 파일이 아직 settings에 등록됨:\n${referenced.join('\n')}`
    ).toEqual([])
  })
})

// ─────────────────────────────────────────
// REG-7: TeammateIdle hook 설정 확인
// chain-100-percent 설계: TeammateIdle 활성화 (P5 heartbeat)
// ─────────────────────────────────────────
describe('REG-7: settings.local.json — TeammateIdle hooks 활성화 (chain-100%)', () => {
  it.skip('V2 제거: TeammateIdle에 teammate-idle.sh hook이 등록되어야 한다', () => {
    const raw = readFileSync(SETTINGS_LOCAL, 'utf-8')
    const settings = JSON.parse(raw) as Record<string, unknown>
    const hooks = settings.hooks as Record<string, unknown[]> | undefined

    expect(hooks, 'hooks 섹션이 없음').toBeDefined()
    expect(hooks!.TeammateIdle, 'TeammateIdle 이벤트가 없음').toBeDefined()

    const idleHooks = hooks!.TeammateIdle as unknown[]

    // chain-100-percent 설계: heartbeat 활성화
    expect(idleHooks.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────
// REG-8: permissionMode bypassPermissions 양쪽 일치
// 사건: permissionMode가 없거나 다른 값이면 팀원이 퍼미션 프롬프트에 막힘
// ─────────────────────────────────────────
describe('REG-8: permissionMode — settings.local.json + settings.json 양쪽 일치', () => {
  it('settings.local.json permissionMode가 bypassPermissions여야 한다', () => {
    const raw = readFileSync(SETTINGS_LOCAL, 'utf-8')
    const settings = JSON.parse(raw) as Record<string, unknown>
    expect(settings.permissionMode).toBe('bypassPermissions')
  })

  it('settings.json permissionMode가 bypassPermissions여야 한다', () => {
    const raw = readFileSync(SETTINGS_JSON, 'utf-8')
    const settings = JSON.parse(raw) as Record<string, unknown>
    expect(settings.permissionMode).toBe('bypassPermissions')
  })

  it('양쪽 permissionMode 값이 동일해야 한다', () => {
    const local = JSON.parse(readFileSync(SETTINGS_LOCAL, 'utf-8')) as Record<string, unknown>
    const main = JSON.parse(readFileSync(SETTINGS_JSON, 'utf-8')) as Record<string, unknown>
    expect(
      local.permissionMode,
      `settings.local(${local.permissionMode}) ≠ settings.json(${main.permissionMode})`
    ).toBe(main.permissionMode)
  })
})

// ─────────────────────────────────────────
// REG-9: detect-process-level.sh PDCA 레벨 판단 분기 검증
// 사건: L0~L3 판단이 잘못되면 Plan/Design 스킵 오류 발생
// ─────────────────────────────────────────
const HOOK_DETECT_LEVEL = join(PROJECT_DIR, '.claude/hooks/detect-process-level.sh')

describe('REG-9: detect-process-level.sh — L0~L3 분기 정확성', () => {
  let env: ReturnType<typeof createTestEnv>

  beforeEach(() => {
    env = createTestEnv()
  })

  afterEach(() => {
    cleanupTestEnv(env.tmpDir)
  })

  /**
   * detect-process-level.sh를 source한 후 함수를 호출하는 래퍼 스크립트 생성.
   * PROJECT_DIR을 패치하고 결과를 echo로 출력.
   */
  function runDetectLevel(fnCall: string): string {
    const content = readFileSync(HOOK_DETECT_LEVEL, 'utf-8')
    // PROJECT_DIR 패치 (git diff --cached가 필요없는 테스트에서는 빈 결과 반환)
    const patched = content.replace(
      /PROJECT_DIR="[^"]*"/,
      `PROJECT_DIR="${env.tmpDir}"`
    )
    const wrapperScript = join(env.hooksDir, 'detect-level-wrapper.sh')
    writeFileSync(wrapperScript, `#!/bin/bash\n${patched}\n${fnCall}\necho "$PROCESS_LEVEL"`, { mode: 0o755 })

    const result = runHook(wrapperScript)
    return result.stdout.trim()
  }

  it('fix: 커밋 → L0', () => {
    const level = runDetectLevel(`detect_level_from_commit "git commit -m 'fix: 긴급수정'"`)
    expect(level).toBe('L0')
  })

  it('hotfix: 커밋 → L0', () => {
    const level = runDetectLevel(`detect_level_from_commit "git commit -m 'hotfix: 장애대응'"`)
    expect(level).toBe('L0')
  })

  it('staged에 src/ 없음 → L1 (git staged 비어있는 환경)', () => {
    // tmpDir은 git repo가 아니므로 git diff --cached가 빈 결과 → src/ 없음 → L1
    const level = runDetectLevel(`detect_level_from_commit "git commit -m 'chore: 문서 정리'"`)
    expect(level).toBe('L1')
  })

  it('src/app/page.tsx → L2', () => {
    const level = runDetectLevel(`detect_level_from_file "src/app/page.tsx"`)
    expect(level).toBe('L2')
  })

  it('src/lib/supabase/client.ts → L3 (supabase 포함)', () => {
    const level = runDetectLevel(`detect_level_from_file "src/lib/supabase/client.ts"`)
    expect(level).toBe('L3')
  })

  it('src/middleware.ts → L3 (middleware.ts)', () => {
    const level = runDetectLevel(`detect_level_from_file "src/middleware.ts"`)
    expect(level).toBe('L3')
  })

  it('docs/plan.md → L1 (src/ 아님)', () => {
    const level = runDetectLevel(`detect_level_from_file "docs/plan.md"`)
    expect(level).toBe('L1')
  })
})

// ─────────────────────────────────────────
// REG-10: settings.json hooks 이벤트 내부 hooks 배열 비어있는지
// 사건: settings.json 이벤트에 개별 hooks 배열이 채워지면 settings.local.json과 중복 실행
// REG-3과 차이: REG-3은 "이벤트 배열 자체가 비어있는지", REG-10은 "이벤트 안 객체의 hooks 필드가 비어있는지"
// ─────────────────────────────────────────
describe('REG-10: settings.json — 이벤트 내부 hooks 배열 비어있어야 함', () => {
  it('각 이벤트 객체의 hooks 필드가 전부 비어있어야 한다', () => {
    const raw = readFileSync(SETTINGS_JSON, 'utf-8')
    const settings = JSON.parse(raw) as Record<string, unknown>

    if (!settings.hooks) return // hooks 섹션 없으면 통과

    const hooks = settings.hooks as Record<string, unknown[]>
    const nonEmpty: string[] = []

    for (const [event, entries] of Object.entries(hooks)) {
      if (!Array.isArray(entries)) continue
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i] as Record<string, unknown> | undefined
        if (entry && Array.isArray(entry.hooks) && entry.hooks.length > 0) {
          nonEmpty.push(`${event}[${i}].hooks (${entry.hooks.length}개)`)
        }
      }
    }

    expect(
      nonEmpty,
      `settings.json 이벤트 내부 hooks가 비어있지 않음:\n${nonEmpty.join('\n')}\n→ settings.local.json과 중복 실행 위험`
    ).toEqual([])
  })
})
