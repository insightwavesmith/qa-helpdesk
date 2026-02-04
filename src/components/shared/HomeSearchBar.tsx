"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, Clock, X } from "lucide-react";
import { searchQuestions } from "@/actions/search";

interface SearchResult {
  id: string;
  title: string;
  status: string;
  category?: { name: string; slug: string } | null;
}

const RECENT_SEARCHES_KEY = "qa-recent-searches";

function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  if (typeof window === "undefined") return;
  const searches = getRecentSearches();
  const filtered = searches.filter((s) => s !== query);
  filtered.unshift(query);
  localStorage.setItem(
    RECENT_SEARCHES_KEY,
    JSON.stringify(filtered.slice(0, 5))
  );
}

function clearRecentSearches() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(RECENT_SEARCHES_KEY);
}

export function HomeSearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = useCallback(
    async (value: string) => {
      if (value.trim().length < 1) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const { data } = await searchQuestions(value, 5);
        setResults(data as SearchResult[]);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    []
  );

  const handleInputChange = (value: string) => {
    setQuery(value);
    setIsOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleSearch(value), 300);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      saveRecentSearch(query.trim());
      router.push(`/questions?search=${encodeURIComponent(query.trim())}`);
      setIsOpen(false);
    }
  };

  const handleResultClick = (q: SearchResult) => {
    saveRecentSearch(q.title);
    setIsOpen(false);
    router.push(`/questions/${q.id}`);
  };

  const handleRecentClick = (term: string) => {
    setQuery(term);
    setIsOpen(false);
    router.push(`/questions?search=${encodeURIComponent(term)}`);
  };

  const handleClearRecent = () => {
    clearRecentSearches();
    setRecentSearches([]);
  };

  const showDropdown =
    isOpen && (query.trim().length > 0 || recentSearches.length > 0);

  return (
    <div ref={containerRef} className="relative max-w-lg mx-auto">
      <form onSubmit={handleSubmit} className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <input
          type="text"
          placeholder="메타 광고, ROAS, 캠페인 설정 등 검색..."
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          className="w-full h-12 sm:h-14 pl-12 pr-12 rounded-2xl border-2 border-muted bg-background text-base shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all placeholder:text-muted-foreground/60"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-background border rounded-xl shadow-lg z-50 overflow-hidden">
          {/* Recent searches */}
          {query.trim().length === 0 && recentSearches.length > 0 && (
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">
                  최근 검색
                </span>
                <button
                  onClick={handleClearRecent}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  전체 삭제
                </button>
              </div>
              {recentSearches.map((term, idx) => (
                <button
                  key={idx}
                  onClick={() => handleRecentClick(term)}
                  className="flex items-center gap-2 w-full px-2 py-2 text-sm text-left rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="line-clamp-1">{term}</span>
                </button>
              ))}
            </div>
          )}

          {/* Search results */}
          {query.trim().length > 0 && (
            <div className="p-2">
              {isSearching ? (
                <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                  검색 중...
                </div>
              ) : results.length > 0 ? (
                <>
                  {results.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => handleResultClick(r)}
                      className="flex items-center gap-3 w-full px-3 py-2.5 text-left rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-1">
                          {r.title}
                        </p>
                        {r.category && (
                          <p className="text-xs text-muted-foreground">
                            {(r.category as { name: string }).name}
                          </p>
                        )}
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                  <button
                    onClick={handleSubmit as () => void}
                    className="flex items-center justify-center w-full px-3 py-2 mt-1 text-sm text-primary font-medium rounded-lg hover:bg-primary/5 transition-colors border-t"
                  >
                    &ldquo;{query}&rdquo; 전체 검색
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center py-4 text-sm text-muted-foreground">
                  <p>검색 결과가 없습니다</p>
                  <button
                    onClick={handleSubmit as () => void}
                    className="text-primary text-xs mt-1 hover:underline"
                  >
                    Q&A에서 검색하기 →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
