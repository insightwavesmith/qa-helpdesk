// __tests__/hooks/approval-gate.test.ts
// APR-1~APR-9: validate-delegate.sh 승인 게이트 TDD
//
// B1 requireApproval: 팀원 위험 파일 수정 시
// exit 2 무조건 차단 → 승인 파일 기반 게이트로 전환

import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import {
  createTestEnv,
  cleanupTestEnv,
} from './helpers';

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

/** validate-delegate.sh를 테스트용으로 준비 */
function prepareValidateDelegate(env: ReturnType<typeof createTestEnv>): string {
  const src = join(process.cwd(), '.claude/hooks/validate-delegate.sh');
  let content = require('fs').readFileSync(src, 'utf-8');
  content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);

  // is-teammate.sh mock
  writeFileSync(
    join(env.hooksDir, 'is-teammate.sh'),
    '#!/bin/bash\nIS_TEAMMATE="${IS_TEAMMATE:-false}"\n',
    { mode: 0o755 }
  );

  // helpers 디렉토리에 approval-handler.sh 복사
  const helpersDir = join(env.hooksDir, 'helpers');
  mkdirSync(helpersDir, { recursive: true });
  const approvalSrc = join(process.cwd(), '.claude/hooks/helpers/approval-handler.sh');
  if (existsSync(approvalSrc)) {
    let ahContent = require('fs').readFileSync(approvalSrc, 'utf-8');
    ahContent = ahContent.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);
    // _APPROVAL_DIR도 치환 (PROJECT_DIR 기반이므로 자동 반영)
    writeFileSync(join(helpersDir, 'approval-handler.sh'), ahContent, { mode: 0o755 });
  }

  // notify-hook.sh stub (Slack 알림 mock)
  writeFileSync(
    join(env.hooksDir, 'notify-hook.sh'),
    '#!/bin/bash\nnotify_hook() { true; }\n',
    { mode: 0o755 }
  );

  const destPath = join(env.hooksDir, 'validate-delegate.sh');
  writeFileSync(destPath, content, { mode: 0o755 });
  return destPath;
}

/** stdin으로 tool_input JSON을 파이핑하며 hook 실행 */
function runDelegateHook(
  hookPath: string,
  filePath: string,
  env: Record<string, string>
): { exitCode: number; stdout: string; stderr: string } {
  const input = JSON.stringify({ tool_input: { file_path: filePath } });
  try {
    const stdout = execSync(`echo '${input}' | bash "${hookPath}"`, {
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

/** 승인 파일 key 생성 (approval-handler.sh와 동일 로직) */
function approvalKey(relFile: string): string {
  return relFile.replace(/[^a-zA-Z0-9]/g, '_');
}

/** 승인 granted 파일 생성 */
function grantApproval(tmpDir: string, relFile: string, tsOverride?: number): void {
  const dir = join(tmpDir, '.claude', 'runtime', 'approvals', 'granted');
  mkdirSync(dir, { recursive: true });
  const ts = tsOverride ?? Math.floor(Date.now() / 1000);
  writeFileSync(join(dir, approvalKey(relFile)), String(ts));
}

// ─── APR-1: 팀원 .claude/ 수정 + 승인 없음 → exit 2 ──────────

describe('APR-1~9: validate-delegate 승인 게이트', () => {

  it('APR-1: 팀원 + .claude/ + 승인 없음 → exit 2 + BLOCKED + pending 생성', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidateDelegate(testEnv);
    const relFile = '.claude/hooks/test.sh';

    const r = runDelegateHook(hookPath, `${testEnv.tmpDir}/${relFile}`, {
      IS_TEAMMATE: 'true',
    });

    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('BLOCKED');

    // pending 요청 파일 생성 확인
    const pendingDir = join(testEnv.tmpDir, '.claude', 'runtime', 'approvals', 'pending');
    const key = approvalKey(relFile);
    expect(existsSync(join(pendingDir, `${key}.json`))).toBe(true);
  });

  it('APR-2: 팀원 + migration + 승인 없음 → exit 2 + pending 생성', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidateDelegate(testEnv);
    const relFile = 'supabase/migrations/20260330_init.sql';

    const r = runDelegateHook(hookPath, `${testEnv.tmpDir}/${relFile}`, {
      IS_TEAMMATE: 'true',
    });

    expect(r.exitCode).toBe(2);
    const pendingDir = join(testEnv.tmpDir, '.claude', 'runtime', 'approvals', 'pending');
    expect(existsSync(join(pendingDir, `${approvalKey(relFile)}.json`))).toBe(true);
  });

  it('APR-3: 팀원 + .claude/ + 승인 있음 → exit 0', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidateDelegate(testEnv);
    const relFile = '.claude/hooks/test.sh';

    // 승인 파일 생성 (현재 시각)
    grantApproval(testEnv.tmpDir, relFile);

    const r = runDelegateHook(hookPath, `${testEnv.tmpDir}/${relFile}`, {
      IS_TEAMMATE: 'true',
    });

    expect(r.exitCode).toBe(0);
  });

  it('APR-4: 팀원 + .claude/ + 거부 → exit 2', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidateDelegate(testEnv);
    const relFile = '.claude/hooks/test.sh';

    // 거부 파일 생성 (granted 파일에 "rejected" 기록)
    const dir = join(testEnv.tmpDir, '.claude', 'runtime', 'approvals', 'granted');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, approvalKey(relFile)), 'rejected');

    const r = runDelegateHook(hookPath, `${testEnv.tmpDir}/${relFile}`, {
      IS_TEAMMATE: 'true',
    });

    expect(r.exitCode).toBe(2);
  });

  it('APR-5: 팀원 + .claude/ + 만료 승인 (10분 전) → exit 2', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidateDelegate(testEnv);
    const relFile = '.claude/hooks/test.sh';

    // 10분 전 승인 (만료)
    const tenMinAgo = Math.floor(Date.now() / 1000) - 600;
    grantApproval(testEnv.tmpDir, relFile, tenMinAgo);

    const r = runDelegateHook(hookPath, `${testEnv.tmpDir}/${relFile}`, {
      IS_TEAMMATE: 'true',
    });

    expect(r.exitCode).toBe(2);
  });

  it('APR-6: approval-handler.sh 로드 실패 → exit 2 fallback', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidateDelegate(testEnv);
    const relFile = '.claude/hooks/test.sh';

    // helpers/approval-handler.sh 삭제 (로드 실패 시뮬레이션)
    const ahPath = join(testEnv.hooksDir, 'helpers', 'approval-handler.sh');
    if (existsSync(ahPath)) {
      require('fs').unlinkSync(ahPath);
    }

    const r = runDelegateHook(hookPath, `${testEnv.tmpDir}/${relFile}`, {
      IS_TEAMMATE: 'true',
    });

    // approval-handler 없어도 기존 exit 2 차단은 유지
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('BLOCKED');
  });

  it('APR-7: 리더 + .claude/ → exit 0 (승인 대상 아님, 리더는 .claude/ 수정 가능)', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidateDelegate(testEnv);

    // 리더(IS_TEAMMATE=false) + .claude/ → 승인 게이트 진입 안 함 → exit 0
    // (리더의 src/ 차단은 tmux pane_index 기반이라 별도 테스트 불가)
    const r = runDelegateHook(hookPath, `${testEnv.tmpDir}/.claude/hooks/test.sh`, {
      IS_TEAMMATE: 'false',
      TMUX: '',
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '',
    });

    expect(r.exitCode).toBe(0);
  });

  it('APR-8: 팀원 + src/ 일반 코드 → exit 0 (승인 불필요)', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidateDelegate(testEnv);

    const r = runDelegateHook(hookPath, `${testEnv.tmpDir}/src/components/Button.tsx`, {
      IS_TEAMMATE: 'true',
      TMUX: '',
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '',
    });

    expect(r.exitCode).toBe(0);
  });

  it('APR-9: 팀원 + .env 수정 → exit 2 + pending 생성', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidateDelegate(testEnv);
    const relFile = '.env.local';

    const r = runDelegateHook(hookPath, `${testEnv.tmpDir}/${relFile}`, {
      IS_TEAMMATE: 'true',
    });

    expect(r.exitCode).toBe(2);
    const pendingDir = join(testEnv.tmpDir, '.claude', 'runtime', 'approvals', 'pending');
    expect(existsSync(join(pendingDir, `${approvalKey(relFile)}.json`))).toBe(true);
  });
});
