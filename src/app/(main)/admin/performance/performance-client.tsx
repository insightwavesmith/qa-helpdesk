"use client";

import { useState, useMemo } from "react";
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
import { Users, DollarSign, TrendingUp, ShoppingCart, ArrowUpDown } from "lucide-react";
import type { StudentPerformanceRow, PerformanceSummary } from "@/actions/performance";

interface Props {
  initialRows: StudentPerformanceRow[];
  initialSummary: PerformanceSummary;
  cohorts: { id: string; name: string }[];
}

type SortKey = "roas" | "spend" | "revenue" | "purchases";

function formatKRW(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}백만`;
  if (value >= 10_000) return `${Math.round(value / 10_000)}만`;
  return `₩${Math.round(value).toLocaleString()}`;
}

export function PerformanceClient({ initialRows, initialSummary, cohorts }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [summary, setSummary] = useState(initialSummary);
  const [cohortFilter, setCohortFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("roas");
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCohortChange = async (value: string) => {
    setCohortFilter(value);
    setLoading(true);
    try {
      const { getStudentPerformance } = await import("@/actions/performance");
      const result = await getStudentPerformance(value === "all" ? undefined : value);
      setRows(result.rows);
      setSummary(result.summary);
    } finally {
      setLoading(false);
    }
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
      const diff = a[sortKey] - b[sortKey];
      return sortAsc ? diff : -diff;
    });
  }, [rows, sortKey, sortAsc]);

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
      label: "총 광고비 (30일)",
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
      label: "총 매출 (30일)",
      value: formatKRW(summary.totalRevenue),
      icon: ShoppingCart,
      accentColor: "border-l-[#F75D5D]",
      iconBg: "bg-red-50",
      iconColor: "text-[#F75D5D]",
    },
  ];

  return (
    <div className="space-y-6">
      {/* 기수 필터 */}
      <div className="flex items-center gap-3">
        <Select value={cohortFilter} onValueChange={handleCohortChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="기수 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 기수</SelectItem>
            {cohorts.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loading && (
          <span className="text-sm text-muted-foreground">불러오는 중...</span>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                <p className="text-[32px] font-bold text-gray-900">{stat.value}</p>
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
                    매출
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
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
