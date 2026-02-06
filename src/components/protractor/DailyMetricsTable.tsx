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

const defaultData: DailyMetric[] = [
  { date: "2/6", impressions: 155470, clicks: 3168, ctr: 2.04, cpc: 200, adSpend: 636374, revenue: 4515870, roas: 710, conversions: 112 },
  { date: "2/5", impressions: 133477, clicks: 3517, ctr: 2.63, cpc: 203, adSpend: 715567, revenue: 5504253, roas: 769, conversions: 102 },
  { date: "2/4", impressions: 197523, clicks: 4203, ctr: 2.13, cpc: 139, adSpend: 584694, revenue: 3793727, roas: 649, conversions: 110 },
  { date: "2/3", impressions: 145657, clicks: 3608, ctr: 2.48, cpc: 200, adSpend: 724340, revenue: 5241471, roas: 724, conversions: 125 },
  { date: "2/2", impressions: 191848, clicks: 5966, ctr: 3.11, cpc: 98, adSpend: 588476, revenue: 3333584, roas: 566, conversions: 171 },
  { date: "2/1", impressions: 142600, clicks: 3823, ctr: 2.68, cpc: 157, adSpend: 603165, revenue: 3467596, roas: 575, conversions: 162 },
  { date: "1/9", impressions: 163189, clicks: 4839, ctr: 2.97, cpc: 144, adSpend: 698211, revenue: 4707882, roas: 674, conversions: 140 },
  { date: "1/8", impressions: 176047, clicks: 3306, ctr: 1.88, cpc: 208, adSpend: 687685, revenue: 4285810, roas: 623, conversions: 144 },
  { date: "1/31", impressions: 132700, clicks: 2445, ctr: 1.84, cpc: 280, adSpend: 686164, revenue: 4313062, roas: 629, conversions: 84 },
  { date: "1/30", impressions: 121761, clicks: 2592, ctr: 2.13, cpc: 264, adSpend: 686230, revenue: 5142579, roas: 749, conversions: 93 },
  { date: "1/29", impressions: 132055, clicks: 2949, ctr: 2.23, cpc: 224, adSpend: 663336, revenue: 4863445, roas: 733, conversions: 88 },
  { date: "1/28", impressions: 156447, clicks: 4877, ctr: 3.12, cpc: 115, adSpend: 562968, revenue: 3996835, roas: 710, conversions: 185 },
  { date: "1/27", impressions: 143080, clicks: 2581, ctr: 1.8, cpc: 233, adSpend: 603560, revenue: 3374418, roas: 559, conversions: 89 },
  { date: "1/26", impressions: 168644, clicks: 4702, ctr: 2.79, cpc: 150, adSpend: 705883, revenue: 5421857, roas: 768, conversions: 137 },
  { date: "1/25", impressions: 193491, clicks: 4221, ctr: 2.18, cpc: 170, adSpend: 720919, revenue: 4612448, roas: 640, conversions: 185 },
  { date: "1/24", impressions: 122756, clicks: 2789, ctr: 2.27, cpc: 237, adSpend: 661037, revenue: 5250892, roas: 794, conversions: 71 },
  { date: "1/23", impressions: 120333, clicks: 2563, ctr: 2.13, cpc: 263, adSpend: 675346, revenue: 5168887, roas: 765, conversions: 74 },
  { date: "1/22", impressions: 133146, clicks: 3537, ctr: 2.66, cpc: 167, adSpend: 590744, revenue: 4252100, roas: 720, conversions: 147 },
  { date: "1/21", impressions: 130971, clicks: 3857, ctr: 2.94, cpc: 145, adSpend: 561432, revenue: 3488529, roas: 621, conversions: 111 },
  { date: "1/20", impressions: 163943, clicks: 4381, ctr: 2.67, cpc: 142, adSpend: 622785, revenue: 4362341, roas: 700, conversions: 110 },
  { date: "1/19", impressions: 161925, clicks: 4667, ctr: 2.88, cpc: 126, adSpend: 591800, revenue: 4392257, roas: 742, conversions: 173 },
  { date: "1/18", impressions: 144314, clicks: 3673, ctr: 2.55, cpc: 189, adSpend: 696522, revenue: 4706055, roas: 676, conversions: 124 },
  { date: "1/17", impressions: 199492, clicks: 6455, ctr: 3.24, cpc: 90, adSpend: 585109, revenue: 3831132, roas: 655, conversions: 224 },
  { date: "1/16", impressions: 151400, clicks: 4357, ctr: 2.88, cpc: 129, adSpend: 562662, revenue: 3842457, roas: 683, conversions: 146 },
  { date: "1/15", impressions: 152089, clicks: 4271, ctr: 2.81, cpc: 135, adSpend: 576604, revenue: 4417977, roas: 766, conversions: 186 },
  { date: "1/14", impressions: 121904, clicks: 3467, ctr: 2.84, cpc: 160, adSpend: 557775, revenue: 4384846, roas: 786, conversions: 155 },
  { date: "1/13", impressions: 164974, clicks: 4144, ctr: 2.51, cpc: 163, adSpend: 678110, revenue: 5595746, roas: 825, conversions: 124 },
  { date: "1/12", impressions: 133206, clicks: 3074, ctr: 2.31, cpc: 216, adSpend: 665277, revenue: 5369854, roas: 807, conversions: 132 },
  { date: "1/11", impressions: 179899, clicks: 5557, ctr: 3.09, cpc: 124, adSpend: 692819, revenue: 5052663, roas: 729, conversions: 233 },
  { date: "1/10", impressions: 145658, clicks: 3174, ctr: 2.18, cpc: 222, adSpend: 704750, revenue: 4612697, roas: 655, conversions: 114 },
];

const columns: { key: SortKey; label: string }[] = [
  { key: "date", label: "날짜" },
  { key: "impressions", label: "노출수" },
  { key: "clicks", label: "클릭수" },
  { key: "ctr", label: "CTR" },
  { key: "cpc", label: "CPC" },
  { key: "adSpend", label: "광고비" },
  { key: "revenue", label: "매출" },
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
  data = defaultData,
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
            {sorted.map((row) => (
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
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
