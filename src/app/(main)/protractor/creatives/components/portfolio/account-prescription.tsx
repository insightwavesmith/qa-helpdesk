"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr/config";
import { Skeleton } from "@/components/ui/skeleton";

// ── 타입 ──────────────────────────────────────────────────────────

interface PrescriptionItem {
  rank: number;
  title: string;
  description: string;
  urgency: string;
  difficulty: string;
}

interface AccountPrescriptionResponse {
  prescriptions: PrescriptionItem[];
}

interface AccountPrescriptionProps {
  accountId: string;
}

// ── 색상 설정 ────────────────────────────────────────────────────

const RANK_COLORS = [
  { color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
  { color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
  { color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
];

const URGENCY_STYLES: Record<string, { bg: string; color: string }> = {
  긴급: { bg: "rgba(239,68,68,0.12)", color: "#ef4444" },
  "🖱 행동": { bg: "rgba(245,158,11,0.12)", color: "#f59e0b" },
  PDA: { bg: "rgba(139,92,246,0.12)", color: "#8b5cf6" },
};

const DIFFICULTY_STYLES: Record<string, { bg: string; color: string }> = {
  쉬움: { bg: "rgba(16,185,129,0.12)", color: "#10b981" },
  보통: { bg: "rgba(16,185,129,0.12)", color: "#10b981" },
  어려움: { bg: "rgba(245,158,11,0.12)", color: "#f59e0b" },
};

// ── 컴포넌트 ──────────────────────────────────────────────────────

export function AccountPrescription({ accountId }: AccountPrescriptionProps) {
  const { data, isLoading } = useSWR<AccountPrescriptionResponse>(
    accountId
      ? `/api/protractor/account-prescription?account_id=${accountId}`
      : null,
    jsonFetcher
  );

  if (isLoading) {
    return <Skeleton className="h-48 rounded-xl" />;
  }

  const prescriptions = data?.prescriptions ?? [];

  return (
    <div
      className="rounded-xl p-5"
      style={{
        border: "2px solid rgba(245,158,11,0.4)",
        borderLeftWidth: 4,
        borderLeftColor: "#f59e0b",
      }}
    >
      <h3
        className="flex items-center gap-2 text-[1.15rem] font-bold mb-3"
        style={{ color: "#f59e0b" }}
      >
        🏆 계정 처방 요약
      </h3>

      {prescriptions.length > 0 ? (
        <div className="space-y-2">
          {prescriptions.slice(0, 3).map((item, idx) => {
            const rankColor = RANK_COLORS[idx] ?? RANK_COLORS[2];
            const urgencyStyle = URGENCY_STYLES[item.urgency] ?? {
              bg: "rgba(100,100,100,0.12)",
              color: "#64748b",
            };
            const difficultyStyle = DIFFICULTY_STYLES[item.difficulty] ?? {
              bg: "rgba(16,185,129,0.12)",
              color: "#10b981",
            };

            return (
              <div
                key={item.rank}
                className="bg-white rounded-lg p-4 flex gap-3 items-start"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-base font-extrabold shrink-0"
                  style={{ background: rankColor.bg, color: rankColor.color }}
                >
                  {item.rank}
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-900">
                    {item.title}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                    {item.description}
                  </div>
                  <div className="flex gap-1.5 mt-1.5">
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-lg"
                      style={urgencyStyle}
                    >
                      {item.urgency}
                    </span>
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-lg"
                      style={difficultyStyle}
                    >
                      난이도: {item.difficulty}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-gray-400 text-center py-4">
          데이터 없음
        </div>
      )}
    </div>
  );
}
