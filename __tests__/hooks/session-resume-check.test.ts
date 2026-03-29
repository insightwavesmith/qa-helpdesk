import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { createTestEnv, runHook, cleanupTestEnv, writePdcaStatus, writeRegistry, writeEmptyRegistry, writeTaskFile, prepareSessionResumeCheck } from './helpers';

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

describe('session-resume-check.sh — 세션 복구 감지', () => {
  it('SR-1: implementing 피처 → "미완료 피처 감지" + 피처명', () => {
    testEnv = createTestEnv();
    writePdcaStatus(testEnv.tmpDir, {
      features: {
        'agent-ops-dashboard': { currentState: 'implementing', phase: 'do' },
        'pdca-chain': { currentState: 'completed', phase: 'report' }
      }
    });
    const hookPath = prepareSessionResumeCheck(testEnv);
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('미완료 피처 감지');
    expect(result.stdout).toContain('agent-ops-dashboard');
    expect(result.stdout).not.toContain('pdca-chain');
    expect(result.exitCode).toBe(0);
  });

  it('SR-2: 전부 completed → "깨끗한 상태"', () => {
    testEnv = createTestEnv();
    writePdcaStatus(testEnv.tmpDir, {
      features: {
        'feature-a': { currentState: 'completed', phase: 'report' }
      }
    });
    writeEmptyRegistry(testEnv.tmpDir);
    const hookPath = prepareSessionResumeCheck(testEnv);
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('깨끗한 상태');
  });

  it('SR-3: pdca-status.json 없음 → 에러 안 남', () => {
    testEnv = createTestEnv();
    const hookPath = prepareSessionResumeCheck(testEnv);
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
  });

  it('SR-4: designing 상태 → 미완료 감지', () => {
    testEnv = createTestEnv();
    writePdcaStatus(testEnv.tmpDir, {
      features: {
        'new-feature': { currentState: 'designing', phase: 'design' }
      }
    });
    const hookPath = prepareSessionResumeCheck(testEnv);
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('미완료 피처 감지');
    expect(result.stdout).toContain('designing');
  });

  it('SR-5: active 멤버 잔존 → "좀비 팀원" 경고', () => {
    testEnv = createTestEnv();
    writePdcaStatus(testEnv.tmpDir, { features: {} });
    writeRegistry(testEnv.tmpDir, {
      team: 'CTO', shutdownState: 'running',
      members: {
        'backend-dev': { state: 'active', currentTask: 'TASK-X.md' }
      }
    });
    const hookPath = prepareSessionResumeCheck(testEnv);
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('이전 세션 팀원 잔존');
    expect(result.stdout).toContain('backend-dev');
  });

  it('SR-6: shutdownState=done → 좀비 경고 없음', () => {
    testEnv = createTestEnv();
    writePdcaStatus(testEnv.tmpDir, { features: {} });
    writeRegistry(testEnv.tmpDir, {
      team: 'CTO', shutdownState: 'done',
      members: { 'backend-dev': { state: 'terminated' } }
    });
    const hookPath = prepareSessionResumeCheck(testEnv);
    const result = runHook(hookPath, {});
    expect(result.stdout).not.toContain('팀원 잔존');
  });

  it('SR-7: teammate-registry.json 없음 → 에러 안 남', () => {
    testEnv = createTestEnv();
    writePdcaStatus(testEnv.tmpDir, { features: {} });
    const hookPath = prepareSessionResumeCheck(testEnv);
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
  });

  it('SR-8: members 빈 객체 → 좀비 없음', () => {
    testEnv = createTestEnv();
    writePdcaStatus(testEnv.tmpDir, { features: {} });
    writeRegistry(testEnv.tmpDir, {
      team: 'CTO', shutdownState: 'running', members: {}
    });
    const hookPath = prepareSessionResumeCheck(testEnv);
    const result = runHook(hookPath, {});
    expect(result.stdout).not.toContain('팀원 잔존');
  });

  it('SR-9: pending TASK 2건 → 미착수 감지', () => {
    testEnv = createTestEnv();
    writePdcaStatus(testEnv.tmpDir, { features: {} });
    writeTaskFile(testEnv.tmpDir, 'TASK-A.md', 'pending');
    writeTaskFile(testEnv.tmpDir, 'TASK-B.md', 'pending');
    writeTaskFile(testEnv.tmpDir, 'TASK-C.md', 'completed');
    const hookPath = prepareSessionResumeCheck(testEnv);
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('미착수 TASK 2건');
  });

  it('SR-10: 전부 completed → 미착수 없음', () => {
    testEnv = createTestEnv();
    writePdcaStatus(testEnv.tmpDir, { features: {} });
    writeTaskFile(testEnv.tmpDir, 'TASK-DONE.md', 'completed');
    const hookPath = prepareSessionResumeCheck(testEnv);
    const result = runHook(hookPath, {});
    expect(result.stdout).not.toContain('미착수');
  });

  it('SR-11: 3가지 이슈 동시 → 전부 출력', () => {
    testEnv = createTestEnv();
    writePdcaStatus(testEnv.tmpDir, {
      features: { 'wip': { currentState: 'implementing', phase: 'do' } }
    });
    writeRegistry(testEnv.tmpDir, {
      team: 'CTO', shutdownState: 'running',
      members: { 'fe-dev': { state: 'active', currentTask: null } }
    });
    writeTaskFile(testEnv.tmpDir, 'TASK-NEW.md', 'pending');
    const hookPath = prepareSessionResumeCheck(testEnv);
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('미완료 피처');
    expect(result.stdout).toContain('팀원 잔존');
    expect(result.stdout).toContain('미착수 TASK');
    expect(result.exitCode).toBe(0);
  });

  it('SR-12: 어떤 상황이든 exit 0 (정보 제공만)', () => {
    testEnv = createTestEnv();
    const pdcaPath = join(testEnv.tmpDir, '.bkit', 'state', 'pdca-status.json');
    mkdirSync(dirname(pdcaPath), { recursive: true });
    writeFileSync(pdcaPath, '{ broken json');
    const hookPath = prepareSessionResumeCheck(testEnv);
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
  });
});
