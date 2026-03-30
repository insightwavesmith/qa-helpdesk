// __tests__/hooks/helpers.ts — Hook 테스트 공통 헬퍼
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, copyFileSync, existsSync, readdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { tmpdir } from 'os';

const FIXTURES_DIR = join(__dirname, 'fixtures');

interface HookResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function createTestEnv() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hook-test-'));
  const tasksDir = join(tmpDir, '.claude', 'tasks');
  const runtimeDir = join(tmpDir, '.bkit', 'runtime');
  const hooksDir = join(tmpDir, '.claude', 'hooks');
  mkdirSync(tasksDir, { recursive: true });
  mkdirSync(runtimeDir, { recursive: true });
  mkdirSync(hooksDir, { recursive: true });
  return { tmpDir, tasksDir, runtimeDir, hooksDir };
}

export function runHook(scriptPath: string, env: Record<string, string> = {}): HookResult {
  try {
    const stdout = execSync(`bash "${scriptPath}"`, {
      encoding: 'utf-8',
      env: { ...process.env, ...env },
      timeout: 10000,
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err: any) {
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    };
  }
}

export function cleanupTestEnv(tmpDir: string) {
  rmSync(tmpDir, { recursive: true, force: true });
}

export function prepareHookScript(
  originalPath: string,
  tmpDir: string,
  hooksDir: string
): string {
  const content = readFileSync(originalPath, 'utf-8');
  const patched = content.replace(
    /PROJECT_DIR="[^"]*"/,
    `PROJECT_DIR="${tmpDir}"`
  );
  const destPath = join(hooksDir, basename(originalPath));
  writeFileSync(destPath, patched, { mode: 0o755 });

  // is-teammate.sh도 복사 (source 의존)
  const isTeammateSrc = join(dirname(originalPath), 'is-teammate.sh');
  if (existsSync(isTeammateSrc)) {
    copyFileSync(isTeammateSrc, join(hooksDir, 'is-teammate.sh'));
  }

  return destPath;
}

/**
 * fixtures/ 디렉토리에서 JSON 파일을 로드한다.
 */
export function loadFixture<T = unknown>(name: string): T {
  const filePath = join(FIXTURES_DIR, name);
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

/**
 * fixtures/ 디렉토리에서 텍스트 파일(md 등)을 로드한다.
 */
export function loadFixtureText(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8');
}

/**
 * tmpDir/.bkit/runtime/teammate-registry.json에 레지스트리를 생성한다.
 */
export function createTempRegistry(tmpDir: string, data: Record<string, unknown>): string {
  const registryPath = join(tmpDir, '.bkit', 'runtime', 'teammate-registry.json');
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, JSON.stringify(data, null, 2));
  return registryPath;
}

/**
 * bash 스크립트를 source 후 특정 함수를 실행하고 결과를 반환한다.
 * 주로 auto-shutdown.sh의 set_member_state 등 유닛 테스트에 사용.
 */
export function runBashFunction(
  scriptPath: string,
  functionCall: string,
  env: Record<string, string> = {}
): HookResult {
  const wrapper = `#!/bin/bash
set -euo pipefail
source "${scriptPath}"
${functionCall}
`
  const wrapperPath = join(dirname(scriptPath), '_test_wrapper.sh');
  writeFileSync(wrapperPath, wrapper, { mode: 0o755 });
  const result = runHook(wrapperPath, env);
  try { rmSync(wrapperPath); } catch {}
  return result;
}

/**
 * prepareHookScript 확장 — helpers/ 디렉토리까지 복사.
 * auto-team-cleanup.sh처럼 helpers/frontmatter-parser.sh를 source하는 스크립트용.
 */
export function prepareHookWithHelpers(
  originalPath: string,
  tmpDir: string,
  hooksDir: string
): string {
  const destPath = prepareHookScript(originalPath, tmpDir, hooksDir);

  // helpers/ 디렉토리 복사
  const helpersDir = join(dirname(originalPath), 'helpers');
  const destHelpersDir = join(hooksDir, 'helpers');
  if (existsSync(helpersDir)) {
    mkdirSync(destHelpersDir, { recursive: true });
    const files = readdirSync(helpersDir) as string[];
    for (const f of files) {
      copyFileSync(join(helpersDir, f), join(destHelpersDir, f));
    }
  }

  return destPath;
}

/** analysis 파일에 Match Rate 기록 */
export function writeAnalysisFile(tmpDir: string, rate: number): void {
  const dir = join(tmpDir, 'docs', '03-analysis');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'test.analysis.md'), `# Gap 분석\n## Match Rate: ${rate}%\n`);
}

/** team-context.json 생성 */
export function writeTeamContext(tmpDir: string, team: string): void {
  const dir = join(tmpDir, '.bkit', 'runtime');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'team-context.json'), JSON.stringify({
    team, session: 'test', created: new Date().toISOString(),
    taskFiles: ['TASK-TEST.md'], teammates: []
  }));
}

/** pdca-status.json 생성 */
export function writePdcaStatus(tmpDir: string, data: Record<string, unknown>): void {
  const dir = join(tmpDir, '.bkit', 'state');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'pdca-status.json'), JSON.stringify({
    ...data, updatedAt: new Date().toISOString()
  }));
}

/** TASK 파일 생성 (frontmatter 포함) */
export function writeTaskFile(tmpDir: string, name: string, status: string): void {
  const dir = join(tmpDir, '.claude', 'tasks');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), `---\nteam: CTO\nstatus: ${status}\n---\n# ${name}\n`);
}

/** registry 생성 */
export function writeRegistry(tmpDir: string, data: Record<string, unknown>): void {
  const dir = join(tmpDir, '.bkit', 'runtime');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'teammate-registry.json'), JSON.stringify({
    ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  }));
}

/** 빈 registry (좀비 없음) */
export function writeEmptyRegistry(tmpDir: string): void {
  writeRegistry(tmpDir, { team: 'CTO', shutdownState: 'done', members: {} });
}

/**
 * pdca-chain-handoff.sh v2 준비.
 * git diff를 mock하기 위해 스크립트 내부의 git 명령을 치환.
 * broker curl을 mock하기 위해 가짜 curl wrapper 생성.
 */
export function prepareChainHandoffV2(
  env: ReturnType<typeof createTestEnv>,
  opts: {
    changedFiles?: string[];
    mockBroker?: {
      health: boolean;
      peers?: Array<{ id: string; summary: string }>;
      sendOk?: boolean;
    };
  }
): string {
  const originalPath = join(process.cwd(), '.claude/hooks/pdca-chain-handoff.sh');
  let content = readFileSync(originalPath, 'utf-8');

  // PROJECT_DIR 치환
  content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);

  // git diff mock
  const files = (opts.changedFiles || []).join('\\n');
  content = content.replace(
    /git diff HEAD~1 --name-only 2>\/dev\/null/g,
    `echo -e "${files}"`
  );

  // git log mock (g flag: L0/L1 path + L2/L3 path 두 곳 모두 치환)
  content = content.replace(
    /git log --oneline -1 2>\/dev\/null/g,
    'echo "abc1234 test commit"'
  );

  // broker curl mock
  if (opts.mockBroker) {
    const mockScript = createMockCurl(env.tmpDir, opts.mockBroker);
    content = content.replace(/curl /g, `${mockScript} `);
  }

  const destPath = join(env.hooksDir, 'pdca-chain-handoff.sh');
  writeFileSync(destPath, content, { mode: 0o755 });

  // helpers 복사
  const helpersDir = join(env.hooksDir, 'helpers');
  mkdirSync(helpersDir, { recursive: true });
  copyFileSync(
    join(process.cwd(), '.claude/hooks/helpers/match-rate-parser.sh'),
    join(helpersDir, 'match-rate-parser.sh')
  );

  // is-teammate.sh mock (실제 파일은 tmux pane_index 감지로 agent-teams 환경에서 오탐)
  writeFileSync(
    join(env.hooksDir, 'is-teammate.sh'),
    '#!/bin/bash\nIS_TEAMMATE="${IS_TEAMMATE:-false}"\n',
    { mode: 0o755 }
  );

  // detect-process-level.sh — 빈 파일로 stub (source해도 에러 안 나게)
  writeFileSync(join(env.hooksDir, 'detect-process-level.sh'), '#!/bin/bash\n# stub\n', { mode: 0o755 });

  return destPath;
}

/** session-resume-check.sh 준비 */
export function prepareSessionResumeCheck(
  env: ReturnType<typeof createTestEnv>
): string {
  const originalPath = join(process.cwd(), '.claude/hooks/session-resume-check.sh');
  let content = readFileSync(originalPath, 'utf-8');
  content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);
  const destPath = join(env.hooksDir, 'session-resume-check.sh');
  writeFileSync(destPath, content, { mode: 0o755 });
  return destPath;
}

/**
 * task-quality-gate.sh 준비.
 * tsc/build/git 명령을 mock하여 격리 테스트 가능하게 함.
 */
export function prepareTaskQualityGate(
  env: ReturnType<typeof createTestEnv>,
  opts: {
    changedFiles?: string[];
    tscPass?: boolean;
    buildPass?: boolean;
  }
): string {
  const originalPath = join(process.cwd(), '.claude/hooks/task-quality-gate.sh');
  let content = readFileSync(originalPath, 'utf-8');

  // PROJECT_DIR 치환
  content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);

  // git diff mock (L1 판단용)
  const files = (opts.changedFiles || []).join('\\n');
  content = content.replace(
    /git diff HEAD --name-only 2>\/dev\/null/g,
    `echo -e "${files}"`
  );
  content = content.replace(
    /git diff HEAD~1 --name-only 2>\/dev\/null/g,
    `echo -e "${files}"`
  );

  // tsc mock
  if (opts.tscPass !== false) {
    content = content.replace(/npx tsc --noEmit 2>\/dev\/null/, 'true');
  } else {
    content = content.replace(/npx tsc --noEmit 2>\/dev\/null/, 'false');
  }

  // build mock
  if (opts.buildPass !== false) {
    content = content.replace(/npm run build 2>\/dev\/null 1>\/dev\/null/, 'true');
  } else {
    content = content.replace(/npm run build 2>\/dev\/null 1>\/dev\/null/, 'false');
  }

  // Mock is-teammate.sh — 테스트에서 IS_TEAMMATE env로 제어 가능하게
  writeFileSync(
    join(env.hooksDir, 'is-teammate.sh'),
    '#!/bin/bash\nIS_TEAMMATE="${IS_TEAMMATE:-false}"\n',
    { mode: 0o755 }
  );

  const destPath = join(env.hooksDir, 'task-quality-gate.sh');
  writeFileSync(destPath, content, { mode: 0o755 });
  return destPath;
}

/** peer-map.json 생성 */
export function writePeerMap(tmpDir: string, map: Record<string, { peerId: string }>): void {
  const dir = join(tmpDir, '.bkit', 'runtime');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'peer-map.json'), JSON.stringify(map, null, 2));
}

/** PM verdict 파일 생성 */
export function writePmVerdict(tmpDir: string, verdict: string, notes?: string, issues?: string[]): void {
  const dir = join(tmpDir, '.bkit', 'runtime');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'pm-verdict.json'), JSON.stringify({
    verdict,
    notes: notes || '',
    issues: issues || [],
    ts: new Date().toISOString(),
  }));
}

/** last-completion-report.json 생성 (PM이 CTO로부터 받은 보고서) */
export function writeCompletionReport(tmpDir: string, data?: Record<string, unknown>): void {
  const dir = join(tmpDir, '.bkit', 'runtime');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'last-completion-report.json'), JSON.stringify({
    protocol: 'bscamp-team/v1',
    type: 'COMPLETION_REPORT',
    from_role: 'CTO_LEADER',
    to_role: 'PM_LEADER',
    payload: {
      task_file: 'TASK-TEST.md',
      match_rate: 97,
      process_level: 'L2',
      commit_hash: 'abc1234',
      chain_step: 'cto_to_pm',
      ...(data || {}),
    },
    ts: new Date().toISOString(),
    msg_id: 'chain-cto-test-1',
  }));
}

/** last-pm-report.json 생성 (COO가 PM으로부터 받은 보고서) */
export function writePmReport(tmpDir: string, data?: Record<string, unknown>): void {
  const dir = join(tmpDir, '.bkit', 'runtime');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'last-pm-report.json'), JSON.stringify({
    protocol: 'bscamp-team/v1',
    type: 'COMPLETION_REPORT',
    from_role: 'PM_LEADER',
    to_role: 'MOZZI',
    payload: {
      task_file: 'TASK-TEST.md',
      match_rate: 97,
      process_level: 'L2',
      commit_hash: 'abc1234',
      chain_step: 'pm_to_coo',
      pm_verdict: 'pass',
      pm_notes: 'LGTM',
      ...(data || {}),
    },
    ts: new Date().toISOString(),
    msg_id: 'chain-pm-test-1',
  }));
}

/** COO feedback 파일 생성 */
export function writeCooFeedback(tmpDir: string, verdict: string, notes?: string, issues?: string[]): void {
  const dir = join(tmpDir, '.bkit', 'runtime');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'coo-feedback.json'), JSON.stringify({
    verdict,
    notes: notes || '',
    issues: issues || [],
  }));
}

/**
 * pm-chain-forward.sh 준비.
 * broker curl mock + PROJECT_DIR 치환.
 */
export function preparePmChainForward(
  env: ReturnType<typeof createTestEnv>,
  opts: {
    mockBroker?: {
      health: boolean;
      peers?: Array<{ id: string; summary: string; pid?: number }>;
      sendOk?: boolean;
    };
  }
): string {
  const originalPath = join(process.cwd(), '.claude/hooks/pm-chain-forward.sh');
  let content = readFileSync(originalPath, 'utf-8');

  content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);

  if (opts.mockBroker) {
    const mockScript = createMockCurl(env.tmpDir, opts.mockBroker);
    content = content.replace(/curl /g, `${mockScript} `);
  }

  // is-teammate.sh mock
  writeFileSync(
    join(env.hooksDir, 'is-teammate.sh'),
    '#!/bin/bash\nIS_TEAMMATE="${IS_TEAMMATE:-false}"\n',
    { mode: 0o755 }
  );

  // helpers 복사
  const helpersDir = join(env.hooksDir, 'helpers');
  mkdirSync(helpersDir, { recursive: true });
  const srcHelpers = join(process.cwd(), '.claude/hooks/helpers');
  for (const f of ['peer-resolver.sh', 'chain-messenger.sh']) {
    const src = join(srcHelpers, f);
    if (existsSync(src)) {
      let helperContent = readFileSync(src, 'utf-8');
      helperContent = helperContent.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);
      if (opts.mockBroker) {
        const mockScript = createMockCurl(env.tmpDir, opts.mockBroker);
        helperContent = helperContent.replace(/curl /g, `${mockScript} `);
      }
      writeFileSync(join(helpersDir, f), helperContent, { mode: 0o755 });
    }
  }

  const destPath = join(env.hooksDir, 'pm-chain-forward.sh');
  writeFileSync(destPath, content, { mode: 0o755 });
  return destPath;
}

/**
 * coo-chain-report.sh 준비.
 */
export function prepareCooChainReport(
  env: ReturnType<typeof createTestEnv>,
  opts: {
    mockBroker?: {
      health: boolean;
      peers?: Array<{ id: string; summary: string }>;
      sendOk?: boolean;
    };
    webhookOk?: boolean;
  }
): string {
  const originalPath = join(process.cwd(), '.claude/hooks/coo-chain-report.sh');
  let content = readFileSync(originalPath, 'utf-8');

  content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);

  // webhook mock
  if (opts.webhookOk !== undefined) {
    const mockWebhook = join(env.tmpDir, 'mock-webhook.sh');
    const script = opts.webhookOk
      ? '#!/bin/bash\necho \'{"ok":true}\'; exit 0\n'
      : '#!/bin/bash\nexit 22\n';
    writeFileSync(mockWebhook, script, { mode: 0o755 });
    // curl 치환 — webhook URL을 mock으로 교체하려면 curl 자체를 mock
    if (opts.mockBroker) {
      const mockScript = createMockCurlWithWebhook(env.tmpDir, opts.mockBroker, opts.webhookOk);
      content = content.replace(/curl /g, `${mockScript} `);
    } else {
      const mockScript = createMockCurlWithWebhook(env.tmpDir, { health: false }, opts.webhookOk);
      content = content.replace(/curl /g, `${mockScript} `);
    }
  } else if (opts.mockBroker) {
    const mockScript = createMockCurl(env.tmpDir, opts.mockBroker);
    content = content.replace(/curl /g, `${mockScript} `);
  }

  // helpers 복사 + curl mock 치환
  const helpersDir = join(env.hooksDir, 'helpers');
  mkdirSync(helpersDir, { recursive: true });
  const srcHelpers = join(process.cwd(), '.claude/hooks/helpers');
  // helpers용 mock curl 결정
  let helperMockScript: string | null = null;
  if (opts.webhookOk !== undefined) {
    helperMockScript = createMockCurlWithWebhook(env.tmpDir, opts.mockBroker || { health: false }, opts.webhookOk);
  } else if (opts.mockBroker) {
    helperMockScript = createMockCurl(env.tmpDir, opts.mockBroker);
  }
  for (const f of ['peer-resolver.sh', 'chain-messenger.sh']) {
    const src = join(srcHelpers, f);
    if (existsSync(src)) {
      let helperContent = readFileSync(src, 'utf-8');
      helperContent = helperContent.replace(/_PR_PROJECT_DIR="\$\{PROJECT_DIR:-[^}]*\}"/, `_PR_PROJECT_DIR="${env.tmpDir}"`);
      helperContent = helperContent.replace(/_CM_RETRY_DELAY="\$\{CHAIN_RETRY_DELAY:-2\}"/, '_CM_RETRY_DELAY="0"');
      if (helperMockScript) {
        helperContent = helperContent.replace(/curl /g, `${helperMockScript} `);
      }
      writeFileSync(join(helpersDir, f), helperContent, { mode: 0o755 });
    }
  }

  const destPath = join(env.hooksDir, 'coo-chain-report.sh');
  writeFileSync(destPath, content, { mode: 0o755 });
  return destPath;
}

/**
 * mock curl 스크립트 생성 (webhook 지원 포함).
 */
function createMockCurlWithWebhook(tmpDir: string, broker: {
  health: boolean;
  peers?: Array<{ id: string; summary: string }>;
  sendOk?: boolean;
}, webhookOk: boolean): string {
  const peersJson = JSON.stringify(broker.peers || []);
  const sendResult = JSON.stringify({ ok: broker.sendOk ?? false });

  const script = `#!/bin/bash
# mock-curl: broker + webhook 응답 시뮬레이션
ARGS="$*"

# webhook wake
if echo "$ARGS" | grep -q "/hooks/wake"; then
    ${webhookOk ? 'echo \'{"ok":true}\'; exit 0' : 'exit 22'}
fi

# health check
if echo "$ARGS" | grep -q "/health"; then
    ${broker.health ? 'echo \'{"peers":2}\'; exit 0' : 'exit 22'}
fi

# list-peers
if echo "$ARGS" | grep -q "/list-peers"; then
    echo '${peersJson.replace(/'/g, "'\\''")}'
    exit 0
fi

# send-message
if echo "$ARGS" | grep -q "/send-message"; then
    echo '${sendResult.replace(/'/g, "'\\''")}'
    exit 0
fi

exit 0
`;

  const mockPath = join(tmpDir, 'mock-curl-wh.sh');
  writeFileSync(mockPath, script, { mode: 0o755 });
  return mockPath;
}

/**
 * mock curl 스크립트 생성.
 * URL 파라미터에 따라 다른 응답 반환.
 */
function createMockCurl(tmpDir: string, broker: {
  health: boolean;
  peers?: Array<{ id: string; summary: string }>;
  sendOk?: boolean;
}): string {
  const peersJson = JSON.stringify(broker.peers || []);
  const sendResult = JSON.stringify({ ok: broker.sendOk ?? false });

  const script = `#!/bin/bash
# mock-curl: broker 응답 시뮬레이션
ARGS="$*"

# health check
if echo "$ARGS" | grep -q "/health"; then
    ${broker.health ? 'echo \'{"peers":2}\'; exit 0' : 'exit 22'}
fi

# list-peers
if echo "$ARGS" | grep -q "/list-peers"; then
    echo '${peersJson.replace(/'/g, "'\\''")}'
    exit 0
fi

# send-message
if echo "$ARGS" | grep -q "/send-message"; then
    echo '${sendResult.replace(/'/g, "'\\''")}'
    exit 0
fi

# 기타: 그대로 통과
exit 0
`;

  const mockPath = join(tmpDir, 'mock-curl.sh');
  writeFileSync(mockPath, script, { mode: 0o755 });
  return mockPath;
}
