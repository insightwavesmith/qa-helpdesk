import { useState } from 'react';
import { maskTokens } from '../../../lib/brick/mask-tokens';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { BlockNodeData } from './types';
import {
  STATUS_BORDER_COLORS,
  STATUS_ICONS,
  BLOCK_TYPE_ICONS,
  BLOCK_TYPE_LABELS,
  BLOCK_CATEGORY_MAP,
  CATEGORY_BG_COLORS,
} from './types';
import { useTeams } from '../../../hooks/brick/useTeams';

function TeamDropdown({ onSelect }: { onSelect: (teamName: string) => void }) {
  const { data: teams = [] } = useTeams();
  return (
    <div
      data-testid="team-dropdown"
      className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 min-w-[160px]"
    >
      {teams.map((team) => (
        <button
          key={team.id}
          data-testid={`team-option-${team.id}`}
          className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100"
          onClick={() => onSelect(team.name)}
        >
          {team.name}
        </button>
      ))}
    </div>
  );
}

export function BlockNode({ data }: NodeProps) {
  const d = data as BlockNodeData;
  const [showContextMenu, setShowContextMenu] = useState(false);
  const borderColor = STATUS_BORDER_COLORS[d.status] ?? '#D1D5DB';
  const category = BLOCK_CATEGORY_MAP[d.blockType];
  const bgColor = category ? CATEGORY_BG_COLORS[category] : '#FFFFFF';
  const icon = BLOCK_TYPE_ICONS[d.blockType] ?? '🔧';
  const label = d.label || BLOCK_TYPE_LABELS[d.blockType] || d.blockType;
  const statusIcon = STATUS_ICONS[d.status] ?? '○';
  const isRunning = d.status === 'running';
  const isApprovalWaiting = d.status === 'gate_checking' && d.gateType === 'approval';
  const teamName = d.team as string | undefined;
  const errorMsg = d.error as string | undefined;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowContextMenu(true);
  };

  return (
    <div
      data-testid="block-node"
      className="relative rounded-lg shadow-sm min-w-[240px]"
      style={{
        border: `2px solid ${borderColor}`,
        backgroundColor: bgColor,
      }}
      onContextMenu={handleContextMenu}
    >
      <Handle type="target" position={Position.Top} />

      {/* 승인 대기 뱃지 (BD-027) */}
      {isApprovalWaiting && (
        <div
          data-testid="approval-badge"
          className="absolute -top-2 -right-2 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center text-white text-[10px] animate-pulse"
        >
          !
        </div>
      )}

      <div className="px-3 py-2">
        {/* 헤더: 아이콘 + 이름 + 상태 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span data-testid="block-icon" className="text-sm">{icon}</span>
            <span data-testid="block-label" className="text-sm font-medium text-gray-800">
              {label}
            </span>
          </div>
          <span
            data-testid="status-icon"
            className={isRunning ? 'animate-spin' : ''}
            style={isRunning ? { display: 'inline-block' } : undefined}
          >
            {statusIcon}
          </span>
        </div>

        {/* 팀 */}
        {teamName && (
          <div className="mt-1 text-xs text-gray-500">
            팀: {teamName}
          </div>
        )}

        {/* 게이트 */}
        {d.gates && d.gates.length > 0 && (
          <div className="mt-1 flex items-center gap-1 text-xs">
            <span className="text-gray-500">Gate:</span>
            {d.gates.map((g, i) => (
              <span
                key={i}
                data-testid="gate-dot"
                className={`inline-block w-2 h-2 rounded-full ${g.passed ? 'bg-green-500' : 'bg-red-500'}`}
              />
            ))}
          </div>
        )}
        {/* 실패 에러 메시지 (BD-019) */}
        {d.status === 'failed' && errorMsg && (
          <div
            data-testid="block-error"
            className="text-[10px] text-red-500 mt-1 overflow-hidden whitespace-nowrap text-ellipsis max-w-[200px]"
          >
            {maskTokens(errorMsg)}
          </div>
        )}
      </div>

      {/* 팀 배정 컨텍스트 메뉴 (BF-136) */}
      {showContextMenu && (
        <TeamDropdown onSelect={() => setShowContextMenu(false)} />
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
