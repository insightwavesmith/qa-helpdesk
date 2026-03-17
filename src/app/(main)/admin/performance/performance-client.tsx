"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Users, DollarSign, TrendingUp, ShoppingCart, ArrowUpDown, Award, Store } from "lucide-react";
import type { StudentPerformanceRow, PerformanceSummary } from "@/actions/performance";

interface Props {
  initialRows: StudentPerformanceRow[];
  initialSummary: PerformanceSummary;
  cohorts: { id: string; name: string }[];
  initialCohort?: string;
  initialPeriod?: number;
}

type SortKey = "roas" | "spend" | "revenue" | "purchases" | "t3Score" | "mixpanelRevenue";

const PERIOD_OPTIONS = [
  { value: "7", label: "7일" },
  { value: "14", label: "14일" },
  { value: "30", label: "30일" },
];

function formatKRW(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}백만`;
  if (value >= 10_000) return `${Math.round(value / 10_000)}만`;
  return `₩${Math.round(value).toLocaleString()}`;
}

// T3: 성과 등급 계산 — roas는 비율(3.0 = 300%), spend는 원화
function getPerformanceGrade(roas: number, spend: number): {
  label: string;
  emoji: string;
  className: string;
} {
  if (spend === 0) {
    return { label: "데이터없음", emoji: "⚪", className: "bg-gray-100 text-gray-500" };
  }
  if (roas >= 3.0 && spend >= 10000) {
    return { label: "우수", emoji: "🥇", className: "bg-amber-50 text-amber-700 border border-amber-200" };
  }
  if (roas >= 1.0) {
    return { label: "보통", emoji: "🥈", className: "bg-blue-50 text-blue-700 border border-blue-200" };
  }
  return { label: "미달", emoji: "🔴", className: "bg-red-50 text-red-700 border border-red-200" };
}

export function PerformanceClient({
  initialRows,
  initialSummary,
  cohorts,
  initialCohort = "",
  initialPeriod = 30,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState(initialRows);
  const [summary, setSummary] = useState(initialSummary);
  const [cohortFilter, setCohortFilter] = useState<string>(initialCohort || "all");
  const [periodFilter, setPeriodFilter] = useState<string>(String(initialPeriod));
  const [sortKey, setSortKey] = useState<SortKey>("roas");
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(false);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value && value !== "all" && value !== "30") {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });
      router.push(`/admin/performance${params.toString() ? `?${params.toString()}` : ""}`);
    },
    [router, searchParams],
  );

  const fetchData = async (cohort: string, period: string) => {
    setLoading(true);
    try {
      const { getStudentPerformance } = await import("@/actions/performance");
      const result = await getStudentPerformance(
        cohort === "all" ? undefined : cohort,
        parseInt(period, 10),
      );
      setRows(result.rows);
      setSummary(result.summary);
    } finally {
      setLoading(false);
    }
  };

  // B1: cohort 드롭다운 value를 c.name (텍스트)으로 사용
  const handleCohortChange = async (value: string) => {
    setCohortFilter(value);
    updateParams({ cohort: value === "all" ? "" : value, period: periodFilter });
    await fetchData(value, periodFilter);
  };

  const handlePeriodChange = async (value: string) => {
    setPeriodFilter(value);
    updateParams({ cohort: cohortFilter === "all" ? "" : cohortFilter, period: value });
    await fetchData(cohortFilter, value);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      let diff: number;
      if (sortKey === "t3Score") {
        diff = (a.t3Score ?? -1) - (b.t3Score ?? -1);
      } else if (sortKey === "mixpanelRevenue") {
        diff = (a.mixpanelRevenue ?? 0) - (b.mixpanelRevenue ?? 0);
      } else {
        diff = a[sortKey] - b[sortKey];
      }
      return sortAsc ? diff : -diff;
    });
  }, [rows, sortKey, sortAsc]);

  // B4: 라벨 동적화 — "(30일)" → 선택 기간에 따라 변경
  const periodLabel = `(${periodFilter}일)`;

  const statCards = [
    {
      label: "관리 수강생",
      value: summary.totalStudents.toString(),
      icon: Users,
      accentColor: "border-l-blue-500",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-500",
    },
    {
      label: `총 광고비 ${periodLabel}`,
      value: formatKRW(summary.totalSpend),
      icon: DollarSign,
      accentColor: "border-l-purple-500",
      iconBg: "bg-purple-50",
      iconColor: "text-purple-500",
    },
    {
      label: "평균 ROAS",
      value: `${(summary.avgRoas * 100).toFixed(0)}%`,
      icon: TrendingUp,
      accentColor: "border-l-emerald-500",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-500",
    },
    {
      label: `총 광고매출 ${periodLabel}`,
      value: formatKRW(summary.totalRevenue),
      icon: ShoppingCart,
      accentColor: "border-l-[#F75D5D]",
      iconBg: "bg-red-50",
      iconColor: "text-[#F75D5D]",
    },
  ];

  // E9: 총 자사몰매출 카드 추가
  const totalMixpanelRevenue = summary.totalMixpanelRevenue ?? rows.reduce((s, r) => s + (r.mixpanelRevenue ?? 0), 0);
  if (totalMixpanelRevenue > 0) {
    statCards.push({
      label: `총 자사몰매출 ${periodLabel}`,
      value: formatKRW(totalMixpanelRevenue),
      icon: Store,
      accentColor: "border-l-teal-500",
      iconBg: "bg-teal-50",
      iconColor: "text-teal-500",
    });
  }

  // T4: 평균 T3 점수 카드 추가
  const t3Rows = rows.filter((r) => r.t3Score != null && r.t3Score > 0);
  const avgT3 = t3Rows.length > 0
    ? Math.round(t3Rows.reduce((s, r) => s + (r.t3Score ?? 0), 0) / t3Rows.length)
    : null;

  if (avgT3 != null) {
    statCards.push({
      label: `평균 T3 점수 ${periodLabel}`,
      value: `${avgT3}점`,
      icon: Award,
      accentColor: "border-l-indigo-500",
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-500",
    });
  }

  return (
    <div className="space-y-6">
      {/* 기수 + 기간 필터 */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <Select value={cohortFilter} onValueChange={handleCohortChange}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="기수 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 기수</SelectItem>
            {/* B1: value를 c.name (텍스트)으로 사용 */}
            {cohorts.map((c) => (
              <SelectItem key={c.id} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={periodFilter} onValueChange={handlePeriodChange}>
          <SelectTrigger className="w-full sm:w-[120px]">
            <SelectValue placeholder="기간 선택" />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loading && (
          <span className="text-sm text-muted-foreground">불러오는 중...</span>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card
              key={stat.label}
              className={`bg-white rounded-xl shadow-sm border border-gray-200 border-l-4 ${stat.accentColor} p-6`}
            >
              <CardHeader className="p-0 pb-3">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {stat.label}
                  </CardDescription>
                  <div className={`${stat.iconBg} p-2 rounded-lg`}>
                    <Icon className={`h-4 w-4 ${stat.iconColor}`} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <p className="text-2xl md:text-[32px] font-bold text-gray-900">{stat.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 테이블 */}
      {sortedRows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          해당 기수에 수강생 데이터가 없습니다.
        </div>
      ) : (
        <>
          {/* 데스크탑 테이블 */}
          <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                  <TableHead className="text-xs font-medium text-gray-500 uppercase">
                    이름
                  </TableHead>
                  <TableHead className="text-xs font-medium text-gray-500 uppercase">
                    기수
                  </TableHead>
                  <TableHead className="text-xs font-medium text-gray-500 uppercase">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs font-medium text-gray-500 uppercase hover:text-gray-700"
                      onClick={() => handleSort("spend")}
                    >
                      광고비
                      <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-xs font-medium text-gray-500 uppercase">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs font-medium text-gray-500 uppercase hover:text-gray-700"
                      onClick={() => handleSort("revenue")}
                    >
                      광고매출
                      <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-xs font-medium text-gray-500 uppercase">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs font-medium text-gray-500 uppercase hover:text-gray-700"
                      onClick={() => handleSort("roas")}
                    >
                      ROAS
                      <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-xs font-medium text-gray-500 uppercase">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs font-medium text-gray-500 uppercase hover:text-gray-700"
                      onClick={() => handleSort("purchases")}
                    >
                      구매수
                      <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-xs font-medium text-gray-500 uppercase">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs font-medium text-gray-500 uppercase hover:text-gray-700"
                      onClick={() => handleSort("mixpanelRevenue")}
                    >
                      자사몰매출
                      <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-xs font-medium text-gray-500 uppercase">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs font-medium text-gray-500 uppercase hover:text-gray-700"
                      onClick={() => handleSort("t3Score")}
                    >
                      T3 점수
                      <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-xs font-medium text-gray-500 uppercase">
                    등급
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((row) => {
                  const roasPercent = row.roas * 100;
                  const roasColor =
                    roasPercent >= 300
                      ? "text-emerald-700 bg-emerald-50"
                      : roasPercent < 100 && roasPercent > 0
                        ? "text-red-700 bg-red-50"
                        : "";
                  // T3: 성과 등급 (B2: roas 비율 기준 사용)
                  const grade = getPerformanceGrade(row.roas, row.spend);
                  return (
                    <TableRow
                      key={row.userId}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      <TableCell className="font-medium text-gray-900">
                        {row.name}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {row.cohort ?? "-"}
                      </TableCell>
                      <TableCell className="text-sm text-gray-900 font-mono">
                        {row.spend > 0 ? `₩${Math.round(row.spend).toLocaleString()}` : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-gray-900 font-mono">
                        {row.revenue > 0 ? `₩${Math.round(row.revenue).toLocaleString()}` : "-"}
                      </TableCell>
                      <TableCell>
                        {row.roas > 0 ? (
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${roasColor}`}
                          >
                            {roasPercent.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-900 font-mono">
                        {row.purchases > 0 ? row.purchases.toLocaleString() : "-"}
                      </TableCell>
                      {/* E9: 자사몰매출 */}
                      <TableCell className="text-sm text-gray-900 font-mono">
                        {row.mixpanelRevenue != null && row.mixpanelRevenue > 0
                          ? `₩${Math.round(row.mixpanelRevenue).toLocaleString()}`
                          : "-"}
                      </TableCell>
                      {/* T4: T3 점수 */}
                      <TableCell className="text-sm font-mono">
                        {row.t3Score != null ? (
                          <span className="flex items-center gap-1">
                            <span className="font-medium text-gray-900">{row.t3Score}</span>
                            {row.t3Grade && (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                row.t3Grade === "A" ? "bg-emerald-50 text-emerald-700" :
                                row.t3Grade === "B" ? "bg-blue-50 text-blue-700" :
                                row.t3Grade === "C" ? "bg-amber-50 text-amber-700" :
                                row.t3Grade === "D" ? "bg-orange-50 text-orange-700" :
                                "bg-red-50 text-red-700"
                              }`}>
                                {row.t3Grade}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      {/* T3: 성과 등급 배지 */}
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${grade.className}`}
                        >
                          {grade.emoji} {grade.label}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* 모바일 카드 */}
          <div className="md:hidden space-y-3">
            {sortedRows.map((row) => {
              const roasPercent = row.roas * 100;
              const grade = getPerformanceGrade(row.roas, row.spend);
              return (
                <div key={row.userId} className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{row.name}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${grade.className}`}>
                      {grade.emoji} {grade.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {row.cohort && <span>{row.cohort}</span>}
                    {row.roas > 0 && (
                      <span className={`rounded-full px-2 py-0.5 font-medium ${roasPercent >= 300 ? "text-emerald-700 bg-emerald-50" : roasPercent < 100 && roasPercent > 0 ? "text-red-700 bg-red-50" : ""}`}>
                        ROAS {roasPercent.toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <div className="text-gray-500">광고비</div>
                    <div className="text-right font-mono text-gray-900">{row.spend > 0 ? `₩${Math.round(row.spend).toLocaleString()}` : "-"}</div>
                    <div className="text-gray-500">광고매출</div>
                    <div className="text-right font-mono text-gray-900">{row.revenue > 0 ? `₩${Math.round(row.revenue).toLocaleString()}` : "-"}</div>
                    <div className="text-gray-500">구매수</div>
                    <div className="text-right font-mono text-gray-900">{row.purchases > 0 ? row.purchases.toLocaleString() : "-"}</div>
                    {row.mixpanelRevenue != null && row.mixpanelRevenue > 0 && (
                      <>
                        <div className="text-gray-500">자사몰매출</div>
                        <div className="text-right font-mono text-gray-900">₩{Math.round(row.mixpanelRevenue).toLocaleString()}</div>
                      </>
                    )}
                    {row.t3Score != null && (
                      <>
                        <div className="text-gray-500">T3 점수</div>
                        <div className="text-right font-mono">
                          <span className="font-medium text-gray-900">{row.t3Score}</span>
                          {row.t3Grade && (
                            <span className={`ml-1 text-xs px-1 py-0.5 rounded ${
                              row.t3Grade === "A" ? "bg-emerald-50 text-emerald-700" :
                              row.t3Grade === "B" ? "bg-blue-50 text-blue-700" :
                              row.t3Grade === "C" ? "bg-amber-50 text-amber-700" :
                              row.t3Grade === "D" ? "bg-orange-50 text-orange-700" :
                              "bg-red-50 text-red-700"
                            }`}>{row.t3Grade}</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
