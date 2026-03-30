"use client";

import type { CustomerJourneyDetail } from "@/types/prescription";

// ── 고객 여정 요약 4단계 카드 ────────────────────────────────────────
// 목업: 감각👁👂 / 사고🧠 / 행동-선행🖱 / 행동-후행💳

interface JourneySummaryProps {
  summary: {
    sensation: string;
    thinking: string;
    action_click: string;
    action_purchase: string;
  } | null;
  detail?: CustomerJourneyDetail | null;
  coreInsight?: string;
}

const STAGES = [
  {
    key: "sensation",
    emoji: "👁👂",
    label: "감각",
    color: "#06b6d4",
    borderColor: "#06b6d4",
  },
  {
    key: "thinking",
    emoji: "🧠",
    label: "사고",
    color: "#8b5cf6",
    borderColor: "#8b5cf6",
  },
  {
    key: "action_click",
    emoji: "🖱",
    label: "행동 (선행)",
    color: "#f59e0b",
    borderColor: "#f59e0b",
  },
  {
    key: "action_purchase",
    emoji: "💳",
    label: "행동 (후행)",
    color: "#ef4444",
    borderColor: "#ef4444",
  },
] as const;

export function JourneySummary({ summary, detail, coreInsight }: JourneySummaryProps) {
  if (!summary && !detail) return null;

  // v3: detail이 있으면 summary 추출, 없으면 기존 summary 사용
  const values: Record<string, string> = detail
    ? {
        sensation: detail.sensation.summary,
        thinking: detail.thinking.summary,
        action_click: detail.action_click.summary,
        action_purchase: detail.action_purchase.summary,
      }
    : {
        sensation: summary?.sensation ?? "-",
        thinking: summary?.thinking ?? "-",
        action_click: summary?.action_click ?? "-",
        action_purchase: summary?.action_purchase ?? "-",
      };

  // v3: detail에서 하위 텍스트 추출
  const subTexts: Record<string, string | null> = detail
    ? {
        sensation: detail.sensation.detail,
        thinking: detail.thinking.detail,
        action_click: detail.action_click.metric,
        action_purchase: detail.action_purchase.metric,
      }
    : { sensation: null, thinking: null, action_click: null, action_purchase: null };

  const insight = detail?.core_insight ?? coreInsight;

  return (
    <div className="bg-white rounded-lg p-3 border border-slate-200 mt-3">
      <div className="text-xs font-bold text-gray-800 mb-2">📊 고객 여정 요약</div>

      <div className="grid grid-cols-4 gap-2 mb-2">
        {STAGES.map((stage) => (
          <div
            key={stage.key}
            className="text-center p-2 bg-slate-50 rounded-lg"
            style={{ borderTop: `3px solid ${stage.borderColor}` }}
          >
            <div className="text-xl leading-none mb-1">{stage.emoji}</div>
            <div className="text-[10px] text-gray-500">{stage.label}</div>
            <div
              className="text-[11px] font-bold mt-1 leading-tight"
              style={{ color: stage.color }}
            >
              {values[stage.key] || "-"}
            </div>
            {subTexts[stage.key] && (
              <div className="text-[10px] text-gray-400 mt-1 leading-tight">
                {subTexts[stage.key]}
              </div>
            )}
          </div>
        ))}
      </div>

      {insight && (
        <div className="text-xs text-gray-600 leading-relaxed">
          <strong>핵심:</strong> {insight}
        </div>
      )}
    </div>
  );
}
