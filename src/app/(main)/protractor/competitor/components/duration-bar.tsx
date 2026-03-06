"use client";

interface DurationBarProps {
  durationDays: number;
  maxDays?: number;
}

export function DurationBar({ durationDays, maxDays = 365 }: DurationBarProps) {
  const pct = Math.min((durationDays / maxDays) * 100, 100);
  const isLongRunning = durationDays >= 30;

  return (
    <div className="w-full">
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isLongRunning ? "bg-[#F75D5D]" : "bg-gray-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
