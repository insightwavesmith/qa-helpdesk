"use client";

import { useState } from "react";
import type { PrescriptionResponse } from "@/types/prescription";

interface AndromedaAlertProps {
  warning: NonNullable<PrescriptionResponse["andromeda_warning"]>;
}

export function AndromedaAlert({ warning }: AndromedaAlertProps) {
  const [expanded, setExpanded] = useState(false);
  if (warning.level === "low") return null;

  const isHigh = warning.level === "high";
  const styles = isHigh
    ? { border: "border-red-200", bg: "bg-red-50", headerBg: "bg-red-100", text: "text-red-800", badge: "bg-red-200 text-red-800", bar: "bg-red-400", icon: "🚨", label: "높음" }
    : { border: "border-yellow-200", bg: "bg-yellow-50", headerBg: "bg-yellow-100", text: "text-yellow-800", badge: "bg-yellow-200 text-yellow-800", bar: "bg-yellow-400", icon: "⚠️", label: "주의" };

  return (
    <div className={`overflow-hidden rounded-xl border ${styles.border} shadow-sm`}>
      <div className={`flex items-center justify-between px-4 py-3 ${styles.headerBg}`}>
        <div className="flex items-center gap-2">
          <span className="text-base">{styles.icon}</span>
          <div>
            <span className={`text-sm font-semibold ${styles.text}`}>Andromeda 다양성 경고</span>
            <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${styles.badge}`}>
              위험도 {styles.label}
            </span>
          </div>
        </div>
        <button onClick={() => setExpanded(!expanded)} className={`text-xs font-medium ${styles.text} hover:underline`}>
          {expanded ? "접기" : "자세히"}
        </button>
      </div>
      <div className={`px-4 py-3 ${styles.bg}`}>
        <p className={`text-sm ${styles.text} mb-3`}>{warning.message}</p>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-gray-600">다양성 점수</span>
          <span className={`text-xs font-bold ${styles.text}`}>{warning.diversity_score}점</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-200">
          <div className={`h-2 rounded-full transition-all ${styles.bar}`} style={{ width: `${Math.max(0, Math.min(100, warning.diversity_score))}%` }} />
        </div>
      </div>
      {expanded && (
        <div className={`border-t ${styles.border} ${styles.bg} px-4 pb-4 pt-3 space-y-4`}>
          {warning.similar_pairs.length > 0 && (
            <div>
              <p className={`text-xs font-semibold ${styles.text} mb-2`}>유사 소재 ({warning.similar_pairs.length}건)</p>
              <div className="space-y-1.5">
                {warning.similar_pairs.map((pair) => (
                  <div key={pair.creative_id} className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-1.5">
                    <span className="text-xs text-gray-600 font-mono overflow-hidden whitespace-nowrap text-ellipsis max-w-[60%]">{pair.creative_id}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-500">유사도 {Math.round(pair.similarity * 100)}%</span>
                      {pair.overlap_axes.length > 0 && (
                        <span className="text-[10px] text-gray-400">[{pair.overlap_axes.join(", ")}]</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {warning.diversification_suggestion && (
            <div>
              <p className={`text-xs font-semibold ${styles.text} mb-2`}>다양화 방향 제안 (PDA 프레임)</p>
              <div className="space-y-2">
                {[
                  { key: "persona", label: "페르소나 (P)", value: warning.diversification_suggestion.persona },
                  { key: "desire", label: "욕구 (D)", value: warning.diversification_suggestion.desire },
                  { key: "awareness", label: "인식 수준 (A)", value: warning.diversification_suggestion.awareness },
                ].map(({ key, label, value }) => (
                  <div key={key} className="rounded-lg bg-white/60 px-3 py-2">
                    <p className="text-[10px] font-semibold text-gray-500 mb-0.5">{label}</p>
                    <p className="text-xs text-gray-700">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
