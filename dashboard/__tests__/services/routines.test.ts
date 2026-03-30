import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testDb } from '../setup';
import * as schema from '../../server/db/schema';
import { eq } from 'drizzle-orm';
import { RoutineService } from '../../server/services/routines';
import { eventBus } from '../../server/event-bus';

let svc: RoutineService;

beforeEach(() => {
  svc = new RoutineService(testDb);
});

describe('RoutineService', () => {
  // TC-R01: routine 생성 + events 기록
  it('TC-R01: routine 생성 + events 기록', () => {
    const routine = svc.create({
      name: '매일 빌드 체크',
      description: '매일 오전 9시 빌드 확인',
      cronExpression: '0 9 * * *',
      command: 'npm run build',
    });

    expect(routine.id).toBeDefined();
    expect(routine.name).toBe('매일 빌드 체크');
    expect(routine.cronExpression).toBe('0 9 * * *');
    expect(routine.enabled).toBe(1);
    expect(routine.nextRunAt).toBeDefined();

    const evts = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'routine.created')).all();
    expect(evts).toHaveLength(1);
    expect(evts[0].targetId).toBe(routine.id);
  });

  // TC-R02: cron_expression 유효성 검증
  it('TC-R02: 잘못된 cron_expression → 에러', () => {
    expect(() => svc.create({
      name: '잘못된 cron',
      cronExpression: 'invalid cron',
      command: 'echo test',
    })).toThrow();

    // 필드 5개 미만
    expect(() => svc.create({
      name: '필드 부족',
      cronExpression: '0 9 *',
      command: 'echo test',
    })).toThrow();

    // 유효한 cron은 통과
    const routine = svc.create({
      name: '유효한 cron',
      cronExpression: '*/5 * * * *',
      command: 'echo ok',
    });
    expect(routine.id).toBeDefined();
  });

  // TC-R03: enabled=0이면 실행 스킵
  it('TC-R03: enabled=0 → 실행 스킵', async () => {
    const routine = svc.create({
      name: '비활성 루틴',
      cronExpression: '0 9 * * *',
      command: 'echo should-not-run',
    });

    // 비활성화
    svc.update(routine.id, { enabled: 0 });

    const result = await svc.executeRoutine(routine.id);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('disabled');
  });

  // TC-R04: 실행 성공 → last_run_status='success' + next_run_at 갱신
  it('TC-R04: 실행 성공 → status=success + next_run_at 갱신', async () => {
    const routine = svc.create({
      name: '성공 루틴',
      cronExpression: '0 9 * * *',
      command: 'echo hello',
    });

    const oldNextRun = routine.nextRunAt;
    const result = await svc.executeRoutine(routine.id);

    expect(result.skipped).toBe(false);
    expect(result.status).toBe('success');

    const updated = testDb.select().from(schema.routines)
      .where(eq(schema.routines.id, routine.id)).get();
    expect(updated!.lastRunStatus).toBe('success');
    expect(updated!.lastRunAt).toBeDefined();
    // next_run_at 갱신됨
    expect(updated!.nextRunAt).toBeDefined();
  });

  // TC-R05: 실행 실패 → last_run_status='failed' + last_run_output 기록
  it('TC-R05: 실행 실패 → status=failed + output 기록', async () => {
    const routine = svc.create({
      name: '실패 루틴',
      cronExpression: '0 9 * * *',
      command: 'exit 1',
    });

    const result = await svc.executeRoutine(routine.id);
    expect(result.status).toBe('failed');

    const updated = testDb.select().from(schema.routines)
      .where(eq(schema.routines.id, routine.id)).get();
    expect(updated!.lastRunStatus).toBe('failed');
  });

  // TC-R06: 동시 실행 방지 (이미 running이면 스킵)
  it('TC-R06: 이미 running이면 실행 스킵', async () => {
    const routine = svc.create({
      name: '동시 실행 테스트',
      cronExpression: '0 9 * * *',
      command: 'echo test',
    });

    // running 상태로 강제 설정
    testDb.update(schema.routines).set({ lastRunStatus: 'running' })
      .where(eq(schema.routines.id, routine.id)).run();

    const result = await svc.executeRoutine(routine.id);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('already_running');
  });

  // TC-R07: routine 목록 조회 (활성/비활성 필터)
  it('TC-R07: 목록 조회 + 활성/비활성 필터', () => {
    svc.create({ name: '활성1', cronExpression: '0 9 * * *', command: 'echo 1' });
    svc.create({ name: '활성2', cronExpression: '0 10 * * *', command: 'echo 2' });
    const r3 = svc.create({ name: '비활성', cronExpression: '0 11 * * *', command: 'echo 3' });
    svc.update(r3.id, { enabled: 0 });

    const all = svc.list();
    expect(all).toHaveLength(3);

    const active = svc.list({ enabled: true });
    expect(active).toHaveLength(2);

    const disabled = svc.list({ enabled: false });
    expect(disabled).toHaveLength(1);
    expect(disabled[0].name).toBe('비활성');
  });

  // TC-R08: routine 삭제
  it('TC-R08: routine 삭제', () => {
    const routine = svc.create({
      name: '삭제 대상',
      cronExpression: '0 9 * * *',
      command: 'echo delete-me',
    });

    svc.delete(routine.id);

    const found = testDb.select().from(schema.routines)
      .where(eq(schema.routines.id, routine.id)).get();
    expect(found).toBeUndefined();

    const evts = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'routine.deleted')).all();
    expect(evts).toHaveLength(1);
  });
});
