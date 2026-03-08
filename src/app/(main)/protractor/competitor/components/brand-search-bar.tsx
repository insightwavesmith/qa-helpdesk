"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, X, Pin, Building2, Loader2 } from "lucide-react";
import type { BrandPage } from "@/types/competitor";

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
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 브랜드 검색 API 호출
  const searchBrands = useCallback(async (q: string) => {
    if (!q.trim()) {
      setBrands([]);
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
      } else {
        setBrands(json.brands ?? []);
      }
      setShowDropdown(true);
    } catch {
      setError("네트워크 오류가 발생했습니다");
      setBrands([]);
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
            if (brands.length > 0 || error) setShowDropdown(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="브랜드명 또는 URL을 입력하세요 (예: 올리브영, instagram.com/oliveyoung)"
          className="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D]/30 focus:border-[#F75D5D] transition"
          disabled={loading}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setBrands([]);
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
        <div className="absolute z-20 top-full mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden max-h-[360px] overflow-y-auto">
          {error ? (
            <div className="px-4 py-6 text-center text-sm text-red-500">
              {error}
            </div>
          ) : searching ? (
            <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>검색 중...</span>
            </div>
          ) : brands.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              검색 결과가 없습니다
            </div>
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
}
