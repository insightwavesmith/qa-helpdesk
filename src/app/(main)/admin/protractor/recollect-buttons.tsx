"use client";

import { useState } from "react";

interface ButtonConfig {
  label: string;
  endpoint: string;
}

const BUTTONS: ButtonConfig[] = [
  { label: "벤치마크 재수집", endpoint: "/api/protractor/benchmarks/collect" },
  { label: "광고데이터 재수집", endpoint: "/api/protractor/collect-daily" },
  { label: "매출데이터 재수집", endpoint: "/api/protractor/collect-mixpanel" },
  { label: "타겟중복 재수집", endpoint: "/api/protractor/collect-daily" },
];

export function RecollectButtons() {
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null);

  async function handleClick(idx: number, endpoint: string) {
    if (loadingIdx !== null) return;
    setLoadingIdx(idx);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        alert(`실패: ${(data.error as string) || "알 수 없는 오류"}`);
      } else {
        alert(`완료: ${(data.message as string) || "수집 완료"}`);
      }
    } catch (e) {
      alert(`오류: ${e instanceof Error ? e.message : "네트워크 오류"}`);
    } finally {
      setLoadingIdx(null);
    }
  }

  return (
    <div className="flex gap-3 flex-wrap">
      {BUTTONS.map((btn, idx) => (
        <button
          key={idx}
          onClick={() => handleClick(idx, btn.endpoint)}
          disabled={loadingIdx !== null}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loadingIdx === idx ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              수집 중...
            </span>
          ) : (
            btn.label
          )}
        </button>
      ))}
    </div>
  );
}
