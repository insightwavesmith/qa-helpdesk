'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { TerminalSessionId, ConnectionStatus, TerminalSession } from '@/types/web-terminal';
import { TERMINAL_SESSIONS } from '@/types/web-terminal';

const HISTORY_POLL_MS = 2000; // 2초마다 히스토리 폴링
const STATUS_POLL_MS = 5000; // 5초마다 세션 상태 폴링

interface SessionApiInfo {
  id: TerminalSessionId;
  exists: boolean;
  attached: boolean;
  lastActivity: string;
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

export function useTerminalRest() {
  const [activeSession, setActiveSession] = useState<TerminalSessionId>('cto');
  const [sessions, setSessions] = useState<Record<TerminalSessionId, TerminalSession>>(
    buildInitialSessions,
  );
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [outputBuffer, setOutputBuffer] = useState<string[]>([]);
  const prevOutputRef = useRef<string>('');

  // 세션 상태 폴링
  useEffect(() => {
    let mounted = true;

    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/terminal/sessions');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { ok: boolean; sessions: SessionApiInfo[] };
        if (!mounted || !data.ok) return;

        setConnectionStatus('connected');
        setSessions((prev) => {
          const next = { ...prev };
          for (const s of data.sessions) {
            if (next[s.id]) {
              next[s.id] = {
                ...next[s.id],
                status: s.exists ? 'connected' : 'disconnected',
              };
            }
          }
          return next;
        });
      } catch {
        if (mounted) setConnectionStatus('error');
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, STATUS_POLL_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // 히스토리 폴링 (활성 세션)
  useEffect(() => {
    let mounted = true;

    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/terminal/sessions/${activeSession}/history?lines=500`);
        if (!res.ok) return;
        const data = await res.json() as {
          ok: boolean;
          data: string;
          lineCount: number;
          capturedAt: string;
        };
        if (!mounted || !data.ok) return;

        // 변경이 있을 때만 버퍼 업데이트
        if (data.data !== prevOutputRef.current) {
          prevOutputRef.current = data.data;
          setOutputBuffer([data.data]);
          setSessions((prev) => ({
            ...prev,
            [activeSession]: {
              ...prev[activeSession],
              bufferSize: data.lineCount,
              lastOutputAt: data.capturedAt,
              lastOutput: data.data.split('\n').filter(Boolean).pop() ?? '',
            },
          }));
        }
      } catch {
        // 조용히 실패
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, HISTORY_POLL_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [activeSession]);

  // 세션 전환
  const switchSession = useCallback((id: TerminalSessionId) => {
    setActiveSession(id);
    prevOutputRef.current = '';
    setOutputBuffer([]);
  }, []);

  // 입력 전송 (REST)
  const sendInput = useCallback(
    async (input: string) => {
      try {
        const res = await fetch(`/api/terminal/sessions/${activeSession}/input`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: input, sendEnter: true }),
        });
        const result = await res.json();
        if (!result.ok) {
          return { ok: false, error: result.error, reason: result.reason ?? result.message };
        }
        return { ok: true };
      } catch {
        return { ok: false, error: 'NETWORK_ERROR', reason: '네트워크 오류' };
      }
    },
    [activeSession],
  );

  return {
    activeSession,
    sessions,
    connectionStatus,
    outputBuffer,
    switchSession,
    sendInput,
  };
}
