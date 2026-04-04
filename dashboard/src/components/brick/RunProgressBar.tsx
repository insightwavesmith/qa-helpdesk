import { STATUS_BORDER_COLORS, type BlockStatus } from './nodes/types';

export interface RunProgressBarBlock {
  id: string;
  status: BlockStatus;
  label: string;
}

interface RunProgressBarProps {
  blocks: RunProgressBarBlock[];
}

export function RunProgressBar({ blocks }: RunProgressBarProps) {
  if (blocks.length === 0) {
    return <p className="text-sm text-gray-400">블록 없음</p>;
  }

  const completedCount = blocks.filter((b) => b.status === 'completed').length;
  const progressPct = Math.round((completedCount / blocks.length) * 100);

  return (
    <div data-testid="run-progress-bar">
      {/* 블록 체인 */}
      <div className="flex items-center gap-1 flex-wrap mb-3">
        {blocks.map((block, idx) => (
          <div key={block.id} className="flex items-center">
            <div
              data-testid={`block-chip-${block.id}`}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border-2"
              style={{ borderColor: STATUS_BORDER_COLORS[block.status] }}
              title={block.status}
            >
              <span>{block.label}</span>
            </div>
            {idx < blocks.length - 1 && (
              <span className="mx-1 text-gray-300 text-xs">→</span>
            )}
          </div>
        ))}
      </div>

      {/* 진행률 바 */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            data-testid="progress-fill"
            className="h-2 rounded-full transition-all"
            style={{
              width: `${progressPct}%`,
              backgroundColor: '#F75D5D',
            }}
          />
        </div>
        <span data-testid="progress-pct" className="text-xs text-gray-500 w-10 text-right">
          {progressPct}%
        </span>
      </div>
    </div>
  );
}
