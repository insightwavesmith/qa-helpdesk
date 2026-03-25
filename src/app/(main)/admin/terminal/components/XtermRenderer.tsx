'use client';

import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface XtermRendererHandle {
  write: (data: string) => void;
  clear: () => void;
  focus: () => void;
}

interface Props {
  onResize?: (cols: number, rows: number) => void;
}

const XTERM_OPTIONS = {
  theme: {
    background: '#ffffff',
    foreground: '#1e1e1e',
    cursor: '#F75D5D',
    cursorAccent: '#ffffff',
    selectionBackground: '#F75D5D33',
    black: '#1e1e1e',
    red: '#F75D5D',
    green: '#10b981',
    yellow: '#f59e0b',
    blue: '#3b82f6',
    magenta: '#8b5cf6',
    cyan: '#06b6d4',
    white: '#f5f5f5',
    brightBlack: '#6b7280',
    brightRed: '#E54949',
    brightGreen: '#34d399',
    brightYellow: '#fbbf24',
    brightBlue: '#60a5fa',
    brightMagenta: '#a78bfa',
    brightCyan: '#22d3ee',
    brightWhite: '#ffffff',
  },
  fontFamily: "'Pretendard', 'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 14,
  lineHeight: 1.4,
  scrollback: 1000,
  cursorBlink: true,
  cursorStyle: 'bar' as const,
  allowProposedApi: true,
};

const XtermRenderer = forwardRef<XtermRendererHandle, Props>(
  function XtermRenderer({ onResize }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);

    useImperativeHandle(ref, () => ({
      write: (data: string) => terminalRef.current?.write(data),
      clear: () => terminalRef.current?.clear(),
      focus: () => terminalRef.current?.focus(),
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      const terminal = new Terminal(XTERM_OPTIONS);
      const fitAddon = new FitAddon();

      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);

      // 약간의 딜레이 후 fit (컨테이너 크기 확정 후)
      const fitTimer = setTimeout(() => {
        fitAddon.fit();
        onResize?.(terminal.cols, terminal.rows);
      }, 50);

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      const handleResize = () => {
        fitAddon.fit();
        onResize?.(terminal.cols, terminal.rows);
      };
      window.addEventListener('resize', handleResize);

      return () => {
        clearTimeout(fitTimer);
        window.removeEventListener('resize', handleResize);
        terminal.dispose();
        terminalRef.current = null;
        fitAddonRef.current = null;
      };
    // onResize는 콜백이므로 deps에서 제외 (안정성 보장 위해)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <div
        ref={containerRef}
        className="w-full h-full min-h-[400px]"
        style={{ backgroundColor: '#ffffff' }}
      />
    );
  },
);

XtermRenderer.displayName = 'XtermRenderer';

export default XtermRenderer;
