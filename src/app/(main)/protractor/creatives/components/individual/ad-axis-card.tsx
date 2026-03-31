"use client";

import type { AnalysisJsonV3 } from "@/types/prescription";

// ── 광고축 카테고리 ─────────────────────────────────────────────────
// 목업: 태그 칩 5개 + 4컬럼 그리드(포맷/구조/설득/오퍼) + Andromeda/PDA 코드

interface AdAxisCardProps {
  analysisJson: AnalysisJsonV3;
}

// 태그 칩 스타일 매핑
const TAG_STYLES: Array<{
  key: string;
  prefix: string;
  bg: string;
  color: string;
  border: string;
  getValue: (ax: NonNullable<AnalysisJsonV3["ad_axis"]>) => string;
}> = [
  {
    key: "format",
    prefix: "🎬",
    bg: "rgba(239,68,68,0.12)",
    color: "#ef4444",
    border: "rgba(239,68,68,0.3)",
    getValue: (ax) => ax.format,
  },
  {
    key: "hook_type",
    prefix: "🪝 훅:",
    bg: "rgba(99,102,241,0.12)",
    color: "#E54949",
    border: "rgba(99,102,241,0.3)",
    getValue: (ax) => ax.hook_type,
  },
  {
    key: "messaging",
    prefix: "💬 메시징:",
    bg: "rgba(139,92,246,0.12)",
    color: "#8b5cf6",
    border: "rgba(139,92,246,0.3)",
    getValue: (ax) => ax.messaging_strategy,
  },
  {
    key: "persona",
    prefix: "👤 타겟:",
    bg: "rgba(6,182,212,0.12)",
    color: "#06b6d4",
    border: "rgba(6,182,212,0.3)",
    getValue: (ax) => ax.target_persona,
  },
  {
    key: "category",
    prefix: "🏷️",
    bg: "rgba(245,158,11,0.12)",
    color: "#f59e0b",
    border: "rgba(245,158,11,0.3)",
    getValue: (ax) => ax.category.join(" · "),
  },
];

export function AdAxisCard({ analysisJson }: AdAxisCardProps) {
  const adAxis = analysisJson.ad_axis;
  if (!adAxis) return null;

  return (
    <div
      className="rounded-xl bg-slate-50 border border-slate-200 p-4"
      style={{ borderLeftWidth: 4, borderLeftColor: "#E54949" }}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-base font-extrabold"
          style={{ background: "rgba(99,102,241,0.15)", color: "#E54949" }}
        >
          📋
        </div>
        <div>
          <div className="text-sm font-bold" style={{ color: "#E54949" }}>
            광고축 — 네가 만든 콘텐츠는 이런 거야
          </div>
          <div className="text-xs text-gray-500">
            5축 분석 기반 카테고리 분류
          </div>
        </div>
      </div>

      {/* 태그 칩들 */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {TAG_STYLES.map((tag) => (
          <span
            key={tag.key}
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
            style={{
              background: tag.bg,
              color: tag.color,
              border: `1px solid ${tag.border}`,
            }}
          >
            {tag.prefix} {tag.getValue(adAxis)}
          </span>
        ))}
      </div>

      {/* 4컬럼 그리드 */}
      <div className="grid grid-cols-4 gap-2 mb-2">
        <div className="bg-white rounded-lg p-2.5 text-center">
          <div className="text-[11px] text-gray-500">포맷</div>
          <div className="text-xs font-bold text-gray-800 mt-0.5">{adAxis.format}</div>
        </div>
        <div className="bg-white rounded-lg p-2.5 text-center">
          <div className="text-[11px] text-gray-500">구조</div>
          <div className="text-xs font-bold text-gray-800 mt-0.5">{adAxis.structure}</div>
        </div>
        <div className="bg-white rounded-lg p-2.5 text-center">
          <div className="text-[11px] text-gray-500">설득 전략</div>
          <div className="text-xs font-bold text-gray-800 mt-0.5">{adAxis.persuasion}</div>
        </div>
        <div className="bg-white rounded-lg p-2.5 text-center">
          <div className="text-[11px] text-gray-500">오퍼</div>
          <div className="text-xs font-bold text-gray-800 mt-0.5">{adAxis.offer}</div>
        </div>
      </div>

      {/* Andromeda + PDA 코드 */}
      <div className="text-xs text-gray-500 mt-2">
        Andromeda:{" "}
        <span style={{ color: "#E54949" }}>{adAxis.andromeda_code}</span>
        {" · "}
        P.D.A:{" "}
        <span style={{ color: "#f59e0b" }}>{adAxis.pda_code}</span>
      </div>
    </div>
  );
}
