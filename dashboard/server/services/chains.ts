// dashboard/server/services/chains.ts
// 완전 신규 — Paperclip approvals + routines 개념 기반
import { eq, and } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { workflowChains, workflowSteps, events, pdcaFeatures } from '../db/schema.js';
import { eventBus } from '../event-bus.js';
import { execSync } from 'child_process';
import type { TicketService } from './tickets.js';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

interface CompletionCondition {
  type: string;
  min?: number;
  conditions?: CompletionCondition[];
}

interface CreateStepInput {
  teamRole: string;
  phase: string;
  label: string;
  completionCondition?: CompletionCondition;
  deployConfig?: { command: string; verify: boolean };
}

interface EvalContext {
  ticket?: Record<string, unknown>;
  buildSuccess?: boolean;
  manualApproval?: boolean;
}

export class ChainService {
  private db: DB;
  private ticketSvc: TicketService;

  constructor(db: DB, ticketSvc: TicketService) {
    this.db = db;
    this.ticketSvc = ticketSvc;
  }

  async createChain(input: { name: string; description?: string }) {
    return this.db.insert(workflowChains).values({
      name: input.name,
      description: input.description,
    }).returning().get();
  }

  async addStep(chainId: string, input: CreateStepInput) {
    const existing = this.db.select().from(workflowSteps)
      .where(eq(workflowSteps.chainId, chainId)).all();
    const maxOrder = existing.length > 0
      ? Math.max(...existing.map(s => s.stepOrder))
      : 0;

    return this.db.insert(workflowSteps).values({
      chainId,
      stepOrder: maxOrder + 1,
      teamRole: input.teamRole,
      phase: input.phase,
      label: input.label,
      completionCondition: JSON.stringify(input.completionCondition ?? { type: 'manual' }),
      deployConfig: input.deployConfig ? JSON.stringify(input.deployConfig) : undefined,
    }).returning().get();
  }

  async reorderSteps(chainId: string, stepIds: string[]) {
    for (let i = 0; i < stepIds.length; i++) {
      this.db.update(workflowSteps).set({ stepOrder: i + 1 })
        .where(eq(workflowSteps.id, stepIds[i])).run();
    }
  }

  async listChains() {
    return this.db.select().from(workflowChains)
      .where(eq(workflowChains.active, 1)).all();
  }

  // P1, P2, P3, P6: 완료 조건 평가
  async evaluateCompletion(stepId: string, context: EvalContext): Promise<boolean> {
    const step = this.db.select().from(workflowSteps)
      .where(eq(workflowSteps.id, stepId)).get();
    if (!step) return false;
    const condition = JSON.parse(step.completionCondition) as CompletionCondition;
    return this.evaluateCondition(condition, context);
  }

  private async evaluateCondition(cond: CompletionCondition, ctx: EvalContext): Promise<boolean> {
    switch (cond.type) {
      case 'manual':
        return ctx.manualApproval === true;
      case 'checklist_all_done': {
        const list = JSON.parse((ctx.ticket?.checklist as string) ?? '[]');
        return list.length > 0 && list.every((i: { done: boolean }) => i.done);
      }
      case 'commit_exists':
        return !!ctx.ticket?.commitHash;
      case 'push_verified':
        return ctx.ticket?.pushVerified === 1;
      case 'match_rate':
        return ((ctx.ticket?.matchRate as number) ?? 0) >= (cond.min ?? 90);
      case 'build_success':
        return ctx.buildSuccess === true;
      case 'all':
        for (const sub of cond.conditions ?? []) {
          if (!await this.evaluateCondition(sub, ctx)) return false;
        }
        return true;
      default:
        return false;
    }
  }

  // P7: 다음 단계 자동 트리거
  async triggerNextStep(chainId: string, currentOrder: number) {
    const nextStep = this.db.select().from(workflowSteps)
      .where(and(
        eq(workflowSteps.chainId, chainId),
        eq(workflowSteps.stepOrder, currentOrder + 1),
      )).get();

    if (nextStep) {
      this.recordEvent('chain.auto_triggered', {
        chainId, fromStep: currentOrder, toStep: currentOrder + 1,
      });
      eventBus.publish({
        type: 'chain.auto_triggered',
        actor: 'system',
        targetType: 'chain',
        targetId: chainId,
      });

      const feature = this.db.select().from(pdcaFeatures)
        .where(eq(pdcaFeatures.chainId, chainId)).get();

      if (feature) {
        await this.ticketSvc.create({
          feature: feature.id,
          title: `${feature.displayName} — ${nextStep.label}`,
          assigneeTeam: nextStep.teamRole,
          pdcaPhase: nextStep.phase as 'plan' | 'design' | 'do' | 'check' | 'act' | 'deploy',
          chainId,
          chainStepId: nextStep.id,
        });

        this.db.update(pdcaFeatures).set({
          phase: this.phaseToStatus(nextStep.phase) as typeof pdcaFeatures.$inferSelect.phase,
          currentStep: nextStep.stepOrder,
          updatedAt: new Date().toISOString(),
        }).where(eq(pdcaFeatures.id, feature.id)).run();
      }
    } else {
      await this.onChainCompleted(chainId);
    }
  }

  // P9: 배포 단계 처리
  async executeDeployStep(step: { id: string; deployConfig: string | null }): Promise<boolean> {
    if (!step.deployConfig) return true;
    const config = JSON.parse(step.deployConfig);
    try {
      execSync(config.command, { timeout: 300000 });
      this.recordEvent('chain.deploy_triggered', {
        stepId: step.id, command: config.command, success: true,
      });
      return true;
    } catch (error) {
      this.recordEvent('system.deploy_result', {
        error: String(error).slice(-500), success: false,
      });
      return false;
    }
  }

  private async onChainCompleted(chainId: string) {
    this.recordEvent('chain.handoff', { chainId });
    eventBus.publish({
      type: 'chain.handoff',
      actor: 'system',
      targetType: 'chain',
      targetId: chainId,
    });
  }

  private phaseToStatus(phase: string): string {
    const map: Record<string, string> = {
      plan: 'planning',
      design: 'designing',
      do: 'implementing',
      check: 'checking',
      act: 'acting',
      deploy: 'implementing',
    };
    return map[phase] ?? 'planning';
  }

  private recordEvent(type: string, payload: Record<string, unknown>) {
    this.db.insert(events).values({
      eventType: type,
      actor: 'system',
      targetType: 'chain',
      payload: JSON.stringify(payload),
    }).run();
  }
}
