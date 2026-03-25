'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { XtermRendererHandle } from './XtermRenderer';
import InputBar from './InputBar';
import type { TerminalSessionId, ConnectionStatus } from '@/types/web-terminal';
import { TERMINAL_SESSIONS } from '@/types/web-terminal';

const XtermRenderer = dynamic(() => import('./XtermRenderer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-white border border-gray-200 rounded-lg">
      <p className="text-sm text-gray-400 font-mono">터미널 로딩 중...</p>
    </div>
  ),
});

interface Props {
  sessionId: TerminalSessionId;
  connectionStatus: ConnectionStatus;
  pendingData: string[];
  onSend: (input: string) => void;
}

export default function TerminalView({
  sessionId,
  connectionStatus,
  pendingData,
  onSend,
}: Props) {
  const xtermRef = useRef<XtermRendererHandle | null>(null);
  const flushedIndexRef = useRef(0);
  const config = TERMINAL_SESSIONS[sessionId];
  const isConnected = connectionStatus === 'connected';

  // pendingData가 추가될 때마다 터미널에 write
  useEffect(() => {
    if (!xtermRef.current) return;
    const newItems = pendingData.slice(flushedIndexRef.current);
    if (newItems.length === 0) return;

    for (const data of newItems) {
      xtermRef.current.write(data);
    }
    flushedIndexRef.current = pendingData.length;
  }, [pendingData]);

  // 세션 전환(key 변경)이 일어나면 인덱스 초기화
  useEffect(() => {
    flushedIndexRef.current = 0;
  }, [sessionId]);

  return (
    <div className="flex flex-col h-full">
      {/* 터미널 영역 */}
      <div className="flex-1 min-h-0 p-3 bg-white overflow-hidden">
        <XtermRenderer ref={xtermRef} />
      </div>

      {/* 입력 바 */}
      <InputBar
        sessionId={sessionId}
        sessionName={config.displayName}
        connected={isConnected}
        onSend={onSend}
      />
    </div>
  );
}
