import { useState } from 'react';
import type { Node } from '@xyflow/react';
import { GateConfigPanel, type GateConfig } from './GateConfigPanel';

export const DEFAULT_ADAPTERS = ['claude_local', 'claude_agent_teams', 'human'];
export const DEFAULT_MODELS = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
export const DEFAULT_AGENTS = ['cto-lead', 'pm-lead', 'frontend-dev', 'backend-dev'];

type TabId = 'block' | 'team' | 'gate';

const TAB_LABELS: Record<TabId, string> = {
  block: '블록',
  team: '팀',
  gate: 'Gate',
};

interface ThreeAxisPanelProps {
  node: Node;
  onUpdateData: (nodeId: string, data: Record<string, unknown>) => void;
  teams?: Array<{ id: string; name: string }>;
  adapters?: string[];
  models?: string[];
  agents?: string[];
}

export function ThreeAxisPanel({
  node,
  onUpdateData,
  teams = [],
  adapters = DEFAULT_ADAPTERS,
  models = DEFAULT_MODELS,
  agents = DEFAULT_AGENTS,
}: ThreeAxisPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('block');
  const data = node.data as Record<string, unknown>;

  const name = (data.name as string) || (data.label as string) || node.id;
  const description = (data.description as string) || '';
  const artifact = (data.artifact as string) || '';

  const adapter = (data.adapter as string) || adapters[0] || '';
  const model = (data.model as string) || models[0] || '';
  const agentName = (data.agentName as string) || agents[0] || '';

  const gates = (data.gates as GateConfig[]) || [];
  const retryCount = (data.retryCount as number) ?? 3;
  const onFailure = (data.onFailure as string) || 'retry';

  return (
    <div data-testid="three-axis-panel" className="flex flex-col h-full">
      {/* 탭 헤더 */}
      <div data-testid="three-axis-tabs" className="flex border-b border-gray-200">
        {(['block', 'team', 'gate'] as TabId[]).map((tab) => (
          <button
            key={tab}
            data-testid={`tab-${tab}`}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-[#F75D5D] text-[#F75D5D]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Block 탭 */}
        {activeTab === 'block' && (
          <div data-testid="tab-content-block" className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">이름</label>
              <input
                data-testid="block-name-input"
                type="text"
                value={name}
                onChange={(e) => onUpdateData(node.id, { name: e.target.value })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">뭘 할 건지</label>
              <textarea
                data-testid="block-description-input"
                value={description}
                onChange={(e) => onUpdateData(node.id, { description: e.target.value })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">완료 조건 — 산출물</label>
              <input
                data-testid="block-artifact-input"
                type="text"
                value={artifact}
                onChange={(e) => onUpdateData(node.id, { artifact: e.target.value })}
                placeholder="예: design.md 파일"
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
              />
            </div>
          </div>
        )}

        {/* Team 탭 */}
        {activeTab === 'team' && (
          <div data-testid="tab-content-team" className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">어댑터</label>
              <select
                data-testid="team-adapter-select"
                value={adapter}
                onChange={(e) => onUpdateData(node.id, { adapter: e.target.value })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
              >
                {adapters.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">모델</label>
              <select
                data-testid="team-model-select"
                value={model}
                onChange={(e) => onUpdateData(node.id, { model: e.target.value })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
              >
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">에이전트</label>
              <select
                data-testid="team-agent-select"
                value={agentName}
                onChange={(e) => onUpdateData(node.id, { agentName: e.target.value })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
              >
                {agents.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Gate 탭 */}
        {activeTab === 'gate' && (
          <div data-testid="tab-content-gate" className="space-y-3">
            <GateConfigPanel
              gates={gates}
              onChange={(newGates) => onUpdateData(node.id, { gates: newGates })}
            />
            {/* 재시도 / 실패 전략 */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <label className="text-xs text-gray-500 shrink-0">재시도</label>
              <input
                data-testid="retry-count-input"
                type="number"
                min="0"
                max="10"
                value={retryCount}
                onChange={(e) => onUpdateData(node.id, { retryCount: Number(e.target.value) })}
                className="w-14 px-2 py-1 text-xs border border-gray-300 rounded"
              />
              <label className="text-xs text-gray-500 shrink-0">실패 시</label>
              <select
                data-testid="on-failure-select"
                value={onFailure}
                onChange={(e) => onUpdateData(node.id, { onFailure: e.target.value })}
                className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
              >
                <option value="retry">재시도</option>
                <option value="stop">중단</option>
                <option value="skip">건너뛰기</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
