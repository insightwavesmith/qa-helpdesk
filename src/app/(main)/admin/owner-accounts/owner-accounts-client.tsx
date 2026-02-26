"use client";

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
import { Monitor, DollarSign, TrendingUp } from "lucide-react";
import type { OwnerAdSummaryRow } from "@/actions/performance";

interface Props {
  rows: OwnerAdSummaryRow[];
  totalAccounts: number;
  totalSpend: number;
  avgRoas: number;
}

const ownerTypeMap: Record<string, { label: string; className: string }> = {
  self: { label: "본인", className: "bg-blue-100 text-blue-800" },
  student: { label: "수강생", className: "bg-emerald-100 text-emerald-800" },
  client: { label: "외부", className: "bg-gray-100 text-gray-600" },
};

function formatKRW(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}백만`;
  if (value >= 10_000) return `${Math.round(value / 10_000)}만`;
  return `₩${Math.round(value).toLocaleString()}`;
}

export function OwnerAccountsClient({ rows, totalAccounts, totalSpend, avgRoas }: Props) {
  const statCards = [
    {
      label: "총 접근 계정",
      value: totalAccounts.toString(),
      icon: Monitor,
      accentColor: "border-l-blue-500",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-500",
    },
    {
      label: "총 광고비",
      value: formatKRW(totalSpend),
      icon: DollarSign,
      accentColor: "border-l-purple-500",
      iconBg: "bg-purple-50",
      iconColor: "text-purple-500",
    },
    {
      label: "평균 ROAS",
      value: `${(avgRoas * 100).toFixed(0)}%`,
      icon: TrendingUp,
      accentColor: "border-l-emerald-500",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-500",
    },
  ];

  if (rows.length === 0) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
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
                  <p className="text-[32px] font-bold text-gray-900">-</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 mb-4">
            <Monitor className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">
            데이터 수집 후 표시됩니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid gap-4 sm:grid-cols-3">
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
              <TableHead className="text-xs font-medium text-gray-500 uppercase">
                계정명
              </TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase">
                광고비
              </TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase">
                광고매출
              </TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase">
                ROAS
              </TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase">
                구매수
              </TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase">
                소유구분
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const badge = ownerTypeMap[row.ownerType] ?? ownerTypeMap.client;
              const roasPercent = row.avgRoas * 100;
              return (
                <TableRow
                  key={row.id}
                  className="hover:bg-gray-50/50 transition-colors"
                >
                  <TableCell className="font-medium text-gray-900">
                    {row.accountName || row.accountId}
                  </TableCell>
                  <TableCell className="text-sm text-gray-900 font-mono">
                    ₩{Math.round(row.totalSpend).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm text-gray-900 font-mono">
                    ₩{Math.round(row.totalRevenue).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        roasPercent >= 300
                          ? "text-emerald-700 bg-emerald-50"
                          : roasPercent < 100 && roasPercent > 0
                            ? "text-red-700 bg-red-50"
                            : ""
                      }`}
                    >
                      {roasPercent.toFixed(0)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-gray-900 font-mono">
                    {row.totalPurchases.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
