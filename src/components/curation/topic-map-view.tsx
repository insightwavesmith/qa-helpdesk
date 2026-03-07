"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { FolderOpen, ChevronUp, ChevronDown } from "lucide-react";
import { CurationCard } from "./curation-card";
import type { CurationContentWithLinks } from "@/types/content";
import { filterValidTopics } from "@/lib/topic-utils";

interface TopicMapViewProps {
  contents: CurationContentWithLinks[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onDismiss: (id: string) => void;
  onGenerate: (id: string) => void;
}

interface TopicGroup {
  topic: string;
  items: CurationContentWithLinks[];
}

function groupByTopic(contents: CurationContentWithLinks[]): TopicGroup[] {
  const groups: Record<string, CurationContentWithLinks[]> = {};

  for (const item of contents) {
    const validTopics = filterValidTopics(item.key_topics || []);
    const topic = validTopics.length > 0 ? validTopics[0] : "미분류";

    if (!groups[topic]) groups[topic] = [];
    groups[topic].push(item);
  }

  return Object.entries(groups)
    .sort(([a, itemsA], [b, itemsB]) => {
      if (a === "미분류") return 1;
      if (b === "미분류") return -1;
      return itemsB.length - itemsA.length;
    })
    .map(([topic, items]) => ({ topic, items }));
}

function TopicGroupSection({
  group,
  defaultOpen = true,
  selectedIds,
  onToggleSelect,
  onDismiss,
  onGenerate,
}: {
  group: TopicGroup;
  defaultOpen?: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onDismiss: (id: string) => void;
  onGenerate: (id: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* 토픽 헤더 */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-[#F75D5D]" />
          <span className="text-sm font-semibold text-[#111827]">
            {group.topic}
          </span>
          <Badge variant="secondary" className="text-[10px] h-5">
            {group.items.length}
          </Badge>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {/* 카드 리스트 */}
      {open && (
        <div className="p-3 space-y-2">
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TopicMapView({
  contents,
  selectedIds,
  onToggleSelect,
  onDismiss,
  onGenerate,
}: TopicMapViewProps) {
  const groups = groupByTopic(contents);

  if (contents.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-[15px] font-medium text-gray-500">
          콘텐츠가 없습니다
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <TopicGroupSection
          key={group.topic}
          group={group}
          defaultOpen={group.topic !== "미분류"}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onDismiss={onDismiss}
          onGenerate={onGenerate}
        />
      ))}
    </div>
  );
}
