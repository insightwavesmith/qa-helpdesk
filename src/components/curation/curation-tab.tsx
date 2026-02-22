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
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  getCurationContents,
  batchUpdateCurationStatus,
} from "@/actions/curation";
import { CurationCard } from "./curation-card";
import type { Content } from "@/types/content";

interface CurationTabProps {
  onGenerateInfoShare: (selectedIds: string[]) => void;
  externalSourceFilter?: string;
}

function groupByDate(items: Content[]) {
  const groups: Record<string, Content[]> = {};
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  for (const item of items) {
    const d = new Date(item.created_at);
    let label: string;
    if (d >= today) label = "오늘";
    else if (d >= yesterday) label = "어제";
    else if (d >= weekAgo) label = "이번 주";
    else label = "그 이전";

    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  }

  const order = ["오늘", "어제", "이번 주", "그 이전"];
  return order
    .filter((key) => groups[key]?.length)
    .map((key) => ({ label: key, items: groups[key] }));
}

export function CurationTab({ onGenerateInfoShare, externalSourceFilter }: CurationTabProps) {
  const [contents, setContents] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState(externalSourceFilter || "all");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [dismissing, setDismissing] = useState(false);

  const loadContents = useCallback(async () => {
    setLoading(true);
    try {
      const params: {
        source?: string;
        minScore?: number;
        period?: string;
      } = {};
      if (sourceFilter !== "all") params.source = sourceFilter;
      if (scoreFilter !== "all") params.minScore = parseInt(scoreFilter);
      if (periodFilter !== "all") params.period = periodFilter;

      const { data } = await getCurationContents(params);
      setContents(data as Content[]);
    } catch {
      setContents([]);
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, scoreFilter, periodFilter]);

  useEffect(() => {
    if (externalSourceFilter !== undefined && externalSourceFilter !== sourceFilter) {
      setSourceFilter(externalSourceFilter);
    }
  }, [externalSourceFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadContents();
  }, [loadContents]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      else toast.error("최대 4개까지 선택 가능합니다.");
      return next;
    });
  };

  const handleDismiss = async () => {
    if (selectedIds.size === 0) return;
    setDismissing(true);
    const { error } = await batchUpdateCurationStatus(
      Array.from(selectedIds),
      "dismissed"
    );
    if (error) {
      toast.error("스킵 처리에 실패했습니다.");
    } else {
      toast.success(`${selectedIds.size}개 콘텐츠를 스킵했습니다.`);
      setSelectedIds(new Set());
      loadContents();
    }
    setDismissing(false);
  };

  const handleGenerate = () => {
    if (selectedIds.size === 0) return;
    onGenerateInfoShare(Array.from(selectedIds));
  };

  const groups = groupByDate(contents);

  return (
    <div className="space-y-4">
      {/* 필터 + 액션 바 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2">
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[130px] h-9 text-sm">
              <SelectValue placeholder="소스" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 소스</SelectItem>
              <SelectItem value="blueprint">블루프린트</SelectItem>
              <SelectItem value="lecture">자사몰사관학교</SelectItem>
              <SelectItem value="youtube">YouTube</SelectItem>
              <SelectItem value="crawl">블로그</SelectItem>
              <SelectItem value="marketing_theory">마케팅원론</SelectItem>
              <SelectItem value="webinar">웨비나</SelectItem>
              <SelectItem value="papers">논문</SelectItem>
              <SelectItem value="file">파일</SelectItem>
            </SelectContent>
          </Select>

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

        {selectedIds.size > 0 && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDismiss}
              disabled={dismissing}
              className="text-sm gap-1"
            >
              <X className="h-3.5 w-3.5" />
              일괄 스킵 ({selectedIds.size})
            </Button>
            <Button
              size="sm"
              onClick={handleGenerate}
              className="bg-[#F75D5D] hover:bg-[#E54949] text-sm gap-1"
            >
              <Sparkles className="h-3.5 w-3.5" />
              정보공유 생성 ({selectedIds.size})
            </Button>
          </div>
        )}
      </div>

      {/* 콘텐츠 목록 */}
      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            불러오는 중...
          </CardContent>
        </Card>
      ) : contents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Sparkles className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-[15px] font-medium text-gray-500">
              새로운 콘텐츠가 없습니다
            </p>
            <p className="text-[13px] text-gray-400 mt-1">
              크롤러가 수집한 콘텐츠가 여기에 표시됩니다.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              <h3 className="text-sm font-semibold text-gray-500 mb-2 px-1">
                {group.label}{" "}
                <span className="text-gray-400 font-normal">
                  ({group.items.length})
                </span>
              </h3>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <CurationCard
                    key={item.id}
                    id={item.id}
                    title={item.title}
                    aiSummary={item.ai_summary}
                    bodyMd={item.body_md}
                    importanceScore={item.importance_score}
                    keyTopics={item.key_topics || []}
                    sourceType={item.source_type}
                    sourceRef={item.source_ref}
                    createdAt={item.created_at}
                    selected={selectedIds.has(item.id)}
                    onToggle={toggleSelect}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
