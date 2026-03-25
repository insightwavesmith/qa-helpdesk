'use client';

import type { TerminalSessionId, TerminalSession } from '@/types/web-terminal';
import { TERMINAL_SESSIONS } from '@/types/web-terminal';
import SessionTab from './SessionTab';
import SlackAlertLog from './SlackAlertLog';

interface Props {
  sessions: Record<TerminalSessionId, TerminalSession>;
  activeSession: TerminalSessionId;
  onSessionChange: (id: TerminalSessionId) => void;
}

const SESSION_ORDER: TerminalSessionId[] = ['cto', 'pm', 'marketing'];

export default function TerminalSidebar({ sessions, activeSession, onSessionChange }: Props) {
  return (
    <aside className="w-60 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col h-full">
      {/* 세션 목록 */}
      <div className="p-3 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
          에이전트 세션
        </p>
        <div className="space-y-1">
          {SESSION_ORDER.map((id) => {
            const session = sessions[id];
            const config = TERMINAL_SESSIONS[id];
            return (
              <SessionTab
                key={id}
                id={id}
                displayName={config.displayName}
                emoji={config.emoji}
                color={config.color}
                status={session?.status ?? 'disconnected'}
                lastOutput={session?.lastOutput}
                isActive={activeSession === id}
                onClick={() => onSessionChange(id)}
              />
            );
          })}
        </div>
      </div>

      {/* 슬랙 알림 로그 */}
      <div className="flex-1 p-3 overflow-hidden flex flex-col min-h-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1 flex-shrink-0">
          슬랙 알림
        </p>
        <div className="flex-1 overflow-y-auto">
          <SlackAlertLog />
        </div>
      </div>
    </aside>
  );
}
