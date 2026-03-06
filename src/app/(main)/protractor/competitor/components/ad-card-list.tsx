"use client";

import type { CompetitorAd } from "@/types/competitor";
import { AdCard } from "./ad-card";

interface AdCardListProps {
  ads: CompetitorAd[];
  totalCount: number;
  query: string;
}

export function AdCardList({ ads, totalCount, query }: AdCardListProps) {
  return (
    <div className="space-y-4">
      {/* 결과 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-700">
          <span className="font-semibold text-gray-900">&quot;{query}&quot;</span>{" "}
          검색 결과{" "}
          <span className="text-[#F75D5D] font-semibold">{ads.length}건</span>
          {ads.length !== totalCount && (
            <span className="text-gray-400 ml-1">(전체 {totalCount}건 중 필터 적용)</span>
          )}
        </h2>
      </div>

      {/* 카드 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ads.map((ad) => (
          <AdCard key={ad.id} ad={ad} />
        ))}
      </div>
    </div>
  );
}
