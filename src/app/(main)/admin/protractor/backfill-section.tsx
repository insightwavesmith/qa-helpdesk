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

export function BackfillSection({ accounts }: BackfillSectionProps) {
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [status, setStatus] = useState<BackfillStatus>("idle");
  const [progress, setProgress] = useState({ current: 0, total: 0, date: "" });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleBackfill() {
    if (!selectedAccountId) return;

    setStatus("running");
    setProgress({ current: 0, total: 0, date: "" });
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
              setProgress(prev => ({ ...prev, total: data.total as number }));
            } else if (data.type === "progress") {
              setProgress({
                current: data.current as number,
                total: data.total as number,
                date: data.date as string,
              });
            } else if (data.type === "complete") {
              setStatus("done");
              toast.success(`${data.totalDays as number}일 데이터 수집 완료 (${data.totalInserted as number}건)`);
            } else if (data.type === "error") {
              setStatus("error");
              setErrorMsg(data.message as string);
              toast.error(`수집 실패: ${data.message as string}`);
            } else if (data.type === "dayError") {
              // 개별 날짜 에러는 계속 진행
              console.warn(`[backfill] ${data.date as string} 실패:`, data.message);
            }
          } catch {
            // JSON 파싱 실패 — 무시
          }
        }
      }

      // 스트림 종료 후에도 status가 running이면 완료 처리
      setStatus(prev => prev === "running" ? "done" : prev);
    } catch (e) {
      setStatus("error");
      const msg = (e as Error).message || "수집 중 오류 발생";
      setErrorMsg(msg);
      toast.error(msg);
    }
  }

  const PERIOD_OPTIONS = [7, 30, 90] as const;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="text-base font-bold text-gray-900 mb-1">과거 데이터 수동 수집</h3>
      <p className="text-sm text-gray-500 mb-4">
        특정 계정의 과거 광고 데이터를 수동으로 수집합니다.
      </p>

      <div className="flex gap-3 items-end flex-wrap">
        {/* 계정 선택 */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">계정</label>
          <select
            value={selectedAccountId}
            onChange={e => setSelectedAccountId(e.target.value)}
            disabled={status === "running"}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[200px] bg-white disabled:opacity-50"
          >
            <option value="">계정 선택</option>
            {accounts.map(a => (
              <option key={a.account_id} value={a.account_id}>
                {a.account_name} ({a.account_id})
              </option>
            ))}
          </select>
        </div>

        {/* 기간 선택 */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">기간</label>
          <div className="flex gap-2">
            {PERIOD_OPTIONS.map(d => (
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

      {/* 진행 상태 */}
      {status === "running" && progress.total > 0 && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#F75D5D] border-t-transparent" />
            수집 중... {progress.current}/{progress.total}일 ({progress.date})
          </div>
          <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#F75D5D] transition-all"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 완료 상태 */}
      {status === "done" && (
        <div className="mt-4 p-3 bg-green-50 rounded-lg text-sm text-green-700">
          수집이 완료되었습니다.
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
