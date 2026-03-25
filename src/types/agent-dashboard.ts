// src/types/agent-dashboard.ts

/** 팀 식별자 */
export type TeamId = 'pm' | 'marketing' | 'cto';

/** 에이전트 모델 */
export type AgentModel = 'opus' | 'sonnet' | 'haiku';

/** 팀 운영 상태 */
export type TeamStatus = 'active' | 'planned' | 'idle';

/** TASK 상태 */
export type TaskStatus = 'done' | 'active' | 'pending' | 'blocked';

/** PDCA 단계 */
export type PdcaPhase = 'planning' | 'designing' | 'implementing' | 'checking' | 'completed';

/** 팀 멤버 */
export interface AgentMember {
  name: string;
  model: AgentModel;
  role: string;
}

/** 팀 TASK */
export interface AgentTask {
  id: string;
  title: string;
  status: TaskStatus;
  assignee?: string;
  updatedAt: string;
}

/** 팀 상태 (단일 팀) */
export interface TeamState {
  name: string;
  emoji: string;
  status: TeamStatus;
  color: string;
  members: AgentMember[];
  tasks: AgentTask[];
}

/** 소통 로그 항목 */
export interface CommLog {
  time: string;
  from: string;
  to?: string;
  msg: string;
  team: TeamId;
}

/** 백그라운드 작업 */
export interface BackgroundTask {
  id: string;
  label: string;
  current: number;
  total: number;
  color: string;
  team: TeamId;
  status: 'running' | 'paused' | 'completed' | 'error';
}

/** PDCA Feature 상태 */
export interface PdcaFeature {
  name: string;
  phase: PdcaPhase;
  matchRate: number;
  documents: {
    plan?: string;
    design?: string;
    analysis?: string;
    report?: string;
  };
  startedAt: string;
  completedAt?: string;
  notes: string;
  team: TeamId;
}

/** 슬랙 알림 이벤트 종류 */
export type SlackEventType =
  | 'task.started'
  | 'task.completed'
  | 'chain.handoff'
  | 'deploy.completed'
  | 'error.critical'
  | 'approval.needed'
  | 'pdca.phase_change'
  | 'background.completed';

/** 슬랙 알림 우선순위 */
export type SlackPriority = 'normal' | 'important' | 'urgent';

/** 슬랙 알림 이벤트 */
export interface SlackNotification {
  id: string;
  event: SlackEventType;
  priority: SlackPriority;
  team: TeamId;
  targetTeam?: TeamId;
  title: string;
  message: string;
  metadata?: {
    feature?: string;
    taskId?: string;
    matchRate?: number;
    errorMessage?: string;
    dashboardUrl?: string;
  };
  channels: string[];
  ceoNotify: boolean;
  sentAt?: string;
  status: 'pending' | 'sent' | 'failed';
}

/** 슬랙 채널 설정 */
export interface SlackChannelConfig {
  pm: string;
  marketing: string;
  cto: string;
  ceoUserId: string;
}

/** 체인 전달 규칙 */
export interface ChainRule {
  fromTeam: TeamId;
  fromEvent: string;
  toTeam: TeamId;
  toAction: string;
}

/** 조직도 */
export interface OrgChart {
  ceo: { name: string; title: string };
  coo: { name: string; title: string };
  teams: {
    id: TeamId;
    name: string;
    emoji: string;
    lead: string;
    memberCount: number;
  }[];
}

/** 대시보드 전체 상태 (API 응답) */
export interface DashboardState {
  updatedAt: string;
  org: OrgChart;
  teams: Record<TeamId, TeamState>;
  logs: CommLog[];
  background: BackgroundTask[];
  pdca: {
    features: PdcaFeature[];
    summary: {
      total: number;
      completed: number;
      inProgress: number;
      avgMatchRate: number;
    };
  };
  connection: {
    status: 'live' | 'stale' | 'disconnected';
    lastPing: string;
  };
}
