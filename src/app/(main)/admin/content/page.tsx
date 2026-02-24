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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Plus, Newspaper, Mail, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { getContents } from "@/actions/contents";
import { getCurationCount } from "@/actions/curation";
import type { Content } from "@/types/content";
import NewContentModal from "@/components/content/new-content-modal";
import { CurationTab } from "@/components/curation/curation-tab";
import { InfoShareTab } from "@/components/curation/info-share-tab";
import { GeneratePreviewModal } from "@/components/curation/generate-preview-modal";
import { PipelineSidebar } from "@/components/curation/pipeline-sidebar";

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

const TYPE_LABEL: Record<string, string> = {
  education: "교육",
  case_study: "고객사례",
  webinar: "웨비나",
  notice: "공지",
  promo: "홍보",
};

export default function AdminContentPage() {
  const router = useRouter();
  const [contents, setContents] = useState<Content[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [curationCount, setCurationCount] = useState(0);
  const [generateIds, setGenerateIds] = useState<string[] | null>(null);
  const [sidebarSource, setSidebarSource] = useState("all");

  const loadContents = useCallback(async () => {
    setLoading(true);
    try {
      const params: { type?: string; status?: string; sourceType?: string; pageSize?: number } =
        { pageSize: 100, sourceType: "info_share" };
      if (typeFilter !== "all") params.type = typeFilter;
      if (statusFilter !== "all" && statusFilter !== "sent") params.status = statusFilter;

      const { data, count } = await getContents(params);
      let filtered = data as Content[];
      if (statusFilter === "sent") {
        filtered = filtered.filter((c) => c.email_sent_at !== null);
      }
      setContents(filtered);
      setTotalCount(statusFilter === "sent" ? filtered.length : (count ?? 0));
    } catch {
      setContents([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    loadContents();
    getCurationCount().then(setCurationCount);
  }, [loadContents]);

  const handleRowClick = (contentId: string) => {
    router.push(`/admin/content/${contentId}`);
  };

  const handleNewContent = () => setModalOpen(true);

  // Status counts
  const countByStatus = useCallback(
    (s: string) => contents.filter((c) => c.status === s).length,
    [contents]
  );

  const isUnfiltered = typeFilter === "all" && statusFilter === "all";

  const statCards = [
    {
      label: "전체",
      value: isUnfiltered ? totalCount : "-",
      bg: "bg-blue-50",
      text: "text-blue-600",
    },
    {
      label: "게시완료",
      value: isUnfiltered ? countByStatus("published") : "-",
      bg: "bg-green-50",
      text: "text-green-600",
    },
    {
      label: "초안",
      value: isUnfiltered ? countByStatus("draft") : "-",
      bg: "bg-gray-50",
      text: "text-gray-600",
    },
    {
      label: "발송됨",
      value: isUnfiltered ? contents.filter((c) => c.email_sent_at).length : "-",
      bg: "bg-purple-50",
      text: "text-purple-600",
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
            onClick={handleNewContent}
            className="bg-[#F75D5D] hover:bg-[#E54949]"
          >
            <Plus className="h-4 w-4 mr-2" />
            새 콘텐츠
          </Button>
        </div>
      </div>

      {/* Hub Tabs */}
      <Tabs defaultValue="curation">
        <TabsList variant="line">
          <TabsTrigger value="curation" className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            큐레이션
            {curationCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5 text-[10px]">
                {curationCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="contents" className="gap-1.5">
            <FileText className="h-4 w-4" />
            콘텐츠
          </TabsTrigger>
          <TabsTrigger value="posts" className="gap-1.5">
            <Newspaper className="h-4 w-4" />
            정보공유
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-1.5">
            <Mail className="h-4 w-4" />
            이메일
          </TabsTrigger>
        </TabsList>

        {/* 큐레이션 탭 */}
        <TabsContent value="curation" forceMount className="mt-4">
          <div className="flex gap-4">
            <PipelineSidebar
              activeSource={sidebarSource}
              onSourceSelect={setSidebarSource}
            />
            <div className="flex-1 min-w-0">
              <CurationTab
                onGenerateInfoShare={(ids) => setGenerateIds(ids)}
                externalSourceFilter={sidebarSource}
              />
            </div>
          </div>
        </TabsContent>

        {/* 콘텐츠 탭 */}
        <TabsContent value="contents" forceMount className="space-y-6 mt-4">
          {/* Stat Cards */}
          <div className="grid grid-cols-4 gap-4">
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
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="유형" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 유형</SelectItem>
                <SelectItem value="education">교육</SelectItem>
                <SelectItem value="case_study">고객사례</SelectItem>
                <SelectItem value="webinar">웨비나</SelectItem>
                <SelectItem value="notice">공지</SelectItem>
                <SelectItem value="promo">홍보</SelectItem>
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
                <SelectItem value="sent">발송됨</SelectItem>
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
                      <TableHead className="w-[35%]">제목</TableHead>
                      <TableHead>유형</TableHead>
                      <TableHead>정보공유</TableHead>
                      <TableHead>뉴스레터</TableHead>
                      <TableHead>임베딩</TableHead>
                      <TableHead className="text-right">조회수</TableHead>
                      <TableHead className="text-right">작성일</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contents.map((item) => {
                      const statusInfo = STATUS_BADGE[item.status] ?? {
                        label: item.status,
                        className: "",
                      };
                      return (
                        <TableRow
                          key={item.id}
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => handleRowClick(item.id)}
                        >
                          <TableCell className="font-medium max-w-[400px] truncate">
                            {item.title}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[11px]">
                              {TYPE_LABEL[item.type] ?? item.type}
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
                          <TableCell>
                            {item.email_sent_at ? (
                              <Badge
                                variant="outline"
                                className="text-[11px] bg-purple-50 text-purple-700 border-purple-200"
                              >
                                발송완료
                              </Badge>
                            ) : (
                              <span className="text-[12px] text-gray-400">미발송</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.embedding_status === "completed" ? (
                              <Badge variant="outline" className="text-[11px] bg-green-50 text-green-700 border-green-200">
                                완료 ({item.chunks_count ?? 0})
                              </Badge>
                            ) : item.embedding_status === "processing" ? (
                              <Badge variant="outline" className="text-[11px] bg-yellow-50 text-yellow-700 border-yellow-200">
                                처리중
                              </Badge>
                            ) : item.embedding_status === "failed" ? (
                              <Badge variant="outline" className="text-[11px] bg-red-50 text-red-700 border-red-200">
                                실패
                              </Badge>
                            ) : (
                              <span className="text-[12px] text-gray-400">대기</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-[13px] text-gray-500 tabular-nums">
                            {(item.view_count ?? 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-[13px] text-gray-500">
                            {new Date(item.created_at).toLocaleDateString("ko-KR", {
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
        </TabsContent>

        {/* 정보공유 탭 */}
        <TabsContent value="posts" forceMount className="mt-4">
          <InfoShareTab />
        </TabsContent>

        {/* 이메일 탭 (Phase D에서 구현) */}
        <TabsContent value="email" forceMount className="mt-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20">
              <Mail className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-[15px] font-medium text-gray-500">이메일 관리</p>
              <p className="text-[13px] text-gray-400 mt-1">
                발송 이력, 오픈율/클릭률 성과를 확인합니다.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <NewContentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreated={(id) => router.push(`/admin/content/${id}`)}
      />

      {generateIds && (
        <GeneratePreviewModal
          contentIds={generateIds}
          onClose={() => {
            setGenerateIds(null);
            getCurationCount().then(setCurationCount);
          }}
        />
      )}
    </div>
  );
}
