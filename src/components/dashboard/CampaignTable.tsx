"use client";

import { useState, useMemo } from "react";
import { ArrowUpDown, ArrowDown, Search, Target } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Campaign {
  name: string;
  platform: string;
  platformColor: string;
  status: string;
  statusColor: string;
  impressions: string;
  clicks: string;
  ctr: string;
  adSpend: string;
  revenue: string;
  roas: number;
  roasColor: string;
  conversions: string;
}

interface CampaignTableProps {
  campaigns?: Campaign[];
}

type SortKey = "name" | "roas" | "impressions" | "clicks" | "ctr" | "adSpend" | "revenue" | "conversions";

export function CampaignTable({ campaigns = [] }: CampaignTableProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("roas");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    let result = campaigns;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.platform.toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name") return dir * a.name.localeCompare(b.name);
      if (sortKey === "roas") return dir * (a.roas - b.roas);
      return 0;
    });
  }, [campaigns, search, sortKey, sortDir]);

  const SortButton = ({
    label,
    field,
    align = "right",
  }: {
    label: string;
    field: SortKey;
    align?: "left" | "right";
  }) => (
    <button
      onClick={() => handleSort(field)}
      className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-card-foreground transition-colors ${
        align === "right" ? "ml-auto" : ""
      }`}
    >
      {label}
      {sortKey === field ? (
        <ArrowDown
          className={`ml-1 h-3 w-3 transition-transform ${
            sortDir === "asc" ? "rotate-180" : ""
          }`}
        />
      ) : (
        <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />
      )}
    </button>
  );

  if (campaigns.length === 0) {
    return (
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="space-y-1.5 p-6">
          <div className="tracking-tight text-base font-semibold text-card-foreground">
            캠페인 성과
          </div>
        </div>
        <div className="p-6 pt-0">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 mb-4">
              <Target className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-900 mb-1">데이터가 없습니다</p>
            <p className="text-xs text-gray-500">캠페인 데이터가 연동되면 성과를 확인할 수 있습니다</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="space-y-1.5 p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="tracking-tight text-base font-semibold text-card-foreground">
          캠페인 성과
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 h-9 pl-9 text-sm"
            placeholder="캠페인 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[200px]">
                  <SortButton label="캠페인명" field="name" align="left" />
                </TableHead>
                <TableHead>
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    플랫폼
                  </span>
                </TableHead>
                <TableHead>
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    상태
                  </span>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton label="노출수" field="impressions" />
                </TableHead>
                <TableHead className="text-right">
                  <SortButton label="클릭수" field="clicks" />
                </TableHead>
                <TableHead className="text-right">
                  <SortButton label="CTR" field="ctr" />
                </TableHead>
                <TableHead className="text-right">
                  <SortButton label="광고비" field="adSpend" />
                </TableHead>
                <TableHead className="text-right">
                  <SortButton label="매출" field="revenue" />
                </TableHead>
                <TableHead className="text-right">
                  <SortButton label="ROAS" field="roas" />
                </TableHead>
                <TableHead className="text-right">
                  <SortButton label="전환" field="conversions" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.name} className="group">
                  <TableCell className="font-medium text-card-foreground">
                    {c.name}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${c.platformColor}`}
                    >
                      {c.platform}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${c.statusColor}`}
                    >
                      {c.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {c.impressions}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {c.clicks}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {c.ctr}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {c.adSpend}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-card-foreground">
                    {c.revenue}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={`tabular-nums font-semibold ${c.roasColor}`}
                    >
                      {c.roas}x
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {c.conversions}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
