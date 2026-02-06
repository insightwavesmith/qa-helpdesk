"use client";

import { ArrowRight } from "lucide-react";

interface FunnelStep {
  label: string;
  value: string;
  conversionRate?: string;
  color: {
    border: string;
    bg: string;
    text: string;
  };
}

interface ConversionFunnelProps {
  steps?: FunnelStep[];
  overallRate?: string;
}

const defaultSteps: FunnelStep[] = [
  {
    label: "노출",
    value: "4.25M",
    color: {
      border: "border-primary/20",
      bg: "bg-primary/10",
      text: "text-primary",
    },
  },
  {
    label: "클릭",
    value: "98.8K",
    conversionRate: "2.32",
    color: {
      border: "border-blue-200",
      bg: "bg-blue-50",
      text: "text-blue-700",
    },
  },
  {
    label: "장바구니",
    value: "12.4K",
    conversionRate: "12.56",
    color: {
      border: "border-amber-200",
      bg: "bg-amber-50",
      text: "text-amber-700",
    },
  },
  {
    label: "구매",
    value: "1.8K",
    conversionRate: "14.9",
    color: {
      border: "border-emerald-200",
      bg: "bg-emerald-50",
      text: "text-emerald-700",
    },
  },
];

export function ConversionFunnel({
  steps = defaultSteps,
  overallRate = "0.043",
}: ConversionFunnelProps) {
  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      <div className="border-b border-border px-6 py-4">
        <h3 className="text-sm font-semibold text-card-foreground">
          전환 퍼널
        </h3>
        <p className="text-xs text-muted-foreground">
          노출에서 구매까지의 전환 흐름
        </p>
      </div>
      <div className="px-6 py-6">
        {/* Desktop */}
        <div className="hidden items-end gap-2 md:flex">
          {steps.map((step, idx) => (
            <div key={step.label} className="flex flex-1 items-center gap-2">
              <div className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {step.label}
                </span>
                <div
                  className={`flex w-full flex-col items-center justify-center rounded-xl border ${step.color.border} ${step.color.bg} py-5 transition-all`}
                  style={{
                    minHeight: idx === 0 ? "160px" : "80px",
                  }}
                >
                  <span
                    className={`text-xl font-bold tabular-nums ${step.color.text}`}
                  >
                    {step.value}
                  </span>
                  {step.conversionRate && (
                    <span className="mt-1 text-xs font-medium text-muted-foreground">
                      전환율 {step.conversionRate}%
                    </span>
                  )}
                </div>
              </div>
              {idx < steps.length - 1 && (
                <div className="flex flex-col items-center gap-0.5 pb-6">
                  <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
                  <span className="text-[10px] font-semibold tabular-nums text-primary">
                    {steps[idx + 1].conversionRate}%
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Mobile */}
        <div className="flex flex-col gap-3 md:hidden">
          {steps.map((step, idx) => (
            <div key={step.label} className="flex flex-col items-center gap-1">
              {idx > 0 && step.conversionRate && (
                <div className="flex items-center gap-1 py-1">
                  <div className="h-4 w-px bg-border" />
                  <span className="text-[10px] font-semibold text-primary">
                    {step.conversionRate}%
                  </span>
                  <div className="h-4 w-px bg-border" />
                </div>
              )}
              <div
                className={`flex items-center justify-between rounded-xl border ${step.color.border} ${step.color.bg} px-4 py-3 transition-all`}
                style={{ width: idx === 0 ? "100%" : "30%" }}
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {step.label}
                </span>
                <span
                  className={`text-sm font-bold tabular-nums ${step.color.text}`}
                >
                  {step.value}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Overall conversion rate */}
        <div className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-3">
          <span className="text-xs font-medium text-muted-foreground">
            전체 전환율 (노출 → 구매)
          </span>
          <span className="text-sm font-bold tabular-nums text-primary">
            {overallRate}%
          </span>
        </div>
      </div>
    </div>
  );
}
