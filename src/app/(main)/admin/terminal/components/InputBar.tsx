'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import type { TerminalSessionId } from '@/types/web-terminal';

interface Props {
  sessionId: TerminalSessionId;
  sessionName: string;
  connected: boolean;
  onSend: (input: string) => void;
}

export default function InputBar({ sessionName, connected, onSend }: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (!value.trim() || !connected) return;
    onSend(value);
    setValue('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-white border-t border-gray-200">
      <span className="text-sm text-gray-500 font-mono flex-shrink-0">
        {sessionName} $
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={!connected}
        placeholder={connected ? '명령어를 입력하세요...' : '연결 끊김'}
        className="flex-1 px-3 py-2 text-sm font-mono bg-gray-50 border border-gray-200 rounded-md
                   focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent
                   disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <button
        onClick={handleSend}
        disabled={!connected || !value.trim()}
        className="px-4 py-2 text-sm font-medium text-white rounded-md
                   bg-[#F75D5D] hover:bg-[#E54949]
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors flex-shrink-0"
      >
        전송
      </button>
    </div>
  );
}
