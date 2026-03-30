import { useState } from 'react';
import { MetricCard } from '../components/MetricCard';
import {
  useCostsSummary,
  useCostsByModel,
  useCostsByAgent,
  useBudgetPolicies,
  useBudgetIncidents,
} from '../hooks/useApi';

type Tab = 'model' | 'agent' | 'budget';

const TABS: { value: Tab; label: string }[] = [
  { value: 'model', label: '모델별' },
  { value: 'agent', label: '에이전트별' },
  { value: 'budget', label: '예산' },
];

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

function ProgressBar({ value, max, warn }: { value: number; max: number; warn?: boolean }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all ${
          pct >= 100 ? 'bg-red-500' : warn ? 'bg-amber-400' : 'bg-primary'
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ModelTab() {
  const { data: models, isLoading } = useCostsByModel();

  if (isLoading) return <div className="text-gray-400 text-sm py-8 text-center">불러오는 중...</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-gray-500">
            <th className="px-5 py-3 font-medium">모델</th>
            <th className="px-5 py-3 font-medium text-right">비용</th>
            <th className="px-5 py-3 font-medium text-right">토큰</th>
            <th className="px-5 py-3 font-medium text-right">이벤트</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {models?.map((m) => (
            <tr key={m.model} className="hover:bg-gray-50">
              <td className="px-5 py-3 font-mono text-xs">{m.model}</td>
              <td className="px-5 py-3 text-right font-medium">{formatCents(m.totalCents)}</td>
              <td className="px-5 py-3 text-right text-gray-500">{formatTokens(m.totalTokens)}</td>
              <td className="px-5 py-3 text-right text-gray-400">{m.eventCount}</td>
            </tr>
          ))}
          {(!models || models.length === 0) && (
            <tr>
              <td colSpan={4} className="px-5 py-8 text-center text-gray-400">비용 데이터 없음</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AgentTab() {
  const { data: agents, isLoading } = useCostsByAgent();

  if (isLoading) return <div className="text-gray-400 text-sm py-8 text-center">불러오는 중...</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-gray-500">
            <th className="px-5 py-3 font-medium">에이전트</th>
            <th className="px-5 py-3 font-medium text-right">비용</th>
            <th className="px-5 py-3 font-medium text-right">토큰</th>
            <th className="px-5 py-3 font-medium text-right">이벤트</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {agents?.map((a) => (
            <tr key={a.agentId} className="hover:bg-gray-50">
              <td className="px-5 py-3">
                <span className="mr-1">🤖</span>
                {a.displayName ?? a.agentName ?? a.agentId}
              </td>
              <td className="px-5 py-3 text-right font-medium">{formatCents(a.totalCents)}</td>
              <td className="px-5 py-3 text-right text-gray-500">{formatTokens(a.totalTokens)}</td>
              <td className="px-5 py-3 text-right text-gray-400">{a.eventCount}</td>
            </tr>
          ))}
          {(!agents || agents.length === 0) && (
            <tr>
              <td colSpan={4} className="px-5 py-8 text-center text-gray-400">비용 데이터 없음</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function BudgetTab() {
  const { data: policies, isLoading: pLoading } = useBudgetPolicies();
  const { data: incidents, isLoading: iLoading } = useBudgetIncidents(false);

  if (pLoading || iLoading) {
    return <div className="text-gray-400 text-sm py-8 text-center">불러오는 중...</div>;
  }

  const SCOPE_LABELS: Record<string, string> = {
    global: '전체',
    agent: '에이전트',
    team: '팀',
  };
  const WINDOW_LABELS: Record<string, string> = {
    monthly: '월간',
    weekly: '주간',
    daily: '일간',
  };

  return (
    <div className="space-y-6">
      {/* 예산 정책 */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-3">예산 정책</h4>
        <div className="space-y-3">
          {policies?.map((p) => (
            <div key={p.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {SCOPE_LABELS[p.scopeType] ?? p.scopeType}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {WINDOW_LABELS[p.windowKind] ?? p.windowKind}
                  </span>
                  {p.scopeId && (
                    <span className="text-xs text-gray-500">{p.scopeId}</span>
                  )}
                </div>
                <span className="font-medium">{formatCents(p.amountCents)}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span>경고: {p.warnPercent}%</span>
                <span>강제 중지: {p.hardStop ? '활성' : '비활성'}</span>
                <span className={p.active ? 'text-emerald-500' : 'text-gray-300'}>
                  {p.active ? '● 활성' : '○ 비활성'}
                </span>
              </div>
            </div>
          ))}
          {(!policies || policies.length === 0) && (
            <div className="text-center py-8 text-gray-400 text-sm">등록된 예산 정책 없음</div>
          )}
        </div>
      </div>

      {/* 미해결 인시던트 */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-3">미해결 인시던트</h4>
        <div className="space-y-2">
          {incidents?.map((inc) => (
            <div
              key={inc.id}
              className={`border-l-4 ${
                inc.kind === 'hard_stop' ? 'border-l-red-400' : 'border-l-amber-400'
              } bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3`}
            >
              <span>{inc.kind === 'hard_stop' ? '🛑' : '⚠️'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {inc.kind === 'hard_stop' ? '강제 중지' : '예산 경고'}
                </p>
                <p className="text-xs text-gray-500">
                  {formatCents(inc.amountAtTrigger)} / {formatCents(inc.thresholdAmount)}
                </p>
              </div>
              <ProgressBar
                value={inc.amountAtTrigger}
                max={inc.thresholdAmount}
                warn={inc.kind === 'warn'}
              />
            </div>
          ))}
          {(!incidents || incidents.length === 0) && (
            <div className="text-center py-8 text-gray-400 text-sm">미해결 인시던트 없음</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CostsPage() {
  const [tab, setTab] = useState<Tab>('model');
  const { data: summary } = useCostsSummary();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">비용 추적</h2>

      {/* 상단 메트릭 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          icon="💰"
          label="총 비용"
          value={formatCents(summary?.totalCents ?? 0)}
          sub={`${summary?.eventCount ?? 0}건 이벤트`}
        />
        <MetricCard
          icon="🔢"
          label="총 토큰"
          value={formatTokens(summary?.totalTokens ?? 0)}
          sub="입출력 합계"
        />
        <MetricCard
          icon="📊"
          label="이벤트"
          value={summary?.eventCount ?? 0}
          sub="비용 기록 건수"
        />
      </div>

      {/* 탭 */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-2 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.value
                  ? 'bg-primary text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab === 'model' && <ModelTab />}
          {tab === 'agent' && <AgentTab />}
          {tab === 'budget' && <BudgetTab />}
        </div>
      </div>
    </div>
  );
}
