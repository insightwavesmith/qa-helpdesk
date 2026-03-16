"use client";

import { useState, useCallback } from "react";
import { Search, Filter, X, ExternalLink, Image as ImageIcon } from "lucide-react";

// ── 타입 ──────────────────────────────────────

interface CreativeResult {
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

interface CreativeDetail {
  id: string;
  ad_id: string;
  source: string;
  brand_name: string | null;
  category: string | null;
  media_url: string | null;
  media_type: string | null;
  ad_copy: string | null;
  creative_type: string | null;
  lp_url: string | null;
  lp_screenshot_url: string | null;
  lp_cta_screenshot_url: string | null;
  lp_headline: string | null;
  lp_price: string | null;
  roas: number | null;
  ctr: number | null;
  click_to_purchase_rate: number | null;
  quality_ranking: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  lp_crawled_at: string | null;
}

type SortKey = "similarity" | "roas" | "ctr";

// ── 페이지 ────────────────────────────────────

export default function CreativesPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CreativeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 필터
  const [filterSource, setFilterSource] = useState<"" | "own" | "competitor">("");
  const [filterType, setFilterType] = useState<"" | "IMAGE" | "VIDEO">("");
  const [sortKey, setSortKey] = useState<SortKey>("similarity");
  const [showFilters, setShowFilters] = useState(false);

  // 상세 모달
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CreativeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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
          source: filterSource || undefined,
          limit: 30,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "검색 실패");
      }

      const data = await res.json();
      setResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "검색 중 오류 발생");
    } finally {
      setLoading(false);
    }
  }, [query, filterSource]);

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setDetail(null);

    try {
      const res = await fetch(`/api/creative/${id}`);
      if (res.ok) {
        const data = await res.json();
        setDetail(data.creative);
      }
    } catch {
      // 상세 조회 실패 무시
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
  }, []);

  // 정렬 + 필터 적용
  const sortedResults = [...results]
    .filter((r) => {
      if (filterType && r.creative_type !== filterType) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortKey === "similarity") return b.similarity - a.similarity;
      if (sortKey === "roas") return (b.roas ?? 0) - (a.roas ?? 0);
      if (sortKey === "ctr") return (b.ctr ?? 0) - (a.ctr ?? 0);
      return 0;
    });

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">소재 분석</h1>
        <p className="mt-1 text-sm text-gray-500">
          텍스트로 유사 광고 소재를 검색하세요
        </p>
      </div>

      {/* 검색바 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="검색어 입력 (예: 봄 신상 원피스, 다이어트 보조제)"
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

      {/* 필터 패널 */}
      {showFilters && (
        <div className="flex flex-wrap gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              소스
            </label>
            <select
              value={filterSource}
              onChange={(e) =>
                setFilterSource(e.target.value as "" | "own" | "competitor")
              }
              className="px-3 py-1.5 border border-gray-200 rounded text-sm"
            >
              <option value="">전체</option>
              <option value="own">자사</option>
              <option value="competitor">경쟁사</option>
            </select>
          </div>
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
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              정렬
            </label>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="px-3 py-1.5 border border-gray-200 rounded text-sm"
            >
              <option value="similarity">유사도순</option>
              <option value="roas">ROAS순</option>
              <option value="ctr">CTR순</option>
            </select>
          </div>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 결과 카드 그리드 */}
      {sortedResults.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedResults.map((item) => (
            <button
              key={item.id}
              onClick={() => openDetail(item.id)}
              className="text-left bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md hover:border-gray-300 transition-shadow"
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
                    <ImageIcon className="h-12 w-12" />
                  </div>
                )}
                {/* 유사도 배지 */}
                <span className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full">
                  {(item.similarity * 100).toFixed(0)}%
                </span>
                {/* 소스 배지 */}
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

              {/* 카드 하단 */}
              <div className="p-3 space-y-2">
                {/* 카피 */}
                <p className="text-sm text-gray-700 line-clamp-2">
                  {item.ad_copy || "카피 없음"}
                </p>

                {/* 성과 지표 */}
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  {item.roas != null && (
                    <span>
                      ROAS <strong className="text-gray-900">{item.roas.toFixed(1)}</strong>
                    </span>
                  )}
                  {item.ctr != null && (
                    <span>
                      CTR <strong className="text-gray-900">{(item.ctr * 100).toFixed(1)}%</strong>
                    </span>
                  )}
                  {item.brand_name && (
                    <span className="truncate">{item.brand_name}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 빈 상태 */}
      {!loading && results.length === 0 && query && (
        <div className="text-center py-16 text-gray-400">
          <Search className="mx-auto h-10 w-10 mb-3" />
          <p>검색 결과가 없습니다</p>
        </div>
      )}

      {/* 상세 모달 */}
      {selectedId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={closeDetail}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? (
              <div className="p-8 text-center text-gray-400">
                불러오는 중...
              </div>
            ) : detail ? (
              <div>
                {/* 모달 헤더 */}
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="font-semibold text-gray-900">소재 상세</h3>
                  <button
                    onClick={closeDetail}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  {/* 소재 이미지 */}
                  {detail.media_url && (
                    <div className="rounded-lg overflow-hidden border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={detail.media_url}
                        alt="소재"
                        className="w-full max-h-80 object-contain bg-gray-50"
                      />
                    </div>
                  )}

                  {/* 카피 */}
                  {detail.ad_copy && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 mb-1">
                        광고 카피
                      </h4>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">
                        {detail.ad_copy}
                      </p>
                    </div>
                  )}

                  {/* 성과 지표 */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {detail.roas != null && (
                      <MetricCard label="ROAS" value={detail.roas.toFixed(2)} />
                    )}
                    {detail.ctr != null && (
                      <MetricCard
                        label="CTR"
                        value={`${(detail.ctr * 100).toFixed(2)}%`}
                      />
                    )}
                    {detail.click_to_purchase_rate != null && (
                      <MetricCard
                        label="구매전환율"
                        value={`${(detail.click_to_purchase_rate * 100).toFixed(2)}%`}
                      />
                    )}
                    {detail.quality_ranking && (
                      <MetricCard label="품질" value={detail.quality_ranking} />
                    )}
                  </div>

                  {/* LP 정보 */}
                  {detail.lp_url && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-medium text-gray-500">
                          랜딩페이지
                        </h4>
                        <a
                          href={detail.lp_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#F75D5D] hover:underline flex items-center gap-1"
                        >
                          열기 <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      {detail.lp_headline && (
                        <p className="text-sm font-medium">{detail.lp_headline}</p>
                      )}
                      {detail.lp_price && (
                        <p className="text-sm text-gray-600">
                          가격: {detail.lp_price}
                        </p>
                      )}

                      {/* LP 스크린샷 */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {detail.lp_screenshot_url && (
                          <div>
                            <p className="text-xs text-gray-400 mb-1">
                              LP 메인
                            </p>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={detail.lp_screenshot_url}
                              alt="LP 메인 스크린샷"
                              className="rounded border w-full"
                              loading="lazy"
                            />
                          </div>
                        )}
                        {detail.lp_cta_screenshot_url && (
                          <div>
                            <p className="text-xs text-gray-400 mb-1">
                              구매 화면
                            </p>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={detail.lp_cta_screenshot_url}
                              alt="구매 화면 스크린샷"
                              className="rounded border w-full"
                              loading="lazy"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 메타 정보 */}
                  <div className="text-xs text-gray-400 flex flex-wrap gap-3 pt-2 border-t">
                    <span>ID: {detail.ad_id}</span>
                    <span>유형: {detail.creative_type || "-"}</span>
                    <span>소스: {detail.source === "own" ? "자사" : "경쟁사"}</span>
                    {detail.brand_name && <span>브랜드: {detail.brand_name}</span>}
                    {detail.lp_crawled_at && (
                      <span>
                        크롤링:{" "}
                        {new Date(detail.lp_crawled_at).toLocaleDateString("ko-KR")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-400">
                상세 정보를 불러올 수 없습니다
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}
