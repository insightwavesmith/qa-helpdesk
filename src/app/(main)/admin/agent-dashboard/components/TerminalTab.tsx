'use client';

import { useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import type { XtermRendererHandle } from '@/app/(main)/admin/terminal/components/XtermRenderer';
import InputBar from '@/app/(main)/admin/terminal/components/InputBar';
import SessionTab from '@/app/(main)/admin/terminal/components/SessionTab';
import StatusBar from '@/app/(main)/admin/terminal/components/StatusBar';
import SlackAlertLog from '@/app/(main)/admin/terminal/components/SlackAlertLog';
import { useTerminalRest } from './useTerminalRest';
import { TERMINAL_SESSIONS } from '@/types/web-terminal';
import type { TerminalSessionId } from '@/types/web-terminal';

const XtermRenderer = dynamic(
  () => import('@/app/(main)/admin/terminal/components/XtermRenderer'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-white border border-gray-200 rounded-lg">
        <p className="text-sm text-gray-400 font-mono">터미널 로딩 중...</p>
      </div>
    ),
  },
);

const SESSION_ORDER: TerminalSessionId[] = ['cto', 'pm', 'marketing'];

export default function TerminalTab() {
  const {
    activeSession,
    sessions,
    connectionStatus,
    outputBuffer,
    switchSession,
    sendInput,
  } = useTerminalRest();

  const xtermRef = useRef<XtermRendererHandle | null>(null);
  const flushedIndexRef = useRef(0);

  // 버퍼에 새 데이터가 오면 터미널에 write
  useEffect(() => {
    if (!xtermRef.current) return;
    const newItems = outputBuffer.slice(flushedIndexRef.current);
    if (newItems.length === 0) return;

    // REST 폴링은 전체 캡처를 반환하므로, 매번 clear 후 write
    xtermRef.current.clear();
    for (const data of outputBuffer) {
      xtermRef.current.write(data);
    }
    flushedIndexRef.current = outputBuffer.length;
  }, [outputBuffer]);

  // 세션 전환 시 인덱스 초기화
  useEffect(() => {
    flushedIndexRef.current = 0;
    xtermRef.current?.clear();
  }, [activeSession]);

  const handleSend = useCallback(
    async (input: string) => {
      const result = await sendInput(input);
      if (!result.ok) {
        if (result.error === 'INPUT_BLOCKED') {
          toast.warning(`위험 명령 차단: ${result.reason}`);
        } else {
          toast.error(result.reason ?? '입력 전달에 실패했습니다.');
        }
      }
    },
    [sendInput],
  );

  const isConnected = connectionStatus === 'connected';
  const config = TERMINAL_SESSIONS[activeSession];

  return (
    <div className="flex h-[calc(100vh-180px)] border border-gray-200 rounded-lg overflow-hidden">
      {/* 좌측 사이드바 */}
      <aside className="w-56 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
            에이전트 세션
          </p>
          <div className="space-y-1">
            {SESSION_ORDER.map((id) => {
              const session = sessions[id];
              return (
                <SessionTab
                  key={id}
                  id={id}
                  displayName={TERMINAL_SESSIONS[id].displayName}
                  emoji={TERMINAL_SESSIONS[id].emoji}
                  color={TERMINAL_SESSIONS[id].color}
                  status={session?.status ?? 'disconnected'}
                  lastOutput={session?.lastOutput}
                  isActive={activeSession === id}
                  onClick={() => switchSession(id)}
                />
              );
            })}
          </div>
        </div>
        <div className="flex-1 p-3 overflow-hidden flex flex-col min-h-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1 flex-shrink-0">
            슬랙 알림
          </p>
          <div className="flex-1 overflow-y-auto">
            <SlackAlertLog />
          </div>
        </div>
      </aside>

      {/* 우측 터미널 */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex-1 min-h-0 p-3 bg-white overflow-hidden">
          <XtermRenderer key={activeSession} ref={xtermRef} />
        </div>
        <InputBar
          sessionId={activeSession}
          sessionName={config.displayName}
          connected={isConnected}
          onSend={handleSend}
        />
        <StatusBar
          activeSession={activeSession}
          session={sessions[activeSession] ?? null}
          connectionStatus={connectionStatus}
        />
      </div>
    </div>
  );
}
