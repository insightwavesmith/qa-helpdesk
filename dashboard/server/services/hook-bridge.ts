// dashboard/server/services/hook-bridge.ts
// 기존 bash hook → DB 이벤트 변환 브릿지 (P4 해결)
import { eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { tickets, events, pdcaFeatures, workflowSteps } from '../db/schema.js';
import { eventBus } from '../event-bus.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { TicketService } from './tickets.js';
import type { ChainService } from './chains.js';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

export interface HookPayload {
  commitHash?: string;
  changedFiles?: number;
  matchRate?: number;
  buildSuccess?: boolean;
  feature?: string;
}

export class HookBridgeService {
  private db: DB;
  private ticketSvc: TicketService;
  private chainSvc: ChainService;
  private outputDir: string;

  constructor(db: DB, ticketSvc: TicketService, chainSvc: ChainService, outputDir?: string) {
    this.db = db;
    this.ticketSvc = ticketSvc;
    this.chainSvc = chainSvc;
    this.outputDir = outputDir ?? '.bkit/state';
  }

  async onTaskCompleted(payload: HookPayload): Promise<void> {
    // 1) 가장 최근 in_progress ticket 찾기
    const ticket = this.db.select().from(tickets)
      .where(eq(tickets.status, 'in_progress'))
      .orderBy(sql`rowid DESC`)
      .get();

    if (ticket) {
      // 커밋 정보 기록
      if (payload.commitHash) {
        await this.ticketSvc.recordCommit(
          ticket.id,
          payload.commitHash,
          payload.changedFiles ?? 0,
        );
      }

      // match_rate 기록
      if (payload.matchRate != null) {
        this.db.update(tickets).set({
          matchRate: payload.matchRate,
          updatedAt: new Date().toISOString(),
        }).where(eq(tickets.id, ticket.id)).run();
      }

      // 체인 완료 조건 평가
      if (ticket.chainStepId) {
        try {
          const completed = await this.chainSvc.evaluateCompletion(ticket.chainStepId, {
            ticket: { ...ticket, matchRate: payload.matchRate ?? ticket.matchRate },
            buildSuccess: payload.buildSuccess,
          });

          if (completed) {
            const step = this.db.select().from(workflowSteps)
              .where(eq(workflowSteps.id, ticket.chainStepId)).get();
            if (step?.autoTriggerNext) {
              await this.chainSvc.triggerNextStep(ticket.chainId!, step.stepOrder);
            }
          }
        } catch {
          // 체인 평가 실패해도 계속 진행 (graceful degradation)
        }
      }
    }

    // 2) events 기록 (항상)
    this.db.insert(events).values({
      eventType: 'system.hook_executed',
      actor: 'hook:task-completed',
      payload: JSON.stringify(payload),
    }).run();

    // 3) P4: pdca-status.json 미러 동기화
    await this.syncToPdcaStatusJson();

    // 4) eventBus 전파
    eventBus.emit('hook.task_completed', payload);
  }

  // P4 핵심: DB → pdca-status.json 일방향 미러
  async syncToPdcaStatusJson(): Promise<void> {
    const features = this.db.select().from(pdcaFeatures).all();

    const active = features
      .filter(f => f.phase !== 'completed' && f.phase !== 'archived')
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));

    const status = {
      version: '3.0',
      lastUpdated: new Date().toISOString(),
      primaryFeature: active[0]?.id ?? null,
      activeFeatures: active.map(f => f.id),
      features: Object.fromEntries(features.map(f => [f.id, {
        displayName: f.displayName,
        phase: f.phase,
        processLevel: f.processLevel,
        plan: { done: !!f.planDone, doc: f.planDoc, at: f.planAt },
        design: { done: !!f.designDone, doc: f.designDoc, at: f.designAt },
        do: { done: !!f.doDone, commit: f.doCommit, at: f.doAt },
        check: { done: !!f.checkDone, doc: f.checkDoc, matchRate: f.matchRate },
        act: { done: !!f.actDone, commit: f.actCommit, deployedAt: f.deployedAt },
      }])),
    };

    mkdirSync(this.outputDir, { recursive: true });
    writeFileSync(join(this.outputDir, 'pdca-status.json'), JSON.stringify(status, null, 2));
  }
}
