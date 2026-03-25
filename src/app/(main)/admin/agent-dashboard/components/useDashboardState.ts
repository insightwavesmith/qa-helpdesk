'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { DashboardState } from '@/types/agent-dashboard';

const POLL_INTERVAL = 5000; // 5초
const STALE_THRESHOLD = 10000; // 10초
const DISCONNECTED_THRESHOLD = 30000; // 30초

export function useDashboardState() {
  const [data, setData] = useState<DashboardState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const lastSuccessRef = useRef<number>(Date.now());
  const prevDataRef = useRef<string>('');

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/agent-dashboard');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const newData: DashboardState = await res.json();

      // deep compare — 변경 시에만 리렌더링
      const newDataStr = JSON.stringify(newData);
      if (newDataStr !== prevDataRef.current) {
        prevDataRef.current = newDataStr;
        setData(newData);
      }

      lastSuccessRef.current = Date.now();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      // 에러 시 이전 데이터 유지 (setData 호출 안 함)
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchState]);

  // connection status 계산
  const getConnectionStatus = useCallback((): 'live' | 'stale' | 'disconnected' => {
    const elapsed = Date.now() - lastSuccessRef.current;
    if (elapsed < STALE_THRESHOLD) return 'live';
    if (elapsed < DISCONNECTED_THRESHOLD) return 'stale';
    return 'disconnected';
  }, []);

  const isLive = !error && data !== null;

  return { data, isLoading, error, isLive, getConnectionStatus };
}
