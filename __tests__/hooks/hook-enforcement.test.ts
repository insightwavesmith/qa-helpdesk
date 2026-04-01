// __tests__/hooks/hook-enforcement.test.ts
// Hook 강제 + COO Pane 제한 — 7개 항목 전체 TDD
// C-01~C-63: pane-access-guard, enforce-spawn, prevent-tmux-kill,
//            validate-coo-approval, validate-task-fields,
//            filter-completion-dm, validate-slack-payload

import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { createTestEnv, cleanupTestEnv } from './helpers';

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

// ─────────────────────────────────────────────
// 공통 헬퍼
// ─────────────────────────────────────────────

const baseEnv: Record<string, string> = {
  PATH: process.env.PATH || '',
  HOME: process.env.HOME || '',
  SHELL: process.env.SHELL || '',
};

/** stdin으로 tool_input JSON 파이핑하여 hook 실행 */
function runBashHook(
  hookPath: string,
  command: string,
  env: Record<string, string> = {},
): { exitCode: number; stdout: string; stderr: string } {
  const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
  try {
    const stdout = execSync(
      `echo '${input.replace(/'/g, "'\\''")}' | bash "${hookPath}"`,
      { encoding: 'utf-8', env: { ...baseEnv, ...env } as NodeJS.ProcessEnv, timeout: 5000 },
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

/** 비-Bash tool 입력으로 hook 실행 */
function runNonBashHook(
  hookPath: string,
  toolName: string,
  env: Record<string, string> = {},
): { exitCode: number; stdout: string; stderr: string } {
  const input = JSON.stringify({ tool_name: toolName, tool_input: {} });
  try {
    const stdout = execSync(
      `echo '${input.replace(/'/g, "'\\''")}' | bash "${hookPath}"`,
      { encoding: 'utf-8', env: { ...baseEnv, ...env } as NodeJS.ProcessEnv, timeout: 5000 },
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

/** pane-access-guard.sh 준비 (tmux mock 포함) */
function preparePaneAccessGuard(
  env: ReturnType<typeof createTestEnv>,
  opts: { callerSession?: string; callerPane?: number },
): string {
  const hookContent = `#!/bin/bash
# pane-access-guard.sh — 팀원 pane 직접 접근 차단 (A0-7) [테스트용]
# exit 0 = 허용, exit 2 = 차단

[ -z "$TMUX" ] && exit 0

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tool = data.get('tool_name', '')
    if tool != 'Bash':
        sys.exit(0)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

[ -z "$COMMAND" ] && exit 0
echo "$COMMAND" | grep -qE 'tmux\\s+send-keys?' || exit 0

# 타겟 파싱
TARGET=$(echo "$COMMAND" | grep -oE -- '-t\\s+["'"'"']?([a-zA-Z0-9_-]+(:[0-9]+)?\\.([0-9]+))' | grep -oE '[a-zA-Z0-9_-]+(:[0-9]+)?\\.[0-9]+$' | head -1)

if [ -z "$TARGET" ]; then
    TARGET=$(echo "$COMMAND" | grep -oE 'send-keys?\\s+.*-t\\s+["'"'"']?([a-zA-Z0-9_-]+(:[0-9]+)?\\.([0-9]+))' | grep -oE '[a-zA-Z0-9_-]+(:[0-9]+)?\\.[0-9]+$' | head -1)
fi

[ -z "$TARGET" ] && exit 0

TARGET_SESSION=$(echo "$TARGET" | sed -E 's/(:[0-9]+)?\\.[0-9]+$//')
TARGET_PANE=$(echo "$TARGET" | grep -oE '\\.[0-9]+$' | tr -d '.')

[ -z "$TARGET_PANE" ] && exit 0
[ "$TARGET_PANE" -eq 0 ] 2>/dev/null && exit 0

# 호출자 판별 (테스트에서는 환경변수로 mock)
CALLER_SESSION="\${MOCK_CALLER_SESSION:-}"
CALLER_PANE="\${MOCK_CALLER_PANE:-}"

[ "$CALLER_SESSION" = "$TARGET_SESSION" ] && [ "$CALLER_PANE" = "0" ] && exit 0

echo "[pane-access-guard] 차단: 팀원 pane 직접 접근 금지 (A0-7)" >&2
echo "   명령어: $COMMAND" >&2
echo "   대상: \${TARGET_SESSION}.\${TARGET_PANE} (팀원)" >&2
echo "   리더 pane으로 전달하세요: \${TARGET_SESSION}.0" >&2
exit 2
`;
  const destPath = join(env.hooksDir, 'pane-access-guard.sh');
  writeFileSync(destPath, hookContent, { mode: 0o755 });
  return destPath;
}

/** enforce-spawn.sh 준비 */
function prepareEnforceSpawn(env: ReturnType<typeof createTestEnv>): string {
  const hookContent = `#!/bin/bash
# enforce-spawn.sh — spawn.sh 미사용 차단 (A0-8) [테스트용]
[ -z "$TMUX" ] && exit 0
[ -z "$CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" ] && exit 0

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tool = data.get('tool_name', '')
    if tool != 'Bash':
        sys.exit(0)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

[ -z "$COMMAND" ] && exit 0

echo "$COMMAND" | grep -qE 'spawn\\.sh' && exit 0
echo "$COMMAND" | grep -qE 'claude-peers|claude-code|claude\\s+--version|claude\\s+--help' && exit 0

if echo "$COMMAND" | grep -qE '(^|\\s|/)(claude)\\s+(--resume|-p\\s|--print|-c\\s|--continue)'; then
    echo "[enforce-spawn] 차단: claude 직접 실행 감지 (A0-8)" >&2
    echo "   명령어: $COMMAND" >&2
    echo "   spawn.sh를 사용하세요: bash .bkit/hooks/spawn.sh" >&2
    exit 2
fi

exit 0
`;
  const destPath = join(env.hooksDir, 'enforce-spawn.sh');
  writeFileSync(destPath, hookContent, { mode: 0o755 });
  return destPath;
}

/** prevent-tmux-kill.sh 준비 */
function preparePreventTmuxKill(env: ReturnType<typeof createTestEnv>): string {
  const hookContent = `#!/bin/bash
# prevent-tmux-kill.sh — tmux kill 차단 (A0-4) [테스트용]
[ -z "$TMUX" ] && exit 0

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tool = data.get('tool_name', '')
    if tool != 'Bash':
        sys.exit(0)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

[ -z "$COMMAND" ] && exit 0

if echo "$COMMAND" | grep -qE 'tmux\\s+kill-(session|pane|server)'; then
    KILL_TYPE=$(echo "$COMMAND" | grep -oE 'kill-(session|pane|server)')
    echo "[prevent-tmux-kill] 차단: tmux $KILL_TYPE 감지 (A0-4)" >&2
    echo "   명령어: $COMMAND" >&2
    echo "   /exit 명령으로 정상 종료하세요." >&2
    exit 2
fi

exit 0
`;
  const destPath = join(env.hooksDir, 'prevent-tmux-kill.sh');
  writeFileSync(destPath, hookContent, { mode: 0o755 });
  return destPath;
}

/** validate-coo-approval.sh 준비 */
function prepareValidateCooApproval(
  env: ReturnType<typeof createTestEnv>,
  taskDir: string,
): string {
  const hookContent = `#!/bin/bash
# validate-coo-approval.sh — coo_approved 게이팅 (A0-1) [테스트용]
[ -z "$TMUX" ] && exit 0

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tool = data.get('tool_name', '')
    if tool != 'Bash':
        sys.exit(0)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

[ -z "$COMMAND" ] && exit 0

echo "$COMMAND" | grep -qE 'spawn\\.sh' || exit 0

TASK_FILE=$(echo "$COMMAND" | grep -oE 'TASK-[A-Z0-9_-]+\\.md' | head -1)
[ -z "$TASK_FILE" ] && exit 0

TASK_DIR="${taskDir}"
TASK_PATH="$TASK_DIR/$TASK_FILE"

if [ ! -f "$TASK_PATH" ]; then
    echo "[validate-coo-approval] 차단: TASK 파일 미존재" >&2
    echo "   파일: $TASK_PATH" >&2
    exit 2
fi

if ! grep -qE 'coo_approved:\\s*true' "$TASK_PATH"; then
    echo "[validate-coo-approval] 차단: Smith님 승인 필요 (A0-1)" >&2
    echo "   TASK: $TASK_FILE" >&2
    echo "   coo_approved: true가 없습니다." >&2
    exit 2
fi

exit 0
`;
  const destPath = join(env.hooksDir, 'validate-coo-approval.sh');
  writeFileSync(destPath, hookContent, { mode: 0o755 });
  return destPath;
}

/** validate-task-fields.sh 준비 */
function prepareValidateTaskFields(
  env: ReturnType<typeof createTestEnv>,
  taskDir: string,
): string {
  const hookContent = `#!/bin/bash
# validate-task-fields.sh — 레벨/담당팀 게이팅 (A0-1) [테스트용]
[ -z "$TMUX" ] && exit 0

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tool = data.get('tool_name', '')
    if tool != 'Bash':
        sys.exit(0)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

[ -z "$COMMAND" ] && exit 0

echo "$COMMAND" | grep -qE 'spawn\\.sh' || exit 0

TASK_FILE=$(echo "$COMMAND" | grep -oE 'TASK-[A-Z0-9_-]+\\.md' | head -1)
[ -z "$TASK_FILE" ] && exit 0

TASK_DIR="${taskDir}"
TASK_PATH="$TASK_DIR/$TASK_FILE"

[ ! -f "$TASK_PATH" ] && exit 2

if ! grep -qE '(^|\\s)(L[0-3])(\\s|$|,|기능|버그)' "$TASK_PATH"; then
    echo "[validate-task-fields] 차단: 레벨 미기입" >&2
    echo "   TASK: $TASK_FILE" >&2
    exit 2
fi

if ! grep -qE '담당.*sdk-|sdk-(cto|pm)' "$TASK_PATH"; then
    echo "[validate-task-fields] 차단: 담당팀 미기입" >&2
    echo "   TASK: $TASK_FILE" >&2
    exit 2
fi

exit 0
`;
  const destPath = join(env.hooksDir, 'validate-task-fields.sh');
  writeFileSync(destPath, hookContent, { mode: 0o755 });
  return destPath;
}

/** filter-completion-dm.sh 준비 */
function prepareFilterCompletionDm(env: ReturnType<typeof createTestEnv>): string {
  const hookContent = `#!/bin/bash
# filter-completion-dm.sh — 팀원 DM 차단 (A0-3) [테스트용]
[ -z "$TMUX" ] && exit 0
[ -z "$CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" ] && exit 0

CALLER_PANE="\${MOCK_CALLER_PANE:-0}"

[ "$CALLER_PANE" = "0" ] && exit 0

echo "[filter-completion-dm] 차단: 팀원 완료 DM 금지 (A0-3)" >&2
echo "   pane: $CALLER_PANE (팀원)" >&2
echo "   완료 보고는 리더(pane 0)만 할 수 있습니다." >&2
exit 2
`;
  const destPath = join(env.hooksDir, 'filter-completion-dm.sh');
  writeFileSync(destPath, hookContent, { mode: 0o755 });
  return destPath;
}

/** validate-slack-payload.sh 준비 */
function prepareValidateSlackPayload(env: ReturnType<typeof createTestEnv>): string {
  const hookContent = `#!/bin/bash
# validate-slack-payload.sh — 슬랙 알림 필터 (A0-2) [테스트용]

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tool = data.get('tool_name', '')
    if tool != 'Bash':
        sys.exit(0)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

[ -z "$COMMAND" ] && exit 0

echo "$COMMAND" | grep -qE 'curl.*hooks\\.slack\\.com' || exit 0

PAYLOAD=$(echo "$COMMAND" | grep -oE "(-d|--data)\\s+'[^']*'" | sed "s/^-d\\s*'//;s/^--data\\s*'//;s/'$//")
if [ -z "$PAYLOAD" ]; then
    PAYLOAD=$(echo "$COMMAND" | grep -oE '(-d|--data[-a-z]*)\\s+"[^"]*"' | sed 's/^-d\\s*"//;s/^--data[-a-z]*\\s*"//;s/"$//')
fi

if ! echo "$PAYLOAD" | grep -qE '(TASK[-_]NAME|TASK-[A-Z0-9_-]+)'; then
    echo "[validate-slack-payload] 차단: TASK_NAME 누락 (A0-2)" >&2
    exit 2
fi

if ! echo "$PAYLOAD" | grep -qE '(team|팀|sdk-)'; then
    echo "[validate-slack-payload] 차단: 팀명 누락 (A0-2)" >&2
    exit 2
fi

exit 0
`;
  const destPath = join(env.hooksDir, 'validate-slack-payload.sh');
  writeFileSync(destPath, hookContent, { mode: 0o755 });
  return destPath;
}

/** TASK 파일 생성 헬퍼 (coo_approved, 레벨, 담당팀 제어) */
function writeTestTask(
  dir: string,
  name: string,
  opts: { approved?: boolean | null; level?: string | null; team?: string | null },
): void {
  mkdirSync(dir, { recursive: true });
  let content = `# ${name}\n`;
  if (opts.approved === true) content += `coo_approved: true\n`;
  if (opts.approved === false) content += `coo_approved: false\n`;
  if (opts.level) content += `> L${opts.level.replace('L', '')} 기능\n`;
  if (opts.team) content += `> 담당: ${opts.team}\n`;
  writeFileSync(join(dir, name), content);
}

const TMUX_ENV = { TMUX: '/tmp/tmux-501/default,12345,0' };
const TEAMS_ENV = { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' };
const FULL_ENV = { ...TMUX_ENV, ...TEAMS_ENV };

// ═════════════════════════════════════════════
// 항목 1: pane-access-guard.sh (C-01 ~ C-20)
// ═════════════════════════════════════════════

describe('항목 1: pane-access-guard — 팀원 pane 접근 차단', () => {

  // 6.1 기본 차단 케이스
  it('C-01: COO가 CTO 팀원 pane 1 접근 → exit 2', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runBashHook(hook, 'tmux send-keys -t sdk-cto.1 "ls"', {
      ...TMUX_ENV, MOCK_CALLER_SESSION: 'mozzi', MOCK_CALLER_PANE: '0',
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('팀원 pane 직접 접근 금지');
  });

  it('C-02: COO가 CTO 팀원 pane 2 접근 → exit 2', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runBashHook(hook, 'tmux send-keys -t sdk-cto.2 "ls"', TMUX_ENV);
    expect(r.exitCode).toBe(2);
  });

  it('C-03: COO가 PM 팀원 pane 접근 → exit 2', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runBashHook(hook, 'tmux send-keys -t sdk-pm.1 "ls"', TMUX_ENV);
    expect(r.exitCode).toBe(2);
  });

  it('C-04: PM 리더가 CTO 팀원 접근 → exit 2 (타 팀)', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runBashHook(hook, 'tmux send-keys -t sdk-cto.1 "ls"', {
      ...TMUX_ENV, MOCK_CALLER_SESSION: 'sdk-pm', MOCK_CALLER_PANE: '0',
    });
    expect(r.exitCode).toBe(2);
  });

  it('C-05: CTO 팀원이 다른 팀원 접근 → exit 2 (팀원→팀원)', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runBashHook(hook, 'tmux send-keys -t sdk-cto.2 "ls"', {
      ...TMUX_ENV, MOCK_CALLER_SESSION: 'sdk-cto', MOCK_CALLER_PANE: '1',
    });
    expect(r.exitCode).toBe(2);
  });

  // 6.2 허용 케이스
  it('C-06: COO가 CTO 리더 pane 0 접근 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runBashHook(hook, 'tmux send-keys -t sdk-cto.0 "ls"', TMUX_ENV);
    expect(r.exitCode).toBe(0);
  });

  it('C-07: CTO 리더가 자기 팀원 접근 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runBashHook(hook, 'tmux send-keys -t sdk-cto.1 "ls"', {
      ...TMUX_ENV, MOCK_CALLER_SESSION: 'sdk-cto', MOCK_CALLER_PANE: '0',
    });
    expect(r.exitCode).toBe(0);
  });

  it('C-08: CTO 리더가 자기 팀원 pane 3 접근 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runBashHook(hook, 'tmux send-keys -t sdk-cto.3 "text"', {
      ...TMUX_ENV, MOCK_CALLER_SESSION: 'sdk-cto', MOCK_CALLER_PANE: '0',
    });
    expect(r.exitCode).toBe(0);
  });

  it('C-09: pane 미지정 접근 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runBashHook(hook, 'tmux send-keys -t sdk-cto "ls"', TMUX_ENV);
    expect(r.exitCode).toBe(0);
  });

  it('C-10: tmux 아닌 명령 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runBashHook(hook, 'echo "hello"', TMUX_ENV);
    expect(r.exitCode).toBe(0);
  });

  // 6.3 변형 구문 케이스
  it('C-11: window:pane 형태 → exit 2', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runBashHook(hook, 'tmux send-keys -t sdk-cto:0.2 "text"', TMUX_ENV);
    expect(r.exitCode).toBe(2);
  });

  it('C-12: 따옴표 타겟 → exit 2', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runBashHook(hook, 'tmux send-keys -t "sdk-cto.1" "text"', TMUX_ENV);
    expect(r.exitCode).toBe(2);
  });

  it('C-13: -t 뒤 위치 → exit 2', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runBashHook(hook, 'tmux send-keys "text" -t sdk-cto.1', TMUX_ENV);
    expect(r.exitCode).toBe(2);
  });

  it('C-14: send-key 단수형 → exit 2', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runBashHook(hook, 'tmux send-key -t sdk-cto.1 "text"', TMUX_ENV);
    expect(r.exitCode).toBe(2);
  });

  it('C-15: 비-tmux 환경 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runBashHook(hook, 'tmux send-keys -t sdk-cto.1 "text"', {});
    expect(r.exitCode).toBe(0);
  });

  // 6.4 리다이렉트 안내 케이스
  it('C-16: 차단 시 stderr에 리더 pane 안내', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runBashHook(hook, 'tmux send-keys -t sdk-cto.1 "ls"', TMUX_ENV);
    expect(r.stderr).toContain('sdk-cto.0');
  });

  it('C-17: 차단 시 stderr에 원칙 번호 A0-7 포함', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runBashHook(hook, 'tmux send-keys -t sdk-cto.1 "ls"', TMUX_ENV);
    expect(r.stderr).toContain('A0-7');
  });

  it('C-18: 차단 시 원래 명령어 표시', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runBashHook(hook, 'tmux send-keys -t sdk-cto.1 "ls"', TMUX_ENV);
    expect(r.stderr).toContain('tmux send-keys');
  });

  // 6.5 비-Bash tool 케이스
  it('C-19: Edit tool 입력 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runNonBashHook(hook, 'Edit', TMUX_ENV);
    expect(r.exitCode).toBe(0);
  });

  it('C-20: Write tool 입력 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = preparePaneAccessGuard(testEnv, {});
    const r = runNonBashHook(hook, 'Write', TMUX_ENV);
    expect(r.exitCode).toBe(0);
  });
});

// ═════════════════════════════════════════════
// 항목 2: enforce-spawn.sh (C-21 ~ C-28)
// ═════════════════════════════════════════════

describe('항목 2: enforce-spawn — spawn.sh 미사용 차단', () => {

  it('C-21: bare claude --resume → exit 2', () => {
    testEnv = createTestEnv();
    const hook = prepareEnforceSpawn(testEnv);
    const r = runBashHook(hook, 'claude --resume abc123', FULL_ENV);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('spawn.sh');
  });

  it('C-22: bare claude -p → exit 2', () => {
    testEnv = createTestEnv();
    const hook = prepareEnforceSpawn(testEnv);
    const r = runBashHook(hook, 'claude -p "hello"', FULL_ENV);
    expect(r.exitCode).toBe(2);
  });

  it('C-23: spawn.sh 경유 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = prepareEnforceSpawn(testEnv);
    const r = runBashHook(hook, 'bash .bkit/hooks/spawn.sh --team sdk-cto', FULL_ENV);
    expect(r.exitCode).toBe(0);
  });

  it('C-24: claude-peers 명령 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = prepareEnforceSpawn(testEnv);
    const r = runBashHook(hook, 'claude-peers list', FULL_ENV);
    expect(r.exitCode).toBe(0);
  });

  it('C-25: claude --version → exit 0', () => {
    testEnv = createTestEnv();
    const hook = prepareEnforceSpawn(testEnv);
    const r = runBashHook(hook, 'claude --version', FULL_ENV);
    expect(r.exitCode).toBe(0);
  });

  it('C-26: 비-tmux 환경 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = prepareEnforceSpawn(testEnv);
    const r = runBashHook(hook, 'claude --resume abc123', TEAMS_ENV);
    expect(r.exitCode).toBe(0);
  });

  it('C-27: 비-TEAMS 환경 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = prepareEnforceSpawn(testEnv);
    const r = runBashHook(hook, 'claude --resume abc123', TMUX_ENV);
    expect(r.exitCode).toBe(0);
  });

  it('C-28: claude --continue → exit 2', () => {
    testEnv = createTestEnv();
    const hook = prepareEnforceSpawn(testEnv);
    const r = runBashHook(hook, 'claude --continue', FULL_ENV);
    expect(r.exitCode).toBe(2);
  });
});

// ═════════════════════════════════════════════
// 항목 3: prevent-tmux-kill.sh (C-29 ~ C-35)
// ═════════════════════════════════════════════

describe('항목 3: prevent-tmux-kill — tmux kill 차단', () => {

  it('C-29: tmux kill-session → exit 2', () => {
    testEnv = createTestEnv();
    const hook = preparePreventTmuxKill(testEnv);
    const r = runBashHook(hook, 'tmux kill-session -t sdk-cto', TMUX_ENV);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('/exit');
  });

  it('C-30: tmux kill-pane → exit 2', () => {
    testEnv = createTestEnv();
    const hook = preparePreventTmuxKill(testEnv);
    const r = runBashHook(hook, 'tmux kill-pane -t sdk-cto.1', TMUX_ENV);
    expect(r.exitCode).toBe(2);
  });

  it('C-31: tmux kill-server → exit 2', () => {
    testEnv = createTestEnv();
    const hook = preparePreventTmuxKill(testEnv);
    const r = runBashHook(hook, 'tmux kill-server', TMUX_ENV);
    expect(r.exitCode).toBe(2);
  });

  it('C-32: tmux list-panes (무관) → exit 0', () => {
    testEnv = createTestEnv();
    const hook = preparePreventTmuxKill(testEnv);
    const r = runBashHook(hook, 'tmux list-panes', TMUX_ENV);
    expect(r.exitCode).toBe(0);
  });

  it('C-33: tmux send-keys (무관) → exit 0', () => {
    testEnv = createTestEnv();
    const hook = preparePreventTmuxKill(testEnv);
    const r = runBashHook(hook, 'tmux send-keys -t sdk-cto.0 "ls"', TMUX_ENV);
    expect(r.exitCode).toBe(0);
  });

  it('C-34: 비-tmux 명령 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = preparePreventTmuxKill(testEnv);
    const r = runBashHook(hook, 'echo "hello"', TMUX_ENV);
    expect(r.exitCode).toBe(0);
  });

  it('C-35: 비-tmux 환경 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = preparePreventTmuxKill(testEnv);
    const r = runBashHook(hook, 'tmux kill-session -t sdk-cto', {});
    expect(r.exitCode).toBe(0);
  });
});

// ═════════════════════════════════════════════
// 항목 4: validate-coo-approval.sh (C-36 ~ C-42)
// ═════════════════════════════════════════════

describe('항목 4: validate-coo-approval — coo_approved 게이팅', () => {

  it('C-36: coo_approved: true → exit 0', () => {
    testEnv = createTestEnv();
    const taskDir = join(testEnv.tmpDir, 'tasks');
    writeTestTask(taskDir, 'TASK-TEST-001.md', { approved: true, level: 'L2', team: 'sdk-cto' });
    const hook = prepareValidateCooApproval(testEnv, taskDir);
    const r = runBashHook(hook, 'bash .bkit/hooks/spawn.sh TASK-TEST-001.md', TMUX_ENV);
    expect(r.exitCode).toBe(0);
  });

  it('C-37: coo_approved: false → exit 2', () => {
    testEnv = createTestEnv();
    const taskDir = join(testEnv.tmpDir, 'tasks');
    writeTestTask(taskDir, 'TASK-TEST-002.md', { approved: false, level: 'L2', team: 'sdk-cto' });
    const hook = prepareValidateCooApproval(testEnv, taskDir);
    const r = runBashHook(hook, 'bash .bkit/hooks/spawn.sh TASK-TEST-002.md', TMUX_ENV);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('승인');
  });

  it('C-38: coo_approved 필드 없음 → exit 2', () => {
    testEnv = createTestEnv();
    const taskDir = join(testEnv.tmpDir, 'tasks');
    writeTestTask(taskDir, 'TASK-TEST-003.md', { approved: null, level: 'L2', team: 'sdk-cto' });
    const hook = prepareValidateCooApproval(testEnv, taskDir);
    const r = runBashHook(hook, 'bash .bkit/hooks/spawn.sh TASK-TEST-003.md', TMUX_ENV);
    expect(r.exitCode).toBe(2);
  });

  it('C-39: TASK 파일 미존재 → exit 2', () => {
    testEnv = createTestEnv();
    const taskDir = join(testEnv.tmpDir, 'tasks');
    mkdirSync(taskDir, { recursive: true });
    const hook = prepareValidateCooApproval(testEnv, taskDir);
    const r = runBashHook(hook, 'bash .bkit/hooks/spawn.sh TASK-NONEXIST-001.md', TMUX_ENV);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('미존재');
  });

  it('C-40: spawn.sh 아닌 명령 → exit 0', () => {
    testEnv = createTestEnv();
    const taskDir = join(testEnv.tmpDir, 'tasks');
    const hook = prepareValidateCooApproval(testEnv, taskDir);
    const r = runBashHook(hook, 'echo "hello"', TMUX_ENV);
    expect(r.exitCode).toBe(0);
  });

  it('C-41: 비-tmux 환경 → exit 0', () => {
    testEnv = createTestEnv();
    const taskDir = join(testEnv.tmpDir, 'tasks');
    const hook = prepareValidateCooApproval(testEnv, taskDir);
    const r = runBashHook(hook, 'bash .bkit/hooks/spawn.sh TASK-TEST-001.md', {});
    expect(r.exitCode).toBe(0);
  });

  it('C-42: coo_approved:  true (공백 변형) → exit 0', () => {
    testEnv = createTestEnv();
    const taskDir = join(testEnv.tmpDir, 'tasks');
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(join(taskDir, 'TASK-TEST-004.md'), '# TASK\ncoo_approved:  true\nL2 기능\n담당: sdk-cto\n');
    const hook = prepareValidateCooApproval(testEnv, taskDir);
    const r = runBashHook(hook, 'bash .bkit/hooks/spawn.sh TASK-TEST-004.md', TMUX_ENV);
    expect(r.exitCode).toBe(0);
  });
});

// ═════════════════════════════════════════════
// 항목 5: validate-task-fields.sh (C-43 ~ C-49)
// ═════════════════════════════════════════════

describe('항목 5: validate-task-fields — 레벨/담당팀 게이팅', () => {

  it('C-43: 레벨 + 담당팀 모두 존재 → exit 0', () => {
    testEnv = createTestEnv();
    const taskDir = join(testEnv.tmpDir, 'tasks');
    writeTestTask(taskDir, 'TASK-TEST-010.md', { approved: true, level: 'L2', team: 'sdk-cto' });
    const hook = prepareValidateTaskFields(testEnv, taskDir);
    const r = runBashHook(hook, 'bash .bkit/hooks/spawn.sh TASK-TEST-010.md', TMUX_ENV);
    expect(r.exitCode).toBe(0);
  });

  it('C-44: 레벨 누락 → exit 2', () => {
    testEnv = createTestEnv();
    const taskDir = join(testEnv.tmpDir, 'tasks');
    writeTestTask(taskDir, 'TASK-TEST-011.md', { approved: true, level: null, team: 'sdk-cto' });
    const hook = prepareValidateTaskFields(testEnv, taskDir);
    const r = runBashHook(hook, 'bash .bkit/hooks/spawn.sh TASK-TEST-011.md', TMUX_ENV);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('레벨');
  });

  it('C-45: 담당팀 누락 → exit 2', () => {
    testEnv = createTestEnv();
    const taskDir = join(testEnv.tmpDir, 'tasks');
    writeTestTask(taskDir, 'TASK-TEST-012.md', { approved: true, level: 'L2', team: null });
    const hook = prepareValidateTaskFields(testEnv, taskDir);
    const r = runBashHook(hook, 'bash .bkit/hooks/spawn.sh TASK-TEST-012.md', TMUX_ENV);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('담당팀');
  });

  it('C-46: 둘 다 누락 → exit 2', () => {
    testEnv = createTestEnv();
    const taskDir = join(testEnv.tmpDir, 'tasks');
    writeTestTask(taskDir, 'TASK-TEST-013.md', { approved: true, level: null, team: null });
    const hook = prepareValidateTaskFields(testEnv, taskDir);
    const r = runBashHook(hook, 'bash .bkit/hooks/spawn.sh TASK-TEST-013.md', TMUX_ENV);
    expect(r.exitCode).toBe(2);
  });

  it('C-47: L0 레벨 → exit 0', () => {
    testEnv = createTestEnv();
    const taskDir = join(testEnv.tmpDir, 'tasks');
    writeTestTask(taskDir, 'TASK-TEST-014.md', { approved: true, level: 'L0', team: 'sdk-cto' });
    const hook = prepareValidateTaskFields(testEnv, taskDir);
    const r = runBashHook(hook, 'bash .bkit/hooks/spawn.sh TASK-TEST-014.md', TMUX_ENV);
    expect(r.exitCode).toBe(0);
  });

  it('C-48: L3 레벨 → exit 0', () => {
    testEnv = createTestEnv();
    const taskDir = join(testEnv.tmpDir, 'tasks');
    writeTestTask(taskDir, 'TASK-TEST-015.md', { approved: true, level: 'L3', team: 'sdk-pm' });
    const hook = prepareValidateTaskFields(testEnv, taskDir);
    const r = runBashHook(hook, 'bash .bkit/hooks/spawn.sh TASK-TEST-015.md', TMUX_ENV);
    expect(r.exitCode).toBe(0);
  });

  it('C-49: spawn.sh 아닌 명령 → exit 0', () => {
    testEnv = createTestEnv();
    const taskDir = join(testEnv.tmpDir, 'tasks');
    const hook = prepareValidateTaskFields(testEnv, taskDir);
    const r = runBashHook(hook, 'npm run build', TMUX_ENV);
    expect(r.exitCode).toBe(0);
  });
});

// ═════════════════════════════════════════════
// 항목 6: filter-completion-dm.sh (C-50 ~ C-55)
// ═════════════════════════════════════════════

describe('항목 6: filter-completion-dm — 팀원 DM 차단', () => {

  it('C-50: 리더(pane 0) 완료 보고 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = prepareFilterCompletionDm(testEnv);
    const r = runBashHook(hook, '', { ...FULL_ENV, MOCK_CALLER_PANE: '0' });
    expect(r.exitCode).toBe(0);
  });

  it('C-51: 팀원(pane 1) 완료 보고 → exit 2', () => {
    testEnv = createTestEnv();
    const hook = prepareFilterCompletionDm(testEnv);
    const r = runBashHook(hook, '', { ...FULL_ENV, MOCK_CALLER_PANE: '1' });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('리더(pane 0)');
  });

  it('C-52: 팀원(pane 2) 완료 보고 → exit 2', () => {
    testEnv = createTestEnv();
    const hook = prepareFilterCompletionDm(testEnv);
    const r = runBashHook(hook, '', { ...FULL_ENV, MOCK_CALLER_PANE: '2' });
    expect(r.exitCode).toBe(2);
  });

  it('C-53: 비-tmux 환경 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = prepareFilterCompletionDm(testEnv);
    const r = runBashHook(hook, '', { MOCK_CALLER_PANE: '1' });
    expect(r.exitCode).toBe(0);
  });

  it('C-54: 비-TEAMS 환경 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = prepareFilterCompletionDm(testEnv);
    const r = runBashHook(hook, '', { ...TMUX_ENV, MOCK_CALLER_PANE: '1' });
    expect(r.exitCode).toBe(0);
  });

  it('C-55: 차단 시 stderr에 역할 경계 안내', () => {
    testEnv = createTestEnv();
    const hook = prepareFilterCompletionDm(testEnv);
    const r = runBashHook(hook, '', { ...FULL_ENV, MOCK_CALLER_PANE: '1' });
    expect(r.stderr).toContain('A0-3');
  });
});

// ═════════════════════════════════════════════
// 항목 7: validate-slack-payload.sh (C-56 ~ C-63)
// ═════════════════════════════════════════════

describe('항목 7: validate-slack-payload — 슬랙 알림 필터', () => {

  it('C-56: TASK_NAME + 팀명 포함 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = prepareValidateSlackPayload(testEnv);
    const r = runBashHook(
      hook,
      `curl -X POST https://hooks.slack.com/services/T00/B00/xxx -d '{"TASK_NAME":"TASK-001","team":"sdk-cto","text":"완료"}'`,
      {},
    );
    expect(r.exitCode).toBe(0);
  });

  it('C-57: TASK_NAME 누락 → exit 2', () => {
    testEnv = createTestEnv();
    const hook = prepareValidateSlackPayload(testEnv);
    const r = runBashHook(
      hook,
      `curl -X POST https://hooks.slack.com/services/T00/B00/xxx -d '{"team":"sdk-cto","text":"완료"}'`,
      {},
    );
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('TASK_NAME');
  });

  it('C-58: 팀명 누락 → exit 2', () => {
    testEnv = createTestEnv();
    const hook = prepareValidateSlackPayload(testEnv);
    const r = runBashHook(
      hook,
      `curl -X POST https://hooks.slack.com/services/T00/B00/xxx -d '{"TASK_NAME":"TASK-001","text":"완료"}'`,
      {},
    );
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('팀명');
  });

  it('C-59: 둘 다 누락 → exit 2', () => {
    testEnv = createTestEnv();
    const hook = prepareValidateSlackPayload(testEnv);
    const r = runBashHook(
      hook,
      `curl -X POST https://hooks.slack.com/services/T00/B00/xxx -d '{"text":"hello"}'`,
      {},
    );
    expect(r.exitCode).toBe(2);
  });

  it('C-60: 슬랙 아닌 curl → exit 0', () => {
    testEnv = createTestEnv();
    const hook = prepareValidateSlackPayload(testEnv);
    const r = runBashHook(
      hook,
      'curl https://api.example.com/data',
      {},
    );
    expect(r.exitCode).toBe(0);
  });

  it('C-61: 비-curl 명령 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = prepareValidateSlackPayload(testEnv);
    const r = runBashHook(hook, 'echo "hello"', {});
    expect(r.exitCode).toBe(0);
  });

  it('C-62: TASK- 패턴으로 TASK_NAME 충족 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = prepareValidateSlackPayload(testEnv);
    const r = runBashHook(
      hook,
      `curl -X POST https://hooks.slack.com/services/T00/B00/xxx -d '{"text":"TASK-COO completed","team":"sdk-cto"}'`,
      {},
    );
    expect(r.exitCode).toBe(0);
  });

  it('C-63: sdk- 패턴으로 팀명 충족 → exit 0', () => {
    testEnv = createTestEnv();
    const hook = prepareValidateSlackPayload(testEnv);
    const r = runBashHook(
      hook,
      `curl -X POST https://hooks.slack.com/services/T00/B00/xxx -d '{"TASK_NAME":"TASK-001","text":"sdk-pm completed"}'`,
      {},
    );
    expect(r.exitCode).toBe(0);
  });
});
