"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Shield, GraduationCap, Youtube, Globe, BookOpen,
  Mic, FlaskConical, FileText, Database, Loader2,
  BookMarked, Search, BarChart3, ChevronDown, ChevronUp,
} from "lucide-react";
import { getPipelineStats, getCurationSummaryStats, type PipelineStat } from "@/actions/curation";

interface PipelineSidebarProps {
  onSourceSelect: (sourceType: string) => void;
  activeSource: string;
}

const SOURCE_ICONS: Record<string, { icon: typeof Shield; color: string }> = {
  blueprint: { icon: Shield, color: "text-purple-500" },
  lecture: { icon: GraduationCap, color: "text-green-600" },
  youtube: { icon: Youtube, color: "text-red-500" },
  crawl: { icon: Globe, color: "text-blue-500" },
  marketing_theory: { icon: BookOpen, color: "text-orange-500" },
  webinar: { icon: Mic, color: "text-indigo-500" },
  papers: { icon: FlaskConical, color: "text-teal-500" },
  file: { icon: FileText, color: "text-gray-500" },
};

const CURRICULUM_SOURCES = new Set(["blueprint", "lecture"]);

export function PipelineSidebar({ onSourceSelect, activeSource }: PipelineSidebarProps) {
  const [stats, setStats] = useState<PipelineStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryStats, setSummaryStats] = useState<{ total: number; withSummary: number; withoutSummary: number } | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      getPipelineStats(),
      getCurationSummaryStats(),
    ]).then(([pStats, sStats]) => {
      setStats(pStats);
      setSummaryStats(sStats);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="w-[220px] shrink-0 flex items-center justify-center py-12">
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      </div>
    );
  }

  const curriculumStats = stats.filter((s) => CURRICULUM_SOURCES.has(s.sourceType));
  const curationStats = stats.filter((s) => !CURRICULUM_SOURCES.has(s.sourceType));
  const totalContents = stats.reduce((s, x) => s + x.contentsCount, 0);

  const renderSourceButton = (stat: PipelineStat) => {
    const iconDef = SOURCE_ICONS[stat.sourceType] || { icon: FileText, color: "text-gray-400" };
    const Icon = iconDef.icon;
    const isActive = activeSource === stat.sourceType;

    return (
      <button
        key={stat.sourceType}
        onClick={() => onSourceSelect(stat.sourceType)}
        className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
          isActive
            ? "border-[#F75D5D] bg-red-50/50"
            : "border-gray-200 hover:bg-gray-50"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`h-3.5 w-3.5 ${iconDef.color}`} />
            <span className="text-xs font-medium text-[#111827]">{stat.label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-gray-400">{stat.contentsCount}건</span>
            {stat.newCount > 0 && (
              <Badge className="h-4 px-1 text-[9px] bg-[#F75D5D] text-white">
                NEW
              </Badge>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="w-[220px] shrink-0 space-y-4">
      {/* 커리큘럼 소스 */}
      {curriculumStats.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 px-1">
            <BookMarked className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              커리큘럼 소스
            </span>
          </div>
          {curriculumStats.map(renderSourceButton)}
        </div>
      )}

      {/* 큐레이션 소스 */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 px-1">
          <Search className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            큐레이션 소스
          </span>
        </div>

        {/* 전체 */}
        <button
          onClick={() => onSourceSelect("all")}
          className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
            activeSource === "all"
              ? "border-[#F75D5D] bg-red-50/50"
              : "border-gray-200 hover:bg-gray-50"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-gray-500" />
              <span className="text-xs font-medium text-[#111827]">전체</span>
            </div>
            <span className="text-[11px] text-gray-400">{totalContents}건</span>
          </div>
        </button>

        {curationStats.map(renderSourceButton)}
      </div>

      {/* 통계 */}
      {summaryStats && (
        <div className="space-y-1.5">
          <button
            onClick={() => setStatsOpen(!statsOpen)}
            className="flex items-center justify-between w-full px-1"
          >
            <div className="flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                통계
              </span>
            </div>
            {statsOpen ? (
              <ChevronUp className="h-3 w-3 text-gray-400" />
            ) : (
              <ChevronDown className="h-3 w-3 text-gray-400" />
            )}
          </button>

          {statsOpen && (
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-500">전체</span>
                <span className="font-medium text-[#111827]">{summaryStats.total}건</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-500">AI 요약 완료</span>
                <span className="font-medium text-green-600">{summaryStats.withSummary}건</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-500">미처리</span>
                <span className="font-medium text-orange-500">{summaryStats.withoutSummary}건</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
