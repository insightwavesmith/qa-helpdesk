"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { CompetitorMonitor, MetaPage } from "@/types/competitor";
import { X, Search, Loader2 } from "lucide-react";

interface AddMonitorDialogProps {
  onClose: () => void;
  onAdded: (monitor: CompetitorMonitor) => void;
  searchQuery: string;
}

/** 첫 글자 아바타 fallback */
function LetterAvatar({
  name,
  size = 32,
}: {
  name: string;
  size?: number;
}) {
  const letter = name.charAt(0).toUpperCase();
  return (
    <div
      className="flex items-center justify-center rounded-full bg-[#F75D5D]/10 text-[#F75D5D] font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {letter}
    </div>
  );
}

/** 프로필 이미지 (onError 시 아바타 fallback) */
function PageProfileImage({
  src,
  name,
  size = 32,
}: {
  src: string;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <LetterAvatar name={name} size={size} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      className="rounded-full shrink-0 object-cover"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
    />
  );
}

export function AddMonitorDialog({
  onClose,
  onAdded,
  searchQuery,
}: AddMonitorDialogProps) {
  const [brandName, setBrandName] = useState(searchQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 페이지 검색 관련 상태
  const [searchResults, setSearchResults] = useState<MetaPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<MetaPage | null>(null);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchError, setSearchError] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 디바운스 검색
  const searchPages = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    setSearching(true);
    setSearchError("");

    try {
      const res = await fetch(
        `/api/competitor/pages?q=${encodeURIComponent(query.trim())}`,
      );
      const json = await res.json();

      if (!res.ok) {
        setSearchError(json.error || "검색에 실패했습니다");
        setSearchResults([]);
      } else {
        setSearchResults(json.pages ?? []);
      }
      setShowDropdown(true);
    } catch {
      setSearchError("네트워크 오류가 발생했습니다");
      setSearchResults([]);
      setShowDropdown(true);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setBrandName(value);
    setError("");

    // 페이지 선택 해제
    if (selectedPage) {
      setSelectedPage(null);
    }

    // 디바운스 300ms
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        searchPages(value);
      }, 300);
    } else {
      setSearchResults([]);
      setShowDropdown(false);
    }
  };

  const handleSelectPage = (page: MetaPage) => {
    setSelectedPage(page);
    setBrandName(page.pageName);
    setShowDropdown(false);
    setSearchResults([]);
  };

  const handleClearSelection = () => {
    setSelectedPage(null);
    setBrandName("");
  };

  const handleSubmit = async () => {
    const name = selectedPage ? selectedPage.pageName : brandName.trim();
    if (!name) {
      setError("브랜드명을 입력하세요");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/competitor/monitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: name,
          pageId: selectedPage?.pageId ?? null,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "등록에 실패했습니다");
        return;
      }

      onAdded(json.monitor);
    } catch {
      setError("네트워크 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">
            브랜드 모니터링 추가
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          {/* 선택된 페이지 칩 */}
          {!!selectedPage && (
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5">
              <PageProfileImage
                src={selectedPage.profileImageUrl}
                name={selectedPage.pageName}
                size={20}
              />
              <span className="text-sm font-medium text-gray-900 truncate">
                {selectedPage.pageName}
              </span>
              <button
                type="button"
                onClick={handleClearSelection}
                className="ml-auto text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* 검색 입력 */}
          <div className="relative" ref={dropdownRef}>
            <label
              className="text-sm font-medium text-gray-700"
              htmlFor="monitor-brand-name"
            >
              브랜드명
            </label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                id="monitor-brand-name"
                type="text"
                value={brandName}
                onChange={(e) => handleInputChange(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setShowDropdown(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setShowDropdown(false);
                    handleSubmit();
                  }
                }}
                placeholder="브랜드명을 검색하세요"
                className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D]/30 focus:border-[#F75D5D]"
                autoFocus
                autoComplete="off"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
              )}
            </div>

            {/* 드롭다운 결과 */}
            {showDropdown && !selectedPage && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                {searchError ? (
                  <div className="px-4 py-3 text-sm text-red-500">
                    {searchError}
                  </div>
                ) : searching ? (
                  <div className="px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    검색 중...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500">
                    검색 결과가 없습니다
                  </div>
                ) : (
                  searchResults.map((page) => (
                    <button
                      key={page.pageId}
                      type="button"
                      onClick={() => handleSelectPage(page)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition text-left"
                    >
                      <PageProfileImage
                        src={page.profileImageUrl}
                        name={page.pageName}
                        size={32}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {page.pageName}
                        </div>
                        <div className="text-xs text-gray-400 truncate">
                          {page.pageId}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {!!error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || (!brandName.trim() && !selectedPage)}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#F75D5D] hover:bg-[#E54949] rounded-xl transition disabled:opacity-50"
            >
              {loading ? "등록 중..." : "등록"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
