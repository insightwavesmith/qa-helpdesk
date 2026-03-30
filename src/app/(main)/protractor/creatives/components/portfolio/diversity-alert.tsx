"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr/config";
import { Skeleton } from "@/components/ui/skeleton";
import { AndromedaAlert } from "@/components/protractor/AndromedaAlert";
import type { PrescriptionResponse } from "@/types/prescription";

// ── 타입 ──────────────────────────────────────────────────────────

interface DiversityAlertProps {
  accountId: string;
}

interface AccountDiversityResponse {
  diversity_score: number;
  warning_level: "low" | "medium" | "high";
  message: string;
  similar_pairs: Array<{
    creative_id: string;
    similarity: number;
    overlap_axes: string[];
  }>;
  diversification_suggestion: {
    persona: string;
    desire: string;
    awareness: string;
  } | null;
  clusters: Array<{
    id: string;
    label: string;
    count: number;
    avg_roas: number;
    avg_ctr: number;
    tags: string[];
    is_overcrowded: boolean;
    is_top_performer: boolean;
  }>;
}

// ── 클러스터 카드 색상 ───────────────────────────────────────────

const CLUSTER_COLORS = [
  { color: "#ef4444", bg: "rgba(239,68,68,0.3)", border: "rgba(239,68,68,0.3)" },
  { color: "#3b82f6", bg: "rgba(59,130,246,0.1)", border: "rgba(59,130,246,0.2)" },
  { color: "#10b981", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.2)" },
  { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.2)" },
];

// ── 컴포넌트 ──────────────────────────────────────────────────────

export function DiversityAlert({ accountId }: DiversityAlertProps) {
  const { data, isLoading } = useSWR<AccountDiversityResponse>(
    accountId ? `/api/protractor/account-diversity?account_id=${accountId}` : null,
    jsonFetcher
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  // AndromedaAlert 활용 (기존 컴포넌트 재사용)
  const andromedaWarning: NonNullable<PrescriptionResponse["andromeda_warning"]> = {
    level: data.warning_level,
    message: data.message,
    similar_pairs: data.similar_pairs,
    diversification_suggestion: data.diversification_suggestion ?? {
      persona: "-",
      desire: "-",
      awareness: "-",
    },
    diversity_score: data.diversity_score,
  };

  return (
    <div className="space-y-4">
      {/* 기존 AndromedaAlert 재사용 */}
      <AndromedaAlert warning={andromedaWarning} />

      {/* 클러스터 시각화 */}
      {data.clusters && data.clusters.length > 0 && (
        <div
          className="rounded-xl bg-slate-50 border border-slate-200 p-4"
          style={{ borderLeftWidth: 4, borderLeftColor: "#F75D5D" }}
        >
          <h3 className="flex items-center gap-2 text-sm font-bold text-gray-800 mb-1">
            🔬 소재 클러스터 (임베딩 유사도 기반)
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            임베딩 + 4축 가중 유사도 · 클러스터 임계값 ≥ 0.60
          </p>

          <div className="grid grid-cols-3 gap-3 mb-3">
            {data.clusters.slice(0, 3).map((cluster, idx) => {
              const clusterColor = CLUSTER_COLORS[idx] ?? CLUSTER_COLORS[0];
              return (
                <div
                  key={cluster.id}
                  className="bg-white rounded-lg p-3"
                  style={{
                    border: cluster.is_overcrowded
                      ? `2px solid ${clusterColor.border}`
                      : `1px solid #e2e8f0`,
                  }}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span
                      className="text-xs font-bold"
                      style={{ color: clusterColor.color }}
                    >
                      클러스터 {String.fromCharCode(65 + idx)}
                    </span>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        background: clusterColor.bg,
                        color: clusterColor.color,
                      }}
                    >
                      {cluster.count}개
                      {cluster.is_overcrowded && " · 과밀"}
                    </span>
                  </div>

                  {/* 태그 */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {cluster.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-gray-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* 성과 */}
                  <div className="text-[11px] text-gray-500 leading-relaxed">
                    평균 ROAS{" "}
                    <strong
                      style={{
                        color: cluster.is_top_performer ? "#10b981" : undefined,
                      }}
                    >
                      {cluster.avg_roas.toFixed(2)}
                    </strong>
                    {" · CTR "}
                    <strong
                      style={{
                        color: cluster.is_top_performer ? "#10b981" : undefined,
                      }}
                    >
                      {(cluster.avg_ctr * 100).toFixed(1)}%
                    </strong>
                    <br />
                    {cluster.is_overcrowded && (
                      <span style={{ color: "#ef4444" }}>
                        ⚠️ 과밀 → 피로도 위험
                      </span>
                    )}
                    {cluster.is_top_performer && (
                      <span style={{ color: "#10b981" }}>
                        ✅ 최고 성과 — 확장 필요
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
