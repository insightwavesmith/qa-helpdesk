'use client';

import type { PdcaFeature, PdcaPhase, TeamId } from '@/types/agent-dashboard';

interface PdcaSummary {
  total: number;
  completed: number;
  inProgress: number;
  avgMatchRate: number;
}

interface PdcaStatusPanelProps {
  pdca: {
    features: PdcaFeature[];
    summary: PdcaSummary;
  };
}

const PHASE_CONFIG: Record<
  PdcaPhase,
  { label: string; color: string; bgClass: string }
> = {
  planning: {
    label: 'planning',
    color: '#8B5CF6',
    bgClass: 'bg-purple-100 text-purple-700',
  },
  designing: {
    label: 'designing',
    color: '#3B82F6',
    bgClass: 'bg-blue-100 text-blue-700',
  },
  implementing: {
    label: 'implementing',
    color: '#F59E0B',
    bgClass: 'bg-amber-100 text-amber-700',
  },
  checking: {
    label: 'checking',
    color: '#10B981',
    bgClass: 'bg-green-100 text-green-700',
  },
  completed: {
    label: 'completed',
    color: '#64748B',
    bgClass: 'bg-gray-100 text-gray-600',
  },
};

const TEAM_LABELS: Record<TeamId, string> = {
  pm: 'PM팀',
  marketing: '마케팅팀',
  cto: 'CTO팀',
};

export function PdcaStatusPanel({ pdca }: PdcaStatusPanelProps) {
  const { features, summary } = pdca;

  // 진행 중 feature만 표시 (phase !== 'completed')
  const activeFeatures = features.filter((f) => f.phase !== 'completed');

  return (
    <div
      className="bg-[#F8FAFC] rounded-xl border border-gray-100 p-4"
      style={{ fontFamily: 'Pretendard, system-ui, sans-serif' }}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">📊</span>
        <h2 className="text-sm font-semibold text-[#0F172A]">PDCA 상태</h2>
      </div>

      <div className="border-t border-gray-100 mb-3" />

      {/* 요약 통계 */}
      <div className="flex items-center gap-4 text-sm mb-3 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-[#64748B]">전체</span>
          <span className="font-bold text-[#0F172A]">{summary.total}개</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[#64748B]">완료</span>
          <span className="font-bold text-green-600">{summary.completed}개</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[#64748B]">진행</span>
          <span className="font-bold text-amber-600">{summary.inProgress}개</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[#64748B]">평균</span>
          <span className="font-bold text-[#0F172A]">
            {summary.avgMatchRate > 0
              ? `${summary.avgMatchRate.toFixed(1)}%`
              : '—%'}
          </span>
        </div>
      </div>

      <div className="border-t border-gray-100 mb-3" />

      {/* 진행 중 Features */}
      <div>
        <div className="text-xs font-semibold text-[#64748B] mb-2">
          [진행 중 Features]
        </div>

        {activeFeatures.length === 0 ? (
          <p className="text-xs text-[#64748B]">진행 중인 피처 없음</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {activeFeatures.map((feature) => {
              const phaseConfig = PHASE_CONFIG[feature.phase];
              const teamLabel = TEAM_LABELS[feature.team] ?? feature.team;
              const matchRateDisplay =
                feature.matchRate > 0 ? `${feature.matchRate}%` : '—%';

              return (
                <div
                  key={feature.name}
                  className="flex items-center gap-2 text-sm"
                >
                  {/* 불릿 */}
                  <span className="text-[#64748B] shrink-0">•</span>

                  {/* Feature 이름 */}
                  <span className="text-[#0F172A] font-medium flex-1 truncate">
                    {feature.name}
                  </span>

                  {/* Phase 배지 */}
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${phaseConfig.bgClass}`}
                  >
                    {phaseConfig.label}
                  </span>

                  {/* matchRate */}
                  <span className="text-xs text-[#64748B] shrink-0 w-10 text-right">
                    {matchRateDisplay}
                  </span>

                  {/* 팀 */}
                  <span className="text-xs text-[#64748B] shrink-0">
                    {teamLabel}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
