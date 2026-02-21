"use client";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Star, Globe, Youtube } from "lucide-react";

interface CurationCardProps {
  id: string;
  title: string;
  aiSummary: string | null;
  importanceScore: number;
  keyTopics: string[];
  sourceType: string | null;
  sourceRef: string | null;
  createdAt: string;
  selected: boolean;
  onToggle: (id: string) => void;
}

const SCORE_COLORS: Record<number, string> = {
  5: "text-red-500",
  4: "text-orange-500",
  3: "text-blue-500",
  2: "text-purple-500",
  1: "text-gray-400",
  0: "text-gray-300",
};

function ImportanceStars({ score }: { score: number }) {
  const color = SCORE_COLORS[score] || SCORE_COLORS[0];
  return (
    <div className="flex items-center gap-0.5" title={`중요도 ${score}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < score ? color : "text-gray-200"}`}
          fill={i < score ? "currentColor" : "none"}
        />
      ))}
    </div>
  );
}

export function CurationCard({
  id,
  title,
  aiSummary,
  importanceScore,
  keyTopics,
  sourceType,
  createdAt,
  selected,
  onToggle,
}: CurationCardProps) {
  const isYoutube = sourceType === "youtube";
  const time = new Date(createdAt).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={`flex gap-3 p-4 rounded-lg border transition-colors cursor-pointer ${
        selected
          ? "border-[#F75D5D] bg-red-50/50"
          : "border-gray-200 hover:bg-gray-50"
      }`}
      onClick={() => onToggle(id)}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={() => onToggle(id)}
        className="mt-1 shrink-0"
        onClick={(e) => e.stopPropagation()}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            {isYoutube ? (
              <Youtube className="h-4 w-4 text-red-500 shrink-0" />
            ) : (
              <Globe className="h-4 w-4 text-blue-500 shrink-0" />
            )}
            <h4 className="text-sm font-medium text-[#111827] truncate">
              {title}
            </h4>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ImportanceStars score={importanceScore} />
            <span className="text-xs text-gray-400">{time}</span>
          </div>
        </div>

        {aiSummary ? (
          <p className="text-xs text-gray-500 line-clamp-2 mb-2">
            {aiSummary}
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic mb-2">
            {importanceScore === 0 ? "분석 실패" : "요약 없음"}
          </p>
        )}

        {keyTopics.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {keyTopics.map((topic) => (
              <Badge
                key={topic}
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-5"
              >
                {topic}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
