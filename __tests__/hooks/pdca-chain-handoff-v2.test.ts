import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
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
    // V5: L1 → MOZZI webhook 전송
    expect(result.stdout).toContain('MOZZI');
    expect(result.stdout).toContain('전송 완료');
  });

  it('RV-2: src/ 변경(일반) → L2 → MOZZI 직접 (V2)', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 96);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx', 'src/components/Button.tsx'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('MOZZI');
    expect(result.stdout).toContain('cto_to_coo');
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
    expect(result.stdout).toContain('MOZZI');
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
    // V5: L3 webhook 성공 → "수동 검수 필수" 출력
    expect(result.stdout).toContain('수동 검수 필수');
  });

  it('RV-5: .env 변경 → L3 고위험 → 수동 검수 필수', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx', '.env.local'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    // V5: .env → L3 → webhook 성공 → saved to file, stdout에 수동 검수 표시
    expect(result.stdout).toContain('수동 검수 필수');
    // 저장된 report에 risk_flags 확인
    const reportPath = join(testEnv.tmpDir, '.bkit', 'runtime', 'last-completion-report.json');
    if (existsSync(reportPath)) {
      const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
      expect(JSON.stringify(report)).toContain('.env');
    }
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
  it('RV-8: broker + peers OK → "전송 완료" 메시지', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('전송 완료');
    expect(result.exitCode).toBe(0);
  });

  it('RV-9: broker 다운 → V5: MOZZI는 webhook 경로, broker 무관 → 전송 성공', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    // V5: MOZZI는 항상 webhook 경로 → broker 상태 무관
    expect(result.stdout).toContain('전송 완료');
    expect(result.exitCode).toBe(0);
  });

  it('RV-10: V5: MOZZI는 webhook 경로 → broker peer 존재 여부 무관', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: [{ id: 'cto1', summary: 'CTO_LEADER | bscamp' }], sendOk: true }
    });
    const result = runHook(hookPath, {});
    // V5: MOZZI는 webhook 전송 → broker peer lookup 불필요
    expect(result.stdout).toContain('전송 완료');
  });

  it('RV-11: V5: MOZZI webhook 경로 → 자기 peer 불필요', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: [{ id: 'mozzi1', summary: 'MOZZI | bscamp' }], sendOk: true }
    });
    const result = runHook(hookPath, {});
    // V5: webhook 경로로 전송
    expect(result.stdout).toContain('전송 완료');
  });

  it('RV-12: V5: MOZZI webhook 경로 → broker send 실패 무관', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: false }
    });
    const result = runHook(hookPath, {});
    // V5: webhook 경로 → broker send 실패와 무관하게 성공
    expect(result.stdout).toContain('전송 완료');
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
    expect(result.stdout).toContain('전송 완료');
  });

  it('RV-14: V5 webhook 성공 → last-completion-report.json 유효한 JSON', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 96);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('전송 완료');
    // V5: webhook 성공 시 PAYLOAD가 last-completion-report.json에 저장됨
    const reportPath = join(testEnv.tmpDir, '.bkit', 'runtime', 'last-completion-report.json');
    expect(existsSync(reportPath)).toBe(true);
    expect(() => JSON.parse(readFileSync(reportPath, 'utf-8'))).not.toThrow();
  });

  it('RV-15: V5 last-completion-report.json에 msg_id 포함', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('전송 완료');
    const reportPath = join(testEnv.tmpDir, '.bkit', 'runtime', 'last-completion-report.json');
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
    expect(report.msg_id).toMatch(/chain-cto-\d+-\d+/);
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
    expect(result.stdout).toContain('MOZZI');
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
