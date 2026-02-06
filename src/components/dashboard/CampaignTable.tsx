"use client";

import { useState, useMemo } from "react";
import { ArrowUpDown, ArrowDown, Search } from "lucide-react";
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

const campaigns: Campaign[] = [
  {
    name: "리타겟팅 - 장바구니 이탈",
    platform: "Meta",
    platformColor: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    status: "진행중",
    statusColor: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    impressions: "892.0K",
    clicks: "38.5K",
    ctr: "4.32%",
    adSpend: "₩1463만",
    revenue: "₩8520만",
    roas: 5.82,
    roasColor: "text-emerald-500",
    conversions: "2,130",
  },
  {
    name: "검색 광고 - 브랜드 키워드",
    platform: "Google",
    platformColor: "bg-red-500/10 text-red-500 border-red-500/20",
    status: "진행중",
    statusColor: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    impressions: "560.0K",
    clicks: "28.4K",
    ctr: "5.07%",
    adSpend: "₩1278만",
    revenue: "₩7230만",
    roas: 5.66,
    roasColor: "text-emerald-500",
    conversions: "1,560",
  },
  {
    name: "네이버 쇼핑검색",
    platform: "Naver",
    platformColor: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    status: "진행중",
    statusColor: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    impressions: "780.0K",
    clicks: "31.2K",
    ctr: "4.00%",
    adSpend: "₩1934만",
    revenue: "₩9560만",
    roas: 4.94,
    roasColor: "text-emerald-500",
    conversions: "1,780",
  },
  {
    name: "브랜드 인지도 캠페인",
    platform: "Meta",
    platformColor: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    status: "진행중",
    statusColor: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    impressions: "1.2M",
    clicks: "42.3K",
    ctr: "3.40%",
    adSpend: "₩2200만",
    revenue: "₩9850만",
    roas: 4.48,
    roasColor: "text-emerald-500",
    conversions: "1,842",
  },
  {
    name: "인스타그램 릴스 광고",
    platform: "Meta",
    platformColor: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    status: "진행중",
    statusColor: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    impressions: "3.2M",
    clicks: "54.4K",
    ctr: "1.70%",
    adSpend: "₩1578만",
    revenue: "₩6820만",
    roas: 4.32,
    roasColor: "text-emerald-500",
    conversions: "1,290",
  },
  {
    name: "카카오 모먼트 - 도달",
    platform: "Kakao",
    platformColor: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    status: "진행중",
    statusColor: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    impressions: "1.6M",
    clicks: "21.8K",
    ctr: "1.40%",
    adSpend: "₩743만",
    revenue: "₩2850만",
    roas: 3.84,
    roasColor: "text-amber-500",
    conversions: "640",
  },
  {
    name: "디스플레이 광고 - GDN",
    platform: "Google",
    platformColor: "bg-red-500/10 text-red-500 border-red-500/20",
    status: "일시정지",
    statusColor: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    impressions: "2.1M",
    clicks: "18.9K",
    ctr: "0.90%",
    adSpend: "₩529만",
    revenue: "₩1580만",
    roas: 2.99,
    roasColor: "text-red-500",
    conversions: "420",
  },
  {
    name: "유튜브 인스트림 광고",
    platform: "Google",
    platformColor: "bg-red-500/10 text-red-500 border-red-500/20",
    status: "종료",
    statusColor: "bg-muted text-muted-foreground border-border",
    impressions: "4.5M",
    clicks: "13.5K",
    ctr: "0.30%",
    adSpend: "₩203만",
    revenue: "₩540만",
    roas: 2.67,
    roasColor: "text-red-500",
    conversions: "180",
  },
];

type SortKey = "name" | "roas" | "impressions" | "clicks" | "ctr" | "adSpend" | "revenue" | "conversions";

export function CampaignTable() {
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
  }, [search, sortKey, sortDir]);

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
