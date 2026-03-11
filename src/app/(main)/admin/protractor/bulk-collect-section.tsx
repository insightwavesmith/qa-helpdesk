"use client";

import { useState } from "react";
import { CheckCircle, XCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Account {
  account_id: string;
  account_name: string;
}

interface AccountResult {
  status: "pending" | "running" | "success" | "error";
  adsCount?: number;
  error?: string;
}

interface Props {
  accounts: Account[];
}

export function BulkCollectSection({ accounts }: Props) {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [results, setResults] = useState<Map<string, AccountResult>>(new Map());
  const [date, setDate] = useState(() => {
    const now = new Date(Date.now() + 9 * 3600_000);
    now.setDate(now.getDate() - 1);
    return now.toISOString().slice(0, 10);
  });

  const handleCollect = async () => {
    const accountIds = "all" as const;

    setStatus("running");
    setResults(new Map());

    // 수집 대상 계정 pending으로 초기화
    const targetAccounts = accounts;
    const initialResults = new Map<string, AccountResult>();
    targetAccounts.forEach((a) => initialResults.set(a.account_id, { status: "pending" }));
    setResults(initialResults);

    try {
      const res = await fetch("/api/admin/protractor/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds, date }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error((err as { error?: string }).error || "수집 실패");
      }

      if (!res.body) throw new Error("스트리밍 응답 없음");

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

            if (data.type === "account_start") {
              setResults((prev) => {
                const next = new Map(prev);
                next.set(data.accountId as string, { status: "running" });
                return next;
              });
            } else if (data.type === "account_complete") {
              setResults((prev) => {
                const next = new Map(prev);
                next.set(data.accountId as string, {
                  status: "success",
                  adsCount: data.adsCount as number,
                });
                return next;
              });
            } else if (data.type === "account_error") {
              setResults((prev) => {
                const next = new Map(prev);
                next.set(data.accountId as string, {
                  status: "error",
                  error: data.error as string,
                });
                return next;
              });
            } else if (data.type === "complete") {
              const summary = data.summary as { success: number; failed: number; totalAds: number };
              setStatus("done");
              toast.success(`수집 완료: ${summary.success}개 성공, ${summary.totalAds}건 광고`);
            }
          } catch {
            // JSON 파싱 에러 무시
          }
        }
      }

      setStatus((prev) => (prev === "running" ? "done" : prev));
    } catch (e) {
      setStatus("error");
      toast.error((e as Error).message || "수집 중 오류 발생");
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="text-base font-bold text-gray-900 mb-1">일괄 데이터 수집</h3>
      <p className="text-sm text-gray-500 mb-4">
        전체 또는 선택한 계정의 어제 광고 데이터를 수집합니다. (캠페인 유형 무관, 전체 수집)
      </p>

      {/* 날짜 + 수집 버튼 */}
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">수집 날짜</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={status === "running"}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-50"
          />
        </div>
        <button
          type="button"
          onClick={handleCollect}
          disabled={status === "running" || accounts.length === 0}
          className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-[#F75D5D] text-white hover:bg-[#E54949] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === "running" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          전체계정 수집
        </button>
      </div>

      {/* 수집 결과 */}
      {results.size > 0 && (
        <div className="mt-4 space-y-1">
          {accounts.map((account) => {
            const result = results.get(account.account_id);
            if (!result) return null;
            return (
              <div key={account.account_id} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-gray-50">
                <span className="flex-1 truncate text-gray-700">{account.account_name}</span>
                {result.status === "pending" && <span className="text-xs text-gray-400">대기</span>}
                {result.status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500 shrink-0" />}
                {result.status === "success" && (
                  <span className="flex items-center gap-1 text-xs text-green-600 shrink-0">
                    <CheckCircle className="h-3.5 w-3.5" />{result.adsCount}건
                  </span>
                )}
                {result.status === "error" && (
                  <span className="flex items-center gap-1 text-xs text-red-500 shrink-0" title={result.error}>
                    <XCircle className="h-3.5 w-3.5" />실패
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
