"use client";

import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, FileText, Eye, Tag, Send, PenLine, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { getOrganicStats, getOrganicPosts } from "@/actions/organic";
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

export default function OrganicDashboard() {
  const router = useRouter();

  const { data: statsResult, isLoading: statsLoading } = useSWR(
    "action:organic-stats",
    () => getOrganicStats()
  );

  const { data: recentResult, isLoading: recentLoading } = useSWR(
    "action:organic-recent",
    () => getOrganicPosts({ status: "published", limit: 5 })
  );

  const stats = statsResult?.data;
  const recentPosts: OrganicPost[] = recentResult?.data ?? [];

  const statCards = [
    { label: "전체 글", value: stats?.totalPosts ?? 0, icon: FileText, bg: "bg-blue-50", text: "text-blue-600" },
    { label: "발행완료", value: stats?.publishedPosts ?? 0, icon: Send, bg: "bg-green-50", text: "text-green-600" },
    { label: "초안", value: stats?.draftPosts ?? 0, icon: PenLine, bg: "bg-gray-50", text: "text-gray-600" },
    { label: "검토중", value: stats?.reviewPosts ?? 0, icon: Clock, bg: "bg-yellow-50", text: "text-yellow-600" },
    { label: "총 조회수", value: stats?.totalViews ?? 0, icon: Eye, bg: "bg-purple-50", text: "text-purple-600" },
    { label: "키워드 수", value: stats?.totalKeywords ?? 0, icon: Tag, bg: "bg-orange-50", text: "text-orange-600" },
  ];

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center gap-3">
                  <div className={`rounded-md ${card.bg} p-2`}>
                    <Icon className={`h-4 w-4 ${card.text}`} />
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-500">{card.label}</p>
                    <p className="text-[18px] font-semibold tabular-nums">
                      {card.value.toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 최근 발행 목록 */}
      <div>
        <h2 className="text-[15px] font-semibold text-gray-800 mb-3">최근 발행</h2>
        <Card>
          <CardContent className="p-0">
            {recentLoading ? (
              <div className="flex items-center justify-center py-10 text-gray-500">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                불러오는 중...
              </div>
            ) : recentPosts.length === 0 ? (
              <p className="text-center py-10 text-[14px] text-gray-400">
                발행된 글이 없습니다.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[45%]">제목</TableHead>
                    <TableHead>채널</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">발행일</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPosts.map((post) => {
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
                        <TableCell className="font-medium max-w-[300px] truncate">
                          {post.title}
                        </TableCell>
                        <TableCell className="text-[13px] text-gray-600">
                          {CHANNEL_LABEL[post.channel] ?? post.channel}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[11px] ${statusInfo.className}`}>
                            {statusInfo.label}
                          </Badge>
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
      </div>
    </div>
  );
}
