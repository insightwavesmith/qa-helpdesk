"use client";

import { useState, useCallback } from "react";
import { Search, X, Clock } from "lucide-react";

const HISTORY_KEY = "competitor-search-history";
const MAX_HISTORY = 5;

interface SearchBarProps {
  onSearch: (query: string) => void;
  loading?: boolean;
}

function getHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveHistory(query: string) {
  const prev = getHistory().filter((h) => h !== query);
  const next = [query, ...prev].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

export function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<string[]>(() => getHistory());

  const handleSubmit = useCallback(
    (q?: string) => {
      const searchQuery = (q ?? query).trim();
      if (!searchQuery || loading) return;
      saveHistory(searchQuery);
      setHistory(getHistory());
      setShowHistory(false);
      onSearch(searchQuery);
    },
    [query, loading, onSearch],
  );

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => history.length > 0 && setShowHistory(true)}
            onBlur={() => setTimeout(() => setShowHistory(false), 200)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="브랜드명 또는 키워드를 입력하세요"
            className="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D]/30 focus:border-[#F75D5D] transition"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={loading || !query.trim()}
          className="px-6 py-3 bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-xl text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {loading ? "검색 중..." : "검색"}
        </button>
      </div>

      {/* 검색 히스토리 드롭다운 */}
      {showHistory && history.length > 0 && (
        <div className="absolute z-10 top-full mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
          <div className="px-3 py-2 text-xs text-gray-400 font-medium">최근 검색</div>
          {history.map((item) => (
            <button
              key={item}
              type="button"
              onMouseDown={() => {
                setQuery(item);
                handleSubmit(item);
              }}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
