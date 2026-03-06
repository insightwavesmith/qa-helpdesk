"use client";

import { useState } from "react";
import type { CompetitorMonitor } from "@/types/competitor";
import { X } from "lucide-react";

interface AddMonitorDialogProps {
  onClose: () => void;
  onAdded: (monitor: CompetitorMonitor) => void;
  searchQuery: string;
}

export function AddMonitorDialog({
  onClose,
  onAdded,
  searchQuery,
}: AddMonitorDialogProps) {
  const [brandName, setBrandName] = useState(searchQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    const name = brandName.trim();
    if (!name) {
      setError("브랜드명을 입력하세요");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/competitor/monitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName: name }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "등록에 실패했습니다");
        return;
      }

      onAdded(json.monitor);
    } catch {
      setError("네트워크 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">
            브랜드 모니터링 추가
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700" htmlFor="monitor-brand-name">
              브랜드명
            </label>
            <input
              id="monitor-brand-name"
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              placeholder="모니터링할 브랜드명 입력"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D]/30 focus:border-[#F75D5D]"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !brandName.trim()}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#F75D5D] hover:bg-[#E54949] rounded-xl transition disabled:opacity-50"
            >
              {loading ? "등록 중..." : "등록"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
