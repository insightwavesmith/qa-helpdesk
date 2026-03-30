import { EventEmitter } from 'events';

// 28개 이벤트 타입 정의
export type EventType =
  // Ticket 생명주기 (7개)
  | 'ticket.created'
  | 'ticket.assigned'
  | 'ticket.status_changed'
  | 'ticket.checklist_updated'
  | 'ticket.completed'
  | 'ticket.commit_recorded'
  | 'ticket.push_verified'
  // Agent 생명주기 (6개)
  | 'agent.registered'
  | 'agent.status_changed'
  | 'agent.terminated'
  | 'agent.heartbeat'
  | 'agent.idle_warning'
  | 'agent.auto_paused'
  // 비용 (4개)
  | 'cost.recorded'
  | 'budget.warn'
  | 'budget.hard_stop'
  | 'budget.resolved'
  // PDCA (3개)
  | 'pdca.phase_changed'
  | 'pdca.match_rate_recorded'
  | 'pdca.completed'
  // 체인 (5개)
  | 'chain.step_started'
  | 'chain.step_completed'
  | 'chain.auto_triggered'
  | 'chain.handoff'
  | 'chain.deploy_triggered'
  // 반복 작업 (2개)
  | 'routine.executed'
  | 'routine.failed'
  // 학습 데이터 (2개)
  | 'knowledge.created'
  | 'knowledge.searched'
  // 시스템 (3개)
  | 'system.webhook_sent'
  | 'system.deploy_result'
  | 'system.error';

export interface BusEvent {
  type: EventType;
  actor: string;
  targetType?: string;
  targetId?: string;
  payload?: Record<string, unknown>;
  timestamp: string;
}

class EventBus extends EventEmitter {
  private static instance: EventBus;

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  publish(event: Omit<BusEvent, 'timestamp'>): void {
    const fullEvent: BusEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    this.emit(event.type, fullEvent);
    this.emit('*', fullEvent); // 와일드카드 리스너용
  }

  subscribe(type: EventType | '*', handler: (event: BusEvent) => void): void {
    this.on(type, handler);
  }

  unsubscribe(type: EventType | '*', handler: (event: BusEvent) => void): void {
    this.off(type, handler);
  }
}

export const eventBus = EventBus.getInstance();
export default eventBus;
