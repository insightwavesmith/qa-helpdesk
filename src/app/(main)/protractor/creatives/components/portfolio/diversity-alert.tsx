"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr/config";

// ── CSS 변수 (목업 동일) ────────────────────────────────────────
const V = {
  bg: "#ffffff", bg2: "#f8fafc", bg3: "#e2e8f0", bd: "#e2e8f0",
  ac: "#F75D5D", t: "#1e293b", t2: "#475569", t3: "#64748b",
  g: "#10b981", a: "#f59e0b", r: "#ef4444", p: "#8b5cf6", cy: "#06b6d4", b: "#3b82f6",
};

// ── 타입 ──────────────────────────────────────────────────────────

interface DiversityAlertProps { accountId: string; }

interface SimilarPair { creative_id: string; similarity: number; overlap_axes: string[]; }
interface Cluster {
  id: string; label: string; count: number; avg_roas: number; avg_ctr: number;
  tags: string[]; is_overcrowded: boolean; is_top_performer: boolean;
}
interface AccountDiversityResponse {
  diversity_score: number; warning_level: "low" | "medium" | "high"; message: string;
  similar_pairs: SimilarPair[];
  diversification_suggestion: { persona: string; desire: string; awareness: string } | null;
  clusters: Cluster[];
}

// ── 클러스터 색상 ────────────────────────────────────────────────
const CC = [
  { color: V.r, bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)" },
  { color: V.b, bg: "rgba(59,130,246,0.1)", border: "rgba(59,130,246,0.2)" },
  { color: V.g, bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.2)" },
];

// ── 컴포넌트 ──────────────────────────────────────────────────────

export function DiversityAlert({ accountId }: DiversityAlertProps) {
  const { data, isLoading } = useSWR<AccountDiversityResponse>(
    accountId ? `/api/protractor/account-diversity?account_id=${accountId}` : null,
    jsonFetcher
  );

  if (isLoading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ height: 192, borderRadius: 12, background: V.bg3, animation: "pulse 2s infinite" }} />
      <div style={{ height: 128, borderRadius: 12, background: V.bg3, animation: "pulse 2s infinite" }} />
    </div>
  );
  if (!data) return null;

  const showAlert = data.warning_level === "high" || data.warning_level === "medium";

  return (
    <div>
      {/* ═══ Andromeda 다양성 경고 ═══ */}
      {showAlert && (
        <div style={{
          background: V.bg2, borderRadius: 12, padding: "1.5rem", marginBottom: "1.2rem",
          border: `2px solid rgba(239,68,68,0.3)`, borderLeft: `4px solid ${V.r}`,
        }}>
          <h2 style={{ color: V.r, fontSize: "1.15rem", fontWeight: 700, marginBottom: ".8rem", display: "flex", alignItems: "center", gap: 8 }}>
            🚨 Andromeda 다양성 경고
          </h2>

          {/* 다양성 점수 바 */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "1rem" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".75rem", marginBottom: 4 }}>
                <span style={{ color: V.t3 }}>다양성 점수</span>
                <span style={{ color: V.r, fontWeight: 700 }}>{data.diversity_score}점 / 100</span>
              </div>
              <div style={{ height: 8, background: V.bg3, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${data.diversity_score}%`, height: "100%", background: V.r, borderRadius: 4 }} />
              </div>
            </div>
            <div style={{ background: "rgba(239,68,68,0.1)", padding: "4px 12px", borderRadius: 20, fontSize: ".72rem", fontWeight: 700, color: V.r }}>
              위험도 {data.warning_level === "high" ? "높음" : "주의"}
            </div>
          </div>

          {/* 설명 */}
          <div style={{ fontSize: ".82rem", color: V.t2, marginBottom: "1rem", lineHeight: 1.8 }}>
            {data.message}
          </div>

          {/* 유사 소재 쌍 */}
          {data.similar_pairs.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: ".78rem", fontWeight: 700, color: V.r, marginBottom: 6 }}>
                유사 소재 ({data.similar_pairs.length}건)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {data.similar_pairs.map((pair) => {
                  const simPct = Math.round(pair.similarity * 100);
                  const simColor = simPct >= 80 ? V.r : V.a;
                  return (
                    <div key={pair.creative_id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      background: V.bg, padding: "8px 12px", borderRadius: 8, border: `1px solid ${V.bd}`,
                    }}>
                      <span style={{ fontSize: ".72rem", color: V.t2, fontFamily: "monospace" }}>
                        {pair.creative_id.slice(0, 20)}…
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: ".72rem", color: simColor, fontWeight: 600 }}>유사도 {simPct}%</span>
                        {pair.overlap_axes.length > 0 && (
                          <span style={{ fontSize: ".6rem", color: V.t3 }}>[{pair.overlap_axes.join(", ")}]</span>
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
            <div style={{ background: V.bg, borderRadius: 10, padding: "1.2rem", border: `1px solid ${V.bd}` }}>
              <div style={{ fontSize: ".82rem", fontWeight: 700, color: V.t, marginBottom: ".8rem" }}>💡 PDA 다양화 방향 제안</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {[
                  { label: "P — 페르소나", value: data.diversification_suggestion.persona, color: V.cy },
                  { label: "D — 욕구", value: data.diversification_suggestion.desire, color: V.p },
                  { label: "A — 인식 수준", value: data.diversification_suggestion.awareness, color: V.a },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: V.bg2, borderRadius: 8, padding: "1rem", borderTop: `3px solid ${color}` }}>
                    <div style={{ fontSize: ".68rem", color, fontWeight: 700, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: ".78rem", color: V.t2, lineHeight: 1.6 }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ 소재 클러스터 시각화 ═══ */}
      {data.clusters && data.clusters.length > 0 && (
        <div style={{ ...sectionBase, borderLeft: `4px solid ${V.ac}` }}>
          <h2 style={{ ...h2Base }}>🔬 소재 클러스터 (임베딩 유사도 기반)</h2>
          <div style={{ fontSize: ".75rem", color: V.t3, marginBottom: "1rem" }}>
            768차원 임베딩 + 4축 가중 Jaccard (visual 0.3, text 0.3, psychology 0.2, hook 0.2) · 클러스터 임계값 ≥ 0.60
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: "1rem" }}>
            {data.clusters.slice(0, 3).map((cluster, idx) => {
              const cc = CC[idx] ?? CC[0];
              return (
                <div key={cluster.id} style={{
                  background: V.bg, borderRadius: 10, padding: "1rem",
                  border: cluster.is_overcrowded ? `2px solid ${cc.border}` : `1px solid ${V.bd}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: ".82rem", fontWeight: 700, color: cc.color }}>
                      클러스터 {String.fromCharCode(65 + idx)}
                    </span>
                    <span style={{
                      fontSize: ".68rem", background: cc.bg, color: cc.color,
                      padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                    }}>
                      {cluster.count}개{cluster.is_overcrowded && " · 과밀"}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                    {cluster.tags.slice(0, 3).map((tag) => (
                      <span key={tag} style={{
                        display: "inline-flex", padding: "3px 10px", borderRadius: 16,
                        fontSize: ".7rem", fontWeight: 600, margin: 2,
                        background: `${cc.color}14`, color: cc.color, border: `1px solid ${cc.color}33`,
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div style={{ fontSize: ".72rem", color: V.t3, lineHeight: 1.6 }}>
                    평균 ROAS{" "}
                    <b style={{ color: cluster.is_top_performer ? V.g : undefined }}>{cluster.avg_roas.toFixed(2)}</b>
                    {" · CTR "}
                    <b style={{ color: cluster.is_top_performer ? V.g : undefined }}>{(cluster.avg_ctr * 100).toFixed(1)}%</b>
                    <br />
                    {cluster.is_overcrowded && <span style={{ color: V.r }}>⚠️ 소재 과밀 → 피로도 위험</span>}
                    {cluster.is_top_performer && <span style={{ color: V.g }}>✅ 최고 성과 — 확장 필요</span>}
                  </div>

                  {/* 미니 점들 */}
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {Array.from({ length: Math.min(cluster.count, 14) }).map((_, i) => (
                      <div key={i} style={{
                        width: i < 10 ? 8 : 6, height: i < 10 ? 8 : 6,
                        borderRadius: "50%", background: cc.color,
                        opacity: Math.max(0.2, 0.7 - i * 0.04),
                      }} />
                    ))}
                    {cluster.count > 14 && (
                      <span style={{ fontSize: ".6rem", color: V.t3, marginLeft: 4 }}>+{cluster.count - 14}개</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 클러스터 처방 요약 */}
          {(() => {
            const overcrowded = data.clusters.find((c) => c.is_overcrowded);
            const topPerformer = data.clusters.reduce((a, b) => a.avg_roas > b.avg_roas ? a : b);
            if (!overcrowded) return null;
            return (
              <div style={{ background: V.bg, borderRadius: 10, padding: "1rem", borderLeft: `3px solid ${V.a}` }}>
                <div style={{ fontSize: ".8rem", color: V.t2, lineHeight: 1.8 }}>
                  <b>💊 처방:</b> {overcrowded.label}({overcrowded.tags.join("·")})에{" "}
                  <b style={{ color: V.r }}>과밀집</b> — 피로도 위험.{" "}
                  {topPerformer.label}({topPerformer.tags.join("·")})가 ROAS{" "}
                  <b style={{ color: V.g }}>{topPerformer.avg_roas.toFixed(2)}</b>로 최고 성과이나 소재 수 부족.{" "}
                  <b style={{ color: V.ac }}>{topPerformer.tags[0] ?? "고성과"} + 데모형 포맷</b>의 신규 소재를 3-5개 추가 제작하여 클러스터 분산 권장.
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ── 공용 스타일 ──────────────────────────────────────────────────
const sectionBase: React.CSSProperties = {
  background: V.bg2, borderRadius: 12, padding: "1.5rem", marginBottom: "1.2rem", border: `1px solid ${V.bd}`,
};
const h2Base: React.CSSProperties = {
  color: V.ac, fontSize: "1.15rem", fontWeight: 700, marginBottom: ".8rem", display: "flex", alignItems: "center", gap: 8,
};
