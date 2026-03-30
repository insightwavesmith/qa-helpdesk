import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface LiveUpdateMessage {
  type: string;
  entity?: string;
  data?: unknown;
}

export function useLiveUpdates() {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // 연결 성공
      };

      ws.onmessage = (event) => {
        try {
          const msg: LiveUpdateMessage = JSON.parse(event.data);
          // 엔티티 타입에 따라 관련 쿼리 무효화
          if (msg.type === 'update') {
            switch (msg.entity) {
              case 'agent':
                queryClient.invalidateQueries({ queryKey: ['agents'] });
                queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                break;
              case 'ticket':
                queryClient.invalidateQueries({ queryKey: ['tickets'] });
                queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                break;
              case 'notification':
                queryClient.invalidateQueries({ queryKey: ['notifications'] });
                break;
              case 'cost':
                queryClient.invalidateQueries({ queryKey: ['costs'] });
                queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                break;
              case 'chain':
                queryClient.invalidateQueries({ queryKey: ['chains'] });
                break;
              default:
                // 알 수 없는 엔티티 → 전체 무효화
                queryClient.invalidateQueries();
                break;
            }
          }
        } catch {
          // 파싱 실패 무시
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        // 3초 후 재연결
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // WS 연결 실패 시 폴링으로 폴백 (useApi의 refetchInterval)
      reconnectTimer.current = setTimeout(connect, 5000);
    }
  }, [queryClient]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);
}
