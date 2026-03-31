// __tests__/hooks/chain-e2e-realworld.test.ts — 실전 시나리오 TDD
// RW-1~4: 병렬 팀 실전 e2e
// RW-5~6: TeamDelete → TaskCompleted 타이밍
// RW-7~10: 체인 풀플로우 e2e
// RW-11~15: requireApproval 통합
// RW-16~18: 보고 도달 검증
// RW-19~20: context resolver 엣지케이스

import { describe, it, expect, afterEach } from 'vitest';
import {
  readFileSync, writeFileSync, mkdirSync, existsSync,
  renameSync,
} from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import {
  createTestEnv, runHook, runBashFunction, cleanupTestEnv,
  writeTeamContext, writeAnalysisFile,
  writePmVerdict, writeCompletionReport, writePmReport,
  prepareChainHandoffV2, preparePmChainForward, prepareCooChainReport,
} from './helpers';

const MOCK_PEERS = [
  { id: 'cto1', summary: 'CTO_LEADER | bscamp | test' },
  { id: 'pm1', summary: 'PM_LEADER | bscamp | test' },
];

const MOCK_PEERS_WITH_MOZZI = [
  { id: 'cto1', summary: 'CTO_LEADER | bscamp | test' },
  { id: 'pm1', summary: 'PM_LEADER | bscamp | test' },
  { id: 'mozzi1', summary: 'MOZZI | bscamp | test' },
];

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

// ─── 로컬 헬퍼 ─────────────────────────────────────────────────────

/** 세션별 team-context 파일 생성 */
function writeSessionContext(tmpDir: string, session: string, team: string): string {
  const dir = join(tmpDir, '.bkit', 'runtime');
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `team-context-${session}.json`);
  writeFileSync(filePath, JSON.stringify({
    team, session, created: new Date().toISOString(),
    taskFiles: [`TASK-${team}-TEST.md`], teammates: [],
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
  const dir = join(tmpDir, '.bkit', 'runtime', 'approvals', 'granted');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, approvalKey(relFile)), String(tsOverride ?? Math.floor(Date.now() / 1000)));
}

/** resolver 함수 직접 실행하여 TEAM_CONTEXT_FILE 확인 */
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

// ─── RW-1~4: 병렬 팀 실전 e2e ──────────────────────────────────────

describe('RW-1~4: 병렬 팀 실전 e2e', () => {

  it('RW-1: CTO + PM 동시 TASK → 각각 독립 체인 발동', { timeout: 15000 }, () => {
    testEnv = createTestEnv();
    writeSessionContext(testEnv.tmpDir, 'sdk-cto', 'CTO');
    writeSessionContext(testEnv.tmpDir, 'sdk-pm', 'PM');
    writeAnalysisFile(testEnv.tmpDir, 97);
    copyResolver(testEnv.hooksDir);
    writeHookOutputStub(testEnv.hooksDir);

    // CTO chain: L2 (src/ 수정) → PM_LEADER
    const hookCto = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });
    copyHelpersWithMock(testEnv, { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true });
    const rCto = runHook(hookCto, { _MOCK_SESSION_NAME: 'sdk-cto' });
    expect(rCto.exitCode).toBe(0);
    expect(rCto.stdout).toContain('전송 완료');

    // PM chain: L1 (docs/ 만 수정) → MOZZI
    const hookPm = prepareChainHandoffV2(testEnv, {
      changedFiles: ['docs/plan.md'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });
    copyResolver(testEnv.hooksDir);
    const rPm = runHook(hookPm, { _MOCK_SESSION_NAME: 'sdk-pm' });
    expect(rPm.exitCode).toBe(0);
    expect(rPm.stdout).toContain('MOZZI');
    expect(rPm.stdout).toContain('전송 완료');
  });

  it.skip('RW-2: CTO TeamDelete → PM 체인 — V2에서 pm-chain-forward.sh 삭제됨', () => {
    testEnv = createTestEnv();
    writeSessionContext(testEnv.tmpDir, 'sdk-cto', 'CTO');
    writeTeamContext(testEnv.tmpDir, 'PM');

    // CTO context 아카이빙 (TeamDelete 시뮬레이션)
    const ctoFile = join(testEnv.runtimeDir, 'team-context-sdk-cto.json');
    const ctoArchive = ctoFile.replace('.json', '.archived.json');
    renameSync(ctoFile, ctoArchive);

    // PM chain 정상 작동
    writePmVerdict(testEnv.tmpDir, 'pass', 'OK');
    writeCompletionReport(testEnv.tmpDir);
    const hookPath = preparePmChainForward(testEnv, {
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });
    const r = runHook(hookPath, {});
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('MOZZI');
    expect(r.stdout).toContain('전송 완료');

    // CTO archive 무사
    expect(existsSync(ctoArchive)).toBe(true);
  });

  it('RW-3: 3팀 동시 context → 각각 별도 파일', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);

    writeSessionContext(testEnv.tmpDir, 'sdk-cto-1', 'CTO-1');
    writeSessionContext(testEnv.tmpDir, 'sdk-pm', 'PM');
    writeSessionContext(testEnv.tmpDir, 'hermes', 'MOZZI');

    // 3개 파일 독립 존재
    expect(existsSync(join(testEnv.runtimeDir, 'team-context-sdk-cto-1.json'))).toBe(true);
    expect(existsSync(join(testEnv.runtimeDir, 'team-context-sdk-pm.json'))).toBe(true);
    expect(existsSync(join(testEnv.runtimeDir, 'team-context-hermes.json'))).toBe(true);

    // 각각 올바른 파일로 resolve
    const rCto = runResolver(testEnv.hooksDir, testEnv.tmpDir, { _MOCK_SESSION_NAME: 'sdk-cto-1' });
    expect(rCto.contextFile).toContain('team-context-sdk-cto-1.json');

    const rPm = runResolver(testEnv.hooksDir, testEnv.tmpDir, { _MOCK_SESSION_NAME: 'sdk-pm' });
    expect(rPm.contextFile).toContain('team-context-sdk-pm.json');

    const rMozzi = runResolver(testEnv.hooksDir, testEnv.tmpDir, { _MOCK_SESSION_NAME: 'hermes' });
    expect(rMozzi.contextFile).toContain('team-context-hermes.json');
  });

  it('RW-4: 한 팀 TeamDelete → 아카이브 생성 + 다른 팀 context 무사', () => {
    testEnv = createTestEnv();
    writeSessionContext(testEnv.tmpDir, 'sdk-cto', 'CTO');
    writeSessionContext(testEnv.tmpDir, 'sdk-pm', 'PM');

    // CTO 아카이빙
    const ctoFile = join(testEnv.runtimeDir, 'team-context-sdk-cto.json');
    const ctoArchive = ctoFile.replace('.json', '.archived.json');
    renameSync(ctoFile, ctoArchive);

    // 아카이브 존재 + 내용 보존
    expect(existsSync(ctoArchive)).toBe(true);
    const archived = JSON.parse(readFileSync(ctoArchive, 'utf-8'));
    expect(archived.team).toBe('CTO');

    // PM context 무사
    const pmFile = join(testEnv.runtimeDir, 'team-context-sdk-pm.json');
    expect(existsSync(pmFile)).toBe(true);
    const pm = JSON.parse(readFileSync(pmFile, 'utf-8'));
    expect(pm.team).toBe('PM');
  });
});

// ─── RW-5~6: TeamDelete → TaskCompleted 타이밍 ─────────────────────

describe('RW-5~6: TeamDelete → TaskCompleted 타이밍', () => {

  it('RW-5: TeamDelete 직후 TaskCompleted → 아카이브에서 context 읽어서 체인 발동', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);
    writeHookOutputStub(testEnv.hooksDir);

    // context 생성 → 아카이빙 (TeamDelete 시뮬레이션)
    writeSessionContext(testEnv.tmpDir, 'sdk-cto', 'CTO');
    const ctxFile = join(testEnv.runtimeDir, 'team-context-sdk-cto.json');
    renameSync(ctxFile, ctxFile.replace('.json', '.archived.json'));

    // chain-handoff — resolver가 아카이브에서 context 읽음
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['docs/analysis.md'],  // L1
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });
    copyResolver(testEnv.hooksDir);
    const r = runHook(hookPath, { _MOCK_SESSION_NAME: 'sdk-cto' });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('MOZZI');
    expect(r.stdout).toContain('전송 완료');
  });

  it('RW-6: 아카이브 없고 활성 context도 없으면 → silent exit 0', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);
    writeHookOutputStub(testEnv.hooksDir);

    // context 파일 아무것도 없음
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true },
    });
    copyResolver(testEnv.hooksDir);
    const r = runHook(hookPath, { _MOCK_SESSION_NAME: 'nonexistent-session', TMUX: '' });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe('');
  });
});

// ─── RW-7~10: 체인 풀플로우 e2e ────────────────────────────────────

describe('RW-7~10: 체인 풀플로우 e2e', () => {

  it('RW-7: CTO 완료 → pdca-chain-handoff → MOZZI 자동 전달 + report 파일 (V2)', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    writeAnalysisFile(testEnv.tmpDir, 97);
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });
    copyHelpersWithMock(testEnv, { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true });
    const r = runHook(hookPath, {});
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('전송 완료');
    expect(r.stdout).toContain('MOZZI');

    // last-completion-report.json 검증
    const reportPath = join(testEnv.runtimeDir, 'last-completion-report.json');
    expect(existsSync(reportPath)).toBe(true);
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
    expect(report.type).toBe('COMPLETION_REPORT');
    expect(report.from_role).toBe('CTO_LEADER');
    expect(report.to_role).toBe('MOZZI');
    expect(report.payload.match_rate).toBe(97);
  });

  it.skip('RW-8: PM pass → pm-chain-forward — V2에서 삭제됨', () => {
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
    expect(r.stdout).toContain('전송 완료');
  });

  it.skip('RW-9: PM reject → pm-chain-forward — V2에서 삭제됨', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'PM');
    writePmVerdict(testEnv.tmpDir, 'reject', '빌드 실패', ['tsc 에러 3건']);
    writeCompletionReport(testEnv.tmpDir);
    const hookPath = preparePmChainForward(testEnv, {
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true },
    });
    const r = runHook(hookPath, {});
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('reject');
    expect(r.stdout).toContain('CTO_LEADER');
    expect(r.stdout).toContain('전송 완료');
  });

  it.skip('RW-10: COO 보고서 생성 — V2에서 coo-chain-report.sh 삭제됨', () => {
    testEnv = createTestEnv();
    writePmReport(testEnv.tmpDir);
    const hookPath = prepareCooChainReport(testEnv, { webhookOk: true });
    const r = runHook(hookPath, {});
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('보고서 생성 완료');
    expect(r.stdout).toContain('webhook wake 성공');
  });
});

// ─── RW-11~15: requireApproval 통합 ────────────────────────────────

describe('RW-11~15: requireApproval 통합', () => {

  it('RW-11: 팀원 .claude/ 수정 → requireApproval 호출 (pending 생성)', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidateDelegate(testEnv);
    const relFile = '.claude/hooks/custom-hook.sh';
    const r = runDelegateHook(hookPath, `${testEnv.tmpDir}/${relFile}`, {
      IS_TEAMMATE: 'true',
    });
    // requireApproval 경로: pending 파일 생성 + 승인 필요 메시지
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('승인 필요');
    const pendingDir = join(testEnv.tmpDir, '.bkit', 'runtime', 'approvals', 'pending');
    expect(existsSync(join(pendingDir, `${approvalKey(relFile)}.json`))).toBe(true);
  });

  it('RW-12: 팀원 migration 수정 → requireApproval 호출 (pending 생성)', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidateDelegate(testEnv);
    const relFile = 'supabase/migrations/20260330_create_table.sql';
    const r = runDelegateHook(hookPath, `${testEnv.tmpDir}/${relFile}`, {
      IS_TEAMMATE: 'true',
    });
    expect(r.exitCode).toBe(2);
    const pendingDir = join(testEnv.tmpDir, '.bkit', 'runtime', 'approvals', 'pending');
    expect(existsSync(join(pendingDir, `${approvalKey(relFile)}.json`))).toBe(true);
  });

  it('RW-13: 승인 후 → exit 0 (작업 재개)', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidateDelegate(testEnv);
    const relFile = '.claude/hooks/custom-hook.sh';
    grantApproval(testEnv.tmpDir, relFile);
    const r = runDelegateHook(hookPath, `${testEnv.tmpDir}/${relFile}`, {
      IS_TEAMMATE: 'true',
    });
    expect(r.exitCode).toBe(0);
  });

  it('RW-14: 거부 후 → exit 2 (차단)', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidateDelegate(testEnv);
    const relFile = '.claude/hooks/custom-hook.sh';
    const dir = join(testEnv.tmpDir, '.bkit', 'runtime', 'approvals', 'granted');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, approvalKey(relFile)), 'rejected');
    const r = runDelegateHook(hookPath, `${testEnv.tmpDir}/${relFile}`, {
      IS_TEAMMATE: 'true',
    });
    expect(r.exitCode).toBe(2);
  });

  it('RW-15: 타임아웃 → exit 2 (안전 폴백)', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidateDelegate(testEnv);
    const relFile = '.claude/hooks/custom-hook.sh';
    // 10분 전 승인 (TTL 300초 초과 → 만료)
    grantApproval(testEnv.tmpDir, relFile, Math.floor(Date.now() / 1000) - 600);
    const r = runDelegateHook(hookPath, `${testEnv.tmpDir}/${relFile}`, {
      IS_TEAMMATE: 'true',
    });
    expect(r.exitCode).toBe(2);
  });
});

// ─── RW-16~18: 보고 도달 검증 ──────────────────────────────────────

describe('RW-16~18: 보고 도달 검증', () => {

  it.skip('RW-16: coo-smith-report — V2에서 coo-chain-report.sh 삭제됨', () => {
    testEnv = createTestEnv();
    writePmReport(testEnv.tmpDir, { match_rate: 98, pm_verdict: 'pass', pm_notes: 'Perfect' });
    const hookPath = prepareCooChainReport(testEnv, { webhookOk: true });
    runHook(hookPath, {});
    const reportPath = join(testEnv.runtimeDir, 'coo-smith-report.json');
    expect(existsSync(reportPath)).toBe(true);
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
    expect(report.type).toBe('COO_REPORT');
    expect(report.payload.match_rate).toBe(98);
    expect(report.payload.pm_verdict).toBe('pass');
    expect(report.payload.pm_notes).toBe('Perfect');
    expect(report.payload.chain_step).toBe('coo_report');
  });

  it('RW-17: webhook wake 시 Authorization Bearer 포함', () => {
    testEnv = createTestEnv();
    // curl 호출 인자 로깅하는 mock
    const logFile = join(testEnv.tmpDir, 'curl-args.log');
    const mockCurl = join(testEnv.tmpDir, 'mock-curl-log.sh');
    writeFileSync(mockCurl, `#!/bin/bash
ARGS="$*"
echo "$ARGS" >> "${logFile}"
if echo "$ARGS" | grep -q "/hooks/wake"; then echo '{"ok":true}'; exit 0; fi
if echo "$ARGS" | grep -q "/health"; then exit 22; fi
exit 0
`, { mode: 0o755 });

    // chain-messenger 준비 (curl → logging mock)
    const helpersDir = join(testEnv.hooksDir, 'helpers');
    mkdirSync(helpersDir, { recursive: true });
    const msgSrc = join(process.cwd(), '.claude/hooks/helpers/chain-messenger.sh');
    let msgContent = readFileSync(msgSrc, 'utf-8');
    msgContent = msgContent.replace(/curl /g, `${mockCurl} `);
    const msgPath = join(helpersDir, 'chain-messenger.sh');
    writeFileSync(msgPath, msgContent, { mode: 0o755 });

    const r = runBashFunction(msgPath,
      'send_webhook_wake "http://127.0.0.1:18789/hooks/wake" \'{"text":"test"}\'; echo "STATUS=$WEBHOOK_STATUS"');
    expect(r.stdout).toContain('STATUS=ok');

    // curl 인자에 Authorization Bearer 포함 확인
    const logContent = readFileSync(logFile, 'utf-8');
    expect(logContent).toContain('Authorization: Bearer');
  });

  it.skip('RW-18: 중복 보고 방지 — V2에서 coo-chain-report.sh 삭제됨', () => {
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

// ─── RW-19~20: context resolver 엣지케이스 ──────────────────────────

describe('RW-19~20: context resolver 엣지케이스', () => {

  it('RW-19: tmux 없는 환경 → team-context-local.json fallback', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);

    // local context 생성
    writeSessionContext(testEnv.tmpDir, 'local', 'CTO');

    // resolver: tmux 없음 → local fallback
    const r = runResolver(testEnv.hooksDir, testEnv.tmpDir, {
      _MOCK_SESSION_NAME: '',
      TMUX: '',
    });
    expect(r.contextFile).toContain('team-context-local.json');

    // chain-handoff도 local context로 동작
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeHookOutputStub(testEnv.hooksDir);
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });
    copyHelpersWithMock(testEnv, { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true });
    copyResolver(testEnv.hooksDir);
    const rHook = runHook(hookPath, { _MOCK_SESSION_NAME: '', TMUX: '' });
    expect(rHook.exitCode).toBe(0);
    expect(rHook.stdout).toContain('전송 완료');
  });

  it('RW-20: 레거시 team-context.json만 존재 → 하위 호환 읽기', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);

    // 레거시 team-context.json (세션 접미사 없음)
    writeTeamContext(testEnv.tmpDir, 'CTO');

    // resolver: 세션명 있지만 해당 파일 없음 → legacy fallback
    const r = runResolver(testEnv.hooksDir, testEnv.tmpDir, {
      _MOCK_SESSION_NAME: 'sdk-cto',
    });
    expect(r.contextFile).toContain('team-context.json');
    expect(r.contextFile).not.toContain('team-context-sdk-cto.json');

    // chain-handoff도 레거시로 동작
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeHookOutputStub(testEnv.hooksDir);
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });
    copyHelpersWithMock(testEnv, { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true });
    copyResolver(testEnv.hooksDir);
    const rHook = runHook(hookPath, { _MOCK_SESSION_NAME: 'sdk-cto' });
    expect(rHook.exitCode).toBe(0);
    expect(rHook.stdout).toContain('전송 완료');
  });
});

// ─── P2-1~4: 체인 실전 테스트 시뮬레이션 ─────────────────────

describe('P2-1~4: 체인 실전 e2e 시뮬레이션', () => {

  it('P2-1: E2E-1 handoff → MOZZI 전달 → msg_id 기록 (V2)', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeHookOutputStub(testEnv.hooksDir);
    writeSessionContext(testEnv.tmpDir, 'sdk-cto', 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });
    copyHelpersWithMock(testEnv, { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true });
    copyResolver(testEnv.hooksDir);

    const r = runHook(hookPath, { _MOCK_SESSION_NAME: 'sdk-cto' });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('전송 완료');

    // last-completion-report.json 생성 확인
    const reportPath = join(testEnv.tmpDir, '.bkit', 'runtime', 'last-completion-report.json');
    expect(existsSync(reportPath)).toBe(true);
  });

  it('P2-2: E2E-2 Match Rate 80% → exit 2, 96% → exit 0', () => {
    testEnv = createTestEnv();
    writeHookOutputStub(testEnv.hooksDir);
    writeSessionContext(testEnv.tmpDir, 'sdk-cto', 'CTO');
    copyResolver(testEnv.hooksDir);

    // 1차: Match Rate 80% → exit 2
    writeAnalysisFile(testEnv.tmpDir, 80);
    const hookPath1 = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true },
    });
    copyHelpersWithMock(testEnv, { health: true, peers: MOCK_PEERS, sendOk: true });
    const r1 = runHook(hookPath1, { _MOCK_SESSION_NAME: 'sdk-cto' });
    expect(r1.exitCode).toBe(2);

    // 2차: Match Rate 96% → exit 0
    writeAnalysisFile(testEnv.tmpDir, 96);
    const hookPath2 = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true },
    });
    copyHelpersWithMock(testEnv, { health: true, peers: MOCK_PEERS, sendOk: true });
    const r2 = runHook(hookPath2, { _MOCK_SESSION_NAME: 'sdk-cto' });
    expect(r2.exitCode).toBe(0);
  });

  it('P2-3: E2E-3 병렬 context 독립', () => {
    testEnv = createTestEnv();

    // 2개 세션 context
    writeSessionContext(testEnv.tmpDir, 'sdk-cto', 'CTO');
    writeSessionContext(testEnv.tmpDir, 'sdk-cto-2', 'CTO-2');

    const runtimeDir = join(testEnv.tmpDir, '.bkit', 'runtime');
    const ctx1 = join(runtimeDir, 'team-context-sdk-cto.json');
    const ctx2 = join(runtimeDir, 'team-context-sdk-cto-2.json');

    expect(existsSync(ctx1)).toBe(true);
    expect(existsSync(ctx2)).toBe(true);

    // 독립 확인: 서로 다른 team 필드
    const data1 = JSON.parse(readFileSync(ctx1, 'utf-8'));
    const data2 = JSON.parse(readFileSync(ctx2, 'utf-8'));
    expect(data1.team).not.toBe(data2.team);
    expect(data1.session).toBe('sdk-cto');
    expect(data2.session).toBe('sdk-cto-2');
  });

  it('P2-4: verify-chain-e2e.sh 문법 검증 (bash -n)', () => {
    const src = join(process.cwd(), '.claude/hooks/verify-chain-e2e.sh');
    let passed = true;
    try {
      execSync(`bash -n "${src}" 2>&1`, { encoding: 'utf-8' });
    } catch {
      passed = false;
    }
    expect(passed).toBe(true);
  });
});
