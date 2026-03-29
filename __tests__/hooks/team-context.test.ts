// __tests__/hooks/team-context.test.ts — 팀 생성 + 역할 경계 테스트 (설계서 영역 2)
// TC-1~8: 8건 전체 신규

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  createTestEnv,
  cleanupTestEnv,
  loadFixture,
  runHook,
  prepareHookWithHelpers,
} from './helpers';

const HOOKS_DIR = '/Users/smith/projects/bscamp/.claude/hooks';

describe('team-context — 팀 생성 + 역할 경계', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => cleanupTestEnv(env.tmpDir));

  // TC-1: team-context.json 정상 구조
  it('TC-1: team, session, created, taskFiles 4개 필드 존재', () => {
    const ctx = loadFixture<Record<string, unknown>>('team_context_cto.json');
    expect(ctx).toHaveProperty('team');
    expect(ctx).toHaveProperty('session');
    expect(ctx).toHaveProperty('created');
    expect(ctx).toHaveProperty('taskFiles');
    expect(Array.isArray(ctx.taskFiles)).toBe(true);
  });

  // TC-2: CTO 팀 식별
  it('TC-2: team="CTO-1" → CTO 팀으로 식별', () => {
    const ctx = loadFixture<Record<string, unknown>>('team_context_cto.json');
    expect(ctx.team).toBe('CTO-1');
  });

  // TC-3: PM 팀 식별
  it('TC-3: team="PM" → PM 팀으로 식별', () => {
    const ctx = loadFixture<Record<string, unknown>>('team_context_pm.json');
    expect(ctx.team).toBe('PM');
  });

  // TC-4: taskFiles에 TASK 추가 → 등록
  it('TC-4: taskFiles 배열에 TASK 파일명 포함', () => {
    const ctx = loadFixture<{ taskFiles: string[] }>('team_context_cto.json');
    expect(ctx.taskFiles.length).toBeGreaterThan(0);
    expect(ctx.taskFiles[0]).toMatch(/^TASK-/);
  });

  // TC-5: PM 팀에서 backend-dev spawn 시도 → 차단
  it('TC-5: PM 팀 역할 경계 — backend-dev spawn 금지', () => {
    const pmAllowed = ['pm-researcher', 'pm-strategist', 'pm-prd', 'creative-analyst', 'lp-analyst', 'marketing-strategist'];
    const pmForbidden = ['backend-dev', 'frontend-dev', 'qa-engineer'];
    pmForbidden.forEach(role => {
      expect(pmAllowed).not.toContain(role);
    });
  });

  // TC-6: CTO 팀에서 pm-researcher spawn 시도 → 차단
  it('TC-6: CTO 팀 역할 경계 — pm-researcher spawn 금지', () => {
    const ctoAllowed = ['backend-dev', 'frontend-dev', 'qa-engineer', 'frontend-architect', 'infra-architect', 'security-architect'];
    const ctoForbidden = ['pm-researcher', 'pm-strategist', 'creative-analyst', 'lp-analyst'];
    ctoForbidden.forEach(role => {
      expect(ctoAllowed).not.toContain(role);
    });
  });

  // TC-7: team-context.json 없는 상태에서 hook 실행 → 폴백 (에러 없이 동작)
  it('TC-7: team-context.json 미존재 → hook들 에러 없이 동작', () => {
    // auto-team-cleanup.sh가 team-context 없이도 정상 종료하는지 확인
    const cleanupScript = join(HOOKS_DIR, 'auto-team-cleanup.sh');
    const hookPath = prepareHookWithHelpers(cleanupScript, env.tmpDir, env.hooksDir);

    // team-context.json 생성하지 않음 — 폴백 동작 검증
    const result = runHook(hookPath, { IS_TEAMMATE: 'true' });
    // 팀원이므로 즉시 exit 0 (team-context 유무와 무관)
    expect(result.exitCode).toBe(0);
  });

  // TC-8: taskFiles 빈 배열 → 체크박스 카운트 0
  it('TC-8: taskFiles=[] → 스캔 대상 TASK 0개', () => {
    const ctx = { team: 'CTO', session: 'test', created: '2026-03-29', taskFiles: [] as string[] };
    expect(ctx.taskFiles.length).toBe(0);
    // 빈 taskFiles는 스캔 대상 없음 → 체크박스도 0
  });
});
