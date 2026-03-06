"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Star,
  Globe,
  Youtube,
  Shield,
  GraduationCap,
  BookOpen,
  FileText,
  Mic,
  FlaskConical,
  ExternalLink,
  X,
  Sparkles,
  CornerDownRight,
} from "lucide-react";
import type { LinkedInfoShare } from "@/types/content";

interface CurationCardProps {
  id: string;
  title: string;
  aiSummary: string | null;
  bodyMd: string | null;
  importanceScore: number;
  keyTopics: string[];
  sourceType: string | null;
  sourceRef: string | null;
  createdAt: string;
  curationStatus: string;
  linkedInfoShares: LinkedInfoShare[];
  selected: boolean;
  onToggle: (id: string) => void;
  onDismiss: (id: string) => void;
  onGenerate: (id: string) => void;
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

/** AI 요약을 불릿 리스트로 파싱 (최대 3줄) */
function formatSummary(aiSummary: string | null): string[] {
  if (!aiSummary) return [];

  const trimmed = aiSummary.trim();

  // JSON 형태 요약 처리 ({"핵심 주제 한 줄":"...", "주요 내용 1":"..."} 등)
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const values: string[] = [];
      for (const [, v] of Object.entries(parsed)) {
        if (typeof v === "string" && v.trim()) {
          values.push(v.trim());
        } else if (Array.isArray(v)) {
          for (const item of v) {
            if (typeof item === "string" && item.trim()) values.push(item.trim());
          }
        }
      }
      return values.slice(0, 3);
    } catch {
      // JSON 파싱 실패 시 아래로 fallthrough
    }
  }

  const lines = trimmed.split("\n").filter((l) => l.trim());

  if (lines.length >= 2) {
    return lines.slice(0, 3).map((l) =>
      l.replace(/^[\s]*[*\-•◦\d.]+[\s]*/, "").trim()
    );
  }

  // 단일 문장이면 그대로 1줄 반환
  return [trimmed];
}

/** 내부 메타데이터 키 필터 (ep_number, parent_id, level, section_title 등) */
const METADATA_PATTERNS = /^(ep_number|parent_id|level|section_title|chunk_index|source_ref|content_id)[:_]/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}/i;
function isMetadataKey(topic: string): boolean {
  return METADATA_PATTERNS.test(topic) || UUID_PATTERN.test(topic);
}

/** URL에서 도메인 추출. YouTube는 youtube.com 반환 */
function extractDomain(sourceRef: string | null, sourceType: string | null): string | null {
  if (sourceType === "youtube") return "youtube.com";
  if (!sourceRef) return null;
  try {
    const url = new URL(sourceRef);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function getSourceIcon(sourceType: string | null) {
  switch (sourceType) {
    case "youtube": return <Youtube className="h-4 w-4 text-red-500 shrink-0" />;
    case "blueprint": return <Shield className="h-4 w-4 text-purple-500 shrink-0" />;
    case "lecture": return <GraduationCap className="h-4 w-4 text-green-600 shrink-0" />;
    case "marketing_theory": return <BookOpen className="h-4 w-4 text-orange-500 shrink-0" />;
    case "webinar": return <Mic className="h-4 w-4 text-indigo-500 shrink-0" />;
    case "papers": return <FlaskConical className="h-4 w-4 text-teal-500 shrink-0" />;
    case "file": return <FileText className="h-4 w-4 text-gray-500 shrink-0" />;
    default: return <Globe className="h-4 w-4 text-blue-500 shrink-0" />;
  }
}

export function CurationCard({
  id,
  title,
  aiSummary,
  importanceScore,
  keyTopics,
  sourceType,
  sourceRef,
  createdAt,
  linkedInfoShares,
  selected,
  onToggle,
  onDismiss,
  onGenerate,
}: CurationCardProps) {
  const summaryLines = formatSummary(aiSummary);
  const domain = extractDomain(sourceRef, sourceType);
  const dateStr = new Date(createdAt).toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
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
        {/* 제목 행 */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            {getSourceIcon(sourceType)}
            <h4 className="text-sm font-medium text-[#111827] truncate">
              {title}
            </h4>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ImportanceStars score={importanceScore} />
            <span className="text-xs text-gray-400">{dateStr}</span>
          </div>
        </div>

        {/* AI 핵심요약 — 항상 펼침 */}
        {summaryLines.length > 0 ? (
          <div className="bg-gray-50 rounded-md px-3 py-2 mb-2">
            <ul className="space-y-0.5">
              {summaryLines.map((line, i) => (
                <li key={i} className="text-xs text-gray-600 leading-relaxed flex gap-1.5">
                  <span className="text-gray-400 shrink-0">*</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic mb-2">
            AI 분석 대기중
          </p>
        )}

        {/* 생성물 연결 */}
        {linkedInfoShares.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-green-700 mb-2">
            <CornerDownRight className="h-3 w-3 shrink-0" />
            <span className="truncate">
              &quot;{linkedInfoShares[0].title}&quot;
            </span>
            <span className="text-green-600 shrink-0">발행됨</span>
          </div>
        )}

        {/* 토픽 뱃지 (내부 메타데이터 키 필터링) */}
        {keyTopics.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {keyTopics
              .filter((t) => !isMetadataKey(t))
              .map((topic) => (
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

        {/* 하단: 소스 출처 + 인라인 액션 */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="flex items-center gap-1 text-[11px] text-gray-400">
            {domain && <span>{domain}</span>}
            {domain && <span>·</span>}
            <span>{dateStr}</span>
          </div>
          <div className="flex gap-1.5">
            {sourceRef && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2 text-gray-500"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(sourceRef, "_blank");
                }}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                원문 보기
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs px-2 text-gray-500"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(id);
              }}
            >
              <X className="h-3 w-3 mr-1" />
              스킵
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs px-2 bg-[#F75D5D] hover:bg-[#E54949] text-white"
              onClick={(e) => {
                e.stopPropagation();
                onGenerate(id);
              }}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              정보공유 생성
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
