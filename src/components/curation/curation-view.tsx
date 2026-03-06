"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { List, FolderTree, Sparkles, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getCurationContents,
  getCurationStatusCounts,
  batchUpdateCurationStatus,
  softDeleteContents,
  type CurationStatusCounts,
} from "@/actions/curation";
import { CurationTab } from "./curation-tab";
import { TopicMapView } from "./topic-map-view";
import { DeletedSection } from "./deleted-section";
import type { CurationContentWithLinks } from "@/types/content";

interface CurationViewProps {
  sourceFilter: string;
  onGenerateInfoShare: (selectedIds: string[]) => void;
}

const STATUS_TABS = [
  { key: "all", label: "전체" },
  { key: "new", label: "신규" },
  { key: "selected", label: "생성됨" },
  { key: "published", label: "발행됨" },
  { key: "dismissed", label: "스킵" },
] as const;

const EMPTY_STATE_MESSAGES: Record<string, { title: string; desc: string }> = {
  all: { title: "새로운 콘텐츠가 없습니다", desc: "크롤러가 수집한 콘텐츠가 여기에 표시됩니다." },
  youtube: { title: "YouTube 콘텐츠가 없습니다", desc: "YouTube 소스가 수집되면 여기에 표시됩니다." },
  crawl: { title: "블로그 콘텐츠가 없습니다", desc: "블로그 크롤링 결과가 여기에 표시됩니다." },
  marketing_theory: { title: "마케팅원론 콘텐츠가 없습니다", desc: "마케팅원론 소스가 등록되면 여기에 표시됩니다." },
};

export function CurationView({ sourceFilter, onGenerateInfoShare }: CurationViewProps) {
  const [viewMode, setViewMode] = useState<"inbox" | "topicmap">("inbox");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [statusCounts, setStatusCounts] = useState<CurationStatusCounts | null>(null);
  const [contents, setContents] = useState<CurationContentWithLinks[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scoreFilter, setScoreFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [dismissing, setDismissing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletedRefreshKey, setDeletedRefreshKey] = useState(0);

  const loadContents = useCallback(async () => {
    setLoading(true);
    try {
      const params: {
        source?: string;
        minScore?: number;
        period?: string;
        curationStatus?: string;
        showDismissed?: boolean;
      } = {};

      if (sourceFilter !== "all") params.source = sourceFilter;
      if (scoreFilter !== "all") params.minScore = parseInt(scoreFilter);
      if (periodFilter !== "all") params.period = periodFilter;

      // 상태 필터
      if (statusFilter !== "all") {
        params.curationStatus = statusFilter;
      } else {
        // "전체" 선택 시 dismissed 포함해서 보여줌
        params.showDismissed = true;
      }

      const { data } = await getCurationContents(params);
      setContents(data);
    } catch {
      setContents([]);
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, scoreFilter, periodFilter, statusFilter]);

  const loadCounts = useCallback(async () => {
    try {
      const counts = await getCurationStatusCounts(
        sourceFilter !== "all" ? sourceFilter : undefined
      );
      setStatusCounts(counts);
    } catch {
      // ignore
    }
  }, [sourceFilter]);

  useEffect(() => {
    loadContents();
    loadCounts();
  }, [loadContents, loadCounts]);

  // 소스 필터 변경 시 상태 필터 리셋
  useEffect(() => {
    setStatusFilter("all");
    setSelectedIds(new Set());
  }, [sourceFilter]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      else toast.error("최대 4개까지 선택 가능합니다.");
      return next;
    });
  };

  const handleDismiss = async (id?: string) => {
    const ids = id ? [id] : Array.from(selectedIds);
    if (ids.length === 0) return;
    setDismissing(true);
    const { error } = await batchUpdateCurationStatus(ids, "dismissed");
    if (error) {
      toast.error("스킵 처리에 실패했습니다.");
    } else {
      toast.success(`${ids.length}개 콘텐츠를 스킵했습니다.`);
      setSelectedIds(new Set());
      loadContents();
      loadCounts();
    }
    setDismissing(false);
  };

  const handleGenerate = (id?: string) => {
    const ids = id ? [id] : Array.from(selectedIds);
    if (ids.length === 0) return;
    onGenerateInfoShare(ids);
  };

  const handleSoftDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setDeleting(true);
    const { error } = await softDeleteContents(ids);
    if (error) {
      toast.error("삭제에 실패했습니다.");
    } else {
      toast.success(`${ids.length}개 콘텐츠를 삭제했습니다.`);
      setSelectedIds(new Set());
      loadContents();
      loadCounts();
      setDeletedRefreshKey((k) => k + 1);
    }
    setDeleting(false);
  };

  const handleRestore = () => {
    loadContents();
    loadCounts();
    setDeletedRefreshKey((k) => k + 1);
  };

  const emptyMsg = EMPTY_STATE_MESSAGES[sourceFilter] || EMPTY_STATE_MESSAGES.all;

  return (
    <div className="space-y-4">
      {/* 상태 필터 탭 */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {STATUS_TABS.map((tab) => {
          const count = statusCounts
            ? tab.key === "all"
              ? statusCounts.total
              : statusCounts[tab.key as keyof Omit<CurationStatusCounts, "total">]
            : null;
          const isActive = statusFilter === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? "border-[#F75D5D] text-[#F75D5D]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
              {count !== null && (
                <span className={`ml-1 ${isActive ? "text-[#F75D5D]" : "text-gray-400"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 필터 바 + 뷰 토글 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2">
          <Select value={scoreFilter} onValueChange={setScoreFilter}>
            <SelectTrigger className="w-[130px] h-9 text-sm">
              <SelectValue placeholder="중요도" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 중요도</SelectItem>
              <SelectItem value="5">★5</SelectItem>
              <SelectItem value="4">★4+</SelectItem>
              <SelectItem value="3">★3+</SelectItem>
            </SelectContent>
          </Select>

          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-[130px] h-9 text-sm">
              <SelectValue placeholder="기간" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 기간</SelectItem>
              <SelectItem value="today">오늘</SelectItem>
              <SelectItem value="week">이번 주</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 뷰 토글 */}
        <div className="flex border rounded-lg overflow-hidden">
          <button
            className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 ${
              viewMode === "inbox"
                ? "bg-[#F75D5D] text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
            onClick={() => setViewMode("inbox")}
          >
            <List className="h-3.5 w-3.5" />
            인박스
          </button>
          <button
            className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 ${
              viewMode === "topicmap"
                ? "bg-[#F75D5D] text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
            onClick={() => setViewMode("topicmap")}
          >
            <FolderTree className="h-3.5 w-3.5" />
            토픽맵
          </button>
        </div>
      </div>

      {/* 벌크 바 */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between py-2 px-3 bg-[#111827] rounded-lg text-white">
          <span className="text-xs font-medium">
            {selectedIds.size}개 선택됨
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSoftDelete}
              disabled={deleting}
              className="text-xs text-white hover:bg-white/10 h-7 px-2"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              삭제
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDismiss()}
              disabled={dismissing}
              className="text-xs text-white hover:bg-white/10 h-7 px-2"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              일괄 스킵
            </Button>
            <Button
              size="sm"
              onClick={() => handleGenerate()}
              className="bg-[#F75D5D] hover:bg-[#E54949] text-xs h-7 px-2"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              정보공유 생성
            </Button>
          </div>
        </div>
      )}

      {/* 콘텐츠 영역 */}
      {viewMode === "inbox" ? (
        <CurationTab
          contents={contents}
          loading={loading}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onDismiss={(id) => handleDismiss(id)}
          onGenerate={(id) => handleGenerate(id)}
          emptyTitle={emptyMsg.title}
          emptyDesc={emptyMsg.desc}
        />
      ) : (
        <TopicMapView
          contents={contents}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onDismiss={(id) => handleDismiss(id)}
          onGenerate={(id) => handleGenerate(id)}
        />
      )}

      {/* 삭제된 콘텐츠 섹션 */}
      <DeletedSection
        key={deletedRefreshKey}
        sourceFilter={sourceFilter}
        onRestore={handleRestore}
      />
    </div>
  );
}
