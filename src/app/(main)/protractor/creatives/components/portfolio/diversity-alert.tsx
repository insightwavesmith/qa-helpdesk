"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr/config";
import { Skeleton } from "@/components/ui/skeleton";

// ── 타입 ──────────────────────────────────────────────────────────

interface DiversityAlertProps {
  accountId: string;
}

interface SimilarPair {
  creative_id: string;
  similarity: number;
  overlap_axes: string[];
}

interface Cluster {
  id: string;
  label: string;
  count: number;
  avg_roas: number;
  avg_ctr: number;
  tags: string[];
  is_overcrowded: boolean;
  is_top_performer: boolean;
}

interface AccountDiversityResponse {
  diversity_score: number;
  warning_level: "low" | "medium" | "high";
  message: string;
  similar_pairs: SimilarPair[];
  diversification_suggestion: {
    persona: string;
    desire: string;
    awareness: string;
  } | null;
  clusters: Cluster[];
}

// ── 클러스터 카드 색상 ───────────────────────────────────────────

const CLUSTER_COLORS = [
  { color: "#ef4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)" },
  { color: "#3b82f6", bg: "rgba(59,130,246,0.1)", border: "rgba(59,130,246,0.2)" },
  { color: "#10b981", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.2)" },
  { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.2)" },
];

const PDA_COLORS = {
  persona: { border: "#06b6d4", color: "#06b6d4" },
  desire: { border: "#8b5cf6", color: "#8b5cf6" },
  awareness: { border: "#f59e0b", color: "#f59e0b" },
};

// ── 미니 점 생성 ────────────────────────────────────────────────

function ClusterDots({ count, color }: { count: number; color: string }) {
  const visibleDots = Math.min(count, 14);
  const remaining = count - visibleDots;

  return (
    <div className="mt-2 flex flex-wrap gap-[3px] items-center">
      {Array.from({ length: visibleDots }).map((_, i) => (
        <div
          key={i}
          className="rounded-full"
          style={{
            width: i < 10 ? 8 : 6,
            height: i < 10 ? 8 : 6,
            background: color,
            opacity: Math.max(0.2, 0.7 - i * 0.04),
          }}
        />
      ))}
      {remaining > 0 && (
        <span className="text-[10px] text-gray-400 ml-1">+{remaining}개</span>
      )}
    </div>
  );
}

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

  const isHigh = data.warning_level === "high";
  const isMedium = data.warning_level === "medium";
  const showAlert = isHigh || isMedium;

  return (
    <div className="space-y-4">
      {/* 🚨 Andromeda 다양성 경고 */}
      {showAlert && (
        <div
          className="rounded-xl bg-slate-50 p-5"
          style={{
            border: "2px solid rgba(239,68,68,0.3)",
            borderLeftWidth: 4,
            borderLeftColor: "#ef4444",
          }}
        >
          <h3 className="flex items-center gap-2 text-[1.15rem] font-bold mb-3" style={{ color: "#ef4444" }}>
            🚨 Andromeda 다양성 경고
          </h3>

          {/* 다양성 점수 바 */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">다양성 점수</span>
                <span className="font-bold" style={{ color: "#ef4444" }}>
                  {data.diversity_score}점 / 100
                </span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${data.diversity_score}%`,
                    background: "#ef4444",
                  }}
                />
              </div>
            </div>
            <div
              className="text-[11px] font-bold px-3 py-1 rounded-full"
              style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
            >
              위험도 {isHigh ? "높음" : "주의"}
            </div>
          </div>

          {/* 설명 메시지 */}
          <div className="text-sm text-gray-600 leading-relaxed mb-4">
            {data.message}
          </div>

          {/* 유사 소재 쌍 */}
          {data.similar_pairs.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-bold mb-2" style={{ color: "#ef4444" }}>
                유사 소재 ({data.similar_pairs.length}건)
              </div>
              <div className="flex flex-col gap-1">
                {data.similar_pairs.map((pair) => {
                  const simPct = Math.round(pair.similarity * 100);
                  const simColor = simPct >= 80 ? "#ef4444" : "#f59e0b";
                  return (
                    <div
                      key={pair.creative_id}
                      className="flex justify-between items-center bg-white px-3 py-2 rounded-lg border border-slate-200"
                    >
                      <span className="text-[11px] text-gray-600 font-mono truncate max-w-[60%]">
                        {pair.creative_id.slice(0, 16)}…
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold" style={{ color: simColor }}>
                          유사도 {simPct}%
                        </span>
                        {pair.overlap_axes.length > 0 && (
                          <span className="text-[10px] text-gray-400">
                            [{pair.overlap_axes.join(", ")}]
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PDA 다양화 제안 */}
          {data.diversification_suggestion && (
            <div className="bg-white rounded-lg p-4 border border-slate-200">
              <div className="text-sm font-bold text-gray-900 mb-3">
                💡 PDA 다양화 방향 제안
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: "persona" as const, label: "P — 페르소나", value: data.diversification_suggestion.persona },
                  { key: "desire" as const, label: "D — 욕구", value: data.diversification_suggestion.desire },
                  { key: "awareness" as const, label: "A — 인식 수준", value: data.diversification_suggestion.awareness },
                ].map(({ key, label, value }) => (
                  <div
                    key={key}
                    className="bg-slate-50 rounded-lg p-3"
                    style={{ borderTop: `3px solid ${PDA_COLORS[key].border}` }}
                  >
                    <div
                      className="text-[10px] font-bold mb-1"
                      style={{ color: PDA_COLORS[key].color }}
                    >
                      {label}
                    </div>
                    <div className="text-xs text-gray-600 leading-relaxed">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 🔬 소재 클러스터 시각화 */}
      {data.clusters && data.clusters.length > 0 && (
        <div
          className="rounded-xl bg-slate-50 border border-slate-200 p-5"
          style={{ borderLeftWidth: 4, borderLeftColor: "#F75D5D" }}
        >
          <h3 className="flex items-center gap-2 text-[1.15rem] font-bold text-gray-800 mb-1">
            🔬 소재 클러스터 (임베딩 유사도 기반)
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            768차원 임베딩 + 4축 가중 Jaccard (visual 0.3, text 0.3, psychology 0.2, hook 0.2) · 클러스터 임계값 ≥ 0.60
          </p>

          <div className="grid grid-cols-3 gap-3 mb-3">
            {data.clusters.slice(0, 3).map((cluster, idx) => {
              const cc = CLUSTER_COLORS[idx] ?? CLUSTER_COLORS[0];
              return (
                <div
                  key={cluster.id}
                  className="bg-white rounded-lg p-3"
                  style={{
                    border: cluster.is_overcrowded
                      ? `2px solid ${cc.border}`
                      : "1px solid #e2e8f0",
                  }}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold" style={{ color: cc.color }}>
                      클러스터 {String.fromCharCode(65 + idx)}
                    </span>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: cc.bg, color: cc.color }}
                    >
                      {cluster.count}개{cluster.is_overcrowded && " · 과밀"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1 mb-2">
                    {cluster.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded-full border"
                        style={{ borderColor: `${cc.color}30`, color: cc.color, background: `${cc.color}0D` }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="text-[11px] text-gray-500 leading-relaxed">
                    평균 ROAS{" "}
                    <strong style={{ color: cluster.is_top_performer ? "#10b981" : undefined }}>
                      {cluster.avg_roas.toFixed(2)}
                    </strong>
                    {" · CTR "}
                    <strong style={{ color: cluster.is_top_performer ? "#10b981" : undefined }}>
                      {(cluster.avg_ctr * 100).toFixed(1)}%
                    </strong>
                    <br />
                    {cluster.is_overcrowded && (
                      <span style={{ color: "#ef4444" }}>⚠️ 소재 과밀 → 피로도 위험</span>
                    )}
                    {cluster.is_top_performer && (
                      <span style={{ color: "#10b981" }}>✅ 최고 성과 — 확장 필요</span>
                    )}
                  </div>

                  <ClusterDots count={cluster.count} color={cc.color} />
                </div>
              );
            })}
          </div>

          {/* 클러스터 처방 요약 */}
          {data.clusters.length > 0 && (() => {
            const overcrowded = data.clusters.find((c) => c.is_overcrowded);
            const topPerformer = data.clusters.reduce((a, b) =>
              a.avg_roas > b.avg_roas ? a : b
            );
            if (!overcrowded) return null;

            return (
              <div
                className="bg-white rounded-lg p-3 text-sm text-gray-600 leading-relaxed"
                style={{ borderLeft: "3px solid #f59e0b" }}
              >
                <strong>💊 처방:</strong> {overcrowded.label}({overcrowded.tags.join("·")})에{" "}
                <strong style={{ color: "#ef4444" }}>
                  과밀집
                </strong>{" "}
                — 피로도 위험.{" "}
                {topPerformer.label}({topPerformer.tags.join("·")})가 ROAS{" "}
                <strong style={{ color: "#10b981" }}>
                  {topPerformer.avg_roas.toFixed(2)}
                </strong>
                로 최고 성과이나 소재 수 부족.{" "}
                <strong style={{ color: "#F75D5D" }}>
                  {topPerformer.tags[0] ?? "고성과"} 포맷
                </strong>
                의 신규 소재를 3-5개 추가 제작하여 클러스터 분산 권장.
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
