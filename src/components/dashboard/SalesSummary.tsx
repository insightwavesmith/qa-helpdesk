"use client";

import { useEffect, useState } from "react";
import {
  DollarSign,
  TrendingUp,
  BarChart3,
  Users,
  RefreshCw,
  Calendar,
} from "lucide-react";
import { NumberTicker } from "@/components/ui/number-ticker";
import { BorderBeam } from "@/components/ui/border-beam";

interface SalesData {
  success: boolean;
  date: string;
  start_date: string;
  end_date: string;
  total_spend: number;
  total_revenue: number;
  roas: number;
  account_count: number;
  generated_at: string;
}

function parseKoreanCurrency(value: number): {
  num: number;
  suffix: string;
  decimals: number;
} {
  const eok = value / 100_000_000;
  if (eok >= 1) {
    return { num: parseFloat(eok.toFixed(1)), suffix: "억", decimals: 1 };
  }
  const man = value / 10_000;
  if (man >= 1) {
    return { num: Math.round(man), suffix: "만", decimals: 0 };
  }
  return { num: value, suffix: "", decimals: 0 };
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function SalesSummary() {
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/sales-summary");
        const json = await res.json();
        if (json.success) {
          setData(json);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-6 sm:p-8 animate-pulse">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="h-4 bg-white/10 rounded w-16" />
              <div className="h-8 bg-white/10 rounded w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return null; // silently hide if API fails
  }

  const spendParsed = parseKoreanCurrency(data.total_spend);
  const revenueParsed = parseKoreanCurrency(data.total_revenue);

  const stats = [
    {
      label: "총 광고비",
      tickerValue: spendParsed.num,
      tickerDecimals: spendParsed.decimals,
      suffix: spendParsed.suffix,
      icon: DollarSign,
      gradient: "from-rose-500 to-orange-500",
      bgGlow: "bg-rose-500/20",
    },
    {
      label: "총 매출",
      tickerValue: revenueParsed.num,
      tickerDecimals: revenueParsed.decimals,
      suffix: revenueParsed.suffix,
      icon: TrendingUp,
      gradient: "from-emerald-500 to-teal-500",
      bgGlow: "bg-emerald-500/20",
    },
    {
      label: "ROAS",
      tickerValue: parseFloat(data.roas.toFixed(2)),
      tickerDecimals: 2,
      suffix: "x",
      icon: BarChart3,
      gradient: "from-blue-500 to-cyan-500",
      bgGlow: "bg-blue-500/20",
    },
    {
      label: "운영 계정",
      tickerValue: data.account_count,
      tickerDecimals: 0,
      suffix: "개",
      icon: Users,
      gradient: "from-violet-500 to-purple-500",
      bgGlow: "bg-violet-500/20",
    },
  ];

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-6 sm:p-8 shadow-2xl border border-white/5">
      {/* BorderBeam 효과 */}
      <BorderBeam
        size={200}
        duration={8}
        colorFrom="#3b82f6"
        colorTo="#8b5cf6"
        borderWidth={2}
      />

      {/* Background decorative elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
      <div className="absolute top-1/2 left-1/2 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl -translate-x-1/2 -translate-y-1/2" />

      {/* Header */}
      <div className="relative flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/25">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-white font-bold text-lg leading-tight">
              Sales Summary
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <Calendar className="h-3 w-3 text-blue-300/70" />
              <span className="text-blue-300/70 text-xs">
                {formatDate(data.start_date)} ~ {formatDate(data.end_date)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/20">
          <RefreshCw className="h-3 w-3 text-emerald-400" />
          <span className="text-emerald-400 text-[11px] font-medium">
            매일 업데이트
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="group relative rounded-xl bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] p-4 transition-all duration-300 hover:bg-white/[0.1] hover:border-white/[0.15] hover:scale-[1.02]"
            >
              {/* Icon */}
              <div className="flex items-center gap-2 mb-3">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br ${stat.gradient} shadow-lg`}
                >
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <span className="text-blue-200/60 text-xs font-medium">
                  {stat.label}
                </span>
              </div>

              {/* Value */}
              <p className="text-white text-xl sm:text-2xl font-bold tracking-tight">
                <NumberTicker
                  value={stat.tickerValue}
                  decimalPlaces={stat.tickerDecimals}
                  className="text-white"
                />
                {stat.suffix && (
                  <span className="text-white/80 text-lg sm:text-xl ml-0.5">
                    {stat.suffix}
                  </span>
                )}
              </p>

              {/* Subtle glow */}
              <div
                className={`absolute -bottom-2 -right-2 w-16 h-16 ${stat.bgGlow} rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
              />
            </div>
          );
        })}
      </div>

      {/* Update date */}
      <div className="relative mt-4 flex justify-end">
        <span className="text-blue-300/40 text-[11px]">
          {formatDate(data.date)} 기준
        </span>
      </div>
    </section>
  );
}
