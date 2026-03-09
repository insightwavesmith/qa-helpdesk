"use client";

import { ArrowRight, BarChart3, LinkIcon } from "lucide-react";
import Link from "next/link";

import dynamic from "next/dynamic";
import {
  SummaryCards,
  DiagnosticPanel,
  ConversionFunnel,
  DailyMetricsTable,
} from "@/components/protractor";

const PerformanceTrendChart = dynamic(
  () =>
    import("@/components/protractor/PerformanceTrendChart").then(
      (m) => m.PerformanceTrendChart
    ),
  {
    ssr: false,
    loading: () => <div className="h-[300px] animate-pulse rounded-xl bg-gray-100" />,
  }
);

// ── 샘플 데이터 ──────────────────────────────────────

const SAMPLE_SUMMARY_CARDS = [
  {
    label: "총 광고매출",
    value: "18,305,000",
    prefix: "₩",
    changePercent: 12.5,
    changeLabel: "전주 대비",
  },
  {
    label: "광고비",
    value: "5,230,000",
    prefix: "₩",
    changePercent: -3.2,
    changeLabel: "전주 대비",
  },
  {
    label: "ROAS",
    value: "350",
    suffix: "%",
    changePercent: 18.7,
    changeLabel: "전주 대비",
  },
  {
    label: "구매전환수",
    value: "245",
    changePercent: 8.3,
    changeLabel: "전주 대비",
  },
  {
    label: "CPA",
    value: "21,347",
    prefix: "₩",
    changePercent: -11.4,
    changeLabel: "전주 대비",
  },
  {
    label: "CTR",
    value: "2.10",
    suffix: "%",
    changePercent: 5.1,
    changeLabel: "전주 대비",
  },
];

const SAMPLE_TREND_DATA = [
  { date: "1/20", revenue: 2512000, adSpend: 718000 },
  { date: "1/21", revenue: 2840000, adSpend: 752000 },
  { date: "1/22", revenue: 2350000, adSpend: 695000 },
  { date: "1/23", revenue: 3120000, adSpend: 810000 },
  { date: "1/24", revenue: 2680000, adSpend: 734000 },
  { date: "1/25", revenue: 2950000, adSpend: 770000 },
  { date: "1/26", revenue: 1853000, adSpend: 751000 },
];

const SAMPLE_FUNNEL_STEPS = [
  {
    label: "노출",
    value: "892K",
    rawValue: 892000,
    color: { border: "border-primary/20", bg: "bg-primary/10", text: "text-primary" },
  },
  {
    label: "클릭",
    value: "18.7K",
    rawValue: 18732,
    conversionRate: "2.10",
    color: { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-700" },
  },
  {
    label: "결제시작",
    value: "2.3K",
    rawValue: 2340,
    conversionRate: "12.49",
    color: { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700" },
  },
  {
    label: "구매",
    value: "245",
    rawValue: 245,
    conversionRate: "10.47",
    color: { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700" },
  },
];

const SAMPLE_DAILY_METRICS = [
  { date: "1/26", impressions: 128500, clicks: 2698, ctr: 2.1, cpc: 850, adSpend: 751000, revenue: 1853000, roas: 247, conversions: 28 },
  { date: "1/25", impressions: 131200, clicks: 2756, ctr: 2.1, cpc: 820, adSpend: 770000, revenue: 2950000, roas: 383, conversions: 38 },
  { date: "1/24", impressions: 125800, clicks: 2642, ctr: 2.1, cpc: 870, adSpend: 734000, revenue: 2680000, roas: 365, conversions: 36 },
  { date: "1/23", impressions: 135400, clicks: 2843, ctr: 2.1, cpc: 790, adSpend: 810000, revenue: 3120000, roas: 385, conversions: 42 },
  { date: "1/22", impressions: 122600, clicks: 2575, ctr: 2.1, cpc: 880, adSpend: 695000, revenue: 2350000, roas: 338, conversions: 32 },
  { date: "1/21", impressions: 128300, clicks: 2694, ctr: 2.1, cpc: 830, adSpend: 752000, revenue: 2840000, roas: 378, conversions: 37 },
  { date: "1/20", impressions: 120200, clicks: 2524, ctr: 2.1, cpc: 860, adSpend: 718000, revenue: 2512000, roas: 350, conversions: 32 },
];

const SAMPLE_DIAGNOSES = [
  {
    ad_id: "sample_1",
    ad_name: "샘플 광고 A",
    overall_verdict: "🟡",
    parts: [
      {
        part_name: "기반점수",
        verdict: "🟢",
        metrics: [
          { name: "3초시청률", my_value: 42.5, pct_of_benchmark: 121, verdict: "🟢" },
          { name: "CTR", my_value: 3.2, pct_of_benchmark: 128, verdict: "🟢" },
        ],
      },
      {
        part_name: "참여율",
        verdict: "🟡",
        metrics: [
          { name: "참여합계/만노출", my_value: 15.3, pct_of_benchmark: 85, verdict: "🟡" },
        ],
      },
      {
        part_name: "전환율",
        verdict: "🔴",
        metrics: [
          { name: "구매전환율", my_value: 0.8, pct_of_benchmark: 38, verdict: "🔴" },
          { name: "노출→구매", my_value: 0.01, pct_of_benchmark: 20, verdict: "🔴" },
        ],
      },
    ],
  },
];

// ── CTA 배너 ─────────────────────────────────────────

type BannerType = "member" | "unlinked";

function CTABanner({ type }: { type: BannerType }) {
  if (type === "member") {
    return (
      <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-card-foreground">
              수강생 전용 기능입니다
            </p>
            <p className="text-xs text-muted-foreground">
              수강 신청 후 내 광고 데이터를 실시간으로 분석해 보세요
            </p>
          </div>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[#E54949]"
        >
          수강 신청하기
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
          <LinkIcon className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">
            광고계정을 연결하면 내 데이터를 볼 수 있습니다
          </p>
          <p className="text-xs text-white/80">
            Meta 광고계정을 연결하고 실제 성과 데이터로 진단 받으세요
          </p>
        </div>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-white/90"
      >
        광고계정 연결
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────

interface SampleDashboardProps {
  bannerType: BannerType;
}

export default function SampleDashboard({ bannerType }: SampleDashboardProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* 헤더 */}
      <header className="-m-6 mb-0 flex flex-col gap-2 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-card-foreground">
            총가치각도기
          </h1>
          <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            샘플 데이터
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          아래는 샘플 데이터로 구성된 데모 화면입니다. 실제 내 광고 데이터가 아닙니다.
        </p>
      </header>

      {/* CTA 배너 */}
      <CTABanner type={bannerType} />

      {/* 샘플 대시보드 */}
      <div className="relative">
        {/* 샘플 워터마크 */}
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="select-none text-[80px] font-black uppercase leading-none tracking-widest text-muted-foreground/[0.04] rotate-[-18deg]">
            SAMPLE
          </span>
        </div>

        <div className="flex flex-col gap-6">
          <SummaryCards cards={SAMPLE_SUMMARY_CARDS} />

          <DiagnosticPanel diagnoses={SAMPLE_DIAGNOSES} />

          <div className="grid gap-6 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <PerformanceTrendChart data={SAMPLE_TREND_DATA} />
            </div>
            <div className="xl:col-span-2">
              <ConversionFunnel
                steps={SAMPLE_FUNNEL_STEPS}
                overallRate="0.027"
              />
            </div>
          </div>

          <DailyMetricsTable data={SAMPLE_DAILY_METRICS} />
        </div>
      </div>
    </div>
  );
}
