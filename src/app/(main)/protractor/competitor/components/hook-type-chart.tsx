"use client";

interface HookType {
  type: string;
  count: number;
  percentage: number;
  examples: string[];
}

interface HookTypeChartProps {
  hookTypes: HookType[];
}

const HOOK_COLORS: Record<string, string> = {
  "할인형": "#F75D5D",
  "후기형": "#3B82F6",
  "성분형": "#10B981",
  "감성형": "#8B5CF6",
  "기타": "#6B7280",
};

export function HookTypeChart({ hookTypes }: HookTypeChartProps) {
  if (!hookTypes || hookTypes.length === 0) return null;

  const sorted = [...hookTypes].sort((a, b) => b.percentage - a.percentage);

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-900">광고 훅 유형 분포</h4>
      <div className="space-y-2">
        {sorted.map((hook) => {
          const color = HOOK_COLORS[hook.type] ?? HOOK_COLORS["기타"];
          return (
            <div key={hook.type}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-gray-700">{hook.type}</span>
                <span className="text-gray-500">
                  {hook.count}건 ({hook.percentage}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(hook.percentage, 100)}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
              {hook.examples.length > 0 && (
                <p className="text-xs text-gray-400 mt-1 line-clamp-1">
                  &quot;{hook.examples[0]}&quot;
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
