"use client";

import { useState, useCallback, useMemo } from "react";
import type {
  CompetitorAd,
  CompetitorMonitor,
  BrandPage,
  SearchMode,
} from "@/types/competitor";
import { SearchBar } from "./components/search-bar";
import { BrandSearchBar } from "./components/brand-search-bar";
import { FilterChips, type FilterState } from "./components/filter-chips";
import { AdCardList } from "./components/ad-card-list";
import { MonitorPanel } from "./components/monitor-panel";
// AI 인사이트 기능 숨김 (서비스 오픈 후 재검토 예정)
// import { InsightSection } from "./components/insight-section";
import { AlertTriangle, Search, Building2, KeyRound } from "lucide-react";

export default function CompetitorDashboard() {
  // 검색 모드
  const [searchMode, setSearchMode] = useState<SearchMode>("brand");

  // 검색 상태
  const [searchQuery, setSearchQuery] = useState("");
  const [ads, setAds] = useState<CompetitorAd[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    activeOnly: false,
    minDays: 0,
    platform: "",
    mediaType: "all",
    sortBy: "latest",
  });

  // 페이지네이션 상태
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [serverTotalCount, setServerTotalCount] = useState<number>(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // 브랜드 검색 시 page_id 보존 (더보기 시 필요)
  const [searchPageId, setSearchPageId] = useState<string | null>(null);

  // 모니터링 상태
  const [monitors, setMonitors] = useState<CompetitorMonitor[]>([]);

  // 선택 상태
  const [selectedAds, setSelectedAds] = useState<Set<string>>(new Set());

  // 로딩/에러 상태
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 광고 선택 토글
  const handleSelectAd = useCallback((id: string) => {
    setSelectedAds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 검색 실행 (새 검색 — 기존 결과 초기화)
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;

    setSearchQuery(query.trim());
    setLoadingSearch(true);
    setError(null);
    setAds([]);
    setSelectedAds(new Set());
    setNextPageToken(null);
    setServerTotalCount(0);
    setSearchPageId(null);

    try {
      const params = new URLSearchParams({ q: query.trim() });
      const res = await fetch(`/api/competitor/search?${params}`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "검색에 실패했습니다");
        return;
      }

      setAds(json.ads ?? []);
      setNextPageToken(json.nextPageToken ?? null);
      setServerTotalCount(json.serverTotalCount ?? json.ads?.length ?? 0);
    } catch {
      setError("네트워크 오류가 발생했습니다");
    } finally {
      setLoadingSearch(false);
    }
  }, []);

  // 더보기 (다음 페이지 누적 로드)
  const handleLoadMore = useCallback(async () => {
    console.log("[handleLoadMore]", { searchQuery, searchPageId, nextPageToken, loadingMore });
    if ((!searchQuery && !searchPageId) || !nextPageToken || loadingMore) return;

    setLoadingMore(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page_token: nextPageToken,
      });
      if (searchPageId) {
        params.set("page_id", searchPageId);
      } else if (searchQuery) {
        params.set("q", searchQuery);
      }
      const res = await fetch(`/api/competitor/search?${params}`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "더보기에 실패했습니다");
        return;
      }

      // 기존 ads에 누적 (중복 제거)
      const newAds: CompetitorAd[] = json.ads ?? [];
      setAds((prev) => {
        const existingIds = new Set(prev.map((a) => a.id));
        const deduped = newAds.filter((a) => !existingIds.has(a.id));
        return [...prev, ...deduped];
      });
      setNextPageToken(json.nextPageToken ?? null);
      // serverTotalCount는 첫 검색 시 설정된 값 유지
    } catch {
      setError("네트워크 오류가 발생했습니다");
    } finally {
      setLoadingMore(false);
    }
  }, [searchQuery, nextPageToken, loadingMore, searchPageId]);

  // 필터 변경 시 처리
  const handleFilterChange = useCallback(
    (newFilters: FilterState) => {
      setFilters(newFilters);
    },
    [],
  );

  // 필터 + 정렬 적용된 광고 목록 (useMemo로 안정화)
  const filteredAds = useMemo(() => {
    const filtered = ads.filter((ad) => {
      if (filters.activeOnly && !ad.isActive) return false;
      if (filters.minDays > 0 && ad.durationDays < filters.minDays) return false;
      if (filters.platform && !ad.platforms.includes(filters.platform)) return false;
      if (filters.mediaType === "image" && ad.displayFormat !== "IMAGE") return false;
      if (filters.mediaType === "carousel" && ad.displayFormat !== "CAROUSEL") return false;
      if (filters.mediaType === "video" && ad.displayFormat !== "VIDEO") return false;
      return true;
    });

    // 정렬
    if (filters.sortBy === "duration") {
      return [...filtered].sort((a, b) => b.durationDays - a.durationDays);
    }
    // 최신순: start_date 내림차순
    return [...filtered].sort(
      (a, b) =>
        new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
    );
  }, [ads, filters]);

  // 브랜드 선택 → page_id로 광고 검색
  const handleBrandSelect = useCallback(
    async (brand: BrandPage) => {
      setSearchQuery(brand.page_name);
      setLoadingSearch(true);
      setError(null);
      setAds([]);
      setSelectedAds(new Set());
      setNextPageToken(null);
      setServerTotalCount(0);
      setSearchPageId(brand.page_id);

      try {
        const params = new URLSearchParams({
          page_id: brand.page_id,
        });
        const res = await fetch(`/api/competitor/search?${params}`);
        const json = await res.json();

        if (!res.ok) {
          setError(json.error || "검색에 실패했습니다");
          return;
        }

        setAds(json.ads ?? []);
        setNextPageToken(json.nextPageToken ?? null);
        setServerTotalCount(json.serverTotalCount ?? json.ads?.length ?? 0);
      } catch {
        setError("네트워크 오류가 발생했습니다");
      } finally {
        setLoadingSearch(false);
      }
    },
    [],
  );

  // 모니터링 브랜드 클릭 -> 해당 브랜드로 검색 (page_id가 있으면 page_id로)
  const handleMonitorClick = useCallback(
    (monitor: CompetitorMonitor) => {
      if (monitor.pageId) {
        handleBrandSelect({
          page_id: monitor.pageId,
          page_name: monitor.brandName,
          category: monitor.category ?? null,
          image_uri: monitor.pageProfileUrl ?? null,
          likes: null,
          ig_username: monitor.igUsername ?? null,
          ig_followers: null,
          ig_verification: false,
          page_alias: null,
        });
      } else {
        handleSearch(monitor.brandName);
      }
    },
    [handleSearch, handleBrandSelect],
  );

  // 브랜드 검색에서 핀 등록
  const handlePinBrand = useCallback(
    async (brand: BrandPage) => {
      console.log("[handlePinBrand]", { brandName: brand.page_name, pageId: brand.page_id });
      // 이미 등록된 브랜드 확인
      const alreadyExists = monitors.some(
        (m) => m.pageId === brand.page_id || m.brandName === brand.page_name,
      );
      if (alreadyExists) {
        setError("이미 등록된 브랜드입니다");
        return;
      }
      if (monitors.length >= 10) {
        setError("모니터링은 최대 10개까지 등록할 수 있습니다");
        return;
      }

      try {
        const res = await fetch("/api/competitor/monitors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandName: brand.page_name,
            pageId: brand.page_id,
            pageProfileUrl: brand.image_uri,
            igUsername: brand.ig_username,
            category: brand.category,
          }),
        });
        const json = await res.json();

        console.log("[handlePinBrand] response:", { ok: res.ok, status: res.status, json });

        if (!res.ok) {
          console.error("[handlePinBrand] 등록 실패:", json);
          setError(json.error || "모니터링 등록에 실패했습니다");
          return;
        }

        setMonitors((prev) => [...prev, json.monitor]);
      } catch {
        setError("네트워크 오류가 발생했습니다");
      }
    },
    [monitors, setMonitors],
  );

  return (
    <div className="space-y-6">
      {/* 검색 모드 토글 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSearchMode("brand")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition ${
            searchMode === "brand"
              ? "bg-[#F75D5D] text-white shadow-sm"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Building2 className="h-4 w-4" />
          브랜드 검색
        </button>
        <button
          type="button"
          onClick={() => setSearchMode("keyword")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition ${
            searchMode === "keyword"
              ? "bg-[#F75D5D] text-white shadow-sm"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <KeyRound className="h-4 w-4" />
          키워드 검색
        </button>
      </div>

      {/* 검색바 — 모드에 따라 분기 */}
      {searchMode === "brand" ? (
        <BrandSearchBar
          onBrandSelect={handleBrandSelect}
          onPinBrand={handlePinBrand}
          loading={loadingSearch}
        />
      ) : (
        <SearchBar onSearch={handleSearch} loading={loadingSearch} />
      )}

      {/* 필터 칩 */}
      {ads.length > 0 && (
        <FilterChips filters={filters} onChange={handleFilterChange} />
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
            <AdCardList
              ads={filteredAds}
              allAdsCount={ads.length}
              serverTotalCount={serverTotalCount}
              query={searchQuery}
              nextPageToken={nextPageToken}
              onLoadMore={handleLoadMore}
              loadingMore={loadingMore}
              selectedAds={selectedAds}
              onSelectAd={handleSelectAd}
              monitors={monitors}
              onPinBrand={handlePinBrand}
            />
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

      {/* AI 인사이트 섹션 — 서비스 오픈 후 재검토 예정 */}
      {/* {ads.length > 0 && (
        <InsightSection
          insight={insight}
          loading={loadingInsight}
          onAnalyze={handleAnalyze}
          adCount={filteredAds.length}
        />
      )} */}
    </div>
  );
}
