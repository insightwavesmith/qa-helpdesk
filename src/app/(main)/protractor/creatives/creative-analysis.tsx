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
  Filter,
} from "lucide-react";
import { jsonFetcher } from "@/lib/swr/config";
import type { AnalysisJsonV3 } from "@/types/prescription";

// ── 타입 ──────────────────────────────────────────────────────────

interface AdAccountItem {
  account_id: string;
  account_name: string | null;
  [key: string]: unknown;
}

interface CreativeAnalysisProps {
  initialAccounts: AdAccountItem[];
}

/** API /api/admin/creative-intelligence 실제 응답 항목 */
interface CreativeIntelligenceItem {
  id: string;
  ad_id: string;
  analysis_json: AnalysisJsonV3 | null;
  media_url: string | null;
  ad_copy: string | null;
  media_type: string | null;
  lp_url: string | null;
  roas: number | null;
  spend: number | null;
  revenue: number | null;
  has_analysis: boolean;
  period: number;
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
  period: number;
  results: CreativeIntelligenceItem[];
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

/** analysis_json에서 포트폴리오용 flat 데이터 추출 */
interface PortfolioCreativeItem {
  id: string;
  overall_score: number | null;
  roas: number | null;
  hook_type: string | null;
  style: string | null;
  visual_impact: number | null;
  message_clarity: number | null;
  cta_effectiveness: number | null;
  social_proof: number | null;
}

function toPortfolioItems(items: CreativeIntelligenceItem[]): PortfolioCreativeItem[] {
  return items.map((item) => ({
    id: item.id,
    overall_score: item.analysis_json?.scores?.overall ?? null,
    roas: item.roas,
    hook_type: item.analysis_json?.hook?.hook_type ?? null,
    style: item.analysis_json?.hook?.visual_style ?? null,
    visual_impact: item.analysis_json?.scores?.visual_impact ?? null,
    message_clarity: item.analysis_json?.scores?.message_clarity ?? null,
    cta_effectiveness: item.analysis_json?.scores?.cta_effectiveness ?? null,
    social_proof: item.analysis_json?.scores?.social_proof_score ?? null,
  }));
}

// ── 상수 ──────────────────────────────────────────────────────────

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
            accountId={selectedAccountId}
          />
        </TabsContent>

        {/* ── 포트폴리오 탭 (v2) ────────────────────────────── */}
        <TabsContent value="portfolio">
          <PortfolioTabV2
            portfolioItems={toPortfolioItems(intelligenceData?.results ?? [])}
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
  accountId,
}: {
  intelligenceData: IntelligenceResponse | undefined;
  intelligenceLoading: boolean;
  accountId: string;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const baseResults = intelligenceData?.results ?? [];

  const goNext = () => setCurrentIndex((i) => Math.min(i + 1, baseResults.length - 1));
  const goPrev = () => setCurrentIndex((i) => Math.max(i - 1, 0));

  const currentCreative = baseResults[currentIndex] ?? null;

  return (
    <div className="space-y-4">
      {intelligenceLoading ? (
        <Skeleton className="h-[600px] rounded-2xl" />
      ) : baseResults.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ImageIcon className="mx-auto h-10 w-10 mb-3" />
          <p className="text-sm">분석된 소재가 없습니다</p>
          <p className="text-xs mt-1">소재 인텔리전스 분석 후 결과가 표시됩니다</p>
        </div>
      ) : (
        <>
          {/* 네비게이션 헤더 */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              ROAS 기준 상위 {baseResults.length}개 소재
            </p>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">
                {currentIndex + 1} / {baseResults.length}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={goPrev}
                  disabled={currentIndex === 0}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <button
                  onClick={goNext}
                  disabled={currentIndex === baseResults.length - 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
          </div>

          {/* 상세 패널 */}
          {currentCreative && (
            <CreativeDetailPanel
              creativeId={currentCreative.id}
              accountId={accountId}
              onClose={() => {}}
            />
          )}
        </>
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
