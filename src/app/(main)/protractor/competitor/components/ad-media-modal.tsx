"use client";

import { useEffect, useState, useCallback } from "react";
import type { CompetitorAd } from "@/types/competitor";
import {
  X,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Play,
  ImageOff,
  Loader2,
} from "lucide-react";

interface AdMediaModalProps {
  ad: CompetitorAd;
  isOpen: boolean;
  onClose: () => void;
}

export function AdMediaModal({ ad, isOpen, onClose }: AdMediaModalProps) {
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [videoError, setVideoError] = useState(false);

  // ESC 키로 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // 모달 열릴 때 스크롤 잠금
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // 모달 열릴 때 상태 초기화
  useEffect(() => {
    if (isOpen) {
      setCarouselIndex(0);
      setImageError(false);
      setVideoError(false);
    }
  }, [isOpen]);

  const handleDownload = useCallback(
    async (type: "image" | "video") => {
      setDownloading(true);
      try {
        const mediaUrl = type === "video" ? ad.videoUrl : ad.imageUrl;
        const urlParam = mediaUrl ? `&url=${encodeURIComponent(mediaUrl)}` : "";
        window.open(
          `/api/competitor/download?ad_id=${ad.id}&type=${type}${urlParam}`,
          "_blank",
        );
      } finally {
        // 다운로드는 새 탭에서 진행되므로 즉시 해제
        setTimeout(() => setDownloading(false), 1000);
      }
    },
    [ad.id, ad.videoUrl, ad.imageUrl],
  );

  if (!isOpen) return null;

  const hasCarousel =
    ad.displayFormat === "CAROUSEL" && ad.carouselCards.length > 0;
  const carouselTotal = hasCarousel ? ad.carouselCards.length : 0;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-3xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900 truncate">
            {ad.pageName}
          </h3>
          <div className="flex items-center gap-2">
            <a
              href={ad.snapshotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Meta에서 보기
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* 미디어 영역 */}
        <div className="flex-1 overflow-auto bg-gray-50">
          {/* 영상 */}
          {ad.displayFormat === "VIDEO" && ad.videoUrl && !videoError ? (
            <video
              src={ad.videoUrl}
              controls
              autoPlay
              className="max-h-[70vh] w-full object-contain mx-auto"
              onError={() => setVideoError(true)}
            />
          ) : ad.displayFormat === "VIDEO" ? (
            <div className="flex flex-col items-center justify-center text-gray-400">
              {ad.videoPreviewUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ad.videoPreviewUrl}
                    alt={`${ad.pageName} 영상 프리뷰`}
                    className="max-h-[60vh] object-contain mx-auto"
                  />
                  <div className="py-3 flex flex-col items-center">
                    <p className="text-sm text-gray-500">
                      {videoError
                        ? "영상을 재생할 수 없습니다"
                        : "영상 미리보기만 제공됩니다"}
                    </p>
                    <a
                      href={ad.snapshotUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#F75D5D] mt-1 hover:underline"
                    >
                      Meta에서 보기
                    </a>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-64">
                  <Play className="h-12 w-12 mb-2" />
                  <p className="text-sm">영상을 재생할 수 없습니다</p>
                  <a
                    href={ad.snapshotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#F75D5D] mt-1 hover:underline"
                  >
                    Meta에서 보기
                  </a>
                </div>
              )}
            </div>
          ) : hasCarousel ? (
            /* 캐러셀 */
            <div className="relative">
              {ad.carouselCards[carouselIndex]?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ad.carouselCards[carouselIndex].imageUrl!}
                  alt={`${ad.pageName} 캐러셀 ${carouselIndex + 1}`}
                  className="max-h-[70vh] object-contain mx-auto"
                />
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-400">
                  <ImageOff className="h-12 w-12" />
                </div>
              )}
              {/* 네비게이션 */}
              {carouselTotal > 1 && (
                <>
                  <button
                    onClick={() =>
                      setCarouselIndex((i) =>
                        i > 0 ? i - 1 : carouselTotal - 1,
                      )
                    }
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-2 shadow"
                  >
                    <ChevronLeft className="h-5 w-5 text-gray-700" />
                  </button>
                  <button
                    onClick={() =>
                      setCarouselIndex((i) =>
                        i < carouselTotal - 1 ? i + 1 : 0,
                      )
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-2 shadow"
                  >
                    <ChevronRight className="h-5 w-5 text-gray-700" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
                    {carouselIndex + 1} / {carouselTotal}
                  </div>
                </>
              )}
              {/* 캐러셀 카드 제목 */}
              {ad.carouselCards[carouselIndex]?.title && (
                <div className="p-3 bg-white border-t text-sm text-gray-700">
                  <p className="font-medium">
                    {ad.carouselCards[carouselIndex].title}
                  </p>
                  {ad.carouselCards[carouselIndex].body && (
                    <p className="text-gray-500 text-xs mt-1">
                      {ad.carouselCards[carouselIndex].body}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : ad.imageUrl && !imageError ? (
            /* 이미지 */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ad.imageUrl}
              alt={`${ad.pageName} 광고 소재`}
              className="max-h-[70vh] object-contain mx-auto"
              onError={() => setImageError(true)}
            />
          ) : (
            /* fallback */
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <ImageOff className="h-12 w-12 mb-2" />
              <p className="text-sm">소재를 불러올 수 없습니다</p>
            </div>
          )}
        </div>

        {/* 하단 정보 */}
        <div className="p-5 border-t border-gray-100 space-y-3">
          {/* 메타 정보 */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="font-medium text-gray-700">{ad.pageName}</span>
            <span>·</span>
            {ad.isActive ? (
              <span className="text-green-600 font-medium">게재중</span>
            ) : (
              <span>종료됨</span>
            )}
            <span>·</span>
            <span>{ad.durationDays}일</span>
          </div>

          {/* 광고 문구 */}
          {ad.body && (
            <p className="text-sm text-gray-600 whitespace-pre-line line-clamp-4">
              {ad.body}
            </p>
          )}

          {/* 액션 버튼 */}
          <div className="flex items-center gap-2 pt-1">
            {ad.imageUrl && ad.displayFormat !== "VIDEO" && (
              <button
                onClick={() => handleDownload("image")}
                disabled={downloading}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#F75D5D] hover:bg-[#E54949] text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                이미지 다운로드
              </button>
            )}
            {ad.videoUrl && (
              <button
                onClick={() => handleDownload("video")}
                disabled={downloading}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#F75D5D] hover:bg-[#E54949] text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                영상 다운로드
              </button>
            )}
            {ad.linkUrl && (
              <a
                href={ad.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
              >
                <ExternalLink className="h-4 w-4" />
                랜딩페이지
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
