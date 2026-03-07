"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Sparkles } from "lucide-react";
import { CurationCard } from "./curation-card";
import type { CurationContentWithLinks } from "@/types/content";

interface CurationTabProps {
  contents: CurationContentWithLinks[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onDismiss: (id: string) => void;
  onGenerate: (id: string) => void;
  onRestore?: (id: string) => void;
  emptyTitle?: string;
  emptyDesc?: string;
}

function groupByDate(items: CurationContentWithLinks[]) {
  const groups: Record<string, CurationContentWithLinks[]> = {};
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

export function CurationTab({
  contents,
  loading,
  selectedIds,
  onToggleSelect,
  onDismiss,
  onGenerate,
  onRestore,
  emptyTitle = "새로운 콘텐츠가 없습니다",
  emptyDesc = "크롤러가 수집한 콘텐츠가 여기에 표시됩니다.",
}: CurationTabProps) {
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
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Sparkles className="h-10 w-10 text-gray-300 mb-3" />
          <p className="text-[15px] font-medium text-gray-500">
            {emptyTitle}
          </p>
          <p className="text-[13px] text-gray-400 mt-1">
            {emptyDesc}
          </p>
        </CardContent>
      </Card>
    );
  }

  const groups = groupByDate(contents);

  return (
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
                curationStatus={item.curation_status}
                linkedInfoShares={item.linked_info_shares}
                selected={selectedIds.has(item.id)}
                onToggle={onToggleSelect}
                onDismiss={onDismiss}
                onGenerate={onGenerate}
                onRestore={onRestore}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
