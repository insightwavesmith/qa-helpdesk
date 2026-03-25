'use client';

import { useState, useCallback, useRef } from 'react';
import type {
  TerminalSessionId,
  WsServerMessage,
  TerminalSession,
  WsClientMessage,
} from '@/types/web-terminal';
import { TERMINAL_SESSIONS } from '@/types/web-terminal';

interface UseTerminalSessionReturn {
  activeSession: TerminalSessionId;
  sessions: Record<TerminalSessionId, TerminalSession>;
  switchSession: (id: TerminalSessionId) => void;
  handleMessage: (msg: WsServerMessage) => void;
  getSessionBuffer: (id: TerminalSessionId) => string[];
}

function buildInitialSessions(): Record<TerminalSessionId, TerminalSession> {
  const initial: Record<string, TerminalSession> = {};
  for (const [id, config] of Object.entries(TERMINAL_SESSIONS)) {
    initial[id] = {
      id: id as TerminalSessionId,
      tmuxSession: config.tmuxSession,
      displayName: config.displayName,
      emoji: config.emoji,
      color: config.color,
      status: 'disconnected',
      lastOutput: '',
      lastOutputAt: '',
      bufferSize: 0,
    };
  }
  return initial as Record<TerminalSessionId, TerminalSession>;
}

export function useTerminalSession(
  send: (msg: WsClientMessage) => void,
): UseTerminalSessionReturn {
  const [activeSession, setActiveSession] = useState<TerminalSessionId>('cto');
  const [sessions, setSessions] = useState<Record<TerminalSessionId, TerminalSession>>(
    buildInitialSessions,
  );

  // 세션별 출력 버퍼 (XtermRenderer에 write 호출용)
  const termBuffers = useRef<Record<TerminalSessionId, string[]>>({
    cto: [],
    pm: [],
    marketing: [],
  });

  const switchSession = useCallback(
    (id: TerminalSessionId) => {
      setActiveSession(id);
      send({ type: 'subscribe', sessionId: id });
      send({ type: 'request.history', sessionId: id, lines: 1000 });
    },
    [send],
  );

  const handleMessage = useCallback((msg: WsServerMessage) => {
    switch (msg.type) {
      case 'terminal.output': {
        termBuffers.current[msg.sessionId].push(msg.data);
        setSessions((prev) => ({
          ...prev,
          [msg.sessionId]: {
            ...prev[msg.sessionId],
            lastOutput: msg.data.split('\n').filter(Boolean).pop() ?? '',
            lastOutputAt: msg.timestamp,
          },
        }));
        break;
      }

      case 'session.status': {
        setSessions((prev) => {
          const next = { ...prev };
          for (const s of msg.sessions) {
            if (next[s.id]) {
              next[s.id] = { ...next[s.id], ...s };
            }
          }
          return next;
        });
        break;
      }

      case 'session.history': {
        // 전체 히스토리로 버퍼 교체
        termBuffers.current[msg.sessionId] = [msg.data];
        setSessions((prev) => ({
          ...prev,
          [msg.sessionId]: {
            ...prev[msg.sessionId],
            bufferSize: msg.lineCount,
          },
        }));
        break;
      }

      case 'error':
      case 'input.blocked':
        // 다른 컴포넌트에서 lastMessage를 통해 처리
        break;
    }
  }, []);

  const getSessionBuffer = useCallback((id: TerminalSessionId) => {
    return termBuffers.current[id] ?? [];
  }, []);

  return { activeSession, sessions, switchSession, handleMessage, getSessionBuffer };
}
