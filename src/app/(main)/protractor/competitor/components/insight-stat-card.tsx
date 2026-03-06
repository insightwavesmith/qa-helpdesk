"use client";

interface InsightStatCardProps {
  label: string;
  value: string;
  subLabel?: string;
}

export function InsightStatCard({ label, value, subLabel }: InsightStatCardProps) {
  return (
    <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {subLabel && (
        <p className="text-xs text-gray-400 mt-1">{subLabel}</p>
      )}
    </div>
  );
}
