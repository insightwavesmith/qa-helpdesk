"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { getKeywordStats } from "@/actions/organic";
import type { KeywordStat } from "@/types/organic";
import KeywordAnalysisPanel from "./keyword-analysis-panel";

const COMPETITION_BADGE: Record<string, { label: string; className: string }> = {
  low: { label: "낮음", className: "bg-green-50 text-green-700 border-green-200" },
  medium: { label: "보통", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  high: { label: "높음", className: "bg-red-50 text-red-700 border-red-200" },
};

const PAGE_SIZE = 50;

export default function OrganicKeywordsTab() {
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const swrKey = `action:organic-keywords:${channelFilter}:${page}`;

  const { data: result, isLoading } = useSWR(swrKey, () =>
    getKeywordStats({
      channel: channelFilter !== "all" ? channelFilter : undefined,
      page,
      limit: PAGE_SIZE,
    })
  );

  const keywords: KeywordStat[] = result?.data ?? [];
  const total = result?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleChannelChange = (v: string) => {
    setChannelFilter(v);
    setPage(1);
  };

  const formatNumber = (n: number | null) =>
    n != null ? n.toLocaleString() : "-";

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className="flex items-center gap-3">
        <Select value={channelFilter} onValueChange={handleChannelChange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="채널" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 채널</SelectItem>
            <SelectItem value="naver_blog">📝 블로그</SelectItem>
            <SelectItem value="naver_cafe">☕ 카페</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[13px] text-gray-400">총 {total.toLocaleString()}개</span>
      </div>

      {/* 테이블 */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              불러오는 중...
            </div>
          ) : keywords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <p className="text-[14px]">키워드 데이터가 없습니다.</p>
              <p className="text-[12px] mt-1">키워드를 추가하면 검색량이 자동으로 수집됩니다.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[35%]">키워드</TableHead>
                  <TableHead className="text-right">PC 검색량</TableHead>
                  <TableHead className="text-right">모바일 검색량</TableHead>
                  <TableHead className="text-right">합계</TableHead>
                  <TableHead>경쟁도</TableHead>
                  <TableHead className="text-right">수집일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keywords.map((kw) => {
                  const competitionInfo = kw.competition
                    ? (COMPETITION_BADGE[kw.competition] ?? null)
                    : null;
                  return (
                    <TableRow key={kw.id}>
                      <TableCell className="font-medium">{kw.keyword}</TableCell>
                      <TableCell className="text-right text-[13px] tabular-nums">
                        {formatNumber(kw.pc_search)}
                      </TableCell>
                      <TableCell className="text-right text-[13px] tabular-nums">
                        {formatNumber(kw.mobile_search)}
                      </TableCell>
                      <TableCell className="text-right text-[13px] tabular-nums font-medium">
                        {formatNumber(kw.total_search)}
                      </TableCell>
                      <TableCell>
                        {competitionInfo ? (
                          <Badge
                            variant="outline"
                            className={`text-[11px] ${competitionInfo.className}`}
                          >
                            {competitionInfo.label}
                          </Badge>
                        ) : (
                          <span className="text-[12px] text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-[13px] text-gray-500">
                        {new Date(kw.fetched_at).toLocaleDateString("ko-KR", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            이전
          </Button>
          <span className="text-[13px] text-gray-500">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            다음
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* 분석 도구 */}
      <div className="mt-8 pt-6 border-t">
        <h3 className="text-[15px] font-semibold mb-4">분석 도구</h3>
        <Tabs defaultValue="keyword-analysis">
          <TabsList>
            <TabsTrigger value="keyword-analysis">키워드 분석</TabsTrigger>
            <TabsTrigger value="forbidden-check">금칙어 체크</TabsTrigger>
            <TabsTrigger value="benchmark">벤치마킹</TabsTrigger>
          </TabsList>

          <TabsContent value="keyword-analysis" className="mt-4">
            <KeywordAnalysisPanel />
          </TabsContent>

          <TabsContent value="forbidden-check" className="mt-4">
            <ForbiddenCheckSection />
          </TabsContent>

          <TabsContent value="benchmark" className="mt-4">
            <BlogBenchmarkSection />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ─────────────────────── 금칙어 체크 ───────────────────────

interface ForbiddenCheckResult {
  keyword: string;
  isForbidden: boolean;
  isSuicideWord: boolean;
}

function ForbiddenCheckSection() {
  const [keywords, setKeywords] = useState("");
  const [results, setResults] = useState<ForbiddenCheckResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleCheck = async () => {
    const list = keywords
      .split("\n")
      .map((k) => k.trim())
      .filter(Boolean);
    if (list.length === 0) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/forbidden-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: list }),
      });
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      // 에러 시 무시
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-[13px] text-gray-500">
          키워드를 한 줄에 하나씩 입력하세요.
        </p>
        <Textarea
          placeholder={"자살\n도박\n무료체험"}
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          rows={5}
          className="text-[13px]"
        />
        <Button
          onClick={handleCheck}
          disabled={isLoading || !keywords.trim()}
          style={{ backgroundColor: "#F75D5D" }}
          className="text-white hover:opacity-90"
        >
          {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          체크하기
        </Button>
      </div>

      {results.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>키워드</TableHead>
                  <TableHead>결과</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.keyword}>
                    <TableCell className="font-medium text-[13px]">
                      {r.keyword}
                    </TableCell>
                    <TableCell className="text-[13px]">
                      {r.isSuicideWord ? (
                        <span className="text-red-600">⚠️ 자살관련 금칙어</span>
                      ) : r.isForbidden ? (
                        <span className="text-red-500">❌ 금칙어</span>
                      ) : (
                        <span className="text-green-600">✅ 정상</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────── 블로그 벤치마킹 ───────────────────────

interface BlogBenchmark {
  url: string;
  title: string;
  charCount: number;
  imageCount: number;
  externalLinkCount: number;
  quoteCount: number;
  dividerCount: number;
  hashtagCount: number;
}

interface BlogBenchmarkAverage {
  charCount: number;
  imageCount: number;
  externalLinkCount: number;
  quoteCount: number;
  dividerCount: number;
  hashtagCount: number;
}

function BlogBenchmarkSection() {
  const [keyword, setKeyword] = useState("");
  const [blogs, setBlogs] = useState<BlogBenchmark[]>([]);
  const [average, setAverage] = useState<BlogBenchmarkAverage | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleAnalyze = async () => {
    if (!keyword.trim()) return;

    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/admin/blog-benchmark?keyword=${encodeURIComponent(keyword)}&count=3`
      );
      const data = await res.json();
      setBlogs(data.blogs ?? []);
      setAverage(data.average ?? null);
    } catch {
      // 에러 시 무시
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="키워드 입력"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
          className="text-[13px] max-w-[280px]"
        />
        <Button
          onClick={handleAnalyze}
          disabled={isLoading || !keyword.trim()}
          style={{ backgroundColor: "#F75D5D" }}
          className="text-white hover:opacity-90"
        >
          {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          분석하기
        </Button>
      </div>

      {average && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {[
            { label: "글자수", value: average.charCount.toLocaleString() },
            { label: "이미지", value: average.imageCount },
            { label: "외부링크", value: average.externalLinkCount },
            { label: "인용구", value: average.quoteCount },
            { label: "구분선", value: average.dividerCount },
            { label: "해시태그", value: average.hashtagCount },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="py-3 px-4 text-center">
                <p className="text-[11px] text-gray-500 mb-1">{label} (평균)</p>
                <p className="text-[15px] font-semibold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {blogs.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead className="text-right">글자수</TableHead>
                  <TableHead className="text-right">이미지</TableHead>
                  <TableHead className="text-right">외부링크</TableHead>
                  <TableHead className="text-right">인용구</TableHead>
                  <TableHead className="text-right">구분선</TableHead>
                  <TableHead className="text-right">해시태그</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blogs.map((b, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-[13px]">
                      <a
                        href={b.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline line-clamp-1"
                      >
                        {b.title || b.url}
                      </a>
                    </TableCell>
                    <TableCell className="text-right text-[13px] tabular-nums">
                      {b.charCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-[13px] tabular-nums">
                      {b.imageCount}
                    </TableCell>
                    <TableCell className="text-right text-[13px] tabular-nums">
                      {b.externalLinkCount}
                    </TableCell>
                    <TableCell className="text-right text-[13px] tabular-nums">
                      {b.quoteCount}
                    </TableCell>
                    <TableCell className="text-right text-[13px] tabular-nums">
                      {b.dividerCount}
                    </TableCell>
                    <TableCell className="text-right text-[13px] tabular-nums">
                      {b.hashtagCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
