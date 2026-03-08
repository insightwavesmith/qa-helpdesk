"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, X, Pin, Building2, Loader2, Link2 } from "lucide-react";
import type { BrandPage, AdPage } from "@/types/competitor";

interface BrandSearchBarProps {
  onBrandSelect: (brand: BrandPage) => void;
  onPinBrand?: (brand: BrandPage) => void;
  loading?: boolean;
}

function formatLikes(n: number | null): string {
  if (n == null) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function BrandSearchBar({
  onBrandSelect,
  onPinBrand,
  loading,
}: BrandSearchBarProps) {
  const [query, setQuery] = useState("");
  const [brands, setBrands] = useState<BrandPage[]>([]);
  const [adPages, setAdPages] = useState<AdPage[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 브랜드 검색 API 호출 (page_search + ad_library 병렬)
  const searchBrands = useCallback(async (q: string) => {
    if (!q.trim()) {
      setBrands([]);
      setAdPages([]);
      setShowDropdown(false);
      return;
    }

    setSearching(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/competitor/brands?q=${encodeURIComponent(q.trim())}`,
      );
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "브랜드 검색에 실패했습니다");
        setBrands([]);
        setAdPages([]);
      } else {
        setBrands(json.brands ?? []);
        setAdPages(json.adPages ?? []);
      }
      setShowDropdown(true);
    } catch {
      setError("네트워크 오류가 발생했습니다");
      setBrands([]);
      setAdPages([]);
      setShowDropdown(true);
    } finally {
      setSearching(false);
    }
  }, []);

  // 입력 변경 → debounce 300ms
  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (!value.trim()) {
        setBrands([]);
        setAdPages([]);
        setShowDropdown(false);
        return;
      }

      debounceRef.current = setTimeout(() => {
        searchBrands(value);
      }, 300);
    },
    [searchBrands],
  );

  // 브랜드 선택
  const handleSelect = useCallback(
    (brand: BrandPage) => {
      setQuery(brand.page_name);
      setShowDropdown(false);
      onBrandSelect(brand);
    },
    [onBrandSelect],
  );

  // adPage 선택 → BrandPage 형태로 변환하여 기존 핸들러 재활용
  const handleAdPageSelect = useCallback(
    (adPage: AdPage) => {
      setQuery(adPage.page_name);
      setShowDropdown(false);
      onBrandSelect({
        page_id: adPage.page_id,
        page_name: adPage.page_name,
        category: null,
        image_uri: null,
        likes: null,
        ig_username: null,
        ig_followers: null,
        ig_verification: false,
        page_alias: null,
      });
    },
    [onBrandSelect],
  );

  // 핀 등록
  const handlePin = useCallback(
    (e: React.MouseEvent, brand: BrandPage) => {
      e.stopPropagation();
      onPinBrand?.(brand);
    },
    [onPinBrand],
  );

  // ESC 키 → 드롭다운 닫기
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowDropdown(false);
      } else if (e.key === "Enter" && brands.length > 0 && showDropdown) {
        handleSelect(brands[0]);
      }
    },
    [brands, showDropdown, handleSelect],
  );

  // 외부 클릭 → 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const hasResults = brands.length > 0 || adPages.length > 0;

  return (
    <div ref={containerRef} className="relative">
      {/* 검색 입력 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (hasResults || error) setShowDropdown(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="브랜드명, 자사몰 URL, 인스타 계정 등 뭐든 입력하세요"
          className="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D]/30 focus:border-[#F75D5D] transition"
          disabled={loading}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setBrands([]);
              setAdPages([]);
              setShowDropdown(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 로딩 인디케이터 */}
      {(searching || loading) && (
        <div className="absolute right-12 top-1/2 -translate-y-1/2">
          <Loader2 className="h-4 w-4 animate-spin text-[#F75D5D]" />
        </div>
      )}

      {/* 드롭다운 */}
      {showDropdown && (
        <div className="absolute z-20 top-full mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden max-h-[420px] overflow-y-auto">
          {error ? (
            <div className="px-4 py-6 text-center text-sm text-red-500">
              {error}
            </div>
          ) : searching ? (
            <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>검색 중...</span>
            </div>
          ) : !hasResults ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              검색 결과가 없습니다
            </div>
          ) : (
            <>
              {/* 📌 공식 브랜드 섹션 */}
              {brands.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      📌 공식 브랜드
                    </span>
                  </div>
                  <ul>
                    {brands.map((brand) => (
                      <li key={brand.page_id}>
                        <button
                          type="button"
                          onClick={() => handleSelect(brand)}
                          className="flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-50 transition text-left"
                        >
                          {/* 프로필 이미지 */}
                          {brand.image_uri ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={brand.image_uri}
                              alt={brand.page_name}
                              className="h-8 w-8 rounded-full object-cover shrink-0 bg-gray-100"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                              <Building2 className="h-4 w-4 text-gray-400" />
                            </div>
                          )}

                          {/* 브랜드 정보 */}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {brand.page_name}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-gray-400 truncate">
                              {brand.ig_username && (
                                <span>@{brand.ig_username}</span>
                              )}
                              {brand.ig_username && brand.likes != null && (
                                <span>·</span>
                              )}
                              {brand.likes != null && (
                                <span>👍 {formatLikes(brand.likes)}</span>
                              )}
                              {(brand.ig_username || brand.likes != null) &&
                                brand.category && <span>·</span>}
                              {brand.category && <span>{brand.category}</span>}
                            </div>
                          </div>

                          {/* 핀 등록 버튼 */}
                          {onPinBrand && (
                            <button
                              type="button"
                              onClick={(e) => handlePin(e, brand)}
                              className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-[#F75D5D] hover:bg-red-50 transition"
                              title="모니터링 등록"
                            >
                              <Pin className="h-4 w-4" />
                            </button>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 🔗 URL로 광고하는 페이지 섹션 */}
              {adPages.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 border-t">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      🔗 이 키워드로 광고하는 페이지 ({adPages.length}개)
                    </span>
                  </div>
                  <ul>
                    {adPages.map((adPage) => (
                      <li key={adPage.page_id}>
                        <button
                          type="button"
                          onClick={() => handleAdPageSelect(adPage)}
                          className="flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-50 transition text-left"
                        >
                          {/* 링크 아이콘 */}
                          <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                            <Link2 className="h-4 w-4 text-blue-500" />
                          </div>

                          {/* 페이지 정보 */}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {adPage.page_name}
                            </div>
                            <div className="text-xs text-gray-400">
                              광고 {adPage.ad_count}건
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
