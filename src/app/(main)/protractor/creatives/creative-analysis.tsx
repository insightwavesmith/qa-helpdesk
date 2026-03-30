"use client";

import { useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import useSWR from "swr";
import { CreativeDetailPanel } from "./components/individual/creative-detail-panel";
import { PortfolioTabV2 } from "./components/portfolio/portfolio-tab-v2";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  Image as ImageIcon,
  Search,
  X,
  Filter,
} from "lucide-react";
import { jsonFetcher } from "@/lib/swr/config";

// ── 타입 ──────────────────────────────────────────────────────────

interface AdAccountItem {
  account_id: string;
  account_name: string | null;
  [key: string]: unknown;
}

interface CreativeAnalysisProps {
  initialAccounts: AdAccountItem[];
}

interface IntelligenceScore {
  id: string;
  ad_id: string;
  account_id: string;
  overall_score: number | null;
  visual_impact: number | null;
  message_clarity: number | null;
  cta_effectiveness: number | null;
  social_proof: number | null;
  lp_consistency: number | null;
  suggestions: SuggestionItem[] | null;
  media_url?: string | null;
  ad_copy?: string | null;
  roas?: number | null;
  ctr?: number | null;
  hook_type?: string | null;
  style?: string | null;
  created_at: string;
}

interface SuggestionItem {
  priority: "high" | "medium" | "low";
  area: string;
  current: string;
  suggestion: string;
}

interface BenchmarkRow {
  element_type: string;
  element_value: string;
  avg_roas: number | null;
  sample_count: number;
}

interface BenchmarkResponse {
  element_type: string;
  total: number;
  benchmarks: Record<string, BenchmarkRow[]>;
}

interface LpConsistencyRow {
  ad_id: string;
  visual_score: number | null;
  semantic_score: number | null;
  cross_score: number | null;
  total_score: number | null;
}

interface LpConsistencyResponse {
  account_id: string;
  total: number;
  avg_score: number | null;
  results: LpConsistencyRow[];
}

interface IntelligenceResponse {
  account_id: string;
  total: number;
  results: IntelligenceScore[];
}

interface CreativeSearchResult {
  id: string;
  ad_id: string;
  brand_name: string | null;
  source: string;
  media_url: string | null;
  ad_copy: string | null;
  lp_url: string | null;
  creative_type: string | null;
  roas: number | null;
  ctr: number | null;
  similarity: number;
}

// ── 상수 ──────────────────────────────────────────────────────────

const SCORE_COLORS = (score: number) => {
  if (score >= 80) return "bg-emerald-100 text-emerald-700";
  if (score >= 50) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
};

// ── 메인 컴포넌트 ──────────────────────────────────────────────────

export default function CreativeAnalysis({
  initialAccounts,
}: CreativeAnalysisProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // URL searchParams에서 초기 계정 ID 읽기, 없으면 첫 번째 계정
  const accountIdFromUrl = searchParams.get("account_id");
  const initialAccountId =
    accountIdFromUrl &&
    initialAccounts.some((a) => a.account_id === accountIdFromUrl)
      ? accountIdFromUrl
      : initialAccounts[0]?.account_id || "";

  const [selectedAccountId, setSelectedAccountId] = useState(initialAccountId);

  const handleAccountSelect = useCallback(
    (accountId: string) => {
      setSelectedAccountId(accountId);
      const params = new URLSearchParams(searchParams.toString());
      params.set("account_id", accountId);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname]
  );

  // SWR 데이터
  const { data: intelligenceData, isLoading: intelligenceLoading } =
    useSWR<IntelligenceResponse>(
      selectedAccountId
        ? `/api/admin/creative-intelligence?account_id=${selectedAccountId}`
        : null,
      jsonFetcher
    );

  const { data: benchmarkData } = useSWR<BenchmarkResponse>(
    `/api/admin/creative-benchmark`,
    jsonFetcher
  );

  const { data: consistencyData } = useSWR<LpConsistencyResponse>(
    selectedAccountId
      ? `/api/admin/creative-lp-consistency?account_id=${selectedAccountId}`
      : null,
    jsonFetcher
  );

  const selectedAccount = initialAccounts.find(
    (a) => a.account_id === selectedAccountId
  );

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">소재 분석</h1>
          <p className="mt-1 text-sm text-gray-500">
            AI 분석 점수, 요소 구성, LP 일관성을 확인하세요
          </p>
        </div>
        {/* 계정 선택 */}
        {initialAccounts.length > 0 && (
          <Select
            value={selectedAccountId}
            onValueChange={handleAccountSelect}
          >
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="광고계정을 선택하세요" />
            </SelectTrigger>
            <SelectContent>
              {initialAccounts.map((acc) => (
                <SelectItem key={acc.account_id} value={acc.account_id}>
                  {acc.account_name || acc.account_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* 서브탭 */}
      <Tabs defaultValue="individual" className="space-y-6">
        <TabsList className="bg-gray-100">
          <TabsTrigger value="individual">개별 소재</TabsTrigger>
          <TabsTrigger value="portfolio">포트폴리오</TabsTrigger>
          <TabsTrigger value="competitor">경쟁사 비교</TabsTrigger>
        </TabsList>

        {/* ── 개별 소재 탭 ─────────────────────────────────── */}
        <TabsContent value="individual">
          <IndividualTab
            intelligenceData={intelligenceData}
            intelligenceLoading={intelligenceLoading}
            benchmarkData={benchmarkData}
            consistencyData={consistencyData}
            accountName={selectedAccount?.account_name || selectedAccountId}
          />
        </TabsContent>

        {/* ── 포트폴리오 탭 (v2) ────────────────────────────── */}
        <TabsContent value="portfolio">
          <PortfolioTabV2
            intelligenceData={intelligenceData}
            intelligenceLoading={intelligenceLoading}
            benchmarkData={benchmarkData}
            accountId={selectedAccountId}
          />
        </TabsContent>

        {/* ── 경쟁사 비교 탭 ────────────────────────────────── */}
        <TabsContent value="competitor">
          <CompetitorTab intelligenceData={intelligenceData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── 개별 소재 탭 ──────────────────────────────────────────────────

function IndividualTab({
  intelligenceData,
  intelligenceLoading,
}: {
  intelligenceData: IntelligenceResponse | undefined;
  intelligenceLoading: boolean;
  benchmarkData?: BenchmarkResponse | undefined;
  consistencyData?: LpConsistencyResponse | undefined;
  accountName?: string;
}) {
  const [selectedCreativeId, setSelectedCreativeId] = useState<string | null>(
    null
  );
  // 검색 상태
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    CreativeSearchResult[] | null
  >(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const res = await fetch("/api/creative/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery.trim(),
          limit: 30,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "검색 실패");
      }
      const d = await res.json();
      setSearchResults(d.results || []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "검색 중 오류 발생");
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults(null);
    setSearchError(null);
  }, []);

  // 소재 목록 결정 (검색 결과 우선)
  const baseResults: IntelligenceScore[] = intelligenceData?.results ?? [];

  const selectedCreative =
    baseResults.find((r) => r.ad_id === selectedCreativeId) ?? null;

  return (
    <div className="space-y-4">
      {/* 검색바 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="소재 검색 (예: 봄 신상 원피스)"
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D]/30 focus:border-[#F75D5D]"
          />
        </div>
        {searchResults && (
          <button
            onClick={clearSearch}
            className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-500 hover:bg-gray-50"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={handleSearch}
          disabled={searchLoading || !searchQuery.trim()}
          className="px-5 py-2.5 bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {searchLoading ? "검색 중..." : "검색"}
        </button>
      </div>

      {searchError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {searchError}
        </div>
      )}

      {/* 정렬 (검색 결과가 없을 때만) */}
      {!searchResults && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {intelligenceLoading
              ? "로딩 중..."
              : `총 ${baseResults.length}개 소재`}
          </p>
        </div>
      )}

      {/* 메인 레이아웃: 카드 그리드 + 상세 패널 */}
      <div className="flex gap-6">
        {/* 좌측: 카드 그리드 */}
        <div
          className={`${selectedCreative ? "w-1/2 lg:w-2/5" : "w-full"} overflow-y-auto`}
        >
          {intelligenceLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-2xl" />
              ))}
            </div>
          ) : searchResults ? (
            /* 검색 결과 카드 */
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {searchResults.length === 0 ? (
                <div className="col-span-full text-center py-12 text-gray-400">
                  <Search className="mx-auto h-8 w-8 mb-2" />
                  <p className="text-sm">검색 결과가 없습니다</p>
                </div>
              ) : (
                searchResults.map((item) => (
                  <SearchResultCard key={item.id} item={item} />
                ))
              )}
            </div>
          ) : baseResults.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <ImageIcon className="mx-auto h-10 w-10 mb-3" />
              <p className="text-sm">분석된 소재가 없습니다</p>
              <p className="text-xs mt-1">
                소재 인텔리전스 분석 후 결과가 표시됩니다
              </p>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
              {(baseResults).map((item) => (
                <div key={item.id} className="min-w-[280px] max-w-[320px] snap-center flex-shrink-0">
                  <CreativeCard
                    item={item}
                    isSelected={selectedCreativeId === item.ad_id}
                    onClick={() =>
                      setSelectedCreativeId(
                        selectedCreativeId === item.ad_id ? null : item.ad_id
                      )
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 우측: 풀분석 패널 (v2) */}
        {selectedCreative && (
          <div className="flex-1 min-w-0">
            <CreativeDetailPanel
              creativeId={selectedCreative.id}
              accountId={selectedCreative.account_id}
              onClose={() => setSelectedCreativeId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── 소재 카드 ─────────────────────────────────────────────────────

function CreativeCard({
  item,
  isSelected,
  onClick,
}: {
  item: IntelligenceScore;
  isSelected: boolean;
  onClick: () => void;
}) {
  const score = item.overall_score ?? 0;

  return (
    <button
      onClick={onClick}
      className={`text-left bg-white rounded-2xl border overflow-hidden hover:shadow-md cursor-pointer transition-all ${
        isSelected
          ? "border-[#F75D5D] shadow-md ring-1 ring-[#F75D5D]/20"
          : "border-gray-200"
      }`}
    >
      {/* 이미지 */}
      <div className="aspect-square bg-gray-100 relative">
        {item.media_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.media_url}
            alt={item.ad_copy?.slice(0, 30) || "소재 이미지"}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
        {/* L4 점수 배지 */}
        <span
          className={`absolute top-2 right-2 px-2 py-0.5 text-xs font-bold rounded-full ${SCORE_COLORS(score)}`}
        >
          {score}점
        </span>
      </div>
      {/* 카드 하단 */}
      <div className="p-3">
        <p className="text-sm text-gray-700 line-clamp-2">
          {item.ad_copy || "카피 없음"}
        </p>
        <div className="flex gap-3 mt-1.5 text-xs text-gray-500">
          {item.roas != null && (
            <span>
              ROAS <strong className="text-gray-900">{item.roas.toFixed(1)}</strong>
            </span>
          )}
          {item.ctr != null && (
            <span>
              CTR{" "}
              <strong className="text-gray-900">
                {(item.ctr * 100).toFixed(1)}%
              </strong>
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── 검색 결과 카드 ────────────────────────────────────────────────

function SearchResultCard({ item }: { item: CreativeSearchResult }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      <div className="aspect-square bg-gray-100 relative">
        {item.media_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.media_url}
            alt={item.ad_copy?.slice(0, 30) || "소재 이미지"}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
        <span className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full">
          {(item.similarity * 100).toFixed(0)}%
        </span>
        <span
          className={`absolute top-2 left-2 px-2 py-0.5 text-xs rounded-full ${
            item.source === "own"
              ? "bg-blue-100 text-blue-700"
              : "bg-orange-100 text-orange-700"
          }`}
        >
          {item.source === "own" ? "자사" : "경쟁사"}
        </span>
      </div>
      <div className="p-3">
        <p className="text-sm text-gray-700 line-clamp-2">
          {item.ad_copy || "카피 없음"}
        </p>
        <div className="flex gap-3 mt-1.5 text-xs text-gray-500">
          {item.roas != null && (
            <span>
              ROAS{" "}
              <strong className="text-gray-900">{item.roas.toFixed(1)}</strong>
            </span>
          )}
          {item.ctr != null && (
            <span>
              CTR{" "}
              <strong className="text-gray-900">
                {(item.ctr * 100).toFixed(1)}%
              </strong>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 포트폴리오 탭 ─────────────────────────────────────────────────

function PortfolioTab({
  intelligenceData,
  intelligenceLoading,
  benchmarkData,
}: {
  intelligenceData: IntelligenceResponse | undefined;
  intelligenceLoading: boolean;
  benchmarkData: BenchmarkResponse | undefined;
}) {
  const results = intelligenceData?.results ?? [];

  // 집계
  const totalCount = results.length;
  const avgScore =
    totalCount > 0
      ? Math.round(
          results.reduce((s, r) => s + (r.overall_score ?? 0), 0) / totalCount
        )
      : null;
  const avgRoas =
    totalCount > 0
      ? results.reduce((s, r) => s + (r.roas ?? 0), 0) / totalCount
      : null;

  // 점수 분포 히스토그램 (0-20, 20-40, 40-60, 60-80, 80-100)
  const scoreBuckets = [
    { label: "0-20", min: 0, max: 20, count: 0 },
    { label: "20-40", min: 20, max: 40, count: 0 },
    { label: "40-60", min: 40, max: 60, count: 0 },
    { label: "60-80", min: 60, max: 80, count: 0 },
    { label: "80-100", min: 80, max: 100, count: 0 },
  ];
  for (const r of results) {
    const score = r.overall_score ?? 0;
    const bucket = scoreBuckets.find(
      (b) => score >= b.min && score < b.max + (b.max === 100 ? 1 : 0)
    );
    if (bucket) bucket.count++;
  }
  const maxBucketCount = Math.max(...scoreBuckets.map((b) => b.count), 1);

  // 벤치마크
  const hookBenchmarks: BenchmarkRow[] =
    benchmarkData?.benchmarks?.hook_type ?? [];
  const styleBenchmarks: BenchmarkRow[] =
    benchmarkData?.benchmarks?.style ?? [];
  const maxHookRoas = Math.max(
    ...hookBenchmarks.map((b) => b.avg_roas ?? 0),
    1
  );
  const maxStyleRoas = Math.max(
    ...styleBenchmarks.map((b) => b.avg_roas ?? 0),
    1
  );
  const topHook = hookBenchmarks[0];
  const topStyle = styleBenchmarks[0];

  if (intelligenceLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 요약 카드 4개 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard label="평균 L4 점수" value={avgScore != null ? `${avgScore}점` : "-"} />
        <SummaryCard label="총 소재 수" value={`${totalCount}개`} />
        <SummaryCard
          label="평균 ROAS"
          value={avgRoas != null ? avgRoas.toFixed(2) : "-"}
        />
        <SummaryCard
          label="80점 이상 소재"
          value={`${scoreBuckets[4].count}개`}
          highlight={scoreBuckets[4].count > 0}
        />
      </div>

      {/* L4 점수 분포 히스토그램 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-4">L4 점수 분포</h3>
        <div className="flex items-end gap-2 h-32">
          {scoreBuckets.map((b) => (
            <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-gray-500">{b.count}</span>
              <div
                className="w-full rounded-t-md bg-[#F75D5D] opacity-80 min-h-[4px] transition-all"
                style={{
                  height: `${Math.max(4, (b.count / maxBucketCount) * 100)}px`,
                }}
              />
              <span className="text-[10px] text-gray-400">{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 요소 분포 — hook_type */}
      {hookBenchmarks.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">
            훅 유형별 평균 ROAS
          </h3>
          <div className="space-y-2.5">
            {hookBenchmarks.slice(0, 8).map((b) => (
              <div key={b.element_value}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-gray-700">{b.element_value}</span>
                  <span className="text-gray-500">
                    ROAS {b.avg_roas?.toFixed(1) ?? "-"} (n={b.sample_count})
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#F75D5D] rounded-full"
                    style={{
                      width: `${((b.avg_roas ?? 0) / maxHookRoas) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 요소 분포 — style */}
      {styleBenchmarks.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">
            스타일별 평균 ROAS
          </h3>
          <div className="space-y-2.5">
            {styleBenchmarks.slice(0, 8).map((b) => (
              <div key={b.element_value}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-gray-700">{b.element_value}</span>
                  <span className="text-gray-500">
                    ROAS {b.avg_roas?.toFixed(1) ?? "-"} (n={b.sample_count})
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#F75D5D] rounded-full"
                    style={{
                      width: `${((b.avg_roas ?? 0) / maxStyleRoas) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 벤치마크 인사이트 */}
      {(topHook || topStyle) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <h3 className="font-semibold text-amber-800 mb-3">
            벤치마크 인사이트
          </h3>
          <div className="space-y-2 text-sm text-amber-700">
            {topHook && (
              <p>
                최고 성과 훅 유형:{" "}
                <strong>{topHook.element_value}</strong> (평균 ROAS{" "}
                {topHook.avg_roas?.toFixed(1)})
              </p>
            )}
            {topStyle && (
              <p>
                최고 성과 스타일:{" "}
                <strong>{topStyle.element_value}</strong> (평균 ROAS{" "}
                {topStyle.avg_roas?.toFixed(1)})
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 경쟁사 비교 탭 ────────────────────────────────────────────────

function CompetitorTab({
  intelligenceData,
}: {
  intelligenceData: IntelligenceResponse | undefined;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CreativeSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState<"" | "IMAGE" | "VIDEO">("");

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/creative/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          source: "competitor",
          limit: 30,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "검색 실패");
      }
      const d = await res.json();
      setResults(d.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "검색 중 오류 발생");
    } finally {
      setLoading(false);
    }
  }, [query]);

  // 자사 소재 수
  const ownCount = intelligenceData?.total ?? 0;

  // 필터 적용
  const filteredResults = results.filter((r) => {
    if (filterType && r.creative_type !== filterType) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 경고 배너 */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-700">
          <p className="font-medium mb-0.5">안내</p>
          <p>
            경쟁사 소재는 성과 데이터(ROAS/CTR)가 없습니다. 구조 및 텍스트
            비교만 가능합니다.
          </p>
        </div>
      </div>

      {/* 자사 vs 경쟁사 현황 */}
      <div className="grid grid-cols-2 gap-4">
        <SummaryCard label="자사 소재 (분석 완료)" value={`${ownCount}개`} />
        <SummaryCard label="검색된 경쟁사 소재" value={`${results.length}개`} />
      </div>

      {/* 검색바 */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="경쟁사 소재 검색 (예: 봄 신상 원피스)"
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D]/30 focus:border-[#F75D5D]"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2.5 border rounded-lg text-sm ${
              showFilters
                ? "border-[#F75D5D] text-[#F75D5D] bg-red-50"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Filter className="h-4 w-4" />
          </button>
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="px-5 py-2.5 bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "검색 중..." : "검색"}
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                소재 유형
              </label>
              <select
                value={filterType}
                onChange={(e) =>
                  setFilterType(e.target.value as "" | "IMAGE" | "VIDEO")
                }
                className="px-3 py-1.5 border border-gray-200 rounded text-sm"
              >
                <option value="">전체</option>
                <option value="IMAGE">이미지</option>
                <option value="VIDEO">동영상</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 결과 그리드 */}
      {filteredResults.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredResults.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="aspect-square bg-gray-100 relative">
                {item.media_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.media_url}
                    alt={item.ad_copy?.slice(0, 30) || "소재 이미지"}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <ImageIcon className="h-10 w-10" />
                  </div>
                )}
                <span className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full">
                  {(item.similarity * 100).toFixed(0)}% 유사
                </span>
              </div>
              <div className="p-3 space-y-1.5">
                <p className="text-sm text-gray-700 line-clamp-2">
                  {item.ad_copy || "카피 없음"}
                </p>
                {item.brand_name && (
                  <p className="text-xs text-gray-400">{item.brand_name}</p>
                )}
                <div className="flex gap-1.5 text-xs text-gray-500">
                  {item.creative_type && (
                    <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">
                      {item.creative_type}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && results.length === 0 && query && (
        <div className="text-center py-16 text-gray-400">
          <Search className="mx-auto h-10 w-10 mb-3" />
          <p>검색 결과가 없습니다</p>
        </div>
      )}

      {!query && results.length === 0 && (
        <div className="text-center py-16 text-gray-300">
          <Search className="mx-auto h-12 w-12 mb-3" />
          <p className="text-sm text-gray-400">
            검색어를 입력하여 경쟁사 소재를 찾아보세요
          </p>
        </div>
      )}
    </div>
  );
}

// ── 공통 서브 컴포넌트 ────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${highlight ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-white"}`}
    >
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p
        className={`text-2xl font-bold ${highlight ? "text-emerald-700" : "text-gray-900"}`}
      >
        {value}
      </p>
    </div>
  );
}
