"use client";

import { useState } from "react";
import type { CompetitorMonitor } from "@/types/competitor";
import { Trash2 } from "lucide-react";

interface MonitorBrandCardProps {
  monitor: CompetitorMonitor;
  isSearching: boolean;
  onClick: () => void;
  onDelete: () => void;
}

/** 첫 글자 아바타 */
function LetterAvatar({ name }: { name: string }) {
  const letter = name.charAt(0).toUpperCase();
  return (
    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold shrink-0">
      {letter}
    </div>
  );
}

/** 페이지 프로필 이미지 (fallback: 첫 글자 아바타) */
function BrandLogo({
  pageId,
  brandName,
}: {
  pageId: string | null;
  brandName: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!pageId || failed) {
    return <LetterAvatar name={brandName} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://graph.facebook.com/${pageId}/picture?type=small`}
      alt={brandName}
      width={28}
      height={28}
      className="w-7 h-7 rounded-full shrink-0 object-cover"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
    />
  );
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
        <BrandLogo pageId={monitor.pageId} brandName={monitor.brandName} />
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
