"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, RefreshCw, Plus } from "lucide-react";
import { getContents } from "@/actions/contents";
import type { Content } from "@/types/content";
import ContentEditorDialog from "@/components/content/content-editor-dialog";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: {
    label: "초안",
    className: "bg-gray-100 text-gray-700 border-gray-200",
  },
  review: {
    label: "검수대기",
    className: "bg-yellow-50 text-yellow-700 border-yellow-200",
  },
  ready: {
    label: "발행가능",
    className: "bg-green-50 text-green-700 border-green-200",
  },
  published: {
    label: "게시완료",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  archived: {
    label: "보관",
    className: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

const CATEGORY_LABEL: Record<string, string> = {
  education: "교육",
  notice: "공지",
  case_study: "고객사례",
  newsletter: "뉴스레터",
};

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  info: { label: "정보", className: "bg-blue-50 text-blue-700 border-blue-200" },
  result: { label: "성과", className: "bg-green-50 text-green-700 border-green-200" },
  promo: { label: "홍보", className: "bg-orange-50 text-orange-700 border-orange-200" },
};

export default function AdminContentPage() {
  const [contents, setContents] = useState<Content[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Editor dialog
  const [selectedContent, setSelectedContent] = useState<Content | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const loadContents = useCallback(async () => {
    setLoading(true);
    try {
      const params: { type?: string; category?: string; status?: string; pageSize?: number } =
        { pageSize: 100 };
      if (typeFilter !== "all") params.type = typeFilter;
      if (categoryFilter !== "all") params.category = categoryFilter;
      if (statusFilter !== "all") params.status = statusFilter;

      const { data, count } = await getContents(params);
      setContents(data as Content[]);
      setTotalCount(count ?? 0);
    } catch {
      setContents([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, categoryFilter, statusFilter]);

  useEffect(() => {
    loadContents();
  }, [loadContents]);

  const handleRowClick = (content: Content) => {
    setSelectedContent(content);
    setEditorOpen(true);
  };

  const handleSaved = () => {
    setEditorOpen(false);
    setSelectedContent(null);
    loadContents();
  };

  // Status counts (from loaded data when no filter applied, otherwise show totalCount)
  const countByStatus = useCallback(
    (s: string) => contents.filter((c) => c.status === s).length,
    [contents]
  );

  const isUnfiltered = typeFilter === "all" && categoryFilter === "all" && statusFilter === "all";

  const statCards = [
    {
      label: "전체",
      value: isUnfiltered ? totalCount : "-",
      bg: "bg-blue-50",
      text: "text-blue-600",
    },
    {
      label: "초안",
      value: isUnfiltered ? countByStatus("draft") : "-",
      bg: "bg-gray-50",
      text: "text-gray-600",
    },
    {
      label: "검수대기",
      value: isUnfiltered ? countByStatus("review") : "-",
      bg: "bg-yellow-50",
      text: "text-yellow-600",
    },
    {
      label: "발행가능",
      value: isUnfiltered ? countByStatus("ready") : "-",
      bg: "bg-green-50",
      text: "text-green-600",
    },
    {
      label: "게시완료",
      value: isUnfiltered ? countByStatus("published") : "-",
      bg: "bg-blue-50",
      text: "text-blue-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">콘텐츠 관리</h1>
          <p className="text-[14px] text-gray-500 mt-1">
            콘텐츠를 관리하고 편집합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => { setSelectedContent(null); setEditorOpen(true); }}
            className="bg-[#F75D5D] hover:bg-[#E54949]"
          >
            <Plus className="h-4 w-4 mr-2" />
            새 콘텐츠
          </Button>
          <Button variant="outline" disabled>
            <RefreshCw className="h-4 w-4 mr-2" />
            동기화
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-5 gap-4">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="pt-5 pb-4 px-5">
              <div className="flex items-center gap-3">
                <div className={`rounded-md ${card.bg} p-2`}>
                  <FileText className={`h-4 w-4 ${card.text}`} />
                </div>
                <div>
                  <p className="text-[12px] text-gray-500">{card.label}</p>
                  <p className="text-[20px] font-semibold">{card.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="타입" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 타입</SelectItem>
            <SelectItem value="info">정보</SelectItem>
            <SelectItem value="result">성과</SelectItem>
            <SelectItem value="promo">홍보</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="카테고리" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 카테고리</SelectItem>
            <SelectItem value="education">교육</SelectItem>
            <SelectItem value="notice">공지</SelectItem>
            <SelectItem value="case_study">고객사례</SelectItem>
            <SelectItem value="newsletter">뉴스레터</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            <SelectItem value="draft">초안</SelectItem>
            <SelectItem value="review">검수대기</SelectItem>
            <SelectItem value="ready">발행가능</SelectItem>
            <SelectItem value="published">게시완료</SelectItem>
            <SelectItem value="archived">보관</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              불러오는 중...
            </div>
          ) : contents.length === 0 ? (
            <p className="text-center py-16 text-[14px] text-gray-500">
              콘텐츠가 없습니다.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">제목</TableHead>
                  <TableHead>타입</TableHead>
                  <TableHead>카테고리</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">날짜</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contents.map((item) => {
                  const statusInfo = STATUS_BADGE[item.status] ?? {
                    label: item.status,
                    className: "",
                  };
                  const typeInfo = TYPE_BADGE[item.type] ?? {
                    label: item.type || "-",
                    className: "",
                  };
                  return (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer"
                      onClick={() => handleRowClick(item)}
                    >
                      <TableCell className="font-medium max-w-[400px] truncate">
                        {item.title}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[11px] ${typeInfo.className}`}
                        >
                          {typeInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[11px]">
                          {CATEGORY_LABEL[item.category] ?? item.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[11px] ${statusInfo.className}`}
                        >
                          {statusInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-[13px] text-gray-500">
                        {new Date(item.created_at).toLocaleDateString("ko-KR", {
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

      {/* Editor Dialog */}
      <ContentEditorDialog
        content={selectedContent}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSaved={handleSaved}
      />
    </div>
  );
}
