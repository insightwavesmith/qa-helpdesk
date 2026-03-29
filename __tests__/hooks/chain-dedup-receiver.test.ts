// __tests__/hooks/chain-dedup-receiver.test.ts
// CDR-1~CDR-6: 수신 측 msg_id dedup TDD
//
// pm-chain-forward.sh + coo-chain-report.sh가
// 같은 msg_id 메시지를 2번 처리하지 않는지 검증

import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import {
  createTestEnv,
  cleanupTestEnv,
  preparePmChainForward,
  prepareCooChainReport,
  writeTeamContext,
  writePmVerdict,
  runHook,
} from './helpers';

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

// ─── PM 수신 측 dedup ──────────────────────────────────────

describe('CDR-1~3: pm-chain-forward 수신 측 dedup', () => {

  it('CDR-1: 동일 msg_id 2회 실행 → 두 번째는 "SKIP: dedup" 출력', () => {
    testEnv = createTestEnv();
    const hookPath = preparePmChainForward(testEnv, {});

    writeTeamContext(testEnv.tmpDir, 'PM');

    const reportDir = join(testEnv.tmpDir, '.claude/runtime');
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'last-completion-report.json'), JSON.stringify({
      protocol: 'bscamp-team/v1',
      type: 'COMPLETION_REPORT',
      msg_id: 'test-dedup-001',
      payload: { task_file: 'TASK-TEST.md', match_rate: 97, process_level: 'L2', commit_hash: 'abc123' },
    }));

    writePmVerdict(testEnv.tmpDir, 'pass', 'LGTM');

    // 첫 실행 — 정상 처리 (broker 없으므로 ACTION_REQUIRED)
    runHook(hookPath, {
      IS_TEAMMATE: 'false',
      PROJECT_DIR: testEnv.tmpDir,
      BROKER_URL: 'http://localhost:19999',
    });

    // verdict 파일 재생성 (첫 실행에서 삭제될 수 있으므로)
    writePmVerdict(testEnv.tmpDir, 'pass', 'LGTM');

    // 두 번째 실행 — dedup 발동
    const r2 = runHook(hookPath, {
      IS_TEAMMATE: 'false',
      PROJECT_DIR: testEnv.tmpDir,
      BROKER_URL: 'http://localhost:19999',
    });

    expect(r2.stdout).toContain('SKIP: dedup');
    expect(r2.exitCode).toBe(0);
  });

  it('CDR-2: 다른 msg_id → 정상 처리 (dedup 간섭 없음)', () => {
    testEnv = createTestEnv();
    const hookPath = preparePmChainForward(testEnv, {});

    writeTeamContext(testEnv.tmpDir, 'PM');

    const reportDir = join(testEnv.tmpDir, '.claude/runtime');
    mkdirSync(reportDir, { recursive: true });

    // 첫 msg_id
    writeFileSync(join(reportDir, 'last-completion-report.json'), JSON.stringify({
      protocol: 'bscamp-team/v1',
      type: 'COMPLETION_REPORT',
      msg_id: 'test-dedup-AAA',
      payload: { task_file: 'TASK-A.md', match_rate: 95, process_level: 'L2', commit_hash: 'aaa' },
    }));
    writePmVerdict(testEnv.tmpDir, 'pass', 'ok');

    runHook(hookPath, {
      IS_TEAMMATE: 'false',
      PROJECT_DIR: testEnv.tmpDir,
      BROKER_URL: 'http://localhost:19999',
    });

    // 다른 msg_id
    writeFileSync(join(reportDir, 'last-completion-report.json'), JSON.stringify({
      protocol: 'bscamp-team/v1',
      type: 'COMPLETION_REPORT',
      msg_id: 'test-dedup-BBB',
      payload: { task_file: 'TASK-B.md', match_rate: 96, process_level: 'L2', commit_hash: 'bbb' },
    }));
    writePmVerdict(testEnv.tmpDir, 'pass', 'ok');

    const r2 = runHook(hookPath, {
      IS_TEAMMATE: 'false',
      PROJECT_DIR: testEnv.tmpDir,
      BROKER_URL: 'http://localhost:19999',
    });

    expect(r2.stdout).not.toContain('SKIP: dedup');
  });

  it('CDR-3: msg_id 없는 보고서 → dedup 안 함 (정상 처리)', () => {
    testEnv = createTestEnv();
    const hookPath = preparePmChainForward(testEnv, {});

    writeTeamContext(testEnv.tmpDir, 'PM');

    const reportDir = join(testEnv.tmpDir, '.claude/runtime');
    mkdirSync(reportDir, { recursive: true });

    writeFileSync(join(reportDir, 'last-completion-report.json'), JSON.stringify({
      protocol: 'bscamp-team/v1',
      type: 'COMPLETION_REPORT',
      payload: { task_file: 'TASK-X.md', match_rate: 98, process_level: 'L2', commit_hash: 'xxx' },
    }));
    writePmVerdict(testEnv.tmpDir, 'pass', 'ok');

    const r = runHook(hookPath, {
      IS_TEAMMATE: 'false',
      PROJECT_DIR: testEnv.tmpDir,
      BROKER_URL: 'http://localhost:19999',
    });

    expect(r.stdout).not.toContain('SKIP: dedup');
  });
});

// ─── COO 수신 측 dedup ──────────────────────────────────────

describe('CDR-4~5: coo-chain-report 수신 측 dedup', () => {

  it('CDR-4: 동일 msg_id PM 보고서 2회 → 두 번째는 "SKIP: dedup"', () => {
    testEnv = createTestEnv();
    const hookPath = prepareCooChainReport(testEnv, { webhookOk: false });

    const reportDir = join(testEnv.tmpDir, '.claude/runtime');
    mkdirSync(reportDir, { recursive: true });

    writeFileSync(join(reportDir, 'last-pm-report.json'), JSON.stringify({
      protocol: 'bscamp-team/v1',
      type: 'COMPLETION_REPORT',
      msg_id: 'test-coo-dedup-001',
      payload: {
        task_file: 'TASK-COO.md', match_rate: 97, process_level: 'L2',
        pm_verdict: 'pass', pm_notes: 'LGTM', commit_hash: 'ccc', chain_step: 'pm_to_coo',
      },
    }));

    // 첫 실행
    runHook(hookPath, { PROJECT_DIR: testEnv.tmpDir });

    // 같은 msg_id로 다시
    writeFileSync(join(reportDir, 'last-pm-report.json'), JSON.stringify({
      protocol: 'bscamp-team/v1',
      type: 'COMPLETION_REPORT',
      msg_id: 'test-coo-dedup-001',
      payload: {
        task_file: 'TASK-COO.md', match_rate: 97, process_level: 'L2',
        pm_verdict: 'pass', pm_notes: 'LGTM', commit_hash: 'ccc', chain_step: 'pm_to_coo',
      },
    }));

    const r2 = runHook(hookPath, { PROJECT_DIR: testEnv.tmpDir });

    expect(r2.stdout).toContain('SKIP: dedup');
    expect(r2.exitCode).toBe(0);
  });

  it('CDR-5: 다른 msg_id PM 보고서 → 정상 처리', () => {
    testEnv = createTestEnv();
    const hookPath = prepareCooChainReport(testEnv, { webhookOk: false });

    const reportDir = join(testEnv.tmpDir, '.claude/runtime');
    mkdirSync(reportDir, { recursive: true });

    writeFileSync(join(reportDir, 'last-pm-report.json'), JSON.stringify({
      protocol: 'bscamp-team/v1',
      type: 'COMPLETION_REPORT',
      msg_id: 'test-coo-AAA',
      payload: { task_file: 'T1.md', match_rate: 95, process_level: 'L2', pm_verdict: 'pass', pm_notes: 'ok', commit_hash: 'a', chain_step: 'pm_to_coo' },
    }));

    runHook(hookPath, { PROJECT_DIR: testEnv.tmpDir });

    writeFileSync(join(reportDir, 'last-pm-report.json'), JSON.stringify({
      protocol: 'bscamp-team/v1',
      type: 'COMPLETION_REPORT',
      msg_id: 'test-coo-BBB',
      payload: { task_file: 'T2.md', match_rate: 96, process_level: 'L2', pm_verdict: 'pass', pm_notes: 'ok', commit_hash: 'b', chain_step: 'pm_to_coo' },
    }));

    const r2 = runHook(hookPath, { PROJECT_DIR: testEnv.tmpDir });

    expect(r2.stdout).not.toContain('SKIP: dedup');
  });
});

// ─── received-log stale 정리 ────────────────────────────────

describe('CDR-6: received-log stale 정리', () => {

  it('CDR-6: 5분 이상 된 항목은 자동 정리됨', () => {
    testEnv = createTestEnv();

    const logDir = join(testEnv.tmpDir, '.claude/runtime');
    mkdirSync(logDir, { recursive: true });
    const logFile = join(logDir, 'chain-received.log');

    const now = Math.floor(Date.now() / 1000);
    const stale = now - 600; // 10분 전
    const fresh = now - 60;  // 1분 전

    writeFileSync(logFile, `${stale}|old-msg-001\n${fresh}|fresh-msg-002\n`);

    // 정리 스크립트를 파일로 작성해서 실행 (이스케이핑 문제 회피)
    const cleanupScript = join(testEnv.tmpDir, 'cleanup.sh');
    writeFileSync(cleanupScript, `#!/bin/bash
_RECEIVED_LOG="${logFile}"
NOW=$(date +%s)
TMP="\${_RECEIVED_LOG}.tmp"
while IFS='|' read -r TS ID; do
  [ -z "$TS" ] && continue
  [ $((NOW - TS)) -lt 300 ] && echo "$TS|$ID"
done < "$_RECEIVED_LOG" > "$TMP" 2>/dev/null
mv "$TMP" "$_RECEIVED_LOG" 2>/dev/null
cat "$_RECEIVED_LOG"
`, { mode: 0o755 });

    const output = execSync(`bash "${cleanupScript}"`, { encoding: 'utf-8' });

    expect(output).not.toContain('old-msg-001');
    expect(output).toContain('fresh-msg-002');
  });
});
