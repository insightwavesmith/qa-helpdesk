'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type {
  WsServerMessage,
  WsClientMessage,
  ConnectionStatus,
} from '@/types/web-terminal';

interface UseTerminalWebSocketOptions {
  token: string;
  wsUrl?: string;
  maxRetries?: number;
  retryInterval?: number;
}

interface UseTerminalWebSocketReturn {
  connectionStatus: ConnectionStatus;
  send: (msg: WsClientMessage) => void;
  lastMessage: WsServerMessage | null;
  retryCount: number;
}

export function useTerminalWebSocket({
  token,
  wsUrl = 'ws://localhost:3001',
  maxRetries = 10,
  retryInterval = 5000,
}: UseTerminalWebSocketOptions): UseTerminalWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<WsServerMessage | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    setConnectionStatus('connecting');
    const ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);

    ws.onopen = () => {
      setConnectionStatus('connected');
      retryCountRef.current = 0;
      setRetryCount(0);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsServerMessage = JSON.parse(event.data as string);
        setLastMessage(msg);
      } catch {
        // JSON 파싱 실패 무시
      }
    };

    ws.onclose = (event) => {
      wsRef.current = null;

      if (event.code === 4001) {
        // 인증 실패 — 재시도 안 함
        setConnectionStatus('error');
        return;
      }
      if (event.code === 4003) {
        // 권한 없음 — 재시도 안 함
        setConnectionStatus('error');
        return;
      }

      setConnectionStatus('disconnected');

      if (retryCountRef.current < maxRetries) {
        retryCountRef.current += 1;
        setRetryCount(retryCountRef.current);
        // exponential backoff: 최소 retryInterval, 최대 30초
        const delay = Math.min(retryInterval * Math.pow(1.5, retryCountRef.current - 1), 30000);
        retryTimerRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      setConnectionStatus('error');
    };

    wsRef.current = ws;
  }, [token, wsUrl, maxRetries, retryInterval]);

  const send = useCallback((msg: WsClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
      wsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connectionStatus, send, lastMessage, retryCount };
}
