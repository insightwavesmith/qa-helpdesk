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
  const runtimeDir = join(tmpDir, '.claude', 'runtime');
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
 * tmpDir/.claude/runtime/teammate-registry.json에 레지스트리를 생성한다.
 */
export function createTempRegistry(tmpDir: string, data: Record<string, unknown>): string {
  const registryPath = join(tmpDir, '.claude', 'runtime', 'teammate-registry.json');
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
  const dir = join(tmpDir, '.claude', 'runtime');
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
  const dir = join(tmpDir, '.claude', 'runtime');
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

  // git log mock
  content = content.replace(
    /git log --oneline -1 2>\/dev\/null/,
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

  // is-teammate.sh 복사
  copyFileSync(
    join(process.cwd(), '.claude/hooks/is-teammate.sh'),
    join(env.hooksDir, 'is-teammate.sh')
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
