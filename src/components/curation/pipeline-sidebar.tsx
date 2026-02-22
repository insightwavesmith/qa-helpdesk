"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Shield, GraduationCap, Youtube, Globe, BookOpen,
  Mic, FlaskConical, FileText, Database, Loader2,
} from "lucide-react";
import { getPipelineStats, type PipelineStat } from "@/actions/curation";

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

export function PipelineSidebar({ onSourceSelect, activeSource }: PipelineSidebarProps) {
  const [stats, setStats] = useState<PipelineStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPipelineStats()
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="w-[220px] shrink-0 flex items-center justify-center py-12">
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      </div>
    );
  }

  const totalContents = stats.reduce((s, x) => s + x.contentsCount, 0);
  const totalChunks = stats.reduce((s, x) => s + x.chunksCount, 0);

  return (
    <div className="w-[220px] shrink-0 space-y-2">
      {/* 전체 요약 */}
      <button
        onClick={() => onSourceSelect("all")}
        className={`w-full text-left rounded-lg border p-3 transition-colors ${
          activeSource === "all"
            ? "border-[#F75D5D] bg-red-50/50"
            : "border-gray-200 hover:bg-gray-50"
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <Database className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-semibold text-[#111827]">전체</span>
        </div>
        <div className="flex gap-3 text-[11px] text-gray-500">
          <span>콘텐츠 {totalContents}</span>
          <span>청크 {totalChunks.toLocaleString()}</span>
        </div>
      </button>

      {/* 소스별 카드 */}
      {stats.map((stat) => {
        const iconDef = SOURCE_ICONS[stat.sourceType] || { icon: FileText, color: "text-gray-400" };
        const Icon = iconDef.icon;
        const isActive = activeSource === stat.sourceType;

        return (
          <button
            key={stat.sourceType}
            onClick={() => onSourceSelect(stat.sourceType)}
            className={`w-full text-left rounded-lg border p-3 transition-colors ${
              isActive
                ? "border-[#F75D5D] bg-red-50/50"
                : "border-gray-200 hover:bg-gray-50"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Icon className={`h-3.5 w-3.5 ${iconDef.color}`} />
                <span className="text-xs font-medium text-[#111827]">{stat.label}</span>
              </div>
              {stat.newCount > 0 && (
                <Badge className="h-4 px-1 text-[9px] bg-[#F75D5D] text-white">
                  NEW
                </Badge>
              )}
            </div>
            <div className="flex gap-3 text-[11px] text-gray-400">
              <span>{stat.contentsCount}개</span>
              <span>{stat.chunksCount.toLocaleString()} 청크</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
