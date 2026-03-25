// src/types/web-terminal.ts

import type { TeamId } from './agent-dashboard';

/** 터미널 세션 식별자 */
export type TerminalSessionId = 'cto' | 'pm' | 'marketing';

/** 터미널 세션 연결 상태 */
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

/** 터미널 세션 설정 */
export interface TerminalSession {
  id: TerminalSessionId;
  tmuxSession: string;     // 실제 tmux 세션명: 'sdk-cto', 'sdk-pm', 'sdk-mkt'
  displayName: string;     // 'CTO팀', 'PM팀', '마케팅팀'
  emoji: string;
  color: string;           // 팀 대표 색상
  status: ConnectionStatus;
  lastOutput: string;      // 마지막 출력 라인 (사이드바 미리보기용)
  lastOutputAt: string;    // ISO 8601
  bufferSize: number;      // 현재 스크롤백 버퍼 줄 수
}

/** 세션 설정 상수 (서버 + 클라이언트 공유) */
export const TERMINAL_SESSIONS: Record<TerminalSessionId, {
  tmuxSession: string;
  displayName: string;
  emoji: string;
  color: string;
  teamId: TeamId;
}> = {
  cto: {
    tmuxSession: 'sdk-cto',
    displayName: 'CTO팀',
    emoji: '⚙️',
    color: '#10b981',
    teamId: 'cto',
  },
  pm: {
    tmuxSession: 'sdk-pm',
    displayName: 'PM팀',
    emoji: '📋',
    color: '#8b5cf6',
    teamId: 'pm',
  },
  marketing: {
    tmuxSession: 'sdk-mkt',
    displayName: '마케팅팀',
    emoji: '📊',
    color: '#f59e0b',
    teamId: 'marketing',
  },
};

// ── 서버 -> 클라이언트 메시지 ──

/** 터미널 출력 데이터 */
export interface WsTerminalOutput {
  type: 'terminal.output';
  sessionId: TerminalSessionId;
  data: string;           // 터미널 출력 (ANSI escape 포함). diff만 전송
  timestamp: string;      // ISO 8601
}

/** 세션 상태 업데이트 */
export interface WsSessionStatus {
  type: 'session.status';
  sessions: Pick<TerminalSession, 'id' | 'status' | 'lastOutput' | 'lastOutputAt'>[];
}

/** 초기 히스토리 (연결 직후 전송) */
export interface WsSessionHistory {
  type: 'session.history';
  sessionId: TerminalSessionId;
  data: string;           // 전체 스크롤백 버퍼 (최대 1000줄)
  lineCount: number;
}

/** 에러 메시지 */
export interface WsError {
  type: 'error';
  code: string;           // 'TMUX_SESSION_NOT_FOUND' | 'AUTH_FAILED' | 'SEND_BLOCKED'
  message: string;
  sessionId?: TerminalSessionId;
}

/** 입력 차단 알림 (위험 명령 감지) */
export interface WsInputBlocked {
  type: 'input.blocked';
  sessionId: TerminalSessionId;
  input: string;          // 차단된 입력 원문
  reason: string;         // '위험 명령 감지: rm -rf' 등
}

/** 서버 -> 클라이언트 메시지 유니온 */
export type WsServerMessage =
  | WsTerminalOutput
  | WsSessionStatus
  | WsSessionHistory
  | WsError
  | WsInputBlocked;

// ── 클라이언트 -> 서버 메시지 ──

/** 터미널 입력 전달 */
export interface WsTerminalInput {
  type: 'terminal.input';
  sessionId: TerminalSessionId;
  data: string;           // 사용자 입력 텍스트
  sendEnter?: boolean;    // true면 입력 후 Enter 키 전송 (기본값: true)
}

/** 세션 구독 (특정 세션 출력 수신 시작) */
export interface WsSubscribe {
  type: 'subscribe';
  sessionId: TerminalSessionId;
}

/** 히스토리 요청 (세션 전환 시) */
export interface WsRequestHistory {
  type: 'request.history';
  sessionId: TerminalSessionId;
  lines?: number;         // 요청 줄 수 (기본값: 1000)
}

/** 클라이언트 -> 서버 메시지 유니온 */
export type WsClientMessage =
  | WsTerminalInput
  | WsSubscribe
  | WsRequestHistory;

/** 슬랙 알림 로그 항목 (사이드바 표시용) */
export interface SlackLogEntry {
  event: string;
  team: TeamId;
  title: string;
  message: string;
  sentAt: string;
  status: 'sent' | 'failed';
}
