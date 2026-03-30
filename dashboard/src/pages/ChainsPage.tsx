import { useState } from 'react';
import { StatusBadge } from '../components/StatusBadge';
import { useChains, type Chain } from '../hooks/useApi';

const PHASE_ICONS: Record<string, string> = {
  plan: '📝',
  design: '📐',
  do: '⚙️',
  check: '✅',
  act: '🔄',
  deploy: '🚀',
};

export function ChainsPage() {
  const { data: chains, isLoading } = useChains();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="text-gray-400 text-sm">불러오는 중...</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">워크플로 체인</h2>

      {/* 체인 목록 */}
      <div className="space-y-3">
        {chains?.map((chain) => (
          <ChainCard
            key={chain.id}
            chain={chain}
            isSelected={selectedId === chain.id}
            onSelect={() => setSelectedId(selectedId === chain.id ? null : chain.id)}
          />
        ))}
        {(!chains || chains.length === 0) && (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-400 text-sm">
            등록된 체인 없음
          </div>
        )}
      </div>
    </div>
  );
}

function ChainCard({
  chain,
  isSelected,
  onSelect,
}: {
  chain: Chain;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={`rounded-xl border bg-white shadow-sm overflow-hidden cursor-pointer transition-all ${
        isSelected ? 'border-primary ring-1 ring-primary/20' : 'border-gray-200 hover:shadow-md'
      }`}
      onClick={onSelect}
    >
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🔗</span>
            <h3 className="font-medium text-gray-900">{chain.name}</h3>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                chain.active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'
              }`}
            >
              {chain.active ? '활성' : '비활성'}
            </span>
          </div>
          {chain.description && (
            <p className="text-sm text-gray-500 truncate">{chain.description}</p>
          )}
        </div>
        <span className="text-gray-400 text-sm ml-4">{isSelected ? '▲' : '▼'}</span>
      </div>

      {isSelected && <ChainStepsView chainId={chain.id} />}
    </div>
  );
}

function ChainStepsView({ chainId }: { chainId: string }) {
  // 단계 데이터는 체인 상세 API가 별도 없으므로 목업 표시
  // 실제로는 GET /api/chains/:id/steps 같은 엔드포인트 필요
  // 현재는 체인 목록 수준에서만 표시

  return (
    <div className="border-t border-gray-100 px-5 py-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-medium text-gray-700">단계 흐름</span>
      </div>

      {/* PDCA 기본 흐름 시각화 */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {['plan', 'design', 'do', 'check', 'act', 'deploy'].map((phase, i, arr) => (
          <div key={phase} className="flex items-center">
            <div className="flex flex-col items-center px-3 py-2 rounded-lg bg-gray-50 min-w-[80px]">
              <span className="text-xl mb-1">{PHASE_ICONS[phase] ?? '📌'}</span>
              <span className="text-xs font-medium text-gray-700">{phase.toUpperCase()}</span>
            </div>
            {i < arr.length - 1 && (
              <span className="text-gray-300 mx-1">→</span>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-2">
        체인 ID: <span className="font-mono">{chainId}</span>
      </p>
    </div>
  );
}
