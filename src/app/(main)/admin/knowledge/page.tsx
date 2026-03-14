"use client";

// T7a: /admin/knowledge 페이지 뼈대 — 탭 3개
// T7b: 모니터링 차트 + 임베딩 현황 (이 파일에 추가)
// T6: 슬라이드 관리 탭 (이 파일에 추가)

import { useState } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Brain, BarChart3, Database, Upload, Zap } from "lucide-react";
import { toast } from "sonner";
import { jsonFetcher } from "@/lib/swr/config";
import { SWR_KEYS } from "@/lib/swr/keys";
import type { UsageRow, ChunkStat } from "./knowledge-charts";

const MonitoringCharts = dynamic(
  () => import("./knowledge-charts").then((m) => m.MonitoringCharts),
  { ssr: false }
);

const EmbeddingChart = dynamic(
  () => import("./knowledge-charts").then((m) => m.EmbeddingChart),
  { ssr: false }
);

// ─── Opus 단가 (1K tokens 기준) ─────────────────────────────

const COST_PER_1K_INPUT = 0.015; // $15/1M input
const COST_PER_1K_OUTPUT = 0.075; // $75/1M output

// ─── 메인 컴포넌트 ──────────────────────────────────────────

export default function AdminKnowledgePage() {
  const [activeTab, setActiveTab] = useState("monitoring");
  const [embeddingRunning, setEmbeddingRunning] = useState(false);

  const { data: statsData, isLoading: loading, mutate } = useSWR(
    SWR_KEYS.ADMIN_KNOWLEDGE_STATS,
    jsonFetcher,
  );
  const usageData: UsageRow[] = statsData?.usage || [];
  const chunkStats: ChunkStat[] = statsData?.chunkStats || [];
  const totalChunks: number = statsData?.totalChunks || 0;

  // ── 일별 비용 계산 ──
  const dailyCosts = usageData.reduce<Record<string, number>>((acc, row) => {
    const date = (row.created_at ?? "").split("T")[0];
    if (!date) return acc;
    // 간이 계산: total_tokens의 70%가 input, 30%가 output 가정
    const inputTokens = row.total_tokens * 0.7;
    const outputTokens = row.total_tokens * 0.3;
    const cost = (inputTokens / 1000) * COST_PER_1K_INPUT + (outputTokens / 1000) * COST_PER_1K_OUTPUT;
    acc[date] = (acc[date] || 0) + cost;
    return acc;
  }, {});
  const dailyCostChart = Object.entries(dailyCosts)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, cost]) => ({
      date: date.slice(5), // MM-DD
      cost: Math.round(cost * 100) / 100,
    }));

  // ── Consumer별 사용량 ──
  const consumerPie = usageData.reduce<Record<string, number>>((acc, row) => {
    acc[row.consumer_type] = (acc[row.consumer_type] || 0) + 1;
    return acc;
  }, {});
  const consumerPieChart = Object.entries(consumerPie).map(([name, value]) => ({ name, value }));

  // ── 평균 응답시간 (일별) ──
  const dailyDuration = usageData.reduce<Record<string, { sum: number; count: number }>>((acc, row) => {
    const date = (row.created_at ?? "").split("T")[0];
    if (!date) return acc;
    if (!acc[date]) acc[date] = { sum: 0, count: 0 };
    acc[date].sum += row.duration_ms || 0;
    acc[date].count += 1;
    return acc;
  }, {});
  const durationChart = Object.entries(dailyDuration)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, { sum, count }]) => ({
      date: date.slice(5),
      avg: count > 0 ? Math.round(sum / count / 1000 * 10) / 10 : 0, // 초 단위
    }));

  // ── 전체 재임베딩 ──
  const handleReembed = async () => {
    if (!confirm("전체 재임베딩을 시작합니다. 진행하시겠습니까?")) return;
    setEmbeddingRunning(true);
    try {
      const res = await fetch("/api/admin/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      toast.success(`임베딩 완료: 성공 ${result.success}, 연결 ${result.linked}, 실패 ${result.failed}`);
      mutate();
    } catch {
      toast.error("재임베딩 실행에 실패했습니다.");
    } finally {
      setEmbeddingRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-gray-500">
        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">지식 베이스</h1>
        <p className="text-[14px] text-gray-500 mt-1">
          AI 검색 모니터링, 임베딩 현황, 슬라이드 관리
        </p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-blue-50 p-2">
                <Database className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-[12px] text-gray-500">전체 Chunks</p>
                <p className="text-[20px] font-semibold">{totalChunks.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-green-50 p-2">
                <BarChart3 className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-[12px] text-gray-500">소스 타입</p>
                <p className="text-[20px] font-semibold">{chunkStats.length}종</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-purple-50 p-2">
                <Brain className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-[12px] text-gray-500">AI 호출 (최근 30일)</p>
                <p className="text-[20px] font-semibold">{usageData.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-orange-50 p-2">
                <Zap className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <p className="text-[12px] text-gray-500">예상 월 비용</p>
                <p className="text-[20px] font-semibold">
                  ${Object.values(dailyCosts).reduce((a, b) => a + b, 0) > 0
                    ? (Object.values(dailyCosts).reduce((a, b) => a + b, 0) / Object.keys(dailyCosts).length * 30).toFixed(0)
                    : "0"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 탭 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="line">
          <TabsTrigger value="monitoring" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            모니터링
          </TabsTrigger>
          <TabsTrigger value="embeddings" className="gap-1.5">
            <Database className="h-4 w-4" />
            임베딩 현황
          </TabsTrigger>
          <TabsTrigger value="slides" className="gap-1.5">
            <Upload className="h-4 w-4" />
            슬라이드 관리
          </TabsTrigger>
        </TabsList>

        {/* ── 모니터링 탭 ── */}
        <TabsContent value="monitoring" className="space-y-6 mt-4">
          <MonitoringCharts
            dailyCostChart={dailyCostChart}
            consumerPieChart={consumerPieChart}
            durationChart={durationChart}
          />

          {/* 최근 10건 */}
          <Card>
            <CardContent className="pt-5">
              <h3 className="text-[14px] font-semibold text-gray-700 mb-4">최근 AI 호출</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 pr-4">시간</th>
                      <th className="pb-2 pr-4">Consumer</th>
                      <th className="pb-2 pr-4">토큰</th>
                      <th className="pb-2 pr-4">응답(초)</th>
                      <th className="pb-2">모델</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageData.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2 pr-4 text-gray-500">
                          {new Date(row.created_at).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant="secondary" className="text-[11px]">{row.consumer_type}</Badge>
                        </td>
                        <td className="py-2 pr-4 tabular-nums">{row.total_tokens.toLocaleString()}</td>
                        <td className="py-2 pr-4 tabular-nums">{((row.duration_ms || 0) / 1000).toFixed(1)}</td>
                        <td className="py-2 text-gray-400 text-[11px]">{row.model}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 임베딩 현황 탭 ── */}
        <TabsContent value="embeddings" className="space-y-6 mt-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[14px] font-semibold text-gray-700">source_type별 Chunk 분포</h3>
                <Button
                  onClick={handleReembed}
                  disabled={embeddingRunning}
                  variant="outline"
                  size="sm"
                >
                  {embeddingRunning ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  전체 재임베딩
                </Button>
              </div>
              <EmbeddingChart chunkStats={chunkStats} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 슬라이드 관리 탭 (T6 placeholder) ── */}
        <TabsContent value="slides" className="mt-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20">
              <Upload className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-[15px] font-medium text-gray-500">슬라이드 관리</p>
              <p className="text-[13px] text-gray-400 mt-1">
                PPT 슬라이드를 업로드하고 자동 임베딩합니다. (준비 중)
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
