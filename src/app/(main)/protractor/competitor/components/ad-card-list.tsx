"use client";

import { useState, useMemo, useCallback } from "react";
import type { CompetitorAd, CompetitorMonitor, BrandPage } from "@/types/competitor";
import { AdCard } from "./ad-card";
import {
  downloadFilesAsZip,
  type DownloadFile,
  type DownloadProgress,
} from "@/lib/competitor/client-download";
import { Download, Loader2, ChevronDown, CheckSquare } from "lucide-react";

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
  /** 선택된 광고 ID 집합 */
  selectedAds: Set<string>;
  /** 광고 선택 토글 */
  onSelectAd: (id: string) => void;
  /** 모니터링 목록 (브랜드 등록 여부 확인용) */
  monitors: CompetitorMonitor[];
  /** 브랜드 핀 등록 콜백 */
  onPinBrand: (brand: BrandPage) => void;
}

export function AdCardList({
  ads,
  allAdsCount,
  serverTotalCount,
  query,
  nextPageToken,
  onLoadMore,
  loadingMore,
  selectedAds,
  onSelectAd,
  monitors,
  onPinBrand,
}: AdCardListProps) {
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgress | null>(null);

  /** 이미지가 있는 광고 수 (ZIP 다운로드 가능 여부) */
  const downloadableCount = useMemo(() => {
    return ads.filter((ad) => {
      if (ad.displayFormat === "VIDEO") {
        return !!(ad.videoUrl ?? ad.videoPreviewUrl ?? ad.imageUrl);
      }
      return !!ad.imageUrl;
    }).length;
  }, [ads]);

  /** 광고 목록 → DownloadFile 배열 변환 */
  const adsToDownloadFiles = useCallback(
    (targetAds: CompetitorAd[]): DownloadFile[] => {
      const files: DownloadFile[] = [];
      const safeName = (name: string) =>
        name.replace(/[^a-zA-Z0-9가-힣]/g, "_");

      for (const ad of targetAds) {
        const brandFolder = `${safeName(ad.pageName)}_${ad.id}`;

        if (ad.displayFormat === "CAROUSEL" && ad.carouselCards.length > 0) {
          // 캐러셀: 전체 이미지를 폴더로 묶음
          ad.carouselCards.forEach((card, idx) => {
            if (card.imageUrl) {
              files.push({
                url: card.imageUrl,
                filename: `slide_${idx + 1}.jpg`,
                folder: brandFolder,
              });
            }
          });
          // 영상도 있으면 추가
          if (ad.videoUrl) {
            files.push({
              url: ad.videoUrl,
              filename: `video.mp4`,
              folder: brandFolder,
            });
          }
        } else if (ad.displayFormat === "VIDEO") {
          // 영상 다운로드 (원본 영상 우선)
          if (ad.videoUrl) {
            files.push({
              url: ad.videoUrl,
              filename: `${safeName(ad.pageName)}_${ad.id}.mp4`,
            });
          }
          // 프리뷰 이미지도 추가
          if (ad.imageUrl || ad.videoPreviewUrl) {
            files.push({
              url: (ad.imageUrl ?? ad.videoPreviewUrl)!,
              filename: `${safeName(ad.pageName)}_${ad.id}_preview.jpg`,
            });
          }
        } else {
          // 이미지
          if (ad.imageUrl) {
            files.push({
              url: ad.imageUrl,
              filename: `${safeName(ad.pageName)}_${ad.id}.jpg`,
            });
          }
        }
      }
      return files;
    },
    [],
  );

  /** 클라이언트 ZIP 다운로드 실행 */
  const handleZipDownload = useCallback(
    async (targetAds: CompetitorAd[]) => {
      if (downloading) return;

      const files = adsToDownloadFiles(targetAds);
      if (files.length === 0) {
        alert("다운로드할 수 있는 파일이 없습니다");
        return;
      }

      setDownloading(true);
      setDownloadProgress({ total: files.length, completed: 0, failed: 0 });

      try {
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, 19);
        await downloadFilesAsZip(
          files,
          `competitor-ads-${timestamp}.zip`,
          (progress) => setDownloadProgress({ ...progress }),
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "ZIP 다운로드에 실패했습니다";
        alert(msg);
      } finally {
        setDownloading(false);
        setDownloadProgress(null);
      }
    },
    [downloading, adsToDownloadFiles],
  );

  /** 전체 다운로드 */
  const handleAllDownload = useCallback(() => {
    handleZipDownload(ads.slice(0, 50));
  }, [ads, handleZipDownload]);

  /** 선택 다운로드 */
  const handleSelectedDownload = useCallback(() => {
    const selected = ads.filter((ad) => selectedAds.has(ad.id));
    handleZipDownload(selected);
  }, [ads, selectedAds, handleZipDownload]);

  /** 다운로드 버튼 라벨 */
  const downloadLabel = downloadProgress
    ? `다운로드 중 (${downloadProgress.completed}/${downloadProgress.total})`
    : null;

  return (
    <div className="space-y-4">
      {/* 결과 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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

        <div className="flex items-center gap-2">
          {/* 선택 다운로드 */}
          {selectedAds.size > 0 && (
            <button
              type="button"
              onClick={handleSelectedDownload}
              disabled={downloading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-gray-700 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckSquare className="h-4 w-4" />
              )}
              {downloadLabel ?? `${selectedAds.size}개 선택 다운로드`}
            </button>
          )}

          {/* ZIP 전체 다운로드 버튼 */}
          <button
            type="button"
            onClick={handleAllDownload}
            disabled={downloading || downloadableCount === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#F75D5D] hover:bg-[#E54949] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition"
          >
            {downloading && selectedAds.size === 0 ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {downloading && selectedAds.size === 0
              ? (downloadLabel ?? "다운로드 중...")
              : "전체 다운로드 (ZIP)"}
          </button>
        </div>
      </div>

      {/* 카드 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ads.map((ad) => (
          <AdCard
            key={ad.id}
            ad={ad}
            selected={selectedAds.has(ad.id)}
            onSelect={onSelectAd}
            isPinned={monitors.some(
              (m) => m.pageId === ad.pageId || m.brandName === ad.pageName,
            )}
            onPinBrand={onPinBrand}
          />
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
