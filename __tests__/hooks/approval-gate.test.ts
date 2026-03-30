// __tests__/hooks/approval-gate.test.ts
// APR-1~APR-9: validate-delegate.sh 승인 게이트 TDD
//
// B1 requireApproval: 팀원 위험 파일 수정 시
// exit 2 무조건 차단 → 승인 파일 기반 게이트로 전환

import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { runBashFunction } from './helpers';
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

// ─── P1-1~6: 승인 자동 감지 (notify_leader_approval) ──────────

/** approval-handler.sh를 tmux mock 포함하여 준비 */
function prepareApprovalHandler(
  env: ReturnType<typeof createTestEnv>,
  opts?: { mockTmux?: boolean; tmuxSessionName?: string; tmuxPaneIndex?: number }
): { scriptPath: string; sendKeysLog: string } {
  const helpersDir = join(env.hooksDir, 'helpers');
  mkdirSync(helpersDir, { recursive: true });

  const src = join(process.cwd(), '.claude/hooks/helpers/approval-handler.sh');
  let content = readFileSync(src, 'utf-8');

  // _APPROVAL_DIR 치환
  content = content.replace(
    /\$\{PROJECT_DIR:-[^}]*\}/,
    env.tmpDir
  );

  const sendKeysLog = join(env.tmpDir, 'tmux-sendkeys.log');

  if (opts?.mockTmux) {
    const mockTmux = join(env.tmpDir, 'mock-tmux.sh');
    const sessionName = opts.tmuxSessionName || 'test-session';
    const paneIndex = opts.tmuxPaneIndex ?? 1;

    writeFileSync(mockTmux, `#!/bin/bash
ARGS="$*"
if echo "$ARGS" | grep -q "display-message.*session_name"; then
    echo "${sessionName}"
    exit 0
fi
if echo "$ARGS" | grep -q "display-message.*pane_index"; then
    echo "${paneIndex}"
    exit 0
fi
if echo "$ARGS" | grep -q "send-keys"; then
    echo "$ARGS" >> "${sendKeysLog}"
    exit 0
fi
exit 0
`, { mode: 0o755 });

    content = content.replace(/tmux /g, `"${mockTmux}" `);
  }

  // notify-hook stub
  writeFileSync(
    join(env.hooksDir, 'notify-hook.sh'),
    '#!/bin/bash\nnotify_hook() { true; }\n',
    { mode: 0o755 }
  );

  const destPath = join(helpersDir, 'approval-handler.sh');
  writeFileSync(destPath, content, { mode: 0o755 });
  return { scriptPath: destPath, sendKeysLog };
}

describe('P1-1~6: 승인 자동 감지 notify_leader_approval', () => {

  it('P1-1: 팀원 pending 생성 시 send-keys 호출', () => {
    testEnv = createTestEnv();
    const { scriptPath, sendKeysLog } = prepareApprovalHandler(testEnv, { mockTmux: true });

    const r = runBashFunction(scriptPath, 'request_approval ".claude/hooks/test.sh" "Edit"', {
      TMUX: '/tmp/tmux-501/default,12345,0',
    });

    // pending 파일 확인
    const key = approvalKey('.claude/hooks/test.sh');
    const pendingPath = join(testEnv.tmpDir, '.claude', 'runtime', 'approvals', 'pending', `${key}.json`);
    expect(existsSync(pendingPath)).toBe(true);

    // send-keys 호출 확인
    expect(existsSync(sendKeysLog)).toBe(true);
    const log = readFileSync(sendKeysLog, 'utf-8');
    expect(log).toContain('send-keys');
    expect(log).toContain('승인요청');
  });

  it('P1-2: tmux 없는 환경에서 알림 스킵', () => {
    testEnv = createTestEnv();
    const { scriptPath, sendKeysLog } = prepareApprovalHandler(testEnv, { mockTmux: true });

    const r = runBashFunction(scriptPath, 'request_approval ".claude/hooks/test.sh" "Edit"', {
      TMUX: '',
    });

    // pending 파일 생성됨
    const key = approvalKey('.claude/hooks/test.sh');
    const pendingPath = join(testEnv.tmpDir, '.claude', 'runtime', 'approvals', 'pending', `${key}.json`);
    expect(existsSync(pendingPath)).toBe(true);

    // send-keys 미호출 (TMUX 없으므로)
    expect(existsSync(sendKeysLog)).toBe(false);
  });

  it('P1-3: 리더 승인 후 팀원 재시도 → return 0 (승인)', () => {
    testEnv = createTestEnv();
    const { scriptPath } = prepareApprovalHandler(testEnv);
    const relFile = '.claude/hooks/test.sh';

    // 승인 파일 생성
    grantApproval(testEnv.tmpDir, relFile);

    const r = runBashFunction(scriptPath, `check_approval "${relFile}"`, {});
    expect(r.exitCode).toBe(0);
  });

  it('P1-4: 리더 거부 후 팀원 재시도 → return 1 (미승인)', () => {
    testEnv = createTestEnv();
    const { scriptPath } = prepareApprovalHandler(testEnv);
    const relFile = '.claude/hooks/test.sh';

    // 거부 파일 생성
    const dir = join(testEnv.tmpDir, '.claude', 'runtime', 'approvals', 'granted');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, approvalKey(relFile)), 'rejected');

    const r = runBashFunction(scriptPath, `check_approval "${relFile}"; echo "EXIT:$?"`, {});
    // check_approval returns 1 → set -e catches → exitCode != 0
    expect(r.exitCode).not.toBe(0);
  });

  it('P1-5: 승인 TTL 만료 후 재알림', () => {
    testEnv = createTestEnv();
    const { scriptPath, sendKeysLog } = prepareApprovalHandler(testEnv, { mockTmux: true });
    const relFile = '.claude/hooks/test.sh';

    // 6분 전 승인 (만료)
    const sixMinAgo = Math.floor(Date.now() / 1000) - 360;
    grantApproval(testEnv.tmpDir, relFile, sixMinAgo);

    // check_approval → return 1 (만료)
    const rCheck = runBashFunction(scriptPath, `check_approval "${relFile}"; echo "EXIT:$?"`, {});
    expect(rCheck.exitCode).not.toBe(0);

    // 재요청 시 send-keys 재호출
    const rReq = runBashFunction(scriptPath, `request_approval "${relFile}" "Edit"`, {
      TMUX: '/tmp/tmux-501/default,12345,0',
    });
    expect(existsSync(sendKeysLog)).toBe(true);
    const log = readFileSync(sendKeysLog, 'utf-8');
    expect(log).toContain('send-keys');
  });

  it('P1-6: 동시 다중 팀원 요청 → 각각 별도 pending + send-keys', () => {
    testEnv = createTestEnv();
    const { scriptPath, sendKeysLog } = prepareApprovalHandler(testEnv, { mockTmux: true });

    const file1 = '.claude/hooks/custom-hook.sh';
    const file2 = 'supabase/migrations/20260330_create_table.sql';

    // 2개 파일 동시 요청
    runBashFunction(scriptPath, `request_approval "${file1}" "Edit"`, {
      TMUX: '/tmp/tmux-501/default,12345,0',
    });
    runBashFunction(scriptPath, `request_approval "${file2}" "Write"`, {
      TMUX: '/tmp/tmux-501/default,12345,0',
    });

    // 각각 별도 pending
    const pendingDir = join(testEnv.tmpDir, '.claude', 'runtime', 'approvals', 'pending');
    expect(existsSync(join(pendingDir, `${approvalKey(file1)}.json`))).toBe(true);
    expect(existsSync(join(pendingDir, `${approvalKey(file2)}.json`))).toBe(true);

    // send-keys 2회 호출 (각 request_approval마다)
    expect(existsSync(sendKeysLog)).toBe(true);
    const log = readFileSync(sendKeysLog, 'utf-8');
    const sendKeysCount = (log.match(/send-keys/g) || []).length;
    expect(sendKeysCount).toBeGreaterThanOrEqual(2);
  });
});
