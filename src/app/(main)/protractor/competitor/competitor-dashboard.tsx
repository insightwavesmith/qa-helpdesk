"use client";

import { useState, useCallback } from "react";
import type { CompetitorAd, CompetitorInsight, CompetitorMonitor } from "@/types/competitor";
import { SearchBar } from "./components/search-bar";
import { FilterChips, type FilterState } from "./components/filter-chips";
import { AdCardList } from "./components/ad-card-list";
import { MonitorPanel } from "./components/monitor-panel";
import { InsightSection } from "./components/insight-section";
import { AlertTriangle, Search } from "lucide-react";

export default function CompetitorDashboard() {
  // 검색 상태
  const [searchQuery, setSearchQuery] = useState("");
  const [ads, setAds] = useState<CompetitorAd[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    activeOnly: false,
    minDays: 0,
    platform: "",
  });

  // 모니터링 상태
  const [monitors, setMonitors] = useState<CompetitorMonitor[]>([]);

  // AI 인사이트 상태
  const [insight, setInsight] = useState<CompetitorInsight | null>(null);

  // 로딩/에러 상태
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 검색 실행
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;

    setSearchQuery(query.trim());
    setLoadingSearch(true);
    setError(null);
    setInsight(null);

    try {
      const params = new URLSearchParams({ q: query.trim() });
      const res = await fetch(`/api/competitor/search?${params}`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "검색에 실패했습니다");
        setAds([]);
        return;
      }

      setAds(json.ads ?? []);
    } catch {
      setError("네트워크 오류가 발생했습니다");
      setAds([]);
    } finally {
      setLoadingSearch(false);
    }
  }, []);

  // 필터 적용된 광고 목록
  const filteredAds = ads.filter((ad) => {
    if (filters.activeOnly && !ad.isActive) return false;
    if (filters.minDays > 0 && ad.durationDays < filters.minDays) return false;
    if (filters.platform && !ad.platforms.includes(filters.platform)) return false;
    return true;
  });

  // AI 인사이트 요청
  const handleAnalyze = useCallback(async () => {
    if (filteredAds.length === 0) return;

    setLoadingInsight(true);
    try {
      const res = await fetch("/api/competitor/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          ads: filteredAds.slice(0, 50),
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "AI 분석에 실패했습니다");
        return;
      }

      setInsight(json.insight);
    } catch {
      setError("AI 분석 중 오류가 발생했습니다");
    } finally {
      setLoadingInsight(false);
    }
  }, [filteredAds, searchQuery]);

  // 모니터링 브랜드 클릭 -> 해당 브랜드로 검색
  const handleMonitorClick = useCallback(
    (monitor: CompetitorMonitor) => {
      handleSearch(monitor.brandName);
    },
    [handleSearch],
  );

  return (
    <div className="space-y-6">
      {/* 검색바 */}
      <SearchBar onSearch={handleSearch} loading={loadingSearch} />

      {/* 필터 칩 */}
      {ads.length > 0 && (
        <FilterChips filters={filters} onChange={setFilters} />
      )}

      {/* 에러 표시 */}
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 text-red-700 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 메인 콘텐츠: 모니터링 + 검색결과 */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* 모니터링 패널 (좌측) */}
        <MonitorPanel
          monitors={monitors}
          setMonitors={setMonitors}
          onBrandClick={handleMonitorClick}
          searchQuery={searchQuery}
        />

        {/* 검색 결과 (우측) */}
        <div className="flex-1 min-w-0">
          {loadingSearch ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#F75D5D]" />
              <span className="ml-3 text-gray-500">검색 중...</span>
            </div>
          ) : ads.length > 0 ? (
            <AdCardList ads={filteredAds} totalCount={ads.length} query={searchQuery} />
          ) : searchQuery ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Search className="h-12 w-12 mb-3" />
              <p className="text-lg font-medium">검색 결과가 없습니다</p>
              <p className="text-sm mt-1">다른 브랜드명이나 키워드로 검색해보세요</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Search className="h-12 w-12 mb-3" />
              <p className="text-lg font-medium">경쟁사 광고를 검색해보세요</p>
              <p className="text-sm mt-1">
                브랜드명이나 키워드를 입력하면 Meta Ad Library에서 광고를 찾아드립니다
              </p>
            </div>
          )}
        </div>
      </div>

      {/* AI 인사이트 섹션 */}
      {ads.length > 0 && (
        <InsightSection
          insight={insight}
          loading={loadingInsight}
          onAnalyze={handleAnalyze}
          adCount={filteredAds.length}
        />
      )}
    </div>
  );
}
