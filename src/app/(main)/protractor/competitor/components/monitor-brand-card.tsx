"use client";

import { useState } from "react";
import type { CompetitorMonitor } from "@/types/competitor";
import { Trash2 } from "lucide-react";

export interface AnalysisStatus {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

interface MonitorBrandCardProps {
  monitor: CompetitorMonitor;
  isSearching: boolean;
  onClick: () => void;
  onDelete: () => void;
  analysisStatus?: AnalysisStatus | null;
}

/** 첫 글자 아바타 */
function LetterAvatar({ name }: { name: string }) {
  const letter = name.charAt(0).toUpperCase();
  return (
    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold shrink-0">
      {letter}
    </div>
  );
}

/** 프로필 이미지 (page_profile_url → graph.facebook.com → LetterAvatar) */
function BrandLogo({
  pageProfileUrl,
  pageId,
  brandName,
}: {
  pageProfileUrl: string | null;
  pageId: string | null;
  brandName: string;
}) {
  const [step, setStep] = useState<"profile" | "graph" | "letter">(
    pageProfileUrl ? "profile" : pageId ? "graph" : "letter",
  );

  if (step === "letter") {
    return <LetterAvatar name={brandName} />;
  }

  const src =
    step === "profile"
      ? pageProfileUrl!
      : `https://graph.facebook.com/${pageId}/picture?type=small`;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={brandName}
      width={32}
      height={32}
      className="w-8 h-8 rounded-full shrink-0 object-cover"
      onError={() => {
        if (step === "profile" && pageId) {
          setStep("graph");
        } else {
          setStep("letter");
        }
      }}
      referrerPolicy="no-referrer"
    />
  );
}

/** 시간 전 포맷 */
function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

/** L1 분석 상태 배지 */
function AnalysisBadge({ status }: { status: AnalysisStatus }) {
  if (status.total === 0) return null;

  const isComplete = status.pending === 0 && status.processing === 0 && status.completed > 0;
  const isInProgress = status.pending > 0 || status.processing > 0;

  if (isComplete) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-green-700 bg-green-50 rounded-full whitespace-nowrap">
        L1 완료 ({status.completed}/{status.total})
      </span>
    );
  }

  if (isInProgress) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 bg-blue-50 rounded-full whitespace-nowrap">
        L1 분석중 ({status.completed}/{status.total})
      </span>
    );
  }

  return null;
}

export function MonitorBrandCard({
  monitor,
  isSearching,
  onClick,
  onDelete,
  analysisStatus,
}: MonitorBrandCardProps) {
  const hasNew = (monitor.newAdsCount ?? 0) > 0;

  return (
    <div
      className={`relative p-3 rounded-xl border cursor-pointer transition group ${
        isSearching
          ? "bg-red-50 border-[#F75D5D]/30"
          : "bg-white border-gray-200 hover:border-gray-300"
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      <div className="flex items-start gap-2.5">
        <BrandLogo
          pageProfileUrl={monitor.pageProfileUrl}
          pageId={monitor.pageId}
          brandName={monitor.brandName}
        />
        <div className="flex-1 min-w-0">
          {/* 브랜드명 + NEW 배지 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-gray-900 truncate">
              {monitor.brandName}
            </span>
            {hasNew && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold text-white bg-[#F75D5D] rounded-full whitespace-nowrap">
                NEW +{monitor.newAdsCount}
              </span>
            )}
            {analysisStatus && <AnalysisBadge status={analysisStatus} />}
          </div>
          {/* 서브텍스트: @IG · 광고 N건 · 시간 전 */}
          <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5 truncate">
            {monitor.igUsername && <span>@{monitor.igUsername}</span>}
            {monitor.igUsername && monitor.totalAdsCount > 0 && (
              <span>·</span>
            )}
            {monitor.totalAdsCount > 0 && (
              <span>광고 {monitor.totalAdsCount}건</span>
            )}
            {(monitor.igUsername || monitor.totalAdsCount > 0) &&
              monitor.lastCheckedAt && <span>·</span>}
            {monitor.lastCheckedAt && (
              <span>{timeAgo(monitor.lastCheckedAt)}</span>
            )}
          </div>
        </div>
        {/* 삭제 버튼 */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition shrink-0"
          title="모니터링 삭제"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
