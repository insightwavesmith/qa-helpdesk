import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCanvasStore } from '../../lib/brick/canvas-store';
import { throttledBlockUpdate } from '../../lib/brick/ws-throttle';
import type { BlockStatus } from '../../components/brick/nodes/types';

export interface BrickWsMessage {
  type: 'block' | 'gate' | 'team' | 'review_requested' | 'learning_proposal' | 'execution' | 'log';
  data: Record<string, unknown>;
}

export type ToastFn = (msg: { title: string; description?: string; variant?: string }) => void;

/**
 * Brick 전용 WebSocket 이벤트 핸들러
 * 기존 useLiveUpdates.ts를 수정하지 않고 별도 훅으로 생성
 */
export function useBrickLiveUpdates(options?: { onToast?: ToastFn }) {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onToast = options?.onToast;

  const handleMessage = useCallback(
    (msg: BrickWsMessage) => {
      switch (msg.type) {
        case 'block': {
          const { blockId, status } = msg.data as { blockId: string; status: BlockStatus };
          throttledBlockUpdate(blockId, status);
          queryClient.invalidateQueries({ queryKey: ['brick', 'executions'] });
          break;
        }
        case 'gate': {
          const { gateType, status: gateStatus } = msg.data as {
            gateType?: string;
            status?: string;
            blockId?: string;
            message?: string;
          };
          if (gateType === 'approval' && gateStatus === 'waiting') {
            onToast?.({
              title: '승인 요청',
              description: `${String(msg.data.blockId ?? '')} 블록이 승인을 대기 중입니다`,
              variant: 'warning',
            });
          } else {
            onToast?.({
              title: 'Gate 상태 변경',
              description: String(msg.data.message ?? ''),
              variant: 'info',
            });
          }
          queryClient.invalidateQueries({ queryKey: ['brick', 'gates'] });
          break;
        }
        case 'team': {
          queryClient.invalidateQueries({ queryKey: ['brick', 'teams'] });
          break;
        }
        case 'review_requested': {
          onToast?.({
            title: '리뷰 요청',
            description: String(msg.data.message ?? '리뷰가 요청되었습니다'),
            variant: 'warning',
          });
          break;
        }
        case 'learning_proposal': {
          onToast?.({
            title: '학습 제안',
            description: String(msg.data.message ?? '새 학습이 제안되었습니다'),
            variant: 'info',
          });
          queryClient.invalidateQueries({ queryKey: ['brick', 'learning'] });
          break;
        }
        case 'execution': {
          const { status } = msg.data as { status: string };
          if (status === 'completed' || status === 'failed') {
            const store = useCanvasStore.getState();
            store.updateNodeData('__execution__', { isExecuting: false });
          }
          queryClient.invalidateQueries({ queryKey: ['brick', 'executions'] });
          break;
        }
        case 'log': {
          const { blockId, message, level, timestamp } = msg.data as {
            blockId: string;
            message: string;
            level: string;
            timestamp: string;
          };
          queryClient.setQueryData(
            ['brick', 'logs', blockId],
            (old: unknown) => [
              ...(Array.isArray(old) ? old : []),
              { blockId, message, level, timestamp },
            ],
          );
          break;
        }
      }
    },
    [queryClient, onToast],
  );

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/brick/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg: BrickWsMessage = JSON.parse(event.data);
          handleMessage(msg);
        } catch {
          // 파싱 실패 무시
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      reconnectTimer.current = setTimeout(connect, 5000);
    }
  }, [handleMessage]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { handleMessage };
}
