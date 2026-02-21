"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Newspaper } from "lucide-react";
import { useRouter } from "next/navigation";
import { getInfoShareContents } from "@/actions/curation";
import type { Content } from "@/types/content";

const CATEGORY_LABEL: Record<string, string> = {
  education: "교육",
  case_study: "고객사례",
  notice: "공지",
};

export function InfoShareTab() {
  const router = useRouter();
  const [contents, setContents] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getInfoShareContents();
      setContents(data as Content[]);
    } catch {
      setContents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          불러오는 중...
        </CardContent>
      </Card>
    );
  }

  if (contents.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20">
          <Newspaper className="h-10 w-10 text-gray-300 mb-3" />
          <p className="text-[15px] font-medium text-gray-500">
            게시된 정보공유가 없습니다
          </p>
          <p className="text-[13px] text-gray-400 mt-1">
            큐레이션 탭에서 콘텐츠를 선택하여 정보공유를 생성하세요.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">제목</TableHead>
              <TableHead>카테고리</TableHead>
              <TableHead className="text-right">조회수</TableHead>
              <TableHead>임베딩</TableHead>
              <TableHead className="text-right">게시일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contents.map((item) => (
              <TableRow
                key={item.id}
                className="cursor-pointer hover:bg-gray-50"
                onClick={() => router.push(`/admin/content/${item.id}`)}
              >
                <TableCell className="font-medium max-w-[400px] truncate">
                  {item.title}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-[11px]">
                    {CATEGORY_LABEL[item.category] || item.category}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-[13px] text-gray-500 tabular-nums">
                  {(item.view_count ?? 0).toLocaleString()}
                </TableCell>
                <TableCell>
                  {item.embedding_status === "completed" ? (
                    <Badge
                      variant="outline"
                      className="text-[11px] bg-green-50 text-green-700 border-green-200"
                    >
                      완료 ({item.chunks_count ?? 0})
                    </Badge>
                  ) : item.embedding_status === "failed" ? (
                    <Badge
                      variant="outline"
                      className="text-[11px] bg-red-50 text-red-700 border-red-200"
                    >
                      실패
                    </Badge>
                  ) : (
                    <span className="text-[12px] text-gray-400">대기</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-[13px] text-gray-500">
                  {item.published_at
                    ? new Date(item.published_at).toLocaleDateString("ko-KR", {
                        month: "short",
                        day: "numeric",
                      })
                    : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
