import { useState } from 'react';
import { EmptyState } from '../components/EmptyState';
import { PageSkeleton } from '../components/PageSkeleton';
import { useChains, type Chain } from '../hooks/useApi';
import { cn } from '../lib/utils';
import { Link as LinkIcon, ChevronDown, ChevronUp } from 'lucide-react';

const PHASE_COLORS: Record<string, string> = {
  plan: 'bg-blue-100 text-blue-700 border-blue-200',
  design: 'bg-purple-100 text-purple-700 border-purple-200',
  do: 'bg-primary/10 text-primary border-primary/20',
  check: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  act: 'bg-amber-100 text-amber-700 border-amber-200',
  deploy: 'bg-cyan-100 text-cyan-700 border-cyan-200',
};

const PHASE_LABELS: Record<string, string> = {
  plan: '기획',
  design: '설계',
  do: '구현',
  check: '검증',
  act: '개선',
  deploy: '배포',
};

export function ChainsPage() {
  const { data: chains, isLoading } = useChains();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  if (!chains || chains.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900">워크플로 체인</h2>
        <EmptyState icon={LinkIcon} message="등록된 체인 없음" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">워크플로 체인</h2>

      <div className="space-y-3">
        {chains.map((chain) => (
          <ChainCard
            key={chain.id}
            chain={chain}
            isSelected={selectedId === chain.id}
            onSelect={() => setSelectedId(selectedId === chain.id ? null : chain.id)}
          />
        ))}
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
      className={cn(
        'rounded-xl border bg-white shadow-sm overflow-hidden cursor-pointer transition-all',
        isSelected ? 'border-primary ring-1 ring-primary/20' : 'border-gray-200 hover:shadow-md',
      )}
      onClick={onSelect}
    >
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <LinkIcon className="h-4 w-4 text-gray-400 shrink-0" />
            <h3 className="font-medium text-gray-900">{chain.name}</h3>
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full',
                chain.active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400',
              )}
            >
              {chain.active ? '활성' : '비활성'}
            </span>
          </div>
          {chain.description && (
            <p className="text-sm text-gray-500 overflow-hidden whitespace-nowrap text-ellipsis">{chain.description}</p>
          )}
        </div>
        {isSelected ? (
          <ChevronUp className="h-4 w-4 text-gray-400 ml-4 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400 ml-4 shrink-0" />
        )}
      </div>

      {isSelected && <ChainStepsView chainId={chain.id} />}
    </div>
  );
}

function ChainStepsView({ chainId }: { chainId: string }) {
  const phases = ['plan', 'design', 'do', 'check', 'act', 'deploy'];

  return (
    <div className="border-t border-gray-100 px-5 py-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm font-medium text-gray-700">단계 흐름</span>
      </div>

      {/* PDCA 흐름 시각화 */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {phases.map((phase, i, arr) => (
          <div key={phase} className="flex items-center">
            <div
              className={cn(
                'flex flex-col items-center px-4 py-3 rounded-lg border min-w-[80px]',
                PHASE_COLORS[phase] ?? 'bg-gray-100 text-gray-700 border-gray-200',
              )}
            >
              <span className="text-xs font-bold">{phase.toUpperCase()}</span>
              <span className="text-[10px] mt-0.5">{PHASE_LABELS[phase] ?? phase}</span>
            </div>
            {i < arr.length - 1 && (
              <span className="text-gray-300 mx-1 text-lg">→</span>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        체인 ID: <span className="font-mono">{chainId}</span>
      </p>
    </div>
  );
}
