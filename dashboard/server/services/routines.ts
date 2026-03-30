// dashboard/server/services/routines.ts
// Paperclip routines.ts 기반 — companyId/trigger/issue 제거, 간단한 cron + exec
import { eq, sql } from 'drizzle-orm';
import { execSync } from 'child_process';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { routines, events } from '../db/schema.js';
import { eventBus } from '../event-bus.js';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 간단한 Cron 파서 (5-field: min hour dom month dow)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function validateCron(expression: string): string | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return `cron은 5개 필드 필수 (받은 ${parts.length}개)`;

  const ranges = [
    { name: 'minute', min: 0, max: 59 },
    { name: 'hour', min: 0, max: 23 },
    { name: 'day', min: 1, max: 31 },
    { name: 'month', min: 1, max: 12 },
    { name: 'weekday', min: 0, max: 7 },
  ];

  for (let i = 0; i < 5; i++) {
    const err = validateField(parts[i], ranges[i]);
    if (err) return err;
  }
  return null;
}

function validateField(field: string, range: { name: string; min: number; max: number }): string | null {
  if (field === '*') return null;

  // */N 패턴
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    if (isNaN(step) || step < 1) return `${range.name}: 잘못된 step ${field}`;
    return null;
  }

  // 콤마 분리
  const segments = field.split(',');
  for (const seg of segments) {
    // 범위 (e.g. 1-5)
    if (seg.includes('-')) {
      const [lo, hi] = seg.split('-').map(Number);
      if (isNaN(lo) || isNaN(hi) || lo < range.min || hi > range.max || lo > hi) {
        return `${range.name}: 잘못된 범위 ${seg}`;
      }
      continue;
    }
    // 단일 값
    const val = parseInt(seg, 10);
    if (isNaN(val) || val < range.min || val > range.max) {
      return `${range.name}: 잘못된 값 ${seg} (${range.min}-${range.max})`;
    }
  }
  return null;
}

function expandField(field: string, min: number, max: number): number[] {
  if (field === '*') {
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    const result: number[] = [];
    for (let i = min; i <= max; i += step) result.push(i);
    return result;
  }
  const result: number[] = [];
  for (const seg of field.split(',')) {
    if (seg.includes('-')) {
      const [lo, hi] = seg.split('-').map(Number);
      for (let i = lo; i <= hi; i++) result.push(i);
    } else {
      result.push(parseInt(seg, 10));
    }
  }
  return result;
}

function nextCronRun(expression: string, after = new Date()): Date | null {
  const parts = expression.trim().split(/\s+/);
  const minutes = expandField(parts[0], 0, 59);
  const hours = expandField(parts[1], 0, 23);
  const doms = expandField(parts[2], 1, 31);
  const months = expandField(parts[3], 1, 12);
  let dows = expandField(parts[4], 0, 7);
  // 7 = Sunday와 같음
  if (dows.includes(7) && !dows.includes(0)) dows.push(0);

  const cursor = new Date(after.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  // 최대 1년 스캔
  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    const m = cursor.getMinutes();
    const h = cursor.getHours();
    const dom = cursor.getDate();
    const mon = cursor.getMonth() + 1;
    const dow = cursor.getDay();

    if (
      minutes.includes(m) &&
      hours.includes(h) &&
      doms.includes(dom) &&
      months.includes(mon) &&
      dows.includes(dow)
    ) {
      return new Date(cursor.getTime());
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RoutineService
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CreateRoutineInput {
  name: string;
  description?: string;
  cronExpression: string;
  command: string;
}

export interface UpdateRoutineInput {
  name?: string;
  description?: string;
  cronExpression?: string;
  command?: string;
  enabled?: number;
}

export interface ExecuteResult {
  skipped: boolean;
  reason?: string;
  status?: 'success' | 'failed';
  output?: string;
}

export class RoutineService {
  private db: DB;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;

  constructor(db: DB) {
    this.db = db;
  }

  create(input: CreateRoutineInput) {
    const err = validateCron(input.cronExpression);
    if (err) throw new Error(`cron 유효성 실패: ${err}`);

    const nextRun = nextCronRun(input.cronExpression);

    const routine = this.db.insert(routines).values({
      name: input.name,
      description: input.description,
      cronExpression: input.cronExpression,
      command: input.command,
      enabled: 1,
      nextRunAt: nextRun?.toISOString() ?? null,
    }).returning().get();

    this.recordEvent('routine.created', routine.id, {
      name: input.name,
      cronExpression: input.cronExpression,
    });

    return routine;
  }

  update(id: string, input: UpdateRoutineInput) {
    const updates: Record<string, unknown> = {
      ...input,
      updatedAt: new Date().toISOString(),
    };

    // cron 변경 시 next_run_at 재계산
    if (input.cronExpression) {
      const err = validateCron(input.cronExpression);
      if (err) throw new Error(`cron 유효성 실패: ${err}`);
      const nextRun = nextCronRun(input.cronExpression);
      updates.nextRunAt = nextRun?.toISOString() ?? null;
    }

    this.db.update(routines).set(updates)
      .where(eq(routines.id, id)).run();

    return this.db.select().from(routines)
      .where(eq(routines.id, id)).get();
  }

  delete(id: string) {
    this.db.delete(routines).where(eq(routines.id, id)).run();
    this.recordEvent('routine.deleted', id, {});
  }

  getById(id: string) {
    return this.db.select().from(routines)
      .where(eq(routines.id, id)).get();
  }

  list(filters: { enabled?: boolean } = {}) {
    if (filters.enabled !== undefined) {
      return this.db.select().from(routines)
        .where(eq(routines.enabled, filters.enabled ? 1 : 0))
        .all();
    }
    return this.db.select().from(routines).all();
  }

  async executeRoutine(id: string): Promise<ExecuteResult> {
    const routine = this.db.select().from(routines)
      .where(eq(routines.id, id)).get();
    if (!routine) throw new Error(`Routine ${id} not found`);

    // disabled 스킵
    if (!routine.enabled) {
      return { skipped: true, reason: 'disabled' };
    }

    // 동시 실행 방지
    if (routine.lastRunStatus === 'running') {
      return { skipped: true, reason: 'already_running' };
    }

    // running 상태 설정
    this.db.update(routines).set({
      lastRunStatus: 'running',
      lastRunAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).where(eq(routines.id, id)).run();

    let status: 'success' | 'failed' = 'success';
    let output = '';

    try {
      output = execSync(routine.command, {
        timeout: 30000,
        encoding: 'utf-8',
        shell: '/bin/sh',
      });
    } catch (e: unknown) {
      status = 'failed';
      output = e instanceof Error ? e.message : String(e);
    }

    // next_run_at 갱신
    const nextRun = nextCronRun(routine.cronExpression);

    this.db.update(routines).set({
      lastRunStatus: status,
      lastRunOutput: output.slice(0, 4096), // 4KB 제한
      nextRunAt: nextRun?.toISOString() ?? null,
      updatedAt: new Date().toISOString(),
    }).where(eq(routines.id, id)).run();

    const eventType = status === 'success' ? 'routine.executed' : 'routine.failed';
    this.recordEvent(eventType, id, { status, output: output.slice(0, 500) });

    eventBus.publish({
      type: eventType,
      actor: 'system',
      targetType: 'routine',
      targetId: id,
      payload: { status },
    });

    return { skipped: false, status, output };
  }

  /** 스케줄러 시작: 1분 간격으로 due routine 실행 */
  startScheduler(intervalMs = 60000) {
    this.schedulerTimer = setInterval(() => {
      this.scheduleCheck();
    }, intervalMs);
  }

  stopScheduler() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  /** 현재 시간 기준 next_run_at 지난 routine들 실행 */
  async scheduleCheck() {
    const now = new Date().toISOString();
    const dueRoutines = this.db.select().from(routines)
      .where(
        eq(routines.enabled, 1),
      ).all()
      .filter(r => r.nextRunAt && r.nextRunAt <= now && r.lastRunStatus !== 'running');

    for (const routine of dueRoutines) {
      await this.executeRoutine(routine.id);
    }
  }

  private recordEvent(type: string, targetId: string, payload: unknown) {
    this.db.insert(events).values({
      eventType: type,
      actor: 'system',
      targetType: 'routine',
      targetId,
      payload: JSON.stringify(payload),
    }).run();
  }
}
