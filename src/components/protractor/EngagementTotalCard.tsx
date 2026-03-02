"use client";

// C1: 참여합계 지표 카드 — 성과요약 탭 전용

const GRADE_COLORS: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700",
  B: "bg-blue-100 text-blue-700",
  C: "bg-yellow-100 text-yellow-700",
  D: "bg-orange-100 text-orange-700",
  F: "bg-red-100 text-red-700",
};

interface EngagementTotalCardProps {
  engagementTotal: {
    value: number;
    benchmark: number;
    score: number;
    grade: string;
  } | null;
}

export function EngagementTotalCard({ engagementTotal }: EngagementTotalCardProps) {
  if (!engagementTotal) return null;

  const ratio = engagementTotal.benchmark > 0
    ? (engagementTotal.value / engagementTotal.benchmark * 100).toFixed(0)
    : "-";

  const gradeColor = GRADE_COLORS[engagementTotal.grade] ?? GRADE_COLORS.C;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">참여합계</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {engagementTotal.value.toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${gradeColor}`}>
            {engagementTotal.grade}등급
          </span>
          <p className="text-xs text-gray-400 mt-1">
            벤치마크 대비 {ratio}%
          </p>
        </div>
      </div>
    </div>
  );
}
