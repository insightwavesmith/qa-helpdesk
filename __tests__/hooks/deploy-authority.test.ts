// __tests__/hooks/deploy-authority.test.ts
// P3-1~P3-6: validate-deploy-authority.sh 배포 권한 TDD

import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { createTestEnv, cleanupTestEnv } from './helpers';

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

/** validate-deploy-authority.sh를 테스트용으로 준비 */
function prepareDeployAuthority(
  env: ReturnType<typeof createTestEnv>,
  opts?: { paneIndex?: number }
): string {
  const src = join(process.cwd(), '.claude/hooks/validate-deploy-authority.sh');
  let content = readFileSync(src, 'utf-8');

  // tmux display-message mock
  const mockTmux = join(env.tmpDir, 'mock-tmux.sh');
  const paneIndex = opts?.paneIndex ?? 0;
  writeFileSync(mockTmux, `#!/bin/bash
echo "${paneIndex}"
`, { mode: 0o755 });

  content = content.replace(
    /tmux display-message -p '#\{pane_index\}' 2>\/dev\/null/g,
    `"${mockTmux}" 2>/dev/null`
  );

  const destPath = join(env.hooksDir, 'validate-deploy-authority.sh');
  writeFileSync(destPath, content, { mode: 0o755 });
  return destPath;
}

/** stdin으로 tool_input JSON 파이핑 */
function runDeployHook(
  hookPath: string,
  command: string,
  env: Record<string, string>
): { exitCode: number; stdout: string; stderr: string } {
  const input = JSON.stringify({ tool_input: { command } });
  try {
    const stdout = execSync(`echo '${input.replace(/'/g, "'\\''")}' | bash "${hookPath}"`, {
      encoding: 'utf-8',
      env: { ...process.env, ...env },
      timeout: 5000,
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err: any) {
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

describe('P3-1~6: validate-deploy-authority 배포 권한', () => {

  it('P3-1: 리더 + gcloud run deploy → exit 0 (허용)', () => {
    testEnv = createTestEnv();
    const hookPath = prepareDeployAuthority(testEnv, { paneIndex: 0 });

    const r = runDeployHook(hookPath, 'gcloud run deploy bscamp-web --region=asia-northeast3', {
      TMUX: '/tmp/tmux-501/default,12345,0',
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
    });

    expect(r.exitCode).toBe(0);
  });

  it('P3-2: 팀원 + gcloud run deploy → exit 2 (차단)', () => {
    testEnv = createTestEnv();
    const hookPath = prepareDeployAuthority(testEnv, { paneIndex: 1 });

    const r = runDeployHook(hookPath, 'gcloud run deploy bscamp-web --region=asia-northeast3', {
      TMUX: '/tmp/tmux-501/default,12345,0',
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
    });

    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('BLOCKED');
    expect(r.stderr).toContain('리더 권한');
  });

  it('P3-3: 팀원 + npm run build → exit 0 (비배포)', () => {
    testEnv = createTestEnv();
    const hookPath = prepareDeployAuthority(testEnv, { paneIndex: 1 });

    const r = runDeployHook(hookPath, 'npm run build', {
      TMUX: '/tmp/tmux-501/default,12345,0',
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
    });

    expect(r.exitCode).toBe(0);
  });

  it('P3-4: 리더 + gcloud storage cp gs:// → exit 0 (허용)', () => {
    testEnv = createTestEnv();
    const hookPath = prepareDeployAuthority(testEnv, { paneIndex: 0 });

    const r = runDeployHook(hookPath, 'gcloud storage cp state.json gs://mozzi-reports/dashboard/', {
      TMUX: '/tmp/tmux-501/default,12345,0',
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
    });

    expect(r.exitCode).toBe(0);
  });

  it('P3-5: tmux 없는 환경 → exit 0 (패스)', () => {
    testEnv = createTestEnv();
    const hookPath = prepareDeployAuthority(testEnv, { paneIndex: 1 });

    const r = runDeployHook(hookPath, 'gcloud run deploy bscamp-web', {
      TMUX: '',
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
    });

    expect(r.exitCode).toBe(0);
  });

  it('P3-6: 복합 명령 build && deploy → 팀원 exit 2 (차단)', () => {
    testEnv = createTestEnv();
    const hookPath = prepareDeployAuthority(testEnv, { paneIndex: 1 });

    const r = runDeployHook(hookPath, 'npm run build && gcloud run deploy bscamp-web', {
      TMUX: '/tmp/tmux-501/default,12345,0',
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
    });

    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('BLOCKED');
  });
});
