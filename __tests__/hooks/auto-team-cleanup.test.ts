// __tests__/hooks/auto-team-cleanup.test.ts — auto-team-cleanup.sh 테스트 (설계서 6-5)
// TDD Red: team-context 기반 필터링 + 완료 시 알림 동작 검증
//
// 1. team-context CTO → PM TASK 스캔 안 함
// 2. INC-11: 모든 TASK 완료 → 알림만, auto-shutdown 미호출

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { createTestEnv, cleanupTestEnv, runHook } from './helpers';

const ORIGINAL_CLEANUP = '/Users/smith/projects/bscamp/.claude/hooks/auto-team-cleanup.sh';
const ORIGINAL_PARSER = '/Users/smith/projects/bscamp/.claude/hooks/helpers/frontmatter-parser.sh';
const IS_TEAMMATE_SH = '/Users/smith/projects/bscamp/.claude/hooks/is-teammate.sh';

/**
 * auto-team-cleanup.sh + helpers/frontmatter-parser.sh 모두 패치.
 * PROJECT_DIR 패치 + is-teammate guard 제거 + osascript 제거.
 */
function prepareCleanupHookPatched(tmpDir: string, hooksDir: string): string {
  // 1. 메인 스크립트 패치
  let main = readFileSync(ORIGINAL_CLEANUP, 'utf-8');
  main = main.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${tmpDir}"`);
  // is-teammate guard를 FALSE로 고정 (tmux 없는 테스트 환경)
  main = main.replace(/^source.*is-teammate\.sh.*$/m, 'IS_TEAMMATE="false"');
  main = main.replace(/^.*IS_TEAMMATE.*exit 0.*$/m, '# [test: guard removed]');
  // osascript 알림 제거
  main = main.replace(/osascript.*$/gm, '# [test: notification removed]');
  const mainDest = join(hooksDir, 'auto-team-cleanup.sh');
  writeFileSync(mainDest, main, { mode: 0o755 });

  // 2. helpers/frontmatter-parser.sh 패치 (PROJECT_DIR 오버라이드)
  const helpersDir = join(hooksDir, 'helpers');
  mkdirSync(helpersDir, { recursive: true });
  if (existsSync(ORIGINAL_PARSER)) {
    let helper = readFileSync(ORIGINAL_PARSER, 'utf-8');
    helper = helper.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${tmpDir}"`);
    writeFileSync(join(helpersDir, 'frontmatter-parser.sh'), helper, { mode: 0o755 });
  }

  // 3. is-teammate.sh 복사 (다른 로직이 참조할 수 있으므로)
  if (existsSync(IS_TEAMMATE_SH)) {
    copyFileSync(IS_TEAMMATE_SH, join(hooksDir, 'is-teammate.sh'));
  }

  return mainDest;
}

describe('auto-team-cleanup.sh (설계서 6-5)', () => {
  let env: ReturnType<typeof createTestEnv>;
  let hookPath: string;

  beforeEach(() => {
    env = createTestEnv();
    hookPath = prepareCleanupHookPatched(env.tmpDir, env.hooksDir);
  });

  afterEach(() => cleanupTestEnv(env.tmpDir));

  it('team-context CTO → PM TASK 스캔 안 함 (CTO 완료 시 exit 0)', () => {
    // team-context: CTO 팀, TASK-CTO.md만 소유
    writeFileSync(
      join(env.runtimeDir, 'team-context.json'),
      JSON.stringify({
        team: 'CTO',
        taskFiles: ['TASK-CTO.md'],
        teammates: [],
      })
    );

    // CTO TASK: 모두 완료
    writeFileSync(
      join(env.tasksDir, 'TASK-CTO.md'),
      '---\nteam: CTO\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [x] 완료된 항목\n'
    );

    // PM TASK: 미완료 (CTO 팀이 스캔하면 안 됨)
    writeFileSync(
      join(env.tasksDir, 'TASK-PM.md'),
      '---\nteam: PM\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [ ] PM 미완료 항목\n'
    );

    const result = runHook(hookPath);

    // CTO TASK만 스캔 → 모두 완료 → exit 0
    expect(result.exitCode).toBe(0);
    // 완료 메시지 포함
    expect(result.stdout).toContain('모든 TASK가 완료');
    // PM 관련 내용 없어야 함
    expect(result.stdout).not.toContain('PM');
  });

  it('INC-11: 모든 TASK 완료 → 알림만 출력, auto-shutdown 미호출 (exit 0)', () => {
    // team-context: CTO 팀
    writeFileSync(
      join(env.runtimeDir, 'team-context.json'),
      JSON.stringify({
        team: 'CTO',
        taskFiles: ['TASK-A.md', 'TASK-B.md'],
        teammates: [],
      })
    );

    // TASK-A: 완료
    writeFileSync(
      join(env.tasksDir, 'TASK-A.md'),
      '---\nteam: CTO\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [x] A 완료\n- [x] A-2 완료\n'
    );

    // TASK-B: 완료
    writeFileSync(
      join(env.tasksDir, 'TASK-B.md'),
      '---\nteam: CTO\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [x] B 완료\n'
    );

    const result = runHook(hookPath);

    // 알림 메시지 출력
    expect(result.stdout).toContain('모든 TASK가 완료');
    expect(result.stdout).toContain('TeamDelete');

    // exit 0 — 차단하지 않음 (이전 exit 2 → exit 0으로 변경된 동작)
    expect(result.exitCode).toBe(0);

    // auto-shutdown.sh를 직접 호출하지 않음 (stdout에 auto-shutdown 관련 없어야 함)
    expect(result.stdout).not.toContain('auto-shutdown');
  });
});
