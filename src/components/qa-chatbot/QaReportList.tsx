"use client";

import { useState } from "react";
import Image from "next/image";
import useSWR from "swr";
import { Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getQaReports, updateQaReportStatus, type QaReport } from "@/actions/qa-reports";
import { SWR_KEYS } from "@/lib/swr/keys";

const SEVERITY_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  critical: { label: "심각", color: "text-red-700", bg: "bg-red-100" },
  high: { label: "높음", color: "text-orange-700", bg: "bg-orange-100" },
  medium: { label: "보통", color: "text-yellow-700", bg: "bg-yellow-100" },
  low: { label: "낮음", color: "text-green-700", bg: "bg-green-100" },
};

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  open: { label: "미해결", color: "text-blue-700", bg: "bg-blue-100" },
  in_progress: { label: "진행 중", color: "text-purple-700", bg: "bg-purple-100" },
  resolved: { label: "해결됨", color: "text-green-700", bg: "bg-green-100" },
  closed: { label: "종료", color: "text-gray-700", bg: "bg-gray-100" },
};

function relativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHr < 24) return `${diffHr}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return date.toLocaleDateString("ko-KR");
}

export function QaReportList() {
  const { data: reports = [], isLoading, mutate } = useSWR<QaReport[]>(
    SWR_KEYS.QA_REPORTS,
    () => getQaReports({ limit: 50 }),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleStatusChange = async (
    reportId: string,
    status: "open" | "in_progress" | "resolved" | "closed"
  ) => {
    const result = await updateQaReportStatus(reportId, status);
    if ("error" in result) {
      alert(result.error);
      return;
    }
    // SWR 캐시 업데이트
    mutate(
      reports.map((r) => (r.id === reportId ? { ...r, status } : r)),
      { revalidate: true },
    );
  };

  const selectedReport = reports.find((r) => r.id === selectedId);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  // 상세 뷰
  if (selectedReport) {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto">
        <div className="border-b px-4 py-2">
          <button
            onClick={() => setSelectedId(null)}
            className="text-sm text-[#F75D5D] hover:underline"
          >
            &larr; 목록으로
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Badge
              className={`${SEVERITY_CONFIG[selectedReport.severity]?.bg || "bg-gray-100"} ${SEVERITY_CONFIG[selectedReport.severity]?.color || "text-gray-700"} border-0 text-xs`}
            >
              {SEVERITY_CONFIG[selectedReport.severity]?.label ||
                selectedReport.severity}
            </Badge>
            <Badge
              className={`${STATUS_CONFIG[selectedReport.status]?.bg || "bg-gray-100"} ${STATUS_CONFIG[selectedReport.status]?.color || "text-gray-700"} border-0 text-xs`}
            >
              {STATUS_CONFIG[selectedReport.status]?.label ||
                selectedReport.status}
            </Badge>
          </div>
          <h4 className="text-sm font-semibold text-gray-900">
            {selectedReport.title}
          </h4>
          <p className="text-xs text-gray-500">
            {relativeTime(selectedReport.created_at)}
          </p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {selectedReport.description}
          </p>

          {selectedReport.image_urls && selectedReport.image_urls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedReport.image_urls.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Image
                    src={url}
                    alt={`스크린샷 ${i + 1}`}
                    width={80}
                    height={80}
                    className="rounded-md border object-cover"
                    unoptimized
                  />
                </a>
              ))}
            </div>
          )}

          <div className="border-t pt-3">
            <p className="mb-2 text-xs font-medium text-gray-500">
              상태 변경
            </p>
            <div className="flex flex-wrap gap-1">
              {(
                ["open", "in_progress", "resolved", "closed"] as const
              ).map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(selectedReport.id, s)}
                  disabled={selectedReport.status === s}
                  className={`rounded-md px-2 py-1 text-xs transition-colors ${
                    selectedReport.status === s
                      ? "bg-gray-200 text-gray-500"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {STATUS_CONFIG[s]?.label || s}
                </button>
              ))}
            </div>
          </div>

          {selectedReport.raw_message && (
            <div className="border-t pt-3">
              <p className="mb-1 text-xs font-medium text-gray-500">
                원본 메시지
              </p>
              <p className="rounded-md bg-gray-50 p-2 text-xs text-gray-600 whitespace-pre-wrap">
                {selectedReport.raw_message}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 리스트 뷰
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-xs text-gray-500">{reports.length}건</span>
        <button
          onClick={() => mutate()}
          className="rounded-md p-1 text-gray-400 transition-colors hover:text-gray-600"
          aria-label="새로고침"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {reports.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">아직 QA 리포트가 없습니다.</p>
          </div>
        ) : (
          <div className="divide-y">
            {reports.map((report) => (
              <button
                key={report.id}
                onClick={() => setSelectedId(report.id)}
                className="w-full px-4 py-3 text-left transition-colors hover:bg-gray-50"
              >
                <div className="mb-1 flex items-center gap-2">
                  <Badge
                    className={`${SEVERITY_CONFIG[report.severity]?.bg || "bg-gray-100"} ${SEVERITY_CONFIG[report.severity]?.color || "text-gray-700"} border-0 text-[10px]`}
                  >
                    {SEVERITY_CONFIG[report.severity]?.label ||
                      report.severity}
                  </Badge>
                  <Badge
                    className={`${STATUS_CONFIG[report.status]?.bg || "bg-gray-100"} ${STATUS_CONFIG[report.status]?.color || "text-gray-700"} border-0 text-[10px]`}
                  >
                    {STATUS_CONFIG[report.status]?.label || report.status}
                  </Badge>
                </div>
                <p className="text-sm font-medium text-gray-900 truncate">
                  {report.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {relativeTime(report.created_at)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
