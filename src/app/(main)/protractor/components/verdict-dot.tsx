"use client";

const VERDICT_COLORS: Record<string, string> = {
  "우수": "bg-green-500",
  "보통": "bg-yellow-500",
  "미달": "bg-red-500",
  "데이터 없음": "bg-muted-foreground/30",
};

export function VerdictDot({ label }: { label: string }) {
  const color = VERDICT_COLORS[label] || VERDICT_COLORS["데이터 없음"];
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${color}`}
      title={label}
    />
  );
}
