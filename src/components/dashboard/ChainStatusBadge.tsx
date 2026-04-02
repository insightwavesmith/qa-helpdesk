"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

type ChainStatus = {
  ts: string | null;
  feature?: string;
  matchRate?: number;
  message?: string;
};

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (diff < 60000) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  return `${days}일 전`;
}

function isTimestampOverdue(ts: string): boolean {
  return Date.now() - new Date(ts).getTime() > 86400000;
}

export function ChainStatusBadge() {
  const [status, setStatus] = useState<ChainStatus | null>(null);

  useEffect(() => {
    fetch("/api/admin/chain-status")
      .then((res) => res.json())
      .then((data: ChainStatus) => setStatus(data))
      .catch(() => setStatus({ ts: null }));
  }, []);

  const isOverdue = status?.ts ? isTimestampOverdue(status.ts) : false;

  if (!status) return null;

  if (!status.ts) {
    return (
      <div className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        <span>체인 보고 없음</span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 text-[13px] px-2.5 py-1 rounded-md ${
        isOverdue
          ? "bg-red-50 text-red-600"
          : "bg-secondary/50 text-muted-foreground"
      }`}
    >
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span>
        마지막 체인 보고: {timeAgo(status.ts)}
        {status.feature ? ` (${status.feature})` : ""}
      </span>
    </div>
  );
}
