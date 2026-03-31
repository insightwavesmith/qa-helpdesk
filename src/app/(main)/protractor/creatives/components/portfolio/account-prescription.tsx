"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/swr/config";

const V = {
  bg: "#ffffff", bg2: "#f8fafc", bd: "#e2e8f0",
  t: "#1e293b", t2: "#475569", t3: "#64748b",
  ac: "#F75D5D", r: "#ef4444", a: "#f59e0b", b: "#3b82f6", g: "#10b981", p: "#8b5cf6",
};

interface PrescriptionItem {
  rank: number; title: string; description: string; urgency: string; difficulty: string;
}
interface AccountPrescriptionResponse { prescriptions: PrescriptionItem[]; }
interface AccountPrescriptionProps { accountId: string; }

const RANK_COLORS = [
  { color: V.r, bg: "rgba(239,68,68,0.15)" },
  { color: V.a, bg: "rgba(245,158,11,0.15)" },
  { color: V.b, bg: "rgba(59,130,246,0.15)" },
];

const URGENCY_MAP: Record<string, { bg: string; color: string }> = {
  "긴급": { bg: "rgba(239,68,68,0.12)", color: V.r },
  "🖱 행동": { bg: "rgba(245,158,11,0.12)", color: V.a },
  "PDA": { bg: "rgba(139,92,246,0.12)", color: V.p },
};

const DIFF_MAP: Record<string, { bg: string; color: string }> = {
  "쉬움": { bg: "rgba(16,185,129,0.12)", color: V.g },
  "보통": { bg: "rgba(16,185,129,0.12)", color: V.g },
  "어려움": { bg: "rgba(245,158,11,0.12)", color: V.a },
};

export function AccountPrescription({ accountId }: AccountPrescriptionProps) {
  const { data, isLoading } = useSWR<AccountPrescriptionResponse>(
    accountId ? `/api/protractor/account-prescription?account_id=${accountId}` : null,
    jsonFetcher
  );

  if (isLoading) return <div style={{ height: 192, borderRadius: 12, background: "#e2e8f0", animation: "pulse 2s infinite" }} />;

  const items = data?.prescriptions ?? [];

  return (
    <div style={{
      borderRadius: 12, padding: "1.5rem", marginBottom: "1.2rem",
      border: `2px solid rgba(245,158,11,0.4)`, borderLeft: `4px solid ${V.a}`,
    }}>
      <h2 style={{ color: V.a, fontSize: "1.15rem", fontWeight: 700, marginBottom: ".8rem", display: "flex", alignItems: "center", gap: 8 }}>
        🏆 계정 처방 요약
      </h2>

      {items.length > 0 ? items.slice(0, 3).map((item, idx) => {
        const rc = RANK_COLORS[idx] ?? RANK_COLORS[2];
        const urg = URGENCY_MAP[item.urgency] ?? { bg: "rgba(100,100,100,0.12)", color: V.t3 };
        const dif = DIFF_MAP[item.difficulty] ?? { bg: "rgba(16,185,129,0.12)", color: V.g };

        return (
          <div key={item.rank} style={{
            background: V.bg, borderRadius: 10, padding: "1rem", marginBottom: 8,
            display: "flex", gap: 12, alignItems: "flex-start",
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", background: rc.bg, display: "flex",
              alignItems: "center", justifyContent: "center", fontSize: "1rem", fontWeight: 800,
              color: rc.color, flexShrink: 0,
            }}>
              {item.rank}
            </div>
            <div>
              <div style={{ fontSize: ".88rem", fontWeight: 700, color: V.t }}>{item.title}</div>
              <div style={{ fontSize: ".75rem", color: V.t2, marginTop: ".2rem" }}>{item.description}</div>
              <div style={{ display: "flex", gap: 6, marginTop: ".4rem" }}>
                <span style={{ fontSize: ".6rem", background: urg.bg, color: urg.color, padding: "2px 6px", borderRadius: 8 }}>
                  {item.urgency}
                </span>
                <span style={{ fontSize: ".6rem", background: dif.bg, color: dif.color, padding: "2px 6px", borderRadius: 8 }}>
                  난이도: {item.difficulty}
                </span>
              </div>
            </div>
          </div>
        );
      }) : (
        <div style={{ fontSize: ".82rem", color: V.t3, textAlign: "center", padding: "1rem" }}>데이터 없음</div>
      )}
    </div>
  );
}
