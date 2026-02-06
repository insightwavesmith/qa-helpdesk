"use client";

interface ChannelData {
  name: string;
  roas: number;
  roasColor: string;
  share: number;
  barColor: string;
  adSpend: string;
  revenue: string;
}

const channels: ChannelData[] = [
  {
    name: "Meta Ads",
    roas: 4.81,
    roasColor: "text-emerald-500",
    share: 42,
    barColor: "bg-primary",
    adSpend: "₩5만",
    revenue: "₩25.2만",
  },
  {
    name: "Google Ads",
    roas: 4.65,
    roasColor: "text-emerald-500",
    share: 28,
    barColor: "bg-blue-500",
    adSpend: "₩2만",
    revenue: "₩9.3만",
  },
  {
    name: "Naver Ads",
    roas: 4.94,
    roasColor: "text-emerald-500",
    share: 18,
    barColor: "bg-emerald-500",
    adSpend: "₩2만",
    revenue: "₩9.6만",
  },
  {
    name: "Kakao Ads",
    roas: 3.84,
    roasColor: "text-amber-500",
    share: 12,
    barColor: "bg-amber-500",
    adSpend: "₩1만",
    revenue: "₩2.9만",
  },
];

export function ChannelBreakdown() {
  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm h-full">
      <div className="flex flex-col space-y-1.5 p-6">
        <div className="tracking-tight text-base font-semibold text-card-foreground">
          채널별 성과
        </div>
      </div>
      <div className="p-6 pt-0 space-y-5">
        {channels.map((ch) => (
          <div key={ch.name} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-card-foreground">
                {ch.name}
              </span>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-semibold tabular-nums ${ch.roasColor}`}
                >
                  {ch.roas}x
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {ch.share}%
                </span>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full transition-all ${ch.barColor}`}
                style={{ width: `${ch.share}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>광고비: {ch.adSpend}</span>
              <span>매출: {ch.revenue}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
