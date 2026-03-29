import { describe, it, expect, afterEach } from 'vitest';
import { createTestEnv, runHook, cleanupTestEnv, writeAnalysisFile, writeTeamContext, prepareChainHandoffV2 } from './helpers';

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

describe('위험도 게이트 분기', () => {
  it('RV-1: 변경 파일에 src/ 없음 → L1 → MOZZI 직접 (v3: l1_to_coo)', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['docs/plan.md'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('l1_to_coo');
    expect(result.stdout).toContain('MOZZI');
  });

  it('RV-2: src/ 변경(일반) → L2 → PM + auto_approve 30분', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 96);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx', 'src/components/Button.tsx'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('PM_LEADER');
    expect(result.stdout).toContain('auto_approve_after_minutes');
  });

  it('RV-3: auth 파일 변경 → 고위험 → PM 수동 검수 필수', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 98);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/lib/auth.ts', 'src/app/login/page.tsx'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('PM_LEADER');
    expect(result.stdout).toContain('수동 검수 필수');
    expect(result.stdout).not.toContain('auto_approve');
  });

  it('RV-4: migration 파일 변경 → L3 → PM 수동 필수', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 95);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/lib/migration/001.sql'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('requires_manual_review');
  });

  it('RV-5: .env 변경 → risk_flags에 .env 포함', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx', '.env.local'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('.env');
  });

  it('RV-6: payment 관련 파일 → 고위험 플래그', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 96);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/lib/payment/stripe.ts'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('수동 검수 필수');
  });

  it('RV-7: supabase 파일 변경 → 고위험', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/lib/supabase/server.ts'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('수동 검수 필수');
  });
});

describe('curl 직접 전송', () => {
  it('RV-8: broker + peers OK → "자동 전송 완료" 메시지', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('자동 전송 완료');
    expect(result.exitCode).toBe(0);
  });

  it('RV-9: broker 다운 → ACTION_REQUIRED + PAYLOAD 출력', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('ACTION_REQUIRED');
    expect(result.stdout).toContain('broker 미기동');
    expect(result.exitCode).toBe(0);
  });

  it('RV-10: 대상 peer 미발견 → ACTION_REQUIRED', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: [{ id: 'cto1', summary: 'CTO_LEADER | bscamp' }], sendOk: true }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('peer 미발견');
    expect(result.stdout).toContain('ACTION_REQUIRED');
  });

  it('RV-11: 자기 CTO peer 미발견 → ACTION_REQUIRED', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: [{ id: 'pm1', summary: 'PM_LEADER | bscamp' }], sendOk: true }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('자기 peer ID 미발견');
  });

  it('RV-12: send-message 실패 → ACTION_REQUIRED', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: false }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('전송 실패');
    expect(result.stdout).toContain('ACTION_REQUIRED');
  });

  it('RV-13: L1 → MOZZI peer 검색', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['docs/plan.md'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('MOZZI');
    expect(result.stdout).toContain('자동 전송 완료');
  });

  it('RV-14: PAYLOAD가 유효한 JSON', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 96);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    const payloadMatch = result.stdout.match(/PAYLOAD: ({[\s\S]*})/);
    expect(payloadMatch).not.toBeNull();
    expect(() => JSON.parse(payloadMatch![1])).not.toThrow();
  });

  it('RV-15: msg_id에 타임스탬프 + PID 포함', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toMatch(/chain-cto-\d+-\d+/);
  });
});

describe('기존 동작 호환', () => {
  it('RV-16: 팀원 → 즉시 bypass', () => {
    testEnv = createTestEnv();
    const hookPath = prepareChainHandoffV2(testEnv, {});
    const result = runHook(hookPath, { IS_TEAMMATE: 'true' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('ACTION_REQUIRED');
  });

  it('RV-17: PM 팀 → v3 전팀 대상, L1 ANALYSIS_REPORT', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'PM');
    const hookPath = prepareChainHandoffV2(testEnv, {
      mockBroker: { health: false },
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ANALYSIS_REPORT');
    expect(result.stdout).toContain('PM_LEADER');
  });

  it('RV-18: team-context 없음 → 비대상 통과', () => {
    testEnv = createTestEnv();
    const hookPath = prepareChainHandoffV2(testEnv, {});
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
  });

  it('RV-19: Match Rate 94% → exit 2', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 94);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('차단');
  });

  it('RV-20: Match Rate 95% 경계 → 통과', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 95);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('95%');
  });
});

describe('CTO 팀 변형 매칭', () => {
  it('RV-21: CTO-1 팀 → 대상으로 처리', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO-1');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('97%');
  });

  it('RV-22: CTO-2 팀 → 대상으로 처리', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 96);
    writeTeamContext(testEnv.tmpDir, 'CTO-2');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['docs/readme.md'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
  });

  it('RV-23: MKT 팀 → v3 전팀 대상, L1 ANALYSIS_REPORT', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'MKT');
    const hookPath = prepareChainHandoffV2(testEnv, {
      mockBroker: { health: false },
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ANALYSIS_REPORT');
    expect(result.stdout).toContain('MKT_LEADER');
  });
});
