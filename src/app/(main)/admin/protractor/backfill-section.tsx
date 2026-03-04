"use client";

import { useState } from "react";
import { toast } from "sonner";

interface BackfillAccount {
  account_id: string;
  account_name: string;
}

interface BackfillSectionProps {
  accounts: BackfillAccount[];
}

type BackfillStatus = "idle" | "running" | "done" | "error";

type PhaseName = "ad" | "mixpanel" | "overlap";

interface PhaseProgress {
  phase: PhaseName;
  label: string;
  status: "pending" | "running" | "done" | "skipped" | "error";
  current: number;
  total: number;
  date: string;
  detail?: string;
  message?: string;
}

export function BackfillSection({ accounts }: BackfillSectionProps) {
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [days, setDays] = useState<1 | 7 | 30 | 90>(30);
  const [status, setStatus] = useState<BackfillStatus>("idle");
  const [phases, setPhases] = useState<PhaseProgress[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleBackfill() {
    if (!selectedAccountId) return;

    setStatus("running");
    setPhases([]);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: selectedAccountId, days }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error((err as { error?: string }).error || "수집 실패");
      }

      if (!res.body) {
        throw new Error("스트리밍 응답을 받을 수 없습니다");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === "start") {
              // phase 목록으로 초기 상태 설정
              const initial: PhaseProgress[] = (
                data.phases as { phase: PhaseName; label: string }[]
              ).map((p) => ({
                phase: p.phase,
                label: p.label,
                status: "pending",
                current: 0,
                total: 0,
                date: "",
              }));
              setPhases(initial);
            } else if (data.type === "phase_start") {
              setPhases((prev) =>
                prev.map((p) =>
                  p.phase === data.phase
                    ? { ...p, status: "running", total: data.total as number }
                    : p
                )
              );
            } else if (data.type === "phase_progress") {
              setPhases((prev) =>
                prev.map((p) =>
                  p.phase === data.phase
                    ? {
                        ...p,
                        status: "running",
                        current: data.current as number,
                        total: data.total as number,
                        date: data.date as string,
                        detail: (data.detail as string) ?? p.detail,
                      }
                    : p
                )
              );
            } else if (data.type === "phase_complete") {
              setPhases((prev) =>
                prev.map((p) =>
                  p.phase === data.phase
                    ? {
                        ...p,
                        status: "done",
                        detail: `${data.totalInserted as number}건`,
                      }
                    : p
                )
              );
            } else if (data.type === "phase_skip") {
              setPhases((prev) =>
                prev.map((p) =>
                  p.phase === data.phase
                    ? {
                        ...p,
                        status: "skipped",
                        message: data.reason as string,
                      }
                    : p
                )
              );
            } else if (data.type === "phase_error") {
              setPhases((prev) =>
                prev.map((p) =>
                  p.phase === data.phase
                    ? {
                        ...p,
                        status: "error",
                        message: data.message as string,
                      }
                    : p
                )
              );
            } else if (data.type === "day_error") {
              // 개별 날짜 에러는 콘솔만
              console.warn(
                `[backfill] ${data.phase as string} ${data.date as string} 실패:`,
                data.message
              );
            } else if (data.type === "complete") {
              setStatus("done");
              const summary = data.summary as {
                status: string;
                label: string;
              }[];
              const successCount = summary.filter(
                (s) => s.status === "success"
              ).length;
              toast.success(
                `${successCount}/${summary.length}종 수집 완료`
              );
            } else if (data.type === "error") {
              setStatus("error");
              setErrorMsg(data.message as string);
              toast.error(`수집 실패: ${data.message as string}`);
            }
          } catch {
            // JSON 파싱 실패 — 무시
          }
        }
      }

      // 스트림 종료 후에도 status가 running이면 완료 처리
      setStatus((prev) => (prev === "running" ? "done" : prev));
    } catch (e) {
      setStatus("error");
      const msg = (e as Error).message || "수집 중 오류 발생";
      setErrorMsg(msg);
      toast.error(msg);
    }
  }

  const PERIOD_OPTIONS = [1, 7, 30, 90] as const;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="text-base font-bold text-gray-900 mb-1">
        과거 데이터 수동 수집
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        특정 계정의 과거 데이터를 수동으로 수집합니다. (광고데이터 + 매출데이터 +
        타겟중복을 한번에 수집)
      </p>

      <div className="flex gap-3 items-end flex-wrap">
        {/* 계정 선택 */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">
            계정
          </label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            disabled={status === "running"}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[200px] bg-white disabled:opacity-50"
          >
            <option value="">계정 선택</option>
            {accounts.map((a) => (
              <option key={a.account_id} value={a.account_id}>
                {a.account_name} ({a.account_id})
              </option>
            ))}
          </select>
        </div>

        {/* 기간 선택 */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">
            기간
          </label>
          <div className="flex gap-2">
            {PERIOD_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                disabled={status === "running"}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  days === d
                    ? "bg-[#F75D5D] text-white border-[#F75D5D]"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {d}일
              </button>
            ))}
          </div>
        </div>

        {/* 수집 버튼 */}
        <button
          onClick={handleBackfill}
          disabled={!selectedAccountId || status === "running"}
          className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#F75D5D] text-white hover:bg-[#E54949] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === "running" ? "수집 중..." : "수동 수집"}
        </button>
      </div>

      {/* 3종 진행 상태 */}
      {phases.length > 0 && (
        <div className="mt-4 space-y-3 p-4 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-semibold text-gray-700">수집 진행 상태</h4>
          {phases.map((p) => (
            <PhaseRow key={p.phase} phase={p} />
          ))}
        </div>
      )}

      {/* 완료 상태 */}
      {status === "done" && phases.length > 0 && (
        <div className="mt-4 p-3 bg-green-50 rounded-lg text-sm text-green-700">
          수집이 완료되었습니다. (
          {phases.filter((p) => p.status === "done").length}/{phases.length}종
          성공)
        </div>
      )}

      {/* 에러 상태 */}
      {status === "error" && errorMsg && (
        <div className="mt-4 p-3 bg-red-50 rounded-lg text-sm text-red-700">
          오류: {errorMsg}
        </div>
      )}
    </div>
  );
}

// ── Phase Row 컴포넌트 ──────────────────────────────────────

function PhaseRow({ phase }: { phase: PhaseProgress }) {
  const percentage =
    phase.total > 0 ? Math.round((phase.current / phase.total) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-sm">
        <PhaseIcon status={phase.status} />
        <span className={`font-medium ${getTextColor(phase.status)}`}>
          {phase.label}
        </span>
        <span className="text-gray-500 text-xs ml-auto">
          {phase.status === "pending" && "대기 중"}
          {phase.status === "running" &&
            `${phase.current}/${phase.total}${phase.date ? ` (${phase.date})` : ""}`}
          {phase.status === "done" &&
            `${phase.current}/${phase.total} 완료${phase.detail ? ` (${phase.detail})` : ""}`}
          {phase.status === "skipped" &&
            `건너뜀${phase.message ? ` (${phase.message})` : ""}`}
          {phase.status === "error" &&
            `오류${phase.message ? ` (${phase.message})` : ""}`}
        </span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${getBarColor(phase.status)}`}
          style={{
            width: `${phase.status === "done" ? 100 : phase.status === "skipped" ? 100 : percentage}%`,
          }}
        />
      </div>
    </div>
  );
}

// ── 아이콘 ──────────────────────────────────────────────────

function PhaseIcon({ status }: { status: PhaseProgress["status"] }) {
  switch (status) {
    case "pending":
      return (
        <span className="flex h-4 w-4 items-center justify-center text-gray-400">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <rect x="6" y="5" width="1.5" height="6" rx="0.5" />
            <rect x="8.5" y="5" width="1.5" height="6" rx="0.5" />
          </svg>
        </span>
      );
    case "running":
      return (
        <span className="flex h-4 w-4 items-center justify-center">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#F75D5D] border-t-transparent" />
        </span>
      );
    case "done":
      return (
        <span className="flex h-4 w-4 items-center justify-center text-green-600">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm3.78 4.97a.75.75 0 0 0-1.06 0L7 8.69 5.28 6.97a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25a.75.75 0 0 0 0-1.06Z" />
          </svg>
        </span>
      );
    case "skipped":
      return (
        <span className="flex h-4 w-4 items-center justify-center text-amber-500">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M4.5 3a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-1 0v-9a.5.5 0 0 1 .5-.5Zm3.146.146a.5.5 0 0 1 .708 0l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L11.293 8 7.646 4.354a.5.5 0 0 1 0-.708Z" />
          </svg>
        </span>
      );
    case "error":
      return (
        <span className="flex h-4 w-4 items-center justify-center text-red-600">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm2.78 4.22a.75.75 0 0 0-1.06 0L8 5.94 6.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 7 5.22 8.72a.75.75 0 0 0 1.06 1.06L8 8.06l1.72 1.72a.75.75 0 0 0 1.06-1.06L9.06 7l1.72-1.72a.75.75 0 0 0 0-1.06Z" />
          </svg>
        </span>
      );
  }
}

function getTextColor(status: PhaseProgress["status"]): string {
  switch (status) {
    case "pending":
      return "text-gray-400";
    case "running":
      return "text-gray-700";
    case "done":
      return "text-green-700";
    case "skipped":
      return "text-amber-600";
    case "error":
      return "text-red-600";
  }
}

function getBarColor(status: PhaseProgress["status"]): string {
  switch (status) {
    case "pending":
      return "bg-gray-200";
    case "running":
      return "bg-[#F75D5D]";
    case "done":
      return "bg-green-500";
    case "skipped":
      return "bg-amber-300";
    case "error":
      return "bg-red-500";
  }
}
