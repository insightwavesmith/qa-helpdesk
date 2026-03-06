"use client";

import { useEffect, useState, useCallback } from "react";
import type { CompetitorMonitor } from "@/types/competitor";
import { MonitorBrandCard } from "./monitor-brand-card";
import { AddMonitorDialog } from "./add-monitor-dialog";
import { Eye, Plus, ChevronDown, ChevronUp } from "lucide-react";

interface MonitorPanelProps {
  monitors: CompetitorMonitor[];
  setMonitors: (monitors: CompetitorMonitor[]) => void;
  onBrandClick: (monitor: CompetitorMonitor) => void;
  searchQuery: string;
}

export function MonitorPanel({
  monitors,
  setMonitors,
  onBrandClick,
  searchQuery,
}: MonitorPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState(true);

  // 모니터링 목록 로드
  const fetchMonitors = useCallback(async () => {
    try {
      const res = await fetch("/api/competitor/monitors");
      if (!res.ok) return;
      const json = await res.json();
      setMonitors(json.monitors ?? []);
    } catch {
      // 무시
    } finally {
      setLoading(false);
    }
  }, [setMonitors]);

  useEffect(() => {
    fetchMonitors();
  }, [fetchMonitors]);

  // 삭제
  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/competitor/monitors/${id}`, {
          method: "DELETE",
        });
        if (res.ok) {
          setMonitors(monitors.filter((m) => m.id !== id));
        }
      } catch {
        // 무시
      }
    },
    [monitors, setMonitors],
  );

  // 등록 완료
  const handleAdded = useCallback(
    (monitor: CompetitorMonitor) => {
      setMonitors([...monitors, monitor]);
      setShowDialog(false);
    },
    [monitors, setMonitors],
  );

  return (
    <div className="lg:w-[280px] shrink-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 text-sm font-semibold text-gray-900"
        >
          <Eye className="h-4 w-4 text-[#F75D5D]" />
          모니터링
          <span className="text-xs text-gray-400 font-normal">
            {monitors.length}/10
          </span>
          {collapsed ? (
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setShowDialog(true)}
          disabled={monitors.length >= 10}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#F75D5D] bg-red-50 hover:bg-red-100 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-3.5 w-3.5" />
          추가
        </button>
      </div>

      {/* 목록 */}
      {!collapsed && (
        <div className="space-y-2">
          {loading ? (
            <div className="py-6 text-center text-xs text-gray-400">
              불러오는 중...
            </div>
          ) : monitors.length === 0 ? (
            <div className="py-6 text-center text-xs text-gray-400 bg-gray-50 rounded-xl">
              <p>등록된 브랜드가 없습니다</p>
              <p className="mt-1">경쟁사를 추가해보세요</p>
            </div>
          ) : (
            monitors.map((monitor) => (
              <MonitorBrandCard
                key={monitor.id}
                monitor={monitor}
                isSearching={searchQuery === monitor.brandName}
                onClick={() => onBrandClick(monitor)}
                onDelete={() => handleDelete(monitor.id)}
              />
            ))
          )}
        </div>
      )}

      {/* 등록 다이얼로그 */}
      {showDialog && (
        <AddMonitorDialog
          onClose={() => setShowDialog(false)}
          onAdded={handleAdded}
          searchQuery={searchQuery}
        />
      )}
    </div>
  );
}
