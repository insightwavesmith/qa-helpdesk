import type { Node } from '@xyflow/react';
import { GateConfigPanel, type GateConfig } from './GateConfigPanel';

interface BlockDetailPanelProps {
  node: Node;
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
  teams?: Array<{ id: string; name: string }>;
}

export function BlockDetailPanel({ node, onUpdateData, teams = [] }: BlockDetailPanelProps) {
  const data = node.data as Record<string, unknown>;
  const name = (data.name as string) || (data.label as string) || node.id;
  const teamId = (data.teamId as string) || '';
  const gates = ((data.gates as GateConfig[]) || []);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateData?.(node.id, { name: e.target.value });
  };

  const handleTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdateData?.(node.id, { teamId: e.target.value || null });
  };

  return (
    <div data-testid="block-detail-panel" className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">블록 상세</h3>

      {/* 이름 수정 */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">이름</label>
        <input
          data-testid="block-name-input"
          type="text"
          value={name}
          onChange={handleNameChange}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
        />
      </div>

      {/* 팀 배정 */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">팀 배정</label>
        <select
          data-testid="block-team-select"
          value={teamId}
          onChange={handleTeamChange}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
        >
          <option value="">선택 없음</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Gate 설정 */}
      <GateConfigPanel
        gates={gates}
        onChange={(newGates) => onUpdateData?.(node.id, { gates: newGates })}
      />
    </div>
  );
}
