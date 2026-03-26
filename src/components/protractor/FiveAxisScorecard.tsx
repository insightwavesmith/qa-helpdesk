"use client";

import type { PrescriptionResponse } from "@/types/prescription";

interface FiveAxisScorecardProps {
  scores: PrescriptionResponse["scores"];
  percentiles: Record<string, number>;
}

const AXIS_CONFIG = [
  { key: "visual_impact", label: "시각 임팩트", icon: "👁", axis: "visual" },
  { key: "message_clarity", label: "메시지 명확성", icon: "📝", axis: "text" },
  { key: "cta_effectiveness", label: "CTA 효과성", icon: "🖱️", axis: "hook" },
  { key: "social_proof_score", label: "사회적 증거", icon: "👥", axis: "psychology" },
];

function ScoreBar({ value, max = 10 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 70 ? "bg-emerald-400" : pct >= 40 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="h-1.5 w-full rounded-full bg-gray-100">
      <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function PercentileBadge({ pct }: { pct?: number }) {
  if (pct == null) return null;
  const color = pct >= 70 ? "bg-emerald-100 text-emerald-700" : pct >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
      상위 {Math.round(100 - pct)}%
    </span>
  );
}

export function FiveAxisScorecard({ scores, percentiles }: FiveAxisScorecardProps) {
  const overallScore = scores.overall;
  const overallColor = overallScore >= 7 ? "text-emerald-600" : overallScore >= 4 ? "text-amber-600" : "text-red-600";

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">5축 점수 요약</h3>
            <p className="text-xs text-gray-500">시각·텍스트·심리·훅 종합 평가</p>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${overallColor}`}>{overallScore.toFixed(1)}</div>
            <div className="text-[10px] text-gray-400">/ 10점</div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        {AXIS_CONFIG.map(({ key, label, icon, axis }) => {
          const score = scores[key as keyof typeof scores] as number;
          const pct = percentiles[axis];
          return (
            <div key={key} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-base">{icon}</span>
                <PercentileBadge pct={pct} />
              </div>
              <div className="mb-1">
                <span className="text-lg font-bold text-gray-900">{score.toFixed(1)}</span>
                <span className="text-[10px] text-gray-400"> / 10</span>
              </div>
              <ScoreBar value={score} />
              <p className="mt-1.5 text-[10px] text-gray-500">{label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
