'use client';

import { useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useTerminalWebSocket } from './hooks/useTerminalWebSocket';
import { useTerminalSession } from './hooks/useTerminalSession';
import TerminalSidebar from './components/TerminalSidebar';
import TerminalView from './components/TerminalView';
import StatusBar from './components/StatusBar';
import ConnectionIndicator from './components/ConnectionIndicator';
import type { TerminalSessionId } from '@/types/web-terminal';

interface Props {
  token: string;
}

export default function TerminalClient({ token }: Props) {
  const { connectionStatus, send, lastMessage, retryCount } = useTerminalWebSocket({ token });

  const { activeSession, sessions, switchSession, handleMessage, getSessionBuffer } =
    useTerminalSession(send);

  // WebSocket 메시지 처리 — 세션 상태 업데이트
  useEffect(() => {
    if (!lastMessage) return;
    handleMessage(lastMessage);
  }, [lastMessage, handleMessage]);

  // 에러/차단 토스트 처리 (별도 effect)
  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'error') {
      if (lastMessage.code === 'AUTH_FAILED') {
        toast.error('인증에 실패했습니다. 다시 로그인해주세요.');
      } else if (lastMessage.code === 'SESSION_NOT_FOUND') {
        toast.error(`tmux 세션을 찾을 수 없습니다: ${lastMessage.message}`);
      } else if (lastMessage.code === 'SEND_FAILED') {
        toast.error('입력 전달에 실패했습니다.');
      } else {
        toast.error(lastMessage.message ?? '오류가 발생했습니다.');
      }
    }

    if (lastMessage.type === 'input.blocked') {
      toast.warning(`위험 명령이 차단되었습니다: ${lastMessage.reason}`);
    }
  }, [lastMessage]);

  // 입력 전송
  const handleSend = useCallback(
    (input: string) => {
      if (connectionStatus !== 'connected') {
        toast.error('WebSocket이 연결되지 않았습니다.');
        return;
      }
      send({
        type: 'terminal.input',
        sessionId: activeSession,
        data: input,
        sendEnter: true,
      });
    },
    [connectionStatus, send, activeSession],
  );

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* 헤더 */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-gray-900">📡 웹 터미널</span>
          <ConnectionIndicator
            status={connectionStatus}
            retryCount={retryCount}
            maxRetries={10}
          />
        </div>
        <Link
          href="/admin/agent-dashboard"
          className="text-sm text-gray-500 hover:text-[#F75D5D] transition-colors"
        >
          대시보드로 이동 →
        </Link>
      </header>

      {/* 메인 레이아웃 */}
      <div className="flex flex-1 min-h-0">
        {/* 좌측 사이드바 */}
        <TerminalSidebar
          sessions={sessions}
          activeSession={activeSession}
          onSessionChange={(id: TerminalSessionId) => switchSession(id)}
        />

        {/* 우측 터미널 + 입력 + 상태바 */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex-1 min-h-0">
            <TerminalView
              key={activeSession}
              sessionId={activeSession}
              connectionStatus={connectionStatus}
              pendingData={getSessionBuffer(activeSession)}
              onSend={handleSend}
            />
          </div>
          <StatusBar
            activeSession={activeSession}
            session={sessions[activeSession] ?? null}
            connectionStatus={connectionStatus}
          />
        </div>
      </div>
    </div>
  );
}
