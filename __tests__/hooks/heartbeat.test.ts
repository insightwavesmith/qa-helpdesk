// __tests__/hooks/heartbeat.test.ts
// P5-1~P5-6: heartbeat 검증 TDD

import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { createTestEnv, cleanupTestEnv, runHook } from './helpers';

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

/** teammate-idle.sh를 테스트용으로 준비 (heartbeat 기능 검증) */
function prepareTeammateIdle(
  env: ReturnType<typeof createTestEnv>,
  opts?: {
    mockZombie?: boolean;
    zombieCount?: number;
    teamContext?: { team: string; taskFiles?: string[] };
  }
): string {
  const src = join(process.cwd(), '.claude/hooks/teammate-idle.sh');
  let content = readFileSync(src, 'utf-8');

  // PROJECT_DIR 치환
  content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);

  // team-context-resolver.sh stub
  const helpersDir = join(env.hooksDir, 'helpers');
  mkdirSync(helpersDir, { recursive: true });
  writeFileSync(
    join(helpersDir, 'team-context-resolver.sh'),
    '#!/bin/bash\nresolve_team_context() { true; }\n',
    { mode: 0o755 }
  );

  // team-context 파일
  if (opts?.teamContext) {
    const runtimeDir = join(env.tmpDir, '.claude', 'runtime');
    mkdirSync(runtimeDir, { recursive: true });
    writeFileSync(join(runtimeDir, 'team-context.json'), JSON.stringify({
      team: opts.teamContext.team,
      session: 'test',
      created: new Date().toISOString(),
      taskFiles: opts.teamContext.taskFiles || [],
      teammates: [],
    }));
  }

  // zombie-pane-detector.sh mock
  if (opts?.mockZombie) {
    const zCount = opts.zombieCount ?? 1;
    writeFileSync(
      join(helpersDir, 'zombie-pane-detector.sh'),
      `#!/bin/bash
detect_zombie_panes() {
    ZOMBIE_COUNT=${zCount}
    ZOMBIE_DETAILS="  - test pane#1 (%1): shell_only"
}
`, { mode: 0o755 });
  } else {
    writeFileSync(
      join(helpersDir, 'zombie-pane-detector.sh'),
      `#!/bin/bash
detect_zombie_panes() {
    ZOMBIE_COUNT=0
    ZOMBIE_DETAILS=""
}
`, { mode: 0o755 });
  }

  // tmux mock (팀원 상태 수집용)
  const mockTmux = join(env.tmpDir, 'mock-tmux.sh');
  writeFileSync(mockTmux, `#!/bin/bash
ARGS="$*"
if echo "$ARGS" | grep -q "display-message"; then
    echo "test-session"
    exit 0
fi
if echo "$ARGS" | grep -q "list-panes"; then
    echo "0 node"
    echo "1 node"
    exit 0
fi
exit 0
`, { mode: 0o755 });
  content = content.replace(/tmux /g, `"${mockTmux}" `);

  // jq가 없을 때 대비
  // (jq는 시스템에 있으니 그대로 사용)

  const destPath = join(env.hooksDir, 'teammate-idle.sh');
  writeFileSync(destPath, content, { mode: 0o755 });
  return destPath;
}

/** heartbeat-watchdog.sh를 테스트용으로 준비 */
function prepareWatchdog(
  env: ReturnType<typeof createTestEnv>
): string {
  const src = join(process.cwd(), '.claude/hooks/heartbeat-watchdog.sh');
  let content = readFileSync(src, 'utf-8');
  content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);

  const destPath = join(env.hooksDir, 'heartbeat-watchdog.sh');
  writeFileSync(destPath, content, { mode: 0o755 });
  return destPath;
}

describe('P5-1~6: heartbeat 검증', () => {

  it.skip('P5-1: heartbeat 발동 시 로그 기록 — V2에서 teammate-idle.sh 삭제됨', () => {
    testEnv = createTestEnv();

    // TASK 없음 → 모든 완료 → exit 0
    const hookPath = prepareTeammateIdle(testEnv);
    const r = runHook(hookPath);

    // heartbeat.log 확인
    const logPath = join(testEnv.tmpDir, '.claude', 'runtime', 'heartbeat.log');
    expect(existsSync(logPath)).toBe(true);
    const log = readFileSync(logPath, 'utf-8');
    expect(log).toContain('heartbeat fired');
  });

  it.skip('P5-2: 좀비 pane 감지 시 ZOMBIE 기록 — V2에서 teammate-idle.sh 삭제됨', () => {
    testEnv = createTestEnv();

    const hookPath = prepareTeammateIdle(testEnv, {
      mockZombie: true,
      zombieCount: 2,
    });
    const r = runHook(hookPath);

    const logPath = join(testEnv.tmpDir, '.claude', 'runtime', 'heartbeat.log');
    expect(existsSync(logPath)).toBe(true);
    const log = readFileSync(logPath, 'utf-8');
    expect(log).toContain('ZOMBIE 2건');
  });

  it('P5-3: watchdog — 정상 (최근 기록) → exit 0', () => {
    testEnv = createTestEnv();
    const watchdogPath = prepareWatchdog(testEnv);

    // 최근 heartbeat 기록 (로컬 시간)
    const runtimeDir = join(testEnv.tmpDir, '.claude', 'runtime');
    mkdirSync(runtimeDir, { recursive: true });
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    writeFileSync(join(runtimeDir, 'heartbeat.log'), `${ts} heartbeat fired\n`);

    const r = runHook(watchdogPath);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('heartbeat 정상');
  });

  it('P5-4: watchdog — 이상 (20분 전 기록) → exit 1', () => {
    testEnv = createTestEnv();
    const watchdogPath = prepareWatchdog(testEnv);

    // 20분 전 기록
    const runtimeDir = join(testEnv.tmpDir, '.claude', 'runtime');
    mkdirSync(runtimeDir, { recursive: true });
    const past = new Date(Date.now() - 20 * 60 * 1000);
    const ts = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')} ${String(past.getHours()).padStart(2, '0')}:${String(past.getMinutes()).padStart(2, '0')}:${String(past.getSeconds()).padStart(2, '0')}`;
    writeFileSync(join(runtimeDir, 'heartbeat.log'), `${ts} heartbeat fired\n`);

    const r = runHook(watchdogPath);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('heartbeat 미발동');
  });

  it('P5-5: watchdog — 로그 미존재 → exit 1', () => {
    testEnv = createTestEnv();
    const watchdogPath = prepareWatchdog(testEnv);

    // heartbeat.log 미생성
    const r = runHook(watchdogPath);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('미존재');
  });

  it.skip('P5-6: 팀원 상태 수집 — V2에서 teammate-idle.sh 삭제됨', () => {
    testEnv = createTestEnv();

    const hookPath = prepareTeammateIdle(testEnv, {
      teamContext: { team: 'CTO', taskFiles: [] },
    });
    const r = runHook(hookPath);

    const logPath = join(testEnv.tmpDir, '.claude', 'runtime', 'heartbeat.log');
    expect(existsSync(logPath)).toBe(true);
    const log = readFileSync(logPath, 'utf-8');
    expect(log).toContain('team=CTO');
  });
});
