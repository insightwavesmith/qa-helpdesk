"use client";

import type { CompetitorMonitor } from "@/types/competitor";
import { Trash2 } from "lucide-react";

interface MonitorBrandCardProps {
  monitor: CompetitorMonitor;
  isSearching: boolean;
  onClick: () => void;
  onDelete: () => void;
}

export function MonitorBrandCard({
  monitor,
  isSearching,
  onClick,
  onDelete,
}: MonitorBrandCardProps) {
  const hasAlerts = (monitor.unreadAlertCount ?? 0) > 0;

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition group ${
        isSearching
          ? "bg-red-50 border-[#F75D5D]/30"
          : "bg-white border-gray-200 hover:border-gray-300"
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium text-gray-900 truncate">
          {monitor.brandName}
        </span>
        {hasAlerts && (
          <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-bold text-white bg-[#F75D5D] rounded-full">
            {monitor.unreadAlertCount}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition"
        title="모니터링 삭제"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
