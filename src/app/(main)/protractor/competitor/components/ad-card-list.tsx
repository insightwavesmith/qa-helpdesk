"use client";

import { useState, useMemo, useCallback } from "react";
import type { CompetitorAd } from "@/types/competitor";
import { AdCard } from "./ad-card";
import { Download, Loader2, ChevronDown } from "lucide-react";

interface AdCardListProps {
  /** 필터 적용된 광고 목록 */
  ads: CompetitorAd[];
  /** 필터 전 전체 로드된 광고 수 */
  allAdsCount: number;
  /** SearchAPI.io 전체 결과 수 */
  serverTotalCount: number;
  query: string;
  /** 다음 페이지 토큰 (null이면 더보기 없음) */
  nextPageToken: string | null;
  onLoadMore: () => void;
  loadingMore: boolean;
}

export function AdCardList({
  ads,
  allAdsCount,
  serverTotalCount,
  query,
  nextPageToken,
  onLoadMore,
  loadingMore,
}: AdCardListProps) {
  const [downloading, setDownloading] = useState(false);

  /** 이미지가 있는 광고 수 (ZIP 다운로드 가능 여부) */
  const downloadableCount = useMemo(() => {
    return ads.filter((ad) => {
      if (ad.displayFormat === "VIDEO") {
        return !!(ad.videoPreviewUrl ?? ad.imageUrl);
      }
      return !!ad.imageUrl;
    }).length;
  }, [ads]);

  /** ZIP 다운로드 실행 */
  const handleZipDownload = useCallback(async () => {
    if (downloading || downloadableCount === 0) return;

    setDownloading(true);
    try {
      // 최대 50건 제한
      const targetAds = ads.slice(0, 50).map((ad) => ({
        id: ad.id,
        pageName: ad.pageName,
        imageUrl: ad.imageUrl,
        videoPreviewUrl: ad.videoPreviewUrl,
        displayFormat: ad.displayFormat,
      }));

      const res = await fetch("/api/competitor/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ads: targetAds }),
      });

      if (!res.ok) {
        const json = await res.json();
        alert(json.error || "ZIP 다운로드에 실패했습니다");
        return;
      }

      // Blob → 자동 다운로드
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Content-Disposition에서 파일명 추출
      const disposition = res.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      a.download = filenameMatch?.[1] ?? "competitor-ads.zip";

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("네트워크 오류가 발생했습니다");
    } finally {
      setDownloading(false);
    }
  }, [ads, downloading, downloadableCount]);

  return (
    <div className="space-y-4">
      {/* 결과 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-700">
          <span className="font-semibold text-gray-900">&quot;{query}&quot;</span>{" "}
          검색 결과{" "}
          <span className="text-[#F75D5D] font-semibold">
            {ads.length.toLocaleString()}건
          </span>
          {ads.length !== allAdsCount && (
            <span className="text-gray-400 ml-1">
              (전체 {allAdsCount}건 중 필터 적용)
            </span>
          )}
          {serverTotalCount > allAdsCount && (
            <span className="text-gray-400 ml-1">
              — 총 {serverTotalCount.toLocaleString()}건
            </span>
          )}
        </h2>

        {/* ZIP 전체 다운로드 버튼 */}
        <button
          type="button"
          onClick={handleZipDownload}
          disabled={downloading || downloadableCount === 0}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#F75D5D] hover:bg-[#E54949] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition"
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {downloading ? "다운로드 중..." : "전체 다운로드 (ZIP)"}
        </button>
      </div>

      {/* 카드 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ads.map((ad) => (
          <AdCard key={ad.id} ad={ad} />
        ))}
      </div>

      {/* 더보기 버튼 */}
      {nextPageToken && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-[#F75D5D] hover:bg-[#E54949] disabled:opacity-60 disabled:cursor-not-allowed rounded-xl transition"
          >
            {loadingMore ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                불러오는 중...
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                더보기
                {serverTotalCount > allAdsCount && (
                  <span className="text-red-200 text-xs">
                    ({allAdsCount}/{serverTotalCount.toLocaleString()})
                  </span>
                )}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
