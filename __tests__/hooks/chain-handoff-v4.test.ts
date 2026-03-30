// __tests__/hooks/chain-handoff-v4.test.ts — V2 체인 핸드오프 TDD
// U7: L2 → MOZZI 직통 (PM 우회)
// U8: L3 → MOZZI 직통 (PM 우회)
// U9: summary 매칭 실패 → fallback
// I1: 전체 체인 — CTO 완료 → COO 도달

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import {
  createTestEnv, cleanupTestEnv, runHook,
  writeTeamContext, writeAnalysisFile,
  prepareChainHandoffV2,
} from './helpers';

const MOCK_PEERS_WITH_MOZZI = [
  { id: 'cto1', summary: 'CTO_LEADER | bscamp | test' },
  { id: 'mozzi1', summary: 'MOZZI | bscamp | test' },
];

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

describe('pdca-chain-handoff.sh v4 — PM 우회', () => {
  it('U7: L2 → TO_ROLE=MOZZI, chain_step=cto_to_coo (PM 우회)', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    writeAnalysisFile(testEnv.tmpDir, 97);

    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });

    const result = runHook(hookPath, { IS_TEAMMATE: 'false' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('자동 전송 완료');

    // last-completion-report 확인
    const reportPath = join(testEnv.tmpDir, '.bkit', 'runtime', 'last-completion-report.json');
    if (existsSync(reportPath)) {
      const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
      expect(report.to_role).toBe('MOZZI');
      expect(report.payload.chain_step).toBe('cto_to_coo');
    }
  });

  it('U8: L3 (auth 파일) → TO_ROLE=MOZZI (PM 우회)', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    writeAnalysisFile(testEnv.tmpDir, 98);

    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/lib/auth.ts', 'src/middleware.ts'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });

    const result = runHook(hookPath, { IS_TEAMMATE: 'false' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('자동 전송 완료');
    expect(result.stdout).toContain('MOZZI');
  });

  it('U9: peer summary 매칭 실패 → fallback 메시지', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    writeAnalysisFile(testEnv.tmpDir, 97);

    // broker는 살아있지만 MOZZI peer 없음
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: {
        health: true,
        peers: [{ id: 'cto1', summary: 'CTO_LEADER | bscamp | test' }],
        sendOk: false,
      },
    });

    const result = runHook(hookPath, { IS_TEAMMATE: 'false' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('peer 미발견');
    expect(result.stdout).toContain('ACTION_REQUIRED');
  });

  it('I1: L0 체인 — fix 커밋 → Match Rate 스킵 → MOZZI 직통', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    // L0: Gap 분석 없이도 작동해야 함

    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });

    // git log mock을 fix: 커밋으로 변경
    let content = readFileSync(hookPath, 'utf-8');
    content = content.replace(
      /echo "abc1234 test commit"/g,
      'echo "abc1234 fix: 긴급 버그 수정"'
    );
    writeFileSync(hookPath, content, { mode: 0o755 });

    const result = runHook(hookPath, { IS_TEAMMATE: 'false' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ANALYSIS_REPORT');
    expect(result.stdout).toContain('MOZZI');
  });

  it('I2: L2 Gap 미달 → 체인 차단', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    writeAnalysisFile(testEnv.tmpDir, 80);

    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });

    const result = runHook(hookPath, { IS_TEAMMATE: 'false' });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('차단');
  });

  it('R8: L2/L3에서 PM_LEADER로 전송하는 코드 없음', () => {
    // 소스 코드 직접 검증
    const chainPath = join(process.cwd(), '.claude/hooks/pdca-chain-handoff.sh');
    const content = readFileSync(chainPath, 'utf-8');

    // L2/L3 case 분기에서 PM_LEADER가 없어야 함
    const l2Block = content.match(/L2\)([\s\S]*?);;/);
    const l3Block = content.match(/L3\)([\s\S]*?);;/);

    if (l2Block) {
      expect(l2Block[1]).not.toContain('PM_LEADER');
      expect(l2Block[1]).toContain('MOZZI');
    }
    if (l3Block) {
      expect(l3Block[1]).not.toContain('PM_LEADER');
      expect(l3Block[1]).toContain('MOZZI');
    }
  });
});
