"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { Loader2, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { getOrganicPosts } from "@/actions/organic";
import type { OrganicPost } from "@/types/organic";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: "초안", className: "bg-gray-100 text-gray-700 border-gray-200" },
  review: { label: "검토중", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  scheduled: { label: "예약됨", className: "bg-blue-50 text-blue-700 border-blue-200" },
  published: { label: "발행완료", className: "bg-green-50 text-green-700 border-green-200" },
  archived: { label: "보관", className: "bg-gray-100 text-gray-500 border-gray-200" },
};

const CHANNEL_LABEL: Record<string, string> = {
  naver_blog: "📝 블로그",
  naver_cafe: "☕ 카페",
};

const PAGE_SIZE = 20;

export default function OrganicPostsTab() {
  const router = useRouter();
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const swrKey = `action:organic-posts:${channelFilter}:${statusFilter}:${page}`;

  const { data: result, isLoading } = useSWR(swrKey, () =>
    getOrganicPosts({
      channel: channelFilter !== "all" ? channelFilter : undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      page,
      limit: PAGE_SIZE,
    })
  );

  const posts: OrganicPost[] = result?.data ?? [];
  const total = result?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleFilterChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <Select
            value={channelFilter}
            onValueChange={handleFilterChange(setChannelFilter)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="채널" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 채널</SelectItem>
              <SelectItem value="naver_blog">📝 블로그</SelectItem>
              <SelectItem value="naver_cafe">☕ 카페</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={handleFilterChange(setStatusFilter)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              <SelectItem value="draft">초안</SelectItem>
              <SelectItem value="review">검토중</SelectItem>
              <SelectItem value="scheduled">예약됨</SelectItem>
              <SelectItem value="published">발행완료</SelectItem>
              <SelectItem value="archived">보관</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={() => router.push("/admin/organic/new")}
          className="bg-[#F75D5D] hover:bg-[#E54949]"
        >
          <Plus className="h-4 w-4 mr-2" />
          새 글 작성
        </Button>
      </div>

      {/* 테이블 */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              불러오는 중...
            </div>
          ) : posts.length === 0 ? (
            <p className="text-center py-16 text-[14px] text-gray-400">
              글이 없습니다.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">제목</TableHead>
                  <TableHead>채널</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>키워드</TableHead>
                  <TableHead className="text-right">발행일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => {
                  const statusInfo = STATUS_BADGE[post.status] ?? {
                    label: post.status,
                    className: "",
                  };
                  return (
                    <TableRow
                      key={post.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => router.push(`/admin/organic/${post.id}`)}
                    >
                      <TableCell className="font-medium max-w-[320px] truncate">
                        {post.title}
                      </TableCell>
                      <TableCell className="text-[13px] text-gray-600">
                        {CHANNEL_LABEL[post.channel] ?? post.channel}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[11px] ${statusInfo.className}`}
                        >
                          {statusInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {post.keywords.slice(0, 3).map((kw) => (
                            <Badge
                              key={kw}
                              variant="secondary"
                              className="text-[10px] py-0"
                            >
                              {kw}
                            </Badge>
                          ))}
                          {post.keywords.length > 3 && (
                            <span className="text-[11px] text-gray-400">
                              +{post.keywords.length - 3}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-[13px] text-gray-500">
                        {post.published_at
                          ? new Date(post.published_at).toLocaleDateString("ko-KR", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })
                          : "-"}
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
