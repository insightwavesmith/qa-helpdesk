'use client';

import type { PdcaFeature, PdcaPhase, TeamId } from '@/types/agent-dashboard';

interface PdcaSummary {
  total: number;
  completed: number;
  inProgress: number;
  avgMatchRate: number;
}

interface PdcaTabProps {
  pdca: {
    features: PdcaFeature[];
    summary: PdcaSummary;
  };
}

const PHASE_CONFIG: Record<
  PdcaPhase,
  { label: string; bgClass: string }
> = {
  planning: { label: '기획 중', bgClass: 'bg-purple-100 text-purple-700' },
  designing: { label: '설계 중', bgClass: 'bg-blue-100 text-blue-700' },
  implementing: { label: '구현 중', bgClass: 'bg-amber-100 text-amber-700' },
  checking: { label: '검증 중', bgClass: 'bg-green-100 text-green-700' },
  completed: { label: '완료', bgClass: 'bg-gray-100 text-gray-600' },
};

const TEAM_LABELS: Record<TeamId, string> = {
  pm: 'PM팀',
  marketing: '마케팅팀',
  cto: 'CTO팀',
};

export default function PdcaTab({ pdca }: PdcaTabProps) {
  const { features, summary } = pdca;
  const activeFeatures = features.filter((f) => f.phase !== 'completed');
  const completedFeatures = features.filter((f) => f.phase === 'completed');

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="전체 기능" value={`${summary.total}개`} />
        <SummaryCard label="완료" value={`${summary.completed}개`} color="#10b981" />
        <SummaryCard label="진행 중" value={`${summary.inProgress}개`} color="#f59e0b" />
        <SummaryCard
          label="평균 Match Rate"
          value={summary.avgMatchRate > 0 ? `${summary.avgMatchRate}%` : '—'}
          color="#F75D5D"
        />
      </div>

      {/* 진행 중 기능 */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          진행 중 ({activeFeatures.length}개)
        </h3>
        {activeFeatures.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">진행 중인 기능 없음</p>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">기능명</th>
                  <th className="text-center px-4 py-2 font-medium">단계</th>
                  <th className="text-center px-4 py-2 font-medium">Match Rate</th>
                  <th className="text-center px-4 py-2 font-medium">담당팀</th>
                  <th className="text-left px-4 py-2 font-medium">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeFeatures.map((f) => (
                  <FeatureRow key={f.name} feature={f} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 완료된 기능 */}
      {completedFeatures.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            완료 ({completedFeatures.length}개)
          </h3>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">기능명</th>
                  <th className="text-center px-4 py-2 font-medium">단계</th>
                  <th className="text-center px-4 py-2 font-medium">Match Rate</th>
                  <th className="text-center px-4 py-2 font-medium">담당팀</th>
                  <th className="text-left px-4 py-2 font-medium">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {completedFeatures.map((f) => (
                  <FeatureRow key={f.name} feature={f} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold" style={{ color: color ?? '#0F172A' }}>
        {value}
      </p>
    </div>
  );
}

function FeatureRow({ feature }: { feature: PdcaFeature }) {
  const phaseConfig = PHASE_CONFIG[feature.phase];
  const teamLabel = TEAM_LABELS[feature.team] ?? feature.team;
  const matchDisplay = feature.matchRate > 0 ? `${feature.matchRate}%` : '—';

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-2.5 font-medium text-gray-900">{feature.name}</td>
      <td className="px-4 py-2.5 text-center">
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${phaseConfig.bgClass}`}>
          {phaseConfig.label}
        </span>
      </td>
      <td className="px-4 py-2.5 text-center font-mono text-gray-700">{matchDisplay}</td>
      <td className="px-4 py-2.5 text-center text-gray-500">{teamLabel}</td>
      <td className="px-4 py-2.5 text-gray-500 truncate max-w-[200px]">{feature.notes || '—'}</td>
    </tr>
  );
}
