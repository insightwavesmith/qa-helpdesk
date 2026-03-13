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
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { getKeywordStats } from "@/actions/organic";
import type { KeywordStat } from "@/types/organic";

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
    </div>
  );
}
