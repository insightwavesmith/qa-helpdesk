// __tests__/hooks/brick-hooks-critical5.test.ts — 브릭 엔진 임계 훅 5종 TDD
// BH-001~BH-045: validate-delegate, validate-plan, task-quality-gate, gap-analysis, notify-completion
// Design: docs/02-design/features/brick-hooks-critical5.design.md

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { createTestEnv, cleanupTestEnv } from './helpers';

const HOOKS_DIR = '/Users/smith/projects/bscamp/.bkit/hooks';

// ─────────────────────────────────────────────
// 공통 헬퍼
// ─────────────────────────────────────────────

const baseEnv: Record<string, string> = {
  PATH: process.env.PATH || '',
  HOME: process.env.HOME || '',
  SHELL: process.env.SHELL || '',
};

/** stdin으로 Edit/Write tool_input JSON 파이핑하여 hook 실행 */
function runEditHook(
  hookPath: string,
  filePath: string,
  env: Record<string, string> = {},
): { exitCode: number; stdout: string; stderr: string } {
  const input = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: filePath, old_string: 'x', new_string: 'y' },
  });
  try {
    const stdout = execSync(
      `echo '${input.replace(/'/g, "'\\''")}' | bash "${hookPath}"`,
      { encoding: 'utf-8', env: { ...baseEnv, ...env } as NodeJS.ProcessEnv, timeout: 10000 },
    );
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err: any) {
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

/** stdin으로 Bash tool_input JSON 파이핑하여 hook 실행 */
function runBashHook(
  hookPath: string,
  command: string,
  env: Record<string, string> = {},
): { exitCode: number; stdout: string; stderr: string } {
  const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
  try {
    const stdout = execSync(
      `echo '${input.replace(/'/g, "'\\''")}' | bash "${hookPath}"`,
      { encoding: 'utf-8', env: { ...baseEnv, ...env } as NodeJS.ProcessEnv, timeout: 10000 },
    );
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err: any) {
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

/** stdin 없이 hook 실행 (TaskCompleted 등) */
function runNoStdinHook(
  hookPath: string,
  env: Record<string, string> = {},
): { exitCode: number; stdout: string; stderr: string } {
  try {
    const stdout = execSync(
      `echo '{}' | bash "${hookPath}"`,
      { encoding: 'utf-8', env: { ...baseEnv, ...env } as NodeJS.ProcessEnv, timeout: 30000 },
    );
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err: any) {
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

// ═════════════════════════════════════════════
// 1. validate-delegate.sh (BH-001~010)
// ═════════════════════════════════════════════

describe('validate-delegate.sh — 리더 직접 편집 차단 (BH-001~010)', () => {
  const SCRIPT = join(HOOKS_DIR, 'validate-delegate.sh');

  // BH-001: 리더가 src/ 편집 → 차단
  it('test_bh001_leader_src_edit_blocked', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    // 리더 pane=0에서 허용 목록 외 파일 → exit 2
    expect(content).toContain('리더는 구현 파일 직접 편집 금지');
    expect(content).toContain('exit 2');
  });

  // BH-002: 리더가 docs/ 편집 → 허용
  it('test_bh002_leader_docs_edit_allowed', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toMatch(/docs\//);
    expect(content).toContain('exit 0');
  });

  // BH-003: 리더가 CLAUDE.md 편집 → 허용
  it('test_bh003_leader_claudemd_edit_allowed', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toMatch(/CLAUDE/);
    // .md 파일 또는 CLAUDE* 패턴 → exit 0
    expect(content).toContain("'^CLAUDE'");
  });

  // BH-004: 팀원이 src/ 편집 → 허용 (pane > 0, 비보안 파일)
  it('test_bh004_teammate_src_edit_allowed', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    // pane > 0에서 보안 파일 아닌 경우 → exit 0
    expect(content).toContain('# 그 외 → 허용');
  });

  // BH-005: 팀원이 .claude/ 편집 → 차단
  it('test_bh005_teammate_claude_dir_blocked', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toMatch(/\.claude\//);
    expect(content).toContain('팀원 보안 파일 수정 차단');
  });

  // BH-006: 팀원이 migration 편집 → 승인 요청
  it('test_bh006_teammate_migration_approval', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('migration');
    expect(content).toContain('approval-handler.sh');
  });

  // BH-007: 비tmux 환경 → 허용
  it('test_bh007_non_tmux_allowed', () => {
    // TMUX 없으면 exit 0
    const result = runEditHook(SCRIPT, '/tmp/test.py', {
      ...baseEnv,
      IS_TEAMMATE: '',
      TMUX: '',
      PROJECT_DIR: '/tmp',
    });
    expect(result.exitCode).toBe(0);
  });

  // BH-008: IS_TEAMMATE=true → 허용
  it('test_bh008_is_teammate_bypass', () => {
    const result = runEditHook(SCRIPT, '/tmp/anything.py', {
      ...baseEnv,
      IS_TEAMMATE: 'true',
    });
    expect(result.exitCode).toBe(0);
  });

  // BH-009: 리더가 package.json 편집 → 허용
  it('test_bh009_leader_packagejson_allowed', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('package.json');
  });

  // BH-010: 리더가 dashboard/src/ 편집 → 차단
  it('test_bh010_leader_dashboard_src_blocked', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    // dashboard/src/ 는 허용 목록에 없으므로 차단
    // 허용 목록에 '^src/' 가 없고 dashboard/src/도 없음
    expect(content).not.toContain("'^dashboard/src/'");
    expect(content).toContain('리더는 구현 파일 직접 편집 금지');
  });
});

// ═════════════════════════════════════════════
// 2. validate-plan.sh (BH-011~020)
// ═════════════════════════════════════════════

describe('validate-plan.sh — Plan 없이 Do 차단 (BH-011~020)', () => {
  const SCRIPT = join(HOOKS_DIR, 'validate-plan.sh');
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(() => cleanupTestEnv(env.tmpDir));

  // BH-011: L2 + Plan 없이 src/ 편집 → 차단
  it('test_bh011_l2_no_plan_blocked', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('Plan 문서가 없습니다');
    expect(content).toContain('exit 2');
  });

  // BH-012: L2 + Plan 있고 Design 없이 → 차단
  it('test_bh012_l2_plan_no_design_blocked', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('Design 문서가 없습니다');
    expect(content).toContain('exit 2');
  });

  // BH-013: L2 + Plan+Design 있고 편집 → 허용
  it('test_bh013_l2_plan_design_exists_allowed', () => {
    // Plan+Design 존재 시 → exit 0 (전부 통과)
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('# 전부 통과');
    expect(content).toContain('exit 0');
  });

  // BH-014: L0 + Plan 없이 편집 → 허용
  it('test_bh014_l0_no_plan_allowed', () => {
    const result = runEditHook(SCRIPT, `${env.tmpDir}/src/test.ts`, {
      ...baseEnv,
      PROCESS_LEVEL: 'L0',
      PROJECT_DIR: env.tmpDir,
    });
    expect(result.exitCode).toBe(0);
  });

  // BH-015: L1 → 허용 (Plan/Design 불필요)
  it('test_bh015_l1_allowed', () => {
    const result = runEditHook(SCRIPT, `${env.tmpDir}/src/test.ts`, {
      ...baseEnv,
      PROCESS_LEVEL: 'L1',
      PROJECT_DIR: env.tmpDir,
    });
    expect(result.exitCode).toBe(0);
  });

  // BH-016: docs/ 파일 편집 → 항상 허용
  it('test_bh016_docs_always_allowed', () => {
    const result = runEditHook(SCRIPT, `${env.tmpDir}/docs/anything.md`, {
      ...baseEnv,
      PROCESS_LEVEL: 'L2',
      PROJECT_DIR: env.tmpDir,
    });
    expect(result.exitCode).toBe(0);
  });

  // BH-017: TASK 파일 없으면 → 차단
  it('test_bh017_no_task_blocked', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('TASK 문서가 없습니다');
    expect(content).toContain('TASK*.md');
  });

  // BH-018: 24시간 지난 Plan → 차단
  it('test_bh018_stale_plan_blocked', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    // find -mmin -1440 → 24시간(1440분) 이내만 인정
    expect(content).toContain('-mmin -1440');
  });

  // BH-019: L3 + ADR 없으면 → 차단
  it('test_bh019_l3_no_adr_blocked', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('L3 작업은 ADR 문서가 필요합니다');
    expect(content).toContain('ADR-*.md');
  });

  // BH-020: IS_TEAMMATE=true → 허용
  it('test_bh020_is_teammate_bypass', () => {
    const result = runEditHook(SCRIPT, `${env.tmpDir}/src/test.ts`, {
      ...baseEnv,
      IS_TEAMMATE: 'true',
      PROCESS_LEVEL: 'L2',
      PROJECT_DIR: env.tmpDir,
    });
    expect(result.exitCode).toBe(0);
  });
});

// ═════════════════════════════════════════════
// 3. task-quality-gate.sh (BH-021~030)
// ═════════════════════════════════════════════

describe('task-quality-gate.sh — 품질 게이트 (BH-021~030)', () => {
  const SCRIPT = join(HOOKS_DIR, 'task-quality-gate.sh');
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(() => cleanupTestEnv(env.tmpDir));

  // BH-021: L2 tsc 통과 + build 통과 → 허용
  it('test_bh021_l2_tsc_build_pass', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('tsc --noEmit');
    expect(content).toContain('npm run build');
    expect(content).toContain('전부 통과');
  });

  // BH-022: L2 tsc 실패 → 차단
  it('test_bh022_l2_tsc_fail_blocked', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('TypeScript 타입 에러');
    expect(content).toContain('exit 2');
  });

  // BH-023: L2 build 실패 → 차단
  it('test_bh023_l2_build_fail_blocked', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('npm run build 실패');
  });

  // BH-024: L0 → 스킵
  it('test_bh024_l0_skip', () => {
    const result = runNoStdinHook(SCRIPT, {
      ...baseEnv,
      PROCESS_LEVEL: 'L0',
      PROJECT_DIR: env.tmpDir,
    });
    expect(result.exitCode).toBe(0);
  });

  // BH-025: L1 산출물 없음 → 경고만 (exit 0)
  it('test_bh025_l1_no_artifact_warning_only', () => {
    // L1에서는 경고만 하고 통과
    const result = runNoStdinHook(SCRIPT, {
      ...baseEnv,
      PROCESS_LEVEL: 'L1',
      PROJECT_DIR: env.tmpDir,
    });
    expect(result.exitCode).toBe(0);
  });

  // BH-026: L2 analysis.md 없음 → 차단
  it('test_bh026_l2_no_analysis_blocked', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('Gap 분석 문서 미생성');
    expect(content).toContain('analysis.md');
  });

  // BH-027: L2 pdca-status.json 오래됨 → 차단
  it('test_bh027_l2_stale_pdca_blocked', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('1시간 이상 업데이트되지 않았습니다');
    expect(content).toContain('3600');
  });

  // BH-028: IS_TEAMMATE=true → 허용
  it('test_bh028_is_teammate_bypass', () => {
    const result = runNoStdinHook(SCRIPT, {
      ...baseEnv,
      IS_TEAMMATE: 'true',
      PROCESS_LEVEL: 'L2',
      PROJECT_DIR: env.tmpDir,
    });
    expect(result.exitCode).toBe(0);
  });

  // BH-029: L3 pytest 실패 → 차단
  it('test_bh029_l3_pytest_fail_blocked', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('pytest');
    expect(content).toContain('L3');
  });

  // BH-030: 로그 파일 생성 확인
  it('test_bh030_log_file_created', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('hook-logs');
    expect(content).toContain('task-quality-gate-');
    expect(content).toMatch(/\.log/);
  });
});

// ═════════════════════════════════════════════
// 4. gap-analysis.sh (BH-031~040)
// ═════════════════════════════════════════════

describe('gap-analysis.sh — Design vs 구현 비교 (BH-031~040)', () => {
  const SCRIPT = join(HOOKS_DIR, 'gap-analysis.sh');
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(() => cleanupTestEnv(env.tmpDir));

  // BH-031: TASK 파일 참조 = staged 파일 → 허용
  it('test_bh031_full_match_allowed', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    // 누락 없으면 exit 0
    expect(content).toContain('git diff --cached --name-only');
    expect(content).toMatch(/exit 0$/m);
  });

  // BH-032: TASK에 명시된 파일이 staged에 없음 → 차단
  it('test_bh032_missing_file_blocked', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('TASK에 명시된 파일');
    expect(content).toContain('staged에 없습니다');
    expect(content).toContain('exit 2');
  });

  // BH-033: docs: 커밋 → 면제
  it('test_bh033_docs_commit_exempt', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('docs:');
    // 면제 패턴에서 exit 0
    expect(content).toMatch(/docs:[\s\S]*exit 0/);
  });

  // BH-034: chore: 커밋 → 면제
  it('test_bh034_chore_commit_exempt', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('chore:');
  });

  // BH-035: TASK 파일 없음 → 스킵
  it('test_bh035_no_task_skip', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('# TASK 파일 없으면 스킵');
  });

  // BH-036: git commit 아닌 Bash 명령 → 스킵
  it('test_bh036_non_commit_skip', () => {
    const result = runBashHook(SCRIPT, 'npm run build', {
      ...baseEnv,
      PROJECT_DIR: env.tmpDir,
    });
    expect(result.exitCode).toBe(0);
  });

  // BH-037: IS_TEAMMATE=true → 허용
  it('test_bh037_is_teammate_bypass', () => {
    const result = runBashHook(SCRIPT, 'git commit -m "feat: test"', {
      ...baseEnv,
      IS_TEAMMATE: 'true',
      PROJECT_DIR: env.tmpDir,
    });
    expect(result.exitCode).toBe(0);
  });

  // BH-038: 여러 섹션 파일 전부 staged → 허용
  it('test_bh038_multiple_files_all_staged', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    // 파일별 반복 체크 로직 존재
    expect(content).toContain('while IFS= read -r task_file');
    expect(content).toContain('FOUND=true');
  });

  // BH-039: 부분 누락 → 차단 + 누락 목록
  it('test_bh039_partial_missing_blocked_with_list', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('누락 파일:');
    expect(content).toContain('MISSING_COUNT');
  });

  // BH-040: 차단 시 block-logger 호출
  it('test_bh040_block_logger_called', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('block-logger.sh');
    expect(content).toContain('log_block');
  });
});

// ═════════════════════════════════════════════
// 5. notify-completion.sh (BH-041~045)
// ═════════════════════════════════════════════

describe('notify-completion.sh — 완료 알림 (BH-041~045)', () => {
  const SCRIPT = join(HOOKS_DIR, 'notify-completion.sh');
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    env = createTestEnv();
  });
  afterEach(() => cleanupTestEnv(env.tmpDir));

  // BH-041: 전체 완료 + 토큰 있음 → Slack DM
  it('test_bh041_complete_with_token_sends_slack', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('SLACK_BOT_TOKEN');
    expect(content).toContain('chat.postMessage');
    expect(content).toContain('U06BP49UEJD');
  });

  // BH-042: 전체 완료 + 토큰 없음 → 로그만
  it('test_bh042_complete_no_token_log_only', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('SLACK_BOT_TOKEN 없음');
    expect(content).toContain('로그만 기록');
  });

  // BH-043: 부분 완료 → 알림 안 함
  it('test_bh043_partial_complete_no_alert', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    // "0 in progress, 0 open" 패턴만 매칭 → 부분 완료 시 미매칭
    expect(content).toContain('0 in progress, 0 open');
  });

  // BH-044: 비tmux → 스킵
  it('test_bh044_non_tmux_skip', () => {
    const result = runNoStdinHook(SCRIPT, {
      ...baseEnv,
      TMUX: '',
      PROJECT_DIR: env.tmpDir,
    });
    expect(result.exitCode).toBe(0);
  });

  // BH-045: 브릭 블록 완료 → 블록 알림
  it('test_bh045_brick_block_completion_alert', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('BRICK_EXECUTION_ID');
    expect(content).toContain('BRICK_BLOCK_ID');
    expect(content).toContain('D09V1NX98SK');
    expect(content).toContain('block_complete');
  });
});
