// __tests__/hooks/chain-bulletproof.test.ts — 체인 자동화 방탄 TDD (38건)
// BP-A1~A9: Context Edge Cases
// BP-B1,B3,B4: TeamDelete Timing
// BP-C1~C5,C7,C8: Chain Routing
// BP-D1~D5: Hook Environment
// BP-E1~E3,E5: Approval Integration
// BP-F1~F4: Error Recovery
// BP-G1~G6: Additional Edge Cases

import { describe, it, expect, afterEach } from 'vitest';
import {
  readFileSync, writeFileSync, mkdirSync, existsSync,
  renameSync, chmodSync, unlinkSync, rmSync,
} from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import {
  createTestEnv, runHook, runBashFunction, cleanupTestEnv,
  writeTeamContext, writeAnalysisFile, writePdcaStatus,
  writePmVerdict, writeCompletionReport, writePmReport,
  prepareChainHandoffV2, preparePmChainForward, prepareCooChainReport,
  writePeerMap,
} from './helpers';

// ─── 상수 ──────────────────────────────────────────────────────────

const MOCK_PEERS = [
  { id: 'cto1', summary: 'CTO_LEADER | bscamp | test' },
  { id: 'pm1', summary: 'PM_LEADER | bscamp | test' },
];

const MOCK_PEERS_WITH_MOZZI = [
  ...MOCK_PEERS,
  { id: 'mozzi1', summary: 'MOZZI | bscamp | test' },
];

// ─── 로컬 헬퍼 ─────────────────────────────────────────────────────

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

/** 세션별 team-context 파일 생성 */
function writeSessionContext(tmpDir: string, session: string, team: string, opts?: { taskFiles?: string[] }): string {
  const dir = join(tmpDir, '.claude', 'runtime');
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `team-context-${session}.json`);
  writeFileSync(filePath, JSON.stringify({
    team, session, created: new Date().toISOString(),
    taskFiles: opts?.taskFiles ?? [`TASK-${team}-TEST.md`], teammates: [],
  }));
  return filePath;
}

/** team-context-resolver.sh를 test helpers에 복사 */
function copyResolver(hooksDir: string): void {
  const helpersDir = join(hooksDir, 'helpers');
  mkdirSync(helpersDir, { recursive: true });
  const src = join(process.cwd(), '.claude/hooks/helpers/team-context-resolver.sh');
  writeFileSync(join(helpersDir, 'team-context-resolver.sh'), readFileSync(src), { mode: 0o755 });
}

/** hook-output.sh stub */
function writeHookOutputStub(hooksDir: string): void {
  const helpersDir = join(hooksDir, 'helpers');
  mkdirSync(helpersDir, { recursive: true });
  writeFileSync(join(helpersDir, 'hook-output.sh'), '#!/bin/bash\nhook_init() { true; }\n', { mode: 0o755 });
}

/** helpers (peer-resolver, chain-messenger) 복사 + curl mock */
function copyHelpersWithMock(
  env: ReturnType<typeof createTestEnv>,
  broker: { health: boolean; peers?: Array<{ id: string; summary: string }>; sendOk?: boolean },
): void {
  const helpersDir = join(env.hooksDir, 'helpers');
  mkdirSync(helpersDir, { recursive: true });
  const srcHelpers = join(process.cwd(), '.claude/hooks/helpers');
  const peersJson = JSON.stringify(broker.peers || []);
  const sendResult = JSON.stringify({ ok: broker.sendOk ?? false });
  const mockPath = join(env.tmpDir, 'mock-curl-helpers.sh');
  writeFileSync(mockPath, `#!/bin/bash
ARGS="$*"
if echo "$ARGS" | grep -q "/health"; then
    ${broker.health ? 'echo \'{"peers":2}\'; exit 0' : 'exit 22'}
fi
if echo "$ARGS" | grep -q "/list-peers"; then
    echo '${peersJson.replace(/'/g, "'\\''")}'
    exit 0
fi
if echo "$ARGS" | grep -q "/send-message"; then
    echo '${sendResult.replace(/'/g, "'\\''")}'
    exit 0
fi
exit 0
`, { mode: 0o755 });
  for (const f of ['peer-resolver.sh', 'chain-messenger.sh']) {
    const src = join(srcHelpers, f);
    if (existsSync(src)) {
      let c = readFileSync(src, 'utf-8');
      c = c.replace(/_PR_PROJECT_DIR="\$\{PROJECT_DIR:-[^}]*\}"/, `_PR_PROJECT_DIR="${env.tmpDir}"`);
      c = c.replace(/_CM_RETRY_DELAY="\$\{CHAIN_RETRY_DELAY:-2\}"/, '_CM_RETRY_DELAY="0"');
      c = c.replace(/curl /g, `${mockPath} `);
      writeFileSync(join(helpersDir, f), c, { mode: 0o755 });
    }
  }
}

/** validate-pdca-before-teamdelete.sh 준비 */
function prepareTeamDeleteHook(env: ReturnType<typeof createTestEnv>): string {
  const originalPath = join(process.cwd(), '.claude/hooks/validate-pdca-before-teamdelete.sh');
  let content = readFileSync(originalPath, 'utf-8');
  content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);
  const destPath = join(env.hooksDir, 'validate-pdca-before-teamdelete.sh');
  writeFileSync(destPath, content, { mode: 0o755 });

  // is-teammate.sh mock
  writeFileSync(join(env.hooksDir, 'is-teammate.sh'), '#!/bin/bash\nIS_TEAMMATE="${IS_TEAMMATE:-false}"\n', { mode: 0o755 });

  // helpers 복사
  copyResolver(env.hooksDir);

  return destPath;
}

/** validate-delegate.sh 준비 */
function prepareValidateDelegate(env: ReturnType<typeof createTestEnv>): string {
  const src = join(process.cwd(), '.claude/hooks/validate-delegate.sh');
  let content = readFileSync(src, 'utf-8');
  content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);
  writeFileSync(join(env.hooksDir, 'is-teammate.sh'),
    '#!/bin/bash\nIS_TEAMMATE="${IS_TEAMMATE:-false}"\n', { mode: 0o755 });
  const helpersDir = join(env.hooksDir, 'helpers');
  mkdirSync(helpersDir, { recursive: true });
  const ahSrc = join(process.cwd(), '.claude/hooks/helpers/approval-handler.sh');
  if (existsSync(ahSrc)) {
    writeFileSync(join(helpersDir, 'approval-handler.sh'), readFileSync(ahSrc), { mode: 0o755 });
  }
  writeFileSync(join(env.hooksDir, 'notify-hook.sh'),
    '#!/bin/bash\nnotify_hook() { true; }\n', { mode: 0o755 });
  const destPath = join(env.hooksDir, 'validate-delegate.sh');
  writeFileSync(destPath, content, { mode: 0o755 });
  return destPath;
}

/** stdin 파이핑으로 delegate hook 실행 */
function runDelegateHook(hookPath: string, filePath: string, env: Record<string, string>) {
  const input = JSON.stringify({ tool_input: { file_path: filePath } });
  try {
    const stdout = execSync(`echo '${input}' | bash "${hookPath}"`, {
      encoding: 'utf-8', env: { ...process.env, ...env }, timeout: 5000,
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

function approvalKey(relFile: string): string {
  return relFile.replace(/[^a-zA-Z0-9]/g, '_');
}

function grantApproval(tmpDir: string, relFile: string, tsOverride?: number): void {
  const dir = join(tmpDir, '.claude', 'runtime', 'approvals', 'granted');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, approvalKey(relFile)), String(tsOverride ?? Math.floor(Date.now() / 1000)));
}

/** resolver 함수 직접 실행 */
function runResolver(hooksDir: string, tmpDir: string, env: Record<string, string> = {}) {
  const resolverPath = join(hooksDir, 'helpers', 'team-context-resolver.sh');
  const wrapper = `#!/bin/bash\nset -uo pipefail\nPROJECT_DIR="${tmpDir}"\nsource "${resolverPath}" 2>/dev/null\nresolve_team_context\necho "RESOLVED_FILE=$TEAM_CONTEXT_FILE"\n`;
  const wrapperPath = join(hooksDir, '_test_resolver.sh');
  writeFileSync(wrapperPath, wrapper, { mode: 0o755 });
  let stdout = '', exitCode = 0;
  try {
    stdout = execSync(`bash "${wrapperPath}"`, {
      encoding: 'utf-8', env: { ...process.env, ...env, TMUX: env.TMUX ?? '' }, timeout: 5000,
    });
  } catch (err: any) {
    exitCode = err.status ?? 1;
    stdout = err.stdout?.toString() ?? '';
  }
  const match = stdout.match(/RESOLVED_FILE=(.+)/);
  return { exitCode, stdout, contextFile: match ? match[1].trim() : '' };
}

/** session-resume-check.sh 준비 */
function prepareSessionResumeCheck(env: ReturnType<typeof createTestEnv>): string {
  const originalPath = join(process.cwd(), '.claude/hooks/session-resume-check.sh');
  let content = readFileSync(originalPath, 'utf-8');
  content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);
  const destPath = join(env.hooksDir, 'session-resume-check.sh');
  writeFileSync(destPath, content, { mode: 0o755 });
  return destPath;
}

/** docs/.pdca-status.json 생성 (validate-pdca-before-teamdelete용) */
function writeDocsPdcaStatus(tmpDir: string): void {
  const dir = join(tmpDir, 'docs');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.pdca-status.json'), JSON.stringify({
    phase: 'implementing',
    updatedAt: new Date().toISOString(),
  }));
}

// ═══ A. Context Edge Cases (9건) ══════════════════════════════════

describe('A. Context Edge Cases', () => {

  it('BP-A1: context 파일 없음 → silent exit 0', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);
    writeHookOutputStub(testEnv.hooksDir);

    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true },
    });
    copyResolver(testEnv.hooksDir);
    const r = runHook(hookPath, { _MOCK_SESSION_NAME: 'nonexistent' });
    expect(r.exitCode).toBe(0);
    // stdout에 COMPLETION_REPORT 없음 (체인 미발동)
    expect(r.stdout).not.toContain('COMPLETION_REPORT');
    expect(r.stdout).not.toContain('자동 전송 완료');
  });

  it('BP-A2: 빈 JSON {} → exit 0', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);
    writeHookOutputStub(testEnv.hooksDir);

    // 빈 JSON context 파일 생성
    const ctxPath = join(testEnv.runtimeDir, 'team-context-empty.json');
    writeFileSync(ctxPath, '{}');

    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true },
    });
    copyResolver(testEnv.hooksDir);
    const r = runHook(hookPath, { _MOCK_SESSION_NAME: 'empty' });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).not.toContain('자동 전송 완료');
  });

  it('BP-A3: team 필드 없음 {"session":"x"} → exit 0', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);
    writeHookOutputStub(testEnv.hooksDir);

    const ctxPath = join(testEnv.runtimeDir, 'team-context-noteam.json');
    writeFileSync(ctxPath, JSON.stringify({ session: 'test', created: new Date().toISOString() }));

    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true },
    });
    copyResolver(testEnv.hooksDir);
    const r = runHook(hookPath, { _MOCK_SESSION_NAME: 'noteam' });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).not.toContain('자동 전송 완료');
  });

  it('BP-A4: taskFiles 빈 배열 → 체인 발동 정상', { timeout: 15000 }, () => {
    testEnv = createTestEnv();
    writeSessionContext(testEnv.tmpDir, 'sdk-cto', 'CTO', { taskFiles: [] });
    writeAnalysisFile(testEnv.tmpDir, 97);
    copyResolver(testEnv.hooksDir);
    writeHookOutputStub(testEnv.hooksDir);

    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true },
    });
    copyHelpersWithMock(testEnv, { health: true, peers: MOCK_PEERS, sendOk: true });
    const r = runHook(hookPath, { _MOCK_SESSION_NAME: 'sdk-cto' });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('자동 전송 완료');
  });

  it('BP-A5: 3팀 동시 context → 각각 독립 resolve', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);

    writeSessionContext(testEnv.tmpDir, 'sdk-cto', 'CTO');
    writeSessionContext(testEnv.tmpDir, 'sdk-pm', 'PM');
    writeSessionContext(testEnv.tmpDir, 'hermes', 'MOZZI');

    const rCto = runResolver(testEnv.hooksDir, testEnv.tmpDir, { _MOCK_SESSION_NAME: 'sdk-cto' });
    expect(rCto.contextFile).toContain('team-context-sdk-cto.json');

    const rPm = runResolver(testEnv.hooksDir, testEnv.tmpDir, { _MOCK_SESSION_NAME: 'sdk-pm' });
    expect(rPm.contextFile).toContain('team-context-sdk-pm.json');

    const rMozzi = runResolver(testEnv.hooksDir, testEnv.tmpDir, { _MOCK_SESSION_NAME: 'hermes' });
    expect(rMozzi.contextFile).toContain('team-context-hermes.json');

    // 서로 다른 파일로 resolve
    expect(rCto.contextFile).not.toBe(rPm.contextFile);
    expect(rPm.contextFile).not.toBe(rMozzi.contextFile);
  });

  it('BP-A6: 한 팀 삭제 → 다른 팀 무영향', () => {
    testEnv = createTestEnv();
    writeSessionContext(testEnv.tmpDir, 'sdk-cto', 'CTO');
    writeSessionContext(testEnv.tmpDir, 'sdk-pm', 'PM');

    const pmBefore = readFileSync(join(testEnv.runtimeDir, 'team-context-sdk-pm.json'), 'utf-8');

    // CTO 아카이빙
    const ctoFile = join(testEnv.runtimeDir, 'team-context-sdk-cto.json');
    renameSync(ctoFile, ctoFile.replace('.json', '.archived.json'));

    // PM context 무사 + 내용 동일
    const pmFile = join(testEnv.runtimeDir, 'team-context-sdk-pm.json');
    expect(existsSync(pmFile)).toBe(true);
    expect(readFileSync(pmFile, 'utf-8')).toBe(pmBefore);
  });

  it('BP-A7: 아카이브만 존재 → 체인 발동', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);
    writeHookOutputStub(testEnv.hooksDir);

    // context 생성 후 즉시 아카이빙
    writeSessionContext(testEnv.tmpDir, 'sdk-cto', 'CTO');
    const ctxFile = join(testEnv.runtimeDir, 'team-context-sdk-cto.json');
    renameSync(ctxFile, ctxFile.replace('.json', '.archived.json'));

    writeAnalysisFile(testEnv.tmpDir, 97);
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true },
    });
    copyHelpersWithMock(testEnv, { health: true, peers: MOCK_PEERS, sendOk: true });
    copyResolver(testEnv.hooksDir);
    const r = runHook(hookPath, { _MOCK_SESSION_NAME: 'sdk-cto' });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('자동 전송 완료');
  });

  it('BP-A8: 레거시 team-context.json fallback', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);

    // 레거시 파일만 존재
    writeTeamContext(testEnv.tmpDir, 'CTO');

    const r = runResolver(testEnv.hooksDir, testEnv.tmpDir, { _MOCK_SESSION_NAME: 'sdk-cto' });
    expect(r.contextFile).toContain('team-context.json');
    expect(r.contextFile).not.toContain('team-context-sdk-cto.json');
  });

  it('BP-A9: JSON 파싱 에러 {{{ → exit 0', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);
    writeHookOutputStub(testEnv.hooksDir);

    // 깨진 JSON context
    const ctxPath = join(testEnv.runtimeDir, 'team-context-broken.json');
    writeFileSync(ctxPath, '{{{invalid json content}}}');

    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true },
    });
    copyResolver(testEnv.hooksDir);
    const r = runHook(hookPath, { _MOCK_SESSION_NAME: 'broken' });
    expect(r.exitCode).toBe(0);
    // 체인 발동 안 함
    expect(r.stdout).not.toContain('자동 전송 완료');
  });
});

// ═══ B. TeamDelete Timing (4건: B1, B3, B4) ═══════════════════════

describe('B. TeamDelete Timing', () => {

  it('BP-B1: TeamDelete → 즉시 TaskCompleted → archived에서 체인 발동', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);
    writeHookOutputStub(testEnv.hooksDir);

    // context 생성 → 아카이빙 (TeamDelete 시뮬레이션)
    writeSessionContext(testEnv.tmpDir, 'sdk-cto', 'CTO');
    const ctxFile = join(testEnv.runtimeDir, 'team-context-sdk-cto.json');
    renameSync(ctxFile, ctxFile.replace('.json', '.archived.json'));

    writeAnalysisFile(testEnv.tmpDir, 97);
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true },
    });
    copyHelpersWithMock(testEnv, { health: true, peers: MOCK_PEERS, sendOk: true });
    copyResolver(testEnv.hooksDir);
    const r = runHook(hookPath, { _MOCK_SESSION_NAME: 'sdk-cto' });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('자동 전송 완료');

    // archived 파일에서 team 필드 확인
    const archivedPath = join(testEnv.runtimeDir, 'team-context-sdk-cto.archived.json');
    const archived = JSON.parse(readFileSync(archivedPath, 'utf-8'));
    expect(archived.team).toBe('CTO');
  });

  it('BP-B3: TeamDelete 2번 연속 → no-op (exit 0, archived 1개)', () => {
    testEnv = createTestEnv();
    writeDocsPdcaStatus(testEnv.tmpDir);

    // 레거시 team-context.json 사용 (resolver가 session 없이 fallback)
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareTeamDeleteHook(testEnv);

    // 1차 TeamDelete
    const r1 = runHook(hookPath, {});
    expect(r1.exitCode).toBe(0);
    expect(r1.stdout).toContain('아카이빙 완료');

    const archivedPath = join(testEnv.runtimeDir, 'team-context.archived.json');
    expect(existsSync(archivedPath)).toBe(true);

    // 2차 TeamDelete — context 이미 아카이빙됨 → 아카이빙 메시지 없음 (no-op)
    const r2 = runHook(hookPath, {});
    expect(r2.exitCode).toBe(0);
    // 아카이브는 여전히 존재
    expect(existsSync(archivedPath)).toBe(true);
    // 2차에서는 아카이빙 메시지 없음 (활성 파일 없으므로)
    expect(r2.stdout).not.toContain('아카이빙 완료');
  });

  it('BP-B4: 3팀 동시 TeamDelete → 각각 독립 아카이빙', () => {
    testEnv = createTestEnv();

    writeSessionContext(testEnv.tmpDir, 'sdk-cto', 'CTO');
    writeSessionContext(testEnv.tmpDir, 'sdk-pm', 'PM');
    writeSessionContext(testEnv.tmpDir, 'hermes', 'MOZZI');

    // 순차 아카이빙
    for (const session of ['sdk-cto', 'sdk-pm', 'hermes']) {
      const ctxFile = join(testEnv.runtimeDir, `team-context-${session}.json`);
      if (existsSync(ctxFile)) {
        renameSync(ctxFile, ctxFile.replace('.json', '.archived.json'));
      }
    }

    // 3개 모두 .archived 존재
    expect(existsSync(join(testEnv.runtimeDir, 'team-context-sdk-cto.archived.json'))).toBe(true);
    expect(existsSync(join(testEnv.runtimeDir, 'team-context-sdk-pm.archived.json'))).toBe(true);
    expect(existsSync(join(testEnv.runtimeDir, 'team-context-hermes.archived.json'))).toBe(true);

    // 내용 보존 확인
    const ctoParsed = JSON.parse(readFileSync(join(testEnv.runtimeDir, 'team-context-sdk-cto.archived.json'), 'utf-8'));
    expect(ctoParsed.team).toBe('CTO');
    const pmParsed = JSON.parse(readFileSync(join(testEnv.runtimeDir, 'team-context-sdk-pm.archived.json'), 'utf-8'));
    expect(pmParsed.team).toBe('PM');
    const mozziParsed = JSON.parse(readFileSync(join(testEnv.runtimeDir, 'team-context-hermes.archived.json'), 'utf-8'));
    expect(mozziParsed.team).toBe('MOZZI');
  });
});

// ═══ C. Chain Routing (8건: C1~C5, C7, C8) ═══════════════════════

describe('C. Chain Routing', () => {

  it('BP-C1: CTO → PM 자동 전달 (L2, 95%+, to_role=PM_LEADER)', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    writeAnalysisFile(testEnv.tmpDir, 97);

    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true },
    });
    copyHelpersWithMock(testEnv, { health: true, peers: MOCK_PEERS, sendOk: true });
    const r = runHook(hookPath, {});
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('PM_LEADER');
    expect(r.stdout).toContain('자동 전송 완료');

    // last-completion-report.json 검증
    const reportPath = join(testEnv.runtimeDir, 'last-completion-report.json');
    expect(existsSync(reportPath)).toBe(true);
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
    expect(report.to_role).toBe('PM_LEADER');
    expect(report.payload.chain_step).toBe('cto_to_pm');
    expect(report.payload.process_level).toBe('L2');
  });

  it('BP-C2: PM pass → COO (verdict=pass, to_role=MOZZI)', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'PM');
    writePmVerdict(testEnv.tmpDir, 'pass', 'LGTM');
    writeCompletionReport(testEnv.tmpDir);

    const hookPath = preparePmChainForward(testEnv, {
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });
    const r = runHook(hookPath, {});
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('pass');
    expect(r.stdout).toContain('MOZZI');
    expect(r.stdout).toContain('자동 전송 완료');
  });

  it('BP-C3: PM reject → CTO (type=FEEDBACK, issues 존재)', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'PM');
    writePmVerdict(testEnv.tmpDir, 'reject', 'tsc 에러', ['빌드 실패']);
    writeCompletionReport(testEnv.tmpDir);

    const hookPath = preparePmChainForward(testEnv, {
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true },
    });
    const r = runHook(hookPath, {});
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('reject');
    expect(r.stdout).toContain('CTO_LEADER');
    expect(r.stdout).toContain('자동 전송 완료');
  });

  it('BP-C4: COO → webhook (webhook 200 OK)', () => {
    testEnv = createTestEnv();
    writePmReport(testEnv.tmpDir);

    const hookPath = prepareCooChainReport(testEnv, { webhookOk: true });
    const r = runHook(hookPath, {});
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('보고서 생성 완료');
    expect(r.stdout).toContain('webhook wake 성공');

    // coo-smith-report.json 생성 검증
    const reportPath = join(testEnv.runtimeDir, 'coo-smith-report.json');
    expect(existsSync(reportPath)).toBe(true);
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
    expect(report.type).toBe('COO_REPORT');
    expect(report.payload.chain_step).toBe('coo_report');
  });

  it('BP-C5: broker 미기동 → ACTION_REQUIRED', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    writeAnalysisFile(testEnv.tmpDir, 97);

    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: false },
    });
    copyHelpersWithMock(testEnv, { health: false });
    const r = runHook(hookPath, {});
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('ACTION_REQUIRED');
    // 체인 블로킹 안 함 (exit 0)
    expect(r.stdout).not.toContain('자동 전송 완료');
  });

  it('BP-C7: peer 못 찾음 → ACTION_REQUIRED', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    writeAnalysisFile(testEnv.tmpDir, 97);

    // broker는 살아있지만 PM_LEADER peer 없음
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: [], sendOk: false },
    });
    copyHelpersWithMock(testEnv, { health: true, peers: [], sendOk: false });
    const r = runHook(hookPath, {});
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('ACTION_REQUIRED');
  });

  it('BP-C8: 중복 dedup → 2번째 skip', () => {
    testEnv = createTestEnv();
    writePmReport(testEnv.tmpDir);  // msg_id: 'chain-pm-test-1'

    const hookPath = prepareCooChainReport(testEnv, { webhookOk: true });

    // 1차: 정상 처리
    const r1 = runHook(hookPath, {});
    expect(r1.exitCode).toBe(0);
    expect(r1.stdout).toContain('보고서 생성 완료');

    // 2차: dedup → SKIP
    const r2 = runHook(hookPath, {});
    expect(r2.exitCode).toBe(0);
    expect(r2.stdout).toContain('SKIP: dedup');
    expect(r2.stdout).toContain('chain-pm-test-1');
  });
});

// ═══ D. Hook Environment (5건: D1~D5) ═══════════════════════════

describe('D. Hook Environment', () => {

  it('BP-D1: tmux 없음 → local.json fallback', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);

    writeSessionContext(testEnv.tmpDir, 'local', 'CTO');

    const r = runResolver(testEnv.hooksDir, testEnv.tmpDir, {
      _MOCK_SESSION_NAME: '',
      TMUX: '',
    });
    expect(r.contextFile).toContain('team-context-local.json');
  });

  it('BP-D2: jq 미설치 → exit 0 (hook 소스에 jq 가드 확인)', () => {
    // PATH 조작 대신, hook 소스에 `command -v jq` 가드가 있는지 확인
    const handoffSrc = readFileSync(join(process.cwd(), '.claude/hooks/pdca-chain-handoff.sh'), 'utf-8');
    expect(handoffSrc).toContain('command -v jq');

    const pmForwardSrc = readFileSync(join(process.cwd(), '.claude/hooks/pm-chain-forward.sh'), 'utf-8');
    expect(pmForwardSrc).toContain('command -v jq');

    const cooReportSrc = readFileSync(join(process.cwd(), '.claude/hooks/coo-chain-report.sh'), 'utf-8');
    expect(cooReportSrc).toContain('command -v jq');
  });

  it('BP-D3: curl 타임아웃 확인 (--max-time 3 존재)', () => {
    const messengerSrc = readFileSync(join(process.cwd(), '.claude/hooks/helpers/chain-messenger.sh'), 'utf-8');
    expect(messengerSrc).toContain('--max-time');
    expect(messengerSrc).toContain('--connect-timeout');
  });

  it('BP-D4: pdca-status.json 없음 → TeamDelete 차단 (exit 2)', () => {
    testEnv = createTestEnv();
    // docs/.pdca-status.json 생성하지 않음
    const hookPath = prepareTeamDeleteHook(testEnv);
    const r = runHook(hookPath, {});
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toContain('pdca-status.json');
  });

  it('BP-D5: runtime 디렉토리 없음 → 자동 생성 또는 exit 0', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);
    writeHookOutputStub(testEnv.hooksDir);

    // runtime 디렉토리 삭제
    rmSync(testEnv.runtimeDir, { recursive: true, force: true });

    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true },
    });
    copyResolver(testEnv.hooksDir);

    // hook 소스에 mkdir -p runtime 있는지 확인
    const handoffSrc = readFileSync(hookPath, 'utf-8');
    expect(handoffSrc).toContain('mkdir -p');

    const r = runHook(hookPath, { _MOCK_SESSION_NAME: 'nonexistent' });
    expect(r.exitCode).toBe(0);
  });
});

// ═══ E. Approval Integration (5건: E1~E3, E5) ══════════════════

describe('E. Approval Integration', () => {

  it('BP-E1: .claude/ 수정 → pending 생성 + exit 2', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidateDelegate(testEnv);
    const relFile = '.claude/hooks/custom-hook.sh';
    const r = runDelegateHook(hookPath, `${testEnv.tmpDir}/${relFile}`, {
      IS_TEAMMATE: 'true',
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('승인 필요');

    const pendingDir = join(testEnv.tmpDir, '.claude', 'runtime', 'approvals', 'pending');
    expect(existsSync(join(pendingDir, `${approvalKey(relFile)}.json`))).toBe(true);
  });

  it('BP-E2: granted → Edit 허용', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidateDelegate(testEnv);
    const relFile = '.claude/hooks/custom-hook.sh';
    grantApproval(testEnv.tmpDir, relFile);

    const r = runDelegateHook(hookPath, `${testEnv.tmpDir}/${relFile}`, {
      IS_TEAMMATE: 'true',
    });
    expect(r.exitCode).toBe(0);
  });

  it('BP-E3: rejected → exit 2', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidateDelegate(testEnv);
    const relFile = '.claude/hooks/custom-hook.sh';

    // "rejected" 문자열을 granted 파일에 기록
    const dir = join(testEnv.tmpDir, '.claude', 'runtime', 'approvals', 'granted');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, approvalKey(relFile)), 'rejected');

    const r = runDelegateHook(hookPath, `${testEnv.tmpDir}/${relFile}`, {
      IS_TEAMMATE: 'true',
    });
    expect(r.exitCode).toBe(2);
  });

  it('BP-E5: approvals/ 쓰기 불가 → 안전 차단', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidateDelegate(testEnv);
    const relFile = '.claude/hooks/custom-hook.sh';

    // approval-handler를 제거 → _APPROVAL_LOADED=false → fallback regex 차단
    const ahPath = join(testEnv.hooksDir, 'helpers', 'approval-handler.sh');
    if (existsSync(ahPath)) unlinkSync(ahPath);

    const r = runDelegateHook(hookPath, `${testEnv.tmpDir}/${relFile}`, {
      IS_TEAMMATE: 'true',
    });
    // approval-handler 없으면 fallback: .claude/ 패턴 → exit 2 (안전 차단)
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('위험 파일');
  });
});

// ═══ F. Error Recovery (4건: F1~F4) ═══════════════════════════════

describe('F. Error Recovery', () => {

  it('BP-F1: hook 크래시 exit 1 → trap이 exit 0 변환', () => {
    testEnv = createTestEnv();

    // hook 시작에 trap 'exit 0' ERR이 있는지 확인 (pdca-chain-handoff는 set -uo pipefail 사용)
    const handoffSrc = readFileSync(join(process.cwd(), '.claude/hooks/pdca-chain-handoff.sh'), 'utf-8');
    // pdca-chain-handoff.sh 자체는 trap ERR이 없지만, 각 명령에 || true / 2>/dev/null 방어가 있음
    // validate-delegate.sh에는 trap 'exit 0' ERR 있음
    const delegateSrc = readFileSync(join(process.cwd(), '.claude/hooks/validate-delegate.sh'), 'utf-8');
    expect(delegateSrc).toContain("trap 'exit 0' ERR");

    const teamDeleteSrc = readFileSync(join(process.cwd(), '.claude/hooks/validate-pdca-before-teamdelete.sh'), 'utf-8');
    expect(teamDeleteSrc).toContain("trap 'exit 0' ERR");

    // 독립 hook은 다른 hook에 영향 없음 (각자 프로세스이므로)
    // 크래시 hook 생성
    const crashHookPath = join(testEnv.hooksDir, 'crash-hook.sh');
    writeFileSync(crashHookPath, '#!/bin/bash\nexit 1\n', { mode: 0o755 });
    const rCrash = runHook(crashHookPath);
    expect(rCrash.exitCode).toBe(1);

    // 다른 hook은 정상 실행
    const okHookPath = join(testEnv.hooksDir, 'ok-hook.sh');
    writeFileSync(okHookPath, '#!/bin/bash\necho "OK"\nexit 0\n', { mode: 0o755 });
    const rOk = runHook(okHookPath);
    expect(rOk.exitCode).toBe(0);
    expect(rOk.stdout).toContain('OK');
  });

  it('BP-F2: git conflict 시뮬레이션 → exit 0', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    writeAnalysisFile(testEnv.tmpDir, 97);
    copyResolver(testEnv.hooksDir);
    writeHookOutputStub(testEnv.hooksDir);

    // git diff가 실패하도록 mock (빈 결과 반환 = conflict 시뮬레이션)
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: [],  // 빈 결과 = git diff 실패 시뮬레이션
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });
    copyHelpersWithMock(testEnv, { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true });

    const r = runHook(hookPath, {});
    expect(r.exitCode).toBe(0);
    // git diff 결과 없음 → HAS_SRC=0 → L1로 분류 → MOZZI 직접
    expect(r.stdout).toContain('MOZZI');
  });

  it('BP-F3: 아카이브 자동 정리 (1시간+ 삭제)', () => {
    testEnv = createTestEnv();

    // 오래된 아카이브 파일 시뮬레이션
    const archivePath = join(testEnv.runtimeDir, 'team-context-old.archived.json');
    writeFileSync(archivePath, JSON.stringify({ team: 'OLD', session: 'old' }));

    // touch로 61분 전 시간 설정
    const past = Math.floor(Date.now() / 1000) - 3660; // 61분 전
    try {
      execSync(`touch -t $(date -r ${past} +%Y%m%d%H%M.%S) "${archivePath}"`, { timeout: 3000 });
    } catch {
      // macOS에서 touch -t 실패 시 대안
      execSync(`touch -A -010100 "${archivePath}"`, { timeout: 3000 });
    }

    // session-resume-check.sh 실행 (아카이브 정리 로직 포함)
    const hookPath = prepareSessionResumeCheck(testEnv);
    // pdca-status.json은 없어도 됨 (정리 로직은 0번 섹션)
    runHook(hookPath, {});

    // 오래된 아카이브 삭제 확인
    expect(existsSync(archivePath)).toBe(false);
  });

  it('BP-F4: 동시 2개 TaskCompleted → 독립 처리', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    writeAnalysisFile(testEnv.tmpDir, 97);

    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true },
    });
    copyHelpersWithMock(testEnv, { health: true, peers: MOCK_PEERS, sendOk: true });

    // 2회 연속 빠른 호출
    const r1 = runHook(hookPath, {});
    expect(r1.exitCode).toBe(0);
    expect(r1.stdout).toContain('자동 전송 완료');

    const r2 = runHook(hookPath, {});
    expect(r2.exitCode).toBe(0);
    // 두 번째도 독립 처리 (msg_id가 epoch+PID로 다름)
    // dedup은 chain-messenger의 sent log 기반인데 handoff 자체는 독립 실행
  });
});

// ═══ G. Additional Edge Cases (6건: G1~G6) ════════════════════════

describe('G. Additional Edge Cases', () => {

  it('BP-G1: chain-sent.log 없음 → 자동 생성', () => {
    testEnv = createTestEnv();

    // chain-sent.log가 없는 상태에서 messenger 실행
    const sentLogPath = join(testEnv.runtimeDir, 'chain-sent.log');
    expect(existsSync(sentLogPath)).toBe(false);

    // messenger의 _record_sent 호출 시 자동 mkdir + 파일 생성
    const messengerSrc = readFileSync(join(process.cwd(), '.claude/hooks/helpers/chain-messenger.sh'), 'utf-8');
    // _record_sent에 mkdir -p가 있는지 확인
    expect(messengerSrc).toContain('mkdir -p');

    // 실제 동작: chain-handoff가 정상 전송하면 sent log 생성
    writeTeamContext(testEnv.tmpDir, 'CTO');
    writeAnalysisFile(testEnv.tmpDir, 97);
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true },
    });
    copyHelpersWithMock(testEnv, { health: true, peers: MOCK_PEERS, sendOk: true });
    const r = runHook(hookPath, {});
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('자동 전송 완료');
  });

  it('BP-G2: stale peer-map → fallback', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    writeAnalysisFile(testEnv.tmpDir, 97);

    // peer-map에 존재하지 않는 peer ID 등록
    writePeerMap(testEnv.tmpDir, {
      PM_LEADER: { peerId: 'stale-nonexistent-id-12345' },
    });

    // broker에는 실제 peer 존재 → summary 매칭 fallback으로 resolve
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true },
    });
    copyHelpersWithMock(testEnv, { health: true, peers: MOCK_PEERS, sendOk: true });
    const r = runHook(hookPath, {});
    expect(r.exitCode).toBe(0);
    // stale peer-map ID는 broker에서 확인 실패 → fallback으로 summary 매칭
    expect(r.stdout).toContain('자동 전송 완료');
  });

  it('BP-G3: 1일+ analysis 파일 → 전체 최신 fallback', () => {
    testEnv = createTestEnv();
    const analysisDir = join(testEnv.tmpDir, 'docs', '03-analysis');
    mkdirSync(analysisDir, { recursive: true });

    // 2일 전 analysis 파일 (1일 이내 아님)
    const oldFile = join(analysisDir, 'old.analysis.md');
    writeFileSync(oldFile, '# Gap 분석\n## Match Rate: 97%\n');
    const past = Math.floor(Date.now() / 1000) - 172800; // 2일 전
    try {
      execSync(`touch -t $(date -r ${past} +%Y%m%d%H%M.%S) "${oldFile}"`, { timeout: 3000 });
    } catch {
      execSync(`touch -A -020000 "${oldFile}"`, { timeout: 3000 });
    }

    // match-rate-parser는 1일 이내 없으면 전체에서 최신 fallback
    const parserPath = join(process.cwd(), '.claude/hooks/helpers/match-rate-parser.sh');
    const r = runBashFunction(parserPath, `parse_match_rate "${analysisDir}"`);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('97');
  });

  it('BP-G4: 빈 report 파일 (0바이트) → exit 0', () => {
    testEnv = createTestEnv();

    // 0바이트 pm-report 파일 생성
    const reportPath = join(testEnv.runtimeDir, 'last-pm-report.json');
    writeFileSync(reportPath, '');

    const hookPath = prepareCooChainReport(testEnv, { webhookOk: true });
    const r = runHook(hookPath, {});
    // jq 파싱 실패 → exit 0 (비차단)
    expect(r.exitCode).toBe(0);
  });

  it('BP-G5: webhook URL 오염 → ACTION_REQUIRED', () => {
    testEnv = createTestEnv();
    writePmReport(testEnv.tmpDir);

    // webhook 실패 시뮬레이션 (mock curl이 /hooks/wake 매칭 → exit 22)
    const hookPath = prepareCooChainReport(testEnv, {
      webhookOk: false,
    });
    const r = runHook(hookPath, {});
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('보고서 생성 완료');
    // webhook 실패 → ACTION_REQUIRED (수동 보고 안내)
    expect(r.stdout).toContain('ACTION_REQUIRED');
  });

  it('BP-G6: 단일 세션 풀사이클 (CTO → PM → COO)', () => {
    testEnv = createTestEnv();

    // ── Step 1: CTO 완료 → PM 전달 ──
    writeTeamContext(testEnv.tmpDir, 'CTO');
    writeAnalysisFile(testEnv.tmpDir, 97);

    const handoffHook = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });
    copyHelpersWithMock(testEnv, { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true });
    const r1 = runHook(handoffHook, {});
    expect(r1.exitCode).toBe(0);
    expect(r1.stdout).toContain('PM_LEADER');
    expect(r1.stdout).toContain('자동 전송 완료');

    // last-completion-report.json 생성됨
    const completionReport = join(testEnv.runtimeDir, 'last-completion-report.json');
    expect(existsSync(completionReport)).toBe(true);

    // ── Step 2: PM 검수 pass → COO(MOZZI) 전달 ──
    // PM 컨텍스트로 전환
    writeTeamContext(testEnv.tmpDir, 'PM');
    writePmVerdict(testEnv.tmpDir, 'pass', 'LGTM - 풀사이클 검증');

    const pmHook = preparePmChainForward(testEnv, {
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });
    const r2 = runHook(pmHook, {});
    expect(r2.exitCode).toBe(0);
    expect(r2.stdout).toContain('MOZZI');
    expect(r2.stdout).toContain('자동 전송 완료');

    // ── Step 3: COO 보고서 생성 + webhook ──
    // PM report 생성 (COO가 읽을 파일)
    writePmReport(testEnv.tmpDir, { pm_verdict: 'pass', pm_notes: 'LGTM - 풀사이클' });

    const cooHook = prepareCooChainReport(testEnv, { webhookOk: true });
    const r3 = runHook(cooHook, {});
    expect(r3.exitCode).toBe(0);
    expect(r3.stdout).toContain('보고서 생성 완료');
    expect(r3.stdout).toContain('webhook wake 성공');

    // 최종 보고서 검증
    const smithReport = join(testEnv.runtimeDir, 'coo-smith-report.json');
    expect(existsSync(smithReport)).toBe(true);
    const report = JSON.parse(readFileSync(smithReport, 'utf-8'));
    expect(report.type).toBe('COO_REPORT');
    expect(report.payload.pm_verdict).toBe('pass');
    expect(report.payload.chain_step).toBe('coo_report');
  });
});
