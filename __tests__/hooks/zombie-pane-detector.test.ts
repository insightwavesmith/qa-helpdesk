// __tests__/hooks/zombie-pane-detector.test.ts — 좀비 pane 감지+정리 TDD
// ZD-1~ZD-12: 좀비 pane 감지 + 정리 + 리더 보호 + SessionStart 통합
//
// 실제 tmux 없이 테스트: tmux/pgrep/ps를 mock 스크립트로 치환
// 3가지 좀비 유형:
//   1. shell_only — pane_index > 0, claude/node/bun 프로세스 없음
//   2. config_inactive — config.json isActive=false
//   3. registry_terminated — registry state=terminated

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import {
  createTestEnv, runHook, cleanupTestEnv,
  writeRegistry,
} from './helpers';

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

/**
 * zombie-pane-detector.sh를 테스트 환경에 맞게 준비.
 * tmux, pgrep, ps 명령을 mock으로 치환.
 */
function prepareZombieDetector(
  env: ReturnType<typeof createTestEnv>,
  opts: {
    tmuxPanes?: Array<{
      paneIndex: number;
      paneId: string;
      panePid: number;
      paneCmd: string;
    }>;
    childProcesses?: Record<number, string[]>; // pid → [child commands]
    configInactive?: Array<{ tmuxPaneId: string; name: string }>;
    registryTerminated?: Array<{ paneId: string; name: string }>;
    sessionName?: string;
    hasTmux?: boolean;
  }
): string {
  const src = join(process.cwd(), '.claude/hooks/helpers/zombie-pane-detector.sh');
  let content = readFileSync(src, 'utf-8');

  // PROJECT_DIR 치환
  content = content.replace(
    /_ZPD_PROJECT_DIR="\$\{PROJECT_DIR:-[^}]*\}"/,
    `_ZPD_PROJECT_DIR="${env.tmpDir}"`
  );

  // tmux mock 생성
  const hasTmux = opts.hasTmux !== false;
  const panes = opts.tmuxPanes || [];
  const sessionName = opts.sessionName || 'sdk-cto';

  // tmux list-sessions 출력
  const sessions = hasTmux ? sessionName : '';

  // tmux list-panes 출력
  const panesOutput = panes
    .map(p => `${p.paneIndex} ${p.paneId} ${p.panePid} ${p.paneCmd}`)
    .join('\\n');

  const mockTmux = join(env.tmpDir, 'mock-tmux.sh');
  writeFileSync(mockTmux, `#!/bin/bash
ARGS="$*"

# tmux info
if echo "$ARGS" | grep -q "^info"; then
    ${hasTmux ? 'exit 0' : 'exit 1'}
fi

# tmux display-message (session name)
if echo "$ARGS" | grep -q "display-message"; then
    echo "${sessionName}"
    exit 0
fi

# tmux list-sessions
if echo "$ARGS" | grep -q "list-sessions"; then
    echo "${sessions}"
    exit 0
fi

# tmux list-panes
if echo "$ARGS" | grep -q "list-panes"; then
    echo -e "${panesOutput}"
    exit 0
fi

# tmux kill-pane
if echo "$ARGS" | grep -q "kill-pane"; then
    echo "killed"
    exit 0
fi

exit 0
`, { mode: 0o755 });

  // pgrep mock — 자식 프로세스 시뮬레이션
  const childProcs = opts.childProcesses || {};
  const mockPgrep = join(env.tmpDir, 'mock-pgrep.sh');

  // pgrep -P <pid> → child PIDs 반환
  const pgrepCases = Object.entries(childProcs)
    .map(([pid, children]) => {
      // 가짜 child PID 생성 (pid*10+i)
      const childPids = children.map((_, i) => Number(pid) * 10 + i);
      return `    ${pid}) echo "${childPids.join('\\n')}"; exit 0 ;;`;
    })
    .join('\n');

  writeFileSync(mockPgrep, `#!/bin/bash
# mock pgrep -P <parent_pid>
PPID_ARG=""
while [ $# -gt 0 ]; do
    case "$1" in
        -P) shift; PPID_ARG="$1" ;;
    esac
    shift
done

case "$PPID_ARG" in
${pgrepCases}
    *) exit 1 ;;
esac
`, { mode: 0o755 });

  // ps mock — 프로세스 이름 반환
  const mockPs = join(env.tmpDir, 'mock-ps.sh');
  const psCases: string[] = [];
  for (const [pid, children] of Object.entries(childProcs)) {
    children.forEach((cmd, i) => {
      const childPid = Number(pid) * 10 + i;
      psCases.push(`    ${childPid}) echo "${cmd}" ;;`);
    });
  }

  writeFileSync(mockPs, `#!/bin/bash
# mock ps -p <pid> -o comm=
PID_ARG=""
while [ $# -gt 0 ]; do
    case "$1" in
        -p) shift; PID_ARG="$1" ;;
    esac
    shift
done

case "$PID_ARG" in
${psCases.join('\n')}
    *) echo "bash" ;;
esac
`, { mode: 0o755 });

  // tmux, pgrep, ps 명령 치환
  // command -v tmux → mock
  content = content.replace(
    /command -v tmux >\/dev\/null 2>&1/,
    `test -f "${mockTmux}"`
  );
  content = content.replace(
    /tmux info >\/dev\/null 2>&1/,
    `"${mockTmux}" info >/dev/null 2>&1`
  );

  // tmux 호출 전부 mock으로
  content = content.replace(/tmux /g, `"${mockTmux}" `);

  // pgrep 치환
  content = content.replace(/pgrep /g, `"${mockPgrep}" `);

  // ps 치환
  content = content.replace(/ps /g, `"${mockPs}" `);

  // jq는 실제 사용 (시스템에 있음)

  // config.json mock (isActive=false 멤버)
  if (opts.configInactive && opts.configInactive.length > 0) {
    const configDir = join(env.tmpDir, '.claude', 'teams', 'test-team');
    mkdirSync(configDir, { recursive: true });
    const members = opts.configInactive.map(m => ({
      name: m.name,
      tmuxPaneId: m.tmuxPaneId,
      isActive: false,
    }));
    writeFileSync(join(configDir, 'config.json'), JSON.stringify({ members }));

    // ls -t ~/.claude/teams/*/config.json → mock
    content = content.replace(
      /ls -t ~\/\.claude\/teams\/\*\/config\.json 2>\/dev\/null \| head -1/,
      `echo "${join(configDir, 'config.json')}"`
    );
  } else {
    // config 없는 경우
    content = content.replace(
      /ls -t ~\/\.claude\/teams\/\*\/config\.json 2>\/dev\/null \| head -1/,
      'echo ""'
    );
  }

  // registry mock (terminated 멤버)
  if (opts.registryTerminated && opts.registryTerminated.length > 0) {
    const members: Record<string, { paneId: string; state: string }> = {};
    for (const m of opts.registryTerminated) {
      members[m.name] = { paneId: m.paneId, state: 'terminated' };
    }
    writeRegistry(env.tmpDir, { team: 'CTO', shutdownState: 'done', members });
  }

  // helpers 디렉토리에 저장
  const helpersDir = join(env.hooksDir, 'helpers');
  mkdirSync(helpersDir, { recursive: true });
  const destPath = join(helpersDir, 'zombie-pane-detector.sh');
  writeFileSync(destPath, content, { mode: 0o755 });
  return destPath;
}

// ─── 좀비 감지 ─────────────────────────────────────────────

describe('zombie-pane-detector — 감지', () => {

  // ZD-1: 좀비 없는 정상 상태 — shell_only 아닌 pane (claude 프로세스 있음)
  it('ZD-1: 정상 pane (claude 프로세스 있음) → 좀비 0건', () => {
    testEnv = createTestEnv();
    const scriptPath = prepareZombieDetector(testEnv, {
      tmuxPanes: [
        { paneIndex: 0, paneId: '%0', panePid: 1000, paneCmd: 'node' },
        { paneIndex: 1, paneId: '%1', panePid: 1001, paneCmd: 'node' },
      ],
      childProcesses: {
        1001: ['claude'],
      },
    });

    const result = runHook(scriptPath, {
      TMUX: '/tmp/tmux-501/default,12345,0',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('좀비 pane 없음');
  });

  // ZD-2: shell_only 좀비 — pane_index > 0, bash만 실행 중
  it('ZD-2: shell_only 좀비 — bash만 남은 pane 감지', () => {
    testEnv = createTestEnv();
    const scriptPath = prepareZombieDetector(testEnv, {
      tmuxPanes: [
        { paneIndex: 0, paneId: '%0', panePid: 1000, paneCmd: 'node' },
        { paneIndex: 1, paneId: '%1', panePid: 1001, paneCmd: 'bash' },
      ],
      childProcesses: {
        // 1001에는 claude/node/bun 자식이 없음
      },
    });

    const result = runHook(scriptPath, {
      TMUX: '/tmp/tmux-501/default,12345,0',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('좀비 pane 1건 감지');
    expect(result.stdout).toContain('shell_only');
  });

  // ZD-3: config_inactive 좀비 — config.json에 isActive=false
  it('ZD-3: config_inactive — isActive=false인데 pane 살아있음', () => {
    testEnv = createTestEnv();
    const scriptPath = prepareZombieDetector(testEnv, {
      tmuxPanes: [
        { paneIndex: 0, paneId: '%0', panePid: 1000, paneCmd: 'node' },
        { paneIndex: 1, paneId: '%1', panePid: 1001, paneCmd: 'node' },
      ],
      childProcesses: {
        1001: ['node'],  // 프로세스 있지만 config에서 inactive
      },
      configInactive: [
        { tmuxPaneId: '%1', name: 'backend-dev' },
      ],
    });

    const result = runHook(scriptPath, {
      TMUX: '/tmp/tmux-501/default,12345,0',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('좀비 pane 1건 감지');
    expect(result.stdout).toContain('config_inactive');
  });

  // ZD-4: registry_terminated 좀비 — registry에 terminated이지만 pane 존재
  it('ZD-4: registry_terminated — terminated인데 pane 살아있음', () => {
    testEnv = createTestEnv();
    const scriptPath = prepareZombieDetector(testEnv, {
      tmuxPanes: [
        { paneIndex: 0, paneId: '%0', panePid: 1000, paneCmd: 'node' },
        { paneIndex: 1, paneId: '%1', panePid: 1001, paneCmd: 'node' },
      ],
      childProcesses: {
        1001: ['node'],  // 프로세스 있지만 registry에서 terminated
      },
      registryTerminated: [
        { paneId: '%1', name: 'qa-engineer' },
      ],
    });

    const result = runHook(scriptPath, {
      TMUX: '/tmp/tmux-501/default,12345,0',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('좀비 pane 1건 감지');
    expect(result.stdout).toContain('registry_terminated');
  });

  // ZD-5: 리더 pane (index 0) → 절대 좀비로 감지 안 됨
  it('ZD-5: 리더 pane (index 0) — bash만 있어도 좀비 아님', () => {
    testEnv = createTestEnv();
    const scriptPath = prepareZombieDetector(testEnv, {
      tmuxPanes: [
        { paneIndex: 0, paneId: '%0', panePid: 1000, paneCmd: 'bash' },
      ],
      childProcesses: {},
    });

    const result = runHook(scriptPath, {
      TMUX: '/tmp/tmux-501/default,12345,0',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('좀비 pane 없음');
  });

  // ZD-6: 복합 좀비 — shell_only 2건 + registry_terminated 1건
  it('ZD-6: 복합 좀비 3건 동시 감지', () => {
    testEnv = createTestEnv();
    const scriptPath = prepareZombieDetector(testEnv, {
      tmuxPanes: [
        { paneIndex: 0, paneId: '%0', panePid: 1000, paneCmd: 'node' },
        { paneIndex: 1, paneId: '%1', panePid: 1001, paneCmd: 'bash' },
        { paneIndex: 2, paneId: '%2', panePid: 1002, paneCmd: 'zsh' },
        { paneIndex: 3, paneId: '%3', panePid: 1003, paneCmd: 'node' },
      ],
      childProcesses: {
        1003: ['node'],
      },
      registryTerminated: [
        { paneId: '%3', name: 'code-analyzer' },
      ],
    });

    const result = runHook(scriptPath, {
      TMUX: '/tmp/tmux-501/default,12345,0',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('좀비 pane 3건 감지');
  });

  // ZD-7: tmux 미설치 시 → 에러 없이 종료
  it('ZD-7: tmux 미설치 → 좀비 0건, 에러 없음', () => {
    testEnv = createTestEnv();
    const scriptPath = prepareZombieDetector(testEnv, {
      hasTmux: false,
      tmuxPanes: [],
    });

    const result = runHook(scriptPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('좀비 pane 없음');
  });

  // ZD-8: sdk- 접두사 없는 세션 → 검사 skip
  it('ZD-8: 비-SDK 세션 → 검사 건너뜀', () => {
    testEnv = createTestEnv();
    const scriptPath = prepareZombieDetector(testEnv, {
      sessionName: 'regular-session',  // sdk- 접두사 없음
      tmuxPanes: [
        { paneIndex: 0, paneId: '%0', panePid: 1000, paneCmd: 'node' },
        { paneIndex: 1, paneId: '%1', panePid: 1001, paneCmd: 'bash' },
      ],
      childProcesses: {},
    });

    const result = runHook(scriptPath, {
      TMUX: '/tmp/tmux-501/default,12345,0',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('좀비 pane 없음');
  });
});

// ─── 좀비 정리 ─────────────────────────────────────────────

describe('zombie-pane-detector — 정리', () => {

  // ZD-9: kill 모드 — 좀비 pane 실제 kill
  it('ZD-9: kill 모드 → 좀비 pane 정리 완료', () => {
    testEnv = createTestEnv();
    const scriptPath = prepareZombieDetector(testEnv, {
      tmuxPanes: [
        { paneIndex: 0, paneId: '%0', panePid: 1000, paneCmd: 'node' },
        { paneIndex: 1, paneId: '%1', panePid: 1001, paneCmd: 'bash' },
        { paneIndex: 2, paneId: '%2', panePid: 1002, paneCmd: 'zsh' },
      ],
      childProcesses: {},
    });

    // kill 모드로 직접 실행
    const result = runHook(scriptPath, {
      TMUX: '/tmp/tmux-501/default,12345,0',
      ZPD_MODE: 'kill',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('정리 완료');
  });

  // ZD-10: report 모드 — 감지만 하고 kill 안 함
  it('ZD-10: report 모드 → 감지만, kill 없음', () => {
    testEnv = createTestEnv();
    const scriptPath = prepareZombieDetector(testEnv, {
      tmuxPanes: [
        { paneIndex: 0, paneId: '%0', panePid: 1000, paneCmd: 'node' },
        { paneIndex: 1, paneId: '%1', panePid: 1001, paneCmd: 'bash' },
      ],
      childProcesses: {},
    });

    const result = runHook(scriptPath, {
      TMUX: '/tmp/tmux-501/default,12345,0',
      ZPD_MODE: 'report',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('좀비 pane 1건 감지');
    // kill 문구가 없어야 함
    expect(result.stdout).not.toContain('[KILL]');
  });

  // ZD-11: kill 모드에서도 리더 pane (index 0) 보호
  it('ZD-11: kill 모드에서 리더 pane 보호', () => {
    testEnv = createTestEnv();
    const scriptPath = prepareZombieDetector(testEnv, {
      tmuxPanes: [
        { paneIndex: 0, paneId: '%0', panePid: 1000, paneCmd: 'node' },
        { paneIndex: 1, paneId: '%1', panePid: 1001, paneCmd: 'bash' },
      ],
      childProcesses: {},
    });

    const result = runHook(scriptPath, {
      TMUX: '/tmp/tmux-501/default,12345,0',
      ZPD_MODE: 'kill',
    });
    expect(result.exitCode).toBe(0);
    // 리더 kill 시도 없음
    expect(result.stdout).not.toContain('%0');
    // 좀비만 kill
    expect(result.stdout).toContain('1건 정리 완료');
  });

  // ZD-12: 좀비 없을 때 kill 모드 → "좀비 pane 없음"
  it('ZD-12: 좀비 없으면 kill 모드에서도 "없음" 출력', () => {
    testEnv = createTestEnv();
    const scriptPath = prepareZombieDetector(testEnv, {
      tmuxPanes: [
        { paneIndex: 0, paneId: '%0', panePid: 1000, paneCmd: 'node' },
      ],
      childProcesses: {},
    });

    const result = runHook(scriptPath, {
      TMUX: '/tmp/tmux-501/default,12345,0',
      ZPD_MODE: 'kill',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('좀비 pane 없음');
  });
});
