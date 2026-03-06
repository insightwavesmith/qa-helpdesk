"use client";

import type { CompetitorAd } from "@/types/competitor";
import { DurationBar } from "./duration-bar";
import { ExternalLink, Eye } from "lucide-react";

interface AdCardProps {
  ad: CompetitorAd;
}

/** 플랫폼별 아이콘 */
function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "facebook") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#1877F2">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    );
  }
  if (platform === "instagram") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#E4405F">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    );
  }
  return null;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function AdCard({ ad }: AdCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition overflow-hidden">
      {/* 소재 썸네일 (ad_snapshot_url) */}
      <div className="relative w-full h-48 bg-gray-50 border-b border-gray-100">
        <iframe
          src={ad.snapshotUrl}
          title={`${ad.pageName} 광고 소재`}
          className="w-full h-full"
          sandbox="allow-scripts allow-same-origin"
          loading="lazy"
          onError={(e) => {
            const target = e.currentTarget;
            target.style.display = "none";
            const parent = target.parentElement;
            if (parent) {
              const fallback = document.createElement("div");
              fallback.className =
                "flex items-center justify-center w-full h-full text-gray-400 text-sm";
              fallback.textContent = "소재 미리보기를 불러올 수 없습니다";
              parent.appendChild(fallback);
            }
          }}
        />
      </div>

      <div className="p-4 space-y-3">
        {/* 헤더: 브랜드명 + 플랫폼 아이콘 */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 truncate">
            {ad.pageName}
          </h3>
          <div className="flex items-center gap-1.5">
            {ad.platforms.map((p) => (
              <PlatformIcon key={p} platform={p} />
            ))}
          </div>
        </div>

        {/* 광고 문구 */}
        {ad.body && (
          <p className="text-sm text-gray-600 line-clamp-3">{ad.body}</p>
        )}

        {/* 운영기간 바 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <DurationBar durationDays={ad.durationDays} />
            <span className="ml-2 text-xs font-semibold text-gray-700 whitespace-nowrap">
              {ad.durationDays}일
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>{formatDate(ad.startDate)}</span>
            <span>~</span>
            {ad.isActive ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                게재중
              </span>
            ) : (
              <span>{ad.endDate ? formatDate(ad.endDate) : ""}</span>
            )}
          </div>
        </div>

        {/* CTA 버튼 */}
        <div className="flex gap-2 pt-1">
          <a
            href={ad.snapshotUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition"
          >
            <Eye className="h-3.5 w-3.5" />
            소재 보기
          </a>
          {ad.caption && (
            <a
              href={ad.caption.startsWith("http") ? ad.caption : `https://${ad.caption}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#F75D5D] bg-red-50 hover:bg-red-100 rounded-lg transition"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              랜딩페이지
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
