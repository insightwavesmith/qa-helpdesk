// __tests__/hooks/l1-auto-report.test.ts — L1 자동 보고 차단 수정 TDD
// QL-1~11: task-quality-gate L1 bypass (11건)
// CL-1~11: pdca-chain-handoff L1 bypass (11건)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync, copyFileSync, existsSync } from 'fs';
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

  it('CL-5: L1 PAYLOAD type = ANALYSIS_REPORT (v3)', () => {
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
    expect(payload.type).toBe('ANALYSIS_REPORT');
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

  it('CL-8: L1 chain_step = "l1_to_coo" (v3)', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['docs/research.md'],
      mockBroker: { health: false },
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('l1_to_coo');
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

  it('CL-11: L1 to_role = MOZZI (v3)', () => {
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
    expect(payload.to_role).toBe('MOZZI');
  });
});

// ━━━ LR-1~LR-18: task-quality-gate v3 + pdca-chain-handoff v3 테스트 ━━━

// fs functions imported at top of file

// ─── task-quality-gate L0/L1 분기 (LR-1~LR-8) ───────────────────────

describe('task-quality-gate L0/L1 분기 (LR)', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => { env = createTestEnv(); });
  afterEach(() => { cleanupTestEnv(env.tmpDir); });

  function prepareQualityGateV3(changedFiles: string[], lastMsg: string): string {
    const originalPath = join(process.cwd(), '.claude/hooks/task-quality-gate.sh');
    let content = readFileSync(originalPath, 'utf-8');
    content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);
    // git diff mock
    const files = changedFiles.join('\\n');
    content = content.replace(
      /git diff HEAD~1 --name-only 2>\/dev\/null/g,
      `echo -e "${files}"`
    );
    content = content.replace(
      /git diff HEAD --name-only 2>\/dev\/null/g,
      `echo -e "${files}"`
    );
    // git log mock
    content = content.replace(
      /git log --oneline -1 2>\/dev\/null/g,
      `echo "${lastMsg}"`
    );
    // tsc/build mock (L2/L3에서만 실행되므로 항상 성공)
    content = content.replace(/npx tsc --noEmit 2>\/dev\/null/g, 'true');
    content = content.replace(/npm run build 2>\/dev\/null 1>\/dev\/null/g, 'true');
    const destPath = join(env.hooksDir, 'task-quality-gate.sh');
    writeFileSync(destPath, content, { mode: 0o755 });
    // is-teammate.sh mock
    writeFileSync(
      join(env.hooksDir, 'is-teammate.sh'),
      '#!/bin/bash\nIS_TEAMMATE="${IS_TEAMMATE:-false}"\n',
      { mode: 0o755 }
    );
    return destPath;
  }

  // LR-1: L0 (fix: 커밋) → 전부 스킵
  it('LR-1: fix: 커밋 → L0 → 전부 스킵 → exit 0', () => {
    const hookPath = prepareQualityGateV3(
      ['src/app/page.tsx'],
      'abc1234 fix: 긴급 수정'
    );
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('L0 응급');
  });

  // LR-2: L0 (hotfix: 커밋) → 전부 스킵
  it('LR-2: hotfix: 커밋 → L0 → 전부 스킵', () => {
    const hookPath = prepareQualityGateV3(
      ['src/lib/auth.ts'],
      'abc1234 hotfix: 인증 장애'
    );
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('L0 응급');
  });

  // LR-3: L1 (src/ 변경 없음) + docs/ 산출물 있음 → 통과
  it('LR-3: L1 + 산출물 있음 → 통과 메시지', () => {
    const docsDir = join(env.tmpDir, 'docs', '01-plan');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'test.plan.md'), '# Test Plan');
    const hookPath = prepareQualityGateV3(
      ['docs/01-plan/test.plan.md'],
      'abc1234 chore: Plan 작성'
    );
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('L1 경량');
    expect(result.stdout).toMatch(/산출물 \d+건 확인/);
  });

  // LR-4: L1 + 산출물 없음 → 경고만 (차단 안 함)
  it('LR-4: L1 + 산출물 없음 → 경고 출력 + exit 0', () => {
    const hookPath = prepareQualityGateV3(
      ['.claude/hooks/test.sh'],
      'abc1234 chore: hook 수정'
    );
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('산출물 없음');
  });

  // LR-5: L2 (src/ 변경 있음) → 기존 검증 (tsc+build+gap)
  it('LR-5: L2 → 기존 검증 실행', () => {
    const hookPath = prepareQualityGateV3(
      ['src/app/page.tsx'],
      'abc1234 feat: 새 기능'
    );
    const result = runHook(hookPath);
    // gap분석 문서 없으므로 실패 예상
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('Gap 분석');
  });

  // LR-6: L2 + gap분석 있음 → 통과
  it('LR-6: L2 + 모든 검증 통과 → exit 0', () => {
    writeAnalysisFile(env.tmpDir, 95);
    writeFileSync(join(env.tmpDir, '.pdca-status.json'), '{}');
    const hookPath = prepareQualityGateV3(
      ['src/app/page.tsx'],
      'abc1234 feat: 새 기능'
    );
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('품질 검증 통과');
  });

  // LR-7: 팀원 IS_TEAMMATE=true → 즉시 통과
  it('LR-7: 팀원 → 즉시 exit 0', () => {
    const hookPath = prepareQualityGateV3(
      ['src/lib/critical.ts'],
      'abc1234 feat: 위험 변경'
    );
    const result = runHook(hookPath, { IS_TEAMMATE: 'true' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('품질 검증 실패');
  });

  // LR-8: L1 + TASK 파일 변경 → 산출물로 인정
  it('LR-8: TASK 파일만 변경 → L1 산출물 인정', () => {
    const tasksDir = join(env.tmpDir, '.claude', 'tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, 'TASK-TEST.md'), '# Task');
    const hookPath = prepareQualityGateV3(
      ['.claude/tasks/TASK-TEST.md'],
      'abc1234 chore: TASK 추가'
    );
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('L1 경량');
  });
});

// ─── pdca-chain-handoff L1 ANALYSIS_REPORT (LR-9~LR-18) ────────────

describe('pdca-chain-handoff L1 ANALYSIS_REPORT (LR)', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => { env = createTestEnv(); });
  afterEach(() => { cleanupTestEnv(env.tmpDir); });

  const LR_MOCK_PEERS_WITH_MOZZI = [
    { id: 'cto1', summary: 'CTO_LEADER | bscamp' },
    { id: 'pm1', summary: 'PM_LEADER | bscamp' },
    { id: 'moz1', summary: 'MOZZI | bscamp' },
  ];

  // LR-9: L1 CTO팀 + broker OK → MOZZI에 ANALYSIS_REPORT 전송
  it('LR-9: L1 CTO → MOZZI ANALYSIS_REPORT 자동 전송', () => {
    writeTeamContext(env.tmpDir, 'CTO');
    const docsDir = join(env.tmpDir, 'docs', '01-plan');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'test.plan.md'), '# Plan');

    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['docs/01-plan/test.plan.md'],
      mockBroker: { health: true, peers: LR_MOCK_PEERS_WITH_MOZZI, sendOk: true }
    });
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ANALYSIS_REPORT');
    expect(result.stdout).toContain('MOZZI');
    expect(result.stdout).toContain('자동 전송 완료');
  });

  // LR-10: L1 PM팀 + broker OK → MOZZI에 ANALYSIS_REPORT 전송
  it('LR-10: L1 PM → MOZZI ANALYSIS_REPORT 자동 전송', () => {
    writeTeamContext(env.tmpDir, 'PM');
    const docsDir = join(env.tmpDir, 'docs', '01-plan');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'test.plan.md'), '# Plan');

    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['docs/01-plan/test.plan.md'],
      mockBroker: { health: true, peers: LR_MOCK_PEERS_WITH_MOZZI, sendOk: true }
    });
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ANALYSIS_REPORT');
    expect(result.stdout).toContain('PM_LEADER');
  });

  // LR-11: L1 + broker 다운 → ACTION_REQUIRED fallback
  it('LR-11: L1 + broker 다운 → ACTION_REQUIRED', () => {
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['docs/01-plan/test.plan.md'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ACTION_REQUIRED');
    expect(result.stdout).toContain('ANALYSIS_REPORT');
  });

  // LR-12: L1 + MOZZI peer 없음 → ACTION_REQUIRED fallback
  it('LR-12: L1 + MOZZI peer 미발견 → ACTION_REQUIRED', () => {
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['docs/01-plan/test.plan.md'],
      mockBroker: { health: true, peers: [{ id: 'cto1', summary: 'CTO_LEADER | bscamp' }], sendOk: true }
    });
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ACTION_REQUIRED');
  });

  // LR-13: L2 CTO → 기존 동작 (Match Rate 95% 게이트)
  it('LR-13: L2 CTO → 기존 Match Rate 게이트 작동', () => {
    writeTeamContext(env.tmpDir, 'CTO');
    writeAnalysisFile(env.tmpDir, 80);
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: LR_MOCK_PEERS_WITH_MOZZI, sendOk: true }
    });
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('체인 차단');
    expect(result.stdout).toContain('80%');
  });

  // LR-14: L2 CTO + Match Rate 97% → 기존 COMPLETION_REPORT
  it('LR-14: L2 CTO + 97% → COMPLETION_REPORT (PM 라우팅)', () => {
    writeTeamContext(env.tmpDir, 'CTO');
    writeAnalysisFile(env.tmpDir, 97);
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: LR_MOCK_PEERS_WITH_MOZZI, sendOk: true }
    });
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('자동 전송 완료');
    expect(result.stdout).toContain('PM_LEADER');
  });

  // LR-15: L0 (fix: 커밋) → Match Rate 스킵 → MOZZI 직접
  it('LR-15: L0 fix → MOZZI 직접 ANALYSIS_REPORT', () => {
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: LR_MOCK_PEERS_WITH_MOZZI, sendOk: true }
    });
    // git log mock을 fix: 으로 변경
    let content = readFileSync(hookPath, 'utf-8');
    content = content.replace(
      /echo "abc1234 test commit"/,
      'echo "abc1234 fix: 긴급 수정"'
    );
    writeFileSync(hookPath, content, { mode: 0o755 });

    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('L0');
    expect(result.stdout).toContain('MOZZI');
  });

  // LR-16: L1 payload에 deliverables 배열 포함 확인
  it('LR-16: L1 ANALYSIS_REPORT payload에 deliverables 포함', () => {
    writeTeamContext(env.tmpDir, 'CTO');
    const docsDir = join(env.tmpDir, 'docs', '01-plan');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'research.plan.md'), '# Research');

    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['docs/01-plan/research.plan.md'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath);
    expect(result.stdout).toContain('ANALYSIS_REPORT');
    expect(result.stdout).toContain('deliverables');
    expect(result.stdout).toContain('l1_to_coo');
  });

  // LR-17: L2 PM팀 → 기존대로 PM은 Match Rate 게이트 실행
  it('LR-17: L2 PM → Match Rate 게이트 작동', () => {
    writeTeamContext(env.tmpDir, 'PM');
    writeAnalysisFile(env.tmpDir, 70);
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: LR_MOCK_PEERS_WITH_MOZZI, sendOk: true }
    });
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('체인 차단');
  });

  // LR-18: 팀 컨텍스트 없음 → exit 0 (비대상)
  it('LR-18: team-context.json 없음 → exit 0', () => {
    // writeTeamContext 호출 안 함
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['docs/test.md'],
      mockBroker: { health: true, peers: LR_MOCK_PEERS_WITH_MOZZI, sendOk: true }
    });
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
  });
});
