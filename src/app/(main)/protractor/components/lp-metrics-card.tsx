"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, Inbox } from "lucide-react";

// LP 지표 로우 타입 (daily_lp_metrics 테이블)
export interface LpMetricRow {
  date: string;
  account_id: string;
  total_users?: number;
  bounce_1s_rate?: number;
  bounce_10s_rate?: number;
  avg_time_on_page?: number;
  scroll_25_rate?: number;
  scroll_50_rate?: number;
  scroll_75_rate?: number;
  review_click_rate?: number;
  total_button_clicks?: number;
  lp_session_to_cart?: number;
  lp_session_to_checkout?: number;
  lp_session_to_purchase?: number;
  lp_checkout_to_purchase?: number;
}

// LP 지표를 기간 평균으로 집계
function averageLpMetrics(rows: LpMetricRow[]): LpMetricRow | null {
  if (rows.length === 0) return null;

  const avg = (key: keyof LpMetricRow): number => {
    const values = rows
      .map((r) => r[key] as number)
      .filter((v) => v != null && !isNaN(v));
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  };

  return {
    date: "",
    account_id: rows[0].account_id,
    total_users: rows.reduce((s, r) => s + (r.total_users || 0), 0),
    bounce_1s_rate: avg("bounce_1s_rate"),
    bounce_10s_rate: avg("bounce_10s_rate"),
    avg_time_on_page: avg("avg_time_on_page"),
    scroll_25_rate: avg("scroll_25_rate"),
    scroll_50_rate: avg("scroll_50_rate"),
    scroll_75_rate: avg("scroll_75_rate"),
    review_click_rate: avg("review_click_rate"),
    total_button_clicks: rows.reduce(
      (s, r) => s + (r.total_button_clicks || 0),
      0
    ),
    lp_session_to_cart: avg("lp_session_to_cart"),
    lp_session_to_checkout: avg("lp_session_to_checkout"),
    lp_session_to_purchase: avg("lp_session_to_purchase"),
    lp_checkout_to_purchase: avg("lp_checkout_to_purchase"),
  };
}

function fmtPct(n: number | undefined | null): string {
  if (n == null) return "-";
  return n.toFixed(1) + "%";
}
function fmtSec(n: number | undefined | null): string {
  if (n == null) return "-";
  return n.toFixed(1) + "초";
}

interface LpMetricsCardProps {
  lpMetrics: LpMetricRow[];
}

// LP 지표 카드
export function LpMetricsCard({ lpMetrics }: LpMetricsCardProps) {
  const avg = averageLpMetrics(lpMetrics);

  if (!avg) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" />
            LP(랜딩페이지) 지표
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Inbox className="h-8 w-8" />
            <p className="mt-2 text-sm">아직 수집된 LP 데이터가 없습니다</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="h-4 w-4" />
          LP(랜딩페이지) 지표
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Mixpanel 기반 랜딩페이지 품질 지표 (기간 평균)
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {/* 이탈률 */}
          <MetricItem
            label="1초 이탈률"
            value={fmtPct(avg.bounce_1s_rate)}
            description="1초 이내 이탈"
            warn={avg.bounce_1s_rate != null && avg.bounce_1s_rate > 30}
          />
          <MetricItem
            label="10초 이탈률"
            value={fmtPct(avg.bounce_10s_rate)}
            description="10초 이내 이탈"
            warn={avg.bounce_10s_rate != null && avg.bounce_10s_rate > 50}
          />

          {/* 체류시간 */}
          <MetricItem
            label="평균 체류시간"
            value={fmtSec(avg.avg_time_on_page)}
            description="페이지 체류"
          />

          {/* 스크롤 */}
          <MetricItem
            label="스크롤 25%"
            value={fmtPct(avg.scroll_25_rate)}
            description="페이지 1/4 도달"
          />
          <MetricItem
            label="스크롤 50%"
            value={fmtPct(avg.scroll_50_rate)}
            description="페이지 절반 도달"
          />
          <MetricItem
            label="스크롤 75%"
            value={fmtPct(avg.scroll_75_rate)}
            description="페이지 3/4 도달"
          />

          {/* 전환 */}
          <MetricItem
            label="LP→장바구니"
            value={fmtPct(avg.lp_session_to_cart)}
            description="장바구니 전환율"
          />
          <MetricItem
            label="LP→구매"
            value={fmtPct(avg.lp_session_to_purchase)}
            description="구매 전환율"
          />
        </div>

        {/* 총 세션 */}
        <div className="mt-4 text-center text-xs text-muted-foreground">
          기간 내 총 세션: {avg.total_users?.toLocaleString("ko-KR") || "-"}
        </div>
      </CardContent>
    </Card>
  );
}

// 개별 지표 아이템
function MetricItem({
  label,
  value,
  description,
  warn,
}: {
  label: string;
  value: string;
  description?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-lg font-bold ${
          warn ? "text-red-600 dark:text-red-400" : ""
        }`}
      >
        {value}
      </div>
      {description && (
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {description}
        </div>
      )}
    </div>
  );
}
