"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, BookOpen, ChevronDown, ChevronUp, Shield, GraduationCap, CheckCircle, ArrowRight, Lock, Sparkles } from "lucide-react";
import { getCurriculumContents } from "@/actions/curation";
import { SWR_KEYS } from "@/lib/swr/keys";
import { renderInlineMarkdown } from "./curation-card";
import { filterValidTopics } from "@/lib/topic-utils";
import type { Content } from "@/types/content";

interface CurriculumViewProps {
  sourceType: string;
  onGenerateInfoShare?: (selectedIds: string[]) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  blueprint: "블루프린트 커리큘럼",
  lecture: "자사몰사관학교 커리큘럼",
};

const LEVEL_ICONS: Record<string, string> = {
  "입문": "text-green-600",
  "실전": "text-blue-600",
  "분석": "text-red-600",
  "기타": "text-gray-600",
};

function parseLevelFromCategory(category: string | null | undefined): string {
  if (category === "level1_입문") return "입문";
  if (category === "level2_실전") return "실전";
  if (category === "level3_분석") return "분석";
  return "기타";
}

function groupByLevel(items: Content[]): { level: string; items: Content[] }[] {
  const groups: Record<string, Content[]> = {};

  for (const item of items) {
    const level = parseLevelFromCategory(item.category);
    if (!groups[level]) groups[level] = [];
    groups[level].push(item);
  }

  // 각 그룹 내 title 가나다순 정렬
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => a.title.localeCompare(b.title, "ko"));
  }

  const order = ["입문", "실전", "분석", "기타"];
  return order
    .filter((key) => groups[key]?.length)
    .map((key) => ({ level: key, items: groups[key] }));
}

type PublishStatus = "published" | "next" | "locked";

function getPublishStatuses(items: Content[]): Map<string, PublishStatus> {
  const statuses = new Map<string, PublishStatus>();
  let foundNext = false;
  for (const item of items) {
    if (item.curation_status === "published" && !!item.ai_summary) {
      statuses.set(item.id, "published");
    } else if (!foundNext) {
      statuses.set(item.id, "next");
      foundNext = true;
    } else {
      statuses.set(item.id, "locked");
    }
  }
  return statuses;
}

const PUBLISH_BADGE: Record<PublishStatus, { label: string; className: string; Icon: typeof CheckCircle }> = {
  published: { label: "발행됨", className: "bg-green-50 text-green-700 border-green-200", Icon: CheckCircle },
  next: { label: "다음 발행", className: "bg-orange-50 text-orange-700 border-orange-200", Icon: ArrowRight },
  locked: { label: "잠금", className: "bg-gray-50 text-gray-500 border-gray-200", Icon: Lock },
};

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#F75D5D] rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 shrink-0 tabular-nums">
        {pct}% ({completed}/{total})
      </span>
    </div>
  );
}

function CurriculumItem({
  item,
  index,
  publishStatus,
  onGenerateInfoShare,
}: {
  item: Content;
  index: number;
  publishStatus: PublishStatus;
  onGenerateInfoShare?: (selectedIds: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasSummary = !!item.ai_summary;
  const badge = PUBLISH_BADGE[publishStatus];
  const StatusIcon = badge.Icon;

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      aria-expanded={expanded}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        expanded ? "border-[#F75D5D]/30 bg-red-50/30" : "border-gray-200 hover:bg-gray-50"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* 번호 */}
        <span className="text-xs font-semibold text-gray-400 mt-0.5 w-5 text-right shrink-0 tabular-nums">
          {index + 1}.
        </span>

        <div className="flex-1 min-w-0">
          {/* 제목 행 */}
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-[#111827] truncate">
              {item.title}
            </h4>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant="outline" className={`text-[10px] h-5 gap-0.5 ${badge.className}`}>
                <StatusIcon className="h-3 w-3" />
                {badge.label}
              </Badge>
              {hasSummary && publishStatus !== "published" && (
                <Badge variant="outline" className="text-[10px] h-5 bg-green-50 text-green-700 border-green-200">
                  요약완료
                </Badge>
              )}
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              )}
            </div>
          </div>

          {/* AI 요약 (항상 1줄 표시, 확장시 전체) */}
          {hasSummary && (
            <p className={`text-xs text-gray-500 mt-1.5 ${expanded ? "" : "line-clamp-1"}`}>
              {renderInlineMarkdown(item.ai_summary || "")}
            </p>
          )}

          {/* 확장 영역: body_md 미리보기 */}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">
                {(item.body_md || "").slice(0, 500)}
                {(item.body_md || "").length > 500 && "..."}
              </p>
              {(() => {
                const validTopics = filterValidTopics(item.key_topics || []);
                return validTopics.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {validTopics.map((topic) => (
                      <Badge
                        key={topic}
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 h-5"
                      >
                        {topic}
                      </Badge>
                    ))}
                  </div>
                ) : null;
              })()}

              {/* 정보공유 생성 버튼 — 모든 상태에서 표시 (published 제외) */}
              {publishStatus !== "published" && onGenerateInfoShare && (
                <div className="flex justify-end mt-3">
                  <Button
                    size="sm"
                    className="h-7 text-xs px-3 bg-[#F75D5D] hover:bg-[#E54949] text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      onGenerateInfoShare([item.id]);
                    }}
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    정보공유 생성
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

export function CurriculumView({ sourceType, onGenerateInfoShare }: CurriculumViewProps) {
  const { data: curriculumData, isLoading: loading } = useSWR(
    SWR_KEYS.curriculumContents(sourceType),
    () => getCurriculumContents(sourceType),
  );
  const contents = (curriculumData?.data ?? []) as unknown as Content[];

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
          <BookOpen className="h-10 w-10 text-gray-300 mb-3" />
          <p className="text-[15px] font-medium text-gray-500">
            등록된 콘텐츠가 없습니다
          </p>
        </CardContent>
      </Card>
    );
  }

  const groups = groupByLevel(contents);
  const totalCount = contents.length;
  const publishedCount = contents.filter((c) => c.curation_status === "published" && !!c.ai_summary).length;
  const SourceIcon = sourceType === "blueprint" ? Shield : GraduationCap;

  return (
    <div className="space-y-6">
      {/* 헤더 + 진행률 */}
      <Card>
        <CardContent className="pt-5 pb-4 px-5 space-y-3">
          <div className="flex items-center gap-2">
            <SourceIcon className={`h-5 w-5 ${sourceType === "blueprint" ? "text-purple-500" : "text-green-600"}`} />
            <h2 className="text-lg font-bold text-[#111827]">
              {SOURCE_LABELS[sourceType] || sourceType}
            </h2>
            <Badge variant="secondary" className="text-[11px]">
              {totalCount}건
            </Badge>
          </div>
          <div>
            <p className="text-[11px] text-gray-500 mb-1">발행 진행률</p>
            <ProgressBar completed={publishedCount} total={totalCount} />
          </div>
        </CardContent>
      </Card>

      {/* 레벨별 그룹 */}
      {groups.map((group) => {
        const levelColor = LEVEL_ICONS[group.level] || LEVEL_ICONS["기타"];
        const levelLabel = group.level;
        const statuses = getPublishStatuses(group.items);
        const groupPublished = group.items.filter((c) => statuses.get(c.id) === "published").length;

        return (
          <div key={group.level} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <BookOpen className={`h-4 w-4 ${levelColor}`} />
              <h3 className="text-sm font-semibold text-[#111827]">
                {levelLabel}
              </h3>
              <span className="text-[11px] text-gray-400">
                ({groupPublished}/{group.items.length} 발행)
              </span>
            </div>

            <div className="space-y-1.5">
              {group.items.map((item, idx) => (
                <CurriculumItem
                  key={item.id}
                  item={item}
                  index={idx}
                  publishStatus={statuses.get(item.id) || "locked"}
                  onGenerateInfoShare={onGenerateInfoShare}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
