"use client";

import { Skeleton } from "@/components/ui/skeleton";

// ── 타입 ──────────────────────────────────────────────────────────

interface Prescription {
  rank: number;
  title: string;
  action: string;
  journey_stage: string;
  expected_impact: string;
  evidence_axis1: string;
  evidence_axis2: string;
  evidence_axis3: string;
  difficulty: "쉬움" | "보통" | "어려움";
  difficulty_reason: string;
  performance_driven: boolean;
}

interface PrescriptionCardsProps {
  prescriptions: Prescription[] | undefined | null;
  isLoading: boolean;
}

// ── 스타일 상수 ───────────────────────────────────────────────────

const RANK_STYLES = [
  { bg: "rgba(239,68,68,0.15)", color: "#ef4444" },
  { bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
  { bg: "rgba(59,130,246,0.15)", color: "#3b82f6" },
];

const DIFFICULTY_BADGE: Record<string, { bg: string; color: string }> = {
  "쉬움": { bg: "rgba(16,185,129,0.12)", color: "#10b981" },
  "보통": { bg: "rgba(245,158,11,0.12)", color: "#f59e0b" },
  "어려움": { bg: "rgba(239,68,68,0.12)", color: "#ef4444" },
};

const STAGE_BADGE: Record<string, { bg: string; color: string; icon: string }> = {
  "감각": { bg: "rgba(6,182,212,0.12)", color: "#06b6d4", icon: "👁" },
  "사고": { bg: "rgba(139,92,246,0.12)", color: "#8b5cf6", icon: "🧠" },
  "행동(클릭)": { bg: "rgba(245,158,11,0.12)", color: "#f59e0b", icon: "🖱" },
  "행동(구매)": { bg: "rgba(239,68,68,0.12)", color: "#ef4444", icon: "💳" },
};

// ── 컴포넌트 ──────────────────────────────────────────────────────

export function PrescriptionCards({ prescriptions, isLoading }: PrescriptionCardsProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">🏆</span>
          <div className="text-sm font-bold text-gray-800">개선 우선순위 Top 3</div>
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!prescriptions || prescriptions.length === 0) {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">🏆</span>
          <div className="text-sm font-bold text-gray-800">개선 우선순위 Top 3</div>
        </div>
        <div className="text-sm text-gray-500 text-center py-4">처방 데이터 없음</div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl bg-slate-50 border-2 p-4"
      style={{ borderColor: "rgba(245,158,11,0.4)", borderLeftWidth: 4, borderLeftColor: "#f59e0b" }}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">🏆</span>
        <div className="text-sm font-bold" style={{ color: "#f59e0b" }}>
          개선 우선순위 Top 3
        </div>
      </div>

      {/* 처방 카드 */}
      <div className="space-y-2">
        {prescriptions.slice(0, 3).map((rx, idx) => {
          const rankStyle = RANK_STYLES[idx] ?? RANK_STYLES[2];
          const diffBadge = DIFFICULTY_BADGE[rx.difficulty] ?? DIFFICULTY_BADGE["보통"];
          const stageBadge = STAGE_BADGE[rx.journey_stage];

          return (
            <div
              key={rx.rank}
              className="bg-white rounded-lg p-3 flex gap-3 items-start"
            >
              {/* 순위 원형 */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-extrabold shrink-0"
                style={{ background: rankStyle.bg, color: rankStyle.color }}
              >
                {rx.rank}
              </div>

              {/* 콘텐츠 */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-gray-900 mb-1">
                  {rx.title}
                </div>
                <div className="text-xs text-gray-600 leading-relaxed mb-2">
                  {rx.action}
                </div>

                {/* 뱃지들 */}
                <div className="flex flex-wrap gap-1.5">
                  {stageBadge && (
                    <span
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
                      style={{ background: stageBadge.bg, color: stageBadge.color }}
                    >
                      {stageBadge.icon} {rx.journey_stage}
                    </span>
                  )}
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
                    style={{ background: diffBadge.bg, color: diffBadge.color }}
                  >
                    난이도: {rx.difficulty}
                  </span>
                  {rx.performance_driven && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-600">
                      📊 성과 기반
                    </span>
                  )}
                </div>

                {/* 근거 (접기 가능) */}
                <details className="mt-2">
                  <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">
                    근거 보기
                  </summary>
                  <div className="mt-1 text-[11px] text-gray-500 leading-relaxed space-y-0.5">
                    {rx.evidence_axis1 && <div>축1: {rx.evidence_axis1}</div>}
                    {rx.evidence_axis2 && <div>축2: {rx.evidence_axis2}</div>}
                    {rx.evidence_axis3 && <div>축3: {rx.evidence_axis3}</div>}
                    {rx.difficulty_reason && (
                      <div className="text-gray-400 mt-0.5">
                        난이도 사유: {rx.difficulty_reason}
                      </div>
                    )}
                  </div>
                </details>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
