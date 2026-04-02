import type { Edge } from '@xyflow/react';
import { LINK_TYPES, type LinkType } from '../nodes/types';

const LINK_TYPE_LABELS: Record<LinkType, string> = {
  sequential: '순차',
  parallel: '병렬',
  compete: '경쟁',
  loop: '반복',
  cron: '크론',
  branch: '분기',
};

interface LinkDetailPanelProps {
  edge: Edge;
  onUpdateData?: (edgeId: string, data: Record<string, unknown>) => void;
}

export function LinkDetailPanel({ edge, onUpdateData }: LinkDetailPanelProps) {
  const data = (edge.data ?? {}) as Record<string, unknown>;
  const linkType = (data.linkType as string) || 'sequential';
  const condition = (data.condition as string) || '';

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdateData?.(edge.id, { linkType: e.target.value });
  };

  const handleConditionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateData?.(edge.id, { condition: e.target.value });
  };

  return (
    <div data-testid="link-detail-panel" className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">링크 상세</h3>

      <div>
        <label className="block text-xs text-gray-500 mb-1">링크 타입</label>
        <select
          data-testid="link-type-select"
          value={linkType}
          onChange={handleTypeChange}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
        >
          {LINK_TYPES.map((lt) => (
            <option key={lt} value={lt}>
              {LINK_TYPE_LABELS[lt]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">조건</label>
        <input
          data-testid="link-condition-input"
          type="text"
          value={condition}
          onChange={handleConditionChange}
          placeholder="조건 입력"
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
        />
      </div>
    </div>
  );
}
