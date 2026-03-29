// __tests__/hooks/l1-auto-report.test.ts — L1 자동 보고 차단 수정 TDD
// QL-1~11: task-quality-gate L1 bypass (11건)
// CL-1~11: pdca-chain-handoff L1 bypass (11건)

import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  createTestEnv, runHook, cleanupTestEnv,
  writeAnalysisFile, writeTeamContext,
  prepareChainHandoffV2, prepareTaskQualityGate,
} from './helpers';

const MOCK_PEERS_WITH_MOZZI = [
  { id: 'cto1', summary: 'CTO_LEADER | bscamp | test' },
  { id: 'pm1', summary: 'PM_LEADER | bscamp | test' },
  { id: 'mozzi1', summary: 'MOZZI | bscamp | test' },
];

const MOCK_PEERS = [
  { id: 'cto1', summary: 'CTO_LEADER | bscamp | test' },
  { id: 'pm1', summary: 'PM_LEADER | bscamp | test' },
];

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

// ─── task-quality-gate L1 bypass ───────────────────────────────────────

describe('task-quality-gate L1 bypass', () => {
  it('QL-1: docs/ only → L1 bypass, exit 0', () => {
    testEnv = createTestEnv();
    const hookPath = prepareTaskQualityGate(testEnv, {
      changedFiles: ['docs/plan.md', 'docs/design.md'],
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('L1');
  });

  it('QL-2: .claude/hooks/ → L1 bypass', () => {
    testEnv = createTestEnv();
    const hookPath = prepareTaskQualityGate(testEnv, {
      changedFiles: ['.claude/hooks/new-hook.sh'],
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('L1');
  });

  it('QL-3: __tests__/ only → L1 bypass', () => {
    testEnv = createTestEnv();
    const hookPath = prepareTaskQualityGate(testEnv, {
      changedFiles: ['__tests__/hooks/test.ts'],
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('L1');
  });

  it('QL-4: src/ change + tsc fail → exit 2', () => {
    testEnv = createTestEnv();
    const hookPath = prepareTaskQualityGate(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      tscPass: false,
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('TypeScript');
  });

  it('QL-5: src/ change + build fail → exit 2', () => {
    testEnv = createTestEnv();
    const hookPath = prepareTaskQualityGate(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      tscPass: true,
      buildPass: false,
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('build 실패');
  });

  it('QL-6: src/ + all pass + gap exists + pdca fresh → exit 0', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 95);
    writeFileSync(join(testEnv.tmpDir, '.pdca-status.json'), JSON.stringify({ updatedAt: new Date().toISOString() }));
    const hookPath = prepareTaskQualityGate(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      tscPass: true,
      buildPass: true,
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('품질 검증 통과');
  });

  it('QL-7: Teammate → bypass regardless', () => {
    testEnv = createTestEnv();
    const hookPath = prepareTaskQualityGate(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      tscPass: false,
    });
    const result = runHook(hookPath, { IS_TEAMMATE: 'true' });
    expect(result.exitCode).toBe(0);
  });

  it('QL-8: no changed files → L1 bypass', () => {
    testEnv = createTestEnv();
    const hookPath = prepareTaskQualityGate(testEnv, {
      changedFiles: [],
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('L1');
  });

  it('QL-9: scripts/ + CLAUDE.md → L1 bypass', () => {
    testEnv = createTestEnv();
    const hookPath = prepareTaskQualityGate(testEnv, {
      changedFiles: ['scripts/build.sh', 'CLAUDE.md'],
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('L1');
  });

  it('QL-10: mixed src/ + docs/ → L2 (src/ takes precedence, checks run)', () => {
    testEnv = createTestEnv();
    const hookPath = prepareTaskQualityGate(testEnv, {
      changedFiles: ['src/app/page.tsx', 'docs/plan.md'],
      tscPass: false,
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(2);
  });

  it('QL-11: src/ + no gap analysis → exit 2', () => {
    testEnv = createTestEnv();
    writeFileSync(join(testEnv.tmpDir, '.pdca-status.json'), '{}');
    const hookPath = prepareTaskQualityGate(testEnv, {
      changedFiles: ['src/components/Button.tsx'],
      tscPass: true,
      buildPass: true,
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('Gap 분석');
  });
});

// ─── pdca-chain-handoff L1 bypass ─────────────────────────────────────

describe('pdca-chain-handoff L1 bypass', () => {
  it('CL-1: L1 (docs only) + no analysis → bypass Match Rate, MOZZI', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['docs/research.md'],
      mockBroker: { health: false },
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('MOZZI');
    expect(result.stdout).not.toContain('차단');
  });

  it('CL-2: L1 + broker up + MOZZI peer → auto-send', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['docs/report.md'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('자동 전송 완료');
    expect(result.stdout).toContain('MOZZI');
  });

  it('CL-3: L1 + broker down → ACTION_REQUIRED + L1 info', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['.claude/hooks/test.sh'],
      mockBroker: { health: false },
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ACTION_REQUIRED');
    expect(result.stdout).toContain('L1');
  });

  it('CL-4: L1 PAYLOAD에 process_level: "L1"', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['CLAUDE.md'],
      mockBroker: { health: false },
    });
    const result = runHook(hookPath, {});
    const payloadMatch = result.stdout.match(/PAYLOAD: ({[\s\S]*})/);
    expect(payloadMatch).not.toBeNull();
    const payload = JSON.parse(payloadMatch![1]);
    expect(payload.payload.process_level).toBe('L1');
  });

  it('CL-5: L1 PAYLOAD의 match_rate = 0 (N/A)', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['docs/plan.md'],
      mockBroker: { health: false },
    });
    const result = runHook(hookPath, {});
    const payloadMatch = result.stdout.match(/PAYLOAD: ({[\s\S]*})/);
    expect(payloadMatch).not.toBeNull();
    const payload = JSON.parse(payloadMatch![1]);
    expect(payload.payload.match_rate).toBe(0);
  });

  it('CL-6: L2 + no analysis → exit 2 (기존 동작)', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: false },
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('차단');
  });

  it('CL-7: L2 + 94% → exit 2 (기존 동작 보존)', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 94);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(2);
  });

  it('CL-8: L1 chain_step = "cto_to_coo"', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['docs/research.md'],
      mockBroker: { health: false },
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('cto_to_coo');
  });

  it('CL-9: mixed src/ + docs/ → L2 (Match Rate 필요, 없으면 차단)', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/lib/util.ts', 'docs/plan.md'],
      mockBroker: { health: false },
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(2);
  });

  it('CL-10: L1 summary에 "L1" 포함', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['__tests__/hooks/test.ts'],
      mockBroker: { health: false },
    });
    const result = runHook(hookPath, {});
    const payloadMatch = result.stdout.match(/PAYLOAD: ({[\s\S]*})/);
    expect(payloadMatch).not.toBeNull();
    const payload = JSON.parse(payloadMatch![1]);
    expect(payload.payload.summary).toContain('L1');
  });

  it('CL-11: L1 requires_manual_review = false', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['docs/plan.md'],
      mockBroker: { health: false },
    });
    const result = runHook(hookPath, {});
    const payloadMatch = result.stdout.match(/PAYLOAD: ({[\s\S]*})/);
    expect(payloadMatch).not.toBeNull();
    const payload = JSON.parse(payloadMatch![1]);
    expect(payload.payload.requires_manual_review).toBe(false);
  });
});
