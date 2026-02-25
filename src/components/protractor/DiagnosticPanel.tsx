"use client";

import { CircleX, TriangleAlert, CircleCheck } from "lucide-react";

type Severity = "심각" | "주의" | "양호";
type Grade = "A" | "B" | "C" | "D" | "F";

interface DiagnosticIssue {
  title: string;
  description: string;
  severity: Severity;
  partName?: string;
}

interface DiagnosticPanelProps {
  grade?: Grade;
  gradeLabel?: string;
  summary?: string;
  issues?: DiagnosticIssue[];
}

const gradeColors: Record<Grade, { bg: string; border: string; text: string; gradeBg: string }> = {
  A: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", gradeBg: "bg-emerald-50" },
  B: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", gradeBg: "bg-blue-50" },
  C: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", gradeBg: "bg-amber-50" },
  D: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", gradeBg: "bg-orange-50" },
  F: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", gradeBg: "bg-red-50" },
};

const severityConfig: Record<
  Severity,
  {
    icon: typeof CircleX;
    bg: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    iconColor: string;
  }
> = {
  심각: {
    icon: CircleX,
    bg: "bg-red-50",
    badgeBg: "bg-red-100",
    badgeText: "text-red-700",
    badgeBorder: "border-red-200",
    iconColor: "text-red-600",
  },
  주의: {
    icon: TriangleAlert,
    bg: "bg-amber-50",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-700",
    badgeBorder: "border-amber-200",
    iconColor: "text-amber-600",
  },
  양호: {
    icon: CircleCheck,
    bg: "bg-emerald-50",
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-700",
    badgeBorder: "border-emerald-200",
    iconColor: "text-emerald-600",
  },
};

const defaultIssues: DiagnosticIssue[] = [
  {
    title: "광고 소재 피로도 상승",
    description:
      "주력 광고 소재 3건의 CTR이 최근 7일간 23% 하락했습니다. 새로운 크리에이티브 테스트를 권장합니다.",
    severity: "심각",
  },
  {
    title: "CPA 상승 추세",
    description:
      "최근 14일간 CPA가 ₩8,500에서 ₩9,920으로 16.7% 상승했습니다. 타겟 오디언스 재설정을 검토하세요.",
    severity: "주의",
  },
  {
    title: "모바일 전환율 저하",
    description:
      "모바일 기기에서의 구매 전환율이 데스크탑 대비 42% 낮습니다. 모바일 랜딩페이지 최적화가 필요합니다.",
    severity: "주의",
  },
  {
    title: "리타겟팅 캠페인 효율 우수",
    description:
      "리타겟팅 캠페인의 ROAS가 1,240%로 전체 평균 대비 78% 높은 성과를 보이고 있습니다.",
    severity: "양호",
  },
  {
    title: "주말 노출 효율 양호",
    description:
      "주말 광고 노출의 CPM이 평일 대비 15% 낮으며, 전환율도 8% 높습니다.",
    severity: "양호",
  },
];

export function DiagnosticPanel({
  grade = "B",
  gradeLabel = "양호",
  summary = "전반적으로 양호한 광고 성과를 보이고 있으나, 일부 캠페인의 전환율 개선이 필요합니다. ROAS는 목표 대비 초과 달성 중이며, CTR은 업계 평균 이상입니다. 그러나 특정 광고 소재의 피로도가 감지되고 있어 리프레시가 권장됩니다.",
  issues = defaultIssues,
}: DiagnosticPanelProps) {
  const colors = gradeColors[grade];

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-col lg:flex-row">
        {/* Grade section */}
        <div
          className={`flex flex-col items-center justify-center gap-2 border-b border-border px-8 py-6 lg:border-b-0 lg:border-r ${colors.gradeBg}`}
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            진단 등급
          </span>
          <div
            className={`flex h-20 w-20 items-center justify-center rounded-2xl border-2 ${colors.border} bg-card shadow-sm`}
          >
            <span className={`text-4xl font-extrabold ${colors.text}`}>
              {grade}
            </span>
          </div>
          <span className={`text-sm font-semibold ${colors.text}`}>
            {gradeLabel}
          </span>
        </div>

        {/* Summary + Issues */}
        <div className="flex flex-1 flex-col">
          <div className="border-b border-border px-6 py-4">
            <h3 className="mb-2 text-sm font-semibold text-card-foreground">
              진단 요약
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {summary}
            </p>
          </div>

          <div className="px-6 py-4">
            <h3 className="mb-3 text-sm font-semibold text-card-foreground">
              발견된 이슈
            </h3>
            <div className="flex flex-col gap-3">
              {(() => {
                // partName이 있는 이슈가 있으면 그룹핑
                const hasPartNames = issues.some((i) => i.partName);
                if (!hasPartNames) {
                  return issues.map((issue) => {
                    const config = severityConfig[issue.severity];
                    const Icon = config.icon;
                    return (
                      <div key={issue.title} className={`flex gap-3 rounded-lg border border-border p-3 ${config.bg}`}>
                        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.iconColor}`} />
                        <div className="flex flex-1 flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-card-foreground">{issue.title}</span>
                            <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold ${config.badgeBg} ${config.badgeText} ${config.badgeBorder}`}>{issue.severity}</span>
                          </div>
                          <p className="text-xs leading-relaxed text-muted-foreground">{issue.description}</p>
                        </div>
                      </div>
                    );
                  });
                }

                // 파트별 그룹핑
                const grouped = new Map<string, DiagnosticIssue[]>();
                for (const issue of issues) {
                  const key = issue.partName ?? "기타";
                  if (!grouped.has(key)) grouped.set(key, []);
                  grouped.get(key)!.push(issue);
                }

                return Array.from(grouped.entries()).map(([partName, partIssues]) => (
                  <div key={partName}>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2 mt-3 first:mt-0">{partName}</h4>
                    {partIssues.map((issue) => {
                      const config = severityConfig[issue.severity];
                      const Icon = config.icon;
                      return (
                        <div key={issue.title} className={`flex gap-3 rounded-lg border border-border p-3 mb-2 last:mb-0 ${config.bg}`}>
                          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.iconColor}`} />
                          <div className="flex flex-1 flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-card-foreground">{issue.title}</span>
                              <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold ${config.badgeBg} ${config.badgeText} ${config.badgeBorder}`}>{issue.severity}</span>
                            </div>
                            <p className="text-xs leading-relaxed text-muted-foreground">{issue.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
