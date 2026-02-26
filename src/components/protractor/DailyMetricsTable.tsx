"use client";

import { useState, useMemo } from "react";
import { ArrowDown, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

interface DailyMetric {
  date: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  adSpend: number;
  revenue: number;
  roas: number;
  conversions: number;
}

type SortKey = keyof DailyMetric;
type SortDir = "asc" | "desc";

interface DailyMetricsTableProps {
  data?: DailyMetric[];
}

const columns: { key: SortKey; label: string }[] = [
  { key: "date", label: "날짜" },
  { key: "impressions", label: "노출수" },
  { key: "clicks", label: "클릭수" },
  { key: "ctr", label: "CTR" },
  { key: "cpc", label: "CPC" },
  { key: "adSpend", label: "광고비" },
  { key: "revenue", label: "광고매출" },
  { key: "roas", label: "ROAS" },
  { key: "conversions", label: "전환수" },
];

function fmtNum(n: number): string {
  return n.toLocaleString("ko-KR");
}

function formatCell(key: SortKey, value: number | string): string {
  if (key === "date") return String(value);
  const n = Number(value);
  switch (key) {
    case "ctr":
      return `${n}%`;
    case "cpc":
      return `₩${fmtNum(n)}`;
    case "adSpend":
    case "revenue":
      return `₩${fmtNum(n)}`;
    case "roas":
      return `${n}%`;
    default:
      return fmtNum(n);
  }
}

export function DailyMetricsTable({
  data = [],
}: DailyMetricsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      <div className="border-b border-border px-6 py-4">
        <h3 className="text-sm font-semibold text-card-foreground">
          일별 성과 상세
        </h3>
        <p className="text-xs text-muted-foreground">
          헤더를 클릭하여 정렬할 수 있습니다
        </p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead key={col.key} className="whitespace-nowrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8 gap-1 px-3 text-xs font-semibold text-muted-foreground hover:text-card-foreground"
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    {sortKey === col.key ? (
                      <ArrowDown
                        className={`h-3 w-3 transition-transform ${
                          sortDir === "asc" ? "rotate-180" : ""
                        }`}
                      />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </Button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                  표시할 데이터가 없습니다
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((row) => (
                <TableRow key={row.date}>
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className="whitespace-nowrap text-xs tabular-nums"
                    >
                      {formatCell(col.key, row[col.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
