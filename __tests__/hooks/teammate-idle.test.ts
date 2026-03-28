// __tests__/hooks/teammate-idle.test.ts — teammate-idle.sh 소유권 필터 테스트
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEnv, runHook, cleanupTestEnv, prepareHookScript } from './helpers';
import { writeFileSync } from 'fs';
import { join } from 'path';

const ORIGINAL_HOOK = '/Users/smith/projects/bscamp/.claude/hooks/teammate-idle.sh';

describe('teammate-idle.sh', () => {
  let env: ReturnType<typeof createTestEnv>;
  let hookPath: string;

  beforeEach(() => {
    env = createTestEnv();
    hookPath = prepareHookScript(ORIGINAL_HOOK, env.tmpDir, env.hooksDir);
  });

  afterEach(() => {
    cleanupTestEnv(env.tmpDir);
  });

  describe('1단계: team-context.json 기반 필터링', () => {
    it('UT-1: 자기 팀 TASK만 스캔, 다른 팀 TASK 무시', () => {
      // team-context: CTO-1, taskFiles: [TASK-CTO-RESUME.md]
      writeFileSync(join(env.runtimeDir, 'team-context.json'), JSON.stringify({
        team: 'CTO-1',
        taskFiles: ['TASK-CTO-RESUME.md'],
        teammates: []
      }));
      // CTO TASK: 미완료 있음
      writeFileSync(join(env.tasksDir, 'TASK-CTO-RESUME.md'),
        '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [ ] 미완료 항목\n');
      // PM TASK: 미완료 있음 (스캔되면 안 됨)
      writeFileSync(join(env.tasksDir, 'TASK-PM-RESUME.md'),
        '---\nteam: PM-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [ ] PM 미완료\n');

      const result = runHook(hookPath);
      expect(result.exitCode).toBe(2); // 미완료 있음 → 계속 작업
      expect(result.stdout).toContain('TASK-CTO-RESUME');
      expect(result.stdout).not.toContain('PM');
    });

    it('UT-3: 등록된 TASK 모두 완료 → exit 0', () => {
      writeFileSync(join(env.runtimeDir, 'team-context.json'), JSON.stringify({
        team: 'CTO-1',
        taskFiles: ['TASK-CTO-RESUME.md'],
        teammates: []
      }));
      writeFileSync(join(env.tasksDir, 'TASK-CTO-RESUME.md'),
        '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [x] 완료 항목\n');

      const result = runHook(hookPath);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('완료');
    });
  });

  describe('2단계: 프론트매터 폴백', () => {
    it('UT-2: team-context.json 없으면 프론트매터로 폴백 → 전체 스캔', () => {
      // team-context.json 없음
      writeFileSync(join(env.tasksDir, 'TASK-A.md'),
        '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [ ] 항목A\n');
      writeFileSync(join(env.tasksDir, 'TASK-B.md'),
        '---\nteam: PM-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [ ] 항목B\n');
      writeFileSync(join(env.tasksDir, 'TASK-C.md'),
        '# TASK\n- [ ] 레거시 항목C\n');

      const result = runHook(hookPath);
      expect(result.exitCode).toBe(2);
      // team-context 없고 CURRENT_TEAM도 없으면 전체 스캔 → 3개 모두 포함
    });
  });

  describe('엣지 케이스', () => {
    it('E-1: team-context.json 손상 → 프론트매터 폴백', () => {
      writeFileSync(join(env.runtimeDir, 'team-context.json'), '{invalid json!!!');
      writeFileSync(join(env.tasksDir, 'TASK-X.md'),
        '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [ ] 항목\n');

      const result = runHook(hookPath);
      expect(result.exitCode).toBe(2); // 폴백으로 전체 스캔 → 미완료 발견
    });

    it('E-4: 프론트매터 내 - [ ] 패턴은 체크박스로 오인 안 함', () => {
      writeFileSync(join(env.runtimeDir, 'team-context.json'), JSON.stringify({
        team: 'CTO-1',
        taskFiles: ['TASK-TRAP.md'],
        teammates: []
      }));
      // 프론트매터 안에 - [ ] 가 있고, 본문엔 체크박스 없음
      writeFileSync(join(env.tasksDir, 'TASK-TRAP.md'),
        '---\nteam: CTO-1\nstatus: in-progress\ncreated: 2026-03-28\nowner: leader\nassignees:\n  - role: backend-dev\n    tasks: [T1]\n---\n# TASK\n- [x] 완료된 항목만\n');

      const result = runHook(hookPath);
      expect(result.exitCode).toBe(0); // 프론트매터의 - 패턴은 무시됨
    });

    it('E-5: team: unassigned TASK는 스캔 제외', () => {
      // team-context 없으면 프론트매터 폴백
      writeFileSync(join(env.tasksDir, 'TASK-ORPHAN.md'),
        '---\nteam: unassigned\nstatus: pending\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [ ] 미배정 항목\n');

      const result = runHook(hookPath);
      expect(result.exitCode).toBe(0); // unassigned는 제외 → 미완료 0건
    });

    it('E-6: status: completed TASK는 체크박스 무관하게 스킵', () => {
      writeFileSync(join(env.runtimeDir, 'team-context.json'), JSON.stringify({
        team: 'CTO-1',
        taskFiles: ['TASK-DONE.md'],
        teammates: []
      }));
      writeFileSync(join(env.tasksDir, 'TASK-DONE.md'),
        '---\nteam: CTO-1\nstatus: completed\ncreated: 2026-03-28\nowner: leader\n---\n# TASK\n- [ ] 이건 무시됨\n');

      const result = runHook(hookPath);
      expect(result.exitCode).toBe(0); // completed → 스킵
    });
  });
});
