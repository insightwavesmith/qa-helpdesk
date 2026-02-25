"use client";

import { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Clock,
  Info,
} from "lucide-react";

// ── 타입 ────────────────────────────────────────────────────────
interface OverlapPair {
  adset_a_name: string;
  adset_b_name: string;
  campaign_a: string;
  campaign_b: string;
  overlap_rate: number;
}

export interface OverlapData {
  overall_rate: number;
  total_unique: number;
  individual_sum: number;
  cached_at: string;
  pairs: OverlapPair[];
}

interface OverlapAnalysisProps {
  accountId: string | null;
  dateRange: { start: string; end: string };
  overlapData: OverlapData | null;
  isLoading: boolean;
  onRefresh: () => void;
  error: string | null;
}

// ── 포맷 ────────────────────────────────────────────────────────
function fmtNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

// ── 상태 뱃지 ───────────────────────────────────────────────────
function StatusBadge({ rate }: { rate: number }) {
  if (rate >= 60)
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        심각
      </span>
    );
  if (rate >= 30)
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
        주의
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      양호
    </span>
  );
}

// ── 컴포넌트 ────────────────────────────────────────────────────
export function OverlapAnalysis({
  accountId,
  dateRange,
  overlapData,
  isLoading,
  onRefresh,
  error,
}: OverlapAnalysisProps) {
  const [guideOpen, setGuideOpen] = useState(false);
  const [sortKey, setSortKey] = useState<"rate" | "name">("rate");
  const [sortAsc, setSortAsc] = useState(false);

  // 계정 미선택
  if (!accountId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <BarChart3 className="h-10 w-10" />
        <p className="mt-3 text-base font-medium">광고계정을 선택하세요</p>
        <p className="mt-1 text-sm">
          위 드롭다운에서 분석할 광고계정을 선택하면 타겟중복 분석이 시작됩니다
        </p>
      </div>
    );
  }

  // 기간 7일 미만 안내
  if (daysBetween(dateRange.start, dateRange.end) < 7) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Info className="h-10 w-10" />
        <p className="mt-3 text-base font-medium">
          7일 이상 기간을 선택해주세요
        </p>
        <p className="mt-1 text-sm">
          타겟중복 분석은 정확도를 위해 최소 7일 이상의 데이터가 필요합니다
        </p>
      </div>
    );
  }

  // 로딩
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[200px] w-full rounded-lg" />
        <Skeleton className="h-[150px] w-full rounded-lg" />
        <Skeleton className="h-[300px] w-full rounded-lg" />
      </div>
    );
  }

  // 에러
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          다시 시도
        </Button>
      </div>
    );
  }

  // 데이터 없음
  if (!overlapData) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <BarChart3 className="h-10 w-10" />
        <p className="mt-3 text-base font-medium">분석 데이터가 없습니다</p>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          분석 시작
        </Button>
      </div>
    );
  }

  const { overall_rate, total_unique, individual_sum, cached_at, pairs } =
    overlapData;
  const wastedReach = individual_sum - total_unique;
  const dangerPairs = pairs.filter((p) => p.overlap_rate >= 60);

  // 정렬
  const sortedPairs = [...pairs].sort((a, b) => {
    if (sortKey === "rate") {
      return sortAsc
        ? a.overlap_rate - b.overlap_rate
        : b.overlap_rate - a.overlap_rate;
    }
    const nameA = `${a.campaign_a} ${a.adset_a_name}`;
    const nameB = `${b.campaign_a} ${b.adset_a_name}`;
    return sortAsc ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
  });

  const toggleSort = (key: "rate" | "name") => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  // 도넛 데이터
  const donutData = [
    { name: "중복", value: overall_rate },
    { name: "고유", value: Math.max(0, 100 - overall_rate) },
  ];
  const DONUT_COLORS = ["#F75D5D", "#E5E7EB"];

  // 세트별 최고중복 계산
  const maxOverlapByAdset: Record<string, number> = {};
  for (const p of pairs) {
    const keyA = `${p.campaign_a}|${p.adset_a_name}`;
    const keyB = `${p.campaign_b}|${p.adset_b_name}`;
    maxOverlapByAdset[keyA] = Math.max(
      maxOverlapByAdset[keyA] ?? 0,
      p.overlap_rate
    );
    maxOverlapByAdset[keyB] = Math.max(
      maxOverlapByAdset[keyB] ?? 0,
      p.overlap_rate
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── 히어로: 전체 중복률 ─────────────────────────────── */}
      <Card>
        <CardContent className="flex flex-col items-center gap-6 py-6 sm:flex-row">
          {/* 도넛 차트 */}
          <div className="h-[160px] w-[160px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  dataKey="value"
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  {donutData.map((_, idx) => (
                    <Cell key={idx} fill={DONUT_COLORS[idx]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <p className="-mt-[100px] text-center text-2xl font-bold">
              {overall_rate.toFixed(1)}%
            </p>
            <p className="mt-1 text-center text-xs text-muted-foreground">
              전체 중복률
            </p>
          </div>

          {/* 수치 */}
          <div className="grid flex-1 grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-muted-foreground">실제 도달</p>
              <p className="text-xl font-bold">{fmtNumber(total_unique)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">개별합</p>
              <p className="text-xl font-bold">{fmtNumber(individual_sum)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">중복 낭비</p>
              <p className="text-xl font-bold text-[#F75D5D]">
                {fmtNumber(wastedReach)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 위험 경고: 60% 이상 조합 ───────────────────────── */}
      {dangerPairs.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-red-700">
              <AlertTriangle className="h-4 w-4" />
              중복률 60% 이상 조합 ({dangerPairs.length}건)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dangerPairs.map((p, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-md bg-white/70 px-3 py-2 text-sm"
              >
                <div className="flex-1">
                  <span className="font-medium">{p.campaign_a}</span>
                  <span className="mx-1 text-muted-foreground">/</span>
                  <span>{p.adset_a_name}</span>
                  <span className="mx-2 text-muted-foreground">↔</span>
                  <span className="font-medium">{p.campaign_b}</span>
                  <span className="mx-1 text-muted-foreground">/</span>
                  <span>{p.adset_b_name}</span>
                </div>
                <span className="ml-4 font-bold text-red-700">
                  {p.overlap_rate}%
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── 전체 조합 테이블 ────────────────────────────────── */}
      {sortedPairs.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">광고세트 조합별 중복률</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              새로 분석
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort("name")}
                    >
                      캠페인 / 광고세트 A
                      {sortKey === "name" &&
                        (sortAsc ? (
                          <ChevronUp className="ml-1 inline h-3 w-3" />
                        ) : (
                          <ChevronDown className="ml-1 inline h-3 w-3" />
                        ))}
                    </TableHead>
                    <TableHead>캠페인 / 광고세트 B</TableHead>
                    <TableHead
                      className="cursor-pointer select-none text-right"
                      onClick={() => toggleSort("rate")}
                    >
                      중복률
                      {sortKey === "rate" &&
                        (sortAsc ? (
                          <ChevronUp className="ml-1 inline h-3 w-3" />
                        ) : (
                          <ChevronDown className="ml-1 inline h-3 w-3" />
                        ))}
                    </TableHead>
                    <TableHead className="text-center">상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedPairs.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          {p.campaign_a}
                        </div>
                        <div className="font-medium">{p.adset_a_name}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          {p.campaign_b}
                        </div>
                        <div className="font-medium">{p.adset_b_name}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {p.overlap_rate}%
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusBadge rate={p.overlap_rate} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 하단: 분석 시각 + 해석 가이드 ──────────────────── */}
      <div className="flex flex-col gap-3">
        {/* 마지막 분석 시각 */}
        {cached_at && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            마지막 분석:{" "}
            {new Date(cached_at).toLocaleString("ko-KR", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}

        {/* 해석 가이드 */}
        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setGuideOpen(!guideOpen)}
        >
          <Info className="h-3 w-3" />
          해석 가이드
          {guideOpen ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>

        {guideOpen && (
          <Card className="bg-muted/50">
            <CardContent className="space-y-2 py-4 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">전체 중복률</strong> ={" "}
                (개별 도달 합계 - 실제 고유 도달) / 개별 도달 합계 × 100
              </p>
              <p>
                <strong className="text-foreground">60% 이상</strong>: 두
                광고세트가 거의 같은 사람에게 노출됩니다. 하나를 끄거나 타겟을
                조정하세요.
              </p>
              <p>
                <strong className="text-foreground">30~60%</strong>: 일부 중복이
                있습니다. 타겟 세분화를 권장합니다.
              </p>
              <p>
                <strong className="text-foreground">30% 미만</strong>: 양호한
                수준입니다. 각 광고세트가 서로 다른 사람에게 도달하고 있습니다.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
