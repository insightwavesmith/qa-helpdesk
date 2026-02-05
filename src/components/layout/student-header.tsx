"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Search,
  X,
  LogOut,
  Settings,
  Clock,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeModeToggle } from "./theme-toggle";
import { createClient } from "@/lib/supabase/client";
import { searchQuestions } from "@/actions/search";

interface StudentHeaderProps {
  userName: string;
  userEmail: string;
}

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

export function StudentHeader({ userName, userEmail }: StudentHeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const initials = userName.charAt(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchOpen) {
      setRecentSearches(getRecentSearches());
    }
  }, [searchOpen]);

  // Click outside to close dropdown
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

  const handleAutoComplete = useCallback(async (value: string) => {
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
  }, []);

  const handleInputChange = (value: string) => {
    setSearchQuery(value);
    setShowDropdown(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleAutoComplete(value), 300);
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      saveRecentSearch(searchQuery.trim());
      router.push(
        `/questions?search=${encodeURIComponent(searchQuery.trim())}`
      );
      setSearchOpen(false);
      setSearchQuery("");
      setShowDropdown(false);
    }
  };

  const handleResultClick = (r: SearchResult) => {
    saveRecentSearch(r.title);
    setSearchOpen(false);
    setSearchQuery("");
    setShowDropdown(false);
    router.push(`/questions/${r.id}`);
  };

  const handleRecentClick = (term: string) => {
    saveRecentSearch(term);
    setSearchOpen(false);
    setSearchQuery("");
    setShowDropdown(false);
    router.push(`/questions?search=${encodeURIComponent(term)}`);
  };

  const navItems = [
    { label: "홈", href: "/dashboard" },
    { label: "Q&A", href: "/questions" },
    { label: "정보공유", href: "/posts" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-[720px] px-4">
        {/* Main header row */}
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2 shrink-0"
          >
            <img
              src="/logo.png"
              alt="BS CAMP"
              className="h-8 w-8 rounded-lg object-cover"
            />
            <span className="font-semibold text-base hidden sm:inline">
              BS CAMP
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? "text-foreground bg-accent"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setSearchOpen(!searchOpen);
                setShowDropdown(false);
                setSearchQuery("");
                setResults([]);
              }}
            >
              <Search className="h-4 w-4" />
              <span className="sr-only">검색</span>
            </Button>

            <ThemeModeToggle />

            {/* Profile dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 gap-1.5 px-2"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline text-sm font-medium">
                    {userName}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{userName}</p>
                    <p className="text-xs text-muted-foreground">{userEmail}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  설정
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Search bar (expandable) with autocomplete */}
        {searchOpen && (
          <div className="pb-3" ref={dropdownRef}>
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                placeholder="질문 검색..."
                value={searchQuery}
                onChange={(e) => handleInputChange(e.target.value)}
                onFocus={() => setShowDropdown(true)}
                className="w-full h-10 pl-9 pr-9 rounded-lg border bg-background text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all placeholder:text-muted-foreground/60"
              />
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery("");
                  setShowDropdown(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </form>

            {/* Autocomplete dropdown */}
            {showDropdown && (
              <div className="mt-1 bg-background border rounded-lg shadow-lg overflow-hidden">
                {/* Recent searches (when empty query) */}
                {searchQuery.trim().length === 0 &&
                  recentSearches.length > 0 && (
                    <div className="p-2">
                      <span className="text-xs font-medium text-muted-foreground px-2">
                        최근 검색
                      </span>
                      {recentSearches.map((term, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleRecentClick(term)}
                          className="flex items-center gap-2 w-full px-2 py-2 text-sm text-left rounded-md hover:bg-muted/50 transition-colors"
                        >
                          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="line-clamp-1">{term}</span>
                        </button>
                      ))}
                    </div>
                  )}

                {/* Search results */}
                {searchQuery.trim().length > 0 && (
                  <div className="p-1.5">
                    {isSearching ? (
                      <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
                        검색 중...
                      </div>
                    ) : results.length > 0 ? (
                      <>
                        {results.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => handleResultClick(r)}
                            className="flex items-center gap-2 w-full px-2 py-2 text-left rounded-md hover:bg-muted/50 transition-colors"
                          >
                            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm line-clamp-1">{r.title}</p>
                              {r.category && (
                                <p className="text-[11px] text-muted-foreground">
                                  {(r.category as { name: string }).name}
                                </p>
                              )}
                            </div>
                            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          </button>
                        ))}
                      </>
                    ) : (
                      <div className="text-center py-3 text-xs text-muted-foreground">
                        검색 결과가 없습니다
                      </div>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {searchQuery.trim().length === 0 &&
                  recentSearches.length === 0 && (
                    <div className="text-center py-3 text-xs text-muted-foreground">
                      질문을 검색해 보세요
                    </div>
                  )}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
